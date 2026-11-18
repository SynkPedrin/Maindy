/**
 * OTLP/HTTP JSON receiver logic (pure functions).
 *
 * Claude Code: log events `claude_code.api_request` (event.name "api_request") with model, cost_usd,
 *   duration_ms, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, request_id, session.id.
 *   → usage provider_reported; cost provider_reported but it is Claude Code's own LIST-PRICE ESTIMATE
 *     (not an invoice) — flagged via pricingVersion "claude-code-otel-list-estimate".
 * Codex: `codex.sse_event` (event.kind response.completed) / `codex.api_request`; token attribute names are
 *   not stable (input_token_count | input_tokens | prompt_tokens …) → tolerant parsing; cost is a list-price
 *   equivalent computed by MAINDY (experimentally_estimated) because subscription users are not billed per token.
 */
import { createHash } from "node:crypto";
import type { OrbitMode, RequestUsageEvent } from "@maindy/contracts";
import { costForUsage, PRICING_VERSION } from "@maindy/orbit-engine";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export type AttrValue = string | number | boolean | null;

/** Decode an OTLP AnyValue (JSON encoding: int64 as string). */
export function anyValue(v: unknown): AttrValue {
  if (!isObj(v)) return null;
  if (typeof v.stringValue === "string") return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (typeof v.boolValue === "boolean") return v.boolValue;
  return null;
}

export function attrsToMap(attrs: unknown): Map<string, AttrValue> {
  const m = new Map<string, AttrValue>();
  if (!Array.isArray(attrs)) return m;
  for (const a of attrs) if (isObj(a) && typeof a.key === "string") m.set(a.key, anyValue(a.value));
  return m;
}

export interface FlatLogRecord {
  name: string;
  timeMs: number | null;
  attrs: Map<string, AttrValue>;
}

/** Flatten resourceLogs → records with merged resource + record attributes and a resolved event name. */
export function flattenLogs(body: unknown): FlatLogRecord[] {
  const out: FlatLogRecord[] = [];
  if (!isObj(body) || !Array.isArray(body.resourceLogs)) return out;
  for (const rl of body.resourceLogs) {
    if (!isObj(rl)) continue;
    const resAttrs = attrsToMap(isObj(rl.resource) ? rl.resource.attributes : undefined);
    const scopes = Array.isArray(rl.scopeLogs) ? rl.scopeLogs : [];
    for (const sl of scopes) {
      if (!isObj(sl) || !Array.isArray(sl.logRecords)) continue;
      for (const lr of sl.logRecords) {
        if (!isObj(lr)) continue;
        const attrs = new Map([...resAttrs, ...attrsToMap(lr.attributes)]);
        const bodyStr = anyValue(lr.body);
        const evName = attrs.get("event.name");
        const name = String(evName ?? (typeof bodyStr === "string" ? bodyStr : "") ?? "");
        const nano = lr.timeUnixNano ?? lr.observedTimeUnixNano;
        const timeMs = nano !== undefined && nano !== null && String(nano) !== "0" ? Math.floor(Number(BigInt(String(nano)) / 1_000_000n)) : null;
        out.push({ name, timeMs, attrs });
      }
    }
  }
  return out;
}

function num(attrs: Map<string, AttrValue>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = attrs.get(k);
    if (v === undefined || v === null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(attrs: Map<string, AttrValue>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = attrs.get(k);
    if (v !== undefined && v !== null && String(v) !== "") return String(v);
  }
  return null;
}

/** RFC-4122-shaped v4 UUID derived from a stable key — re-ingesting the same record is idempotent. */
export function stableUuid(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

const int = (n: number | null) => Math.max(0, Math.round(n ?? 0));

export interface OtlpEventCandidate {
  dedupeKey: string;
  /** provider request id when available (used to skip requests already metered by the proxy) */
  requestId: string | null;
  event: RequestUsageEvent;
}

const CLAUDE_NAMES = new Set(["api_request", "claude_code.api_request"]);
const CODEX_NAMES = new Set(["codex.sse_event", "codex.api_request", "sse_event", "api_request_codex"]);

export function isCodexRecord(r: FlatLogRecord): boolean {
  const svc = String(r.attrs.get("service.name") ?? "");
  return CODEX_NAMES.has(r.name) || r.name.startsWith("codex.") || /codex/i.test(svc);
}

export function claudeCodeEvent(r: FlatLogRecord, mode: OrbitMode, now: number): OtlpEventCandidate | null {
  if (!CLAUDE_NAMES.has(r.name) || isCodexRecord(r)) return null;
  const a = r.attrs;
  const model = str(a, "model") ?? "unknown";
  const input = int(num(a, "input_tokens"));
  const output = int(num(a, "output_tokens"));
  const cacheRead = int(num(a, "cache_read_tokens"));
  const cacheCreate = int(num(a, "cache_creation_tokens"));
  const costUsd = num(a, "cost_usd");
  const requestId = str(a, "request_id");
  const session = str(a, "session.id");
  const occurred = r.timeMs ?? now;
  const dedupeKey = requestId ? `claude_code:${requestId}` : `claude_code:${session}:${occurred}:${input}:${output}:${cacheRead}:${cacheCreate}`;
  const event: RequestUsageEvent = {
    eventId: stableUuid(dedupeKey),
    occurredAt: new Date(occurred).toISOString(),
    connector: "claude_code",
    provider: "anthropic",
    model: model.slice(0, 120),
    endpoint: "otel:claude_code.api_request",
    projectKey: null,
    agentKey: null,
    sessionKey: session ? session.slice(0, 200) : null,
    streaming: false,
    status: "ok",
    httpStatus: null,
    latencyMs: int(num(a, "duration_ms")),
    orbitMode: mode,
    usage: {
      // Anthropic semantics: input_tokens excludes cache reads/writes → normalized total
      inputTokens: input + cacheRead + cacheCreate,
      outputTokens: output,
      cachedInputTokens: cacheRead,
      cacheWriteTokens: cacheCreate,
      source: "provider_reported",
    },
    cost:
      costUsd === null
        ? { micros: 0, currency: "USD", source: "unavailable" }
        : { micros: Math.round(costUsd * 1_000_000), currency: "USD", source: "provider_reported" },
    pricingVersion: "claude-code-otel-list-estimate",
    baselineCost: null,
    baselineMethod: "none",
    overheadCost: { micros: 0, currency: "USD", source: "locally_measured" },
    techniques: [],
    cache: { status: "disabled" },
    promptHash: sha256(dedupeKey),
    fallbackOriginal: false,
    errorCode: null,
  };
  return { dedupeKey, requestId, event };
}

export function codexEvent(r: FlatLogRecord, mode: OrbitMode, now: number): OtlpEventCandidate | null {
  if (!isCodexRecord(r)) return null;
  const a = r.attrs;
  const kind = str(a, "event.kind", "kind", "sse.event_kind");
  if (kind && kind !== "response.completed") return null;
  const input = num(a, "input_token_count", "input_tokens", "prompt_tokens", "usage.input_tokens");
  const output = num(a, "output_token_count", "output_tokens", "completion_tokens", "usage.output_tokens");
  if (input === null && output === null) return null; // e.g. codex.api_request without tokens
  const cached = int(num(a, "cached_token_count", "cached_input_tokens", "cache_read_tokens", "cached_tokens", "input_cached_tokens"));
  const model = str(a, "model", "slug", "model.slug") ?? "unknown";
  const session = str(a, "conversation.id", "conversation_id", "session.id", "thread.id");
  const requestId = str(a, "request_id", "response_id", "response.id", "x-request-id");
  const occurred = r.timeMs ?? now;
  const dedupeKey = requestId
    ? `codex:${requestId}`
    : `codex:${session}:${occurred}:${int(input)}:${int(output)}:${cached}`;
  const usage = { inputTokens: int(input), outputTokens: int(output), cachedInputTokens: Math.min(cached, int(input)), cacheWriteTokens: 0, source: "provider_reported" as const };
  const priced = costForUsage(model, usage);
  const event: RequestUsageEvent = {
    eventId: stableUuid(dedupeKey),
    occurredAt: new Date(occurred).toISOString(),
    connector: "codex",
    provider: "openai",
    model: model.slice(0, 120),
    endpoint: "otel:codex.sse_event",
    projectKey: null,
    agentKey: null,
    sessionKey: session ? session.slice(0, 200) : null,
    streaming: true,
    status: "ok",
    httpStatus: null,
    latencyMs: int(num(a, "duration_ms", "duration")),
    orbitMode: mode,
    usage,
    cost: priced.priced ? { ...priced.cost, source: "experimentally_estimated" } : priced.cost,
    pricingVersion: `${PRICING_VERSION}:codex-list-equivalent`,
    baselineCost: null,
    baselineMethod: "none",
    overheadCost: { micros: 0, currency: "USD", source: "locally_measured" },
    techniques: [],
    cache: { status: "disabled" },
    promptHash: sha256(dedupeKey),
    fallbackOriginal: false,
    errorCode: null,
  };
  return { dedupeKey, requestId, event };
}

/** Parse an OTLP logs payload into usage-event candidates (Claude Code + Codex). */
export function eventsFromOtlpLogs(body: unknown, mode: OrbitMode, now = Date.now()): { candidates: OtlpEventCandidate[]; records: number } {
  const recs = flattenLogs(body);
  const candidates: OtlpEventCandidate[] = [];
  for (const r of recs) {
    const c = claudeCodeEvent(r, mode, now) ?? codexEvent(r, mode, now);
    if (c) candidates.push(c);
  }
  return { candidates, records: recs.length };
}

/** Count datapoints in an OTLP metrics payload (we accept metrics but derive events from logs only). */
export function countMetricPoints(body: unknown): { metrics: number; names: string[] } {
  const names = new Set<string>();
  let metrics = 0;
  if (!isObj(body) || !Array.isArray(body.resourceMetrics)) return { metrics, names: [] };
  for (const rm of body.resourceMetrics) {
    if (!isObj(rm) || !Array.isArray(rm.scopeMetrics)) continue;
    for (const sm of rm.scopeMetrics) {
      if (!isObj(sm) || !Array.isArray(sm.metrics)) continue;
      for (const m of sm.metrics) {
        if (!isObj(m)) continue;
        metrics++;
        if (typeof m.name === "string") names.add(m.name);
      }
    }
  }
  return { metrics, names: [...names] };
}

/**
 * Which integration sent this OTLP payload (logs or metrics)? Used only for the "last event" timestamp of
 * GET /maindy/integrations — by resource `service.name` and event/metric name prefixes.
 */
export function otlpSources(body: unknown): Set<"claude_code" | "codex"> {
  const out = new Set<"claude_code" | "codex">();
  if (!isObj(body)) return out;
  const classify = (svc: string, name: string) => {
    if (/codex/i.test(svc) || name.startsWith("codex.")) out.add("codex");
    else if (/claude/i.test(svc) || name.startsWith("claude_code.")) out.add("claude_code");
  };
  for (const key of ["resourceLogs", "resourceMetrics"] as const) {
    const list = body[key];
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (!isObj(r)) continue;
      const svc = String(attrsToMap(isObj(r.resource) ? r.resource.attributes : undefined).get("service.name") ?? "");
      const scopes = Array.isArray(r.scopeLogs) ? r.scopeLogs : Array.isArray(r.scopeMetrics) ? r.scopeMetrics : [];
      let named = false;
      for (const sc of scopes) {
        if (!isObj(sc)) continue;
        const items = Array.isArray(sc.logRecords) ? sc.logRecords : Array.isArray(sc.metrics) ? sc.metrics : [];
        for (const it of items) {
          if (!isObj(it)) continue;
          const n = typeof it.name === "string" ? it.name : String(attrsToMap(it.attributes).get("event.name") ?? "");
          if (n) named = true;
          classify(svc, n);
        }
      }
      if (!named) classify(svc, "");
    }
  }
  return out;
}
