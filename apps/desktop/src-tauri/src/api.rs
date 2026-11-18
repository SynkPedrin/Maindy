//! Control-plane client. Every authenticated request is made here, in Rust; the webview only ever
//! receives response bodies, never the device token.

use crate::session::DeviceSession;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CmdError {
    /// stable code: network | timeout | unauthorized | forbidden | not_found | rate_limited | server |
    /// invalid_response | not_paired | not_allowed | keychain | gateway_* | <api error code>
    pub code: String,
    /// pt-BR, ready for the UI
    pub message: String,
    pub status: Option<u16>,
}

impl CmdError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self { code: code.into(), message: message.into(), status: None }
    }
}

impl From<String> for CmdError {
    fn from(m: String) -> Self {
        CmdError::new("internal", m)
    }
}

pub type CmdResult<T> = Result<T, CmdError>;

pub fn user_agent() -> String {
    format!("maindy-desktop/{} ({}; {})", env!("CARGO_PKG_VERSION"), platform(), arch())
}

pub fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

pub fn arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    }
}

pub fn build_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(user_agent())
        .timeout(Duration::from_secs(12))
        .connect_timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("http client")
}

/// GET routes the UI may read with the device token. Anything else is rejected before any I/O.
pub const READ_ALLOWLIST: &[&str] = &[
    "/v1/me",
    "/v1/stats/summary",
    "/v1/stats/timeseries",
    "/v1/runs",
    "/v1/connectors",
    "/v1/orbit/policy",
    "/v1/limits",
    "/v1/quality/evaluations",
    "/v1/projects",
    "/v1/agents",
];

/// Connector kinds accepted by `PUT /v1/connectors/:kind` (contracts `ConnectorKind`).
pub const CONNECTOR_KINDS: &[&str] =
    &["openai_api", "anthropic_api", "openai_compatible", "local_agent_sdk", "claude_code", "codex", "chat_apps"];

/// Canonical lowercase UUID (8-4-4-4-12 hex), the id format of projects/agents.
pub fn is_uuid(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 36
        && b.iter().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_hexdigit(),
        })
}

/// Mutations the desktop may perform with the device token. Everything else is rejected before any I/O.
pub fn is_allowed_write(method: &reqwest::Method, path: &str) -> bool {
    use reqwest::Method as M;
    let seg: Vec<&str> = path.strip_prefix("/v1/").unwrap_or("").split('/').collect();
    match (method, seg.as_slice()) {
        (m, ["orbit", "policy"]) => *m == M::PUT,
        (m, ["orbit", "pause" | "resume" | "rollback"]) => *m == M::POST,
        (m, ["connectors", kind]) => *m == M::PUT && CONNECTOR_KINDS.contains(kind),
        (m, ["projects" | "agents"]) => *m == M::POST,
        (m, ["projects" | "agents", id]) => (*m == M::PATCH || *m == M::DELETE) && is_uuid(id),
        _ => false,
    }
}

pub fn is_allowed_read(path: &str) -> bool {
    READ_ALLOWLIST.contains(&path)
}

/// Query keys the UI may forward (values are URL-encoded by reqwest).
pub fn sanitize_query(q: &[(String, String)]) -> Vec<(String, String)> {
    const KEYS: &[&str] = &["from", "to", "bucket", "cursor", "limit"];
    q.iter()
        .filter(|(k, v)| KEYS.contains(&k.as_str()) && v.len() <= 64)
        .cloned()
        .collect()
}

/// Maps an HTTP failure to a pt-BR error. `body` may contain the API's `{ error: { code, message } }`.
pub fn map_http_error(status: u16, body: &str) -> CmdError {
    let parsed: Option<(String, String)> = serde_json::from_str::<Value>(body).ok().and_then(|v| {
        let e = v.get("error")?;
        Some((e.get("code")?.as_str()?.to_string(), e.get("message")?.as_str()?.to_string()))
    });
    let (code, message) = match (status, parsed) {
        (_, Some((c, m))) => (c, m),
        (401, None) => ("unauthorized".into(), "Sessão do dispositivo inválida ou revogada.".into()),
        (403, None) => ("forbidden".into(), "Este dispositivo não tem permissão para este recurso.".into()),
        (404, None) => ("not_found".into(), "Recurso não encontrado na API.".into()),
        (429, None) => ("rate_limited".into(), "Muitas tentativas. Aguarde um pouco.".into()),
        (s, None) if s >= 500 => ("server".into(), "A API da maindy. está com problemas. Tente novamente.".into()),
        (_, None) => ("http".into(), format!("A API respondeu com status {status}.")),
    };
    CmdError { code, message, status: Some(status) }
}

pub fn map_reqwest_error(e: &reqwest::Error) -> CmdError {
    if e.is_timeout() {
        CmdError::new("timeout", "A API demorou demais para responder.")
    } else if e.is_connect() {
        CmdError::new("network", "Não foi possível conectar à API. Verifique a URL em Configurações e sua conexão.")
    } else if e.is_decode() {
        CmdError::new("invalid_response", "Resposta inesperada da API.")
    } else {
        CmdError::new("network", "Falha de rede ao falar com a API.")
    }
}

async fn read_json(resp: reqwest::Response) -> CmdResult<Value> {
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| map_reqwest_error(&e))?;
    if !(200..300).contains(&status) {
        return Err(map_http_error(status, &text));
    }
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text).map_err(|_| CmdError::new("invalid_response", "Resposta inesperada da API."))
}

pub async fn post_public(client: &reqwest::Client, base: &str, path: &str, body: &Value) -> CmdResult<Value> {
    let resp = client
        .post(format!("{base}{path}"))
        .json(body)
        .send()
        .await
        .map_err(|e| map_reqwest_error(&e))?;
    read_json(resp).await
}

pub async fn get_authed(
    client: &reqwest::Client,
    s: &DeviceSession,
    path: &str,
    query: &[(String, String)],
) -> CmdResult<Value> {
    let resp = client
        .get(format!("{}{}", s.api_url, path))
        .bearer_auth(&s.token)
        .query(query)
        .send()
        .await
        .map_err(|e| map_reqwest_error(&e))?;
    read_json(resp).await
}

pub async fn send_authed(
    client: &reqwest::Client,
    s: &DeviceSession,
    method: reqwest::Method,
    path: &str,
    body: Option<&Value>,
) -> CmdResult<Value> {
    if !is_allowed_write(&method, path) {
        return Err(CmdError::new("not_allowed", "Operação não permitida pelo app desktop."));
    }
    let mut req = client.request(method, format!("{}{}", s.api_url, path)).bearer_auth(&s.token);
    if let Some(b) = body {
        req = req.json(b);
    } else {
        req = req.json(&serde_json::json!({}));
    }
    let resp = req.send().await.map_err(|e| map_reqwest_error(&e))?;
    read_json(resp).await
}

/// Report formats the desktop can download.
pub fn report_format_ok(f: &str) -> bool {
    matches!(f, "json" | "csv" | "pdf")
}

/// `from`/`to` must look like ISO-8601 instants (the API validates for real).
pub fn iso_ok(s: &str) -> bool {
    s.len() >= 20 && s.len() <= 35 && s.as_bytes()[4] == b'-' && s.contains('T') && s.bytes().all(|c| c.is_ascii_alphanumeric() || b"-:.+".contains(&c))
}

pub const MAX_REPORT_BYTES: usize = 60 * 1024 * 1024;

/// `GET /v1/reports/savings` → raw bytes + suggested file name (from content-disposition).
pub async fn get_report(
    client: &reqwest::Client,
    s: &DeviceSession,
    from: &str,
    to: &str,
    format: &str,
) -> CmdResult<(Vec<u8>, Option<String>)> {
    if !report_format_ok(format) || !iso_ok(from) || !iso_ok(to) {
        return Err(CmdError::new("invalid_request", "Período ou formato inválido."));
    }
    let resp = client
        .get(format!("{}/v1/reports/savings", s.api_url))
        .bearer_auth(&s.token)
        .query(&[("from", from), ("to", to), ("format", format)])
        .timeout(Duration::from_secs(90))
        .send()
        .await
        .map_err(|e| map_reqwest_error(&e))?;
    let status = resp.status().as_u16();
    let name = resp
        .headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .and_then(filename_from_disposition);
    if resp.content_length().map(|l| l as usize > MAX_REPORT_BYTES).unwrap_or(false) {
        return Err(CmdError::new("too_large", "O relatório é grande demais para baixar pelo app. Reduza o período."));
    }
    let bytes = resp.bytes().await.map_err(|e| map_reqwest_error(&e))?;
    if !(200..300).contains(&status) {
        return Err(map_http_error(status, &String::from_utf8_lossy(&bytes)));
    }
    if bytes.len() > MAX_REPORT_BYTES {
        return Err(CmdError::new("too_large", "O relatório é grande demais para baixar pelo app. Reduza o período."));
    }
    Ok((bytes.to_vec(), name))
}

/// `attachment; filename="x.csv"` → `x.csv`, keeping only safe file-name characters.
pub fn filename_from_disposition(v: &str) -> Option<String> {
    let raw = v.split(';').map(str::trim).find_map(|p| p.strip_prefix("filename="))?;
    let name: String = raw.trim_matches('"').chars().filter(|c| c.is_ascii_alphanumeric() || "._-".contains(*c)).collect();
    let name = name.trim_start_matches('.').to_string();
    if name.is_empty() || name.len() > 120 {
        None
    } else {
        Some(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_blocks_everything_else() {
        assert!(is_allowed_read("/v1/me"));
        assert!(is_allowed_read("/v1/limits"));
        assert!(!is_allowed_read("/v1/account/export"));
        assert!(!is_allowed_read("/v1/me/../account"));
        assert!(!is_allowed_read("https://evil/v1/me"));
        assert!(is_allowed_read("/v1/quality/evaluations"));
        assert!(is_allowed_read("/v1/projects"));
        assert!(is_allowed_read("/v1/agents"));
        assert!(!is_allowed_read("/v1/reports/savings"));
        assert!(!is_allowed_read("/v1/audit"));
        assert!(!is_allowed_read("/v1/devices"));
    }

    #[test]
    fn write_allowlist() {
        use reqwest::Method as M;
        let id = "3f2b8c1e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";
        assert!(is_allowed_write(&M::PUT, "/v1/orbit/policy"));
        assert!(is_allowed_write(&M::POST, "/v1/orbit/pause"));
        assert!(is_allowed_write(&M::POST, "/v1/orbit/resume"));
        assert!(is_allowed_write(&M::POST, "/v1/orbit/rollback"));
        assert!(is_allowed_write(&M::PUT, "/v1/connectors/openai_api"));
        assert!(is_allowed_write(&M::POST, "/v1/projects"));
        assert!(is_allowed_write(&M::POST, "/v1/agents"));
        assert!(is_allowed_write(&M::PATCH, &format!("/v1/projects/{id}")));
        assert!(is_allowed_write(&M::DELETE, &format!("/v1/agents/{id}")));
        assert!(!is_allowed_write(&M::GET, "/v1/orbit/policy"));
        assert!(!is_allowed_write(&M::DELETE, "/v1/projects"));
        assert!(!is_allowed_write(&M::PATCH, "/v1/projects/../account"));
        assert!(!is_allowed_write(&M::PUT, "/v1/connectors/stripe"));
        assert!(!is_allowed_write(&M::DELETE, "/v1/account"));
        assert!(!is_allowed_write(&M::POST, "/v1/devices/pair/approve"));
        assert!(!is_allowed_write(&M::POST, "/v1/billing/checkout"));
        assert!(!is_allowed_write(&M::PATCH, "/v1/projects/not-a-uuid"));
    }

    #[test]
    fn report_inputs() {
        assert!(report_format_ok("csv") && report_format_ok("pdf") && report_format_ok("json"));
        assert!(!report_format_ok("xlsx"));
        assert!(iso_ok("2026-11-18T12:00:00.000Z"));
        assert!(!iso_ok("yesterday"));
        assert!(!iso_ok("2026-11-18T12:00:00Z&format=x"));
        assert_eq!(
            filename_from_disposition(r#"attachment; filename="maindy-economia-2026-11-11_2026-11-18.csv""#).as_deref(),
            Some("maindy-economia-2026-11-11_2026-11-18.csv")
        );
        assert_eq!(filename_from_disposition(r#"attachment; filename="../../etc/passwd""#).as_deref(), Some("etcpasswd"));
        assert_eq!(filename_from_disposition("inline"), None);
    }

    #[test]
    fn query_sanitized() {
        let q = vec![
            ("from".to_string(), "2026-11-17T00:00:00Z".to_string()),
            ("token".to_string(), "x".to_string()),
            ("limit".to_string(), "x".repeat(100)),
        ];
        let s = sanitize_query(&q);
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].0, "from");
    }

    #[test]
    fn http_errors_map_to_ptbr() {
        let e = map_http_error(401, "");
        assert_eq!(e.code, "unauthorized");
        assert_eq!(e.status, Some(401));
        let e = map_http_error(400, r#"{"error":{"code":"expired_token","message":"Código expirado."}}"#);
        assert_eq!(e.code, "expired_token");
        assert_eq!(e.message, "Código expirado.");
        assert_eq!(map_http_error(503, "oops").code, "server");
        assert_eq!(map_http_error(429, "").code, "rate_limited");
    }
}
