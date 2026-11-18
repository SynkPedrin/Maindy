/**
 * Provider proxy: /v1/chat/completions, /v1/responses, /v1/messages.
 *
 * Flow: parse → select upstream → policy → loop_guard → retry_budget → exact_cache (hit ⇒ replay)
 *       → optimizeRequest (fail-open) → upstream (undici, streaming pass-through) → measure → event.
 * Prompts and credentials are never logged or persisted; the event is metadata only.
 */
import { randomUUID } from "node:crypto";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import type { FastifyReply, FastifyRequest } from "fastify";
import { request as undiciRequest, type Dispatcher } from "undici";
import {
  ConnectorKind,
  RequestUsageEvent,
  type Money,
  type OrbitPolicyDto,
  type QualityEvaluationEvent,
  type TechniqueApplication,
  type TechniqueName,
  type UsageTokens,
} from "@maindy/contracts";
import {
  activeTechniques,
  application,
  cacheKey,
  cacheReplayBaseline,
  costForUsage,
  countTokens,
  decideCache,
  evaluate,
  isStorableResponse,
  MAX_CACHE_BODY_BYTES,
  optimizeRequest,
  pairedSampleBaseline,
  preOptimizationBaseline,
  promptCacheHintBaseline,
  promptHash,
  requestSavings,
  RetryBudget,
  shouldSample,
  type CostOptions,
  type JsonObject,
  type RequestBaseline,
} from "@maindy/orbit-engine";
import {
  clientRequestedStreamUsage,
  errorBody,
  injectIncludeUsage,
  isStreamRequest,
  normalizeError,
  promptTextForChecks,
  requestModel,
  requestSlots,
  requestWantsJson,
  responseText,
  SseParser,
  StreamMeter,
  usageFromResponse,
  type WireFormat,
} from "@maindy/provider-adapters";
import type { GatewayContext } from "./context.js";
import type { UpstreamConfig } from "./config.js";
import { connectorForUpstream, joinUrl, providerName, RESPONSE_SKIP, selectUpstream, upstreamHeaders, UpstreamError } from "./upstreams.js";

type Headers = Record<string, string | string[] | undefined>;

const ZERO = (source: Money["source"] = "locally_measured"): Money => ({ micros: 0, currency: "USD", source });

function h(headers: Headers, name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function truthy(v: string | undefined): boolean {
  return v !== undefined && /^(1|true|yes)$/i.test(v.trim());
}

export function detectConnector(ua: string | undefined, explicit: string | undefined, u: UpstreamConfig): ConnectorKind {
  if (explicit) {
    const p = ConnectorKind.safeParse(explicit);
    if (p.success) return p.data;
  }
  if (ua && /claude-cli|claude-code/i.test(ua)) return "claude_code";
  if (ua && /codex/i.test(ua)) return "codex";
  return connectorForUpstream(u);
}

function costOpts(u: UpstreamConfig): CostOptions {
  return { provider: providerName(u), local: u.local };
}

function decodeBody(buf: Buffer, encoding: string | undefined): string {
  try {
    if (encoding === "gzip") return gunzipSync(buf).toString("utf8");
    if (encoding === "br") return brotliDecompressSync(buf).toString("utf8");
    if (encoding === "deflate") return inflateSync(buf).toString("utf8");
  } catch {
    return "";
  }
  return buf.toString("utf8");
}

function filteredResponseHeaders(up: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(up)) {
    if (v === undefined || RESPONSE_SKIP.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

/** Remove `"usage":null` fields that OpenAI adds to every chunk once include_usage is on (byte-preserving otherwise). */
export function stripUsageNull(raw: string): string {
  if (!raw.includes('"usage"')) return raw;
  return raw.replace(/,\s*"usage"\s*:\s*null(?=\s*[,}])/g, "").replace(/"usage"\s*:\s*null\s*,\s*/g, "");
}

/** Re-emit stored SSE text, optionally dropping the injected usage chunk. */
export function* replaySse(format: WireFormat, text: string, dropUsage: boolean): Generator<string> {
  const p = new SseParser();
  const m = new StreamMeter(format);
  for (const ev of [...p.feed(text), ...p.flush()]) {
    const isUsage = m.onEvent(ev);
    if (dropUsage && isUsage) continue;
    yield dropUsage ? stripUsageNull(ev.raw) : ev.raw;
  }
}

function sendError(reply: FastifyReply, format: WireFormat | null, status: number, type: string, message: string, extra: Record<string, string> = {}): FastifyReply {
  return reply.code(status).headers(extra).header("content-type", "application/json").send(JSON.stringify(errorBody(format, type, message)));
}

function estimateUsage(model: string | null, promptText: string, outputText: string): UsageTokens {
  const i = countTokens(promptText, model);
  const o = countTokens(outputText, model);
  return { inputTokens: i.tokens, outputTokens: o.tokens, cachedInputTokens: 0, cacheWriteTokens: 0, source: i.source };
}

interface EventDraft {
  eventId: string;
  occurredAt: string;
  connector: ConnectorKind;
  upstream: UpstreamConfig;
  model: string;
  endpoint: string;
  projectKey: string | null;
  agentKey: string | null;
  sessionKey: string | null;
  streaming: boolean;
  policy: OrbitPolicyDto;
  hash: string;
}

function buildEvent(
  d: EventDraft,
  p: {
    status: RequestUsageEvent["status"];
    httpStatus: number | null;
    latencyMs: number;
    usage: UsageTokens;
    cost: Money;
    pricingVersion: string;
    baseline: RequestBaseline;
    overhead: Money;
    techniques: TechniqueApplication[];
    cacheStatus: RequestUsageEvent["cache"]["status"];
    fallbackOriginal: boolean;
    errorCode: string | null;
  },
): RequestUsageEvent {
  return {
    eventId: d.eventId,
    occurredAt: d.occurredAt,
    connector: d.connector,
    provider: providerName(d.upstream).slice(0, 60),
    model: d.model.slice(0, 120),
    endpoint: d.endpoint.slice(0, 120),
    projectKey: d.projectKey,
    agentKey: d.agentKey,
    sessionKey: d.sessionKey,
    streaming: d.streaming,
    status: p.status,
    httpStatus: p.httpStatus,
    latencyMs: Math.max(0, Math.round(p.latencyMs)),
    orbitMode: d.policy.mode,
    usage: p.usage,
    cost: p.cost,
    pricingVersion: p.pricingVersion.slice(0, 40),
    baselineCost: p.baseline.baselineCost,
    baselineMethod: p.baseline.baselineMethod,
    overheadCost: p.overhead,
    techniques: p.techniques,
    cache: { status: p.cacheStatus },
    promptHash: d.hash,
    fallbackOriginal: p.fallbackOriginal,
    errorCode: p.errorCode ? p.errorCode.slice(0, 80) : null,
  };
}

/** Persist the event in the outbox + update local counters. Never throws. */
export function recordEvent(ctx: GatewayContext, ev: RequestUsageEvent): void {
  try {
    const parsed = RequestUsageEvent.safeParse(ev);
    if (!parsed.success) {
      ctx.log.error("evento inválido descartado", { code: "event_invalid", detail: parsed.error.issues.map((i) => i.path.join(".")).join(",") });
      return;
    }
    ctx.db.enqueue("usage", ev.eventId, ev.occurredAt, parsed.data);
    const avoided = ev.techniques.filter((t) => t.applied && t.source !== "unavailable").reduce((n, t) => n + t.tokensSaved, 0);
    const savings = requestSavings(ev.cost, ev.overheadCost, { baselineCost: ev.baselineCost, baselineMethod: ev.baselineMethod, detail: "" });
    ctx.db.incr({
      requests: 1,
      cache_hits: ev.status === "cache_hit" ? 1 : 0,
      errors: ev.status === "error" ? 1 : 0,
      blocked: ev.status === "blocked" ? 1 : 0,
      tokens_in: ev.usage.source === "unavailable" ? 0 : ev.usage.inputTokens,
      tokens_out: ev.usage.source === "unavailable" ? 0 : ev.usage.outputTokens,
      tokens_avoided: avoided,
      cost_micros: ev.cost.source === "unavailable" ? 0 : ev.cost.micros,
      saved_micros: savings.gross?.micros ?? 0,
      baseline_events: savings.gross ? 1 : 0,
    });
  } catch (err) {
    ctx.log.error("falha ao registrar evento", { code: (err as Error).name });
  }
}

function recordQuality(ctx: GatewayContext, technique: TechniqueName, ev: ReturnType<typeof evaluate>, projectKey: string | null): void {
  const signal = ctx.regression.record(technique, ev.passed);
  const q: QualityEvaluationEvent = {
    evaluationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    technique,
    method: ev.method,
    passed: ev.passed,
    score: ev.score,
    projectKey,
    detail: ev.detail ? ev.detail.slice(0, 500) : null,
    triggeredRollback: signal !== null,
  };
  ctx.db.enqueue("quality", q.evaluationId, q.occurredAt, q);
  ctx.db.incr({ quality_evaluations: 1, quality_passed: ev.passed ? 1 : 0, rollbacks: signal ? 1 : 0 });
  if (signal) {
    ctx.policy.addRollback(technique);
    ctx.log.warn("Quality Guard: rollback de técnica", { code: technique, detail: signal.reason });
    void ctx.policy.reportRollback(technique, signal.reason);
  }
}

interface UpstreamJsonResult {
  status: number;
  json: unknown;
  usage: UsageTokens | null;
  model: string | null;
}

/** Non-streaming call used by Quality Guard shadow samples (body = ORIGINAL request, forced non-stream). */
async function shadowCall(ctx: GatewayContext, u: UpstreamConfig, path: string, body: JsonObject, headers: Headers, format: WireFormat): Promise<UpstreamJsonResult | null> {
  try {
    const raw = Buffer.from(JSON.stringify({ ...body, stream: false, stream_options: undefined }));
    const res = await undiciRequest(joinUrl(u.baseUrl, path), {
      method: "POST",
      headers: upstreamHeaders(u, headers, raw.length, ctx.credentials),
      body: raw,
      dispatcher: ctx.dispatcher,
      headersTimeout: 120_000,
      bodyTimeout: 120_000,
    });
    const text = decodeBody(Buffer.from(await res.body.arrayBuffer()), h(res.headers as Headers, "content-encoding"));
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const usage = res.statusCode < 300 ? usageFromResponse(format, json) : null;
    return { status: res.statusCode, json, usage, model: json && typeof (json as JsonObject).model === "string" ? ((json as JsonObject).model as string) : null };
  } catch {
    return null;
  }
}

const TEXT_ALTERING: TechniqueName[] = ["tool_output_compression", "context_dedup", "output_budget", "model_routing"];

export async function handleProvider(ctx: GatewayContext, format: WireFormat, req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
  const t0 = performance.now();
  const occurredAt = new Date();
  const headers = req.headers as Headers;
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
  let body: JsonObject;
  try {
    const parsed = JSON.parse(raw.toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not object");
    body = parsed as JsonObject;
  } catch {
    return sendError(reply, format, 400, "invalid_request_error", "maindy. gateway: corpo JSON inválido.");
  }

  let upstream: UpstreamConfig;
  try {
    upstream = selectUpstream(ctx.cfg, format, requestModel(body), h(headers, "x-maindy-upstream"));
  } catch (err) {
    if (err instanceof UpstreamError) return sendError(reply, format, err.status, err.code, err.message);
    throw err;
  }

  const policy = ctx.policy.current();
  const active = activeTechniques(policy, { routing: ctx.cfg.routing, outputBudgetTokens: ctx.cfg.outputBudgetTokens, cache: ctx.cfg.cache }, ctx.policy.localRollbacks());
  const stream = isStreamRequest(body);
  const hash = promptHash(format, body);
  const projectKey = h(headers, "x-maindy-project")?.slice(0, 120) ?? null;
  const sessionKey = (h(headers, "x-maindy-session") ?? h(headers, "x-claude-code-session-id"))?.slice(0, 200) ?? null;
  const draft: EventDraft = {
    eventId: randomUUID(),
    occurredAt: occurredAt.toISOString(),
    connector: detectConnector(h(headers, "user-agent"), h(headers, "x-maindy-connector"), upstream),
    upstream,
    model: requestModel(body) ?? "unknown",
    endpoint: req.url.split("?")[0]!,
    projectKey,
    agentKey: h(headers, "x-maindy-agent")?.slice(0, 120) ?? null,
    sessionKey,
    streaming: stream,
    policy,
    hash,
  };
  const now = Date.now();
  const scopeKey = `${ctx.tenant()}|${projectKey ?? ""}|${sessionKey ?? ""}|${upstream.id}|${hash}`;
  const techniques: TechniqueApplication[] = [];
  const extraHeaders: Record<string, string> = { "x-maindy-request-id": draft.eventId };
  const blocked = (tech: TechniqueName, count: number, message: string) => {
    techniques.push(application(tech, true, 0, "unavailable", `${count}x`));
    recordEvent(
      ctx,
      buildEvent(draft, {
        status: "blocked",
        httpStatus: 429,
        latencyMs: performance.now() - t0,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, source: "locally_measured" },
        cost: ZERO(),
        pricingVersion: ctx.pricingVersion,
        baseline: { baselineCost: null, baselineMethod: "none", detail: "" },
        overhead: ZERO(),
        techniques,
        cacheStatus: "disabled",
        fallbackOriginal: false,
        errorCode: `maindy_${tech}`,
      }),
    );
    ctx.log.warn("requisição bloqueada", { route: draft.endpoint, code: tech, count, eventId: draft.eventId });
    return sendError(reply, format, 429, `maindy_${tech}`, message, extraHeaders);
  };

  /* ---------- loop guard & retry budget (pre-flight, cheap) ---------- */
  const lg = ctx.loopGuard.check(scopeKey, policy.mode, now, active.has("loop_guard"));
  if (lg.action === "block") return blocked("loop_guard", lg.count, lg.message!);
  if (lg.action === "warn") {
    techniques.push(application("loop_guard", false, 0, "unavailable", `aviso: ${lg.count}x`));
    extraHeaders["x-maindy-warning"] = "loop_suspected";
  }
  const rb = ctx.retryBudget.check(scopeKey, now, active.has("retry_budget"));
  if (rb.action === "block") return blocked("retry_budget", rb.count, rb.message!);

  /* ---------- exact cache ---------- */
  const promptText = promptTextForChecks(format, body);
  const decision = decideCache({
    active: active.has("exact_cache"),
    format,
    body,
    stream,
    noCacheHeader: truthy(h(headers, "x-maindy-no-cache")),
    promptText,
    options: ctx.cfg.cache,
  });
  let cacheStatus: RequestUsageEvent["cache"]["status"] = decision.status;
  // baseUrl is part of the scope: repointing an upstream (PUT /maindy/upstreams/:id) never replays another backend's answers
  const key = decision.eligible ? cacheKey({ tenant: ctx.tenant(), project: projectKey, upstream: `${upstream.id}@${upstream.baseUrl}` }, format, stream, hash) : null;
  if (key) {
    const entry = ctx.db.get(key, now);
    if (entry) {
      extraHeaders["x-maindy-cache"] = "hit";
      const dropUsage = format === "openai_chat" && stream && !clientRequestedStreamUsage(body);
      if (entry.stream) {
        reply.hijack();
        const res = reply.raw;
        res.writeHead(entry.status, { "content-type": entry.contentType, "cache-control": "no-cache", ...extraHeaders });
        for (const piece of replaySse(format, entry.body, dropUsage)) res.write(piece);
        res.end();
      } else {
        void reply.code(entry.status).headers(extraHeaders).header("content-type", entry.contentType).send(entry.body);
      }
      const baseline = cacheReplayBaseline(entry.model, entry.usage, costOpts(upstream));
      const avoided = entry.usage.inputTokens + entry.usage.outputTokens;
      techniques.push(application("exact_cache", true, avoided, entry.usage.source, "hit"));
      const finish = (overhead: Money) =>
        recordEvent(
          ctx,
          buildEvent(
            { ...draft, model: entry.model },
            {
              status: "cache_hit",
              httpStatus: entry.status,
              latencyMs: performance.now() - t0,
              usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, source: "locally_measured" },
              cost: ZERO(),
              pricingVersion: ctx.pricingVersion,
              baseline,
              overhead,
              techniques,
              cacheStatus: "hit",
              fallbackOriginal: false,
              errorCode: null,
            },
          ),
        );
      ctx.log.info("cache hit", { route: draft.endpoint, upstream: upstream.id, model: entry.model, cache: "hit", eventId: draft.eventId, ms: Math.round(performance.now() - t0) });
      // Quality Guard shadow sample of a cache hit (non-stream only): replay vs fresh answer
      if (!entry.stream && shouldSample(policy.qualitySampleRate, ctx.rng)) {
        void (async () => {
          const s = await shadowCall(ctx, upstream, req.url, body, headers, format);
          let overhead = ZERO();
          if (s && s.status < 300) {
            if (s.usage) overhead = costForUsage(s.model ?? entry.model, s.usage, costOpts(upstream)).cost;
            const wants = requestWantsJson(format, body);
            const ev = evaluate({
              reference: responseText(format, s.json),
              candidate: responseText(format, safeJson(entry.body)),
              deterministic: body.temperature === 0,
              wantsJson: wants.wantsJson,
              jsonSchema: wants.schema,
            });
            recordQuality(ctx, "exact_cache", ev, projectKey);
          }
          finish(overhead);
        })();
      } else {
        finish(ZERO());
      }
      return;
    }
  }

  /* ---------- request optimization (fail-open) ---------- */
  const opt = optimizeRequest({
    format,
    body,
    buildSlots: (b) => requestSlots(format, b),
    active,
    mode: policy.mode,
    extras: { routing: ctx.cfg.routing, outputBudgetTokens: ctx.cfg.outputBudgetTokens },
    maxAddedLatencyMs: policy.maxAddedLatencyMs,
  });
  techniques.push(...opt.applications);
  if (opt.fallbackOriginal) ctx.log.warn("fallback_original", { route: draft.endpoint, code: opt.fallbackReason ?? "fallback" });
  let outBody = opt.body;
  let injected = false;
  if (format === "openai_chat" && stream) {
    if (outBody === body) outBody = { ...body };
    injected = injectIncludeUsage(format, outBody);
  }
  const outRaw = outBody === body ? raw : Buffer.from(JSON.stringify(outBody));
  const outModel = requestModel(outBody) ?? draft.model;
  if (opt.routedFrom) extraHeaders["x-maindy-routed-from"] = opt.routedFrom;
  if (key) extraHeaders["x-maindy-cache"] = "miss";
  else extraHeaders["x-maindy-cache"] = cacheStatus;
  if (key) techniques.push(application("exact_cache", false, 0, "unavailable", "miss"));

  /* ---------- upstream ---------- */
  const ac = new AbortController();
  let clientGone = false;
  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) {
      clientGone = true;
      ac.abort();
    }
  });
  let up: Dispatcher.ResponseData;
  try {
    up = await undiciRequest(joinUrl(upstream.baseUrl, req.url), {
      method: "POST",
      headers: upstreamHeaders(upstream, headers, outRaw.length, ctx.credentials),
      body: outRaw,
      signal: ac.signal,
      dispatcher: ctx.dispatcher,
      headersTimeout: 600_000,
      bodyTimeout: 600_000,
    });
  } catch (err) {
    ctx.retryBudget.recordOutcome(scopeKey, Date.now(), true);
    recordEvent(
      ctx,
      buildEvent(
        { ...draft, model: outModel },
        {
          status: "error",
          httpStatus: null,
          latencyMs: performance.now() - t0,
          usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, source: "unavailable" },
          cost: ZERO("unavailable"),
          pricingVersion: ctx.pricingVersion,
          baseline: { baselineCost: null, baselineMethod: "none", detail: "" },
          overhead: ZERO(),
          techniques,
          cacheStatus,
          fallbackOriginal: opt.fallbackOriginal,
          errorCode: clientGone ? "client_aborted" : "upstream_unreachable",
        },
      ),
    );
    ctx.log.warn("upstream inacessível", { route: draft.endpoint, upstream: upstream.id, code: (err as Error).name });
    if (clientGone) return;
    return sendError(reply, format, 502, "maindy_upstream_unreachable", `maindy. gateway: não foi possível conectar ao upstream "${upstream.id}".`, extraHeaders);
  }

  const upHeaders = up.headers as Headers;
  const requestId = h(upHeaders, "request-id") ?? h(upHeaders, "x-request-id") ?? null;
  if (requestId) ctx.db.markSeen(requestId, "proxy");
  const contentType = h(upHeaders, "content-type") ?? "";
  const isSse = contentType.includes("text/event-stream");
  let status: RequestUsageEvent["status"] = opt.fallbackOriginal ? "fallback" : "ok";
  let usage: UsageTokens | null = null;
  let respModel: string | null = null;
  let errorCode: string | null = null;
  let primaryText = "";
  let primaryJson: unknown = null;

  if (isSse && up.statusCode < 300) {
    /* ---------- streaming pass-through ---------- */
    reply.hijack();
    const res = reply.raw;
    res.writeHead(up.statusCode, { ...filteredResponseHeaders(up.headers), ...extraHeaders });
    const parser = new SseParser();
    const meter = new StreamMeter(format);
    const decoder = new TextDecoder();
    let stored = "";
    let storeOk = key !== null;
    try {
      for await (const chunk of up.body) {
        const text = decoder.decode(chunk as Buffer, { stream: true });
        if (storeOk) {
          stored += text;
          if (stored.length > MAX_CACHE_BODY_BYTES) {
            storeOk = false;
            stored = "";
          }
        }
        if (!injected) {
          res.write(chunk);
          for (const ev of parser.feed(text)) meter.onEvent(ev);
        } else {
          let out = "";
          for (const ev of parser.feed(text)) {
            if (meter.onEvent(ev)) continue; // injected usage chunk: measured, not forwarded
            out += stripUsageNull(ev.raw);
          }
          if (out) res.write(out);
        }
      }
      const tail = decoder.decode();
      if (tail) for (const ev of parser.feed(tail)) if (!(meter.onEvent(ev) && injected)) res.write(injected ? stripUsageNull(ev.raw) : "");
      for (const ev of parser.flush()) {
        const isUsage = meter.onEvent(ev);
        if (injected && !isUsage) res.write(stripUsageNull(ev.raw));
      }
      res.end();
    } catch {
      errorCode = clientGone ? "client_aborted" : "stream_interrupted";
      status = "error";
      storeOk = false;
      if (!res.writableEnded) res.end();
    }
    const m = meter.result();
    respModel = m.model;
    usage = m.usage;
    if (m.error) {
      status = "error";
      errorCode = m.error.type;
      storeOk = false;
    }
    if (!usage) usage = estimateUsage(outModel, requestSlots(format, outBody).map((s) => s.text).join("\n"), m.outputText);
    if (storeOk && key && m.completed && usage.source === "provider_reported" && isStorableResponse(up.statusCode, stored, usage)) {
      ctx.db.set({
        key,
        tenant: ctx.tenant(),
        project: projectKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + policy.cacheTtlSeconds * 1000,
        model: respModel ?? outModel,
        provider: providerName(upstream),
        stream: true,
        status: up.statusCode,
        contentType: contentType || "text/event-stream",
        body: stored,
        usage,
      });
      cacheStatus = "store";
    }
  } else {
    /* ---------- buffered (non-stream or error) ---------- */
    const buf = Buffer.from(await up.body.arrayBuffer());
    if (!clientGone) {
      void reply.code(up.statusCode).headers(filteredResponseHeaders(up.headers)).headers(extraHeaders).send(buf);
    }
    const text = decodeBody(buf, h(upHeaders, "content-encoding"));
    if (up.statusCode >= 300) {
      const ne = normalizeError(up.statusCode, text);
      status = "error";
      errorCode = ne.code;
    } else {
      primaryJson = safeJson(text);
      respModel = primaryJson && typeof (primaryJson as JsonObject).model === "string" ? ((primaryJson as JsonObject).model as string) : null;
      usage = usageFromResponse(format, primaryJson);
      primaryText = responseText(format, primaryJson);
      if (!usage) usage = estimateUsage(outModel, requestSlots(format, outBody).map((s) => s.text).join("\n"), primaryText);
      if (key && isStorableResponse(up.statusCode, text, usage) && usage.source === "provider_reported") {
        ctx.db.set({
          key,
          tenant: ctx.tenant(),
          project: projectKey,
          createdAt: Date.now(),
          expiresAt: Date.now() + policy.cacheTtlSeconds * 1000,
          model: respModel ?? outModel,
          provider: providerName(upstream),
          stream: false,
          status: up.statusCode,
          contentType: contentType || "application/json",
          body: text,
          usage,
        });
        cacheStatus = "store";
      }
    }
  }

  ctx.retryBudget.recordOutcome(scopeKey, Date.now(), status === "error" && RetryBudget.isRetryableFailure(up.statusCode >= 300 ? up.statusCode : null));
  const finalUsage: UsageTokens = usage ?? { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, source: "unavailable" };
  const costModel = respModel ?? outModel;
  const priced = costForUsage(costModel, finalUsage, costOpts(upstream));
  let baseline: RequestBaseline = { baselineCost: null, baselineMethod: "none", detail: "" };
  if (status !== "error") {
    if (opt.tokensRemoved > 0) baseline = preOptimizationBaseline(costModel, finalUsage, opt.tokensRemoved, costOpts(upstream));
    else if (opt.promptCacheHintAdded) baseline = promptCacheHintBaseline(costModel, finalUsage, costOpts(upstream));
  }
  const latencyMs = performance.now() - t0;
  const emit = (overhead: Money, b: RequestBaseline) =>
    recordEvent(
      ctx,
      buildEvent(
        { ...draft, model: costModel },
        {
          status,
          httpStatus: up.statusCode,
          latencyMs,
          usage: finalUsage,
          cost: priced.cost,
          pricingVersion: priced.pricingVersion,
          baseline: b,
          overhead,
          techniques,
          cacheStatus,
          fallbackOriginal: opt.fallbackOriginal,
          errorCode,
        },
      ),
    );
  ctx.log.info("proxy", {
    route: draft.endpoint,
    status: up.statusCode,
    ms: Math.round(latencyMs),
    upstream: upstream.id,
    model: costModel,
    cache: cacheStatus,
    eventId: draft.eventId,
  });

  /* ---------- Quality Guard: paired shadow sample of the ORIGINAL request ---------- */
  const altered = opt.applications.filter((a) => a.applied && TEXT_ALTERING.includes(a.name)).map((a) => a.name);
  if (!stream && status === "ok" && altered.length > 0 && shouldSample(policy.qualitySampleRate, ctx.rng)) {
    void (async () => {
      const s = await shadowCall(ctx, upstream, req.url, body, headers, format);
      if (!s || s.status >= 300 || !s.usage) return emit(ZERO(), baseline);
      const shadowCost = costForUsage(s.model ?? draft.model, s.usage, costOpts(upstream)).cost;
      const wants = requestWantsJson(format, body);
      const ev = evaluate({
        reference: responseText(format, s.json),
        candidate: primaryText,
        deterministic: body.temperature === 0,
        wantsJson: wants.wantsJson,
        jsonSchema: wants.schema,
      });
      for (const t of altered) recordQuality(ctx, t, ev, projectKey);
      emit(shadowCost, pairedSampleBaseline(shadowCost));
    })();
  } else {
    emit(ZERO(), baseline);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
