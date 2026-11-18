// Installer for the maindy. Claude Code integration (OTel env + statusLine + PostToolUse hook).
// Merges into <home>/.claude/settings.json, preserving every user key, with timestamped backups.
// Uninstall restores ONLY what maindy. changed (tracked in <MAINDY_HOME>/claude-code-install.json).
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ENDPOINT = "http://127.0.0.1:8787";
export const STATUSLINE_MARKER = "maindy-statusline.mjs";
export const HOOK_MARKER = "maindy-posttooluse.mjs";
// Same logic shipped as subcommands of the gateway binary (works without Node installed):
//   "<…/maindy-gateway>" statusline     "<…/maindy-gateway>" hook posttooluse
const GATEWAY_STATUSLINE_RE = /maindy[^\s"']*["']?\s+statusline(\s|$)/i;
const GATEWAY_HOOK_RE = /maindy[^\s"']*["']?\s+hook\s+posttooluse(\s|$)/i;

// Resolved lazily: when this module is bundled into the gateway's single-executable (CommonJS) build,
// import.meta.url is undefined and must not be touched at load time.
let binDirCache;
function defaultBinDir() {
  if (binDirCache === undefined) {
    try {
      binDirCache = resolve(dirname(fileURLToPath(import.meta.url)), "..", "bin");
    } catch {
      binDirCache = null;
    }
  }
  return binDirCache;
}

export function desiredEnv(endpoint) {
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_METRICS_EXPORTER: "otlp",
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
    OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
  };
}

export function statusLineCommand(binDir = defaultBinDir()) {
  return `node "${join(binDir ?? ".", "maindy-statusline.mjs")}"`;
}
export function hookCommand(binDir = defaultBinDir()) {
  return `node "${join(binDir ?? ".", "maindy-posttooluse.mjs")}"`;
}

export function resolvePaths({ home, maindyHome, env = process.env } = {}) {
  const h = home ? resolve(home) : homedir();
  const mh = maindyHome
    ? resolve(maindyHome)
    : env.MAINDY_HOME && env.MAINDY_HOME.trim() && !home
      ? resolve(env.MAINDY_HOME)
      : join(h, ".maindy");
  return {
    home: h,
    settingsPath: join(h, ".claude", "settings.json"),
    statePath: join(mh, "claude-code-install.json"),
    maindyHome: mh,
  };
}

export const isOurStatusLine = (sl) =>
  !!sl && typeof sl.command === "string" && (sl.command.includes(STATUSLINE_MARKER) || GATEWAY_STATUSLINE_RE.test(sl.command));
export const isOurHook = (h) => !!h && typeof h.command === "string" && (h.command.includes(HOOK_MARKER) || GATEWAY_HOOK_RE.test(h.command));
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

class InstallerError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

function readJsonFile(path, what) {
  if (!existsSync(path)) return { exists: false, value: null };
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) return { exists: true, value: {} };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return { exists: true, value };
  } catch {
    throw new InstallerError(`${what} em ${path} não é um JSON válido. Corrija o arquivo antes de continuar; nada foi alterado.`);
  }
}

function writeJsonAtomic(path, value, mode) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.maindy-tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: mode ?? 0o644 });
  renameSync(tmp, path);
}

function backup(settingsPath, now = new Date()) {
  if (!existsSync(settingsPath)) return null;
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  let dest = `${settingsPath}.maindy-backup-${stamp}`;
  let i = 1;
  while (existsSync(dest)) dest = `${settingsPath}.maindy-backup-${stamp}-${i++}`;
  copyFileSync(settingsPath, dest);
  return dest;
}

function fileMode(path) {
  try {
    return statSync(path).mode & 0o777;
  } catch {
    return undefined;
  }
}

/**
 * opts.commands = { statusLine, hook } overrides the commands written to settings.json (the gateway
 * passes its own binary's subcommands here).
 * @returns {{ changed: boolean, dryRun: boolean, messages: string[], settings: object, backupPath: string|null }}
 */
export function install(opts = {}) {
  const { endpoint = DEFAULT_ENDPOINT, dryRun = false, forceStatusline = false, binDir = defaultBinDir(), commands = {} } = opts;
  const paths = resolvePaths(opts);
  const messages = [];
  const { exists, value } = readJsonFile(paths.settingsPath, "settings.json");
  const before = value ?? {};
  const settings = clone(before);
  const prevState = readJsonFile(paths.statePath, "Estado de instalação").value;
  const state = prevState && prevState.version === 1 ? clone(prevState) : {
    version: 1,
    createdSettingsFile: !exists,
    createdEnv: false,
    createdHooks: false,
    createdPostToolUse: false,
    env: {},
    statusLine: { installed: false, previous: null },
  };
  state.endpoint = endpoint;

  // 1) env (OTel → gateway). Never ANTHROPIC_BASE_URL: subscription users stay observability-only.
  if (settings.env === undefined) {
    settings.env = {};
    state.createdEnv = state.createdEnv || true;
  } else if (typeof settings.env !== "object" || settings.env === null || Array.isArray(settings.env)) {
    throw new InstallerError("O campo \"env\" de settings.json não é um objeto. Nada foi alterado.");
  }
  for (const [k, v] of Object.entries(desiredEnv(endpoint))) {
    const cur = settings.env[k];
    const rec = state.env[k];
    if (!rec) {
      state.env[k] = { previous: cur === undefined ? null : cur, set: v };
    } else {
      // keep the very first "previous" value; refresh what we set now
      if (cur !== rec.set && cur !== v) rec.previous = cur === undefined ? null : cur;
      rec.set = v;
    }
    if (cur !== v) messages.push(`env.${k} = ${JSON.stringify(v)}${cur !== undefined ? ` (antes: ${JSON.stringify(cur)})` : ""}`);
    settings.env[k] = v;
  }

  // 2) statusLine
  const wantSl = { type: "command", command: commands.statusLine ?? statusLineCommand(binDir), padding: 0 };
  const curSl = settings.statusLine;
  if (curSl === undefined || isOurStatusLine(curSl)) {
    if (JSON.stringify(curSl) !== JSON.stringify(wantSl)) messages.push("statusLine → maindy.");
    if (!state.statusLine.installed) state.statusLine = { installed: true, previous: null };
    settings.statusLine = wantSl;
  } else if (forceStatusline) {
    messages.push("statusLine existente substituída (--force-statusline); a anterior será restaurada no uninstall.");
    state.statusLine = { installed: true, previous: clone(curSl) };
    settings.statusLine = wantSl;
  } else {
    messages.push("Já existe uma statusLine sua — mantida. Use --force-statusline para trocar pela da maindy.");
  }

  // 3) PostToolUse hook for Bash
  if (settings.hooks === undefined) {
    settings.hooks = {};
    state.createdHooks = state.createdHooks || true;
  } else if (typeof settings.hooks !== "object" || settings.hooks === null || Array.isArray(settings.hooks)) {
    throw new InstallerError("O campo \"hooks\" de settings.json não é um objeto. Nada foi alterado.");
  }
  if (settings.hooks.PostToolUse === undefined) {
    settings.hooks.PostToolUse = [];
    state.createdPostToolUse = state.createdPostToolUse || true;
  } else if (!Array.isArray(settings.hooks.PostToolUse)) {
    throw new InstallerError("hooks.PostToolUse de settings.json não é uma lista. Nada foi alterado.");
  }
  const wantHook = { type: "command", command: commands.hook ?? hookCommand(binDir), timeout: 5 };
  let found = false;
  for (const group of settings.hooks.PostToolUse) {
    if (!group || !Array.isArray(group.hooks)) continue;
    for (let i = 0; i < group.hooks.length; i++) {
      if (isOurHook(group.hooks[i])) {
        if (!found && group.matcher === "Bash") {
          if (JSON.stringify(group.hooks[i]) !== JSON.stringify(wantHook)) messages.push("hook PostToolUse atualizado");
          group.hooks[i] = wantHook;
          found = true;
        }
      }
    }
  }
  if (!found) {
    settings.hooks.PostToolUse.push({ matcher: "Bash", hooks: [wantHook] });
    messages.push("hook PostToolUse (Bash) → compressão maindy.");
  }

  const changed = JSON.stringify(before) !== JSON.stringify(settings) || !exists;
  let backupPath = null;
  if (!changed) messages.push("Nada a mudar: integração já instalada.");
  if (!dryRun) {
    if (changed) {
      backupPath = backup(paths.settingsPath);
      writeJsonAtomic(paths.settingsPath, settings, fileMode(paths.settingsPath));
    }
    mkdirSync(paths.maindyHome, { recursive: true, mode: 0o700 });
    writeJsonAtomic(paths.statePath, state, 0o600);
  }
  return { changed, dryRun, messages, settings, backupPath, paths };
}

export function uninstall(opts = {}) {
  const { dryRun = false } = opts;
  const paths = resolvePaths(opts);
  const messages = [];
  const { exists, value } = readJsonFile(paths.settingsPath, "settings.json");
  if (!exists) return { changed: false, dryRun, messages: ["settings.json não existe; nada a remover."], settings: null, backupPath: null, paths };
  const before = value;
  const settings = clone(before);
  const state = readJsonFile(paths.statePath, "Estado de instalação").value;
  if (!state) messages.push("Estado de instalação não encontrado: removendo apenas statusLine/hook da maindy. (variáveis env mantidas por segurança).");

  // env: restore only values that are still the ones we set
  if (state && settings.env && typeof settings.env === "object") {
    for (const [k, rec] of Object.entries(state.env ?? {})) {
      if (settings.env[k] === rec.set) {
        if (rec.previous === null || rec.previous === undefined) delete settings.env[k];
        else settings.env[k] = rec.previous;
        messages.push(`env.${k} restaurada`);
      } else if (k in settings.env) {
        messages.push(`env.${k} foi alterada por você depois da instalação — mantida.`);
      }
    }
    if (state.createdEnv && Object.keys(settings.env).length === 0) delete settings.env;
  }

  // statusLine
  if (isOurStatusLine(settings.statusLine)) {
    const prev = state?.statusLine?.previous;
    if (prev) settings.statusLine = prev;
    else delete settings.statusLine;
    messages.push(prev ? "statusLine anterior restaurada" : "statusLine da maindy removida");
  }

  // hooks
  const ptu = settings.hooks?.PostToolUse;
  if (Array.isArray(ptu)) {
    const next = [];
    for (const group of ptu) {
      if (group && Array.isArray(group.hooks) && group.hooks.some(isOurHook)) {
        const rest = group.hooks.filter((h) => !isOurHook(h));
        messages.push("hook PostToolUse da maindy removido");
        if (rest.length) next.push({ ...group, hooks: rest });
      } else next.push(group);
    }
    settings.hooks.PostToolUse = next;
    const createdPtu = state ? state.createdPostToolUse : true;
    const createdHooks = state ? state.createdHooks : true;
    if (next.length === 0 && createdPtu) delete settings.hooks.PostToolUse;
    if (Object.keys(settings.hooks).length === 0 && createdHooks) delete settings.hooks;
  }

  const changed = JSON.stringify(before) !== JSON.stringify(settings);
  let backupPath = null;
  const removeFile = !!state?.createdSettingsFile && Object.keys(settings).length === 0;
  if (!changed) messages.push("Nada da maindy encontrado em settings.json.");
  if (!dryRun) {
    if (changed || removeFile) {
      backupPath = backup(paths.settingsPath);
      if (removeFile) unlinkSync(paths.settingsPath);
      else writeJsonAtomic(paths.settingsPath, settings, fileMode(paths.settingsPath));
    }
    if (state) {
      try {
        unlinkSync(paths.statePath);
      } catch {
        /* ignore */
      }
    }
  }
  return { changed, dryRun, messages, settings: removeFile ? null : settings, backupPath, paths };
}

export function status(opts = {}) {
  const paths = resolvePaths(opts);
  const { exists, value } = readJsonFile(paths.settingsPath, "settings.json");
  const s = value ?? {};
  const envWanted = desiredEnv(opts.endpoint ?? s.env?.OTEL_EXPORTER_OTLP_ENDPOINT ?? DEFAULT_ENDPOINT);
  const env = Object.fromEntries(Object.keys(envWanted).map((k) => [k, s.env?.[k] ?? null]));
  const otel = Object.keys(envWanted).every((k) => s.env?.[k] != null) && s.env.CLAUDE_CODE_ENABLE_TELEMETRY === "1";
  const statusLine = isOurStatusLine(s.statusLine);
  const hook = Array.isArray(s.hooks?.PostToolUse) && s.hooks.PostToolUse.some((g) => Array.isArray(g?.hooks) && g.hooks.some(isOurHook));
  return {
    settingsExists: exists,
    otel,
    env,
    statusLine,
    foreignStatusLine: !!s.statusLine && !statusLine,
    hook,
    gatewayModeEnv: s.env?.ANTHROPIC_BASE_URL ?? null,
    stateFile: existsSync(paths.statePath),
    paths,
  };
}

export { InstallerError };
