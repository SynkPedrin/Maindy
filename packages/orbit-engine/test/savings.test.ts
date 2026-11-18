import { describe, expect, it } from "vitest";
import type { RequestUsageEvent } from "@maindy/contracts";
import {
  cacheReplayBaseline,
  hasValidBaseline,
  pairedSampleBaseline,
  preOptimizationBaseline,
  promptCacheHintBaseline,
  requestSavings,
  summarizeSavings,
  weakestSource,
} from "../src/savings.js";
import { costForUsage } from "../src/pricing.js";

const usage = (inputTokens: number, outputTokens: number, cachedInputTokens = 0, cacheWriteTokens = 0, source: RequestUsageEvent["usage"]["source"] = "provider_reported") => ({
  inputTokens,
  outputTokens,
  cachedInputTokens,
  cacheWriteTokens,
  source,
});
const usd = (micros: number, source: RequestUsageEvent["cost"]["source"] = "locally_measured") => ({ micros, currency: "USD", source });

let n = 0;
function ev(p: Partial<RequestUsageEvent>): RequestUsageEvent {
  n++;
  return {
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    occurredAt: "2026-11-18T12:00:00.000Z",
    connector: "openai_api",
    provider: "openai",
    model: "gpt-6.2-sol",
    endpoint: "/v1/chat/completions",
    projectKey: null,
    agentKey: null,
    sessionKey: null,
    streaming: false,
    status: "ok",
    httpStatus: 200,
    latencyMs: 100,
    orbitMode: "balanced",
    usage: usage(1000, 100),
    cost: usd(3000),
    pricingVersion: "2026-11-18",
    baselineCost: null,
    baselineMethod: "none",
    overheadCost: usd(0),
    techniques: [],
    cache: { status: "miss" },
    promptHash: "a".repeat(64),
    fallbackOriginal: false,
    errorCode: null,
    ...p,
  };
}

const RANGE = { from: "2026-11-18T00:00:00.000Z", to: "2026-11-18T23:59:59.999Z" };

describe("per-request baselines", () => {
  it("cache_replay = cost of the original stored usage (keeps its cached split)", () => {
    // original: 10k prompt of which 8k were provider-cached
    const orig = usage(10_000, 500, 8_000);
    const b = cacheReplayBaseline("gpt-6.2-sol", orig);
    // 2000×2 + 8000×0.1 + 500×10 = 4000 + 800 + 5000 = 9800
    expect(b.baselineMethod).toBe("cache_replay");
    expect(b.baselineCost).toEqual({ micros: 9800, currency: "USD", source: "experimentally_estimated" });
    // NOT the uncached list price (would be 25000) — provider caching is not MAINDY savings
    expect(b.baselineCost!.micros).toBeLessThan(costForUsage("gpt-6.2-sol", usage(10_000, 500)).cost.micros);
  });

  it("cache_replay with unknown model or unavailable usage → none", () => {
    expect(cacheReplayBaseline("mystery", usage(1, 1)).baselineMethod).toBe("none");
    expect(cacheReplayBaseline("gpt-6.2-sol", usage(1, 1, 0, 0, "unavailable")).baselineMethod).toBe("none");
  });

  it("cache_replay for a local model is 0 (no money saved)", () => {
    const b = cacheReplayBaseline("qwen3.5:4b", usage(100, 100), { provider: "ollama" });
    expect(b.baselineCost?.micros).toBe(0);
  });

  it("pre_optimization_tokens adds removed tokens as uncached input only", () => {
    const actual = usage(5_000, 200, 4_000); // provider cached 4k of the (already compressed) prompt
    const b = preOptimizationBaseline("gpt-6.2-sol", actual, 3_000);
    const actualCost = costForUsage("gpt-6.2-sol", actual).cost;
    // savings must be exactly the removed tokens at the uncached price: 3000 × $2 = 6000 micros
    const s = requestSavings(actualCost, usd(0), b);
    expect(s.gross?.micros).toBe(6000);
    expect(b.baselineMethod).toBe("pre_optimization_tokens");
  });

  it("pre_optimization_tokens with 0 removed → none", () => {
    expect(preOptimizationBaseline("gpt-6.2-sol", usage(10, 10), 0).baselineMethod).toBe("none");
  });

  it("prompt cache hint baseline prices every prompt token uncached (can be negative)", () => {
    // first call: cache write of 5000 on sonnet → write premium makes savings negative
    const first = usage(6_000, 100, 0, 5_000);
    const c1 = costForUsage("claude-sonnet-5-5", first).cost;
    const s1 = requestSavings(c1, usd(0), promptCacheHintBaseline("claude-sonnet-5-5", first));
    // baseline 6000×2 + 100×10 = 13000; actual 1000×2 + 5000×2.5 + 1000 = 15500 → −2500
    expect(s1.gross?.micros).toBe(-2500);
    // second call: 5000 cache reads → 5000×(2−0.1) = 9500 saved
    const second = usage(6_000, 100, 5_000, 0);
    const c2 = costForUsage("claude-sonnet-5-5", second).cost;
    expect(requestSavings(c2, usd(0), promptCacheHintBaseline("claude-sonnet-5-5", second)).gross?.micros).toBe(9500);
  });

  it("prompt cache hint baseline is none without provider cache activity", () => {
    expect(promptCacheHintBaseline("claude-sonnet-5-5", usage(6000, 1)).baselineMethod).toBe("none");
  });

  it("paired_sample uses the measured shadow cost", () => {
    const b = pairedSampleBaseline(usd(1234, "locally_measured"));
    expect(b).toMatchObject({ baselineMethod: "paired_sample", baselineCost: { micros: 1234, source: "experimentally_estimated" } });
    expect(pairedSampleBaseline(usd(0, "unavailable")).baselineMethod).toBe("none");
  });

  it("requestSavings: net subtracts overhead; null without baseline or with unavailable cost", () => {
    const b = { baselineCost: usd(10_000, "experimentally_estimated"), baselineMethod: "cache_replay" as const, detail: "" };
    expect(requestSavings(usd(0), usd(500), b)).toEqual({
      gross: { micros: 10_000, currency: "USD", source: "experimentally_estimated" },
      net: { micros: 9_500, currency: "USD", source: "experimentally_estimated" },
    });
    expect(requestSavings(usd(0), usd(0), { baselineCost: null, baselineMethod: "none", detail: "" })).toEqual({ gross: null, net: null });
    expect(requestSavings(usd(0, "unavailable"), usd(0), b)).toEqual({ gross: null, net: null });
  });
});

describe("summarizeSavings", () => {
  it("empty → zeros, unavailable sources, null multiplier", () => {
    const s = summarizeSavings([], RANGE);
    expect(s.requests).toBe(0);
    expect(s.efficiencyMultiplier).toBeNull();
    expect(s.baselineCoverage).toBe(0);
    expect(s.grossSavings.source).toBe("unavailable");
    expect(s.optimizedAiCost.source).toBe("unavailable");
  });

  it("no baseline anywhere → no savings, multiplier null even with costs", () => {
    const s = summarizeSavings([ev({}), ev({})], RANGE);
    expect(s.optimizedAiCost.micros).toBe(6000);
    expect(s.grossSavings.micros).toBe(0);
    expect(s.netSavings.micros).toBe(0);
    expect(s.efficiencyMultiplier).toBeNull();
    expect(s.baselineCoverage).toBe(0);
  });

  it("computes gross/net/multiplier/coverage over valid baselines only", () => {
    const events = [
      // cache hit: cost 0, baseline 9000
      ev({ status: "cache_hit", cost: usd(0), baselineCost: usd(9000, "experimentally_estimated"), baselineMethod: "cache_replay", cache: { status: "hit" } }),
      // compressed request: cost 3000, baseline 5000
      ev({ baselineCost: usd(5000, "experimentally_estimated"), baselineMethod: "pre_optimization_tokens", techniques: [{ name: "tool_output_compression", applied: true, tokensSaved: 1000, source: "locally_measured" }] }),
      // plain request: cost 3000, no baseline, overhead 1000 (shadow sample)
      ev({ overheadCost: usd(1000) }),
      // baseline method set but baselineCost null → ignored
      ev({ baselineMethod: "cache_replay", baselineCost: null }),
    ];
    const s = summarizeSavings(events, RANGE);
    expect(s.requests).toBe(4);
    expect(s.optimizedAiCost.micros).toBe(9000);
    expect(s.baselineCost.micros).toBe(14_000);
    expect(s.grossSavings.micros).toBe(11_000); // 14000 − (0 + 3000)
    expect(s.netSavings.micros).toBe(10_000); // − total overhead 1000
    expect(s.efficiencyMultiplier).toBe(3.5); // 14000 / (3000 + 1000)
    expect(s.baselineCoverage).toBe(0.5);
    expect(s.cache).toEqual({ hits: 1, misses: 3 });
    expect(s.tokens.avoided).toBe(1000);
    expect(s.tokens.avoidedSource).toBe("locally_measured");
    expect(s.grossSavings.source).toBe("experimentally_estimated");
  });

  it("multiplier null when every baseline request cost 0 and no overhead (division by zero)", () => {
    const s = summarizeSavings([ev({ cost: usd(0), baselineCost: usd(100, "experimentally_estimated"), baselineMethod: "cache_replay" })], RANGE);
    expect(s.grossSavings.micros).toBe(100);
    expect(s.efficiencyMultiplier).toBeNull();
  });

  it("multiplier null when quality is not approved", () => {
    const s = summarizeSavings([ev({ baselineCost: usd(6000, "experimentally_estimated"), baselineMethod: "paired_sample" })], { ...RANGE, qualityApproved: false });
    expect(s.grossSavings.micros).toBe(3000);
    expect(s.efficiencyMultiplier).toBeNull();
  });

  it("never counts provider-native caching as savings: provider cached tokens with baselineMethod none contribute 0", () => {
    const s = summarizeSavings([ev({ usage: usage(10_000, 10, 9_000), cost: usd(2000) })], RANGE);
    expect(s.tokens.cachedInput).toBe(9000);
    expect(s.grossSavings.micros).toBe(0);
    expect(s.tokens.avoided).toBe(0);
  });

  it("idempotent: duplicated eventIds count once; out-of-range excluded", () => {
    const e = ev({ baselineCost: usd(5000, "experimentally_estimated"), baselineMethod: "cache_replay", cost: usd(0) });
    const out = ev({ occurredAt: "2026-11-19T01:00:00.000Z" });
    const s = summarizeSavings([e, { ...e }, out], RANGE);
    expect(s.requests).toBe(1);
    expect(s.baselineCost.micros).toBe(5000);
  });

  it("ignores unavailable costs and other currencies", () => {
    const s = summarizeSavings(
      [
        ev({ cost: usd(0, "unavailable"), baselineCost: usd(5000, "experimentally_estimated"), baselineMethod: "cache_replay" }),
        ev({ cost: { micros: 100, currency: "BRL", source: "locally_measured" } }),
      ],
      RANGE,
    );
    expect(s.optimizedAiCost.micros).toBe(0);
    expect(s.baselineCost.micros).toBe(0);
    expect(s.baselineCoverage).toBe(0);
  });

  it("aggregate cost source is the weakest contributing one", () => {
    const s = summarizeSavings([ev({ cost: usd(1, "provider_reported") }), ev({ cost: usd(1, "experimentally_estimated") })], RANGE);
    expect(s.optimizedAiCost.source).toBe("experimentally_estimated");
    expect(weakestSource(["provider_reported", "locally_measured"])).toBe("locally_measured");
    expect(weakestSource(["unavailable"])).toBe("unavailable");
  });

  it("hasValidBaseline guards", () => {
    expect(hasValidBaseline(ev({ baselineMethod: "none", baselineCost: usd(1) }))).toBe(false);
    expect(hasValidBaseline(ev({ baselineMethod: "cache_replay", baselineCost: usd(1, "unavailable") }))).toBe(false);
    expect(hasValidBaseline(ev({ baselineMethod: "cache_replay", baselineCost: usd(1) }))).toBe(true);
  });
});
