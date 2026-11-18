/**
 * Techniques that edit request parameters (never message text):
 *  - output_budget       (maximum mode only; only when the client did not set an output cap)
 *  - model_routing       (only with an explicit policy mapping; always visible via header + technique record)
 *  - prompt_cache_hints  (Anthropic cache_control on a large, stable system prompt when the client set none)
 */
import type { TechniqueApplication } from "@maindy/contracts";
import { estimateTokensHeuristic } from "../tokens.js";
import { application, isObject, type JsonObject, type WireFormat } from "../types.js";

/* ------------------------------ output_budget ------------------------------ */

const OUTPUT_CAP_FIELDS: Record<WireFormat, string[]> = {
  openai_chat: ["max_tokens", "max_completion_tokens"],
  openai_responses: ["max_output_tokens"],
  anthropic_messages: ["max_tokens"], // always required by Anthropic → never applies
};

export function applyOutputBudget(format: WireFormat, body: JsonObject, budgetTokens: number): TechniqueApplication {
  const fields = OUTPUT_CAP_FIELDS[format];
  if (fields.some((f) => body[f] !== undefined && body[f] !== null)) {
    return application("output_budget", false, 0, "unavailable", "client set its own cap");
  }
  if (format === "anthropic_messages") return application("output_budget", false, 0, "unavailable", "not applicable");
  const field = format === "openai_chat" ? "max_completion_tokens" : "max_output_tokens";
  body[field] = budgetTokens;
  // Tokens actually avoided are unknowable without a counterfactual → source unavailable, 0 claimed.
  return application("output_budget", true, 0, "unavailable", `${field}=${budgetTokens}`);
}

/* ------------------------------ model_routing ------------------------------ */

export interface RoutingRule {
  /** exact model id requested by the client */
  from: string;
  /** model to use instead */
  to: string;
  /** only route when the estimated prompt is at most this many tokens */
  maxPromptTokens?: number;
  /** only route requests without tools */
  noTools?: boolean;
}

export interface RoutingResult {
  application: TechniqueApplication;
  routedFrom: string | null;
}

export function applyModelRouting(body: JsonObject, rules: RoutingRule[], promptTextLength: number): RoutingResult {
  const model = typeof body.model === "string" ? body.model : "";
  const rule = rules.find((r) => r.from === model);
  if (!rule) return { application: application("model_routing", false, 0, "unavailable", "no explicit mapping"), routedFrom: null };
  if (rule.noTools && Array.isArray(body.tools) && body.tools.length > 0) {
    return { application: application("model_routing", false, 0, "unavailable", "request has tools"), routedFrom: null };
  }
  if (rule.maxPromptTokens !== undefined && Math.ceil(promptTextLength / 3.6) > rule.maxPromptTokens) {
    return { application: application("model_routing", false, 0, "unavailable", "prompt above rule limit"), routedFrom: null };
  }
  body.model = rule.to;
  return { application: application("model_routing", true, 0, "unavailable", `${model} -> ${rule.to}`), routedFrom: model };
}

/* ---------------------------- prompt_cache_hints ---------------------------- */

/** Minimum cacheable prompt length per Anthropic model family (tokens). */
function minCacheableTokens(model: string): number {
  return /haiku/i.test(model) ? 2048 : 1024;
}

function hasCacheControl(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(hasCacheControl);
  if (isObject(v)) {
    if (v.cache_control !== undefined) return true;
    return Object.values(v).some(hasCacheControl);
  }
  return false;
}

export interface CacheHintResult {
  application: TechniqueApplication;
  /** true only when MAINDY added the breakpoint (client had none) — drives the baseline choice */
  added: boolean;
}

export function applyPromptCacheHints(format: WireFormat, body: JsonObject): CacheHintResult {
  if (format !== "anthropic_messages") {
    return { application: application("prompt_cache_hints", false, 0, "unavailable", "provider caches automatically"), added: false };
  }
  if (hasCacheControl(body.system) || hasCacheControl(body.messages) || hasCacheControl(body.tools) || body.cache_control !== undefined) {
    return { application: application("prompt_cache_hints", false, 0, "unavailable", "client already uses cache_control"), added: false };
  }
  const model = typeof body.model === "string" ? body.model : "";
  const sys = body.system;
  let text = "";
  if (typeof sys === "string") text = sys;
  else if (Array.isArray(sys)) text = sys.map((b) => (isObject(b) && typeof b.text === "string" ? b.text : "")).join("\n");
  const est = estimateTokensHeuristic(text);
  if (est < minCacheableTokens(model)) {
    return { application: application("prompt_cache_hints", false, 0, "unavailable", "system prompt too small"), added: false };
  }
  if (typeof sys === "string") {
    body.system = [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }];
  } else if (Array.isArray(sys) && sys.length > 0) {
    const lastIdx = sys.length - 1;
    const last = sys[lastIdx];
    if (!isObject(last)) return { application: application("prompt_cache_hints", false, 0, "unavailable", "unexpected system shape"), added: false };
    const copy = [...sys];
    copy[lastIdx] = { ...last, cache_control: { type: "ephemeral" } };
    body.system = copy;
  } else {
    return { application: application("prompt_cache_hints", false, 0, "unavailable", "no system prompt"), added: false };
  }
  // Discount is realized (or not) by the provider; savings are computed later from reported usage.
  return { application: application("prompt_cache_hints", true, 0, "unavailable", `cache_control on system (~${est} tok est.)`), added: true };
}
