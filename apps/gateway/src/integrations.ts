/**
 * Claude Code / Codex integration logic shared by the admin endpoints (admin.ts, used by the desktop) and
 * the `maindy-gateway integrations …` CLI subcommand (cli.ts, used by an AI agent in the user's editor).
 *
 * No server dependencies here (no fastify/undici/sqlite): the CLI loads this without starting the gateway.
 * Installers only write user config when explicitly called (never on dry-run), always with a timestamped
 * backup, preserving every other setting.
 */
import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as claudeInstaller from "../../../integrations/claude-code/src/installer.mjs";
import * as codexInstaller from "../../../integrations/codex/src/installer.mjs";

export { claudeInstaller, codexInstaller };

export const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
export const INTEGRATION_TOOLS = ["claude-code", "codex"] as const;
export type IntegrationTool = (typeof INTEGRATION_TOOLS)[number];
export type IntegrationAction = "install" | "uninstall";

export interface IntegrationEnv {
  /** user home whose ~/.claude and ~/.codex are inspected/edited */
  userHome: string;
  /** this gateway's MAINDY_HOME (key, runtime port, install state) */
  maindyHome: string;
  /** gateway port the OTel endpoint must point to */
  port: number;
  /** PATH used to detect the `claude` / `codex` binaries */
  searchPath: string;
  /** command that runs this gateway's CLI, e.g. `"/Applications/maindy.app/…/maindy-gateway"` */
  cliCommand: string;
  /** last OTLP event per tool (admin endpoint only; the CLI has no database open) */
  lastEvent?: (kind: "claude_code" | "codex") => string | null;
}

/** True when running as a Node Single Executable Application (the desktop sidecar). */
export function isSeaBinary(): boolean {
  try {
    const sea = (process as unknown as { getBuiltinModule?: (id: string) => { isSea?: () => boolean } | undefined }).getBuiltinModule?.("node:sea");
    return sea?.isSea?.() === true;
  } catch {
    return false;
  }
}

/**
 * How Claude Code should invoke this gateway's CLI subcommands (detected at runtime, never hardcoded):
 *  - SEA binary (no Node needed): "<execPath>"   e.g. /Applications/maindy.app/Contents/MacOS/maindy-gateway
 *  - bundled ESM under Node: node "<…/maindy-gateway.mjs>"
 *  - dev (tsx): node "<apps/gateway/dist/maindy-gateway.mjs>"
 */
export function defaultCliCommand(): string {
  if (isSeaBinary()) return `"${process.execPath}"`;
  const script = process.argv[1];
  if (script && /maindy-gateway(\.[cm]?js)?$/.test(script)) return `node "${resolve(script)}"`;
  try {
    return `node "${resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist", "maindy-gateway.mjs")}"`;
  } catch {
    return `node "maindy-gateway.mjs"`;
  }
}

export function defaultMaindyHome(): string {
  return resolve(join(homedir(), ".maindy"));
}

/** Commands written to Claude Code's settings.json; `--home` only when this gateway's home is not the default. */
export function gatewayCommands(cli: string, maindyHome: string): { statusLine: string; hook: string } {
  const homeArg = resolve(maindyHome) === defaultMaindyHome() ? "" : ` --home "${resolve(maindyHome)}"`;
  return { statusLine: `${cli} statusline${homeArg}`, hook: `${cli} hook posttooluse${homeArg}` };
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as { code?: string })?.code === "EPERM";
  }
}

const validPort = (p: unknown): p is number => Number.isInteger(p) && (p as number) > 0 && (p as number) < 65536;

/**
 * Port of the gateway that owns `maindyHome`: the running one (runtime.json with a live pid), else
 * MAINDY_GATEWAY_PORT, else gateway.json, else 8787. Same order the gateway itself uses at startup.
 */
export function resolveGatewayPort(maindyHome: string, env: NodeJS.ProcessEnv = process.env): number {
  try {
    const rt = JSON.parse(readFileSync(join(maindyHome, "runtime.json"), "utf8")) as { pid?: unknown; port?: unknown };
    if (validPort(rt.port) && Number.isInteger(rt.pid) && pidAlive(rt.pid as number)) return rt.port;
  } catch {
    /* not running */
  }
  const fromEnv = Number(env.MAINDY_GATEWAY_PORT);
  if (validPort(fromEnv)) return fromEnv;
  try {
    const cfg = JSON.parse(readFileSync(join(maindyHome, "gateway.json"), "utf8")) as { port?: unknown };
    if (validPort(cfg.port)) return cfg.port;
  } catch {
    /* default */
  }
  return 8787;
}

export function onPath(bin: string, searchPath: string): boolean {
  for (const dir of searchPath.split(delimiter)) {
    if (!dir) continue;
    for (const name of process.platform === "win32" ? [`${bin}.exe`, `${bin}.cmd`] : [bin]) {
      try {
        const p = join(dir, name);
        if (statSync(p).isFile()) {
          accessSync(p, constants.X_OK);
          return true;
        }
      } catch {
        /* not here */
      }
    }
  }
  return false;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Is this OTLP endpoint the gateway listening on `port`? */
export function pointsHere(endpoint: unknown, port: number): boolean {
  if (typeof endpoint !== "string") return false;
  try {
    const u = new URL(endpoint);
    return LOOPBACK.has(u.hostname) && Number(u.port || (u.protocol === "https:" ? 443 : 80)) === port;
  } catch {
    return false;
  }
}

export function endpointFor(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export interface ClaudeCodeStatus {
  detected: boolean;
  installed: boolean;
  settingsPath: string;
  otel: boolean;
  statusLine: boolean;
  hook: boolean;
  lastEventAt: string | null;
  /** extra detail for the CLI (not part of the admin contract) */
  endpoint?: string | null;
  foreignStatusLine?: boolean;
  error?: string;
}

export interface CodexStatus {
  detected: boolean;
  installed: boolean;
  configPath: string;
  otel: boolean;
  lastEventAt: string | null;
  endpoint?: string | null;
  unmanagedOtel?: string | null;
  error?: string;
}

export function claudeCodeStatus(e: IntegrationEnv): ClaudeCodeStatus {
  const home = e.userHome;
  let cc: ReturnType<typeof claudeInstaller.status> | null = null;
  let error: string | undefined;
  try {
    cc = claudeInstaller.status({ home, maindyHome: e.maindyHome });
  } catch (err) {
    cc = null; // unreadable settings.json → report as not installed (the install call explains why)
    error = String((err as Error)?.message ?? err).slice(0, 500);
  }
  const otel = !!cc?.otel && pointsHere(cc.env.OTEL_EXPORTER_OTLP_ENDPOINT, e.port);
  return {
    detected: isDir(join(home, ".claude")) || onPath("claude", e.searchPath) || existsSync(join(home, ".claude", "local", "claude")),
    installed: otel && !!cc?.hook,
    settingsPath: join(home, ".claude", "settings.json"),
    otel,
    statusLine: !!cc?.statusLine,
    hook: !!cc?.hook,
    lastEventAt: e.lastEvent?.("claude_code") ?? null,
    endpoint: typeof cc?.env.OTEL_EXPORTER_OTLP_ENDPOINT === "string" ? cc.env.OTEL_EXPORTER_OTLP_ENDPOINT : null,
    foreignStatusLine: !!cc?.foreignStatusLine,
    ...(error ? { error } : {}),
  };
}

export function codexStatus(e: IntegrationEnv): CodexStatus {
  const home = e.userHome;
  let cx: ReturnType<typeof codexInstaller.status> | null = null;
  let error: string | undefined;
  try {
    cx = codexInstaller.status({ home });
  } catch (err) {
    cx = null;
    error = String((err as Error)?.message ?? err).slice(0, 500);
  }
  return {
    detected: isDir(join(home, ".codex")) || onPath("codex", e.searchPath),
    installed: !!cx?.installed,
    configPath: codexInstaller.resolveConfigPath({ home }),
    otel: !!cx?.installed && pointsHere(cx.endpoint, e.port),
    lastEventAt: e.lastEvent?.("codex") ?? null,
    endpoint: cx?.endpoint ?? null,
    unmanagedOtel: cx?.unmanagedOtel ?? null,
    ...(error ? { error } : {}),
  };
}

/** Admin contract shape (docs/ARCHITECTURE.md §5): only the documented fields. */
export function integrationsView(e: IntegrationEnv) {
  const cc = claudeCodeStatus(e);
  const cx = codexStatus(e);
  return {
    claudeCode: { detected: cc.detected, installed: cc.installed, settingsPath: cc.settingsPath, otel: cc.otel, statusLine: cc.statusLine, hook: cc.hook, lastEventAt: cc.lastEventAt },
    codex: { detected: cx.detected, installed: cx.installed, configPath: cx.configPath, otel: cx.otel, lastEventAt: cx.lastEventAt },
  };
}

export interface ApplyResult {
  ok: true;
  changed: string[];
  messages: string[];
  backupPath: string | null;
  /** the file that is (or would be) written */
  path: string;
  /** dry-run only: full resulting file ("" when the file would be removed) */
  preview?: string;
  /** dry-run only: file content on disk right now ("" when missing) */
  before?: string;
}

export interface ApplyOptions {
  dryRun: boolean;
  forceStatusline?: boolean;
}

function readOr(path: string, fallback = ""): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fallback;
  }
}

/** Throws InstallerError / CodexInstallerError (see classifyInstallerError) or fs errors. */
export function applyIntegration(e: IntegrationEnv, tool: IntegrationTool, action: IntegrationAction, opts: ApplyOptions): ApplyResult {
  const { dryRun } = opts;
  if (tool === "claude-code") {
    const base = { home: e.userHome, maindyHome: e.maindyHome, dryRun };
    const settingsPath = claudeInstaller.resolvePaths(base).settingsPath;
    const before = dryRun ? readOr(settingsPath) : undefined;
    const r =
      action === "install"
        ? claudeInstaller.install({ ...base, endpoint: endpointFor(e.port), forceStatusline: opts.forceStatusline === true, commands: gatewayCommands(e.cliCommand, e.maindyHome) })
        : claudeInstaller.uninstall(base);
    return {
      ok: true,
      changed: r.changed ? r.messages : [],
      messages: r.messages,
      backupPath: r.backupPath,
      path: settingsPath,
      ...(dryRun ? { preview: r.settings === null ? "" : `${JSON.stringify(r.settings, null, 2)}\n`, before } : {}),
    };
  }
  const home = e.userHome;
  const path = codexInstaller.resolveConfigPath({ home });
  const before = dryRun ? readOr(path) : undefined;
  const ep = endpointFor(e.port);
  const r = action === "install" ? codexInstaller.install({ home, endpoint: ep, dryRun }) : codexInstaller.uninstall({ home, dryRun });
  const what = action === "install" ? `bloco [otel] da maindy. → ${codexInstaller.logsEndpoint(ep)}` : "bloco [otel] da maindy. removido";
  return {
    ok: true,
    changed: r.changed ? [`${r.path}: ${what}`] : [],
    messages: r.changed ? [what] : ["Nada a mudar."],
    backupPath: r.backupPath,
    path: r.path,
    ...(dryRun ? { preview: r.content ?? "", before } : {}),
  };
}

export interface InstallerFailure {
  status: number;
  code: "install_failed" | "config_conflict" | "invalid_config";
  message: string;
}

export function classifyInstallerError(err: unknown, tool: IntegrationTool): InstallerFailure {
  const known = err instanceof claudeInstaller.InstallerError || err instanceof codexInstaller.CodexInstallerError;
  const e = err as { message?: string; exitCode?: number };
  const conflict = known && tool === "codex" && e.exitCode === 2;
  const code = !known ? "install_failed" : conflict ? "config_conflict" : "invalid_config";
  const message = known ? String(e.message ?? "").slice(0, 500) : "Não foi possível gravar a configuração (permissão ou disco). Nada foi alterado pela maindy.";
  return { status: !known ? 500 : conflict ? 409 : 422, code, message };
}

/* ------------------------------------------------------------------ */
/* Unified line diff (for the CLI's --dry-run output)                  */
/* ------------------------------------------------------------------ */

const SECRETISH = /(key|token|secret|password|authorization|bearer|cookie)/i;

/** Masks values of lines that look like secrets (`"ANTHROPIC_API_KEY": "…"`, `token = "…"`). */
export function redactLine(line: string): string {
  if (!SECRETISH.test(line)) return line;
  const m = line.match(/^(.*?(?:":|\s=\s|=))\s*(.*)$/);
  if (!m) return line;
  const tail = m[2]!.trim();
  if (!tail || tail.startsWith("{") || tail.startsWith("[")) return line;
  return `${m[1]!.trimEnd()} "•••"${tail.endsWith(",") ? "," : ""}`;
}

/** LCS line diff with 3 lines of context; secret-looking values masked on both sides. */
export function unifiedDiff(path: string, before: string, after: string): string {
  const a = before.split("\n").map(redactLine);
  const b = after.split("\n").map(redactLine);
  if (a.at(-1) === "") a.pop();
  if (b.at(-1) === "") b.pop();
  const n = a.length;
  const m = b.length;
  const head = [`--- ${path}`, `+++ ${path} (maindy.)`];
  if (n * m > 4_000_000) return [...head, "@@ arquivo grande demais para a prévia linha a linha @@"].join("\n");
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const ops: [string, string][] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push([" ", a[i]!]);
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      ops.push(["+", b[j]!]);
      j++;
    } else {
      ops.push(["-", a[i]!]);
      i++;
    }
  }
  const changed = ops.flatMap((o, k) => (o[0] !== " " ? [k] : []));
  if (changed.length === 0) return [...head, "@@ nenhuma mudança @@"].join("\n");
  const near = (k: number) => changed.some((c) => k + 3 >= c && k <= c + 3);
  const out = [...head];
  let gap = false;
  ops.forEach(([tag, text], k) => {
    if (tag !== " " || near(k)) {
      if (gap) out.push("@@ … @@");
      gap = false;
      out.push(`${tag} ${text}`);
    } else gap = true;
  });
  return out.join("\n");
}

/** JSON files: compare canonical pretty forms so formatting alone never shows as a change. */
export function previewDiff(path: string, before: string, after: string, shownPath = path): string {
  if (path.endsWith(".json")) {
    const pretty = (t: string) => {
      try {
        return t.trim() ? `${JSON.stringify(JSON.parse(t), null, 2)}\n` : "";
      } catch {
        return t;
      }
    };
    return unifiedDiff(shownPath, pretty(before), pretty(after));
  }
  return unifiedDiff(shownPath, before, after);
}
