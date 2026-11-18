//! "Configurar com o Claude Code": a pt-BR prompt that asks an AI agent in the user's own editor to run the
//! gateway CLI (`maindy-gateway integrations … --dry-run`, then install after the user agrees, then status).
//!
//! The prompt is opened PRE-FILLED in the target (VS Code extension, Claude Code CLI in a new terminal,
//! Claude Desktop) through officially documented URL handlers — none of them auto-sends: the user reviews
//! and presses Enter. URLs are built here (never accepted from the webview) and checked against a scheme
//! allowlist before being handed to the OS. The prompt holds paths only — no key, token or secret.

use crate::api::{CmdError, CmdResult};
use crate::state::AppState;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt as _;

/// The Claude Code CLI warns above this; we stay well under (docs allow up to 5,000 for claude-cli://).
pub const MAX_PROMPT_CHARS: usize = 1000;

pub const TOOLS: &[&str] = &["claude-code", "codex"];
pub const TARGETS: &[&str] = &["vscode", "terminal", "claude_app"];

/// Percent-encodes everything except RFC 3986 unreserved characters (spaces → %20, never '+').
pub fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// POSIX single-quote quoting (`'` → `'\''`), safe to paste in any sh/zsh/bash.
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// `--maindy-home "<dir>"` only when the app's gateway does not use the CLI's default (~/.maindy).
pub fn maindy_home_arg(gateway_home: &Path, user_home: &Path) -> String {
    if gateway_home == user_home.join(".maindy") {
        String::new()
    } else {
        format!(" --maindy-home \"{}\"", gateway_home.display())
    }
}

/// pt-BR prompt for the agent. `gw` is the quoted gateway command (see gateway::cli_command_for).
pub fn build_prompt(tool: &str, gw: &str, home_arg: &str) -> String {
    let cmd = format!("{gw} integrations {tool}");
    if tool == "claude-code" {
        format!(
            "Configure a integração da maindy. com o Claude Code nesta máquina, usando só o CLI do gateway local da maindy.:\n\
             1. Rode `{cmd} install --dry-run{home_arg}` e me mostre as mudanças propostas.\n\
             2. Pergunte se eu concordo. Só depois do meu sim, rode o mesmo comando sem --dry-run.\n\
             3. Rode `{cmd} status{home_arg}` e confirme que OpenTelemetry, status line e hook estão ativos.\n\
             4. Explique que preciso reiniciar o Claude Code para a telemetria valer e que os limites da assinatura só aparecem pela status line.\n\
             Não edite nenhum outro arquivo nem rode outros comandos."
        )
    } else {
        format!(
            "Configure a integração da maindy. com o Codex CLI nesta máquina, usando só o CLI do gateway local da maindy.:\n\
             1. Rode `{cmd} install --dry-run{home_arg}` e me mostre as mudanças propostas.\n\
             2. Pergunte se eu concordo. Só depois do meu sim, rode o mesmo comando sem --dry-run.\n\
             3. Rode `{cmd} status{home_arg}` e confirme que a telemetria aponta para o gateway.\n\
             4. Explique que preciso reiniciar o Codex para a telemetria valer.\n\
             Não edite nenhum outro arquivo nem rode outros comandos."
        )
    }
}

/// Officially documented handlers (pre-fill only, never auto-send):
///  - VS Code extension: vscode://anthropic.claude-code/open?prompt=…   (code.claude.com/docs/en/vs-code.md)
///  - Claude Code CLI:   claude-cli://open?q=…&cwd=…                    (code.claude.com/docs/en/deep-links.md)
///  - Claude Desktop:    claude://code/new?q=…                          (support.claude.com, article 14729294)
pub fn target_url(target: &str, prompt: &str, cwd: &Path) -> Option<String> {
    let q = url_encode(prompt);
    match target {
        "vscode" => Some(format!("vscode://anthropic.claude-code/open?prompt={q}")),
        "terminal" => Some(format!("claude-cli://open?q={q}&cwd={}", url_encode(&cwd.display().to_string()))),
        "claude_app" => Some(format!("claude://code/new?q={q}")),
        _ => None,
    }
}

/// Last check before the OS opens anything: only these schemes (and, for the agent handlers, only the
/// exact documented endpoints).
pub fn open_url_allowed(raw: &str) -> bool {
    if raw.len() > 8192 {
        return false;
    }
    let Ok(u) = reqwest::Url::parse(raw) else { return false };
    if !u.username().is_empty() || u.password().is_some() || u.fragment().is_some() {
        return false;
    }
    match u.scheme() {
        "vscode" => u.host_str() == Some("anthropic.claude-code") && u.path() == "/open" && u.port().is_none(),
        "claude-cli" => u.host_str() == Some("open") && matches!(u.path(), "" | "/") && u.port().is_none(),
        "claude" => u.host_str() == Some("code") && u.path() == "/new" && u.port().is_none(),
        "https" => u.host_str().is_some_and(|h| !h.is_empty()),
        _ => false,
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTargets {
    /// VS Code (app or `code` CLI) AND the Claude Code extension installed
    pub vscode: bool,
    /// `~/Applications/Claude Code URL Handler.app` (registered after the first interactive Claude Code run)
    pub terminal: bool,
    /// Claude Desktop app
    pub claude_app: bool,
}

fn has_executable(dirs: impl IntoIterator<Item = PathBuf>, name: &str) -> bool {
    dirs.into_iter().any(|d| d.join(name).is_file())
}

/// Pure detection over the given roots (tests pass temp dirs).
pub fn detect(home: &Path, app_dirs: &[PathBuf], path_env: &str) -> AgentTargets {
    let app = |name: &str| app_dirs.iter().any(|d| d.join(name).is_dir());
    let mut bin_dirs: Vec<PathBuf> = std::env::split_paths(path_env).collect();
    // GUI apps get launchd's minimal PATH: also look where the `code` shell command is usually linked
    bin_dirs.extend(["/usr/local/bin", "/opt/homebrew/bin"].map(PathBuf::from));
    bin_dirs.push(home.join(".local/bin"));
    let code_cli = has_executable(bin_dirs, if cfg!(windows) { "code.cmd" } else { "code" });
    let extension = std::fs::read_dir(home.join(".vscode").join("extensions"))
        .map(|rd| {
            rd.flatten().any(|e| {
                e.file_name().to_str().is_some_and(|n| n.starts_with("anthropic.claude-code-")) && e.path().is_dir()
            })
        })
        .unwrap_or(false);
    AgentTargets {
        vscode: (app("Visual Studio Code.app") || code_cli) && extension,
        terminal: home.join("Applications").join("Claude Code URL Handler.app").is_dir(),
        claude_app: app("Claude.app"),
    }
}

fn user_home() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
}

fn detect_here(home: &Path) -> AgentTargets {
    let app_dirs = if cfg!(target_os = "macos") { vec![PathBuf::from("/Applications"), home.join("Applications")] } else { vec![] };
    detect(home, &app_dirs, &std::env::var("PATH").unwrap_or_default())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSetup {
    pub tool: String,
    /// quoted gateway command, or None when this build has no gateway binary
    pub gateway_command: Option<String>,
    pub prompt: Option<String>,
    pub prompt_chars: usize,
    /// `claude '<prompt>'` to paste in a terminal when the claude-cli:// handler is not registered
    pub shell_command: Option<String>,
    pub targets: AgentTargets,
    /// working directory used for the terminal session (the user's home)
    pub cwd: String,
}

fn setup_for(state: &AppState, tool: &str) -> CmdResult<(AgentSetup, PathBuf)> {
    if !TOOLS.contains(&tool) {
        return Err(CmdError::new("invalid_request", "Integração desconhecida."));
    }
    let home = user_home();
    let gw = state.gateway.cli_command();
    let prompt = gw.as_ref().map(|g| build_prompt(tool, g, &maindy_home_arg(state.gateway.home(), &home)));
    let targets = if tool == "claude-code" { detect_here(&home) } else { AgentTargets::default() };
    Ok((
        AgentSetup {
            tool: tool.to_string(),
            gateway_command: gw,
            prompt_chars: prompt.as_ref().map(|p| p.chars().count()).unwrap_or(0),
            shell_command: prompt.as_ref().filter(|_| tool == "claude-code").map(|p| format!("claude {}", shell_quote(p))),
            prompt,
            targets,
            cwd: home.display().to_string(),
        },
        home,
    ))
}

#[tauri::command]
pub fn agent_setup(state: State<'_, AppState>, tool: String) -> CmdResult<AgentSetup> {
    setup_for(&state, &tool).map(|(s, _)| s)
}

/// Opens the prompt pre-filled in a detected target. The URL is built here from our own prompt.
#[tauri::command]
pub fn agent_open(app: AppHandle, state: State<'_, AppState>, tool: String, target: String) -> CmdResult<()> {
    let (setup, home) = setup_for(&state, &tool)?;
    if tool != "claude-code" || !TARGETS.contains(&target.as_str()) {
        return Err(CmdError::new("invalid_request", "Destino desconhecido."));
    }
    let available = match target.as_str() {
        "vscode" => setup.targets.vscode,
        "terminal" => setup.targets.terminal,
        _ => setup.targets.claude_app,
    };
    if !available {
        return Err(CmdError::new("not_found", "Esse destino não foi encontrado neste computador. Use “Copiar prompt”."));
    }
    let prompt = setup.prompt.ok_or_else(|| CmdError::new("gateway_missing", "Gateway local não instalado nesta versão do app."))?;
    let url = target_url(&target, &prompt, &home).ok_or_else(|| CmdError::new("invalid_request", "Destino desconhecido."))?;
    if !open_url_allowed(&url) {
        return Err(CmdError::new("not_allowed", "Endereço não permitido."));
    }
    log::info!("agent prompt opened in {target} ({} chars)", setup.prompt_chars); // never the prompt/URL
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| CmdError::new("opener", format!("Não foi possível abrir: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    const GW: &str = "\"/Applications/maindy.app/Contents/MacOS/maindy-gateway\"";

    #[test]
    fn prompt_is_short_complete_and_secret_free() {
        for tool in TOOLS {
            let p = build_prompt(tool, GW, "");
            assert!(p.chars().count() <= MAX_PROMPT_CHARS, "{tool}: {} chars", p.chars().count());
            assert!(p.contains(&format!("{GW} integrations {tool} install --dry-run")), "{p}");
            assert!(p.contains(&format!("{GW} integrations {tool} status")));
            assert!(p.contains("Só depois do meu sim"));
            assert!(p.contains("Não edite nenhum outro arquivo"));
            for secret in ["mdk_", "sk-", "token", "x-maindy-key", "gateway.key", "device.json"] {
                assert!(!p.contains(secret), "{tool} prompt mentions {secret}");
            }
        }
        let cc = build_prompt("claude-code", GW, "");
        assert!(cc.contains("reiniciar o Claude Code"));
        assert!(cc.contains("limites da assinatura só aparecem pela status line"));
        assert!(cc.contains("OpenTelemetry, status line e hook"));
        // worst case: long gateway path and a non-default MAINDY_HOME still fit
        let long_gw = format!("\"/Users/{}/Applications/maindy.app/Contents/MacOS/maindy-gateway\"", "u".repeat(40));
        let arg = maindy_home_arg(Path::new("/Users/someone/Library/Application Support/maindy-qa"), Path::new("/Users/someone"));
        for tool in TOOLS {
            assert!(build_prompt(tool, &long_gw, &arg).chars().count() <= MAX_PROMPT_CHARS);
        }
    }

    #[test]
    fn home_arg_only_when_not_default() {
        assert_eq!(maindy_home_arg(Path::new("/Users/a/.maindy"), Path::new("/Users/a")), "");
        assert_eq!(maindy_home_arg(Path::new("/tmp/mh"), Path::new("/Users/a")), " --maindy-home \"/tmp/mh\"");
    }

    #[test]
    fn urls_are_encoded_and_allowlisted() {
        assert_eq!(url_encode("a b/ç\"`&?=#\n"), "a%20b%2F%C3%A7%22%60%26%3F%3D%23%0A");
        let p = build_prompt("claude-code", GW, "");
        let home = Path::new("/Users/pedro");
        let vs = target_url("vscode", &p, home).unwrap();
        assert!(vs.starts_with("vscode://anthropic.claude-code/open?prompt=Configure%20a%20integra%C3%A7%C3%A3o"));
        let cli = target_url("terminal", &p, home).unwrap();
        assert!(cli.starts_with("claude-cli://open?q=") && cli.ends_with("&cwd=%2FUsers%2Fpedro"));
        let app = target_url("claude_app", &p, home).unwrap();
        assert!(app.starts_with("claude://code/new?q="));
        assert_eq!(target_url("cursor", &p, home), None);
        for u in [&vs, &cli, &app] {
            assert!(open_url_allowed(u), "{u}");
            // round-trip: the handler receives exactly our prompt
            let parsed = reqwest::Url::parse(u).unwrap();
            let (_, q) = parsed.query_pairs().find(|(k, _)| k == "prompt" || k == "q").unwrap();
            assert_eq!(q, p);
        }
        assert!(open_url_allowed("https://code.claude.com/docs/en/vs-code"));
        for bad in [
            "http://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "vscode://evil.ext/open?prompt=x",
            "vscode://anthropic.claude-code/install?x",
            "vscode://anthropic.claude-code/open#x",
            "claude-cli://run?q=x",
            "claude://settings",
            "claude://code/new@evil",
            "cursor://anthropic.claude-code/open?prompt=x",
            "https://user:pw@example.com",
            "smb://server/share",
        ] {
            assert!(!open_url_allowed(bad), "{bad}");
        }
    }

    #[test]
    fn shell_command_quotes_safely() {
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
        let p = build_prompt("claude-code", GW, "");
        let q = shell_quote(&p);
        assert!(q.starts_with('\'') && q.ends_with('\''));
        assert_eq!(q.matches('\'').count() % 2, 0);
    }

    #[test]
    fn detection_uses_only_the_given_roots() {
        let root = std::env::temp_dir().join(format!("maindy-agent-detect-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let home = root.join("home");
        let apps = root.join("Applications");
        std::fs::create_dir_all(&home).unwrap();
        std::fs::create_dir_all(&apps).unwrap();
        let apps_dirs = [apps.clone()];
        let none = detect(&home, &apps_dirs, "");
        assert_eq!(none, AgentTargets::default());

        // VS Code app without the extension → not offered
        std::fs::create_dir_all(apps.join("Visual Studio Code.app")).unwrap();
        assert!(!detect(&home, &apps_dirs, "").vscode);
        std::fs::create_dir_all(home.join(".vscode/extensions/anthropic.claude-code-2.1.0-darwin-arm64")).unwrap();
        assert!(detect(&home, &apps_dirs, "").vscode);
        // extension + `code` CLI only (no app bundle)
        std::fs::remove_dir_all(apps.join("Visual Studio Code.app")).unwrap();
        let bin = root.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join(if cfg!(windows) { "code.cmd" } else { "code" }), "").unwrap();
        assert!(detect(&home, &apps_dirs, bin.to_str().unwrap()).vscode);

        std::fs::create_dir_all(home.join("Applications/Claude Code URL Handler.app")).unwrap();
        std::fs::create_dir_all(apps.join("Claude.app")).unwrap();
        let all = detect(&home, &apps_dirs, "");
        assert!(all.terminal && all.claude_app);
        let _ = std::fs::remove_dir_all(root);
    }
}
