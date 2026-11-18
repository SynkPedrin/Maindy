use crate::gateway::GatewayManager;
use crate::session::DeviceSession;
use crate::settings::SettingsStore;
use crate::secrets::KeyCache;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

pub struct PendingPairing {
    pub device_code: String,
    pub api_url: String,
    pub interval_secs: u64,
    pub expires_at: Instant,
    pub last_poll: Option<Instant>,
}

pub struct AppState {
    pub settings: SettingsStore,
    pub session: Mutex<Option<DeviceSession>>,
    /// Set when the keychain could not be read at startup (surfaced in the UI).
    pub keychain_error: Mutex<Option<String>>,
    /// Set when /v1/me answers 401 (device revoked from the web dashboard).
    pub session_revoked: Mutex<bool>,
    pub pairing: Mutex<Option<PendingPairing>>,
    pub http: reqwest::Client,
    pub gateway: GatewayManager,
    /// Last known ORBIT pause state (from policy / gateway status), for the tray label.
    pub orbit_paused: Mutex<Option<bool>>,
    pub launched_in_background: bool,
    /// BYOK provider keys read from the Keychain (never serialized, never sent to the UI).
    pub keys: KeyCache,
    /// Files this run exported (only these may be revealed in Finder/Explorer).
    pub exported: Mutex<Vec<PathBuf>>,
}

impl AppState {
    pub fn session(&self) -> Option<DeviceSession> {
        self.session.lock().unwrap().clone()
    }
}
