#!/usr/bin/env node
/**
 * E2E real: conta → verificação de e-mail (Mailpit) → pareamento de dispositivo → gateway local
 * vinculado à API → requisições reais ao Ollama → telemetria → /v1/stats/summary e /v1/runs.
 *
 * Pré-requisitos: infra (pnpm infra:up), API em :4100, Ollama em :11434 com qwen3.5:4b,
 * gateway buildado (pnpm --filter @maindy/gateway build).
 *
 * Uso: node scripts/e2e-cloud-link.mjs [--email x@y] [--password ...] [--keep]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API = process.env.API_URL ?? "http://localhost:4100";
const WEB = process.env.WEB_URL ?? "http://localhost:3100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
const MODEL = process.env.E2E_MODEL ?? "qwen3.5:4b";
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const email = arg("--email", `e2e-${Date.now()}@maindy.local`);
const password = arg("--password", `E2e-${Math.random().toString(36).slice(2)}-Senha!`);
const keep = args.includes("--keep");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = "GET", body, cookie, token, csrf = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (token) headers.authorization = `Bearer ${token}`;
  if (csrf) { headers["x-maindy-csrf"] = "1"; headers.origin = WEB; }
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

// 1. conta
const signup = await api("/v1/auth/signup", { method: "POST", body: { name: "Teste E2E", email, password, acceptTerms: true, planCode: "pro" } });
check("cadastro 201", signup.status === 201, String(signup.status));

// 2. e-mail de verificação real no Mailpit
let token;
for (let i = 0; i < 30 && !token; i++) {
  const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
  const id = list.messages?.[0]?.ID;
  if (id) {
    const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
    token = (msg.Text ?? msg.HTML ?? "").match(/verificar-email\?token=([A-Za-z0-9_\-]+)/)?.[1];
  }
  if (!token) await sleep(1000);
}
check("e-mail de verificação recebido", !!token);

const verify = await api("/v1/auth/verify-email", { method: "POST", body: { token } });
const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0];
check("verificação cria sessão", verify.status === 200 && cookie.startsWith("maindy_session="), String(verify.status));

// 3. pareamento de dispositivo (fluxo device code)
const start = await api("/v1/devices/pair/start", { method: "POST", body: { deviceName: "E2E Mac", platform: "macos", arch: "arm64", appVersion: "0.1.0" } });
check("pair/start", start.status === 200 || start.status === 201, start.json.userCode);
const pending = await api("/v1/devices/pair/poll", { method: "POST", body: { deviceCode: start.json.deviceCode } });
check("poll antes da aprovação = pending", pending.json.status === "pending");
const approve = await api("/v1/devices/pair/approve", { method: "POST", cookie, csrf: true, body: { userCode: start.json.userCode, approve: true } });
check("aprovação pela web", approve.status < 300, String(approve.status));
const poll = await api("/v1/devices/pair/poll", { method: "POST", body: { deviceCode: start.json.deviceCode } });
const deviceToken = poll.json.deviceToken;
check("token entregue ao dispositivo", poll.json.status === "approved" && !!deviceToken);
const again = await api("/v1/devices/pair/poll", { method: "POST", body: { deviceCode: start.json.deviceCode } });
check("token entregue só uma vez", again.json.status !== "approved" || !again.json.deviceToken, again.json.status);

// 4. política ORBIT: Equilibrado (via token do dispositivo)
const pol = await api("/v1/orbit/policy", { token: deviceToken });
const put = await api("/v1/orbit/policy", { method: "PUT", token: deviceToken, body: { ...pol.json, mode: "balanced", qualitySampleRate: 0 } });
check("política → balanced", put.status === 200 && put.json.mode === "balanced", `v${put.json.version}`);

// 5. gateway local vinculado à nuvem
const home = mkdtempSync(join(tmpdir(), "maindy-e2e-"));
const port = 8790 + Math.floor(Math.random() * 100);
const gw = spawn(process.execPath, ["apps/gateway/dist/maindy-gateway.mjs", "--port", String(port), "--home", home], {
  env: { ...process.env, MAINDY_DEVICE_TOKEN: deviceToken, GATEWAY_API_URL: API, OLLAMA_BASE_URL: "http://127.0.0.1:11434" },
  stdio: ["ignore", "pipe", "pipe"],
});
let gwOut = ""; gw.stdout.on("data", (d) => (gwOut += d)); gw.stderr.on("data", (d) => (gwOut += d));
const GW = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(GW + "/maindy/health")).ok) break; } catch {} await sleep(500); }
const key = readFileSync(join(home, "gateway.key"), "utf8").trim();
const admin = (p, method = "GET") => fetch(GW + p, { method, headers: { "x-maindy-key": key } }).then((r) => r.json());
let status = await admin("/maindy/status");
for (let i = 0; i < 20 && status.mode !== "balanced"; i++) { await sleep(1000); status = await admin("/maindy/status"); }
check("gateway vinculado e com política da nuvem", status.linkedToCloud === true && status.mode === "balanced", `${status.mode}, linked=${status.linkedToCloud}`);

async function chat(messages, extra = {}) {
  const t0 = Date.now();
  const r = await fetch(GW + "/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-maindy-upstream": "ollama", "x-maindy-project": "e2e-demo", "x-maindy-agent": "e2e-agent" },
    body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 48, reasoning_effort: "none", messages, ...extra }),
  });
  const j = await r.json();
  return { status: r.status, cache: r.headers.get("x-maindy-cache"), content: j.choices?.[0]?.message?.content ?? "", ms: Date.now() - t0 };
}

// 5a. requisição determinística repetida (cache exato)
const q = [{ role: "user", content: "Responda apenas com o número: quanto é 17 + 25?" }];
const a1 = await chat(q);
const a2 = await chat(q);
check("1ª chamada vai ao provedor (miss)", a1.status === 200 && a1.cache !== "hit", `${a1.cache} ${a1.ms}ms`);
check("repetição servida do cache, idêntica", a2.status === 200 && a2.cache === "hit" && a2.content === a1.content, `${a2.cache} ${a2.ms}ms`);

// 5b. agente com saída de ferramenta verbosa (compressão estruturada)
const noisy = Array.from({ length: 220 }, (_, i) => (i % 11 === 5 ? `  ✓ cart.test.ts > soma itens (${i}ms)` : `[info] npm http fetch GET 200 https://registry.npmjs.org/pkg-${i % 7} ${i}ms`)).join("\n")
  + "\n  ✗ discount.test.ts > aplica cupom de 10%\n    AssertionError: expected 90 to equal 81\n" + "[info] retrying ECONNREFUSED 127.0.0.1:5432\n".repeat(40);
const tool = [
  { role: "user", content: "Rode os testes e me diga qual teste falhou." },
  { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "bash", arguments: "{\"cmd\":\"npm test\"}" } }] },
  { role: "tool", tool_call_id: "c1", content: noisy },
];
const b1 = await chat(tool, { max_tokens: 64 });
check("agente com logs grandes respondeu", b1.status === 200, `${b1.ms}ms`);
check("qualidade: modelo ainda encontra o teste que falhou", /discount/i.test(b1.content), JSON.stringify(b1.content.slice(0, 90)));

// 6. telemetria → nuvem
await admin("/maindy/flush", "POST");
await sleep(1500);
await admin("/maindy/flush", "POST");
status = await admin("/maindy/status");
check("outbox de telemetria esvaziado", status.counters.pendingTelemetry === 0, `pending=${status.counters.pendingTelemetry}`);

const from = new Date(Date.now() - 3600_000).toISOString(), to = new Date(Date.now() + 60_000).toISOString();
const sum = await api(`/v1/stats/summary?from=${from}&to=${to}`, { token: deviceToken });
check("resumo na nuvem conta as requisições", sum.status === 200 && sum.json.requests >= 3, `requests=${sum.json.requests}`);
check("tokens evitados medidos (> 0)", sum.json.tokens?.avoided > 0, `avoided=${sum.json.tokens?.avoided} (${sum.json.tokens?.avoidedSource})`);
check("cache hit registrado", sum.json.cache?.hits >= 1, `hits=${sum.json.cache?.hits}`);
check("Ollama local: custo 0, sem economia em dinheiro inventada", sum.json.optimizedAiCost?.micros === 0 && sum.json.netSavings?.micros === 0);
const runs = await api(`/v1/runs?limit=10`, { cookie });
const items = runs.json.items ?? runs.json;
check("últimas operações visíveis na web", Array.isArray(items) && items.length >= 3, `${items.length} eventos`);
const techniques = new Set(items.flatMap((e) => (e.techniques ?? []).filter((t) => t.applied).map((t) => t.name)));
check("técnicas aplicadas registradas", techniques.size > 0, [...techniques].join(", "));

// 7. privacidade: nenhum texto do prompt no servidor
const report = await api(`/v1/reports/savings?format=json&from=${from}&to=${to}`, { cookie });
const blob = JSON.stringify(report.json) + JSON.stringify(items);
check("nenhum texto de prompt na nuvem", !blob.includes("17 + 25") && !blob.includes("discount.test.ts > aplica"));
check("gateway sem prompts no log", !gwOut.includes("17 + 25"));

gw.kill();
if (!keep) {
  const del = await api("/v1/account", { method: "DELETE", cookie, csrf: true, body: { confirm: "EXCLUIR", password } });
  check("conta de teste removida", del.status < 300, String(del.status));
} else {
  console.log(`\nConta mantida: ${email} / ${password}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`);
process.exit(failed.length ? 1 : 0);
