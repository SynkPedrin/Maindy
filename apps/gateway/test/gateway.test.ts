/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { RequestUsageEvent } from "@maindy/contracts";
import { mockServer, sse, startGateway, tempHome, waitFor, writePolicy, type MockServer } from "./helpers.js";

const OPENAI_KEY = "sk-test-SECRET-openai-0123456789";
const CLIENT_ANTHROPIC_KEY = "sk-ant-api03-SECRET-client-abcdef";
const SECRET_PROMPT = "PROMPT-SECRETO-NAO-PODE-VAZAR-42";

let openai: MockServer;
let anthropic: MockServer;

const chatJson = (content = "Olá!") => ({
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 1794970000,
  model: "gpt-6.2-sol-2026-09-01",
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10_000, completion_tokens: 500, total_tokens: 10_500, prompt_tokens_details: { cached_tokens: 2_000 } },
});

beforeAll(async () => {
  process.env.OPENAI_API_KEY = OPENAI_KEY;
  openai = await mockServer((req, res) => {
    const body = JSON.parse(req.body || "{}");
    if (body.model === "boom") {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "upstream exploded", type: "server_error" } }));
      return;
    }
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream", "x-request-id": "req_openai_stream" });
      const base = { id: "chatcmpl-2", object: "chat.completion.chunk", created: 1, model: "gpt-6.2-sol-2026-09-01" };
      const usageNull = body.stream_options?.include_usage ? { usage: null } : {};
      const chunks = [
        { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }], ...usageNull },
        { ...base, choices: [{ index: 0, delta: { content: "Olá" }, finish_reason: null }], ...usageNull },
        { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], ...usageNull },
      ];
      if (body.stream_options?.include_usage) {
        chunks.push({ ...base, choices: [], usage: { prompt_tokens: 1_000, completion_tokens: 3, total_tokens: 1_003, prompt_tokens_details: { cached_tokens: 0 } } } as never);
      }
      // write in two pieces to exercise chunk boundaries
      const text = sse(chunks);
      res.write(text.slice(0, 37));
      setTimeout(() => res.end(text.slice(37)), 5);
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "x-request-id": "req_openai_json" });
    res.end(JSON.stringify(chatJson()));
  });
  anthropic = await mockServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json", "request-id": "req_anthropic_1" });
    res.end(
      JSON.stringify({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "text", text: "Oi" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 100, cache_read_input_tokens: 1_000, cache_creation_input_tokens: 0, output_tokens: 50 },
      }),
    );
  });
});

afterAll(async () => {
  await openai.close();
  await anthropic.close();
});

const gws: { close(): Promise<void> }[] = [];
afterEach(async () => {
  while (gws.length) await gws.pop()!.close();
  openai.calls.length = 0;
  anthropic.calls.length = 0;
});

async function gateway(policy?: Parameters<typeof writePolicy>[1]) {
  const home = tempHome();
  if (policy) writePolicy(home, policy);
  const gw = await startGateway(home, { openai: openai.url, anthropic: anthropic.url });
  gws.push(gw);
  const key = readFileSync(join(home, "gateway.key"), "utf8").trim();
  const events = () => gw.ctx.db.listEvents(100);
  return { gw, home, key, events, url: gw.url };
}

const post = (url: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("home & security", () => {
  it("creates gateway.json, gateway.key, policy.json with 0600 and protects /maindy/*", async () => {
    const { home, url, key } = await gateway();
    for (const f of ["gateway.json", "gateway.key", "policy.json", "gateway.db"]) {
      expect(statSync(join(home, f)).mode & 0o777).toBe(0o600);
    }
    expect(JSON.parse(readFileSync(join(home, "policy.json"), "utf8")).mode).toBe("observe");
    expect((await fetch(`${url}/maindy/health`)).status).toBe(200);
    expect((await fetch(`${url}/maindy/status`)).status).toBe(401);
    expect((await fetch(`${url}/maindy/status`, { headers: { "x-maindy-key": "wrong" } })).status).toBe(401);
    const st = await (await fetch(`${url}/maindy/status`, { headers: { "x-maindy-key": key } })).json() as any;
    expect(st).toMatchObject({ mode: "observe", paused: false, linkedToCloud: false });
    expect(st.upstreams.find((u: { id: string }) => u.id === "openai").hasCredential).toBe(true);
  });

  it("listens on loopback only", async () => {
    const { gw } = await gateway();
    const addr = gw.app.server.address();
    expect(typeof addr === "object" && addr?.address).toBe("127.0.0.1");
  });
});

describe("OpenAI proxy (mocked upstream, priced model)", () => {
  it("non-stream: BYOK key injected, micros computed from list price, no key/prompt in logs or telemetry", async () => {
    const { url, events, home } = await gateway();
    const r = await post(url, "/v1/chat/completions", { model: "gpt-6.2-sol", messages: [{ role: "user", content: SECRET_PROMPT }] });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-maindy-request-id")).toMatch(/[0-9a-f-]{36}/);
    expect(await r.json()).toEqual(chatJson());
    expect(openai.calls[0]!.headers.authorization).toBe(`Bearer ${OPENAI_KEY}`);
    const ev = await waitFor(() => events()[0]);
    expect(RequestUsageEvent.safeParse(ev).success).toBe(true);
    // 8000 uncached × $2 + 2000 cached × $0.10 + 500 out × $10 = 16000 + 200 + 5000
    expect(ev).toMatchObject({
      connector: "openai_api",
      provider: "openai",
      model: "gpt-6.2-sol-2026-09-01",
      status: "ok",
      usage: { inputTokens: 10_000, cachedInputTokens: 2_000, outputTokens: 500, source: "provider_reported" },
      cost: { micros: 21_200, currency: "USD", source: "locally_measured" },
      pricingVersion: "2026-11-18",
      baselineMethod: "none",
      baselineCost: null,
    });
    const log = readFileSync(join(home, "gateway.log"), "utf8");
    expect(log).not.toContain(OPENAI_KEY);
    expect(log).not.toContain(SECRET_PROMPT);
    expect(JSON.stringify(events())).not.toContain(SECRET_PROMPT);
    expect(JSON.stringify(events())).not.toContain(OPENAI_KEY);
  });

  it("client's own Authorization is passed through verbatim (BYOK env not used)", async () => {
    const { url } = await gateway();
    await post(url, "/v1/chat/completions", { model: "gpt-6.2-sol", messages: [] }, { authorization: "Bearer sk-client-own" });
    expect(openai.calls[0]!.headers.authorization).toBe("Bearer sk-client-own");
  });

  it("stream: injects include_usage, strips usage chunk + usage:null for the client, still measures usage", async () => {
    const { url, events } = await gateway();
    const r = await post(url, "/v1/chat/completions", { model: "gpt-6.2-sol", stream: true, messages: [{ role: "user", content: "x" }] });
    const text = await r.text();
    expect(JSON.parse(openai.calls[0]!.body).stream_options).toEqual({ include_usage: true });
    expect(text).not.toContain('"usage"');
    expect(text).toContain('"content":"Olá"');
    expect(text.trim().endsWith("data: [DONE]")).toBe(true);
    const ev = await waitFor(() => events()[0]);
    expect(ev.usage).toMatchObject({ inputTokens: 1_000, outputTokens: 3, source: "provider_reported" });
    expect(ev.cost.micros).toBe(1_000 * 2 + 3 * 10);
    expect(ev.streaming).toBe(true);
  });

  it("stream: when the client asked for usage, chunks are passed byte-for-byte", async () => {
    const { url } = await gateway();
    const r = await post(url, "/v1/chat/completions", { model: "gpt-6.2-sol", stream: true, stream_options: { include_usage: true }, messages: [] });
    const text = await r.text();
    expect(text).toContain('"usage":null');
    expect(text).toContain('"prompt_tokens":1000');
  });

  it("upstream errors are forwarded and recorded with a normalized code", async () => {
    const { url, events } = await gateway();
    const r = await post(url, "/v1/chat/completions", { model: "boom", messages: [] });
    expect(r.status).toBe(500);
    const ev = await waitFor(() => events()[0]);
    expect(ev).toMatchObject({ status: "error", httpStatus: 500, errorCode: "upstream_error" });
  });

  it("unreachable upstream → 502 in OpenAI error format", async () => {
    const home = tempHome();
    const gw = await startGateway(home, { openai: "http://127.0.0.1:9" });
    gws.push(gw);
    const r = await post(gw.url, "/v1/chat/completions", { model: "gpt-6.2-sol", messages: [] });
    expect(r.status).toBe(502);
    expect(((await r.json()) as any).error.type).toBe("maindy_upstream_unreachable");
  });
});

describe("Anthropic proxy", () => {
  it("forwards x-api-key / anthropic-version / anthropic-beta verbatim, never stores them, prices cache reads", async () => {
    const { url, events, home } = await gateway();
    const r = await post(
      url,
      "/v1/messages?beta=true",
      { model: "claude-sonnet-5-5", max_tokens: 100, messages: [{ role: "user", content: SECRET_PROMPT }] },
      { "x-api-key": CLIENT_ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-beta": "prompt-caching-2024-07-31", "user-agent": "claude-cli/2.1.0 (external, cli)" },
    );
    expect(r.status).toBe(200);
    const call = anthropic.calls[0]!;
    expect(call.url).toBe("/v1/messages?beta=true");
    expect(call.headers["x-api-key"]).toBe(CLIENT_ANTHROPIC_KEY);
    expect(call.headers["anthropic-beta"]).toBe("prompt-caching-2024-07-31");
    expect(call.headers["anthropic-version"]).toBe("2023-06-01");
    const ev = await waitFor(() => events()[0]);
    // 100 × $2 + 1000 cached × $0.10 + 50 × $10 = 200 + 100 + 500
    expect(ev).toMatchObject({ connector: "claude_code", provider: "anthropic", cost: { micros: 800 }, usage: { inputTokens: 1_100, cachedInputTokens: 1_000 } });
    const db = new DatabaseSync(join(home, "gateway.db"));
    const dump = JSON.stringify([
      db.prepare("SELECT * FROM telemetry_outbox").all(),
      db.prepare("SELECT * FROM kv").all(),
      db.prepare("SELECT * FROM seen_request_ids").all(),
    ]);
    db.close();
    expect(dump).not.toContain(CLIENT_ANTHROPIC_KEY);
    expect(dump).not.toContain(SECRET_PROMPT);
    expect(dump).toContain("req_anthropic_1"); // request id remembered for OTel dedupe
    expect(readFileSync(join(home, "gateway.log"), "utf8")).not.toContain(CLIENT_ANTHROPIC_KEY);
  });
});

describe("ORBIT techniques through the gateway", () => {
  it("exact cache: deterministic request → store then hit with identical body and cache_replay baseline", async () => {
    const { url, events } = await gateway({ mode: "conservative" });
    const body = { model: "gpt-6.2-sol", temperature: 0, messages: [{ role: "user", content: "capital da França?" }] };
    const a = await post(url, "/v1/chat/completions", body);
    expect(a.headers.get("x-maindy-cache")).toBe("miss");
    const textA = await a.text();
    const b = await post(url, "/v1/chat/completions", body);
    expect(b.headers.get("x-maindy-cache")).toBe("hit");
    expect(await b.text()).toBe(textA);
    expect(openai.calls).toHaveLength(1);
    const evs = await waitFor(() => (events().length === 2 ? events() : null));
    const hit = evs.find((e) => e.status === "cache_hit")!;
    expect(hit).toMatchObject({
      cost: { micros: 0 },
      baselineMethod: "cache_replay",
      baselineCost: { micros: 21_200, source: "experimentally_estimated" },
      cache: { status: "hit" },
    });
    expect(hit.techniques.find((t) => t.name === "exact_cache")).toMatchObject({ applied: true, tokensSaved: 10_500 });
    expect(evs.find((e) => e.status === "ok")!.cache.status).toBe("store");
  });

  it("exact cache bypass: temperature unset, x-maindy-no-cache, observe mode", async () => {
    const { url } = await gateway({ mode: "conservative" });
    await post(url, "/v1/chat/completions", { model: "gpt-6.2-sol", messages: [] });
    const r = await post(url, "/v1/chat/completions", { model: "gpt-6.2-sol", messages: [] });
    expect(r.headers.get("x-maindy-cache")).toBe("bypass");
    const body = { model: "gpt-6.2-sol", temperature: 0, messages: [] };
    await post(url, "/v1/chat/completions", body, { "x-maindy-no-cache": "1" });
    await post(url, "/v1/chat/completions", body, { "x-maindy-no-cache": "1" });
    expect(openai.calls).toHaveLength(4);
  });

  it("stream cache replays SSE (without the injected usage chunk)", async () => {
    const { url } = await gateway({ mode: "conservative" });
    const body = { model: "gpt-6.2-sol", temperature: 0, stream: true, messages: [{ role: "user", content: "oi" }] };
    const first = await (await post(url, "/v1/chat/completions", body)).text();
    const r2 = await post(url, "/v1/chat/completions", body);
    expect(r2.headers.get("x-maindy-cache")).toBe("hit");
    expect(await r2.text()).toBe(first);
    expect(openai.calls).toHaveLength(1);
  });

  it("tool output compression (balanced): smaller upstream body + pre_optimization_tokens baseline", async () => {
    const { url, events } = await gateway({ mode: "balanced" });
    const log = Array.from({ length: 3000 }, (_, i) => `PASS test ${i}`).join("\n") + "\nFAIL src/x.test.ts";
    const body = {
      model: "gpt-6.2-sol",
      messages: [
        { role: "user", content: "rode os testes" },
        { role: "tool", tool_call_id: "1", content: log },
      ],
    };
    await post(url, "/v1/chat/completions", body);
    const sent = JSON.parse(openai.calls[0]!.body);
    expect(sent.messages[1].content.length).toBeLessThan(log.length / 2);
    expect(sent.messages[1].content).toContain("FAIL src/x.test.ts");
    expect(sent.messages[1].content).toMatch(/\[maindy: \d+ linhas omitidas\]/);
    const ev = await waitFor(() => events()[0]);
    const t = ev.techniques.find((x) => x.name === "tool_output_compression")!;
    expect(t.applied).toBe(true);
    expect(ev.baselineMethod).toBe("pre_optimization_tokens");
    // savings = removed tokens × uncached input price ($2/MTok → 2 micros/token)
    expect(ev.baselineCost!.micros - ev.cost.micros).toBe(t.tokensSaved * 2);
  });

  it("observe mode never modifies the request (byte-identical passthrough)", async () => {
    const { url } = await gateway();
    const raw = JSON.stringify({ model: "gpt-6.2-sol", messages: [{ role: "tool", tool_call_id: "1", content: "x\n".repeat(5000) }] });
    await fetch(`${url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: raw });
    expect(openai.calls[0]!.body).toBe(raw);
  });

  it("pause is immediate and fail-open; resume restores optimization", async () => {
    const { url, key } = await gateway({ mode: "conservative" });
    const body = { model: "gpt-6.2-sol", temperature: 0, messages: [{ role: "user", content: "p" }] };
    await post(url, "/maindy/pause", {}, { "x-maindy-key": key });
    await post(url, "/v1/chat/completions", body);
    const r = await post(url, "/v1/chat/completions", body);
    expect(r.headers.get("x-maindy-cache")).toBe("disabled");
    expect(openai.calls).toHaveLength(2);
    await post(url, "/maindy/resume", {}, { "x-maindy-key": key });
    await post(url, "/v1/chat/completions", body);
    expect((await post(url, "/v1/chat/completions", body)).headers.get("x-maindy-cache")).toBe("hit");
  });

  it("loop guard blocks a runaway identical loop in balanced mode with a clear 429", async () => {
    const { url, events } = await gateway({ mode: "balanced" });
    const body = { model: "gpt-6.2-sol", messages: [{ role: "user", content: "loop" }] };
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await post(url, "/v1/chat/completions", body)).status);
    expect(statuses.slice(0, 7).every((s) => s === 200)).toBe(true);
    expect(statuses[7]).toBe(429);
    const blocked = await waitFor(() => events().find((e) => e.status === "blocked"));
    expect(blocked.errorCode).toBe("maindy_loop_guard");
  });
});

describe("OTLP receiver", () => {
  const attr = (key: string, v: string | number) => ({ key, value: typeof v === "number" ? (Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }) : { stringValue: v } });
  const claudeLogs = (requestId: string) => ({
    resourceLogs: [
      {
        resource: { attributes: [attr("service.name", "claude-code"), attr("session.id", "sess-1")] },
        scopeLogs: [
          {
            logRecords: [
              {
                timeUnixNano: "1794970000000000000",
                body: { stringValue: "claude_code.api_request" },
                attributes: [
                  attr("event.name", "api_request"),
                  attr("model", "claude-sonnet-5-5"),
                  attr("cost_usd", 0.0123),
                  attr("duration_ms", 1500),
                  attr("input_tokens", 10),
                  attr("output_tokens", 200),
                  attr("cache_read_tokens", 5000),
                  attr("cache_creation_tokens", "300"),
                  attr("request_id", requestId),
                ],
              },
              { body: { stringValue: "claude_code.tool_result" }, attributes: [attr("event.name", "tool_result")] },
            ],
          },
        ],
      },
    ],
  });

  it("parses Claude Code api_request into a provider_reported event and dedupes by request_id", async () => {
    const { url, events } = await gateway();
    const r = await post(url, "/v1/logs", claudeLogs("req_cc_1"));
    expect(r.status).toBe(200);
    await post(url, "/v1/logs", claudeLogs("req_cc_1"));
    const evs = events();
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      connector: "claude_code",
      model: "claude-sonnet-5-5",
      sessionKey: "sess-1",
      latencyMs: 1500,
      usage: { inputTokens: 5310, outputTokens: 200, cachedInputTokens: 5000, cacheWriteTokens: 300, source: "provider_reported" },
      cost: { micros: 12_300, source: "provider_reported" },
      pricingVersion: "claude-code-otel-list-estimate",
      baselineMethod: "none",
      occurredAt: "2026-11-18T02:46:40.000Z",
    });
  });

  it("skips OTel records already metered by the proxy (ANTHROPIC_BASE_URL mode)", async () => {
    const { url, events } = await gateway();
    await post(url, "/v1/messages", { model: "claude-sonnet-5-5", max_tokens: 5, messages: [] }, { "x-api-key": "k" });
    await post(url, "/v1/logs", claudeLogs("req_anthropic_1"));
    expect(events()).toHaveLength(1);
  });

  it("tolerant Codex parsing (attribute name variants)", async () => {
    const { url, events } = await gateway();
    await post(url, "/v1/logs", {
      resourceLogs: [
        {
          resource: { attributes: [attr("service.name", "codex_cli_rs")] },
          scopeLogs: [
            {
              logRecords: [
                { attributes: [attr("event.name", "codex.sse_event"), attr("event.kind", "response.created")] },
                {
                  attributes: [
                    attr("event.name", "codex.sse_event"),
                    attr("event.kind", "response.completed"),
                    attr("model", "gpt-6.2-sol"),
                    attr("input_token_count", 1000),
                    attr("cached_token_count", 400),
                    attr("output_token_count", 100),
                    attr("conversation.id", "conv-9"),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const evs = events();
    expect(evs).toHaveLength(1);
    // 600×2 + 400×0.1 + 100×10 = 1200 + 40 + 1000
    expect(evs[0]).toMatchObject({ connector: "codex", sessionKey: "conv-9", cost: { micros: 2240, source: "experimentally_estimated" } });
  });

  it("rejects protobuf with 415 and accepts metrics", async () => {
    const { url } = await gateway();
    const r = await fetch(`${url}/v1/logs`, { method: "POST", headers: { "content-type": "application/x-protobuf" }, body: "x" });
    expect(r.status).toBe(415);
    expect((await post(url, "/v1/metrics", { resourceMetrics: [] })).status).toBe(200);
  });
});

describe("status line, compress, local events", () => {
  it("statusline → QuotaSnapshots stored + outbox, counters returned", async () => {
    const { url, key, gw } = await gateway();
    const body = {
      session_id: "s",
      model: { id: "claude-sonnet-5-5", display_name: "Sonnet 5.5" },
      cost: { total_cost_usd: 0.42 },
      rate_limits: { five_hour: { used_percentage: 22.5, resets_at: 1794990000 }, seven_day: { used_percentage: 41, resets_at: "2026-11-20T00:00:00Z" } },
    };
    const r = await (await post(url, "/maindy/statusline", body, { "x-maindy-key": key })).json() as any;
    expect(r.ok).toBe(true);
    expect(r.quotas).toHaveLength(2);
    expect(r.quotas[0]).toMatchObject({ provider: "anthropic", product: "claude_code_subscription", window: "five_hour", usedPercentage: 22.5, collectedVia: "claude_code.statusline", resetsAt: "2026-11-18T08:20:00.000Z" });
    expect(r.counters).toMatchObject({ requests: 0, savedSource: "unavailable" });
    await post(url, "/maindy/statusline", body, { "x-maindy-key": key });
    expect(gw.ctx.db.pendingCount("quota")).toBe(2); // unchanged values are not re-enqueued
    expect(gw.ctx.db.quotas()).toHaveLength(2);
  });

  it("compress honors policy (observe → not applied) and compresses in balanced", async () => {
    const big = Array.from({ length: 2000 }, (_, i) => `npm WARN deprecated pkg-${i % 5}@1.0.0`).join("\n");
    const obs = await gateway();
    const r0 = await (await post(obs.url, "/maindy/compress", { text: big }, { "x-maindy-key": obs.key })).json() as any;
    expect(r0).toMatchObject({ applied: false, reason: "policy" });
    const bal = await gateway({ mode: "balanced" });
    const r1 = await (await post(bal.url, "/maindy/compress", { text: big, toolName: "Bash" }, { "x-maindy-key": bal.key })).json() as any;
    expect(r1.applied).toBe(true);
    expect(r1.tokensSaved).toBeGreaterThan(200);
    expect(r1.text.length).toBeLessThan(big.length);
    expect(r1.source).toBe("experimentally_estimated");
    expect(readFileSync(join(bal.home, "gateway.log"), "utf8")).not.toContain("npm WARN deprecated");
  });

  it("GET /maindy/events and /maindy/summary in local mode", async () => {
    const { url, key } = await gateway({ mode: "conservative" });
    const body = { model: "gpt-6.2-sol", temperature: 0, messages: [{ role: "user", content: "s" }] };
    await post(url, "/v1/chat/completions", body);
    await post(url, "/v1/chat/completions", body);
    await new Promise((r) => setTimeout(r, 50));
    const ev = await (await fetch(`${url}/maindy/events`, { headers: { "x-maindy-key": key } })).json() as any;
    expect(ev.linkedToCloud).toBe(false);
    expect(ev.events).toHaveLength(2);
    const s = await (await fetch(`${url}/maindy/summary`, { headers: { "x-maindy-key": key } })).json() as any;
    expect(s).toMatchObject({ requests: 2, cache: { hits: 1, misses: 1 }, baselineCoverage: 0.5, grossSavings: { micros: 21_200 } });
  });
});

describe("telemetry flush to the control plane", () => {
  it("batches with Bearer device token, retries with backoff, never re-sends after 2xx", async () => {
    let fail = true;
    const api = await mockServer((req, res) => {
      if (fail) {
        res.writeHead(503).end();
        return;
      }
      const n = JSON.parse(req.body).events?.length ?? 0;
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ accepted: n, duplicates: 0 }));
    });
    const home = tempHome();
    process.env.MAINDY_DEVICE_TOKEN = "dev-token-xyz";
    process.env.GATEWAY_API_URL = api.url;
    try {
      const gw = await startGateway(home, { openai: openai.url });
      gws.push(gw);
      expect(existsSync(join(home, "device.json"))).toBe(false);
      await post(gw.url, "/v1/chat/completions", { model: "gpt-6.2-sol", messages: [] });
      await post(gw.url, "/v1/chat/completions", { model: "gpt-6.2-sol", messages: [] });
      await waitFor(() => gw.ctx.db.pendingCount("usage") === 2);
      const now = Date.now();
      expect(await gw.ctx.flusher.flushAll(now)).toEqual({ sent: 0, failed: 2 });
      expect(await gw.ctx.flusher.flushAll(now + 1000)).toEqual({ sent: 0, failed: 0 }); // backing off
      fail = false;
      expect(await gw.ctx.flusher.flushAll(now + 6000)).toEqual({ sent: 2, failed: 0 });
      expect(await gw.ctx.flusher.flushAll(now + 60_000)).toEqual({ sent: 0, failed: 0 });
      const calls = api.calls.filter((c) => c.url === "/v1/telemetry/events");
      expect(calls[0]!.headers.authorization).toBe("Bearer dev-token-xyz");
      const ids = JSON.parse(calls.at(-1)!.body).events.map((e: { eventId: string }) => e.eventId);
      expect(new Set(ids).size).toBe(2);
    } finally {
      delete process.env.MAINDY_DEVICE_TOKEN;
      delete process.env.GATEWAY_API_URL;
      await api.close();
    }
  });
});

describe("Quality Guard (shadow sampling + rollback)", () => {
  it("paired shadow sample: overhead recorded, paired_sample baseline, regression → local rollback", async () => {
    const up = await mockServer((req, res) => {
      const compressed = req.body.includes("[maindy:");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ...chatJson(compressed ? "resposta totalmente diferente xyz" : "o teste que falhou foi src/x.test.ts") }));
    });
    const home = tempHome();
    writePolicy(home, { mode: "balanced", qualitySampleRate: 1 });
    const gw = await startGateway(home, { openai: up.url });
    gws.push(gw);
    const log = Array.from({ length: 3000 }, (_, i) => `PASS test ${i}`).join("\n");
    try {
      for (let i = 0; i < 5; i++) {
        await post(gw.url, "/v1/chat/completions", { model: "gpt-6.2-sol", temperature: 0, messages: [{ role: "user", content: `q${i}` }, { role: "tool", tool_call_id: "1", content: log }] }, { "x-maindy-no-cache": "1" });
      }
      const evs = await waitFor(() => (gw.ctx.db.listEvents(10).length === 5 ? gw.ctx.db.listEvents(10) : null), 5000);
      expect(evs.every((e) => e.baselineMethod === "paired_sample" && e.overheadCost.micros === 21_200)).toBe(true);
      expect(gw.ctx.db.pendingCount("quality")).toBe(5);
      expect(gw.ctx.policy.localRollbacks().has("tool_output_compression")).toBe(true);
      // after rollback the next request goes out uncompressed
      up.calls.length = 0;
      await post(gw.url, "/v1/chat/completions", { model: "gpt-6.2-sol", messages: [{ role: "tool", tool_call_id: "1", content: log }] }, { "x-maindy-no-cache": "1" });
      expect(up.calls[0]!.body).not.toContain("[maindy:");
    } finally {
      await up.close();
    }
  });
});
