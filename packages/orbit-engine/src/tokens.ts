/**
 * Local token counting.
 * - OpenAI-family models: exact-ish count with the o200k_base BPE (gpt-tokenizer) → `locally_measured`.
 * - Everything else (Claude, Llama/Qwen on Ollama…): we do NOT have the vendor tokenizer. We count with o200k
 *   as a PROXY (flagged `estimate: true`, source `experimentally_estimated`, method `o200k_proxy`). Measured
 *   against Ollama/qwen's own counts on the ORBIT benchmark, the proxy landed within 1–5% and below the
 *   provider (conservative) for both log compression and context dedup, while the old 3.6 chars/token rule
 *   was off by −50%…+22% (it overstated dedup savings). Above PROXY_MAX_CHARS we fall back to that char rule
 *   to bound CPU inside the latency budget.
 */
import { countTokens as o200kCount } from "gpt-tokenizer/encoding/o200k_base";
import type { MeasurementSource } from "@maindy/contracts";

export type TokenizerMethod = "o200k_base" | "o200k_proxy" | "heuristic_chars";

export interface TokenCount {
  tokens: number;
  method: TokenizerMethod;
  estimate: boolean;
  source: MeasurementSource;
}

const OPENAI_FAMILY = /^(gpt-|o\d|chatgpt-|text-embedding-|codex-|computer-use-)/i;

export function isOpenAiFamily(model: string | undefined | null): boolean {
  if (!model) return false;
  const m = model.toLowerCase().replace(/^openai\//, "");
  return OPENAI_FAMILY.test(m);
}

/** ~3.6 chars/token is a reasonable blended estimate for English/Portuguese prose + code. */
const CHARS_PER_TOKEN = 3.6;

export function estimateTokensHeuristic(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Above this size we fall back to the heuristic even for OpenAI to bound CPU (latency budget). */
const MAX_EXACT_CHARS = 2_000_000;
/** o200k as a proxy for other vendors' tokenizers only up to this size (~25 ms); char rule beyond. */
export const PROXY_MAX_CHARS = 200_000;

/**
 * @param sizeHint length that decides the method (default: text.length). Pass the SAME hint when counting a
 *   "before" and an "after" text so a delta is computed with one consistent method.
 */
export function countTokens(text: string, model?: string | null, sizeHint?: number): TokenCount {
  const size = sizeHint ?? text.length;
  const openai = isOpenAiFamily(model);
  if (openai && size <= MAX_EXACT_CHARS) {
    return { tokens: text ? o200kCount(text) : 0, method: "o200k_base", estimate: false, source: "locally_measured" };
  }
  if (!openai && size <= PROXY_MAX_CHARS) {
    return { tokens: text ? o200kCount(text) : 0, method: "o200k_proxy", estimate: true, source: "experimentally_estimated" };
  }
  return { tokens: estimateTokensHeuristic(text), method: "heuristic_chars", estimate: true, source: "experimentally_estimated" };
}

/** Token delta between two texts using the same method for both (so the delta is consistent). */
export function tokenDelta(before: string, after: string, model?: string | null): TokenCount {
  const hint = Math.max(before.length, after.length);
  const a = countTokens(before, model, hint);
  const b = countTokens(after, model, hint);
  return { tokens: Math.max(0, a.tokens - b.tokens), method: a.method, estimate: a.estimate, source: a.source };
}
