/**
 * exact_cache — deterministic response cache.
 *
 * Key = sha256(tenant | project | upstream | format | stream | promptHash), where promptHash is the sha256
 * of the canonical (sorted-keys) request body minus non-semantic fields. Tenant + project are part of the
 * key so two projects never share entries.
 *
 * Eligibility is deliberately strict — when in doubt, bypass:
 *  - client sent `x-maindy-no-cache`;
 *  - temperature is not explicitly 0 (provider defaults are non-deterministic) unless policy allows;
 *  - tools whose names suggest side effects, or built-in dynamic tools (web search, code interpreter…);
 *  - prompt references "now"/"today"/current time (answer depends on wall clock);
 *  - streaming request and policy disallows cached streams;
 *  - n > 1 or logprobs/seed-less sampling knobs that make replay misleading.
 */
import { createHash } from "node:crypto";
import type { UsageTokens } from "@maindy/contracts";
import { isObject, type JsonObject, type WireFormat } from "../types.js";

/** Fields that do not change the model output (or are per-call bookkeeping). */
const NON_SEMANTIC_FIELDS = new Set([
  "stream",
  "stream_options",
  "user",
  "metadata",
  "store",
  "prompt_cache_key",
  "safety_identifier",
  "service_tier",
  "background",
]);

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** sha256 of the normalized request — safe to ship to the cloud (no text). */
export function promptHash(format: WireFormat, body: JsonObject): string {
  const semantic: JsonObject = {};
  for (const [k, v] of Object.entries(body)) if (!NON_SEMANTIC_FIELDS.has(k)) semantic[k] = v;
  return sha256Hex(`${format}\n${canonicalJson(semantic)}`);
}

export interface CacheScope {
  tenant: string;
  project: string | null;
  upstream: string;
}

export function cacheKey(scope: CacheScope, format: WireFormat, stream: boolean, hash: string): string {
  return sha256Hex([scope.tenant, scope.project ?? "", scope.upstream, format, stream ? "stream" : "json", hash].join("|"));
}

export interface CachePolicyOptions {
  /** allow caching when temperature is unset/>0 (default false) */
  allowNonDeterministic?: boolean;
  /** allow caching/replaying streaming responses (default true) */
  allowStreaming?: boolean;
}

export type CacheDecision =
  | { eligible: true; status: "miss" }
  | { eligible: false; status: "disabled" | "bypass"; reason: string };

const SIDE_EFFECT_TOOL = /(^|[_\-.])(write|delete|remove|rm|send|post|create|update|insert|upsert|put|patch|exec|execute|run|shell|bash|deploy|pay|charge|transfer|email|notify|book|order|purchase|commit|push|merge|move|rename|kill|restart|install)([_\-.]|$)/i;
const DYNAMIC_BUILTIN_TOOL_TYPES = /^(web_search|web_search_preview|code_interpreter|computer_use|computer|file_search|image_generation|mcp|local_shell|bash_\d+|web_fetch)/i;
const DYNAMIC_TEXT =
  /\b(now|today|tonight|tomorrow|yesterday|current (time|date|price|weather)|right now|latest news|this (week|month)|agora|hoje|amanh[ãa]|ontem|neste momento|hora atual|data atual|clima atual)\b/i;

function toolNames(body: JsonObject): { names: string[]; builtinTypes: string[] } {
  const names: string[] = [];
  const builtinTypes: string[] = [];
  const tools = Array.isArray(body.tools) ? body.tools : [];
  for (const t of tools) {
    if (!isObject(t)) continue;
    const type = typeof t.type === "string" ? t.type : "";
    const fn = isObject(t.function) ? t.function : null;
    const name = typeof t.name === "string" ? t.name : fn && typeof fn.name === "string" ? fn.name : "";
    if (name) names.push(name);
    if (type && type !== "function" && type !== "custom") builtinTypes.push(type);
  }
  if (Array.isArray(body.functions)) {
    for (const f of body.functions) if (isObject(f) && typeof f.name === "string") names.push(f.name);
  }
  return { names, builtinTypes };
}

export interface CacheDecisionInput {
  active: boolean;
  format: WireFormat;
  body: JsonObject;
  stream: boolean;
  noCacheHeader: boolean;
  /** concatenated user/system text of the request (from slots) — used only for the dynamic-content check */
  promptText: string;
  options?: CachePolicyOptions;
}

export function decideCache(input: CacheDecisionInput): CacheDecision {
  const o = input.options ?? {};
  if (!input.active) return { eligible: false, status: "disabled", reason: "technique inactive" };
  if (input.noCacheHeader) return { eligible: false, status: "bypass", reason: "x-maindy-no-cache" };
  if (input.stream && o.allowStreaming === false) return { eligible: false, status: "bypass", reason: "streaming cache disallowed" };
  const b = input.body;
  const temp = b.temperature;
  if (!o.allowNonDeterministic && temp !== 0) {
    return { eligible: false, status: "bypass", reason: temp === undefined ? "temperature unset (non-deterministic default)" : "temperature > 0" };
  }
  if (typeof b.n === "number" && b.n > 1) return { eligible: false, status: "bypass", reason: "n > 1" };
  const { names, builtinTypes } = toolNames(b);
  const dynamicBuiltin = builtinTypes.find((t) => DYNAMIC_BUILTIN_TOOL_TYPES.test(t));
  if (dynamicBuiltin) return { eligible: false, status: "bypass", reason: `dynamic built-in tool ${dynamicBuiltin}` };
  const sideEffect = names.find((n) => SIDE_EFFECT_TOOL.test(n));
  if (sideEffect) return { eligible: false, status: "bypass", reason: "tool with side effects" };
  if (DYNAMIC_TEXT.test(input.promptText)) return { eligible: false, status: "bypass", reason: "time-dependent content" };
  return { eligible: true, status: "miss" };
}

/* ------------------------------------------------------------------ */
/* Store (injectable: in-memory here, sqlite in the gateway)           */
/* ------------------------------------------------------------------ */

export interface CacheEntry {
  key: string;
  tenant: string;
  project: string | null;
  createdAt: number;
  expiresAt: number;
  model: string;
  provider: string;
  stream: boolean;
  status: number;
  contentType: string;
  /** raw response body (JSON text or SSE text) — stored on the customer's own machine only */
  body: string;
  /** usage of the ORIGINAL upstream response — basis of the cache_replay baseline */
  usage: UsageTokens;
}

export interface ExactCacheStore {
  get(key: string, now: number): CacheEntry | null;
  set(entry: CacheEntry): void;
  delete(key: string): void;
  purgeExpired(now: number): number;
}

export class MemoryCacheStore implements ExactCacheStore {
  private readonly map = new Map<string, CacheEntry>();
  get(key: string, now: number): CacheEntry | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt <= now) {
      this.map.delete(key);
      return null;
    }
    return e;
  }
  set(entry: CacheEntry): void {
    this.map.set(entry.key, entry);
  }
  delete(key: string): void {
    this.map.delete(key);
  }
  purgeExpired(now: number): number {
    let n = 0;
    for (const [k, e] of this.map) if (e.expiresAt <= now) (this.map.delete(k), n++);
    return n;
  }
}

/** Max body we are willing to store per entry. */
export const MAX_CACHE_BODY_BYTES = 2 * 1024 * 1024;

export function isStorableResponse(status: number, body: string, usage: UsageTokens): boolean {
  return status === 200 && body.length > 0 && Buffer.byteLength(body) <= MAX_CACHE_BODY_BYTES && usage.source !== "unavailable";
}
