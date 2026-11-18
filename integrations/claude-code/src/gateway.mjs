// Shared helpers: locate the local maindy. gateway and its key. Zero deps, never throws.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function maindyHome(env = process.env) {
  return env.MAINDY_HOME && env.MAINDY_HOME.trim() ? env.MAINDY_HOME : join(homedir(), ".maindy");
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

export function gatewayUrl(env = process.env) {
  if (env.MAINDY_GATEWAY_URL && env.MAINDY_GATEWAY_URL.trim()) return env.MAINDY_GATEWAY_URL.replace(/\/+$/, "");
  // runtime.json holds the port the running gateway actually bound (it may differ from gateway.json)
  try {
    const rt = JSON.parse(readFileSync(join(maindyHome(env), "runtime.json"), "utf8"));
    if (Number.isInteger(rt?.port) && rt.port > 0 && rt.port < 65536 && Number.isInteger(rt?.pid) && alive(rt.pid)) {
      return `http://127.0.0.1:${rt.port}`;
    }
  } catch {
    /* no runtime file */
  }
  let port = 8787;
  try {
    const cfg = JSON.parse(readFileSync(join(maindyHome(env), "gateway.json"), "utf8"));
    if (Number.isInteger(cfg?.port) && cfg.port > 0 && cfg.port < 65536) port = cfg.port;
  } catch {
    /* default port */
  }
  return `http://127.0.0.1:${port}`;
}

export function gatewayKey(env = process.env) {
  if (env.MAINDY_GATEWAY_KEY && env.MAINDY_GATEWAY_KEY.trim()) return env.MAINDY_GATEWAY_KEY.trim();
  try {
    return readFileSync(join(maindyHome(env), "gateway.key"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/**
 * POST JSON to the gateway with a hard timeout. Resolves { ok, status, json, elapsedMs } or
 * { ok:false, error } — never rejects.
 */
export async function postJson(path, body, { timeoutMs, env = process.env } = {}) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? 150);
  try {
    const headers = { "content-type": "application/json" };
    const key = gatewayKey(env);
    if (key) headers["x-maindy-key"] = key;
    const res = await fetch(gatewayUrl(env) + path, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { ok: res.ok, status: res.status, json, elapsedMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: ctrl.signal.aborted ? "timeout" : "unreachable", elapsedMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** Read all of stdin as a string, giving up after `timeoutMs` (returns what was read). */
export function readStdin(timeoutMs = 1000, stream = process.stdin) {
  return new Promise((resolve) => {
    let data = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(data);
    };
    const timer = setTimeout(finish, timeoutMs);
    if (stream.isTTY) return finish();
    stream.setEncoding("utf8");
    stream.on("data", (c) => (data += c));
    stream.on("end", finish);
    stream.on("error", finish);
  });
}
