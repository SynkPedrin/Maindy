// EXPERIMENTAL — reads Codex subscription rate limits through the official `codex app-server`
// (JSON-RPC over stdio, one JSON object per line). Disabled unless MAINDY_EXPERIMENTAL_CODEX_APP_SERVER=1
// or { experimental: true }. Any error/timeout → []. Schemas vary by Codex version
// (`codex app-server generate-json-schema`), so mapping is tolerant.
import { spawn } from "node:child_process";

export function isEnabled(env = process.env, opts = {}) {
  return opts.experimental === true || env.MAINDY_EXPERIMENTAL_CODEX_APP_SERVER === "1";
}

function toIso(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Map `rateLimits` from account/rateLimits/read (or the updated notification) to QuotaSnapshot-like objects. */
export function mapRateLimits(rateLimits, capturedAt = new Date()) {
  if (!rateLimits || typeof rateLimits !== "object") return [];
  const out = [];
  for (const slot of ["primary", "secondary"]) {
    const w = rateLimits[slot];
    if (!w || typeof w !== "object") continue;
    const used = Number(w.usedPercent ?? w.used_percent);
    if (!Number.isFinite(used)) continue;
    const mins = Number(w.windowDurationMins ?? w.window_minutes ?? w.windowMinutes);
    out.push({
      provider: "openai",
      product: "codex",
      window: Number.isFinite(mins) && mins > 0 ? `${Math.round(mins)}m` : slot,
      usedPercentage: Math.max(0, Math.min(100, used)),
      resetsAt: toIso(w.resetsAt ?? w.resets_at),
      collectedVia: "codex.app_server",
      capturedAt: capturedAt.toISOString(),
    });
  }
  return out;
}

/**
 * Spawn `codex app-server`, initialize, read rate limits. Resolves [] on any failure.
 * @param {{command?: string, args?: string[], timeoutMs?: number, env?: NodeJS.ProcessEnv, experimental?: boolean}} opts
 */
export function readCodexRateLimits(opts = {}) {
  const env = opts.env ?? process.env;
  if (!isEnabled(env, opts)) return Promise.resolve([]);
  const command = opts.command ?? "codex";
  const args = opts.args ?? ["app-server"];
  const timeoutMs = opts.timeoutMs ?? 3000;
  return new Promise((resolve) => {
    let settled = false;
    let child;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child?.kill();
      } catch {
        /* ignore */
      }
      resolve(value);
    };
    const timer = setTimeout(() => done([]), timeoutMs);
    try {
      child = spawn(command, args, { env, stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      return done([]);
    }
    child.on("error", () => done([]));
    child.on("exit", () => done([]));
    const send = (msg) => {
      try {
        child.stdin.write(JSON.stringify(msg) + "\n");
      } catch {
        done([]);
      }
    };
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1) {
          if (msg.error) return done([]);
          send({ method: "initialized" });
          send({ method: "account/rateLimits/read", id: 2, params: {} });
        } else if (msg.id === 2) {
          return done(msg.error ? [] : mapRateLimits(msg.result?.rateLimits));
        } else if (msg.method === "account/rateLimits/updated") {
          const m = mapRateLimits(msg.params?.rateLimits);
          if (m.length) return done(m);
        }
      }
    });
    send({ method: "initialize", id: 1, params: { clientInfo: { name: "maindy", title: "maindy.", version: "0.1.0" } } });
  });
}
