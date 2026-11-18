//! Device session: the bearer token lives ONLY in the OS secure store
//! (macOS Keychain / Windows Credential Manager via the `keyring` crate).
//! It never reaches the webview, logs, settings.json or localStorage.
//!
//! Optional trade-off (opt-in "Gateway local"): the local gateway is a separate process that needs
//! the token to send metadata telemetry to the control plane, so we ALSO write
//! `$MAINDY_HOME/device.json` (0600 on Unix, directory 0700). Turning the toggle off or signing out
//! deletes the file.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const SERVICE: &str = "ai.maindy.desktop";
const ACCOUNT: &str = "device-session";

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSession {
    pub api_url: String,
    pub device_id: String,
    pub organization_id: String,
    pub token: String,
}

impl std::fmt::Debug for DeviceSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DeviceSession")
            .field("api_url", &self.api_url)
            .field("device_id", &self.device_id)
            .field("organization_id", &self.organization_id)
            .field("token", &"<redacted>")
            .finish()
    }
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("Armazenamento seguro indisponível: {e}"))
}

pub fn keychain_store(s: &DeviceSession) -> Result<(), String> {
    let json = serde_json::to_string(s).map_err(|e| e.to_string())?;
    entry()?
        .set_password(&json)
        .map_err(|e| format!("Não foi possível salvar a sessão no armazenamento seguro do sistema: {e}"))
}

pub fn keychain_load() -> Result<Option<DeviceSession>, String> {
    match entry()?.get_password() {
        Ok(json) => Ok(serde_json::from_str(&json).ok()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Não foi possível ler a sessão do armazenamento seguro: {e}")),
    }
}

pub fn keychain_delete() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Não foi possível remover a sessão do armazenamento seguro: {e}")),
    }
}

/// `$MAINDY_HOME` or `~/.maindy` (shared with apps/gateway).
pub fn maindy_home() -> PathBuf {
    if let Some(h) = std::env::var_os("MAINDY_HOME").filter(|v| !v.is_empty()) {
        return PathBuf::from(h);
    }
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    home.join(".maindy")
}

/// Shape consumed by apps/gateway (`$MAINDY_HOME/device.json`, see apps/gateway/src/home.ts which
/// reads `deviceToken`). `token` is kept as an alias of the same value for older readers.
#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct DeviceFile<'a> {
    api_url: &'a str,
    device_id: &'a str,
    organization_id: &'a str,
    device_token: &'a str,
    token: &'a str,
}

pub fn write_device_json(home: &Path, s: &DeviceSession) -> Result<PathBuf, String> {
    std::fs::create_dir_all(home).map_err(|e| format!("Não foi possível criar {}: {e}", home.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(home, std::fs::Permissions::from_mode(0o700));
    }
    let path = home.join("device.json");
    let tmp = home.join(".device.json.tmp");
    let body = serde_json::to_vec_pretty(&DeviceFile {
        api_url: &s.api_url,
        device_id: &s.device_id,
        organization_id: &s.organization_id,
        device_token: &s.token,
        token: &s.token,
    })
    .map_err(|e| e.to_string())?;
    write_private(&tmp, &body).map_err(|e| format!("Não foi possível gravar device.json: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("Não foi possível gravar device.json: {e}"))?;
    Ok(path)
}

#[cfg(unix)]
fn write_private(path: &Path, body: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let _ = std::fs::remove_file(path);
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path)?;
    f.write_all(body)?;
    f.sync_all()?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn write_private(path: &Path, body: &[u8]) -> std::io::Result<()> {
    // Windows: %USERPROFILE%\.maindy inherits the per-user ACL of the profile directory.
    std::fs::write(path, body)
}

pub fn remove_device_json(home: &Path) -> Result<(), String> {
    match std::fs::remove_file(home.join("device.json")) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Não foi possível remover device.json: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> DeviceSession {
        DeviceSession {
            api_url: "http://localhost:4100".into(),
            device_id: "dev_1".into(),
            organization_id: "org_1".into(),
            token: "secret-token-value".into(),
        }
    }

    #[test]
    fn debug_never_prints_token() {
        let s = format!("{:?}", sample());
        assert!(!s.contains("secret-token-value"));
        assert!(s.contains("<redacted>"));
    }

    #[test]
    fn device_json_is_private_and_removable() {
        let home = std::env::temp_dir().join(format!("maindy-home-test-{}", std::process::id()));
        let p = write_device_json(&home, &sample()).unwrap();
        let v: serde_json::Value = serde_json::from_slice(&std::fs::read(&p).unwrap()).unwrap();
        assert_eq!(v["deviceId"], "dev_1");
        assert_eq!(v["apiUrl"], "http://localhost:4100");
        assert_eq!(v["organizationId"], "org_1");
        assert_eq!(v["token"], "secret-token-value");
        assert_eq!(v["deviceToken"], "secret-token-value");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&p).unwrap().permissions().mode() & 0o777, 0o600);
            assert_eq!(std::fs::metadata(&home).unwrap().permissions().mode() & 0o777, 0o700);
        }
        // rewrite works (tmp file is recreated) and removal is idempotent
        write_device_json(&home, &sample()).unwrap();
        remove_device_json(&home).unwrap();
        remove_device_json(&home).unwrap();
        assert!(!p.exists());
        let _ = std::fs::remove_dir_all(home);
    }
}
