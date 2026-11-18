/**
 * Savings math — ARCHITECTURE §6, implemented locally in apps/api (method SAVINGS_METHOD_VERSION).
 *
 * Per request:
 *   valid baseline  ⇔ baselineCost != null AND baselineMethod != "none" AND baseline currency == cost currency
 * Over a period:
 *   optimizedAiCost  = Σ cost (all requests)
 *   overheadCost     = Σ overhead (all requests)
 *   baselineCost     = Σ baseline (valid-baseline requests only)
 *   grossSavings     = baselineCost − Σ cost (valid-baseline requests only)
 *   netSavings       = baselineCost − (Σ cost over valid-baseline requests + Σ overhead over ALL requests)
 *                      (conservative: every cent of MAINDY overhead is charged against savings)
 *   efficiencyMultiplier = baselineCost / (Σ cost over valid-baseline requests + Σ overhead)
 *                      null when baselineCost = 0 or the denominator is 0
 *   baselineCoverage = valid-baseline requests / requests (0 when no requests)
 * Native provider discounts (e.g. prompt caching) are already inside the measured cost of the baseline, so
 * they never count as MAINDY savings.
 */
import { SAVINGS_METHOD_VERSION, type MeasurementSource, type RequestUsageEvent, type SavingsSummary } from "@maindy/contracts";

export interface SavingsAggregate {
  requests: number;
  requestsWithBaseline: number;
  costMicros: number;
  costWithBaselineMicros: number;
  overheadMicros: number;
  baselineMicros: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  tokensAvoided: number;
  cacheHits: number;
  cacheMisses: number;
  costSources: string[];
  overheadSources: string[];
  avoidedSources: string[];
}

export interface QualityAggregate {
  evaluations: number;
  passed: number;
  rollbacks: number;
}

export const EMPTY_AGGREGATE: SavingsAggregate = {
  requests: 0,
  requestsWithBaseline: 0,
  costMicros: 0,
  costWithBaselineMicros: 0,
  overheadMicros: 0,
  baselineMicros: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  tokensAvoided: 0,
  cacheHits: 0,
  cacheMisses: 0,
  costSources: [],
  overheadSources: [],
  avoidedSources: [],
};

const STRENGTH: Record<MeasurementSource, number> = {
  provider_reported: 0,
  locally_measured: 1,
  experimentally_estimated: 2,
  unavailable: 3,
};

const isSource = (s: string): s is MeasurementSource => s in STRENGTH;

/** Weakest provenance among contributing sources (ignoring "unavailable" unless it is the only one). */
export function weakestSource(sources: readonly string[]): MeasurementSource {
  const known = sources.filter(isSource);
  const usable = known.filter((s) => s !== "unavailable");
  if (usable.length === 0) return "unavailable";
  return usable.reduce((a, b) => (STRENGTH[b] > STRENGTH[a] ? b : a));
}

export function hasValidBaseline(e: Pick<RequestUsageEvent, "baselineCost" | "baselineMethod" | "cost">): boolean {
  return e.baselineCost !== null && e.baselineMethod !== "none" && e.baselineCost.currency === e.cost.currency;
}

export function tokensAvoidedOf(e: Pick<RequestUsageEvent, "techniques">): number {
  return e.techniques.reduce((acc, t) => acc + (t.applied ? t.tokensSaved : 0), 0);
}

export function netSavingsMicros(a: Pick<SavingsAggregate, "baselineMicros" | "costWithBaselineMicros" | "overheadMicros">): number {
  return a.baselineMicros - (a.costWithBaselineMicros + a.overheadMicros);
}

export function efficiencyMultiplier(a: SavingsAggregate): number | null {
  if (a.baselineMicros <= 0) return null;
  const denom = a.costWithBaselineMicros + a.overheadMicros;
  if (denom <= 0) return null;
  return Math.round((a.baselineMicros / denom) * 10_000) / 10_000;
}

export function computeSummary(
  a: SavingsAggregate,
  q: QualityAggregate,
  period: { from: Date; to: Date; currency: string },
): SavingsSummary {
  const savingsSource: MeasurementSource = a.requestsWithBaseline > 0 ? "experimentally_estimated" : "unavailable";
  const money = (micros: number, source: MeasurementSource) => ({ micros, currency: period.currency, source });
  return {
    from: period.from.toISOString(),
    to: period.to.toISOString(),
    currency: period.currency,
    requests: a.requests,
    optimizedAiCost: money(a.costMicros, a.requests > 0 ? weakestSource(a.costSources) : "unavailable"),
    overheadCost: money(a.overheadMicros, a.requests > 0 ? weakestSource(a.overheadSources) : "unavailable"),
    baselineCost: money(a.baselineMicros, savingsSource),
    grossSavings: money(a.baselineMicros - a.costWithBaselineMicros, savingsSource),
    netSavings: money(netSavingsMicros(a), savingsSource),
    efficiencyMultiplier: efficiencyMultiplier(a),
    tokens: {
      input: a.inputTokens,
      output: a.outputTokens,
      cachedInput: a.cachedInputTokens,
      avoided: a.tokensAvoided,
      avoidedSource: weakestSource(a.avoidedSources),
    },
    cache: { hits: a.cacheHits, misses: a.cacheMisses },
    quality: { evaluations: q.evaluations, passed: q.passed, rollbacks: q.rollbacks },
    baselineCoverage: a.requests > 0 ? a.requestsWithBaseline / a.requests : 0,
    methodVersion: SAVINGS_METHOD_VERSION,
  };
}

/** Pure aggregation over in-memory events (used by unit tests; SQL path must agree with it). */
export function aggregateEvents(events: readonly RequestUsageEvent[], currency: string): SavingsAggregate {
  const a: SavingsAggregate = { ...EMPTY_AGGREGATE, costSources: [], overheadSources: [], avoidedSources: [] };
  const cs = new Set<string>();
  const os = new Set<string>();
  const as = new Set<string>();
  for (const e of events) {
    if (e.cost.currency !== currency) continue;
    a.requests++;
    a.costMicros += e.cost.micros;
    a.overheadMicros += e.overheadCost.micros;
    cs.add(e.cost.source);
    os.add(e.overheadCost.source);
    if (hasValidBaseline(e)) {
      a.requestsWithBaseline++;
      a.baselineMicros += e.baselineCost!.micros;
      a.costWithBaselineMicros += e.cost.micros;
    }
    a.inputTokens += e.usage.inputTokens;
    a.outputTokens += e.usage.outputTokens;
    a.cachedInputTokens += e.usage.cachedInputTokens;
    a.tokensAvoided += tokensAvoidedOf(e);
    for (const t of e.techniques) if (t.applied && t.tokensSaved > 0) as.add(t.source);
    if (e.cache.status === "hit") a.cacheHits++;
    if (e.cache.status === "miss" || e.cache.status === "store") a.cacheMisses++; // "store" = a miss whose response was cached
  }
  a.costSources = [...cs];
  a.overheadSources = [...os];
  a.avoidedSources = [...as];
  return a;
}
