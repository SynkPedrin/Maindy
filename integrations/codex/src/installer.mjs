// Installer for the maindy. Codex OTel block. Edits a given config.toml by appending/removing a
// clearly delimited managed block; never rewrites user content and refuses to clobber an
// existing unmanaged [otel] configuration.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const BEGIN = "# >>> maindy otel (gerenciado) >>>";
export const END = "# <<< maindy otel <<<";
export const DEFAULT_ENDPOINT = "http://127.0.0.1:8787";

export class CodexInstallerError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function resolveConfigPath({ config, home } = {}) {
  if (config) return resolve(config);
  return join(home ? resolve(home) : homedir(), ".codex", "config.toml");
}

export function logsEndpoint(endpoint = DEFAULT_ENDPOINT) {
  const base = String(endpoint).replace(/\/+$/, "");
  return /\/v1\/logs$/.test(base) ? base : `${base}/v1/logs`;
}

export function managedBlock(endpoint = DEFAULT_ENDPOINT) {
  const url = logsEndpoint(endpoint);
  return [
    BEGIN,
    "# Telemetria do Codex → gateway local maindy. (OTLP/HTTP JSON). Prompts continuam redigidos.",
    "[otel]",
    "log_user_prompt = false",
    `exporter = { otlp-http = { endpoint = ${JSON.stringify(url)}, protocol = "json" } }`,
    END,
  ].join("\n") + "\n";
}

const blockRe = () => new RegExp(`(\\n)?${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}\\n?`, "g");
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripManaged(text) {
  // removes the block plus the blank-line separator install() added before it
  return text.replace(blockRe(), "");
}

export function hasManaged(text) {
  return text.includes(BEGIN) && text.includes(END);
}

/** Detect an unmanaged otel configuration (outside our block). Returns a description or null. */
export function findUnmanagedOtel(text) {
  const outside = text.replace(blockRe(), "\n");
  let inRoot = true;
  let multiline = null;
  const lines = outside.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (multiline) {
      if (raw.includes(multiline)) multiline = null;
      continue;
    }
    const line = raw.replace(/^\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const m3 = line.match(/("""|''')/g);
    if (m3 && m3.length % 2 === 1) multiline = m3[0];
    const header = line.match(/^\[\[?\s*([^\]]+?)\s*\]\]?/);
    if (header) {
      inRoot = false;
      const name = header[1].replace(/["']/g, "");
      if (name === "otel" || name.startsWith("otel.")) return `tabela [${header[1]}] na linha ${i + 1}`;
      continue;
    }
    if (inRoot && /^["']?otel["']?\s*(=|\.)/.test(line)) return `chave "otel" na linha ${i + 1}`;
  }
  return null;
}

function backup(path, now = new Date()) {
  if (!existsSync(path)) return null;
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  let dest = `${path}.maindy-backup-${stamp}`;
  let i = 1;
  while (existsSync(dest)) dest = `${path}.maindy-backup-${stamp}-${i++}`;
  copyFileSync(path, dest);
  return dest;
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  let mode = 0o600;
  try {
    mode = statSync(path).mode & 0o777;
  } catch {
    /* new file */
  }
  const tmp = `${path}.maindy-tmp-${process.pid}`;
  writeFileSync(tmp, text, { mode });
  renameSync(tmp, path);
}

export function install(opts = {}) {
  const path = resolveConfigPath(opts);
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const exists = existsSync(path);
  const before = exists ? readFileSync(path, "utf8") : "";
  const conflict = findUnmanagedOtel(before);
  if (conflict) {
    throw new CodexInstallerError(
      `Já existe uma configuração [otel] sua em ${path} (${conflict}). A maindy. não sobrescreve configurações suas: ` +
        `remova-a ou aponte o exporter dela para ${logsEndpoint(endpoint)} manualmente. Nada foi alterado.`,
      2,
    );
  }
  const base = stripManaged(before);
  const sep = base.length === 0 ? "" : base.endsWith("\n") ? "\n" : "\n\n";
  const after = base + sep + managedBlock(endpoint);
  const changed = after !== before;
  let backupPath = null;
  if (changed && !opts.dryRun) {
    backupPath = backup(path);
    writeAtomic(path, after);
  }
  return { path, changed, dryRun: !!opts.dryRun, backupPath, content: after, created: !exists };
}

export function uninstall(opts = {}) {
  const path = resolveConfigPath(opts);
  if (!existsSync(path)) return { path, changed: false, dryRun: !!opts.dryRun, backupPath: null, content: null };
  const before = readFileSync(path, "utf8");
  if (!hasManaged(before)) return { path, changed: false, dryRun: !!opts.dryRun, backupPath: null, content: before };
  const after = stripManaged(before);
  let backupPath = null;
  if (!opts.dryRun) {
    backupPath = backup(path);
    writeAtomic(path, after);
  }
  return { path, changed: true, dryRun: !!opts.dryRun, backupPath, content: after };
}

export function status(opts = {}) {
  const path = resolveConfigPath(opts);
  const exists = existsSync(path);
  const text = exists ? readFileSync(path, "utf8") : "";
  const installed = hasManaged(text);
  const m = installed ? text.match(/otlp-http\s*=\s*\{\s*endpoint\s*=\s*"([^"]+)"/) : null;
  return { path, exists, installed, endpoint: m ? m[1] : null, unmanagedOtel: findUnmanagedOtel(text) };
}
