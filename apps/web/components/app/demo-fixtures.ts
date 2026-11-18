/**
 * Client-side demo fixtures. Rendered ONLY inside <DemoFrame/> ("Demonstração — dados simulados").
 * Never sent to the API, never persisted, never mixed with tenant data.
 */
import type { SavingsSummary } from "@maindy/contracts";
import type { RunDto, TimeseriesPoint } from "@/lib/api/schemas";

const M = 1_000_000;
const DAY = 86_400_000;

/** Deterministic pseudo-random so screenshots and tests are stable. */
function seeded(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function demoSeries(days = 14, end = new Date()): TimeseriesPoint[] {
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() - (days - 1) * DAY;
  return Array.from({ length: days }, (_, i) => {
    const ramp = Math.min(1, i / 5); // observation → optimisation
    const baseline = Math.round((13 + seeded(i) * 6 + (i % 7 === 5 || i % 7 === 6 ? -5.5 : 0)) * M);
    const optimized = Math.round(baseline * (1 - 0.34 * ramp - seeded(i + 99) * 0.05 * ramp));
    const overhead = Math.round(baseline * 0.012 * ramp);
    return {
      at: new Date(start + i * DAY).toISOString(),
      requests: Math.round(380 + seeded(i + 7) * 240),
      baselineMicros: baseline,
      optimizedMicros: optimized,
      overheadMicros: overhead,
      netSavingsMicros: baseline - optimized - overhead,
      tokensAvoided: Math.round((baseline - optimized) / 3.1),
      // ~3.1 USD per million input tokens (illustrative)
      baselineSource: "experimentally_estimated" as const,
      optimizedSource: "provider_reported" as const,
    };
  });
}

export function demoSummary(series = demoSeries()): SavingsSummary {
  const sum = (f: (p: TimeseriesPoint) => number) => series.reduce((a, p) => a + f(p), 0);
  const baseline = sum((p) => p.baselineMicros ?? 0);
  const optimized = sum((p) => p.optimizedMicros ?? 0);
  const overhead = sum((p) => p.overheadMicros ?? 0);
  const requests = sum((p) => p.requests);
  return {
    from: series[0]?.at ?? new Date().toISOString(),
    to: new Date().toISOString(),
    currency: "USD",
    requests,
    optimizedAiCost: { micros: optimized, currency: "USD", source: "provider_reported" },
    overheadCost: { micros: overhead, currency: "USD", source: "locally_measured" },
    baselineCost: { micros: baseline, currency: "USD", source: "experimentally_estimated" },
    grossSavings: { micros: baseline - optimized, currency: "USD", source: "experimentally_estimated" },
    netSavings: { micros: baseline - optimized - overhead, currency: "USD", source: "experimentally_estimated" },
    efficiencyMultiplier: Math.round((baseline / (optimized + overhead)) * 100) / 100,
    tokens: {
      input: 18_420_000,
      output: 2_310_000,
      cachedInput: 4_120_000,
      avoided: sum((p) => p.tokensAvoided),
      avoidedSource: "locally_measured",
    },
    cache: { hits: Math.round(requests * 0.18), misses: Math.round(requests * 0.82) },
    quality: { evaluations: 412, passed: 405, rollbacks: 1 },
    baselineCoverage: 0.82,
    methodVersion: "orbit-savings-v1",
  };
}

const runSeed: Array<[string, string, string, string, number, number, number | null, string[]]> = [
  ["anthropic", "claude-sonnet-4-5", "claude_code", "ok", 2140, 41_200, 66_900, ["tool_output_compression", "context_dedup"]],
  ["openai", "gpt-5-mini", "openai_api", "cache_hit", 38, 0, 3_100, ["exact_cache"]],
  ["openai", "gpt-5", "openai_api", "ok", 3920, 88_400, 92_100, ["prompt_cache_hints"]],
  ["ollama", "qwen3.5:4b", "openai_compatible", "ok", 610, 0, null, []],
  ["anthropic", "claude-haiku-4-5", "local_agent_sdk", "fallback", 1280, 6_900, 6_900, []],
  ["openai", "gpt-5-mini", "openai_api", "blocked", 4, 0, 1_850, ["loop_guard"]],
];

export function demoRuns(now = Date.now()): RunDto[] {
  return runSeed.map(([provider, model, connector, status, latencyMs, cost, baseline, techniques], i) => ({
    id: `demo-${i}`,
    occurredAt: new Date(now - (i * 7 + 2) * 60_000).toISOString(),
    provider,
    model,
    connector,
    status,
    latencyMs,
    projectKey: i % 2 ? "api-checkout" : "agente-suporte",
    usage: { inputTokens: 12_000 - i * 1500, outputTokens: 900 + i * 40, source: "provider_reported" as const },
    cost: { micros: cost, currency: "USD", source: "provider_reported" as const },
    baselineCost: baseline == null ? null : { micros: baseline, currency: "USD", source: "experimentally_estimated" as const },
    techniques: techniques.map((name) => ({ name, applied: true, tokensSaved: 1200 + i * 300, source: "locally_measured" as const })),
    fallbackOriginal: status === "fallback",
  }));
}

export const demoTechniqueBreakdown = [
  { key: "tool_output_compression", savingsMicros: 9.4 * M, tokens: 2_840_000 },
  { key: "exact_cache", savingsMicros: 6.1 * M, tokens: 1_620_000 },
  { key: "context_dedup", savingsMicros: 3.3 * M, tokens: 960_000 },
  { key: "prompt_cache_hints", savingsMicros: 1.9 * M, tokens: 0 },
  { key: "loop_guard", savingsMicros: 1.2 * M, tokens: 310_000 },
];
export const demoModelBreakdown = [
  { key: "claude-sonnet-4-5", savingsMicros: 10.8 * M, tokens: 2_910_000 },
  { key: "gpt-5", savingsMicros: 7.2 * M, tokens: 1_880_000 },
  { key: "gpt-5-mini", savingsMicros: 3.9 * M, tokens: 940_000 },
];
export const demoProjectBreakdown = [
  { key: "agente-suporte", savingsMicros: 12.1 * M, tokens: 3_100_000 },
  { key: "api-checkout", savingsMicros: 6.6 * M, tokens: 1_720_000 },
  { key: "pipeline-dados", savingsMicros: 3.2 * M, tokens: 910_000 },
];
