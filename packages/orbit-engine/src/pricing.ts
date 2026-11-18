/**
 * Versioned list-price table + cost math in integer micros.
 *
 * Prices are USD per 1M tokens (list price, see docs/research/providers-codex-pricing.md).
 * Conveniently, "USD per 1M tokens" == "micro-USD per token", so cost_micros = tokens × price.
 * To stay exact with prices like 0.075 we compute in milli-micros (×1000) and round once at the end.
 *
 * Rules:
 *  - Unknown model → cost source `unavailable` (never guess).
 *  - Local runtimes (Ollama/local openai-compatible) → cost 0, source `locally_measured`.
 *  - Provider-native discounts (cached input) are priced as the provider prices them; they are
 *    part of the *actual* cost and, by construction, also part of any baseline we derive (see savings.ts).
 */
import type { Money, MeasurementSource, UsageTokens } from "@maindy/contracts";

export const PRICING_VERSION = "2026-11-18";

export type PricedProvider = "anthropic" | "openai";

export interface PriceRow {
  /** USD per 1M uncached input tokens */
  input: number;
  /** USD per 1M cached input tokens (cache read) */
  cachedInput: number;
  /** USD per 1M cache-write tokens, short TTL (Anthropic 5m / OpenAI 30m). null = not offered */
  cacheWrite: number | null;
  /** USD per 1M cache-write tokens, long TTL (Anthropic 1h / OpenAI 12h). null = not offered */
  cacheWriteLong: number | null;
  /** USD per 1M output tokens */
  output: number;
}

export interface ModelPrice extends PriceRow {
  id: string;
  provider: PricedProvider;
  /** Anthropic Haiku-style tier: whole request repriced when prompt tokens exceed threshold */
  tier?: { thresholdPromptTokens: number; prices: PriceRow };
  /** OpenAI long-context surcharge: multipliers applied when prompt tokens exceed threshold */
  longContext?: { thresholdPromptTokens: number; inputMultiplier: number; outputMultiplier: number };
}

const OPENAI_LONG_CONTEXT = { thresholdPromptTokens: 272_000, inputMultiplier: 2, outputMultiplier: 1.5 };

export const PRICE_TABLE: readonly ModelPrice[] = [
  { id: "claude-opus-5-5", provider: "anthropic", input: 4, cachedInput: 0.2, cacheWrite: 5, cacheWriteLong: 8, output: 20 },
  { id: "claude-sonnet-5-5", provider: "anthropic", input: 2, cachedInput: 0.1, cacheWrite: 2.5, cacheWriteLong: 4, output: 10 },
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    input: 0.1,
    cachedInput: 0.01,
    cacheWrite: 0.125,
    cacheWriteLong: 0.2,
    output: 0.5,
    tier: {
      thresholdPromptTokens: 100_000,
      prices: { input: 0.5, cachedInput: 0.05, cacheWrite: 0.625, cacheWriteLong: 1.0, output: 2.5 },
    },
  },
  { id: "gpt-6.2-astra", provider: "openai", input: 8, cachedInput: 0.4, cacheWrite: 10, cacheWriteLong: 20, output: 40, longContext: OPENAI_LONG_CONTEXT },
  { id: "gpt-6.2-sol", provider: "openai", input: 2, cachedInput: 0.1, cacheWrite: 2.5, cacheWriteLong: 5, output: 10, longContext: OPENAI_LONG_CONTEXT },
  { id: "gpt-6.1-terra", provider: "openai", input: 1, cachedInput: 0.05, cacheWrite: 1.25, cacheWriteLong: 2.5, output: 5, longContext: OPENAI_LONG_CONTEXT },
  { id: "gpt-6-luna", provider: "openai", input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, cacheWriteLong: 0.25, output: 0.5, longContext: OPENAI_LONG_CONTEXT },
  { id: "gpt-5.6-sol", provider: "openai", input: 4, cachedInput: 0.4, cacheWrite: 5, cacheWriteLong: 10, output: 20, longContext: OPENAI_LONG_CONTEXT },
  { id: "gpt-5.4-mini", provider: "openai", input: 0.75, cachedInput: 0.075, cacheWrite: null, cacheWriteLong: null, output: 4.5 },
];

const BY_ID = new Map(PRICE_TABLE.map((m) => [m.id, m]));

/** Providers whose inference runs on the customer's machine (no per-token bill). */
export const LOCAL_PROVIDERS = new Set(["ollama", "local", "lmstudio", "llamacpp"]);

/**
 * Normalize a model id for lookup: lowercase, strip vendor prefixes ("openai/", "anthropic."),
 * Claude Code context suffix ("[1m]") and trailing release dates ("-20261001", "-2026-10-01").
 * Deliberately conservative: "gpt-6.2-sol-mini" does NOT match "gpt-6.2-sol".
 */
export function normalizeModelId(model: string): string {
  let m = model.trim().toLowerCase();
  m = m.replace(/\[[^\]]*\]$/, "");
  m = m.replace(/^(openai|anthropic|us\.anthropic|eu\.anthropic|global\.anthropic)[/.]/, "");
  m = m.replace(/-(20\d{6}|20\d{2}-\d{2}-\d{2})$/, "");
  m = m.replace(/-v\d+:\d+$/, ""); // bedrock-style version suffix
  return m;
}

export function findModelPrice(model: string): ModelPrice | null {
  return BY_ID.get(normalizeModelId(model)) ?? null;
}

export interface CostInput {
  /** total prompt tokens INCLUDING cached reads and cache writes (normalized semantics, see provider-adapters) */
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  /** subset of cacheWriteTokens written with the long TTL (Anthropic 1h / OpenAI 12h) */
  cacheWriteLongTokens?: number;
  source: MeasurementSource;
}

export interface CostOptions {
  /** e.g. "ollama" — local providers cost 0 */
  provider?: string;
  /** upstream flagged as running locally (cost 0) */
  local?: boolean;
  /** Batch API: −50% */
  batch?: boolean;
  currency?: string;
}

export interface CostResult {
  cost: Money;
  pricingVersion: string;
  priced: boolean;
  /** human-readable explanation (pt-BR safe ascii) — never contains prompt text */
  detail: string;
}

const MILLI = 1000;

function toMilli(pricePerMTok: number): number {
  // prices have at most 3 decimals in the table → exact integer
  return Math.round(pricePerMTok * MILLI);
}

/** Cost source derived from the token source: tokens × list price is a MAINDY computation. */
export function costSourceFor(usageSource: MeasurementSource): MeasurementSource {
  switch (usageSource) {
    case "provider_reported":
    case "locally_measured":
      return "locally_measured";
    case "experimentally_estimated":
      return "experimentally_estimated";
    default:
      return "unavailable";
  }
}

function money(micros: number, source: MeasurementSource, currency = "USD"): Money {
  return { micros, currency, source };
}

export function zeroMoney(source: MeasurementSource = "locally_measured", currency = "USD"): Money {
  return money(0, source, currency);
}

export function costForUsage(model: string, usage: CostInput | UsageTokens, opts: CostOptions = {}): CostResult {
  const currency = opts.currency ?? "USD";
  if (opts.local || (opts.provider && LOCAL_PROVIDERS.has(opts.provider.toLowerCase()))) {
    return {
      cost: money(0, usage.source === "unavailable" ? "unavailable" : "locally_measured", currency),
      pricingVersion: PRICING_VERSION,
      priced: true,
      detail: "local runtime: no per-token cost",
    };
  }
  if (usage.source === "unavailable") {
    return { cost: money(0, "unavailable", currency), pricingVersion: PRICING_VERSION, priced: false, detail: "usage unavailable" };
  }
  const price = findModelPrice(model);
  if (!price) {
    return {
      cost: money(0, "unavailable", currency),
      pricingVersion: PRICING_VERSION,
      priced: false,
      detail: `model not in price table ${PRICING_VERSION}`,
    };
  }
  const input = Math.max(0, usage.inputTokens);
  const cached = Math.min(Math.max(0, usage.cachedInputTokens ?? 0), input);
  const writes = Math.min(Math.max(0, usage.cacheWriteTokens ?? 0), input - cached);
  const writesLong = Math.min(Math.max(0, (usage as CostInput).cacheWriteLongTokens ?? 0), writes);
  const writesShort = writes - writesLong;
  const uncached = input - cached - writes;
  const output = Math.max(0, usage.outputTokens);

  let row: PriceRow = price;
  const details: string[] = [];
  if (price.tier && input > price.tier.thresholdPromptTokens) {
    row = price.tier.prices;
    details.push(`tier >${price.tier.thresholdPromptTokens / 1000}K`);
  }
  let inMult = 1;
  let outMult = 1;
  if (price.longContext && input > price.longContext.thresholdPromptTokens) {
    inMult = price.longContext.inputMultiplier;
    outMult = price.longContext.outputMultiplier;
    details.push(`long context >${price.longContext.thresholdPromptTokens / 1000}K`);
  }
  // Cache writes without a published price are billed as regular input (conservative, documented).
  const writePrice = row.cacheWrite ?? row.input;
  const writeLongPrice = row.cacheWriteLong ?? row.cacheWrite ?? row.input;

  let milli =
    uncached * toMilli(row.input) * inMult +
    cached * toMilli(row.cachedInput) * inMult +
    writesShort * toMilli(writePrice) * inMult +
    writesLong * toMilli(writeLongPrice) * inMult +
    output * toMilli(row.output) * outMult;
  if (opts.batch) {
    milli = milli / 2;
    details.push("batch -50%");
  }
  const micros = Math.round(milli / MILLI);
  return {
    cost: money(micros, costSourceFor(usage.source), currency),
    pricingVersion: PRICING_VERSION,
    priced: true,
    detail: details.length ? details.join("; ") : "list price",
  };
}
