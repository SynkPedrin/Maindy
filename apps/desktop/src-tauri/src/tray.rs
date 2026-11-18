//! Menu bar (macOS) / notification area (Windows) icon and menu.

use crate::gateway::Phase;
use crate::state::AppState;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_autostart::ManagerExt as _;

pub struct TrayItems {
    pause: MenuItem<Wry>,
    gateway: MenuItem<Wry>,
    autostart: CheckMenuItem<Wry>,
}

pub fn gateway_label(phase: Phase) -> &'static str {
    match phase {
        Phase::NotInstalled => "Gateway local: não instalado",
        Phase::Disabled => "Gateway local: desativado",
        Phase::Starting => "Gateway local: iniciando…",
        Phase::Running => "Gateway local: ativo",
        Phase::External => "Gateway local: ativo (externo)",
        Phase::Crashed => "Gateway local: reiniciando…",
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir painel", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pausar ORBIT", true, None::<&str>)?;
    let gateway = MenuItem::with_id(app, "gateway", gateway_label(Phase::NotInstalled), true, None::<&str>)?;
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(app, "autostart", "Iniciar com o sistema", true, autostart_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair da maindy.", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &PredefinedMenuItem::separator(app)?,
            &pause,
            &gateway,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    app.manage(TrayItems { pause, gateway, autostart });

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    TrayIconBuilder::with_id("maindy")
        .icon(icon)
        .tooltip("maindy.")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "open" => crate::launcher::show_main(app, None),
            "pause" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let paused = *app.state::<AppState>().orbit_paused.lock().unwrap();
                    crate::commands::set_orbit(&app, paused != Some(true)).await;
                });
            }
            "gateway" => crate::launcher::show_main(app, Some("settings")),
            "autostart" => {
                let m = app.autolaunch();
                let on = m.is_enabled().unwrap_or(false);
                let _ = if on { m.disable() } else { m.enable() };
                refresh(app);
            }
            "quit" => {
                crate::shutdown(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } = ev {
                crate::launcher::tray_clicked(tray.app_handle(), rect);
            }
        })
        .build(app)?;
    refresh(app);
    Ok(())
}

/// Re-renders dynamic menu labels (pause state, gateway status, autostart check).
pub fn refresh(app: &AppHandle) {
    let (Some(items), Some(state)) = (app.try_state::<TrayItems>(), app.try_state::<AppState>()) else {
        return;
    };
    let paused = *state.orbit_paused.lock().unwrap();
    let _ = items.pause.set_text(if paused == Some(true) { "Retomar ORBIT" } else { "Pausar ORBIT" });
    let has_target = state.session().is_some() || state.gateway.view().healthy;
    let _ = items.pause.set_enabled(has_target);
    let _ = items.gateway.set_text(gateway_label(state.gateway.view().phase));
    let _ = items.autostart.set_checked(app.autolaunch().is_enabled().unwrap_or(false));
    if let Some(tray) = app.tray_by_id("maindy") {
        let tip = match paused {
            Some(true) => "maindy. — ORBIT pausado",
            _ => "maindy.",
        };
        let _ = tray.set_tooltip(Some(tip));
    }
}
