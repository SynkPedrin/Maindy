/**
 * Model registry. Model ids are chosen by environment (MAINDY_MODEL / MAINDY_MODEL_FAST),
 * never hardcoded at call sites. Prices are USD per million tokens (Anthropic first-party
 * list prices, used only for internal cost tracking).
 */

export interface ModelSpec {
  id: string;
  provider: 'anthropic';
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  maxOutputTokens: number;
  /** effort levels accepted by output_config.effort */
  supportsEffort: boolean;
  /** supports server-side refusal fallbacks (beta) */
  supportsFallbacks: boolean;
}

export const MODEL_REGISTRY: Record<string, ModelSpec> = {
  'claude-opus-5-5': { id: 'claude-opus-5-5', provider: 'anthropic', inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2, maxOutputTokens: 128_000, supportsEffort: true, supportsFallbacks: true },
  'claude-sonnet-5-5': { id: 'claude-sonnet-5-5', provider: 'anthropic', inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.1, maxOutputTokens: 128_000, supportsEffort: true, supportsFallbacks: true },
  'claude-haiku-5-5': { id: 'claude-haiku-5-5', provider: 'anthropic', inputPerMTok: 0.1, outputPerMTok: 0.5, cacheReadPerMTok: 0.01, maxOutputTokens: 128_000, supportsEffort: true, supportsFallbacks: false },
};

export interface ModelConfig {
  primary: ModelSpec;
  fast: ModelSpec;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
}

export function resolveModelConfig(env: Record<string, string | undefined>): ModelConfig {
  const pick = (id: string | undefined, fallback: string): ModelSpec => {
    const key = (id ?? '').trim() || fallback;
    const spec = MODEL_REGISTRY[key];
    if (!spec) throw new Error(`Unknown model "${key}". Add it to MODEL_REGISTRY in packages/core/src/ai/models.ts.`);
    return spec;
  };
  return {
    primary: pick(env.MAINDY_MODEL, 'claude-opus-5-5'),
    fast: pick(env.MAINDY_MODEL_FAST, 'claude-haiku-5-5'),
    timeoutMs: Number(env.MAINDY_AI_TIMEOUT_MS ?? 60_000),
    maxRetries: Number(env.MAINDY_AI_MAX_RETRIES ?? 2),
    maxOutputTokens: Number(env.MAINDY_AI_MAX_OUTPUT_TOKENS ?? 16_000),
  };
}

export function estimateCostUsd(spec: ModelSpec, usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number }): number {
  return (
    (usage.inputTokens * spec.inputPerMTok + usage.outputTokens * spec.outputPerMTok + usage.cacheReadTokens * spec.cacheReadPerMTok) /
    1_000_000
  );
}
