// maindy. status line for Claude Code. Must be fast (<200ms) and must never throw.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { maindyHome, postJson, readStdin } from "./gateway.mjs";

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtUsd(usd) {
  return `US$ ${nf2.format(usd)}`;
}

export function fmtCompact(n) {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${nf1.format(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${nf1.format(n / 1_000)}k`;
  return String(Math.round(n));
}

const pct = (v) => (typeof v === "number" && Number.isFinite(v) ? `${Math.round(v)}%` : null);

function quotaPct(input, quotas, window) {
  const fromStdin = input?.rate_limits?.[window]?.used_percentage;
  if (typeof fromStdin === "number") return fromStdin;
  const q = Array.isArray(quotas) ? quotas.find((x) => x?.window === window) : null;
  return typeof q?.usedPercentage === "number" ? q.usedPercentage : null;
}

/**
 * Pure formatter.
 * @param {any} input  Claude Code statusline stdin JSON (may be null)
 * @param {{counters?: any, quotas?: any[]} | null} gw  gateway response (live or cached)
 * @param {{offline?: boolean}} [opts]
 */
export function formatStatusLine(input, gw, opts = {}) {
  const parts = ["maindy."];
  const model = input?.model?.display_name || input?.model?.id;
  if (model) parts.push(String(model));
  const cost = input?.cost?.total_cost_usd;
  if (typeof cost === "number" && Number.isFinite(cost)) parts.push(`${fmtUsd(cost)} sessão`);
  const ctx = pct(input?.context_window?.used_percentage);
  if (ctx) parts.push(`ctx ${ctx}`);
  const q5 = pct(quotaPct(input, gw?.quotas, "five_hour"));
  if (q5) parts.push(`5h ${q5}`);
  const q7 = pct(quotaPct(input, gw?.quotas, "seven_day"));
  if (q7) parts.push(`7d ${q7}`);
  const c = gw?.counters;
  if (c) {
    if (Number(c.cacheHits) > 0) parts.push(`cache ${fmtCompact(Number(c.cacheHits))} hits`);
    if (Number(c.tokensAvoided) > 0) parts.push(`${fmtCompact(Number(c.tokensAvoided))} tok evitados`);
    if (Number(c.savedMicros) > 0 && c.savedSource && c.savedSource !== "unavailable") {
      parts.push(`~${fmtUsd(Number(c.savedMicros) / 1e6)} econ. estimada`);
    }
  }
  if (opts.offline) parts.push("gateway offline");
  return parts.length > 1 ? `${parts[0]} ${parts.slice(1).join(" · ")}` : parts[0];
}

function cachePath(env) {
  return join(maindyHome(env), "statusline-cache.json");
}

export function readCache(env = process.env) {
  try {
    const j = JSON.parse(readFileSync(cachePath(env), "utf8"));
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

export function writeCache(data, env = process.env) {
  try {
    mkdirSync(maindyHome(env), { recursive: true, mode: 0o700 });
    writeFileSync(cachePath(env), JSON.stringify({ ...data, savedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch {
    /* best effort */
  }
}

/** Full run: returns the line (never throws). Total budget ~190ms. */
export async function runStatusLine({ env = process.env, stdin = process.stdin, budgetMs = 190 } = {}) {
  const started = Date.now();
  let raw = "";
  let input = null;
  try {
    raw = await readStdin(Math.min(80, budgetMs), stdin);
    input = raw.trim() ? JSON.parse(raw) : null;
  } catch {
    input = null;
  }
  // leave ~40 ms for formatting/printing; with the default 190 ms budget this is ≤150 ms for the request
  const remaining = Math.max(20, budgetMs - 40 - (Date.now() - started));
  let gw = null;
  let offline = false;
  if (raw.trim()) {
    const res = await postJson("/maindy/statusline", raw, { timeoutMs: remaining, env });
    if (res.ok && res.json && typeof res.json === "object") {
      gw = { counters: res.json.counters ?? null, quotas: res.json.quotas ?? [] };
      writeCache(gw, env);
    } else {
      offline = true;
      const cached = readCache(env);
      if (cached) gw = { counters: cached.counters ?? null, quotas: cached.quotas ?? [] };
    }
  }
  try {
    return formatStatusLine(input, gw, { offline });
  } catch {
    return "maindy.";
  }
}
