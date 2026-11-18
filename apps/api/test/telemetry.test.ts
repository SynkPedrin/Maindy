import { randomUUID } from "node:crypto";
import { SavingsSummary, type RequestUsageEvent } from "@maindy/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { savingsLedger } from "../src/db/schema.js";
import { aggregateEvents, computeSummary } from "../src/savings/math.js";
import { createTestApp, device, pairDevice, resetDb, signupVerified, usageEvent, web, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t));

const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

/** cache_replay + pre_optimization_tokens + none (+ a contradictory "none with a baseline value") */
function fixtures(): RequestUsageEvent[] {
  return [
    usageEvent({
      occurredAt: at(5),
      status: "cache_hit",
      costMicros: 0,
      baselineMicros: 10_000,
      baselineMethod: "cache_replay",
      cache: { status: "hit" },
      techniques: [{ name: "exact_cache", applied: true, tokensSaved: 150, source: "locally_measured" }],
    }),
    usageEvent({
      occurredAt: at(4),
      costMicros: 6_000,
      baselineMicros: 9_000,
      baselineMethod: "pre_optimization_tokens",
      overheadMicros: 500,
      cache: { status: "miss" },
      techniques: [{ name: "tool_output_compression", applied: true, tokensSaved: 400, source: "locally_measured" }],
    }),
    usageEvent({ occurredAt: at(3), costMicros: 4_000, baselineMicros: null, overheadMicros: 300, cache: { status: "miss" } }),
    usageEvent({
      occurredAt: at(2),
      costMicros: 2_000,
      baselineCost: { micros: 7_000, currency: "USD", source: "experimentally_estimated" },
      baselineMethod: "none",
      cache: { status: "bypass" },
    }),
  ];
}

async function setup() {
  const a = await signupVerified(t, "tel@exemplo.test");
  const d = await pairDevice(t, a.cookie);
  return { ...a, token: d.token };
}

describe("telemetry ingest", () => {
  it("is idempotent by eventId (same batch twice → duplicates) and keeps the ledger consistent", async () => {
    const a = await setup();
    const events = fixtures();
    const first = await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/events", payload: { events } });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ accepted: 4, duplicates: 0 });
    const second = await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/events", payload: { events } });
    expect(second.json()).toEqual({ accepted: 0, duplicates: 4 });

    const dupInBatch = usageEvent();
    const third = await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/events", payload: { events: [dupInBatch, dupInBatch] } });
    expect(third.json()).toEqual({ accepted: 1, duplicates: 1 });

    const ledger = await t.db.db.select().from(savingsLedger);
    expect(ledger.reduce((s, r) => s + r.requests, 0)).toBe(5);
    expect(ledger.reduce((s, r) => s + r.baselineMicros, 0)).toBe(19_000);
    expect(ledger.reduce((s, r) => s + r.costWithBaselineMicros, 0)).toBe(6_000);

    // web cannot ingest; device token required
    expect((await web(t.app, a.cookie, { method: "POST", url: "/v1/telemetry/events", payload: { events } })).statusCode).toBe(401);
  });

  it("rejects events far in the future and invalid payloads", async () => {
    const a = await setup();
    const future = usageEvent({ occurredAt: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    expect((await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/events", payload: { events: [future] } })).statusCode).toBe(400);
    const bad = { ...usageEvent(), promptHash: "not-a-hash" };
    const r = await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/events", payload: { events: [bad] } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("validation_error");
  });
});

describe("savings summary (ARCHITECTURE §6)", () => {
  it("counts a cache 'store' (miss whose response was cached) as a miss", async () => {
    const a = await setup();
    const events = [usageEvent({ cache: { status: "store" } }), usageEvent({ cache: { status: "hit" }, status: "cache_hit" }), usageEvent({ cache: { status: "disabled" } })];
    await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/events", payload: { events } });
    const s = (await web(t.app, a.cookie, { method: "GET", url: "/v1/stats/summary" })).json();
    expect(s.cache).toEqual({ hits: 1, misses: 1 });
  });

  it("computes baseline/gross/net/multiplier/coverage only over valid baselines", async () => {
    const a = await setup();
    await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/events", payload: { events: fixtures() } });
    const res = await web(t.app, a.cookie, { method: "GET", url: "/v1/stats/summary" });
    expect(res.statusCode).toBe(200);
    const s = SavingsSummary.parse(res.json());
    expect(s.requests).toBe(4);
    expect(s.optimizedAiCost).toEqual({ micros: 12_000, currency: "USD", source: "provider_reported" });
    expect(s.overheadCost.micros).toBe(800);
    expect(s.overheadCost.source).toBe("locally_measured");
    expect(s.baselineCost).toEqual({ micros: 19_000, currency: "USD", source: "experimentally_estimated" });
    expect(s.grossSavings.micros).toBe(13_000); // 19000 − 6000
    expect(s.netSavings.micros).toBe(12_200); // 19000 − (6000 + 800)
    expect(s.efficiencyMultiplier).toBeCloseTo(19_000 / 6_800, 4);
    expect(s.baselineCoverage).toBe(0.5);
    expect(s.tokens.avoided).toBe(550);
    expect(s.tokens.avoidedSource).toBe("locally_measured");
    expect(s.tokens.input).toBe(400);
    expect(s.cache).toEqual({ hits: 1, misses: 2 });
    expect(s.methodVersion).toBe("orbit-savings-v1");

    // SQL path agrees with the pure implementation
    const pure = computeSummary(aggregateEvents(fixtures(), "USD"), { evaluations: 0, passed: 0, rollbacks: 0 }, { from: new Date(s.from), to: new Date(s.to), currency: "USD" });
    expect({ ...s, optimizedAiCost: s.optimizedAiCost.micros, net: s.netSavings.micros, mult: s.efficiencyMultiplier }).toMatchObject({
      optimizedAiCost: pure.optimizedAiCost.micros,
      net: pure.netSavings.micros,
      mult: pure.efficiencyMultiplier,
    });

    // device token can read the summary too
    expect((await device(t.app, a.token, { method: "GET", url: "/v1/stats/summary" })).json().netSavings.micros).toBe(12_200);

    // timeseries carries sources per point
    const ts = await web(t.app, a.cookie, { method: "GET", url: "/v1/stats/timeseries?bucket=hour&from=" + encodeURIComponent(at(24)) });
    expect(ts.statusCode).toBe(200);
    const pts = ts.json().points;
    expect(pts.reduce((x: number, p: { requests: number }) => x + p.requests, 0)).toBe(4);
    expect(pts[0].optimizedAiCost.source).toBeDefined();
  });

  it("no valid baseline → savings unavailable and multiplier null", async () => {
    const a = await setup();
    await device(t.app, a.token, {
      method: "POST",
      url: "/v1/telemetry/events",
      payload: { events: [usageEvent({ costMicros: 3000 }), usageEvent({ costMicros: 1000 })] },
    });
    const s = (await web(t.app, a.cookie, { method: "GET", url: "/v1/stats/summary" })).json();
    expect(s.baselineCost).toEqual({ micros: 0, currency: "USD", source: "unavailable" });
    expect(s.netSavings.source).toBe("unavailable");
    expect(s.efficiencyMultiplier).toBeNull();
    expect(s.baselineCoverage).toBe(0);
    expect(s.optimizedAiCost.micros).toBe(4000);
  });

  it("empty period → zeros with unavailable sources", async () => {
    const a = await setup();
    const s = (await web(t.app, a.cookie, { method: "GET", url: "/v1/stats/summary" })).json();
    expect(s.requests).toBe(0);
    expect(s.optimizedAiCost.source).toBe("unavailable");
    expect(s.efficiencyMultiplier).toBeNull();
  });

  it("rejects inverted periods", async () => {
    const a = await setup();
    const r = await web(t.app, a.cookie, { method: "GET", url: `/v1/stats/summary?from=${encodeURIComponent(at(1))}&to=${encodeURIComponent(at(2))}` });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("invalid_period");
  });
});

describe("runs, quality, limits", () => {
  it("paginates runs with a cursor", async () => {
    const a = await setup();
    const events = Array.from({ length: 5 }, (_, i) => usageEvent({ occurredAt: at(i + 1) }));
    await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/events", payload: { events } });
    const p1 = (await web(t.app, a.cookie, { method: "GET", url: "/v1/runs?limit=2" })).json();
    expect(p1.items.map((e: RequestUsageEvent) => e.eventId)).toEqual([events[0]!.eventId, events[1]!.eventId]);
    const p2 = (await web(t.app, a.cookie, { method: "GET", url: `/v1/runs?limit=2&cursor=${p1.nextCursor}` })).json();
    expect(p2.items.map((e: RequestUsageEvent) => e.eventId)).toEqual([events[2]!.eventId, events[3]!.eventId]);
    const p3 = (await web(t.app, a.cookie, { method: "GET", url: `/v1/runs?limit=2&cursor=${p2.nextCursor}` })).json();
    expect(p3.items).toHaveLength(1);
    expect(p3.nextCursor).toBeNull();
    expect((await web(t.app, a.cookie, { method: "GET", url: "/v1/runs?cursor=lixo" })).statusCode).toBe(400);
  });

  it("quality evaluations are idempotent and a triggered rollback disables the technique in the policy", async () => {
    const a = await setup();
    await web(t.app, a.cookie, { method: "PUT", url: "/v1/orbit/policy", payload: { mode: "balanced" } });
    const ev = {
      evaluationId: randomUUID(),
      occurredAt: at(1),
      technique: "tool_output_compression",
      method: "test_suite",
      passed: false,
      score: 0.4,
      projectKey: null,
      detail: "2 testes falharam",
      triggeredRollback: true,
    };
    const r1 = await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/quality", payload: [ev] });
    expect(r1.json()).toEqual({ accepted: 1, duplicates: 0 });
    expect((await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/quality", payload: [ev] })).json()).toEqual({ accepted: 0, duplicates: 1 });
    const policy = (await web(t.app, a.cookie, { method: "GET", url: "/v1/orbit/policy" })).json();
    const tech = policy.techniques.find((x: { name: string }) => x.name === "tool_output_compression");
    expect(tech).toMatchObject({ enabled: false, rolledBack: true });
    const list = (await web(t.app, a.cookie, { method: "GET", url: "/v1/quality/evaluations" })).json();
    expect(list).toHaveLength(1);
    const s = (await web(t.app, a.cookie, { method: "GET", url: "/v1/stats/summary" })).json();
    expect(s.quality).toEqual({ evaluations: 1, passed: 0, rollbacks: 1 });
  });

  it("limits returns the latest snapshot per provider+product+window", async () => {
    const a = await setup();
    const snap = (window: string, used: number, minsAgo: number) => ({
      provider: "anthropic",
      product: "claude_code_subscription",
      window,
      usedPercentage: used,
      resetsAt: null,
      collectedVia: "claude_code.statusline",
      capturedAt: new Date(Date.now() - minsAgo * 60_000).toISOString(),
    });
    await device(t.app, a.token, { method: "POST", url: "/v1/telemetry/quota", payload: [snap("five_hour", 10, 30), snap("five_hour", 35, 5), snap("seven_day", 60, 10)] });
    const limits = (await device(t.app, a.token, { method: "GET", url: "/v1/limits" })).json();
    expect(limits).toHaveLength(2);
    expect(limits.find((l: { window: string }) => l.window === "five_hour").usedPercentage).toBe(35);
  });
});
