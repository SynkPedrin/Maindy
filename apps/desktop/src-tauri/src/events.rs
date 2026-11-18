use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt as _;

/// Ask every window to reload its data (pairing, pause, settings changed…).
pub const REFRESH: &str = "maindy://refresh";
pub const NAVIGATE: &str = "maindy://navigate";
pub const GATEWAY: &str = "maindy://gateway";
pub const SETTINGS: &str = "maindy://settings";
/// Notch launcher state/geometry changed (payload: launcher::NotchView).
pub const NOTCH: &str = "notch://state";
/// The notch window lost focus while expanded: the UI animates, then calls notch_set_state("collapsed").
pub const NOTCH_COLLAPSE: &str = "notch://request-collapse";
pub const PILL: &str = "pill://state";

pub fn refresh_all(app: &AppHandle) {
    let _ = app.emit(REFRESH, ());
    crate::tray::refresh(app);
}

/// Native notification, suppressed in silent mode. Never includes secrets or prompt text.
pub fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Some(st) = app.try_state::<crate::state::AppState>() {
        if st.settings.get().silent_mode {
            return;
        }
    }
    let _ = app.notification().builder().title(title).body(body).show();
}
