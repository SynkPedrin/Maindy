/**
 * Savings ledger — operational definitions from docs/ARCHITECTURE.md §6.
 *
 *   baseline_cost        cost of the equivalent request without MAINDY
 *     cache_replay            → measured cost of the ORIGINAL stored response (its real usage, incl. its
 *                               provider-native cached tokens) at the current price table
 *     pre_optimization_tokens → actual usage + tokens removed by MAINDY, priced as the provider would price
 *                               them (removed tokens are uncached input; provider cached reads stay cached)
 *     paired_sample           → measured cost of a controlled shadow request (Quality Guard)
 *     none                    → no valid baseline: never contributes to savings
 *   gross_savings        = baseline − optimized_ai_cost              (only where baseline is valid)
 *   net_savings          = baseline − (optimized_ai_cost + overhead)  (overhead of ALL requests: conservative)
 *   efficiency_multiplier= baseline / (optimized_ai_cost + overhead)  (null without baseline / quality not approved)
 *
 * Provider-native discounts that would exist without MAINDY (e.g. the client's own prompt caching, OpenAI
 * automatic caching) are kept on BOTH sides of the subtraction, so they never show up as MAINDY savings.
 */
import {
  SAVINGS_METHOD_VERSION,
  type MeasurementSource,
  type Money,
  type RequestUsageEvent,
  type SavingsSummary,
  type UsageTokens,
} from "@maindy/contracts";
import { costForUsage, type CostOptions } from "./pricing.js";

export type BaselineMethod = RequestUsageEvent["baselineMethod"];

export interface RequestBaseline {
  baselineCost: Money | null;
  baselineMethod: BaselineMethod;
  detail: string;
}

const NO_BASELINE = (detail: string): RequestBaseline => ({ baselineCost: null, baselineMethod: "none", detail });

/** Rank: lower is "weaker" provenance. Aggregates take the weakest contributing source. */
const SOURCE_RANK: Record<MeasurementSource, number> = {
  unavailable: 0,
  experimentally_estimated: 1,
  locally_measured: 2,
  provider_reported: 3,
};

export function weakestSource(sources: MeasurementSource[]): MeasurementSource {
  const usable = sources.filter((s) => s !== "unavailable");
  if (usable.length === 0) return "unavailable";
  return usable.reduce((a, b) => (SOURCE_RANK[a] <= SOURCE_RANK[b] ? a : b));
}

/**
 * cache_replay: the request was served from the local exact cache. Baseline = what the original
 * (stored) response actually cost, re-priced with the current table. The stored usage keeps its own
 * cached-token split, so any provider prompt-cache discount on the original is NOT counted as savings.
 */
export function cacheReplayBaseline(model: string, originalUsage: UsageTokens, opts: CostOptions = {}): RequestBaseline {
  if (originalUsage.source === "unavailable") return NO_BASELINE("original usage unavailable");
  const r = costForUsage(model, originalUsage, opts);
  if (!r.priced || r.cost.source === "unavailable") return NO_BASELINE(r.detail);
  return {
    baselineCost: { ...r.cost, source: "experimentally_estimated" },
    baselineMethod: "cache_replay",
    detail: `original response cost at ${r.pricingVersion}`,
  };
}

/**
 * pre_optimization_tokens: compression/dedup removed `tokensRemoved` prompt tokens. Baseline = actual
 * usage with those tokens added back as UNCACHED input (the provider caching that happened stays as-is).
 */
export function preOptimizationBaseline(
  model: string,
  actualUsage: UsageTokens,
  tokensRemoved: number,
  opts: CostOptions = {},
): RequestBaseline {
  if (tokensRemoved <= 0) return NO_BASELINE("no tokens removed");
  if (actualUsage.source === "unavailable") return NO_BASELINE("actual usage unavailable");
  const baselineUsage: UsageTokens = { ...actualUsage, inputTokens: actualUsage.inputTokens + tokensRemoved };
  const r = costForUsage(model, baselineUsage, opts);
  if (!r.priced || r.cost.source === "unavailable") return NO_BASELINE(r.detail);
  return {
    baselineCost: { ...r.cost, source: "experimentally_estimated" },
    baselineMethod: "pre_optimization_tokens",
    detail: `+${tokensRemoved} input tokens restored`,
  };
}

/**
 * MAINDY added Anthropic cache_control where the client had none. Without MAINDY the provider would not
 * have cached anything, so the baseline prices every prompt token as uncached input. The result can be
 * NEGATIVE savings on the first (cache-write) request — that is reported honestly.
 * Must NOT be used when the client already set cache_control itself.
 */
export function promptCacheHintBaseline(model: string, actualUsage: UsageTokens, opts: CostOptions = {}): RequestBaseline {
  if (actualUsage.source === "unavailable") return NO_BASELINE("actual usage unavailable");
  if ((actualUsage.cachedInputTokens ?? 0) === 0 && (actualUsage.cacheWriteTokens ?? 0) === 0) {
    return NO_BASELINE("no provider cache activity");
  }
  const baselineUsage: UsageTokens = { ...actualUsage, cachedInputTokens: 0, cacheWriteTokens: 0 };
  const r = costForUsage(model, baselineUsage, opts);
  if (!r.priced || r.cost.source === "unavailable") return NO_BASELINE(r.detail);
  return {
    baselineCost: { ...r.cost, source: "experimentally_estimated" },
    baselineMethod: "pre_optimization_tokens",
    detail: "prompt cache hint added by maindy; baseline = all prompt tokens uncached",
  };
}

/** paired_sample: cost measured on a controlled shadow request of the original (unoptimized) body. */
export function pairedSampleBaseline(shadowCost: Money): RequestBaseline {
  if (shadowCost.source === "unavailable") return NO_BASELINE("shadow cost unavailable");
  return { baselineCost: { ...shadowCost, source: "experimentally_estimated" }, baselineMethod: "paired_sample", detail: "shadow sample" };
}

export interface RequestSavings {
  gross: Money | null;
  net: Money | null;
}

export function requestSavings(cost: Money, overhead: Money, baseline: RequestBaseline): RequestSavings {
  if (!baseline.baselineCost || baseline.baselineMethod === "none" || cost.source === "unavailable") {
    return { gross: null, net: null };
  }
  const gross = baseline.baselineCost.micros - cost.micros;
  return {
    gross: { micros: gross, currency: cost.currency, source: "experimentally_estimated" },
    net: { micros: gross - overhead.micros, currency: cost.currency, source: "experimentally_estimated" },
  };
}

export function hasValidBaseline(e: Pick<RequestUsageEvent, "baselineMethod" | "baselineCost" | "cost">, currency = "USD"): boolean {
  return (
    e.baselineMethod !== "none" &&
    e.baselineCost !== null &&
    e.baselineCost.source !== "unavailable" &&
    e.baselineCost.currency === currency &&
    e.cost.source !== "unavailable" &&
    e.cost.currency === currency
  );
}

export interface SummarizeOptions {
  from: string;
  to: string;
  currency?: string;
  quality?: { evaluations: number; passed: number; rollbacks: number };
  /** efficiency multiplier is only published when quality is approved (default true) */
  qualityApproved?: boolean;
}

export function summarizeSavings(events: RequestUsageEvent[], opts: SummarizeOptions): SavingsSummary {
  const currency = opts.currency ?? "USD";
  const inRange = events.filter((e) => e.occurredAt >= opts.from && e.occurredAt <= opts.to);
  // de-duplicate by eventId (idempotency): a re-sent event must never count twice
  const seen = new Set<string>();
  const evs = inRange.filter((e) => (seen.has(e.eventId) ? false : (seen.add(e.eventId), true)));

  let optimizedAll = 0;
  let overheadAll = 0;
  let baseline = 0;
  let optimizedWithBaseline = 0;
  let withBaseline = 0;
  let input = 0;
  let output = 0;
  let cachedInput = 0;
  let avoided = 0;
  let hits = 0;
  let misses = 0;
  const costSources: MeasurementSource[] = [];
  const overheadSources: MeasurementSource[] = [];
  const avoidedSources: MeasurementSource[] = [];

  for (const e of evs) {
    if (e.cost.currency === currency && e.cost.source !== "unavailable") {
      optimizedAll += e.cost.micros;
      costSources.push(e.cost.source);
    }
    if (e.overheadCost.currency === currency && e.overheadCost.source !== "unavailable") {
      overheadAll += e.overheadCost.micros;
      overheadSources.push(e.overheadCost.source);
    }
    if (hasValidBaseline(e, currency)) {
      baseline += e.baselineCost!.micros;
      optimizedWithBaseline += e.cost.micros;
      withBaseline += 1;
    }
    if (e.usage.source !== "unavailable") {
      input += e.usage.inputTokens;
      output += e.usage.outputTokens;
      cachedInput += e.usage.cachedInputTokens;
    }
    for (const t of e.techniques) {
      if (t.applied && t.tokensSaved > 0 && t.source !== "unavailable") {
        avoided += t.tokensSaved;
        avoidedSources.push(t.source);
      }
    }
    if (e.cache.status === "hit") hits += 1;
    else if (e.cache.status === "miss" || e.cache.status === "store") misses += 1;
  }

  const savingsSource: MeasurementSource = withBaseline > 0 ? "experimentally_estimated" : "unavailable";
  const gross = withBaseline > 0 ? baseline - optimizedWithBaseline : 0;
  const net = withBaseline > 0 ? baseline - (optimizedWithBaseline + overheadAll) : 0;
  const denom = optimizedWithBaseline + overheadAll;
  const qualityApproved = opts.qualityApproved ?? true;
  const efficiencyMultiplier =
    withBaseline > 0 && denom > 0 && qualityApproved ? Math.round((baseline / denom) * 100) / 100 : null;

  return {
    from: opts.from,
    to: opts.to,
    currency,
    requests: evs.length,
    optimizedAiCost: { micros: optimizedAll, currency, source: weakestSource(costSources) },
    overheadCost: { micros: overheadAll, currency, source: overheadSources.length ? weakestSource(overheadSources) : "locally_measured" },
    baselineCost: { micros: withBaseline > 0 ? baseline : 0, currency, source: savingsSource },
    grossSavings: { micros: gross, currency, source: savingsSource },
    netSavings: { micros: net, currency, source: savingsSource },
    efficiencyMultiplier,
    tokens: { input, output, cachedInput, avoided, avoidedSource: weakestSource(avoidedSources) },
    cache: { hits, misses },
    quality: opts.quality ?? { evaluations: 0, passed: 0, rollbacks: 0 },
    baselineCoverage: evs.length ? withBaseline / evs.length : 0,
    methodVersion: SAVINGS_METHOD_VERSION,
  };
}
