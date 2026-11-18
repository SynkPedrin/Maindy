import { describe, expect, it } from "vitest";
import type { OrbitPolicyDto, TechniqueName } from "@maindy/contracts";
import { activeTechniques, defaultPolicy, isPassthrough } from "../src/policy.js";
import {
  evaluate,
  exactMatch,
  referenceSimilarity,
  RegressionDetector,
  schemaValid,
  shouldSample,
  tokenOverlapF1,
  withFallback,
} from "../src/quality.js";
import { optimizeRequest } from "../src/pipeline.js";
import type { JsonObject, TextSlot } from "../src/types.js";

const pol = (p: Partial<OrbitPolicyDto>): OrbitPolicyDto => ({ ...defaultPolicy("balanced"), ...p });

describe("policy engine", () => {
  it("observe and paused are pure passthrough", () => {
    expect(activeTechniques(pol({ mode: "observe" })).size).toBe(0);
    expect(activeTechniques(pol({ mode: "maximum", paused: true })).size).toBe(0);
    expect(isPassthrough({ mode: "observe", paused: false })).toBe(true);
  });
  it("mode defaults apply", () => {
    expect([...activeTechniques(pol({ mode: "conservative" }))].sort()).toEqual(["exact_cache", "loop_guard", "retry_budget"]);
    const bal = activeTechniques(pol({ mode: "balanced" }));
    expect(bal.has("tool_output_compression")).toBe(true);
    expect(bal.has("output_budget")).toBe(false);
  });
  it("maximum: model_routing only with explicit mapping", () => {
    expect(activeTechniques(pol({ mode: "maximum" })).has("model_routing")).toBe(false);
    expect(activeTechniques(pol({ mode: "maximum" }), { routing: [{ from: "a", to: "b" }] }).has("model_routing")).toBe(true);
    expect(activeTechniques(pol({ mode: "maximum" })).has("output_budget")).toBe(true);
  });
  it("explicit technique states override defaults; rolledBack always wins", () => {
    const p = pol({
      mode: "conservative",
      techniques: [
        { name: "tool_output_compression", enabled: true, rolledBack: false, rolledBackReason: null },
        { name: "exact_cache", enabled: true, rolledBack: true, rolledBackReason: "regressão" },
        { name: "loop_guard", enabled: false, rolledBack: false, rolledBackReason: null },
        { name: "output_budget", enabled: true, rolledBack: false, rolledBackReason: null },
        { name: "semantic_cache", enabled: true, rolledBack: false, rolledBackReason: null },
      ],
    });
    const a = activeTechniques(p);
    expect(a.has("tool_output_compression")).toBe(true);
    expect(a.has("exact_cache")).toBe(false);
    expect(a.has("loop_guard")).toBe(false);
    expect(a.has("output_budget")).toBe(false); // not maximum
    expect(a.has("semantic_cache")).toBe(false); // never shipped
  });
  it("local Quality Guard rollbacks disable techniques", () => {
    expect(activeTechniques(pol({ mode: "balanced" }), {}, new Set<TechniqueName>(["context_dedup"])).has("context_dedup")).toBe(false);
  });
});

describe("quality guard", () => {
  it("sampling", () => {
    expect(shouldSample(0)).toBe(false);
    expect(shouldSample(1)).toBe(true);
    expect(shouldSample(0.5, () => 0.4)).toBe(true);
    expect(shouldSample(0.5, () => 0.6)).toBe(false);
  });
  it("evaluators", () => {
    expect(exactMatch("a ", "a").passed).toBe(true);
    expect(tokenOverlapF1("the cat sat", "the cat sat")).toBe(1);
    expect(tokenOverlapF1("a b", "c d")).toBe(0);
    expect(referenceSimilarity("Paris é a capital da França", "A capital da França é Paris").passed).toBe(true);
    expect(referenceSimilarity("Paris", "Berlin is nice").passed).toBe(false);
    expect(schemaValid('{"a":1}', { type: "object", required: ["a"], properties: { a: { type: "integer" } } }).passed).toBe(true);
    expect(schemaValid('{"a":"x"}', { type: "object", properties: { a: { type: "integer" } } }).passed).toBe(false);
    expect(schemaValid('{"a":1,"b":2}', { type: "object", properties: { a: {} }, additionalProperties: false }).detail).toContain("additional");
    expect(schemaValid("not json").detail).toBe("invalid JSON");
    expect(schemaValid('```json\n[1,2]\n```', { type: "array", items: { type: "number" } }).passed).toBe(true);
  });
  it("evaluate picks the strongest evaluator", () => {
    expect(evaluate({ reference: "x", candidate: '{"ok":true}', deterministic: true, wantsJson: true }).method).toBe("schema_valid");
    expect(evaluate({ reference: "same", candidate: "same", deterministic: true }).method).toBe("exact_match");
    expect(evaluate({ reference: "same", candidate: "different", deterministic: true }).method).toBe("reference_similarity");
  });
  it("regression detector emits a rollback signal once, after min samples", () => {
    const d = new RegressionDetector({ windowSize: 10, minSamples: 5, maxFailureRate: 0.2 });
    expect(d.record("context_dedup", true)).toBeNull();
    expect(d.record("context_dedup", false)).toBeNull();
    expect(d.record("context_dedup", false)).toBeNull(); // only 3 samples
    expect(d.record("context_dedup", true)).toBeNull();
    const sig = d.record("context_dedup", true); // 2/5 = 40% > 20%
    expect(sig).toMatchObject({ technique: "context_dedup", samples: 5 });
    expect(sig!.reason).toContain("Quality Guard");
    expect(d.isRolledBack("context_dedup")).toBe(true);
    expect(d.record("context_dedup", false)).toBeNull(); // no duplicate signal
    d.reset("context_dedup");
    expect(d.isRolledBack("context_dedup")).toBe(false);
  });
  it("healthy technique stays on (rolling window)", () => {
    const d = new RegressionDetector({ windowSize: 10, minSamples: 5, maxFailureRate: 0.2 });
    for (let i = 0; i < 50; i++) expect(d.record("exact_cache", i % 10 !== 0)).toBeNull();
  });
  it("withFallback: errors and latency overruns fall back to the original", () => {
    expect(withFallback(() => "orig", () => "opt", 10)).toMatchObject({ value: "opt", fallbackOriginal: false });
    expect(withFallback(() => "orig", () => { throw new Error("x"); }, 10)).toMatchObject({ value: "orig", fallbackOriginal: true });
    let t = 0;
    const slow = withFallback(() => "orig", () => ((t += 100), "opt"), 50, () => t);
    expect(slow).toMatchObject({ value: "orig", fallbackOriginal: true, reason: "latency budget exceeded" });
  });
});

/** Minimal OpenAI-chat slot builder for pipeline tests (real one lives in provider-adapters). */
function chatSlots(body: JsonObject): TextSlot[] {
  const msgs = body.messages as { role: string; content: string }[];
  return msgs.map((m, i) => ({
    messageIndex: i,
    kind: m.role === "tool" ? "tool_result" : (m.role as TextSlot["kind"]),
    get text() {
      return m.content;
    },
    set(v: string) {
      m.content = v;
    },
  }));
}

describe("optimizeRequest pipeline", () => {
  const log = Array.from({ length: 1500 }, (_, i) => `line ${i % 3 === 0 ? "progress" : i}`).join("\n");
  const body = {
    model: "gpt-6.2-sol",
    temperature: 0,
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "run tests" },
      { role: "tool", content: log },
    ],
  };

  it("does nothing when no body technique is active (original object returned)", () => {
    const r = optimizeRequest({ format: "openai_chat", body, buildSlots: chatSlots, active: new Set(["exact_cache"]), mode: "conservative", maxAddedLatencyMs: 50 });
    expect(r.body).toBe(body);
    expect(r.modified).toBe(false);
  });

  it("compresses tool results on a clone and reports tokensRemoved", () => {
    const r = optimizeRequest({ format: "openai_chat", body, buildSlots: chatSlots, active: new Set(["tool_output_compression"]), mode: "balanced", maxAddedLatencyMs: 1000 });
    expect(r.modified).toBe(true);
    expect(r.body).not.toBe(body);
    expect(body.messages[2]!.content).toBe(log); // original untouched
    expect((r.body.messages as { content: string }[])[2]!.content).toContain("[maindy:");
    expect(r.tokensRemoved).toBeGreaterThan(0);
    expect(r.tokensRemovedSource).toBe("locally_measured");
    expect(r.applications[0]).toMatchObject({ name: "tool_output_compression", applied: true });
  });

  it("falls back to the original on latency overrun", () => {
    let t = 0;
    const r = optimizeRequest({
      format: "openai_chat",
      body,
      buildSlots: (b) => ((t += 500), chatSlots(b)),
      active: new Set(["tool_output_compression"]),
      mode: "balanced",
      maxAddedLatencyMs: 50,
      now: () => t,
    });
    expect(r.fallbackOriginal).toBe(true);
    expect(r.body).toBe(body);
    expect(r.applications).toEqual([]);
  });

  it("falls back to the original on technique error", () => {
    const r = optimizeRequest({
      format: "openai_chat",
      body,
      buildSlots: () => {
        throw new TypeError("boom");
      },
      active: new Set(["context_dedup"]),
      mode: "balanced",
      maxAddedLatencyMs: 50,
    });
    expect(r).toMatchObject({ fallbackOriginal: true, body, fallbackReason: "technique error: TypeError" });
  });

  it("maximum mode: output budget + explicit routing are visible", () => {
    const r = optimizeRequest({
      format: "openai_chat",
      body: { model: "gpt-6.2-astra", messages: [{ role: "user", content: "hi" }] },
      buildSlots: chatSlots,
      active: new Set(["output_budget", "model_routing"]),
      mode: "maximum",
      extras: { routing: [{ from: "gpt-6.2-astra", to: "gpt-6.1-terra" }], outputBudgetTokens: 512 },
      maxAddedLatencyMs: 50,
    });
    expect(r.body).toMatchObject({ model: "gpt-6.1-terra", max_completion_tokens: 512 });
    expect(r.routedFrom).toBe("gpt-6.2-astra");
  });
});
