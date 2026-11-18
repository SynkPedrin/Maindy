import { describe, expect, it } from "vitest";
import { costForUsage, findModelPrice, normalizeModelId, PRICING_VERSION } from "../src/pricing.js";
import { countTokens, isOpenAiFamily } from "../src/tokens.js";

const u = (inputTokens: number, outputTokens: number, cachedInputTokens = 0, cacheWriteTokens = 0) => ({
  inputTokens,
  outputTokens,
  cachedInputTokens,
  cacheWriteTokens,
  source: "provider_reported" as const,
});

describe("pricing", () => {
  it("has a version string", () => {
    expect(PRICING_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("normalizes model ids conservatively", () => {
    expect(normalizeModelId("Claude-Sonnet-5-5-20261001")).toBe("claude-sonnet-5-5");
    expect(normalizeModelId("claude-opus-5-5[1m]")).toBe("claude-opus-5-5");
    expect(normalizeModelId("openai/gpt-6.2-sol")).toBe("gpt-6.2-sol");
    expect(normalizeModelId("gpt-6.2-sol-2026-09-01")).toBe("gpt-6.2-sol");
    expect(findModelPrice("gpt-6.2-sol-mini")).toBeNull();
  });

  it("prices plain input/output in micros (USD/MTok == micros/token)", () => {
    // sonnet: 1000 in × $2 + 500 out × $10 = 2000 + 5000 micros
    const r = costForUsage("claude-sonnet-5-5", u(1000, 500));
    expect(r.cost).toEqual({ micros: 7000, currency: "USD", source: "locally_measured" });
    expect(r.priced).toBe(true);
    expect(r.pricingVersion).toBe(PRICING_VERSION);
  });

  it("prices cached input and cache writes separately (input includes them)", () => {
    // opus: total 10_000 prompt = 6_000 uncached + 3_000 cached + 1_000 write(5m); 100 out
    // 6000×4 + 3000×0.2 + 1000×5 + 100×20 = 24000 + 600 + 5000 + 2000 = 31600
    expect(costForUsage("claude-opus-5-5", u(10_000, 100, 3_000, 1_000)).cost.micros).toBe(31_600);
  });

  it("supports long-TTL cache writes", () => {
    // opus: 1000 writes, 400 of them 1h: 600×5 + 400×8 = 3000 + 3200
    const r = costForUsage("claude-opus-5-5", { inputTokens: 1000, outputTokens: 0, cacheWriteTokens: 1000, cacheWriteLongTokens: 400, source: "provider_reported" });
    expect(r.cost.micros).toBe(6200);
  });

  it("applies the Haiku >100K tier to the whole request", () => {
    const small = costForUsage("claude-haiku-5-5", u(100_000, 1000));
    // 100000×0.1 + 1000×0.5 = 10000 + 500
    expect(small.cost.micros).toBe(10_500);
    const big = costForUsage("claude-haiku-5-5", u(100_001, 1000));
    // 100001×0.5 + 1000×2.5 = 50000.5 + 2500 → 52501 (rounded once)
    expect(big.cost.micros).toBe(52_501);
    expect(big.detail).toContain("tier");
  });

  it("applies OpenAI long-context multipliers above 272K", () => {
    const r = costForUsage("gpt-6.2-sol", u(300_000, 1000, 100_000));
    // uncached 200000×2×2 + cached 100000×0.1×2 + out 1000×10×1.5 = 800000 + 20000 + 15000
    expect(r.cost.micros).toBe(835_000);
    expect(r.detail).toContain("long context");
    // gpt-5.4-mini has no long-context rule
    expect(costForUsage("gpt-5.4-mini", u(300_000, 0)).cost.micros).toBe(225_000);
  });

  it("handles fractional prices exactly (0.075)", () => {
    // mini: 1000 cached × 0.075 = 75 micros; no cache-write price → billed as input
    expect(costForUsage("gpt-5.4-mini", u(1000, 0, 1000)).cost.micros).toBe(75);
    expect(costForUsage("gpt-5.4-mini", u(1000, 0, 0, 1000)).cost.micros).toBe(750);
  });

  it("batch halves the cost", () => {
    expect(costForUsage("gpt-6.1-terra", u(1000, 1000), { batch: true }).cost.micros).toBe(3000);
  });

  it("local providers cost 0 locally_measured", () => {
    const r = costForUsage("qwen3.5:4b", u(100, 100), { provider: "ollama" });
    expect(r.cost).toEqual({ micros: 0, currency: "USD", source: "locally_measured" });
    expect(costForUsage("anything", u(1, 1), { local: true }).cost.source).toBe("locally_measured");
  });

  it("unknown model → unavailable, never guessed", () => {
    const r = costForUsage("mystery-model-9", u(1000, 1000));
    expect(r.cost).toEqual({ micros: 0, currency: "USD", source: "unavailable" });
    expect(r.priced).toBe(false);
  });

  it("estimated tokens give an estimated cost; unavailable usage gives unavailable", () => {
    expect(costForUsage("gpt-6.2-sol", { ...u(1000, 0), source: "experimentally_estimated" }).cost.source).toBe("experimentally_estimated");
    expect(costForUsage("gpt-6.2-sol", { ...u(1000, 0), source: "unavailable" }).cost.source).toBe("unavailable");
  });

  it("clamps inconsistent usage (cached > input)", () => {
    expect(costForUsage("claude-sonnet-5-5", u(100, 0, 500)).cost.micros).toBe(10);
  });
});

describe("tokens", () => {
  it("uses o200k for OpenAI-family models", () => {
    const r = countTokens("hello world", "gpt-6.2-sol");
    expect(r).toMatchObject({ method: "o200k_base", estimate: false, source: "locally_measured" });
    expect(r.tokens).toBe(2);
    expect(isOpenAiFamily("o4-mini")).toBe(true);
  });
  it("other families: o200k as a flagged proxy, char rule only for huge texts", () => {
    const r = countTokens("hello world", "claude-sonnet-5-5");
    expect(r).toMatchObject({ tokens: 2, method: "o200k_proxy", estimate: true, source: "experimentally_estimated" });
    expect(countTokens("", "qwen3.5:4b").tokens).toBe(0);
    const huge = countTokens("a".repeat(36), "qwen3.5:4b", 1_000_000);
    expect(huge).toMatchObject({ tokens: 10, method: "heuristic_chars", estimate: true, source: "experimentally_estimated" });
    // the size hint keeps a before/after pair on one method
    expect(countTokens("short", "qwen3.5:4b", 300_000).method).toBe("heuristic_chars");
    expect(countTokens("a".repeat(36), "gpt-6.2-sol", 3_000_000)).toMatchObject({ method: "heuristic_chars", source: "experimentally_estimated" });
  });
});
