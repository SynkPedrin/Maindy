/**
 * `maindy-gateway integrations <claude-code|codex> <install|uninstall|status> [opções]`
 *
 * Runs the same installer logic as the admin endpoints (integrations.ts) straight from the CLI, without the
 * gateway key, so an AI agent inside the user's editor can do it (with the user watching). Pure function:
 * returns { code, stdout, stderr } — cli.ts prints and sets the exit code.
 *
 * Exit codes: 0 ok · 1 failure writing/reading config · 2 conflict (existing user [otel] in Codex) ·
 *             3 invalid config file (nothing written) · 64 usage error.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  INTEGRATION_TOOLS,
  applyIntegration,
  claudeCodeStatus,
  classifyInstallerError,
  codexStatus,
  defaultCliCommand,
  previewDiff,
  resolveGatewayPort,
  type IntegrationAction,
  type IntegrationEnv,
  type IntegrationTool,
} from "./integrations.js";

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CliDeps {
  env?: NodeJS.ProcessEnv;
  /** overrides the detected gateway command (tests) */
  cliCommand?: string;
}

export const INTEGRATIONS_USAGE = `Uso: maindy-gateway integrations <claude-code|codex> <install|uninstall|status> [opções]

  --dry-run            mostra as mudanças (diff) sem gravar nada
  --json               saída em JSON
  --home <dir>         home do usuário (padrão: o seu); Claude Code em <home>/.claude, Codex em <home>/.codex
  --maindy-home <dir>  diretório de dados da maindy. (padrão: $MAINDY_HOME ou <home>/.maindy)
  --force-statusline   Claude Code: troca uma statusLine sua pela da maindy. (a sua volta no uninstall)

Nada é gravado sem você pedir. Toda gravação faz backup <arquivo>.maindy-backup-<data> antes.`;

type Parsed = { tool: IntegrationTool; action: IntegrationAction | "status"; dryRun: boolean; json: boolean; forceStatusline: boolean; home?: string; maindyHome?: string };

class UsageError extends Error {}

function parse(argv: string[]): Parsed | "help" {
  const pos: string[] = [];
  const out: Partial<Parsed> = { dryRun: false, json: false, forceStatusline: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new UsageError(`${a} precisa de um diretório.`);
      return v;
    };
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--force-statusline") out.forceStatusline = true;
    else if (a === "--home") out.home = value();
    else if (a === "--maindy-home") out.maindyHome = value();
    else if (a === "-h" || a === "--help") return "help";
    else if (a.startsWith("-")) throw new UsageError(`Opção desconhecida: ${a}`);
    else pos.push(a);
  }
  const [tool, action, ...rest] = pos;
  if (!tool || !action) throw new UsageError("Informe a ferramenta e a ação.");
  if (rest.length) throw new UsageError(`Argumento inesperado: ${rest[0]}`);
  if (!(INTEGRATION_TOOLS as readonly string[]).includes(tool)) throw new UsageError(`Ferramenta desconhecida: ${tool} (use claude-code ou codex).`);
  if (action !== "install" && action !== "uninstall" && action !== "status") throw new UsageError(`Ação desconhecida: ${action} (use install, uninstall ou status).`);
  if (action === "status" && out.dryRun) throw new UsageError("--dry-run não se aplica a status.");
  if (tool === "codex" && out.forceStatusline) throw new UsageError("--force-statusline só existe para claude-code.");
  return { ...(out as Parsed), tool: tool as IntegrationTool, action };
}

const TITLE: Record<IntegrationTool, string> = { "claude-code": "Claude Code", codex: "Codex CLI" };
const yn = (b: boolean) => (b ? "sim" : "não");

export function runIntegrationsCli(argv: string[], deps: CliDeps = {}): CliResult {
  const env = deps.env ?? process.env;
  let p: Parsed | "help";
  try {
    p = parse(argv);
  } catch (e) {
    return { code: 64, stdout: "", stderr: `${(e as Error).message}\n\n${INTEGRATIONS_USAGE}\n` };
  }
  if (p === "help") return { code: 0, stdout: `${INTEGRATIONS_USAGE}\n`, stderr: "" };

  const userHome = p.home ? resolve(p.home) : homedir();
  // same rule as the Claude Code installer: an explicit --home keeps everything inside it
  const maindyHome = p.maindyHome ? resolve(p.maindyHome) : p.home ? join(userHome, ".maindy") : env.MAINDY_HOME?.trim() ? resolve(env.MAINDY_HOME) : join(homedir(), ".maindy");
  const ie: IntegrationEnv = {
    userHome,
    maindyHome,
    port: resolveGatewayPort(maindyHome, env),
    searchPath: env.PATH ?? "",
    cliCommand: deps.cliCommand ?? defaultCliCommand(),
  };
  const title = TITLE[p.tool];
  const lines: string[] = [];

  if (p.action === "status") {
    const s = p.tool === "claude-code" ? claudeCodeStatus(ie) : codexStatus(ie);
    const path = "settingsPath" in s ? s.settingsPath : s.configPath;
    if (s.error) {
      const msg = `Não foi possível ler ${path}: ${s.error}`;
      return p.json
        ? { code: 3, stdout: `${JSON.stringify({ ok: false, tool: p.tool, error: { code: "invalid_config", message: msg } }, null, 2)}\n`, stderr: "" }
        : { code: 3, stdout: "", stderr: `Erro: ${msg}\n` };
    }
    if (p.json) return { code: 0, stdout: `${JSON.stringify({ ok: true, tool: p.tool, gatewayPort: ie.port, ...s }, null, 2)}\n`, stderr: "" };
    lines.push(`maindy. × ${title} — status`);
    lines.push(`  arquivo: ${path}`);
    lines.push(`  ${title} encontrado nesta máquina: ${yn(s.detected)}`);
    lines.push(`  OpenTelemetry → gateway maindy. (porta ${ie.port}): ${yn(s.otel)}${s.endpoint && !s.otel ? ` (configurado para ${s.endpoint})` : ""}`);
    if ("hook" in s) {
      lines.push(`  status line maindy. (limites da assinatura): ${yn(s.statusLine)}${s.foreignStatusLine ? " — há outra statusLine sua, mantida (use --force-statusline para trocar)" : ""}`);
      lines.push(`  hook PostToolUse (compressão de saídas do Bash): ${yn(s.hook)}`);
    } else if (s.unmanagedOtel) {
      lines.push(`  configuração [otel] sua encontrada (${s.unmanagedOtel}) — a maindy. não a sobrescreve`);
    }
    lines.push(`  integração maindy. instalada: ${yn(s.installed)}`);
    if (s.installed && p.tool === "claude-code") lines.push("  Reinicie o Claude Code se ele estava aberto durante a instalação: a telemetria só vale numa sessão nova.");
    if (!s.installed) lines.push(`  Para instalar: ${ie.cliCommand} integrations ${p.tool} install --dry-run`);
    return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
  }

  try {
    const r = applyIntegration(ie, p.tool, p.action, { dryRun: p.dryRun, forceStatusline: p.forceStatusline });
    const diff = p.dryRun ? previewDiff(r.path, r.before ?? "", r.preview ?? "") : undefined;
    if (p.json) {
      return {
        code: 0,
        stdout: `${JSON.stringify({ ok: true, tool: p.tool, action: p.action, dryRun: p.dryRun, path: r.path, changed: r.changed, messages: r.messages, backupPath: r.backupPath, ...(diff !== undefined ? { diff } : {}) }, null, 2)}\n`,
        stderr: "",
      };
    }
    const verb = p.action === "install" ? "instalação" : "remoção";
    lines.push(`maindy. × ${title} — ${verb}${p.dryRun ? " (simulação: nada foi gravado)" : r.changed.length ? " concluída" : ""}`);
    lines.push(`  arquivo: ${r.path}`);
    for (const m of r.messages) lines.push(`  • ${m}`);
    if (r.backupPath) lines.push(`  backup da versão anterior: ${r.backupPath}`);
    if (p.dryRun) {
      lines.push("", "Prévia (diff; valores que parecem segredos aparecem como •••):", diff ?? "");
      lines.push("", r.changed.length ? "Para aplicar, rode o mesmo comando sem --dry-run." : "Nada a mudar.");
    } else if (p.action === "install" && p.tool === "claude-code") {
      lines.push("  Reinicie o Claude Code para a telemetria valer. Os limites da assinatura (5 h / 7 dias) só aparecem pela status line.");
      lines.push("  Prompts não são enviados (OTEL_LOG_USER_PROMPTS continua desligado).");
    } else if (p.action === "install") {
      lines.push("  Reinicie o Codex para a telemetria valer. Prompts continuam redigidos (log_user_prompt = false).");
    }
    return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
  } catch (err) {
    const f = classifyInstallerError(err, p.tool);
    const code = f.code === "config_conflict" ? 2 : f.code === "invalid_config" ? 3 : 1;
    return p.json
      ? { code, stdout: `${JSON.stringify({ ok: false, tool: p.tool, action: p.action, error: { code: f.code, message: f.message } }, null, 2)}\n`, stderr: "" }
      : { code, stdout: "", stderr: `Erro: ${f.message}\n` };
  }
}
