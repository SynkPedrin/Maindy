//! Commands behind the functional sidebar pages: BYOK provider keys (Keychain → gateway memory),
//! gateway upstreams / integrations, report export, projects & agents CRUD, policy actions.
//! Secrets never cross the webview boundary in the Rust → JS direction.

use crate::api::{self, CmdError, CmdResult};
use crate::gateway::{self, Phase};
use crate::secrets;
use crate::settings::normalize_upstream_url;
use crate::state::AppState;
use crate::{events, session::DeviceSession};
use reqwest::Method;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt as _;
use tauri_plugin_opener::OpenerExt as _;

const GW_TIMEOUT: Duration = Duration::from_secs(5);
const GW_TEST_TIMEOUT: Duration = Duration::from_secs(25);

pub const TECHNIQUES: &[&str] = &[
    "exact_cache",
    "semantic_cache",
    "tool_output_compression",
    "context_dedup",
    "loop_guard",
    "retry_budget",
    "output_budget",
    "model_routing",
    "prompt_cache_hints",
];

fn require_session(state: &AppState) -> CmdResult<DeviceSession> {
    state.session().ok_or_else(|| CmdError::new("not_paired", "Conecte este computador à sua conta primeiro."))
}

fn check_id(id: &str) -> CmdResult<()> {
    if secrets::valid_upstream_id(id) {
        Ok(())
    } else {
        Err(CmdError::new("invalid_request", "Identificador de provedor inválido."))
    }
}

fn check_connector(kind: &str) -> CmdResult<()> {
    if api::CONNECTOR_KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(CmdError::new("invalid_request", "Integração desconhecida."))
    }
}

async fn put_connector(state: &AppState, kind: &str, status: &str, credential_ref: Option<Option<String>>) -> CmdResult<Value> {
    check_connector(kind)?;
    let sess = require_session(state)?;
    let mut body = json!({ "status": status });
    if let Some(r) = credential_ref {
        body["credentialRef"] = r.map(Value::String).unwrap_or(Value::Null);
    }
    api::send_authed(&state.http, &sess, Method::PUT, &format!("/v1/connectors/{kind}"), Some(&body)).await
}

/* ------------------------------ BYOK provider keys ------------------------------ */

/// Pushes base URL and/or Keychain key of one upstream into the gateway's memory.
async fn push_one(state: &AppState, id: &str) -> CmdResult<()> {
    let settings = state.settings.get();
    let mut body = Map::new();
    if let Some(u) = settings.upstream_base_urls.get(id) {
        body.insert("baseUrl".into(), Value::String(u.clone()));
    }
    if settings.provider_keys.iter().any(|x| x == id) {
        if let Some(k) = state.keys.get_or_load(id)? {
            body.insert("apiKey".into(), Value::String(k.expose().to_string()));
        }
    }
    if body.is_empty() {
        return Ok(());
    }
    let body = Value::Object(body);
    gateway::gw_call(&state.http, state.gateway.home(), Method::PUT, &format!("/maindy/upstreams/{id}"), Some(&body), GW_TIMEOUT)
        .await
        .map(|_| ())
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PushReport {
    pub pushed: Vec<String>,
    pub errors: Vec<String>,
}

/// Re-applies every saved base URL and Keychain key to the gateway (called on each gateway (re)start).
pub async fn push_all(app: &AppHandle) -> PushReport {
    let state = app.state::<AppState>();
    let s = state.settings.get();
    let mut ids: Vec<String> = s.upstream_base_urls.keys().cloned().collect();
    for k in &s.provider_keys {
        if !ids.contains(k) {
            ids.push(k.clone());
        }
    }
    let mut report = PushReport::default();
    for id in ids {
        match push_one(&state, &id).await {
            Ok(()) => report.pushed.push(id),
            Err(e) => {
                log::warn!("gateway upstream push failed: {id} ({})", e.code);
                report.errors.push(format!("{id}: {}", e.message));
            }
        }
    }
    report
}

#[tauri::command]
pub async fn gateway_resync(app: AppHandle) -> PushReport {
    push_all(&app).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderKeyView {
    pub id: String,
    pub stored: bool,
    pub pushed: bool,
    pub push_error: Option<String>,
    pub credential_ref: String,
}

/// Stores a BYOK key in the Keychain and hands it to the gateway. The key is accepted once and never
/// returned. `apiKey` is the only parameter carrying a secret in the whole command surface.
#[tauri::command]
pub async fn provider_key_save(app: AppHandle, state: State<'_, AppState>, id: String, api_key: String) -> CmdResult<ProviderKeyView> {
    check_id(&id)?;
    let key = secrets::validate_api_key(&api_key)?;
    drop(api_key);
    secrets::keychain_store(&id, &key)?;
    state.keys.put(&id, key);
    state.settings.update(|s| {
        s.set_provider_key(&id, true);
        Ok(())
    })?;
    let (pushed, push_error) = match push_one(&state, &id).await {
        Ok(()) => (true, None),
        Err(e) if e.code == "gateway_offline" => {
            (false, Some("Chave salva no Keychain. Ela será enviada ao gateway assim que ele iniciar.".to_string()))
        }
        Err(e) => (false, Some(e.message)),
    };
    events::refresh_all(&app);
    Ok(ProviderKeyView { id: id.clone(), stored: true, pushed, push_error, credential_ref: secrets::credential_ref(&id)? })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepsView {
    /// per step: ok | skipped | error
    pub keychain: String,
    pub gateway: String,
    pub api: String,
    pub messages: Vec<String>,
}

/// Removes the key from the Keychain, the gateway's memory and (when `connector` is given) marks the
/// connector as not connected in the control plane.
#[tauri::command]
pub async fn provider_key_delete(app: AppHandle, state: State<'_, AppState>, id: String, connector: Option<String>) -> CmdResult<StepsView> {
    check_id(&id)?;
    if let Some(c) = &connector {
        check_connector(c)?;
    }
    let mut messages = vec![];
    secrets::keychain_delete(&id)?;
    state.keys.forget(&id);
    state.settings.update(|s| {
        s.set_provider_key(&id, false);
        Ok(())
    })?;
    let gw = gateway::gw_call(
        &state.http,
        state.gateway.home(),
        Method::PUT,
        &format!("/maindy/upstreams/{id}"),
        Some(&json!({ "apiKey": null })),
        GW_TIMEOUT,
    )
    .await;
    let gateway = match gw {
        Ok(_) => "ok",
        Err(e) if e.code == "gateway_offline" => "skipped",
        Err(e) => {
            messages.push(e.message);
            "error"
        }
    };
    let api_step = match connector {
        Some(kind) => match put_connector(&state, &kind, "not_connected", Some(None)).await {
            Ok(_) => "ok",
            Err(e) => {
                messages.push(e.message);
                "error"
            }
        },
        None => "skipped",
    };
    events::refresh_all(&app);
    Ok(StepsView { keychain: "ok".into(), gateway: gateway.into(), api: api_step.into(), messages })
}

/* ------------------------------ gateway upstreams ------------------------------ */

#[tauri::command]
pub async fn gateway_upstreams(state: State<'_, AppState>) -> CmdResult<Value> {
    gateway::gw_call(&state.http, state.gateway.home(), Method::GET, "/maindy/upstreams", None, GW_TIMEOUT).await
}

/// Changes the base URL of an upstream (OpenAI-compatible servers). Persisted (non-secret) so it is
/// re-applied when the gateway restarts.
#[tauri::command]
pub async fn gateway_upstream_set_url(state: State<'_, AppState>, id: String, base_url: String) -> CmdResult<Value> {
    check_id(&id)?;
    let url = normalize_upstream_url(&base_url).map_err(|m| CmdError::new("invalid_url", m))?;
    let v = gateway::gw_call(
        &state.http,
        state.gateway.home(),
        Method::PUT,
        &format!("/maindy/upstreams/{id}"),
        Some(&json!({ "baseUrl": url })),
        GW_TIMEOUT,
    )
    .await?;
    state.settings.update(|s| {
        s.upstream_base_urls.insert(id.clone(), url.clone());
        Ok(())
    })?;
    Ok(v)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamTestView {
    pub result: Value,
    pub connector: Option<Value>,
    pub connector_error: Option<String>,
}

/// `POST /maindy/upstreams/:id/test`; on success marks the connector as connected (read-only) in the
/// control plane, with the Keychain reference when the key lives there.
#[tauri::command]
pub async fn gateway_upstream_test(app: AppHandle, state: State<'_, AppState>, id: String, connector: Option<String>) -> CmdResult<UpstreamTestView> {
    check_id(&id)?;
    if let Some(c) = &connector {
        check_connector(c)?;
    }
    let result = gateway::gw_call(
        &state.http,
        state.gateway.home(),
        Method::POST,
        &format!("/maindy/upstreams/{id}/test"),
        Some(&json!({})),
        GW_TEST_TIMEOUT,
    )
    .await?;
    let ok = result.get("ok").and_then(Value::as_bool).unwrap_or(false);
    let (mut connector_v, mut connector_error) = (None, None);
    if let (true, Some(kind)) = (ok, connector) {
        let has_key = state.settings.get().provider_keys.iter().any(|x| x == &id);
        let r = if has_key { Some(Some(secrets::credential_ref(&id)?)) } else { None };
        match put_connector(&state, &kind, "connected_read_only", r).await {
            Ok(v) => connector_v = Some(v),
            Err(e) => connector_error = Some(e.message),
        }
        events::refresh_all(&app);
    }
    Ok(UpstreamTestView { result, connector: connector_v, connector_error })
}

/* ------------------------------ probe request ------------------------------ */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeView {
    pub upstream_id: String,
    pub upstream_kind: String,
    pub model: String,
    pub endpoint: String,
    pub http_status: u16,
    pub latency_ms: u64,
    pub request_id: Option<String>,
    pub cache: Option<String>,
    /// tokens from the provider's own `usage` object in the response
    pub response_usage: Option<Value>,
    /// the RequestUsageEvent the gateway recorded for this request (usage + cost with provenance)
    pub event: Option<Value>,
    pub error: Option<String>,
}

fn norm_kind(k: &str) -> &'static str {
    match k {
        "openai" | "openai_api" => "openai",
        "anthropic" | "anthropic_api" => "anthropic",
        _ => "openai_compatible",
    }
}

/// Cheapest sensible model for a 1-token probe.
pub fn pick_probe_model(kind: &str, models: &[String]) -> Option<String> {
    let prefs: &[&str] = match kind {
        "openai" => &["gpt-4.1-nano", "gpt-4o-mini", "gpt-4.1-mini", "gpt-3.5-turbo", "gpt-4o"],
        "anthropic" => &["haiku", "sonnet"],
        _ => &[],
    };
    for p in prefs {
        let mut hits: Vec<&String> = models.iter().filter(|m| m.contains(p) && !m.contains("audio") && !m.contains("realtime")).collect();
        hits.sort_by_key(|m| m.len());
        if let Some(m) = hits.first() {
            return Some((*m).clone());
        }
    }
    if kind == "openai_compatible" {
        return models.iter().find(|m| !m.contains("embed")).cloned();
    }
    None
}

/// Sends a real 1-token request through the gateway to the first configured upstream and returns
/// what the gateway measured. Uses `x-maindy-no-cache` so it always reaches the provider.
#[tauri::command]
pub async fn gateway_probe(state: State<'_, AppState>, project: Option<String>, agent: Option<String>) -> CmdResult<ProbeView> {
    probe_core(&state.http, state.gateway.home(), project, agent).await
}

pub async fn probe_core(http: &reqwest::Client, home: &Path, project: Option<String>, agent: Option<String>) -> CmdResult<ProbeView> {
    let list = gateway::gw_call(http, home, Method::GET, "/maindy/upstreams", None, GW_TIMEOUT).await?;
    let ups: Vec<Value> = list.get("upstreams").and_then(Value::as_array).cloned().unwrap_or_default();
    let pick = ups
        .iter()
        .find(|u| u.get("hasCredential").and_then(Value::as_bool).unwrap_or(false))
        .or_else(|| ups.iter().find(|u| norm_kind(u.get("kind").and_then(Value::as_str).unwrap_or("")) == "openai_compatible"))
        .ok_or_else(|| CmdError::new("no_upstream", "Nenhum provedor configurado. Conecte uma chave ou um servidor compatível primeiro."))?;
    let id = pick.get("id").and_then(Value::as_str).unwrap_or("").to_string();
    check_id(&id)?;
    let kind = norm_kind(pick.get("kind").and_then(Value::as_str).unwrap_or("")).to_string();
    let test = gateway::gw_call(http, home, Method::POST, &format!("/maindy/upstreams/{id}/test"), Some(&json!({})), GW_TEST_TIMEOUT).await?;
    if !test.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        let msg = test
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("O provedor não respondeu ao teste de conexão.");
        return Err(CmdError::new("upstream_test_failed", format!("{id}: {msg}")));
    }
    let models: Vec<String> = test
        .get("models")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|m| m.as_str().map(str::to_string).or_else(|| m.get("id").and_then(Value::as_str).map(str::to_string))).collect())
        .unwrap_or_default();
    let model = pick_probe_model(&kind, &models)
        .ok_or_else(|| CmdError::new("no_model", format!("{id}: nenhum modelo disponível para o teste.")))?;
    let (endpoint, body) = if kind == "anthropic" {
        ("/v1/messages", json!({ "model": model, "max_tokens": 1, "messages": [{ "role": "user", "content": "ping" }] }))
    } else if kind == "openai" {
        ("/v1/chat/completions", json!({ "model": model, "max_completion_tokens": 1, "messages": [{ "role": "user", "content": "ping" }] }))
    } else {
        ("/v1/chat/completions", json!({ "model": model, "max_tokens": 1, "stream": false, "messages": [{ "role": "user", "content": "ping" }] }))
    };
    let clean = |v: Option<String>, d: &str| {
        v.map(|s| s.chars().filter(|c| c.is_ascii_alphanumeric() || "._:-".contains(*c)).take(120).collect::<String>())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| d.to_string())
    };
    let t0 = Instant::now();
    let resp = http
        .post(format!("{}{endpoint}", gateway::gateway_base()))
        .timeout(Duration::from_secs(60))
        .header("x-maindy-upstream", &id)
        .header("x-maindy-project", clean(project, "maindy-desktop"))
        .header("x-maindy-agent", clean(agent, "teste-de-conexao"))
        .header("x-maindy-no-cache", "1")
        .json(&body)
        .send()
        .await
        .map_err(|_| CmdError::new("gateway_offline", "O gateway local não está respondendo."))?;
    let latency_ms = t0.elapsed().as_millis() as u64;
    let http_status = resp.status().as_u16();
    let hdr = |k: &str| resp.headers().get(k).and_then(|v| v.to_str().ok()).map(str::to_string);
    let request_id = hdr("x-maindy-request-id");
    let cache = hdr("x-maindy-cache");
    let v: Value = resp.json().await.unwrap_or(Value::Null);
    let response_usage = v.get("usage").cloned();
    let error = if (200..300).contains(&http_status) {
        None
    } else {
        Some(v.pointer("/error/message").and_then(Value::as_str).unwrap_or("O provedor recusou a requisição de teste.").to_string())
    };
    // The gateway records the event right after the response; give it a moment.
    let mut event = None;
    if let Some(rid) = &request_id {
        for _ in 0..4 {
            tokio::time::sleep(Duration::from_millis(250)).await;
            if let Ok(list) = gateway::gw_call(http, home, Method::GET, "/maindy/events?limit=25", None, GW_TIMEOUT).await {
                event = list
                    .get("events")
                    .and_then(Value::as_array)
                    .and_then(|a| a.iter().find(|e| e.get("eventId").and_then(Value::as_str) == Some(rid.as_str())))
                    .cloned();
            }
            if event.is_some() {
                break;
            }
        }
    }
    Ok(ProbeView {
        upstream_id: id,
        upstream_kind: kind,
        model,
        endpoint: endpoint.into(),
        http_status,
        latency_ms,
        request_id,
        cache,
        response_usage,
        event,
        error,
    })
}

/* ------------------------------ tool integrations ------------------------------ */

#[tauri::command]
pub async fn integrations_get(state: State<'_, AppState>) -> CmdResult<Value> {
    gateway::gw_call(&state.http, state.gateway.home(), Method::GET, "/maindy/integrations", None, GW_TIMEOUT).await
}

/// Masks values of lines that look like secrets (`"ANTHROPIC_API_KEY": "…"`, `token = "…"`).
pub fn redact_line(line: &str) -> String {
    let lower = line.to_ascii_lowercase();
    let secretish = ["key", "token", "secret", "password", "authorization", "bearer", "cookie"].iter().any(|w| lower.contains(w));
    if !secretish {
        return line.to_string();
    }
    // JSON `"name": value` or TOML `name = value`
    let sep = line.find("\":").map(|i| i + 2).or_else(|| line.find(" = ").map(|i| i + 3)).or_else(|| line.find('=').map(|i| i + 1));
    match sep {
        Some(i) if i < line.len() => {
            let tail = line[i..].trim();
            if tail.starts_with('{') || tail.starts_with('[') || tail.is_empty() {
                line.to_string()
            } else {
                let comma = if tail.ends_with(',') { "," } else { "" };
                format!("{} \"•••\"{comma}", line[..i].trim_end())
            }
        }
        _ => line.to_string(),
    }
}

/// Line diff (LCS) with 3 lines of context, values that look like secrets masked on both sides.
pub fn line_diff(path: &str, before: &str, after: &str) -> String {
    let a: Vec<String> = before.lines().map(redact_line).collect();
    let b: Vec<String> = after.lines().map(redact_line).collect();
    let (n, m) = (a.len(), b.len());
    if n * m > 4_000_000 {
        return format!("--- {path}\n+++ {path} (maindy.)\n@@ arquivo grande demais para a prévia linha a linha @@");
    }
    let mut lcs = vec![vec![0u32; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            lcs[i][j] = if a[i] == b[j] { lcs[i + 1][j + 1] + 1 } else { lcs[i + 1][j].max(lcs[i][j + 1]) };
        }
    }
    // ops: (tag, text) with tag ' ' | '-' | '+'
    let mut ops: Vec<(char, &str)> = vec![];
    let (mut i, mut j) = (0, 0);
    while i < n || j < m {
        if i < n && j < m && a[i] == b[j] {
            ops.push((' ', &a[i]));
            i += 1;
            j += 1;
        } else if j < m && (i == n || lcs[i][j + 1] >= lcs[i + 1][j]) {
            ops.push(('+', &b[j]));
            j += 1;
        } else {
            ops.push(('-', &a[i]));
            i += 1;
        }
    }
    let changed: Vec<usize> = ops.iter().enumerate().filter(|(_, o)| o.0 != ' ').map(|(k, _)| k).collect();
    let mut out = vec![format!("--- {path}"), format!("+++ {path} (maindy.)")];
    if changed.is_empty() {
        out.push("@@ nenhuma mudança @@".into());
        return out.join("\n");
    }
    let near = |k: usize| changed.iter().any(|&c| k + 3 >= c && k <= c + 3);
    let mut gap = false;
    for (k, (tag, text)) in ops.iter().enumerate() {
        if *tag != ' ' || near(k) {
            if gap {
                out.push("@@ … @@".into());
                gap = false;
            }
            out.push(format!("{tag} {text}"));
        } else {
            gap = true;
        }
    }
    out.join("\n")
}

/// Turns the gateway's dry-run `preview` (full resulting file) into a redacted diff against the file on disk.
pub async fn preview_as_diff(http: &reqwest::Client, home: &Path, tool: &str, v: &mut Value) {
    let Some(after) = v.get("preview").and_then(Value::as_str).map(str::to_string) else { return };
    let info = gateway::gw_call(http, home, Method::GET, "/maindy/integrations", None, GW_TIMEOUT).await.ok();
    let ptr = if tool == "claude-code" { "/claudeCode/settingsPath" } else { "/codex/configPath" };
    let path = info.as_ref().and_then(|i| i.pointer(ptr)).and_then(Value::as_str).map(str::to_string);
    let Some(path) = path else {
        v["preview"] = Value::String(after.lines().map(redact_line).collect::<Vec<_>>().join("\n"));
        return;
    };
    let before = std::fs::metadata(&path)
        .ok()
        .filter(|m| m.len() < 2 * 1024 * 1024)
        .and_then(|_| std::fs::read_to_string(&path).ok())
        .unwrap_or_default();
    // JSON (Claude Code settings): compare canonical pretty forms so formatting alone never shows as a change.
    let (before, after) = if path.ends_with(".json") {
        let pretty = |t: &str| serde_json::from_str::<Value>(t).ok().and_then(|v| serde_json::to_string_pretty(&v).ok());
        (pretty(&before).unwrap_or(before), pretty(&after).unwrap_or(after))
    } else {
        (before, after)
    };
    let shown = path.replace(&std::env::var("HOME").unwrap_or_else(|_| "\u{0}".into()), "~");
    v["preview"] = Value::String(if after.is_empty() { format!("--- {shown}\n@@ nenhuma mudança @@") } else { line_diff(&shown, &before, &after) });
}

/// Installs/uninstalls the Claude Code / Codex config through the gateway. `dryRun` returns the preview
/// as a diff (secrets masked) — nothing is written until the confirmed call.
#[tauri::command]
pub async fn integration_apply(
    app: AppHandle,
    state: State<'_, AppState>,
    tool: String,
    action: String,
    dry_run: bool,
    force_statusline: Option<bool>,
) -> CmdResult<Value> {
    if !gateway::INTEGRATION_TOOLS.contains(&tool.as_str()) || !matches!(action.as_str(), "install" | "uninstall") {
        return Err(CmdError::new("invalid_request", "Integração ou ação inválida."));
    }
    let mut v = gateway::gw_call(
        &state.http,
        state.gateway.home(),
        Method::POST,
        &format!("/maindy/integrations/{tool}/{action}"),
        Some(&if tool == "claude-code" && force_statusline == Some(true) {
            json!({ "dryRun": dry_run, "forceStatusline": true })
        } else {
            json!({ "dryRun": dry_run })
        }),
        Duration::from_secs(15),
    )
    .await?;
    if dry_run {
        preview_as_diff(&state.http, state.gateway.home(), &tool, &mut v).await;
    } else {
        events::refresh_all(&app);
    }
    Ok(v)
}

/* ------------------------------ reports ------------------------------ */

const PREVIEW_EVENTS: usize = 12;

/// JSON report for the preview: totals + a small audit-trail sample (the full list stays server side).
#[tauri::command]
pub async fn report_preview(state: State<'_, AppState>, from: String, to: String) -> CmdResult<Value> {
    let sess = require_session(&state)?;
    let (bytes, _) = api::get_report(&state.http, &sess, &from, &to, "json").await?;
    let mut v: Value = serde_json::from_slice(&bytes).map_err(|_| CmdError::new("invalid_response", "Relatório em formato inesperado."))?;
    if let Some(obj) = v.as_object_mut() {
        let events = obj.remove("events").and_then(|e| e.as_array().cloned()).unwrap_or_default();
        obj.insert("eventsTotal".into(), json!(events.len()));
        obj.insert("events".into(), Value::Array(events.into_iter().rev().take(PREVIEW_EVENTS).collect()));
    }
    Ok(v)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportView {
    pub cancelled: bool,
    pub path: Option<String>,
    pub file_name: Option<String>,
    pub bytes: usize,
}

/// `name`, `name (2)`, `name (3)`… — never overwrites an existing download.
pub fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let p = dir.join(file_name);
    if !p.exists() {
        return p;
    }
    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((s, e)) => (s.to_string(), format!(".{e}")),
        None => (file_name.to_string(), String::new()),
    };
    (2..1000).map(|i| dir.join(format!("{stem} ({i}){ext}"))).find(|p| !p.exists()).unwrap_or(p)
}

/// Downloads the CSV/PDF with the device token (Rust only) and saves it via the native save dialog
/// (`ask = true`) or straight to the Downloads folder.
#[tauri::command]
pub async fn report_export(app: AppHandle, state: State<'_, AppState>, from: String, to: String, format: String, ask: bool) -> CmdResult<ExportView> {
    if format != "csv" && format != "pdf" {
        return Err(CmdError::new("invalid_request", "Formato inválido."));
    }
    let sess = require_session(&state)?;
    let (bytes, name) = api::get_report(&state.http, &sess, &from, &to, &format).await?;
    let file_name = name.unwrap_or_else(|| format!("maindy-economia-{}_{}.{format}", &from[..10], &to[..10]));
    let downloads = app.path().download_dir().ok().or_else(|| app.path().home_dir().ok());
    let target: PathBuf = if ask {
        let mut dlg = app.dialog().file().set_title("Salvar relatório da maindy.").set_file_name(&file_name).add_filter(
            if format == "csv" { "CSV" } else { "PDF" },
            &[format.as_str()],
        );
        if let Some(d) = &downloads {
            dlg = dlg.set_directory(d);
        }
        match dlg.blocking_save_file() {
            None => return Ok(ExportView { cancelled: true, path: None, file_name: Some(file_name), bytes: 0 }),
            Some(fp) => fp.into_path().map_err(|_| CmdError::new("invalid_path", "Local de destino inválido."))?,
        }
    } else {
        let dir = downloads.ok_or_else(|| CmdError::new("no_downloads", "Pasta Downloads não encontrada."))?;
        unique_path(&dir, &file_name)
    };
    std::fs::write(&target, &bytes).map_err(|e| CmdError::new("write_failed", format!("Não foi possível salvar o arquivo: {e}")))?;
    state.exported.lock().unwrap().push(target.clone());
    Ok(ExportView { cancelled: false, path: Some(target.display().to_string()), file_name: Some(file_name), bytes: bytes.len() })
}

/// Reveals a file this app exported in Finder/Explorer (any other path is refused).
#[tauri::command]
pub fn reveal_path(app: AppHandle, state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let p = PathBuf::from(&path);
    if !state.exported.lock().unwrap().iter().any(|x| x == &p) {
        return Err(CmdError::new("not_allowed", "Só arquivos exportados por este app podem ser mostrados."));
    }
    app.opener()
        .reveal_item_in_dir(&p)
        .map_err(|e| CmdError::new("opener", format!("Não foi possível mostrar o arquivo: {e}")))
}

/* ------------------------------ projects & agents ------------------------------ */

fn entity_path(entity: &str, id: Option<&str>) -> CmdResult<String> {
    if entity != "projects" && entity != "agents" {
        return Err(CmdError::new("invalid_request", "Tipo inválido."));
    }
    match id {
        Some(i) if api::is_uuid(i) => Ok(format!("/v1/{entity}/{i}")),
        Some(_) => Err(CmdError::new("invalid_request", "Identificador inválido.")),
        None => Ok(format!("/v1/{entity}")),
    }
}

/// Only the documented body fields are forwarded (key, name, description, projectId).
pub fn entity_body(body: &Value, create: bool) -> CmdResult<Value> {
    let o = body.as_object().ok_or_else(|| CmdError::new("invalid_request", "Dados inválidos."))?;
    let mut out = Map::new();
    for k in ["name", "description", "projectId"] {
        if let Some(v) = o.get(k) {
            out.insert(k.into(), v.clone());
        }
    }
    if create {
        let key = o.get("key").and_then(Value::as_str).unwrap_or("").trim().to_string();
        if key.is_empty() {
            return Err(CmdError::new("validation_error", "Informe a chave (valor do header)."));
        }
        out.insert("key".into(), Value::String(key));
    }
    Ok(Value::Object(out))
}

#[tauri::command]
pub async fn entity_create(state: State<'_, AppState>, entity: String, body: Value) -> CmdResult<Value> {
    let sess = require_session(&state)?;
    let b = entity_body(&body, true)?;
    api::send_authed(&state.http, &sess, Method::POST, &entity_path(&entity, None)?, Some(&b)).await
}

#[tauri::command]
pub async fn entity_update(state: State<'_, AppState>, entity: String, id: String, body: Value) -> CmdResult<Value> {
    let sess = require_session(&state)?;
    let b = entity_body(&body, false)?;
    api::send_authed(&state.http, &sess, Method::PATCH, &entity_path(&entity, Some(&id))?, Some(&b)).await
}

#[tauri::command]
pub async fn entity_delete(state: State<'_, AppState>, entity: String, id: String) -> CmdResult<Value> {
    let sess = require_session(&state)?;
    api::send_authed(&state.http, &sess, Method::DELETE, &entity_path(&entity, Some(&id))?, None).await
}

/* ------------------------------ ORBIT policy ------------------------------ */

/// Keeps only the fields of `PUT /v1/orbit/policy` (techniques reduced to {name, enabled}).
pub fn policy_patch(p: &Value) -> CmdResult<Value> {
    let o = p.as_object().ok_or_else(|| CmdError::new("invalid_request", "Política inválida."))?;
    let mut out = Map::new();
    if let Some(m) = o.get("mode").and_then(Value::as_str) {
        if !matches!(m, "observe" | "conservative" | "balanced" | "maximum") {
            return Err(CmdError::new("invalid_request", "Modo inválido."));
        }
        out.insert("mode".into(), json!(m));
    }
    if let Some(ts) = o.get("techniques").and_then(Value::as_array) {
        let mut list = vec![];
        for t in ts {
            let name = t.get("name").and_then(Value::as_str).unwrap_or("");
            let enabled = t.get("enabled").and_then(Value::as_bool);
            match (TECHNIQUES.contains(&name), enabled) {
                (true, Some(e)) => list.push(json!({ "name": name, "enabled": e })),
                _ => return Err(CmdError::new("invalid_request", "Técnica inválida.")),
            }
        }
        out.insert("techniques".into(), Value::Array(list));
    }
    for k in ["qualitySampleRate", "maxAddedLatencyMs", "cacheTtlSeconds", "expectedVersion"] {
        if let Some(v) = o.get(k).filter(|v| v.is_number()) {
            out.insert(k.into(), v.clone());
        }
    }
    if out.is_empty() {
        return Err(CmdError::new("invalid_request", "Nada para alterar."));
    }
    Ok(Value::Object(out))
}

/// Manual rollback of one technique (`POST /v1/orbit/rollback`).
#[tauri::command]
pub async fn orbit_rollback(app: AppHandle, state: State<'_, AppState>, technique: String, reason: String) -> CmdResult<Value> {
    if !TECHNIQUES.contains(&technique.as_str()) {
        return Err(CmdError::new("invalid_request", "Técnica inválida."));
    }
    let reason: String = reason.trim().chars().take(300).collect();
    if reason.is_empty() {
        return Err(CmdError::new("validation_error", "Informe o motivo da reversão."));
    }
    let sess = require_session(&state)?;
    let v = api::send_authed(&state.http, &sess, Method::POST, "/v1/orbit/rollback", Some(&json!({ "technique": technique, "reason": reason }))).await?;
    events::refresh_all(&app);
    Ok(v)
}

/// Re-enables a technique that the Quality Guard (or a person) rolled back: `PUT /v1/orbit/policy` with
/// only that entry (the API applies only changed entries), then clears the gateway's local rollback.
#[tauri::command]
pub async fn orbit_reactivate(app: AppHandle, state: State<'_, AppState>, technique: String) -> CmdResult<Value> {
    if !TECHNIQUES.contains(&technique.as_str()) {
        return Err(CmdError::new("invalid_request", "Técnica inválida."));
    }
    let sess = require_session(&state)?;
    let body = json!({ "techniques": [{ "name": technique, "enabled": true }] });
    let v = api::send_authed(&state.http, &sess, Method::PUT, "/v1/orbit/policy", Some(&body)).await?;
    if state.gateway.view().healthy {
        if let Err(e) = gateway::gw_call(
            &state.http,
            state.gateway.home(),
            Method::POST,
            "/maindy/rollbacks/reset",
            Some(&json!({ "technique": technique })),
            GW_TIMEOUT,
        )
        .await
        {
            log::warn!("gateway rollback reset failed ({})", e.code);
        }
    }
    events::refresh_all(&app);
    Ok(v)
}

/// Called by the supervisor after each tick: re-push keys/base URLs to a freshly (re)started gateway.
pub fn after_tick(app: &AppHandle) {
    let st = app.state::<AppState>();
    if st.gateway.take_push_pending() && st.gateway.view().phase == Phase::Running {
        let h = app.clone();
        tauri::async_runtime::spawn(async move {
            let r = push_all(&h).await;
            if !r.pushed.is_empty() || !r.errors.is_empty() {
                log::info!("gateway upstreams re-pushed: {} ok, {} errors", r.pushed.len(), r.errors.len());
                events::refresh_all(&h);
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_model_choice() {
        let m = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(pick_probe_model("openai", &m(&["gpt-4o", "gpt-4o-mini-audio", "gpt-4o-mini"])).as_deref(), Some("gpt-4o-mini"));
        assert_eq!(pick_probe_model("anthropic", &m(&["claude-sonnet-4-5", "claude-haiku-4-5"])).as_deref(), Some("claude-haiku-4-5"));
        assert_eq!(pick_probe_model("openai_compatible", &m(&["nomic-embed-text", "qwen3.5:4b"])).as_deref(), Some("qwen3.5:4b"));
        assert_eq!(pick_probe_model("openai", &m(&["dall-e-3"])), None);
    }

    #[test]
    fn policy_patch_filters() {
        let p = policy_patch(&json!({
            "mode": "balanced", "paused": true, "version": 3, "expectedVersion": 3,
            "techniques": [{ "name": "exact_cache", "enabled": true, "rolledBack": false }]
        }))
        .unwrap();
        assert_eq!(p, json!({ "mode": "balanced", "expectedVersion": 3, "techniques": [{ "name": "exact_cache", "enabled": true }] }));
        assert!(policy_patch(&json!({ "mode": "turbo" })).is_err());
        assert!(policy_patch(&json!({ "techniques": [{ "name": "rm_rf", "enabled": true }] })).is_err());
        assert!(policy_patch(&json!({ "paused": true })).is_err());
    }

    #[test]
    fn entity_bodies_and_paths() {
        assert!(entity_body(&json!({ "name": "x" }), true).is_err());
        let b = entity_body(&json!({ "key": " api ", "name": "API", "organizationId": "evil" }), true).unwrap();
        assert_eq!(b, json!({ "key": "api", "name": "API" }));
        assert_eq!(entity_path("projects", None).unwrap(), "/v1/projects");
        assert!(entity_path("devices", None).is_err());
        assert!(entity_path("agents", Some("../x")).is_err());
    }

    #[test]
    fn diff_and_redaction() {
        assert_eq!(redact_line(r#"    "ANTHROPIC_API_KEY": "sk-ant-xyz","#), r#"    "ANTHROPIC_API_KEY": "•••","#);
        assert_eq!(redact_line(r#"bearer_token = "abc""#), r#"bearer_token = "•••""#);
        assert_eq!(redact_line(r#"  "env": {"#), r#"  "env": {"#);
        assert_eq!(redact_line(r#""model": "opus""#), r#""model": "opus""#);
        let before = "{\n  \"model\": \"opus\",\n  \"env\": {\n    \"API_TOKEN\": \"secret-1\"\n  }\n}";
        let after = "{\n  \"model\": \"opus\",\n  \"env\": {\n    \"API_TOKEN\": \"secret-1\",\n    \"OTEL_LOGS_EXPORTER\": \"otlp\"\n  }\n}";
        let d = line_diff("~/.claude/settings.json", before, after);
        assert!(d.contains("+     \"OTEL_LOGS_EXPORTER\": \"otlp\""), "{d}");
        assert!(!d.contains("secret-1"), "{d}");
        assert!(d.starts_with("--- ~/.claude/settings.json"));
        assert!(line_diff("x", "a\nb", "a\nb").contains("nenhuma mudança"));
    }

    #[test]
    fn unique_download_names() {
        let dir = std::env::temp_dir().join(format!("maindy-dl-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = unique_path(&dir, "r.csv");
        assert_eq!(a, dir.join("r.csv"));
        std::fs::write(&a, "x").unwrap();
        assert_eq!(unique_path(&dir, "r.csv"), dir.join("r (2).csv"));
        let _ = std::fs::remove_dir_all(dir);
    }

    /// End-to-end against a real gateway bundle (apps/gateway/dist/maindy-gateway.mjs) started with an
    /// isolated HOME/MAINDY_HOME and MAINDY_GATEWAY_PORT. Run:
    ///   MAINDY_E2E_HOME=<gwhome> MAINDY_GATEWAY_PORT=8797 cargo test e2e_gateway -- --ignored --nocapture
    #[test]
    #[ignore]
    fn e2e_gateway() {
        let home = PathBuf::from(std::env::var("MAINDY_E2E_HOME").expect("MAINDY_E2E_HOME"));
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let http = crate::api::build_client();
        rt.block_on(async {
            let t = Duration::from_secs(20);
            let call = |m: Method, p: &'static str, b: Option<Value>| {
                let (http, home) = (http.clone(), home.clone());
                async move { gateway::gw_call(&http, &home, m, p, b.as_ref(), t).await }
            };
            let ups = call(Method::GET, "/maindy/upstreams", None).await.expect("upstreams");
            println!("upstreams: {ups}");
            assert!(ups["upstreams"].as_array().unwrap().iter().any(|u| u["id"] == "openai"));

            let fake = "sk-test-FAKE-e2e-0123456789";
            let v = call(Method::PUT, "/maindy/upstreams/openai", Some(json!({ "apiKey": fake }))).await.expect("put key");
            assert_eq!(v["hasCredential"], true);
            assert_eq!(v["credentialSource"], "memory");
            let tst = call(Method::POST, "/maindy/upstreams/openai/test", Some(json!({}))).await.expect("test openai");
            println!("openai test with fake key: ok={} error={}", tst["ok"], tst["error"]);
            assert_eq!(tst["ok"], false);
            let v = call(Method::PUT, "/maindy/upstreams/openai", Some(json!({ "apiKey": null }))).await.expect("clear key");
            assert_eq!(v["hasCredential"], false);

            let ol = call(Method::POST, "/maindy/upstreams/ollama/test", Some(json!({}))).await.expect("test ollama");
            println!("ollama test: {ol}");
            assert_eq!(ol["ok"], true);

            let p = probe_core(&http, &home, Some("e2e-proj".into()), Some("e2e-agent".into())).await.expect("probe");
            println!(
                "probe: upstream={} model={} http={} latency={}ms event_usage={}",
                p.upstream_id,
                p.model,
                p.http_status,
                p.latency_ms,
                p.event.as_ref().map(|e| e["usage"].to_string()).unwrap_or_default()
            );
            assert_eq!(p.http_status, 200);
            let ev = p.event.expect("gateway recorded the probe event");
            assert_eq!(ev["projectKey"], "e2e-proj");
            assert_eq!(ev["agentKey"], "e2e-agent");

            let integ = call(Method::GET, "/maindy/integrations", None).await.expect("integrations");
            println!("integrations: {integ}");
            assert_eq!(integ["claudeCode"]["detected"], true);
            assert_eq!(integ["claudeCode"]["installed"], false);

            let mut dry = call(Method::POST, "/maindy/integrations/claude-code/install", Some(json!({ "dryRun": true }))).await.expect("dry run");
            preview_as_diff(&http, &home, "claude-code", &mut dry).await;
            let diff = dry["preview"].as_str().unwrap().to_string();
            println!("dry-run diff:\n{diff}\nbackup: {}", dry["backupPath"]);
            assert!(!diff.contains("sk-ant-FAKE"), "secret leaked into preview");
            assert!(diff.lines().any(|l| l.starts_with("+ ")));
            let after_dry = call(Method::GET, "/maindy/integrations", None).await.unwrap();
            assert_eq!(after_dry["claudeCode"]["installed"], false, "dry run must not write");

            let inst = call(Method::POST, "/maindy/integrations/claude-code/install", Some(json!({ "dryRun": false }))).await.expect("install");
            println!("install: changed={} backup={}", inst["changed"], inst["backupPath"]);
            let st = call(Method::GET, "/maindy/integrations", None).await.unwrap();
            assert_eq!(st["claudeCode"]["otel"], true);
            assert_eq!(st["claudeCode"]["hook"], true);
            let un = call(Method::POST, "/maindy/integrations/claude-code/uninstall", Some(json!({ "dryRun": false }))).await.expect("uninstall");
            println!("uninstall: changed={}", un["changed"]);
            let st = call(Method::GET, "/maindy/integrations", None).await.unwrap();
            assert_eq!(st["claudeCode"]["installed"], false);

            // routes outside the allowlist never leave the process
            let e = gateway::gw_call(&http, &home, Method::PUT, "/maindy/policy", Some(&json!({})), t).await.unwrap_err();
            assert_eq!(e.code, "not_allowed");
        });
        let log = std::fs::read_to_string(home.join("gateway.log")).unwrap_or_default();
        assert!(!log.contains("sk-test-FAKE"), "gateway log contains the key");
    }
}
