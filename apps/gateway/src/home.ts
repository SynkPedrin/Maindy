/**
 * $MAINDY_HOME layout (default ~/.maindy, override with MAINDY_HOME or --home):
 *   gateway.json      config (created on first run, 0600)
 *   gateway.key       x-maindy-key for /maindy/* routes (generated, 0600, single line)
 *   gateway.db        node:sqlite — exact cache, telemetry outbox, quotas, kv
 *   policy.json       local ORBIT policy (used when not linked to the cloud)
 *   device.json       written by the desktop app after pairing: { deviceToken, deviceId?, organizationId?, apiUrl? }
 *   runtime.json      { pid, port, startedAt, version } written while the gateway runs
 *   gateway.log       JSON-lines log (metadata only; never prompts, bodies or credentials)
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HomePaths {
  dir: string;
  config: string;
  key: string;
  db: string;
  policy: string;
  device: string;
  runtime: string;
  log: string;
}

export function resolveHome(override?: string): HomePaths {
  const dir = override ?? process.env.MAINDY_HOME ?? join(homedir(), ".maindy");
  return {
    dir,
    config: join(dir, "gateway.json"),
    key: join(dir, "gateway.key"),
    db: join(dir, "gateway.db"),
    policy: join(dir, "policy.json"),
    device: join(dir, "device.json"),
    runtime: join(dir, "runtime.json"),
    log: join(dir, "gateway.log"),
  };
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/** Atomic write with 0600 permissions. */
export function writePrivate(path: string, content: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, content, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

export function ensurePrivate(path: string): void {
  try {
    if ((statSync(path).mode & 0o077) !== 0) chmodSync(path, 0o600);
  } catch {
    /* missing file */
  }
}

export function loadOrCreateKey(paths: HomePaths): string {
  if (process.env.MAINDY_GATEWAY_KEY) return process.env.MAINDY_GATEWAY_KEY.trim();
  if (existsSync(paths.key)) {
    ensurePrivate(paths.key);
    const k = readFileSync(paths.key, "utf8").trim();
    if (k.length >= 32) return k;
  }
  const key = `mdk_${randomBytes(32).toString("base64url")}`;
  writePrivate(paths.key, `${key}\n`);
  return key;
}

export interface DeviceFile {
  deviceToken: string;
  deviceId?: string;
  organizationId?: string;
  apiUrl?: string;
}

export function readDevice(paths: HomePaths): DeviceFile | null {
  const envToken = process.env.MAINDY_DEVICE_TOKEN?.trim();
  let file: Partial<DeviceFile> = {};
  if (existsSync(paths.device)) {
    try {
      ensurePrivate(paths.device);
      file = JSON.parse(readFileSync(paths.device, "utf8")) as Partial<DeviceFile>;
    } catch {
      file = {};
    }
  }
  const token = envToken || (typeof file.deviceToken === "string" ? file.deviceToken.trim() : "");
  if (!token) return null;
  return { ...file, deviceToken: token };
}
