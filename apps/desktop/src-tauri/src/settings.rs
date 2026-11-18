//! Non-secret preferences, persisted as JSON in the OS app-config dir
//! (macOS: ~/Library/Application Support/ai.maindy.desktop/settings.json,
//!  Windows: %APPDATA%\ai.maindy.desktop\settings.json). Secrets NEVER go here — see `session.rs`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

pub const DEFAULT_API_URL: &str = "http://localhost:4100";
pub const DEFAULT_WEB_URL: &str = "http://localhost:3100";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub api_url: String,
    pub web_url: String,
    /// Opt-in: run the local gateway sidecar (and write $MAINDY_HOME/device.json for it).
    pub gateway_local: bool,
    /// macOS: show the launcher merged with the notch when the display has one.
    pub notch_launcher: bool,
    /// Minimal launcher, no motion, no notifications.
    pub silent_mode: bool,
    /// Client-side fixtures, always labeled "Demonstração — dados simulados". Never sent anywhere.
    pub demo_mode: bool,
    /// Windows pill: keep above other windows.
    pub pill_always_on_top: bool,
    /// Windows pill: last position per monitor (physical px, top-left origin).
    pub pill_positions: HashMap<String, (i32, i32)>,
    /// Non-secret pairing metadata, mirrored here so the UI can render without touching the keychain.
    pub device_id: Option<String>,
    pub organization_id: Option<String>,
    /// Gateway upstream ids whose BYOK key is stored in the Keychain (ids only — never the key).
    pub provider_keys: Vec<String>,
    /// Base URLs the user set for gateway upstreams (OpenAI-compatible), re-applied when the gateway restarts.
    pub upstream_base_urls: HashMap<String, String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            api_url: DEFAULT_API_URL.into(),
            web_url: DEFAULT_WEB_URL.into(),
            gateway_local: false,
            notch_launcher: true,
            silent_mode: false,
            demo_mode: false,
            pill_always_on_top: true,
            pill_positions: HashMap::new(),
            device_id: None,
            organization_id: None,
            provider_keys: Vec::new(),
            upstream_base_urls: HashMap::new(),
        }
    }
}

/// Patch sent by the UI (every field optional).
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub api_url: Option<String>,
    pub web_url: Option<String>,
    pub notch_launcher: Option<bool>,
    pub silent_mode: Option<bool>,
    pub demo_mode: Option<bool>,
    pub pill_always_on_top: Option<bool>,
}

/// Validates and normalizes a base URL typed by the user. Only http(s); plain http only for loopback.
pub fn normalize_base_url(raw: &str) -> Result<String, String> {
    let s = raw.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(s).map_err(|_| "URL inválida.".to_string())?;
    match parsed.scheme() {
        "https" => {}
        "http" => {
            let host = parsed.host_str().unwrap_or("");
            let loopback = matches!(host, "localhost" | "127.0.0.1" | "[::1]" | "::1");
            if !loopback {
                return Err("Use https:// (http:// só é aceito para localhost).".into());
            }
        }
        _ => return Err("Use uma URL http(s).".into()),
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("A URL base não pode ter query ou fragmento.".into());
    }
    Ok(s.to_string())
}

/// Base URL of an OpenAI-compatible server (Ollama, vLLM, LM Studio…): http(s), any host (LAN servers
/// are common), no credentials/query/fragment.
pub fn normalize_upstream_url(raw: &str) -> Result<String, String> {
    let s = raw.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(s).map_err(|_| "URL inválida.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Use uma URL http(s).".into());
    }
    if parsed.host_str().unwrap_or("").is_empty() {
        return Err("Informe o host do servidor.".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Não coloque usuário/senha na URL; use o campo de chave.".into());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("A URL base não pode ter query ou fragmento.".into());
    }
    Ok(s.to_string())
}

impl Settings {
    pub fn set_provider_key(&mut self, id: &str, stored: bool) {
        self.provider_keys.retain(|x| x != id);
        if stored {
            self.provider_keys.push(id.to_string());
            self.provider_keys.sort();
        }
    }

    pub fn apply(&mut self, p: SettingsPatch) -> Result<(), String> {
        if let Some(u) = p.api_url {
            self.api_url = normalize_base_url(&u)?;
        }
        if let Some(u) = p.web_url {
            self.web_url = normalize_base_url(&u)?;
        }
        if let Some(v) = p.notch_launcher {
            self.notch_launcher = v;
        }
        if let Some(v) = p.silent_mode {
            self.silent_mode = v;
        }
        if let Some(v) = p.demo_mode {
            self.demo_mode = v;
        }
        if let Some(v) = p.pill_always_on_top {
            self.pill_always_on_top = v;
        }
        Ok(())
    }
}

pub struct SettingsStore {
    path: PathBuf,
    inner: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(dir: PathBuf) -> Self {
        let path = dir.join("settings.json");
        let inner = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
            .unwrap_or_default();
        Self { path, inner: Mutex::new(inner) }
    }

    pub fn get(&self) -> Settings {
        self.inner.lock().unwrap().clone()
    }

    pub fn update<F: FnOnce(&mut Settings) -> Result<(), String>>(&self, f: F) -> Result<Settings, String> {
        let mut g = self.inner.lock().unwrap();
        let mut next = g.clone();
        f(&mut next)?;
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Não foi possível salvar as preferências: {e}"))?;
        }
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&next).unwrap())
            .and_then(|_| std::fs::rename(&tmp, &self.path))
            .map_err(|e| format!("Não foi possível salvar as preferências: {e}"))?;
        *g = next.clone();
        Ok(next)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_validation() {
        assert_eq!(normalize_base_url("http://localhost:4100/").unwrap(), "http://localhost:4100");
        assert_eq!(normalize_base_url(" https://api.maindy.ai ").unwrap(), "https://api.maindy.ai");
        assert!(normalize_base_url("http://evil.example.com").is_err());
        assert!(normalize_base_url("file:///etc/passwd").is_err());
        assert!(normalize_base_url("https://x.ai/?a=1").is_err());
        assert!(normalize_base_url("not a url").is_err());
    }

    #[test]
    fn store_roundtrip() {
        let dir = std::env::temp_dir().join(format!("maindy-settings-test-{}", std::process::id()));
        let s = SettingsStore::load(dir.clone());
        assert_eq!(s.get(), Settings::default());
        s.update(|x| x.apply(SettingsPatch { demo_mode: Some(true), ..Default::default() })).unwrap();
        let again = SettingsStore::load(dir.clone());
        assert!(again.get().demo_mode);
        assert!(s.update(|x| x.apply(SettingsPatch { api_url: Some("ftp://x".into()), ..Default::default() })).is_err());
        assert_eq!(again.get().api_url, DEFAULT_API_URL);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn upstream_url_validation() {
        assert_eq!(normalize_upstream_url("http://127.0.0.1:11434/").unwrap(), "http://127.0.0.1:11434");
        assert_eq!(normalize_upstream_url("http://192.168.0.20:8000/v1").unwrap(), "http://192.168.0.20:8000/v1");
        assert!(normalize_upstream_url("ftp://x").is_err());
        assert!(normalize_upstream_url("http://user:pw@host").is_err());
        assert!(normalize_upstream_url("http://host/?k=1").is_err());
    }

    #[test]
    fn provider_key_ids_are_metadata_only() {
        let mut s = Settings::default();
        s.set_provider_key("openai", true);
        s.set_provider_key("anthropic", true);
        s.set_provider_key("openai", true);
        assert_eq!(s.provider_keys, vec!["anthropic", "openai"]);
        s.set_provider_key("openai", false);
        assert_eq!(s.provider_keys, vec!["anthropic"]);
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"providerKeys\":[\"anthropic\"]"));
    }
}
