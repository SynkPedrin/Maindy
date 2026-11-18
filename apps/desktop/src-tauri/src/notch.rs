//! macOS notch launcher — native AppKit geometry, not a fake fullscreen overlay.
//!
//! * Reads every `NSScreen`'s `safeAreaInsets.top` and `auxiliaryTopLeftArea/RightArea` to find the
//!   real camera housing (pure math in `geometry::notch_rect`).
//! * Hosts a borderless, transparent Tauri webview window whose `NSWindow` is reconfigured here:
//!   level `NSMainMenuWindowLevel + 3` (above the menu bar, below pop-up menus so system menus still
//!   open over it), collection behavior `canJoinAllSpaces | stationary | fullScreenAuxiliary |
//!   ignoresCycle`, `hidesOnDeactivate = NO`, no shadow.
//! * The window is always sized tightly to the visible shape, so everything outside the pill stays
//!   click-through; collapsed it is only `wing` points wider than the notch on each side and exactly
//!   as tall as the notch (it never covers the camera area below the menu bar or menu items).
//! * Re-layouts on `NSApplicationDidChangeScreenParametersNotification`.
//! * Hover is detected by sampling `NSEvent.mouseLocation` (no Accessibility / Screen Recording
//!   permission is needed; we never capture or inspect other windows).

use crate::events;
use crate::geometry::{self, LauncherLayout, NotchState, Rect, ScreenInfo};
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSApplication, NSApplicationDidChangeScreenParametersNotification, NSEvent, NSEventMask, NSMainMenuWindowLevel,
    NSScreen, NSWindow, NSWindowCollectionBehavior, NSWorkspace,
};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSPoint, NSRect, NSSize};
use serde::Serialize;
use std::ptr::NonNull;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "notch";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NotchView {
    pub available: bool,
    pub state: NotchState,
    pub base: NotchState,
    /// notch size in points
    pub notch_w: f64,
    pub notch_h: f64,
    /// current window size in points
    pub frame_w: f64,
    pub frame_h: f64,
    pub screen_name: Option<String>,
    pub reduce_motion: bool,
}

struct Ctl {
    notch: Option<Rect>,
    screen: Option<Rect>,
    screen_name: Option<String>,
    scale: f64,
    state: NotchState,
    base: NotchState,
    frame: Option<Rect>,
    enabled: bool,
}

static CTL: Mutex<Ctl> = Mutex::new(Ctl {
    notch: None,
    screen: None,
    screen_name: None,
    scale: 2.0,
    state: NotchState::Collapsed,
    base: NotchState::Collapsed,
    frame: None,
    enabled: false,
});
static APP: OnceLock<AppHandle> = OnceLock::new();

fn layout() -> LauncherLayout {
    LauncherLayout::default()
}

fn to_rect(r: NSRect) -> Rect {
    Rect::new(r.origin.x, r.origin.y, r.size.width, r.size.height)
}

fn to_ns(r: Rect) -> NSRect {
    NSRect::new(NSPoint::new(r.x, r.y), NSSize::new(r.w, r.h))
}

/// Reads all screens (main thread only).
pub fn read_screens(mtm: MainThreadMarker) -> Vec<(ScreenInfo, String)> {
    NSScreen::screens(mtm)
        .iter()
        .map(|s| {
            let ins = s.safeAreaInsets();
            let l = to_rect(s.auxiliaryTopLeftArea());
            let r = to_rect(s.auxiliaryTopRightArea());
            (
                ScreenInfo {
                    frame: to_rect(s.frame()),
                    safe_top: ins.top,
                    aux_left: Some(l).filter(|x| x.w > 0.0),
                    aux_right: Some(r).filter(|x| x.w > 0.0),
                    scale: s.backingScaleFactor(),
                },
                s.localizedName().to_string(),
            )
        })
        .collect()
}

pub fn reduce_motion() -> bool {
    NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion()
}

fn ns_window(w: &WebviewWindow) -> Option<Retained<NSWindow>> {
    let ptr = w.ns_window().ok()? as *mut NSWindow;
    // SAFETY: Tauri returns the live NSWindow* backing this webview window.
    unsafe { Retained::retain(ptr) }
}

pub fn view() -> NotchView {
    let c = CTL.lock().unwrap();
    let n = c.notch.unwrap_or_default();
    let f = c.frame.unwrap_or_default();
    NotchView {
        available: c.enabled && c.notch.is_some(),
        state: c.state,
        base: c.base,
        notch_w: n.w,
        notch_h: n.h,
        frame_w: f.w,
        frame_h: f.h,
        screen_name: c.screen_name.clone(),
        reduce_motion: reduce_motion(),
    }
}

/// Does any connected display have a notch? (main thread)
pub fn has_notch_screen() -> bool {
    MainThreadMarker::new()
        .map(|mtm| {
            let s: Vec<ScreenInfo> = read_screens(mtm).into_iter().map(|x| x.0).collect();
            geometry::pick_notch_screen(&s).is_some()
        })
        .unwrap_or(false)
}

fn ensure_window(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Some(w);
    }
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("maindy. — launcher")
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .shadow(false)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .accept_first_mouse(true)
        .visible_on_all_workspaces(true)
        .inner_size(260.0, 32.0)
        .build()
        .map_err(|e| log::error!("notch window: {e}"))
        .ok()?;
    if let Some(ns) = ns_window(&w) {
        ns.setLevel(NSMainMenuWindowLevel + 3);
        ns.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );
        ns.setHidesOnDeactivate(false);
        ns.setHasShadow(false);
        ns.setOpaque(false);
        ns.setMovable(false);
    }
    Some(w)
}

fn apply_frame(app: &AppHandle, animate: bool) {
    let Some(w) = app.get_webview_window(LABEL) else { return };
    let Some(ns) = ns_window(&w) else { return };
    let frame = {
        let mut c = CTL.lock().unwrap();
        let (Some(n), Some(s)) = (c.notch, c.screen) else { return };
        let f = geometry::launcher_frame(n, s, c.state, &layout(), c.scale);
        c.frame = Some(f);
        f
    };
    ns.setFrame_display_animate(to_ns(frame), true, animate && !reduce_motion());
}

fn emit(app: &AppHandle) {
    let _ = app.emit_to(LABEL, events::NOTCH, view());
}

/// Recomputes geometry for the current displays and shows/hides the launcher.
pub fn relayout(app: &AppHandle) {
    let Some(mtm) = MainThreadMarker::new() else {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || relayout(&a));
        return;
    };
    let settings = app.state::<crate::state::AppState>().settings.get();
    let screens = read_screens(mtm);
    let infos: Vec<ScreenInfo> = screens.iter().map(|x| x.0).collect();
    let picked = geometry::pick_notch_screen(&infos);
    {
        let mut c = CTL.lock().unwrap();
        c.enabled = settings.notch_launcher;
        c.base = if settings.silent_mode {
            NotchState::Silent
        } else if c.base == NotchState::Silent {
            NotchState::Collapsed
        } else {
            c.base
        };
        if !matches!(c.state, NotchState::Expanded | NotchState::Hover) {
            c.state = c.base;
        }
        match picked {
            Some((i, n)) => {
                c.notch = Some(n);
                c.screen = Some(infos[i].frame);
                c.scale = infos[i].scale;
                c.screen_name = Some(screens[i].1.clone());
            }
            None => {
                c.notch = None;
                c.screen = None;
                c.screen_name = None;
            }
        }
    }
    let show = settings.notch_launcher && picked.is_some();
    if show {
        if let Some(w) = ensure_window(app) {
            apply_frame(app, false);
            if let Some(ns) = ns_window(&w) {
                // orderFrontRegardless: visible without activating the app or stealing focus.
                ns.orderFrontRegardless();
                log::debug!(
                    "notch window visible={} level={} activeSpace={} occlusion={:?} screen={:?}",
                    ns.isVisible(),
                    ns.level(),
                    ns.isOnActiveSpace(),
                    ns.occlusionState(),
                    ns.screen().map(|s| s.localizedName().to_string())
                );
            }
        }
    } else if let Some(w) = app.get_webview_window(LABEL) {
        if let Some(ns) = ns_window(&w) {
            ns.orderOut(None);
        }
    }
    log::info!(
        "notch relayout: screens={} notch={:?} shown={}",
        screens.len(),
        picked.map(|p| p.1),
        show
    );
    emit(app);
}

pub fn parse_state(s: &str) -> Option<NotchState> {
    Some(match s {
        "collapsed" => NotchState::Collapsed,
        "hover" => NotchState::Hover,
        "expanded" => NotchState::Expanded,
        "alert" => NotchState::Alert,
        "active" => NotchState::Active,
        "silent" => NotchState::Silent,
        _ => return None,
    })
}

pub fn set_state(app: &AppHandle, s: &str) -> Result<(), String> {
    let st = parse_state(s).ok_or("estado inválido")?;
    let a = app.clone();
    app.run_on_main_thread(move || {
        let resolved = {
            let mut c = CTL.lock().unwrap();
            // "collapsed" from the UI means "back to the resting state" (may be active/alert/silent).
            c.state = if st == NotchState::Collapsed { c.base } else { st };
            c.state
        };
        apply_frame(&a, resolved == NotchState::Hover);
        if let Some(w) = a.get_webview_window(LABEL) {
            if let Some(ns) = ns_window(&w) {
                if resolved == NotchState::Expanded {
                    EXPANDED_AT_MS.store(now_ms(), std::sync::atomic::Ordering::Relaxed);
                    // Become key so Esc / Tab work inside the Quick Panel; blur collapses it again.
                    if let Some(mtm) = MainThreadMarker::new() {
                        #[allow(deprecated)]
                        NSApplication::sharedApplication(mtm).activateIgnoringOtherApps(true);
                    }
                    ns.makeKeyWindow();
                }
            }
        }
        emit(&a);
    })
    .map_err(|e| e.to_string())
}

pub fn set_base(app: &AppHandle, s: &str) {
    let Some(st) = parse_state(s) else { return };
    if !matches!(st, NotchState::Collapsed | NotchState::Active | NotchState::Alert | NotchState::Silent) {
        return;
    }
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let changed = {
            let mut c = CTL.lock().unwrap();
            let silent = a.state::<crate::state::AppState>().settings.get().silent_mode;
            let next = if silent { NotchState::Silent } else { st };
            let changed = c.base != next;
            c.base = next;
            if changed && !matches!(c.state, NotchState::Expanded | NotchState::Hover) {
                c.state = next;
            }
            changed
        };
        if changed {
            apply_frame(&a, true);
            emit(&a);
        }
    });
}

/// Called when the notch window loses focus.
/// Millis (since UNIX epoch) of the last expand; activation can emit a transient blur right after.
static EXPANDED_AT_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn on_blur(app: &AppHandle) {
    if now_ms().saturating_sub(EXPANDED_AT_MS.load(std::sync::atomic::Ordering::Relaxed)) < 500 {
        return; // grace period: ignore the focus shuffle caused by our own activation
    }
    if CTL.lock().unwrap().state == NotchState::Expanded {
        let _ = app.emit_to(LABEL, events::NOTCH_COLLAPSE, ());
    }
}

fn hover_tick(app: &AppHandle) {
    let (state, frame, base) = {
        let c = CTL.lock().unwrap();
        (c.state, c.frame, c.base)
    };
    let Some(frame) = frame else { return };
    if !CTL.lock().unwrap().enabled || state == NotchState::Expanded {
        return;
    }
    let p = NSEvent::mouseLocation();
    let inside = geometry::hover_hit_rect(frame, 2.0).contains(p.x, p.y);
    let next = match (inside, state) {
        (true, s) if s != NotchState::Hover => Some(NotchState::Hover),
        (false, NotchState::Hover) => Some(base),
        _ => None,
    };
    if let Some(n) = next {
        CTL.lock().unwrap().state = n;
        apply_frame(app, true);
        emit(app);
    }
}

/// Native click → expand. The WebView only receives clicks that macOS routes to our window, and
/// clicks over the camera housing (the middle of the notch, where people actually click) are not
/// reliably routed there — on real hardware the pill only opened when clicking its visible wings.
/// So any left click whose location falls inside the launcher's hit rect expands the panel,
/// whether it was dispatched to us (local monitor) or to another process such as the menu bar
/// (global monitor; mouse-only global monitors need no Accessibility permission).
fn notch_click(app: &AppHandle) {
    let (state, frame, enabled) = {
        let c = CTL.lock().unwrap();
        (c.state, c.frame, c.enabled)
    };
    if !enabled || state == NotchState::Expanded {
        return;
    }
    let Some(frame) = frame else { return };
    let p = NSEvent::mouseLocation();
    if geometry::hover_hit_rect(frame, 2.0).contains(p.x, p.y) {
        log::info!("notch click at ({:.0},{:.0}) → expand", p.x, p.y);
        let _ = set_state(app, "expanded");
    }
}

fn install_click_monitors() {
    let global = RcBlock::new(|_e: NonNull<NSEvent>| {
        if let Some(app) = APP.get() {
            notch_click(app);
        }
    });
    let g = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(NSEventMask::LeftMouseDown, &global);
    let local = RcBlock::new(|e: NonNull<NSEvent>| -> *mut NSEvent {
        if let Some(app) = APP.get() {
            notch_click(app);
        }
        e.as_ptr() // never swallow the event
    });
    // SAFETY: the handler returns the (valid) event it received.
    let l = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::LeftMouseDown, &local) };
    log::info!("notch click monitors: global={} local={}", g.is_some(), l.is_some());
    // Monitors live for the whole app lifetime.
    std::mem::forget(g);
    std::mem::forget(l);
}

/// Installs the screen-change observer and the hover sampler. Call once from `setup` (main thread).
pub fn install(app: &AppHandle) {
    let _ = APP.set(app.clone());
    let block = RcBlock::new(|_n: NonNull<NSNotification>| {
        if let Some(app) = APP.get() {
            relayout(app);
        }
    });
    // SAFETY: valid notification name, nil object/queue (delivered on the posting — main — thread).
    let observer = unsafe {
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(NSApplicationDidChangeScreenParametersNotification),
            None,
            None,
            &block,
        )
    };
    // The observer must live for the whole app lifetime.
    std::mem::forget(observer);
    install_click_monitors();

    let a = app.clone();
    std::thread::Builder::new()
        .name("notch-hover".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_millis(90));
            let b = a.clone();
            if a.run_on_main_thread(move || hover_tick(&b)).is_err() {
                break;
            }
        })
        .ok();
    relayout(app);
    // Re-assert once the webview finished loading (the first order-front can be undone while the
    // window is still being set up by the runtime).
    let a2 = app.clone();
    std::thread::spawn(move || {
        for delay in [700u64, 2500] {
            std::thread::sleep(Duration::from_millis(delay));
            let b = a2.clone();
            let _ = a2.run_on_main_thread(move || relayout(&b));
        }
        // Debug-only QA hook (synthetic clicks need Accessibility permission): force a state.
        #[cfg(debug_assertions)]
        if let Ok(st) = std::env::var("MAINDY_DIAG_NOTCH_STATE") {
            let _ = set_state(&a2, &st);
        }
    });
}
