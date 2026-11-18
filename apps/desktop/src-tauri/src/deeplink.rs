//! `maindy://` URL scheme (tauri-plugin-deep-link): opens the app directly on a screen.
//!
//!   maindy://integrations                 → Integrações
//!   maindy://integrations/<kind>          → Integrações, scrolled to that connector with its connect form /
//!                                           install flow open (kind ∈ connector allowlist, see KINDS)
//!   maindy://open/<section>               → a sidebar page (section ∈ SECTIONS)
//!   maindy://pair                         → pairing (or Configurações when already paired)
//!
//! Every URL comes from outside the app (browser, other apps), so parsing is strict: exact scheme, no
//! user/password/port, host and path segments matched against allowlists, at most one segment; query
//! and fragment are ignored (nothing is read from them). Anything else is dropped without side effects.
//! The raw URL is never logged.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub const SCHEME: &str = "maindy";
pub const MAX_URL_LEN: usize = 256;
/// Event telling the main window a route is waiting in `route_take`.
pub const ROUTE_EVENT: &str = "maindy://route";

/// Sidebar sections (same ids as the frontend `Section` type).
pub const SECTIONS: &[&str] =
    &["overview", "savings", "integrations", "projects", "limits", "orbit", "quality", "reports", "billing", "settings"];

/// Accepted connector names → canonical `ConnectorKind` (packages/contracts). Aliases are friendlier
/// spellings for links typed by people (`claude-code`, `openai`…).
pub const KINDS: &[(&str, &str)] = &[
    ("openai_api", "openai_api"),
    ("openai", "openai_api"),
    ("anthropic_api", "anthropic_api"),
    ("anthropic", "anthropic_api"),
    ("openai_compatible", "openai_compatible"),
    ("ollama", "openai_compatible"),
    ("local_agent_sdk", "local_agent_sdk"),
    ("sdk", "local_agent_sdk"),
    ("claude_code", "claude_code"),
    ("claude-code", "claude_code"),
    ("codex", "codex"),
    ("chat_apps", "chat_apps"),
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    /// one of SECTIONS
    pub section: &'static str,
    /// canonical connector kind to focus inside Integrações
    pub connector: Option<&'static str>,
    /// open pairing (unpaired) / device settings (paired)
    pub pair: bool,
}

fn section(s: &str) -> Option<&'static str> {
    SECTIONS.iter().copied().find(|x| *x == s)
}

fn kind(s: &str) -> Option<&'static str> {
    KINDS.iter().find(|(alias, _)| *alias == s).map(|(_, k)| *k)
}

/// Strict parser. Returns None for anything that is not exactly one of the documented routes.
pub fn parse(raw: &str) -> Option<Route> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > MAX_URL_LEN || !raw.is_ascii() {
        return None;
    }
    // no dot-segments, escapes or backslashes before the parser normalizes them away
    let head = raw.split(['?', '#']).next().unwrap_or("");
    if head.contains("..") || head.contains('%') || head.contains('\\') || head.chars().any(|c| c.is_ascii_whitespace() || c.is_ascii_control()) {
        return None;
    }
    let url = reqwest::Url::parse(raw).ok()?;
    if url.scheme() != SCHEME || !url.username().is_empty() || url.password().is_some() || url.port().is_some() {
        return None;
    }
    let host = url.host_str()?.to_ascii_lowercase();
    // path segments, tolerating one trailing slash ("maindy://integrations/codex/")
    let path = url.path();
    let path = path.strip_prefix('/').unwrap_or(path);
    let path = path.strip_suffix('/').unwrap_or(path).to_ascii_lowercase();
    let segs: Vec<&str> = if path.is_empty() { vec![] } else { path.split('/').collect() };
    match (host.as_str(), segs.as_slice()) {
        ("integrations", []) => Some(Route { section: "integrations", connector: None, pair: false }),
        ("integrations", [k]) => Some(Route { section: "integrations", connector: Some(kind(k)?), pair: false }),
        ("open", [s]) => Some(Route { section: section(s)?, connector: None, pair: false }),
        ("pair", []) => Some(Route { section: "settings", connector: None, pair: true }),
        _ => None,
    }
}

/// The route waiting for the main window (cold start: the webview may not be listening yet).
#[derive(Default)]
pub struct PendingRoute(pub Mutex<Option<Route>>);

/// Handles URLs from the deep-link plugin / a second instance. Only the last valid one wins.
pub fn handle_urls<I, S>(app: &AppHandle, urls: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let Some(route) = urls.into_iter().filter_map(|u| parse(u.as_ref())).last() else {
        return false;
    };
    log::info!("deep link: section={} connector={} pair={}", route.section, route.connector.unwrap_or("-"), route.pair);
    if let Some(p) = app.try_state::<PendingRoute>() {
        *p.0.lock().unwrap() = Some(route);
    }
    crate::launcher::show_main(app, None);
    let _ = app.emit_to("main", ROUTE_EVENT, ());
    true
}

/// The main window takes (and clears) the pending route on load and on every ROUTE_EVENT.
#[tauri::command]
pub fn route_take(pending: tauri::State<'_, PendingRoute>) -> Option<Route> {
    pending.0.lock().unwrap().take()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(section: &'static str, connector: Option<&'static str>, pair: bool) -> Option<Route> {
        Some(Route { section, connector, pair })
    }

    #[test]
    fn integrations_routes() {
        assert_eq!(parse("maindy://integrations"), r("integrations", None, false));
        assert_eq!(parse("maindy://integrations/"), r("integrations", None, false));
        assert_eq!(parse("maindy://integrations/claude_code"), r("integrations", Some("claude_code"), false));
        assert_eq!(parse("maindy://integrations/claude-code"), r("integrations", Some("claude_code"), false));
        assert_eq!(parse("maindy://integrations/codex/"), r("integrations", Some("codex"), false));
        assert_eq!(parse("maindy://integrations/openai"), r("integrations", Some("openai_api"), false));
        assert_eq!(parse("maindy://integrations/anthropic_api"), r("integrations", Some("anthropic_api"), false));
        assert_eq!(parse("maindy://integrations/local_agent_sdk"), r("integrations", Some("local_agent_sdk"), false));
        assert_eq!(parse("maindy://INTEGRATIONS/Codex"), r("integrations", Some("codex"), false));
        // query / fragment are ignored, never read
        assert_eq!(parse("maindy://integrations/codex?x=<script>#frag"), r("integrations", Some("codex"), false));
        for k in KINDS.iter().map(|(a, _)| a) {
            assert!(parse(&format!("maindy://integrations/{k}")).is_some(), "{k}");
        }
    }

    #[test]
    fn open_and_pair_routes() {
        for s in SECTIONS {
            assert_eq!(parse(&format!("maindy://open/{s}")), r(s, None, false));
        }
        assert_eq!(parse("maindy://pair"), r("settings", None, true));
        assert_eq!(parse("maindy://pair/"), r("settings", None, true));
    }

    #[test]
    fn rejects_everything_else() {
        for bad in [
            "",
            "maindy:",
            "maindy://",
            "maindy:integrations/codex",
            "https://integrations/codex",
            "maindyx://integrations/codex",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "maindy://integrations/cursor",
            "maindy://integrations/codex/install",
            "maindy://integrations/codex/../../x",
            "maindy://integrations/%63odex",
            "maindy://integrations//codex",
            "maindy://open",
            "maindy://open/",
            "maindy://open/admin",
            "maindy://open/settings/extra",
            "maindy://open/../settings",
            "maindy://pair/now",
            "maindy://user:pw@integrations/codex",
            "maindy://user@integrations/codex",
            "maindy://integrations:8080/codex",
            "maindy://unknown/codex",
            "maindy://integrações/codex",
        ] {
            assert_eq!(parse(bad), None, "{bad}");
        }
        let long = format!("maindy://integrations/codex?{}", "a".repeat(300));
        assert_eq!(parse(&long), None);
    }
}
