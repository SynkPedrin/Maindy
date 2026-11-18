/**
 * Usage normalization. Normalized semantics (used by orbit-engine pricing):
 *   inputTokens        = ALL prompt tokens, including cached reads and cache writes
 *   cachedInputTokens  = subset served from the provider prompt cache
 *   cacheWriteTokens   = subset written to the provider prompt cache
 *   cacheWriteLongTokens (extra) = subset of writes with the long TTL (Anthropic 1h)
 *
 * OpenAI already reports prompt_tokens inclusive of cached tokens; Anthropic reports input_tokens
 * EXCLUSIVE of cache reads/writes, so we add them.
 */
import type { UsageTokens } from "@maindy/contracts";

export type WireFormat = "openai_chat" | "openai_responses" | "anthropic_messages";

export interface NormalizedUsage extends UsageTokens {
  cacheWriteLongTokens?: number;
  reasoningTokens?: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
const has = (o: Obj, k: string) => typeof o[k] === "number";

export function openAiChatUsage(u: unknown): NormalizedUsage | null {
  if (!isObj(u) || (!has(u, "prompt_tokens") && !has(u, "completion_tokens"))) return null;
  const d = isObj(u.prompt_tokens_details) ? u.prompt_tokens_details : {};
  const od = isObj(u.completion_tokens_details) ? u.completion_tokens_details : {};
  const out: NormalizedUsage = {
    inputTokens: int(u.prompt_tokens),
    outputTokens: int(u.completion_tokens),
    cachedInputTokens: int(d.cached_tokens),
    cacheWriteTokens: int(d.cache_write_tokens),
    source: "provider_reported",
  };
  if (has(od, "reasoning_tokens")) out.reasoningTokens = int(od.reasoning_tokens);
  return out;
}

export function openAiResponsesUsage(u: unknown): NormalizedUsage | null {
  if (!isObj(u) || (!has(u, "input_tokens") && !has(u, "output_tokens"))) return null;
  const d = isObj(u.input_tokens_details) ? u.input_tokens_details : {};
  const od = isObj(u.output_tokens_details) ? u.output_tokens_details : {};
  const out: NormalizedUsage = {
    inputTokens: int(u.input_tokens),
    outputTokens: int(u.output_tokens),
    cachedInputTokens: int(d.cached_tokens),
    cacheWriteTokens: int(d.cache_write_tokens),
    source: "provider_reported",
  };
  if (has(od, "reasoning_tokens")) out.reasoningTokens = int(od.reasoning_tokens);
  return out;
}

export function anthropicUsage(u: unknown): NormalizedUsage | null {
  if (!isObj(u) || (!has(u, "input_tokens") && !has(u, "output_tokens"))) return null;
  const read = int(u.cache_read_input_tokens);
  const write = int(u.cache_creation_input_tokens);
  const cc = isObj(u.cache_creation) ? u.cache_creation : {};
  const out: NormalizedUsage = {
    inputTokens: int(u.input_tokens) + read + write,
    outputTokens: int(u.output_tokens),
    cachedInputTokens: read,
    cacheWriteTokens: write,
    source: "provider_reported",
  };
  const long = int(cc.ephemeral_1h_input_tokens);
  if (long > 0) out.cacheWriteLongTokens = Math.min(long, write);
  return out;
}

/** Usage from a complete (non-streaming) JSON response body. */
export function usageFromResponse(format: WireFormat, body: unknown): NormalizedUsage | null {
  if (!isObj(body)) return null;
  switch (format) {
    case "openai_chat":
      return openAiChatUsage(body.usage);
    case "openai_responses":
      return openAiResponsesUsage(body.usage);
    case "anthropic_messages":
      return anthropicUsage(body.usage);
  }
}

export function modelFromResponse(body: unknown): string | null {
  return isObj(body) && typeof body.model === "string" ? body.model : null;
}

/** Concatenated assistant text of a non-streaming response (for Quality Guard comparisons; never persisted). */
export function responseText(format: WireFormat, body: unknown): string {
  if (!isObj(body)) return "";
  if (format === "openai_chat" && Array.isArray(body.choices)) {
    return body.choices
      .map((c) => (isObj(c) && isObj(c.message) && typeof c.message.content === "string" ? c.message.content : ""))
      .join("\n");
  }
  if (format === "openai_responses") {
    if (typeof body.output_text === "string") return body.output_text;
    const out = Array.isArray(body.output) ? body.output : [];
    const parts: string[] = [];
    for (const item of out) {
      if (!isObj(item) || !Array.isArray(item.content)) continue;
      for (const c of item.content) if (isObj(c) && typeof c.text === "string") parts.push(c.text);
    }
    return parts.join("\n");
  }
  if (format === "anthropic_messages" && Array.isArray(body.content)) {
    return body.content.map((c) => (isObj(c) && c.type === "text" && typeof c.text === "string" ? c.text : "")).join("");
  }
  return "";
}
