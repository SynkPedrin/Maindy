#!/usr/bin/env node
/**
 * E2E against REAL local Ollama (qwen3.5:4b) through the BUNDLED gateway (dist/maindy-gateway.mjs).
 *   node scripts/e2e-ollama.mjs [--home DIR]
 * Verifies: usage measured, cost 0 locally_measured, exact-cache hit returns identical content (non-stream
 * and stream), outbox rows with baselineMethod cache_replay for hits, and no prompt text in telemetry tables/logs.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, "..", "dist", "maindy-gateway.mjs");
const homeArg = process.argv.indexOf("--home");
const home = homeArg > 0 ? process.argv[homeArg + 1] : mkdtempSync(join(tmpdir(), "maindy-e2e-"));
const OLLAMA = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.E2E_MODEL ?? "qwen3.5:4b";
const MARKER = `E2E-PROMPT-MARKER-${Math.random().toString(36).slice(2, 10)}`;

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

if (!existsSync(bundle)) {
  console.error("dist/maindy-gateway.mjs não encontrado — rode `pnpm --filter @maindy/gateway build`.");
  process.exit(2);
}
try {
  const tags = await (await fetch(`${OLLAMA}/api/tags`)).json();
  if (!tags.models.some((m) => m.name === MODEL)) throw new Error(`modelo ${MODEL} ausente`);
} catch (e) {
  console.error(`Ollama indisponível em ${OLLAMA}: ${e.message}`);
  process.exit(2);
}

// conservative mode: exact_cache + loop_guard + retry_budget; no shadow sampling
writeFileSync(
  join(home, "policy.json"),
  JSON.stringify({ mode: "conservative", paused: false, techniques: [], qualitySampleRate: 0, maxAddedLatencyMs: 50, cacheTtlSeconds: 3600, updatedAt: new Date().toISOString(), version: 1 }),
  { mode: 0o600 },
);

const child = spawn(process.execPath, [bundle, "--port", "0", "--home", home], { env: { ...process.env, OLLAMA_BASE_URL: OLLAMA, MAINDY_DEVICE_TOKEN: "" }, stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
child.stdout.on("data", (d) => (stdout += d));
child.stderr.on("data", (d) => (stdout += d));
const stop = () => child.kill("SIGTERM");
process.on("exit", stop);

let base;
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 100));
  if (existsSync(join(home, "runtime.json"))) {
    base = JSON.parse(readFileSync(join(home, "runtime.json"), "utf8")).url;
    if ((await fetch(`${base}/maindy/health`).catch(() => null))?.ok) break;
  }
}
check("gateway (bundle) iniciou em 127.0.0.1", base?.startsWith("http://127.0.0.1:"), base);
const key = readFileSync(join(home, "gateway.key"), "utf8").trim();

const body = (stream) => ({
  model: MODEL,
  temperature: 0,
  max_tokens: 32,
  reasoning_effort: "none",
  stream,
  messages: [{ role: "user", content: `Responda apenas: OK. (${MARKER})` }],
});
async function chat(stream) {
  const t0 = performance.now();
  const r = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body(stream)) });
  const text = await r.text();
  return { status: r.status, cache: r.headers.get("x-maindy-cache"), text, ms: Math.round(performance.now() - t0) };
}

const n1 = await chat(false);
const s1 = await chat(true);
const n2 = await chat(false);
const s2 = await chat(true);
console.log(JSON.stringify({ n1: { status: n1.status, cache: n1.cache, ms: n1.ms }, s1: { status: s1.status, cache: s1.cache, ms: s1.ms }, n2: { cache: n2.cache, ms: n2.ms }, s2: { cache: s2.cache, ms: s2.ms } }));
check("non-stream 200", n1.status === 200, n1.text.slice(0, 160));
check("stream 200 com SSE e [DONE]", s1.status === 200 && s1.text.includes("data: [DONE]"));
check("stream sem chunk de usage injetado (cliente não pediu)", !s1.text.includes('"usage"'));
check("1ª requisição = miss, repetição = hit (non-stream)", n1.cache === "miss" && n2.cache === "hit", `${n1.cache} → ${n2.cache}`);
check("1ª requisição = miss, repetição = hit (stream)", s1.cache === "miss" && s2.cache === "hit", `${s1.cache} → ${s2.cache}`);
check("hit non-stream devolve conteúdo idêntico", n1.text === n2.text);
check("hit stream devolve SSE idêntico", s1.text === s2.text);

await new Promise((r) => setTimeout(r, 200));
const evs = (await (await fetch(`${base}/maindy/events?limit=50`, { headers: { "x-maindy-key": key } })).json()).events;
const status = await (await fetch(`${base}/maindy/status`, { headers: { "x-maindy-key": key } })).json();
check("4 eventos no outbox local (modo local)", evs.length === 4, `${evs.length}`);
const miss = evs.filter((e) => e.status === "ok");
const hits = evs.filter((e) => e.status === "cache_hit");
check("uso medido pelo provedor nos misses", miss.length === 2 && miss.every((e) => e.usage.source === "provider_reported" && e.usage.inputTokens > 0 && e.usage.outputTokens > 0), miss.map((e) => `${e.usage.inputTokens}/${e.usage.outputTokens}`).join(" "));
check("custo 0 locally_measured para ollama", evs.every((e) => e.cost.micros === 0 && e.cost.source === "locally_measured" && e.provider === "ollama"));
check("hits com baselineMethod cache_replay", hits.length === 2 && hits.every((e) => e.baselineMethod === "cache_replay" && e.cache.status === "hit"));
check("baseline do hit = 0 micros (modelo local: nenhuma economia monetária inventada)", hits.every((e) => e.baselineCost?.micros === 0));
check("tokens evitados registrados no exact_cache", hits.every((e) => e.techniques.some((t) => t.name === "exact_cache" && t.applied && t.tokensSaved > 0)));

// privacy scan: prompt marker must not appear in telemetry tables nor logs
const db = new DatabaseSync(join(home, "gateway.db"), { readOnly: true });
const tables = ["telemetry_outbox", "quota_snapshots", "kv", "seen_request_ids", "counters"];
const dump = tables.map((t) => JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all())).join("\n");
const cacheRows = db.prepare("SELECT COUNT(*) AS n FROM cache_entries").get().n;
db.close();
const logText = readFileSync(join(home, "gateway.log"), "utf8") + stdout;
check("nenhum texto de prompt nas tabelas de telemetria", !dump.includes(MARKER));
check("nenhum texto de prompt nos logs (arquivo + stdout)", !logText.includes(MARKER));
check("2 entradas de cache (respostas, não prompts)", cacheRows === 2, `${cacheRows}`);

stop();
const failed = checks.filter((c) => !c.ok);
const summary = { home, model: MODEL, counters: status.counters, checks: checks.length, failed: failed.length, events: evs.map((e) => ({ status: e.status, streaming: e.streaming, usage: e.usage, cost: e.cost, baselineMethod: e.baselineMethod, baselineCost: e.baselineCost, cache: e.cache.status, latencyMs: e.latencyMs })) };
console.log(JSON.stringify(summary, null, 2));
process.exit(failed.length ? 1 : 0);
