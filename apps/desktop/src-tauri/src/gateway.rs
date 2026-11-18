//! Local gateway (apps/gateway) lifecycle: locate the sidecar, start/stop it when the user opts in,
//! health-check `/maindy/health`, read `/maindy/status`, restart on crash with exponential backoff.
//!
//! The app is fully usable without the gateway ("Gateway local não instalado").

use crate::api::CmdError;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const DEFAULT_GATEWAY_PORT: u16 = 8787;
pub const SIDECAR_NAME: &str = "maindy-gateway";

/// Gateway port: `MAINDY_GATEWAY_PORT` (dev/QA, so a second instance never collides with an
/// installed app) or 8787.
pub fn gateway_port() -> u16 {
    std::env::var("MAINDY_GATEWAY_PORT")
        .ok()
        .and_then(|v| v.trim().parse::<u16>().ok())
        .filter(|p| *p >= 1024)
        .unwrap_or(DEFAULT_GATEWAY_PORT)
}

/// Always loopback: the gateway never listens elsewhere and we never send its key elsewhere.
pub fn gateway_base() -> String {
    format!("http://127.0.0.1:{}", gateway_port())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    /// No sidecar binary (and no dev bundle) found.
    NotInstalled,
    /// Installed, user hasn't enabled "Gateway local".
    Disabled,
    Starting,
    Running,
    /// Something else already answers on 127.0.0.1:8787 (e.g. `pnpm --filter @maindy/gateway dev`).
    External,
    /// Exited unexpectedly; waiting for the backoff before restarting.
    Crashed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayView {
    pub phase: Phase,
    pub installed: bool,
    pub enabled: bool,
    pub healthy: bool,
    pub pid: Option<u32>,
    pub restarts: u32,
    pub last_error: Option<String>,
    pub next_retry_in_secs: Option<u64>,
    /// `GatewayStatus` from /maindy/status (contracts), when reachable.
    pub status: Option<Value>,
    pub binary: Option<String>,
}

/// Restart delay after `failures` consecutive crashes: 1, 2, 4, 8 … capped at 60 s.
pub fn backoff_secs(failures: u32) -> u64 {
    if failures == 0 {
        return 0;
    }
    let exp = (failures - 1).min(6);
    (1u64 << exp).min(60)
}

#[derive(Debug, Clone, PartialEq)]
pub enum Launch {
    /// Packaged Node SEA sidecar (bundle: next to the app executable; dev: src-tauri/binaries).
    Sidecar(PathBuf),
    /// Dev only: `node apps/gateway/dist/maindy-gateway.mjs`.
    NodeBundle(PathBuf),
}

/// Finds how to launch the gateway. Pure w.r.t. the provided roots (testable).
pub fn locate(exe_dir: Option<&Path>, dev_root: Option<&Path>, triple: &str) -> Option<Launch> {
    let ext = if cfg!(windows) { ".exe" } else { "" };
    if let Some(dir) = exe_dir {
        let p = dir.join(format!("{SIDECAR_NAME}{ext}"));
        if p.is_file() {
            return Some(Launch::Sidecar(p));
        }
    }
    if let Some(root) = dev_root {
        let p = root.join("apps/desktop/src-tauri/binaries").join(format!("{SIDECAR_NAME}-{triple}{ext}"));
        if p.is_file() {
            return Some(Launch::Sidecar(p));
        }
        let mjs = root.join("apps/gateway/dist/maindy-gateway.mjs");
        if mjs.is_file() {
            return Some(Launch::NodeBundle(mjs));
        }
    }
    None
}

/// Quoted command for a launch target (paths are always double-quoted; they may contain spaces).
pub fn cli_command_for(l: &Launch) -> String {
    match l {
        Launch::Sidecar(p) => format!("\"{}\"", p.display()),
        Launch::NodeBundle(p) => format!("node \"{}\"", p.display()),
    }
}

/// Reads the `x-maindy-key` the gateway generated in $MAINDY_HOME (never logged, never sent to the UI).
pub fn read_gateway_key(home: &Path) -> Option<String> {
    for name in ["gateway-key", "gateway.key"] {
        if let Ok(s) = std::fs::read_to_string(home.join(name)) {
            let k = s.trim().to_string();
            if !k.is_empty() {
                return Some(k);
            }
        }
    }
    let v: Value = serde_json::from_str(&std::fs::read_to_string(home.join("gateway.json")).ok()?).ok()?;
    ["key", "apiKey", "maindyKey", "localKey"]
        .iter()
        .find_map(|f| v.get(*f).and_then(|x| x.as_str()).map(str::to_string))
}

struct Inner {
    enabled: bool,
    child: Option<Child>,
    phase: Phase,
    healthy: bool,
    failures: u32,
    restarts: u32,
    retry_at: Option<Instant>,
    started_at: Option<Instant>,
    last_error: Option<String>,
    status: Option<Value>,
    /// Uptime seen on the previous healthy tick; a smaller value (or a first healthy tick) means a new
    /// gateway instance, whose in-memory BYOK keys must be re-pushed.
    last_uptime: Option<u64>,
    push_pending: bool,
}

pub struct GatewayManager {
    inner: Mutex<Inner>,
    launch: Option<Launch>,
    home: PathBuf,
    log_path: PathBuf,
}

impl GatewayManager {
    pub fn new(home: PathBuf, log_dir: PathBuf, enabled: bool) -> Self {
        let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
        // Dev builds also look into the monorepo (CARGO_MANIFEST_DIR = apps/desktop/src-tauri).
        let dev_root = if cfg!(debug_assertions) {
            Path::new(env!("CARGO_MANIFEST_DIR")).ancestors().nth(3).map(Path::to_path_buf)
        } else {
            None
        };
        let launch = locate(exe_dir.as_deref(), dev_root.as_deref(), env!("MAINDY_TARGET_TRIPLE"));
        let _ = std::fs::create_dir_all(&log_dir);
        Self {
            inner: Mutex::new(Inner {
                enabled,
                child: None,
                phase: if launch.is_none() { Phase::NotInstalled } else { Phase::Disabled },
                healthy: false,
                failures: 0,
                restarts: 0,
                retry_at: None,
                started_at: None,
                last_error: None,
                status: None,
                last_uptime: None,
                push_pending: false,
            }),
            launch,
            home,
            log_path: log_dir.join("gateway.log"),
        }
    }

    pub fn home(&self) -> &Path {
        &self.home
    }

    /// Shell command that runs this app's gateway CLI (detected at runtime, e.g.
    /// `"/Applications/maindy.app/Contents/MacOS/maindy-gateway"`; dev: `node "<…/maindy-gateway.mjs>"`).
    pub fn cli_command(&self) -> Option<String> {
        self.launch.as_ref().map(cli_command_for)
    }

    pub fn view(&self) -> GatewayView {
        let g = self.inner.lock().unwrap();
        GatewayView {
            phase: g.phase,
            installed: self.launch.is_some(),
            enabled: g.enabled,
            healthy: g.healthy,
            pid: g.child.as_ref().map(|c| c.id()),
            restarts: g.restarts,
            last_error: g.last_error.clone(),
            next_retry_in_secs: g.retry_at.map(|t| t.saturating_duration_since(Instant::now()).as_secs()),
            status: g.status.clone(),
            binary: self.launch.as_ref().map(|l| match l {
                Launch::Sidecar(p) | Launch::NodeBundle(p) => p.display().to_string(),
            }),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        let mut g = self.inner.lock().unwrap();
        g.enabled = enabled;
        g.failures = 0;
        g.retry_at = None;
        if !enabled {
            Self::kill(&mut g);
            g.phase = if self.launch.is_none() { Phase::NotInstalled } else { Phase::Disabled };
            g.healthy = false;
            g.status = None;
        }
    }

    fn kill(g: &mut Inner) {
        if let Some(mut c) = g.child.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
        g.started_at = None;
    }

    pub fn shutdown(&self) {
        let mut g = self.inner.lock().unwrap();
        Self::kill(&mut g);
    }

    fn spawn(&self, g: &mut Inner) {
        let Some(launch) = &self.launch else { return };
        let log = std::fs::OpenOptions::new().create(true).append(true).open(&self.log_path);
        let (out, err) = match log {
            Ok(f) => (Stdio::from(f.try_clone().unwrap()), Stdio::from(f)),
            Err(_) => (Stdio::null(), Stdio::null()),
        };
        let mut cmd = match launch {
            Launch::Sidecar(p) => Command::new(p),
            Launch::NodeBundle(p) => {
                let mut c = Command::new("node");
                c.arg(p);
                c
            }
        };
        cmd.env("MAINDY_HOME", &self.home)
            .env("MAINDY_GATEWAY_HOST", "127.0.0.1")
            .env("MAINDY_GATEWAY_PORT", gateway_port().to_string())
            .env("MAINDY_LAUNCHED_BY", "desktop")
            .stdin(Stdio::null())
            .stdout(out)
            .stderr(err);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        match cmd.spawn() {
            Ok(c) => {
                log::info!("gateway started pid={}", c.id());
                g.child = Some(c);
                g.phase = Phase::Starting;
                g.started_at = Some(Instant::now());
                g.last_error = None;
            }
            Err(e) => {
                g.failures += 1;
                g.phase = Phase::Crashed;
                g.last_error = Some(format!("Falha ao iniciar o gateway: {e}"));
                g.retry_at = Some(Instant::now() + Duration::from_secs(backoff_secs(g.failures)));
            }
        }
    }

    /// One supervision step. Returns true when the user-visible view changed.
    pub async fn tick(&self, client: &reqwest::Client) -> bool {
        let before = serde_json::to_string(&self.view()).unwrap_or_default();
        let key = read_gateway_key(&self.home);
        let health = probe(client, "/maindy/health", key.as_deref()).await;
        let status = if health.is_some() { probe(client, "/maindy/status", key.as_deref()).await } else { None };
        {
            let mut g = self.inner.lock().unwrap();
            // reap our child if it exited
            if let Some(c) = g.child.as_mut() {
                if let Ok(Some(st)) = c.try_wait() {
                    g.child = None;
                    if g.enabled {
                        g.failures += 1;
                        g.restarts += 1;
                        let wait = backoff_secs(g.failures);
                        g.phase = Phase::Crashed;
                        g.last_error = Some(format!("O gateway encerrou inesperadamente ({st}). Reiniciando em {wait}s."));
                        g.retry_at = Some(Instant::now() + Duration::from_secs(wait));
                        log::warn!("gateway exited: {st}; retry in {wait}s");
                    }
                }
            }
            g.healthy = health.is_some();
            let uptime = status.as_ref().and_then(|s| s.get("uptimeSeconds")).and_then(Value::as_f64).map(|u| u as u64);
            if g.healthy {
                if let Some(u) = uptime {
                    if is_new_instance(g.last_uptime, u) {
                        g.push_pending = true;
                    }
                    g.last_uptime = Some(u);
                }
            } else {
                g.last_uptime = None;
            }
            g.status = status;
            if g.enabled {
                if g.child.is_some() {
                    if g.healthy {
                        g.phase = Phase::Running;
                        // healthy for a minute → forget previous failures
                        if g.started_at.map(|t| t.elapsed() > Duration::from_secs(60)).unwrap_or(false) {
                            g.failures = 0;
                        }
                    } else if g.started_at.map(|t| t.elapsed() > Duration::from_secs(20)).unwrap_or(false) {
                        g.last_error = Some("O gateway iniciou mas não responde em /maindy/health.".into());
                    }
                } else if g.healthy {
                    g.phase = Phase::External;
                } else if self.launch.is_some() {
                    let due = g.retry_at.map(|t| Instant::now() >= t).unwrap_or(true);
                    if due {
                        g.retry_at = None;
                        self.spawn(&mut g);
                    }
                } else {
                    g.phase = Phase::NotInstalled;
                }
            } else {
                g.phase = if g.healthy {
                    Phase::External
                } else if self.launch.is_none() {
                    Phase::NotInstalled
                } else {
                    Phase::Disabled
                };
            }
        }
        serde_json::to_string(&self.view()).unwrap_or_default() != before
    }
}

impl GatewayManager {
    /// True once per new gateway instance that WE launched (phase Running): the caller then re-pushes
    /// upstream base URLs and Keychain keys. External gateways only get keys on explicit user action.
    pub fn take_push_pending(&self) -> bool {
        let mut g = self.inner.lock().unwrap();
        if g.push_pending && g.phase == Phase::Running {
            g.push_pending = false;
            return true;
        }
        if g.phase != Phase::Running {
            g.push_pending = false;
        }
        false
    }
}

/// A gateway restart is detected by uptime going backwards (or the first healthy observation).
pub fn is_new_instance(prev_uptime: Option<u64>, uptime: u64) -> bool {
    match prev_uptime {
        None => true,
        Some(p) => uptime < p,
    }
}

async fn probe(client: &reqwest::Client, path: &str, key: Option<&str>) -> Option<Value> {
    let mut req = client.get(format!("{}{path}", gateway_base())).timeout(Duration::from_millis(1500));
    if let Some(k) = key {
        req = req.header("x-maindy-key", k);
    }
    let resp = req.send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    Some(resp.json::<Value>().await.unwrap_or(Value::Null))
}

/// POST /maindy/pause | /maindy/resume on the local gateway.
pub async fn post_control(client: &reqwest::Client, home: &Path, action: &str) -> Result<(), String> {
    let key = read_gateway_key(home);
    let mut req = client
        .post(format!("{}/maindy/{action}", gateway_base()))
        .timeout(Duration::from_secs(3))
        .json(&serde_json::json!({ "source": "desktop" }));
    if let Some(k) = key {
        req = req.header("x-maindy-key", k);
    }
    match req.send().await {
        Ok(r) if r.status().is_success() => Ok(()),
        Ok(r) if r.status().as_u16() == 401 => Err("Gateway recusou a chave local (x-maindy-key).".into()),
        Ok(r) => Err(format!("Gateway respondeu {}.", r.status().as_u16())),
        Err(_) => Err("Gateway local não está respondendo.".into()),
    }
}

// ------------------------- control routes (/maindy/...) -------------------------

/// Integrations the gateway can install into local tool configs.
pub const INTEGRATION_TOOLS: &[&str] = &["claude-code", "codex"];

/// Gateway routes the desktop may call with the local key. Everything else is rejected before any I/O.
pub fn gateway_route_allowed(method: &reqwest::Method, path: &str) -> bool {
    use reqwest::Method as M;
    let seg: Vec<&str> = path.strip_prefix('/').unwrap_or("").split('/').collect();
    let upstream_ok = |id: &str| crate::secrets::valid_upstream_id(id);
    match (method, seg.as_slice()) {
        (m, ["maindy", "upstreams"]) => *m == M::GET,
        (m, ["maindy", "upstreams", id]) => *m == M::PUT && upstream_ok(id),
        (m, ["maindy", "upstreams", id, "test"]) => *m == M::POST && upstream_ok(id),
        (m, ["maindy", "integrations"]) => *m == M::GET,
        (m, ["maindy", "integrations", tool, action]) => {
            *m == M::POST && INTEGRATION_TOOLS.contains(tool) && matches!(*action, "install" | "uninstall")
        }
        (m, ["maindy", "events"]) => *m == M::GET,
        (m, ["maindy", "rollbacks", "reset"]) => *m == M::POST,
        (m, ["maindy", "pause" | "resume"]) => *m == M::POST,
        _ => false,
    }
}

fn gateway_error(status: u16, body: &str) -> CmdError {
    let parsed = serde_json::from_str::<Value>(body).ok().and_then(|v| {
        let e = v.get("error")?;
        Some((e.get("code")?.as_str()?.to_string(), e.get("message")?.as_str()?.to_string()))
    });
    let mut e = match (status, parsed) {
        (401, _) => CmdError::new("gateway_key", "O gateway local recusou a chave local (x-maindy-key). Reinicie o gateway em Configurações."),
        (404, None) => CmdError::new(
            "gateway_outdated",
            "Esta versão do gateway local não oferece esta função. Atualize o app da maindy.",
        ),
        (_, Some((c, m))) => CmdError::new(&c, m),
        (s, None) => CmdError::new("gateway_http", format!("O gateway local respondeu com status {s}.")),
    };
    e.status = Some(status);
    e
}

/// Authenticated call to an allowlisted `/maindy/*` route of the local gateway.
pub async fn gw_call(
    client: &reqwest::Client,
    home: &Path,
    method: reqwest::Method,
    path: &str,
    body: Option<&Value>,
    timeout: Duration,
) -> Result<Value, CmdError> {
    let (route, query) = path.split_once('?').unwrap_or((path, ""));
    if !gateway_route_allowed(&method, route) || !query.bytes().all(|c| c.is_ascii_alphanumeric() || b"=&-_.:".contains(&c)) {
        return Err(CmdError::new("not_allowed", "Rota do gateway não permitida pelo app desktop."));
    }
    let mut req = client.request(method, format!("{}{path}", gateway_base())).timeout(timeout);
    if let Some(k) = read_gateway_key(home) {
        req = req.header("x-maindy-key", k);
    }
    if let Some(b) = body {
        req = req.json(b);
    }
    let resp = req.send().await.map_err(|e| {
        if e.is_timeout() {
            CmdError::new("gateway_timeout", "O gateway local demorou demais para responder.")
        } else {
            CmdError::new("gateway_offline", "O gateway local não está respondendo. Ative-o em Configurações → Gateway local.")
        }
    })?;
    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(gateway_error(status, &text));
    }
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text).map_err(|_| CmdError::new("invalid_response", "Resposta inesperada do gateway local."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_grows_and_caps() {
        assert_eq!(backoff_secs(0), 0);
        assert_eq!(backoff_secs(1), 1);
        assert_eq!(backoff_secs(2), 2);
        assert_eq!(backoff_secs(4), 8);
        assert_eq!(backoff_secs(7), 60);
        assert_eq!(backoff_secs(50), 60);
    }

    #[test]
    fn locate_prefers_bundled_sidecar_then_dev() {
        let root = std::env::temp_dir().join(format!("maindy-locate-{}", std::process::id()));
        let exe = root.join("exe");
        std::fs::create_dir_all(&exe).unwrap();
        assert_eq!(locate(Some(&exe), Some(&root), "aarch64-apple-darwin"), None);
        let mjs = root.join("apps/gateway/dist/maindy-gateway.mjs");
        std::fs::create_dir_all(mjs.parent().unwrap()).unwrap();
        std::fs::write(&mjs, "//").unwrap();
        assert_eq!(locate(Some(&exe), Some(&root), "t"), Some(Launch::NodeBundle(mjs.clone())));
        let ext = if cfg!(windows) { ".exe" } else { "" };
        let bin = exe.join(format!("maindy-gateway{ext}"));
        std::fs::write(&bin, "").unwrap();
        assert_eq!(locate(Some(&exe), Some(&root), "t"), Some(Launch::Sidecar(bin.clone())));
        assert_eq!(cli_command_for(&Launch::Sidecar(bin.clone())), format!("\"{}\"", bin.display()));
        assert_eq!(cli_command_for(&Launch::NodeBundle(mjs.clone())), format!("node \"{}\"", mjs.display()));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn gateway_key_formats() {
        let home = std::env::temp_dir().join(format!("maindy-key-{}", std::process::id()));
        std::fs::create_dir_all(&home).unwrap();
        assert_eq!(read_gateway_key(&home), None);
        std::fs::write(home.join("gateway.json"), r#"{"key":"k-json"}"#).unwrap();
        assert_eq!(read_gateway_key(&home).as_deref(), Some("k-json"));
        std::fs::write(home.join("gateway-key"), "k-plain\n").unwrap();
        assert_eq!(read_gateway_key(&home).as_deref(), Some("k-plain"));
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn gateway_routes_allowlisted() {
        use reqwest::Method as M;
        assert!(gateway_route_allowed(&M::GET, "/maindy/upstreams"));
        assert!(gateway_route_allowed(&M::PUT, "/maindy/upstreams/openai"));
        assert!(gateway_route_allowed(&M::POST, "/maindy/upstreams/ollama/test"));
        assert!(gateway_route_allowed(&M::GET, "/maindy/integrations"));
        assert!(gateway_route_allowed(&M::POST, "/maindy/integrations/claude-code/install"));
        assert!(gateway_route_allowed(&M::POST, "/maindy/integrations/codex/uninstall"));
        assert!(gateway_route_allowed(&M::POST, "/maindy/rollbacks/reset"));
        assert!(!gateway_route_allowed(&M::DELETE, "/maindy/upstreams/openai"));
        assert!(!gateway_route_allowed(&M::PUT, "/maindy/upstreams/../policy"));
        assert!(!gateway_route_allowed(&M::PUT, "/maindy/upstreams/OpenAI"));
        assert!(!gateway_route_allowed(&M::POST, "/maindy/integrations/cursor/install"));
        assert!(!gateway_route_allowed(&M::POST, "/maindy/integrations/codex/delete"));
        assert!(!gateway_route_allowed(&M::PUT, "/maindy/policy"));
        assert!(!gateway_route_allowed(&M::GET, "/maindy/upstreams/openai"));
        assert!(!gateway_route_allowed(&M::POST, "/v1/chat/completions"));
        assert!(!gateway_route_allowed(&M::GET, "http://evil/maindy/upstreams"));
    }

    #[test]
    fn restart_detection() {
        assert!(is_new_instance(None, 3));
        assert!(!is_new_instance(Some(3), 6));
        assert!(!is_new_instance(Some(6), 6));
        assert!(is_new_instance(Some(600), 2));
    }

    #[test]
    fn gateway_errors_are_ptbr() {
        assert_eq!(gateway_error(401, "").code, "gateway_key");
        assert_eq!(gateway_error(404, "").code, "gateway_outdated");
        let e = gateway_error(400, r#"{"error":{"code":"invalid_base_url","message":"URL inválida."}}"#);
        assert_eq!(e.code, "invalid_base_url");
        assert_eq!(e.status, Some(400));
    }
}
