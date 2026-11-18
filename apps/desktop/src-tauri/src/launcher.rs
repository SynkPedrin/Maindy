#![cfg_attr(target_os = "windows", allow(unused_imports, dead_code))]
//! Platform dispatch for launchers: macOS notch (+ menu bar fallback), Windows pill, shared Quick
//! Panel window anchored under the tray icon, and the main "Painel" window.

use crate::geometry::{self, Rect};
use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

pub const QUICK: &str = "quick";
pub const QUICK_W: f64 = 372.0;
pub const QUICK_H: f64 = 600.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherInfo {
    /// "notch" (macOS with notch) | "menubar" (macOS fallback) | "pill" (Windows) | "tray"
    pub kind: &'static str,
    #[cfg(target_os = "macos")]
    pub notch: Option<crate::notch::NotchView>,
    #[cfg(not(target_os = "macos"))]
    pub notch: Option<()>,
}

pub fn info(app: &AppHandle) -> LauncherInfo {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        let v = crate::notch::view();
        LauncherInfo { kind: if v.available { "notch" } else { "menubar" }, notch: Some(v) }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        LauncherInfo { kind: if cfg!(windows) { "pill" } else { "tray" }, notch: None }
    }
}

pub fn reduce_motion() -> bool {
    #[cfg(target_os = "macos")]
    {
        crate::notch::reduce_motion()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false // WebView2 honours prefers-reduced-motion (Windows "Animation effects") in CSS.
    }
}

/// Called once from setup.
pub fn install(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    crate::notch::install(app);
    #[cfg(any(target_os = "windows", feature = "pill-preview"))]
    crate::pill::install(app);
    let _ = app;
}

pub fn settings_changed(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    crate::notch::relayout(app);
    let _ = app;
}

pub fn pill_settings_changed(app: &AppHandle) {
    #[cfg(any(target_os = "windows", feature = "pill-preview"))]
    crate::pill::apply_settings(app);
    let _ = app;
}

pub fn notch_set_state(app: &AppHandle, s: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        crate::notch::set_state(app, s)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, s);
        Err("Launcher de notch só existe no macOS.".into())
    }
}

pub fn notch_set_base(app: &AppHandle, s: &str) {
    #[cfg(target_os = "macos")]
    crate::notch::set_base(app, s);
    let _ = (app, s);
}

pub fn pill_set_expanded(app: &AppHandle, expanded: bool) {
    #[cfg(any(target_os = "windows", feature = "pill-preview"))]
    crate::pill::set_expanded(app, expanded);
    let _ = (app, expanded);
}

pub fn show_main(app: &AppHandle, section: Option<&str>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    quick_hide(app);
    if let Some(s) = section {
        crate::commands::emit_navigate(app, s);
    }
}

/// Main window closed → keep running in the tray/notch.
pub fn hide_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

fn ensure_quick(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    if let Some(w) = app.get_webview_window(QUICK) {
        return Some(w);
    }
    let b = WebviewWindowBuilder::new(app, QUICK, WebviewUrl::App("index.html".into()))
        .title("maindy. — painel rápido")
        .inner_size(QUICK_W, QUICK_H)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(true);
    #[cfg(target_os = "macos")]
    let b = b.visible_on_all_workspaces(true).accept_first_mouse(true);
    b.build().map_err(|e| log::error!("quick window: {e}")).ok()
}

/// Left click on the tray / menu-bar icon: toggle the floating Quick Panel anchored to the icon.
/// (Windows: the pill is the primary launcher; the tray click expands it instead.)
pub fn tray_clicked(app: &AppHandle, rect: tauri::Rect) {
    #[cfg(target_os = "windows")]
    {
        let _ = rect;
        crate::pill::show_expanded(app);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let Some(w) = ensure_quick(app) else { return };
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            return;
        }
        let scale = w.scale_factor().unwrap_or(1.0);
        let pos = rect.position.to_physical::<f64>(scale);
        let size = rect.size.to_physical::<f64>(scale);
        let icon = Rect::new(pos.x, pos.y, size.width, size.height);
        let monitor = app.monitor_from_point(icon.mid_x(), icon.y + icon.h / 2.0).ok().flatten();
        let (work, mscale) = match &monitor {
            Some(m) => {
                let wa = m.work_area();
                (
                    Rect::new(wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64),
                    m.scale_factor(),
                )
            }
            None => (Rect::new(0.0, 0.0, 1920.0, 1080.0), scale),
        };
        let r = geometry::panel_under_tray(icon, (QUICK_W * mscale, QUICK_H * mscale), work, 6.0 * mscale);
        let _ = w.set_position(PhysicalPosition::new(r.x as i32, r.y as i32));
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn quick_hide(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(QUICK) {
        let _ = w.hide();
    }
}
