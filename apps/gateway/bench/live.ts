/**
 * Live benchmark against an ALREADY RUNNING gateway (e.g. the one inside the desktop app), linked to a
 * real maindy. account. Unlike bench/run.ts (isolated gateways), this sends real traffic through the
 * user's own gateway so the results land in the user's dashboard as measured events.
 *
 * Phases: the org policy is switched via the API to `observe` (baseline), workloads run, then to
 * `balanced`, workloads run again. Same deterministic request sequence in both phases.
 *
 * Usage:
 *   MAINDY_COOKIE=<maindy_session value> pnpm --filter @maindy/gateway exec tsx bench/live.ts \
 *     [--gateway http://127.0.0.1:8787] [--api http://localhost:4100] [--home ~/.maindy]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { workloads } from "./workloads.js";

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1]! : d;
};
const GW = arg("--gateway", "http://127.0.0.1:8787");
const API = arg("--api", "http://localhost:4100");
const WEB = arg("--web", "http://localhost:3100");
const HOME = arg("--home", process.env.MAINDY_HOME ?? join(homedir(), ".maindy"));
const COOKIE = process.env.MAINDY_COOKIE;
if (!COOKIE) throw new Error("defina MAINDY_COOKIE (valor do cookie maindy_session da conta)");
const KEY = readFileSync(join(HOME, "gateway.key"), "utf8").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { "content-type": "application/json", cookie: `maindy_session=${COOKIE}`, "x-maindy-csrf": "1", origin: WEB, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function setMode(mode: "observe" | "balanced"): Promise<{ mode: string; paused: boolean; linkedToCloud: boolean }> {
  await api("/v1/orbit/policy", { method: "PUT", body: JSON.stringify({ mode, qualitySampleRate: 0 }) });
  for (let i = 0; i < 90; i++) {
    const st = (await (await fetch(`${GW}/maindy/status`, { headers: { "x-maindy-key": KEY } })).json()) as { mode: string; paused: boolean; linkedToCloud: boolean };
    if (st.mode === mode && !st.paused) return st;
    await sleep(1000);
  }
  throw new Error(`gateway não assumiu o modo ${mode} em 90 s (está vinculado à conta?)`);
}

type Row = { mode: string; workload: string; request: string; cache: string; prompt: number; completion: number; ms: number; passed: boolean | null; eventId: string; assertion: string | null };

async function run(mode: "observe" | "balanced") {
  const st = await setMode(mode);
  console.log(`\n== modo ${mode} (gateway vinculado=${st.linkedToCloud}) ==`);
  const rows: Row[] = [];
  for (const w of workloads()) {
    for (const r of w.requests) {
      const t0 = performance.now();
      const res = await fetch(`${GW}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-maindy-upstream": "ollama", "x-maindy-project": `bench-${w.id}`, "x-maindy-agent": "bench-live" },
        body: JSON.stringify(r.body),
      });
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const answer = String(j.choices?.[0]?.message?.content ?? "");
      const cache = res.headers.get("x-maindy-cache") ?? "";
      const row: Row = {
        mode,
        workload: w.id,
        request: r.id,
        cache,
        // a cache hit never reached the provider: 0 tokens were consumed
        prompt: cache === "hit" ? 0 : (j.usage?.prompt_tokens ?? 0),
        completion: cache === "hit" ? 0 : (j.usage?.completion_tokens ?? 0),
        ms: Math.round(performance.now() - t0),
        passed: r.assert ? r.assert.test(answer) : null,
        eventId: res.headers.get("x-maindy-request-id") ?? "",
        assertion: r.assert?.description ?? null,
      };
      rows.push(row);
      console.log(`[${mode}] ${w.id}/${r.id} ${res.status} cache=${cache} in=${row.prompt} out=${row.completion} ${row.ms}ms ${row.passed === null ? "" : row.passed ? "PASS" : "FAIL"}`);
    }
  }
  await fetch(`${GW}/maindy/flush`, { method: "POST", headers: { "x-maindy-key": KEY } });
  return rows;
}

/**
 * Report task-specific quality checks of the optimized phase to the account's Quality Guard:
 * one evaluation per (request with an assertion) × (technique the gateway actually applied to it).
 */
async function reportQuality(rows: Row[]) {
  const device = JSON.parse(readFileSync(join(HOME, "device.json"), "utf8")) as { deviceToken?: string; token?: string };
  const token = device.deviceToken ?? device.token;
  const events = (await (await fetch(`${GW}/maindy/events?limit=1000`, { headers: { "x-maindy-key": KEY } })).json()) as {
    events?: { eventId: string; techniques: { name: string; applied: boolean }[] }[];
  };
  const list = events.events ?? [];
  const byId = new Map(list.map((e) => [e.eventId, e]));
  const evals = rows.flatMap((r) => {
    if (r.passed === null) return [];
    const applied = (byId.get(r.eventId)?.techniques ?? []).filter((t) => t.applied).map((t) => t.name);
    return applied.map((technique) => ({
      evaluationId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      technique,
      method: "test_suite",
      passed: r.passed,
      score: r.passed ? 1 : 0,
      projectKey: `bench-${r.workload}`,
      detail: `benchmark ao vivo: ${r.assertion}`.slice(0, 500),
      triggeredRollback: false,
    }));
  });
  if (!evals.length || !token) return console.log("qualidade: nada a reportar");
  const res = await fetch(`${API}/v1/telemetry/quality`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(evals) });
  console.log(`qualidade: ${evals.length} avaliações enviadas → ${res.status}`);
}

const observe = await run("observe");
const balanced = await run("balanced");
await reportQuality(balanced);

console.log("\n| Carga | Tokens Observar | Tokens Equilibrado | Redução | Qualidade (obs / eq) |");
console.log("|---|---|---|---|---|");
for (const w of workloads()) {
  const t = (rs: Row[]) => rs.filter((r) => r.workload === w.id).reduce((a, r) => a + r.prompt + r.completion, 0);
  const q = (rs: Row[]) => {
    const a = rs.filter((r) => r.workload === w.id && r.passed !== null);
    return `${a.filter((r) => r.passed).length}/${a.length}`;
  };
  const o = t(observe), b = t(balanced);
  console.log(`| ${w.title} | ${o} | ${b} | ${o ? (((o - b) / o) * 100).toFixed(1) : "0"}% | ${q(observe)} / ${q(balanced)} |`);
}
console.log("\nTokens = contagens reportadas pelo Ollama (provider_reported). Eventos enviados à conta; veja /app/overview e /app/economia.");
