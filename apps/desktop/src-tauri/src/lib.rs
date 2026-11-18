//! maindy. desktop — Tauri 2 shell.
//!
//! Windows (webview labels): `main` (Painel), `notch` (macOS notch launcher), `quick` (Quick Panel
//! under the tray icon), `pill` (Windows mini window). They all load the same frontend; the view is
//! chosen by label.

pub mod agent;
pub mod api;
pub mod commands;
pub mod deeplink;
pub mod events;
pub mod gateway;
pub mod geometry;
pub mod launcher;
#[cfg(target_os = "macos")]
pub mod notch;
pub mod ops;
#[cfg(any(target_os = "windows", feature = "pill-preview"))]
pub mod pill;
pub mod secrets;
pub mod session;
pub mod settings;
pub mod state;
pub mod tray;

use state::AppState;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt as _;

/// Stops the gateway sidecar we own (never an external one).
pub fn shutdown(app: &tauri::AppHandle) {
    if let Some(s) = app.try_state::<AppState>() {
        s.gateway.shutdown();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let background = std::env::args().any(|a| a == "--background");

    let mut builder = tauri::Builder::default()
        // Must stay the first plugin. A second launch (incl. a `maindy://` URL on Windows/Linux, which the
        // "deep-link" feature also forwards to on_open_url) focuses this instance instead.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let urls: Vec<&String> = args.iter().filter(|a| a.starts_with("maindy:")).collect();
            if urls.is_empty() || !deeplink::handle_urls(app, urls) {
                launcher::show_main(app, None);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .target(tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                    file_name: Some("maindy-desktop".into()),
                }))
                .target(tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout))
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_denylist(&["notch", "quick", "pill"])
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all() - tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        );
    #[cfg(feature = "updater")]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder = builder
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::pair_start,
            commands::pair_poll,
            commands::pair_cancel,
            commands::sign_out,
            commands::api_get,
            commands::orbit_update_policy,
            commands::orbit_pause,
            commands::orbit_resume,
            commands::gateway_status,
            commands::gateway_set_enabled,
            commands::settings_update,
            commands::autostart_set,
            commands::open_external,
            commands::open_web,
            commands::open_main,
            commands::quit_app,
            commands::notch_set_state,
            commands::notch_set_base,
            commands::quick_hide,
            commands::pill_set_expanded,
            commands::launcher_info,
            deeplink::route_take,
            agent::agent_setup,
            agent::agent_open,
            ops::provider_key_save,
            ops::provider_key_delete,
            ops::gateway_resync,
            ops::gateway_upstreams,
            ops::gateway_upstream_set_url,
            ops::gateway_upstream_test,
            ops::gateway_probe,
            ops::integrations_get,
            ops::integration_apply,
            ops::report_preview,
            ops::report_export,
            ops::reveal_path,
            ops::entity_create,
            ops::entity_update,
            ops::entity_delete,
            ops::orbit_rollback,
            ops::orbit_reactivate,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let config_dir = app.path().app_config_dir()?;
            let log_dir = app.path().app_log_dir()?;
            let settings = settings::SettingsStore::load(config_dir);
            let s = settings.get();

            // One keychain read at startup; the token then lives only in this process' memory.
            let (session, keychain_error) = match session::keychain_load() {
                Ok(v) => (v, None),
                Err(e) => {
                    log::warn!("keychain read failed");
                    (None, Some(e))
                }
            };
            let home = session::maindy_home();
            if s.gateway_local {
                if let Some(sess) = &session {
                    if let Err(e) = session::write_device_json(&home, sess) {
                        log::warn!("device.json: {e}");
                    }
                }
            }
            let gateway = gateway::GatewayManager::new(home, log_dir, s.gateway_local);
            let paired = session.is_some();
            app.manage(deeplink::PendingRoute::default());
            app.manage(AppState {
                settings,
                session: Mutex::new(session),
                keychain_error: Mutex::new(keychain_error),
                session_revoked: Mutex::new(false),
                pairing: Mutex::new(None),
                http: api::build_client(),
                gateway,
                orbit_paused: Mutex::new(None),
                launched_in_background: background,
                keys: secrets::KeyCache::default(),
                exported: Mutex::new(Vec::new()),
            });

            // macOS: menu-bar/notch app (no Dock icon). Required so the notch window can join other
            // apps' full-screen Spaces (a Regular app's window stays on its own Space and is hidden there).
            #[cfg(target_os = "macos")]
            let _ = handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
            // SIGTERM/SIGINT (kill, logout scripts): stop the gateway child we own before exiting.
            let h_sig = handle.clone();
            let _ = ctrlc::set_handler(move || {
                shutdown(&h_sig);
                std::process::exit(0);
            });
            tray::setup(&handle)?;
            launcher::install(&handle);

            // maindy:// links (macOS: Apple Events via the plugin; Windows/Linux: argv / single-instance).
            #[cfg(any(windows, target_os = "linux"))]
            if let Err(e) = app.deep_link().register_all() {
                log::warn!("deep link register: {e}");
            }
            let h_dl = handle.clone();
            app.deep_link().on_open_url(move |event| {
                deeplink::handle_urls(&h_dl, event.urls().iter().map(|u| u.as_str()));
            });
            let launched_by_link = match app.deep_link().get_current() {
                Ok(Some(urls)) => deeplink::handle_urls(&handle, urls.iter().map(|u| u.as_str())),
                _ => false,
            };

            // Main window: shown on first run (pairing) or normal launch; hidden on autostart.
            if (!background || !paired) && !launched_by_link {
                launcher::show_main(&handle, None);
            }

            // Gateway supervisor: health-check every 3 s, restart with backoff.
            let h = handle.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let st = h.state::<AppState>();
                    let before = st.gateway.view();
                    if st.gateway.tick(&st.http).await {
                        let v = st.gateway.view();
                        if let Some(paused) = v.status.as_ref().and_then(|s| s.get("paused")).and_then(|p| p.as_bool()) {
                            let prev = st.orbit_paused.lock().unwrap().replace(paused);
                            let _ = prev;
                        }
                        if v.phase == gateway::Phase::Crashed && before.phase != gateway::Phase::Crashed {
                            events::notify(&h, "Gateway local reiniciando", "O gateway encerrou e será reiniciado automaticamente.");
                        }
                        let _ = h.emit(events::GATEWAY, &v);
                        tray::refresh(&h);
                    }
                    // New gateway instance we launched → re-push saved base URLs + Keychain keys.
                    ops::after_tick(&h);
                    tokio::time::sleep(Duration::from_secs(3)).await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| match (window.label(), event) {
            ("main", WindowEvent::CloseRequested { api, .. }) => {
                api.prevent_close();
                launcher::hide_main(window.app_handle());
            }
            ("quick", WindowEvent::Focused(false)) => {
                let _ = window.hide();
            }
            #[cfg(target_os = "macos")]
            ("notch", WindowEvent::Focused(false)) => notch::on_blur(window.app_handle()),
            _ => {}
        });

    let app = builder.build(tauri::generate_context!()).expect("error while building maindy desktop");
    app.run(|handle, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => launcher::show_main(handle, None),
        // Windows are never closed (main hides on close), so ExitRequested only comes from an explicit
        // quit / system logout — never block it.
        RunEvent::Exit => shutdown(handle),
        _ => {}
    });
}
