//! Tauri commands exposed to the webview. Secrets never cross this boundary.

use crate::api::{self, CmdError, CmdResult};
use crate::gateway::{self, GatewayView};
use crate::session::{self, DeviceSession};
use crate::settings::{Settings, SettingsPatch};
use crate::state::{AppState, PendingPairing};
use crate::{events, launcher};
use serde::Serialize;
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_opener::OpenerExt as _;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub platform: &'static str,
    pub arch: &'static str,
    pub version: &'static str,
    pub reduce_motion: bool,
    pub settings: Settings,
    pub paired: bool,
    pub session_revoked: bool,
    pub keychain_error: Option<String>,
    pub device_id: Option<String>,
    pub organization_id: Option<String>,
    pub paired_api_url: Option<String>,
    pub gateway: GatewayView,
    pub autostart: bool,
    pub launcher: launcher::LauncherInfo,
    pub maindy_home: String,
    /// e.g. http://127.0.0.1:8787 (port overridable with MAINDY_GATEWAY_PORT for QA)
    pub gateway_url: String,
}

#[tauri::command]
pub fn bootstrap(app: AppHandle, state: State<'_, AppState>) -> Bootstrap {
    let s = state.session();
    Bootstrap {
        platform: api::platform(),
        arch: api::arch(),
        version: env!("CARGO_PKG_VERSION"),
        reduce_motion: launcher::reduce_motion(),
        settings: state.settings.get(),
        paired: s.is_some(),
        session_revoked: *state.session_revoked.lock().unwrap(),
        keychain_error: state.keychain_error.lock().unwrap().clone(),
        device_id: s.as_ref().map(|x| x.device_id.clone()),
        organization_id: s.as_ref().map(|x| x.organization_id.clone()),
        paired_api_url: s.as_ref().map(|x| x.api_url.clone()),
        gateway: state.gateway.view(),
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        launcher: launcher::info(&app),
        maindy_home: state.gateway.home().display().to_string(),
        gateway_url: gateway::gateway_base(),
    }
}

/* ------------------------------- pairing ------------------------------- */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairStartView {
    pub user_code: String,
    pub verification_url: String,
    pub verification_url_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

fn is_http_url(u: &str) -> bool {
    reqwest::Url::parse(u).map(|x| matches!(x.scheme(), "http" | "https")).unwrap_or(false)
}

#[tauri::command]
pub async fn pair_start(state: State<'_, AppState>) -> CmdResult<PairStartView> {
    let base = state.settings.get().api_url;
    let device_name = gethostname::gethostname().to_string_lossy().trim_end_matches(".local").to_string();
    let device_name = if device_name.is_empty() { "Computador".to_string() } else { device_name };
    let body = json!({
        "deviceName": device_name.chars().take(120).collect::<String>(),
        "platform": api::platform(),
        "arch": api::arch(),
        "appVersion": env!("CARGO_PKG_VERSION"),
    });
    let v = api::post_public(&state.http, &base, "/v1/devices/pair/start", &body).await?;
    let get_s = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
    let get_n = |k: &str| v.get(k).and_then(Value::as_u64);
    let (Some(device_code), Some(user_code), Some(url), Some(url_c)) = (
        get_s("deviceCode"),
        get_s("userCode"),
        get_s("verificationUrl"),
        get_s("verificationUrlComplete"),
    ) else {
        return Err(CmdError::new("invalid_response", "Resposta de pareamento inválida."));
    };
    if !is_http_url(&url) || !is_http_url(&url_c) {
        return Err(CmdError::new("invalid_response", "URL de verificação inválida."));
    }
    let expires_in = get_n("expiresIn").unwrap_or(600);
    let interval = get_n("interval").unwrap_or(3).clamp(1, 60);
    *state.pairing.lock().unwrap() = Some(PendingPairing {
        device_code,
        api_url: base,
        interval_secs: interval,
        expires_at: Instant::now() + Duration::from_secs(expires_in),
        last_poll: None,
    });
    Ok(PairStartView { user_code, verification_url: url, verification_url_complete: url_c, expires_in, interval })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairPollView {
    /// pending | approved | denied | expired
    pub status: String,
    pub interval: u64,
}

#[tauri::command]
pub async fn pair_poll(app: AppHandle, state: State<'_, AppState>) -> CmdResult<PairPollView> {
    let (code, base, interval) = {
        let mut g = state.pairing.lock().unwrap();
        let Some(p) = g.as_mut() else {
            return Err(CmdError::new("not_started", "Nenhum pareamento em andamento."));
        };
        if Instant::now() >= p.expires_at {
            *g = None;
            return Ok(PairPollView { status: "expired".into(), interval: 0 });
        }
        if let Some(t) = p.last_poll {
            if t.elapsed() < Duration::from_secs(p.interval_secs) {
                return Ok(PairPollView { status: "pending".into(), interval: p.interval_secs });
            }
        }
        p.last_poll = Some(Instant::now());
        (p.device_code.clone(), p.api_url.clone(), p.interval_secs)
    };
    let res = api::post_public(&state.http, &base, "/v1/devices/pair/poll", &json!({ "deviceCode": code })).await;
    let v = match res {
        Ok(v) => v,
        Err(e) if e.code == "slow_down" || e.code == "rate_limited" => {
            let mut g = state.pairing.lock().unwrap();
            let next = if let Some(p) = g.as_mut() {
                p.interval_secs = (p.interval_secs + 5).min(60);
                p.interval_secs
            } else {
                interval
            };
            return Ok(PairPollView { status: "pending".into(), interval: next });
        }
        Err(e) if e.code == "expired_token" || e.code == "expired" => {
            *state.pairing.lock().unwrap() = None;
            return Ok(PairPollView { status: "expired".into(), interval: 0 });
        }
        Err(e) => return Err(e),
    };
    let status = v.get("status").and_then(Value::as_str).unwrap_or("").to_string();
    match status.as_str() {
        "pending" => Ok(PairPollView { status, interval }),
        "denied" | "expired" => {
            *state.pairing.lock().unwrap() = None;
            Ok(PairPollView { status, interval: 0 })
        }
        "approved" => {
            let get = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
            let (Some(token), Some(device_id), Some(org)) = (get("deviceToken"), get("deviceId"), get("organizationId"))
            else {
                return Err(CmdError::new("invalid_response", "Resposta de aprovação incompleta."));
            };
            let sess = DeviceSession { api_url: base, device_id: device_id.clone(), organization_id: org.clone(), token };
            session::keychain_store(&sess).map_err(|m| CmdError::new("keychain", m))?;
            let settings = state.settings.update(|s| {
                s.device_id = Some(device_id);
                s.organization_id = Some(org);
                Ok(())
            })?;
            if settings.gateway_local {
                if let Err(e) = session::write_device_json(state.gateway.home(), &sess) {
                    log::warn!("device.json: {e}");
                }
            }
            *state.session.lock().unwrap() = Some(sess);
            *state.session_revoked.lock().unwrap() = false;
            *state.keychain_error.lock().unwrap() = None;
            *state.pairing.lock().unwrap() = None;
            events::notify(&app, "Dispositivo conectado", "Este computador agora está ligado à sua conta maindy.");
            events::refresh_all(&app);
            Ok(PairPollView { status, interval: 0 })
        }
        _ => Err(CmdError::new("invalid_response", "Status de pareamento desconhecido.")),
    }
}

#[tauri::command]
pub fn pair_cancel(state: State<'_, AppState>) {
    *state.pairing.lock().unwrap() = None;
}

/// "Sair": forget the device locally — delete the Keychain/Credential Manager item and device.json.
/// (The server-side token can also be revoked from the web dashboard → Dispositivos.)
#[tauri::command]
pub fn sign_out(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    session::keychain_delete().map_err(|m| CmdError::new("keychain", m))?;
    session::remove_device_json(state.gateway.home())?;
    *state.session.lock().unwrap() = None;
    *state.session_revoked.lock().unwrap() = false;
    *state.orbit_paused.lock().unwrap() = None;
    state.settings.update(|s| {
        s.device_id = None;
        s.organization_id = None;
        Ok(())
    })?;
    events::refresh_all(&app);
    Ok(())
}

/* ------------------------------- API reads ------------------------------- */

fn require_session(state: &AppState) -> CmdResult<DeviceSession> {
    state.session().ok_or_else(|| CmdError::new("not_paired", "Conecte este computador à sua conta primeiro."))
}

#[tauri::command]
pub async fn api_get(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    query: Option<Vec<(String, String)>>,
) -> CmdResult<Value> {
    if !api::is_allowed_read(&path) {
        return Err(CmdError::new("not_allowed", "Rota não permitida pelo app desktop."));
    }
    let sess = require_session(&state)?;
    let q = api::sanitize_query(&query.unwrap_or_default());
    let res = api::get_authed(&state.http, &sess, &path, &q).await;
    match &res {
        Err(e) if path == "/v1/me" && e.status == Some(401) => {
            let changed = !std::mem::replace(&mut *state.session_revoked.lock().unwrap(), true);
            if changed {
                events::refresh_all(&app);
            }
        }
        Ok(_) if path == "/v1/me" => {
            *state.session_revoked.lock().unwrap() = false;
        }
        Ok(v) if path == "/v1/orbit/policy" => {
            if let Some(p) = v.get("paused").and_then(Value::as_bool) {
                set_orbit_paused(&app, &state, p);
            }
        }
        _ => {}
    }
    res
}

fn set_orbit_paused(app: &AppHandle, state: &AppState, paused: bool) {
    let prev = state.orbit_paused.lock().unwrap().replace(paused);
    if prev != Some(paused) {
        crate::tray::refresh(app);
    }
}

#[tauri::command]
pub async fn orbit_update_policy(app: AppHandle, state: State<'_, AppState>, policy: Value) -> CmdResult<Value> {
    let sess = require_session(&state)?;
    let patch = crate::ops::policy_patch(&policy)?;
    let v = api::send_authed(&state.http, &sess, reqwest::Method::PUT, "/v1/orbit/policy", Some(&patch)).await?;
    events::refresh_all(&app);
    Ok(v)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PauseResult {
    /// ok | error | skipped
    pub gateway: String,
    pub api: String,
    pub messages: Vec<String>,
    pub paused: bool,
}

/// Pause/resume ORBIT immediately: local gateway first (takes effect on the next request, fail-open),
/// then the org-wide policy on the control plane.
pub async fn set_orbit(app: &AppHandle, pause: bool) -> PauseResult {
    let state = app.state::<AppState>();
    let action = if pause { "pause" } else { "resume" };
    let mut messages = vec![];
    let gw = state.gateway.view();
    let gateway = if gw.healthy {
        match gateway::post_control(&state.http, state.gateway.home(), action).await {
            Ok(()) => "ok".to_string(),
            Err(m) => {
                messages.push(m);
                "error".to_string()
            }
        }
    } else {
        "skipped".to_string()
    };
    let api = match state.session() {
        Some(sess) => {
            match api::send_authed(&state.http, &sess, reqwest::Method::POST, &format!("/v1/orbit/{action}"), None).await {
                Ok(_) => "ok".to_string(),
                Err(e) => {
                    messages.push(e.message);
                    "error".to_string()
                }
            }
        }
        None => "skipped".to_string(),
    };
    if gateway == "ok" || api == "ok" {
        set_orbit_paused(app, &state, pause);
        if !state.settings.get().silent_mode {
            if pause {
                events::notify(app, "ORBIT pausado", "As requisições seguem sem otimização até você retomar.");
            } else {
                events::notify(app, "ORBIT retomado", "As otimizações voltaram conforme a política.");
            }
        }
    }
    events::refresh_all(app);
    PauseResult { gateway, api, messages, paused: pause }
}

#[tauri::command]
pub async fn orbit_pause(app: AppHandle) -> PauseResult {
    set_orbit(&app, true).await
}

#[tauri::command]
pub async fn orbit_resume(app: AppHandle) -> PauseResult {
    set_orbit(&app, false).await
}

/* ------------------------------- gateway ------------------------------- */

#[tauri::command]
pub fn gateway_status(state: State<'_, AppState>) -> GatewayView {
    state.gateway.view()
}

#[tauri::command]
pub async fn gateway_set_enabled(app: AppHandle, state: State<'_, AppState>, enabled: bool) -> CmdResult<GatewayView> {
    state.settings.update(|s| {
        s.gateway_local = enabled;
        Ok(())
    })?;
    if enabled {
        if let Some(sess) = state.session() {
            session::write_device_json(state.gateway.home(), &sess)?;
        }
    } else {
        session::remove_device_json(state.gateway.home())?;
    }
    state.gateway.set_enabled(enabled);
    state.gateway.tick(&state.http).await;
    let v = state.gateway.view();
    let _ = app.emit(events::GATEWAY, &v);
    crate::tray::refresh(&app);
    Ok(v)
}

/* ------------------------------- settings ------------------------------- */

#[tauri::command]
pub fn settings_update(app: AppHandle, state: State<'_, AppState>, patch: SettingsPatch) -> CmdResult<Settings> {
    if patch.api_url.is_some() && state.session().is_some() {
        let cur = state.settings.get().api_url;
        if patch.api_url.as_deref().map(|u| u.trim().trim_end_matches('/')) != Some(cur.as_str()) {
            return Err(CmdError::new(
                "paired",
                "Desconecte este computador antes de trocar a URL da API.",
            ));
        }
    }
    let notch_changed = patch.notch_launcher.is_some() || patch.silent_mode.is_some();
    let pill_changed = patch.pill_always_on_top.is_some();
    let s = state.settings.update(|s| s.apply(patch))?;
    if notch_changed {
        launcher::settings_changed(&app);
    }
    if pill_changed {
        launcher::pill_settings_changed(&app);
    }
    let _ = app.emit(events::SETTINGS, &s);
    events::refresh_all(&app);
    Ok(s)
}

#[tauri::command]
pub fn autostart_set(app: AppHandle, enabled: bool) -> CmdResult<bool> {
    let m = app.autolaunch();
    let r = if enabled { m.enable() } else { m.disable() };
    r.map_err(|e| CmdError::new("autostart", format!("Não foi possível alterar o início automático: {e}")))?;
    crate::tray::refresh(&app);
    Ok(m.is_enabled().unwrap_or(enabled))
}

/* ------------------------------- navigation ------------------------------- */

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> CmdResult<()> {
    if !is_http_url(&url) {
        return Err(CmdError::new("not_allowed", "Só links http(s) podem ser abertos."));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| CmdError::new("opener", format!("Não foi possível abrir o navegador: {e}")))
}

/// Opens a page of the web app (billing, reports, devices…) in the default browser.
#[tauri::command]
pub fn open_web(app: AppHandle, state: State<'_, AppState>, page: String) -> CmdResult<()> {
    const PAGES: &[(&str, &str)] = &[
        ("billing", "/app/faturamento"),
        ("reports", "/app/relatorios"),
        ("devices", "/app/configuracoes/dispositivos"),
        ("dashboard", "/app"),
        ("integrations", "/app/integracoes"),
        ("projects", "/app/agentes"),
        ("quality", "/app/qualidade"),
        ("signup", "/cadastro"),
    ];
    let path = PAGES
        .iter()
        .find(|(k, _)| *k == page)
        .map(|(_, p)| *p)
        .ok_or_else(|| CmdError::new("not_allowed", "Página desconhecida."))?;
    open_external(app, format!("{}{}", state.settings.get().web_url, path))
}

#[tauri::command]
pub fn open_main(app: AppHandle, section: Option<String>) {
    launcher::show_main(&app, section.as_deref());
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::shutdown(&app);
    app.exit(0);
}

/* ------------------------------- launchers ------------------------------- */

#[tauri::command]
pub fn notch_set_state(app: AppHandle, state: String) -> CmdResult<()> {
    launcher::notch_set_state(&app, &state).map_err(|m| CmdError::new("launcher", m))
}

#[tauri::command]
pub fn notch_set_base(app: AppHandle, base: String) {
    launcher::notch_set_base(&app, &base);
}

#[tauri::command]
pub fn quick_hide(app: AppHandle) {
    launcher::quick_hide(&app);
}

#[tauri::command]
pub fn pill_set_expanded(app: AppHandle, expanded: bool) {
    launcher::pill_set_expanded(&app, expanded);
}

#[tauri::command]
pub fn launcher_info(app: AppHandle) -> launcher::LauncherInfo {
    launcher::info(&app)
}

pub fn emit_navigate(app: &AppHandle, section: &str) {
    let _ = app.emit_to("main", events::NAVIGATE, section);
}
