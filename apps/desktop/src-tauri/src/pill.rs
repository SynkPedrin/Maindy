//! Windows launcher: a compact, draggable "pill" mini window (no fake notch on Windows).
//!
//! * Drag is started from the webview (`startDragging`); when the move settles we snap to the
//!   nearest edge of the monitor *work area* (excludes the taskbar wherever it is docked).
//! * All math in physical pixels (DPI aware: logical sizes × monitor scale factor).
//! * Position persisted per monitor (name + geometry key) in settings.json.
//! * Expands in place to the shared Quick Panel, growing downwards or upwards to stay on screen.
//!
//! Compiled on Windows, or anywhere with `--features pill-preview` (so it can be type-checked on macOS).

use crate::events;
use crate::geometry::{self, Rect};
use crate::state::AppState;
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub const LABEL: &str = "pill";
pub const PILL_W: f64 = 188.0;
pub const PILL_H: f64 = 44.0;
pub const PANEL_W: f64 = 372.0;
pub const PANEL_H: f64 = 600.0;
const SNAP_THRESHOLD: f64 = 28.0;
const MARGIN: f64 = 8.0;

#[derive(Default)]
struct PillCtl {
    expanded: bool,
    /// collapsed top-left (physical px)
    pill_pos: Option<(i32, i32)>,
    last_move: Option<Instant>,
    /// ignore Moved events caused by our own set_position
    programmatic_until: Option<Instant>,
}

static CTL: Mutex<PillCtl> = Mutex::new(PillCtl {
    expanded: false,
    pill_pos: None,
    last_move: None,
    programmatic_until: None,
});

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PillView {
    pub expanded: bool,
    pub always_on_top: bool,
}

fn work_rect(m: &Monitor) -> Rect {
    let wa = m.work_area();
    Rect::new(wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64)
}

fn key_for(m: &Monitor) -> String {
    geometry::monitor_key(m.name().map(|s| s.as_str()), (m.size().width, m.size().height), (m.position().x, m.position().y))
}

fn emit(app: &AppHandle) {
    let expanded = CTL.lock().unwrap().expanded;
    let aot = app.state::<AppState>().settings.get().pill_always_on_top;
    let _ = app.emit_to(LABEL, events::PILL, PillView { expanded, always_on_top: aot });
}

fn set_pos_programmatic(w: &tauri::WebviewWindow, x: i32, y: i32) {
    CTL.lock().unwrap().programmatic_until = Some(Instant::now() + Duration::from_millis(400));
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

pub fn install(app: &AppHandle) {
    let settings = app.state::<AppState>().settings.get();
    let w = match WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("maindy.")
        .inner_size(PILL_W, PILL_H)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(settings.pill_always_on_top)
        .visible(false)
        .focused(false)
        .build()
    {
        Ok(w) => w,
        Err(e) => {
            log::error!("pill window: {e}");
            return;
        }
    };

    // Restore the persisted position for the current monitor, else top-center of the primary work area.
    let monitor = w.primary_monitor().ok().flatten().or_else(|| w.current_monitor().ok().flatten());
    if let Some(m) = monitor {
        let scale = m.scale_factor();
        let size = (PILL_W * scale, PILL_H * scale);
        let work = work_rect(&m);
        let saved = settings.pill_positions.get(&key_for(&m)).copied();
        let start = saved
            .map(|(x, y)| (x as f64, y as f64))
            .unwrap_or((work.mid_x() - size.0 / 2.0, work.y + MARGIN * scale));
        let (x, y) = geometry::snap_to_edges(start, size, work, SNAP_THRESHOLD * scale, MARGIN * scale);
        set_pos_programmatic(&w, x as i32, y as i32);
        CTL.lock().unwrap().pill_pos = Some((x as i32, y as i32));
    }
    let _ = w.show();

    let app2 = app.clone();
    w.on_window_event(move |ev| match ev {
        WindowEvent::Moved(_) => on_moved(&app2),
        WindowEvent::ScaleFactorChanged { .. } => {
            let a = app2.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(150));
                settle(&a);
            });
        }
        WindowEvent::Focused(false) if CTL.lock().unwrap().expanded => set_expanded(&app2, false),
        _ => {}
    });
}

fn on_moved(app: &AppHandle) {
    {
        let mut c = CTL.lock().unwrap();
        if c.expanded || c.programmatic_until.map(|t| Instant::now() < t).unwrap_or(false) {
            return;
        }
        c.last_move = Some(Instant::now());
    }
    // Debounce: snap ~250 ms after the last move event (i.e. when the drag ends).
    let a = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(260));
        let quiet = CTL.lock().unwrap().last_move.map(|t| t.elapsed() >= Duration::from_millis(240)).unwrap_or(false);
        if quiet {
            settle(&a);
        }
    });
}

/// Snap to the work-area edges of the monitor the pill is on and persist the position for it.
fn settle(app: &AppHandle) {
    let Some(w) = app.get_webview_window(LABEL) else { return };
    if CTL.lock().unwrap().expanded {
        return;
    }
    let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) else { return };
    let center = (pos.x as f64 + size.width as f64 / 2.0, pos.y as f64 + size.height as f64 / 2.0);
    let monitors = w.available_monitors().unwrap_or_default();
    let areas: Vec<Rect> = monitors.iter().map(work_rect).collect();
    let Some(i) = geometry::work_area_for(center, &areas) else { return };
    let m = &monitors[i];
    let scale = m.scale_factor();
    let (x, y) = geometry::snap_to_edges(
        (pos.x as f64, pos.y as f64),
        (size.width as f64, size.height as f64),
        areas[i],
        SNAP_THRESHOLD * scale,
        MARGIN * scale,
    );
    if (x as i32, y as i32) != (pos.x, pos.y) {
        set_pos_programmatic(&w, x as i32, y as i32);
    }
    CTL.lock().unwrap().pill_pos = Some((x as i32, y as i32));
    let key = key_for(m);
    let _ = app.state::<AppState>().settings.update(|s| {
        s.pill_positions.insert(key, (x as i32, y as i32));
        Ok(())
    });
}

pub fn set_expanded(app: &AppHandle, expanded: bool) {
    let Some(w) = app.get_webview_window(LABEL) else { return };
    let Some(m) = w.current_monitor().ok().flatten() else { return };
    let scale = m.scale_factor();
    let work = work_rect(&m);
    let pill_pos = {
        let c = CTL.lock().unwrap();
        c.pill_pos
    }
    .or_else(|| w.outer_position().ok().map(|p| (p.x, p.y)))
    .unwrap_or((work.x as i32, work.y as i32));
    let pill = Rect::new(pill_pos.0 as f64, pill_pos.1 as f64, PILL_W * scale, PILL_H * scale);
    CTL.lock().unwrap().expanded = expanded;
    if expanded {
        let r = geometry::expand_from_pill(pill, (PANEL_W * scale, PANEL_H * scale), work, MARGIN * scale);
        let _ = w.set_size(PhysicalSize::new(r.w as u32, r.h as u32));
        set_pos_programmatic(&w, r.x as i32, r.y as i32);
        let _ = w.set_always_on_top(true);
        let _ = w.set_focus();
    } else {
        let _ = w.set_size(PhysicalSize::new(pill.w as u32, pill.h as u32));
        set_pos_programmatic(&w, pill_pos.0, pill_pos.1);
        let _ = w.set_always_on_top(app.state::<AppState>().settings.get().pill_always_on_top);
    }
    emit(app);
}

/// Tray click on Windows: make sure the pill is visible and open the Quick Panel.
pub fn show_expanded(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.show();
    }
    set_expanded(app, true);
}

pub fn apply_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let aot = app.state::<AppState>().settings.get().pill_always_on_top;
        if !CTL.lock().unwrap().expanded {
            let _ = w.set_always_on_top(aot);
        }
    }
    emit(app);
}
