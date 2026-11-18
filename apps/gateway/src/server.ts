import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { Agent, request as undiciRequest } from "undici";
import { GatewayStatus, OrbitPolicyDto, SAVINGS_METHOD_VERSION, type QuotaSnapshot } from "@maindy/contracts";
import { compressToolOutput, countTokens, dedupeContext, summarizeSavings } from "@maindy/orbit-engine";
import { CONNECTOR_CAPABILITIES, errorBody } from "@maindy/provider-adapters";
import { loadConfig, type GatewayConfig } from "./config.js";
import { makeGuards, type GatewayContext } from "./context.js";
import { GatewayDb } from "./db.js";
import { ensureDir, loadOrCreateKey, readDevice, resolveHome, writePrivate, type HomePaths } from "./home.js";
import { Logger } from "./logger.js";
import { countMetricPoints, eventsFromOtlpLogs, otlpSources } from "./otlp.js";
import { LAST_EVENT_KV, registerAdminRoutes } from "./admin.js";
import { PolicyManager } from "./policy.js";
import { handleProvider, recordEvent } from "./proxy.js";
import { quotasFromStatusline } from "./statusline.js";
import { resolveLink, TelemetryFlusher } from "./telemetry.js";
import { connectorForUpstream, CredentialStore, hasCredential, joinUrl, RESPONSE_SKIP, selectUpstream, upstreamHeaders } from "./upstreams.js";

import { GATEWAY_VERSION } from "./version.js";
export { GATEWAY_VERSION };
/** The gateway only ever binds to loopback. */
export const HOST = "127.0.0.1";

export interface BuildOptions {
  home?: string;
  port?: number;
  /** don't write logs to stdout (tests) */
  quiet?: boolean;
  /** start background timers (telemetry flush, policy refresh, cache purge). default true */
  timers?: boolean;
  rng?: () => number;
  configOverride?: (c: GatewayConfig) => GatewayConfig;
  /** home dir whose ~/.claude and ~/.codex the integration endpoints inspect/edit (tests) */
  userHome?: string;
  /** PATH used to detect `claude` / `codex` binaries (tests) */
  searchPath?: string;
  /** how Claude Code should invoke this gateway's CLI (default: SEA execPath or node + bundle) */
  cliCommand?: string;
}

export interface Gateway {
  app: FastifyInstance;
  ctx: GatewayContext;
  listen(): Promise<{ port: number; url: string }>;
  close(): Promise<void>;
}

function keyMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cold-start warm-up: the first compression/tokenization in a fresh process (JIT + o200k rank tables)
 * can exceed the policy latency budget and trigger fallback_original. Found by the ORBIT benchmark
 * (run 1, docs/evidence/orbit-benchmark-run1-coldstart.json). Runs once, on synthetic text only.
 */
export function warmEngine(): number {
  const t0 = performance.now();
  const sample = Array.from({ length: 600 }, (_, i) => `\u001b[32m✓\u001b[39m warm line ${i % 7}\r${i}`).join("\n");
  for (const model of ["gpt-6.2-sol", "claude-sonnet-5-5"]) {
    compressToolOutput(sample, { model });
    countTokens(sample, model);
  }
  const p = "warm paragraph ".repeat(100);
  const slots = [0, 1].map((i) => ({ messageIndex: i, kind: "user" as const, text: p, set() {} }));
  dedupeContext(slots);
  return performance.now() - t0;
}

export function buildGateway(opts: BuildOptions = {}): Gateway {
  const paths: HomePaths = resolveHome(opts.home);
  ensureDir(paths.dir);
  let cfg = loadConfig(paths);
  if (opts.configOverride) cfg = opts.configOverride(cfg);
  if (opts.port !== undefined) cfg.port = opts.port;
  const log = new Logger(paths.log, !opts.quiet);
  const db = new GatewayDb(paths.db);
  const key = loadOrCreateKey(paths);
  let deviceCache = readDevice(paths);
  const device = () => deviceCache;
  const link = () => resolveLink(deviceCache, cfg.cloud.apiUrl);
  const policy = new PolicyManager(paths, db, link, log);
  const flusher = new TelemetryFlusher(db, link, log, cfg.telemetry.batchSize);
  const ctx: GatewayContext = {
    version: GATEWAY_VERSION,
    startedAt: Date.now(),
    cfg,
    paths,
    db,
    log,
    key,
    policy,
    flusher,
    link,
    device,
    tenant: () => deviceCache?.organizationId ?? cfg.tenant,
    dispatcher: new Agent({ keepAliveTimeout: 30_000, connections: 64 }),
    rng: opts.rng ?? Math.random,
    credentials: new CredentialStore(),
    ...makeGuards(),
  };
  let listeningPort = cfg.port;

  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  const jsonBody = (req: FastifyRequest): unknown => {
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.length === 0) return null;
    try {
      return JSON.parse(b.toString("utf8"));
    } catch {
      return undefined;
    }
  };
  const bad = (reply: FastifyReply, status: number, code: string, message: string) =>
    reply.code(status).send({ error: { code, message } });

  /* ---------- auth for /maindy/* (except health) ---------- */
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0]!;
    if (!path.startsWith("/maindy/") || path === "/maindy/health") return;
    const given = req.headers["x-maindy-key"];
    if (!keyMatches(Array.isArray(given) ? given[0] : given, key)) {
      return bad(reply, 401, "unauthorized", "x-maindy-key ausente ou inválida.");
    }
  });

  app.setErrorHandler((err, req, reply) => {
    log.error("erro interno", { route: req.url.split("?")[0], code: (err as Error).name });
    if (!reply.sent) void reply.code(500).send(errorBody(null, "maindy_internal_error", "maindy. gateway: erro interno."));
  });

  /* ---------- provider routes ---------- */
  app.post("/v1/chat/completions", (req, reply) => handleProvider(ctx, "openai_chat", req, reply));
  app.post("/v1/responses", (req, reply) => handleProvider(ctx, "openai_responses", req, reply));
  app.post("/v1/messages", (req, reply) => handleProvider(ctx, "anthropic_messages", req, reply));

  const passthrough = async (req: FastifyRequest, reply: FastifyReply, anthropic: boolean) => {
    const hdr = req.headers["x-maindy-upstream"];
    let u;
    try {
      u = selectUpstream(cfg, anthropic ? "anthropic_messages" : null, null, Array.isArray(hdr) ? hdr[0] : hdr);
    } catch (err) {
      return bad(reply, 400, "unknown_upstream", (err as Error).message);
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    try {
      const up = await undiciRequest(joinUrl(u.baseUrl, req.url), {
        method: req.method as "GET" | "POST",
        headers: upstreamHeaders(u, req.headers, body.length, ctx.credentials),
        body: req.method === "GET" ? undefined : body,
        dispatcher: ctx.dispatcher,
      });
      const buf = Buffer.from(await up.body.arrayBuffer());
      const out: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(up.headers)) if (v !== undefined && !RESPONSE_SKIP.has(k)) out[k] = v;
      return reply.code(up.statusCode).headers(out).send(buf);
    } catch {
      return bad(reply, 502, "upstream_unreachable", `Não foi possível conectar ao upstream "${u.id}".`);
    }
  };
  app.get("/v1/models", (req, reply) => passthrough(req, reply, req.headers["anthropic-version"] !== undefined));
  app.post("/v1/messages/count_tokens", (req, reply) => passthrough(req, reply, true));

  /* ---------- OTLP/HTTP JSON receiver ---------- */
  const noteOtlpSources = (body: unknown) => {
    try {
      const at = new Date().toISOString();
      for (const src of otlpSources(body)) db.setKv(LAST_EVENT_KV[src], at);
    } catch {
      /* observability of the integration must never break ingestion */
    }
  };
  const otlpGuard = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const ct = String(req.headers["content-type"] ?? "");
    if (ct.includes("protobuf")) {
      void reply.code(415).send({ code: 3, message: "maindy aceita somente OTLP http/json (OTEL_EXPORTER_OTLP_PROTOCOL=http/json)." });
      return false;
    }
    return true;
  };
  app.post("/v1/logs", async (req, reply) => {
    if (!otlpGuard(req, reply)) return;
    const body = jsonBody(req);
    if (body === undefined) return reply.code(400).send({ code: 3, message: "JSON inválido" });
    noteOtlpSources(body);
    const { candidates, records } = eventsFromOtlpLogs(body, policy.current().mode);
    let accepted = 0;
    let duplicates = 0;
    for (const c of candidates) {
      if (c.requestId && db.seenBy(c.requestId) === "proxy") {
        duplicates++; // already metered by the proxy (ANTHROPIC_BASE_URL mode) — never count twice
        continue;
      }
      if (!db.markSeen(c.dedupeKey, "otlp")) {
        duplicates++;
        continue;
      }
      recordEvent(ctx, c.event);
      accepted++;
    }
    if (records) log.info("otlp logs", { route: "/v1/logs", count: accepted, detail: `records=${records} dup=${duplicates}` });
    return reply.code(200).send({ partialSuccess: {} });
  });
  app.post("/v1/metrics", async (req, reply) => {
    if (!otlpGuard(req, reply)) return;
    const body = jsonBody(req);
    if (body === undefined) return reply.code(400).send({ code: 3, message: "JSON inválido" });
    noteOtlpSources(body);
    const m = countMetricPoints(body);
    db.incr({ otlp_metrics: m.metrics });
    return reply.code(200).send({ partialSuccess: {} });
  });

  /* ---------- /maindy/* ---------- */
  const counters = () => {
    const c = db.counters();
    return {
      requests: c.requests ?? 0,
      cacheHits: c.cache_hits ?? 0,
      errors: c.errors ?? 0,
      tokensIn: c.tokens_in ?? 0,
      tokensOut: c.tokens_out ?? 0,
      tokensAvoided: (c.tokens_avoided ?? 0) + (c.hook_tokens_avoided ?? 0),
      pendingTelemetry: db.pendingCount(),
    };
  };

  app.get("/maindy/health", async () => ({ ok: true, version: GATEWAY_VERSION }));

  app.get("/maindy/status", async () => {
    const p = policy.current();
    const status: GatewayStatus = {
      version: GATEWAY_VERSION,
      uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
      mode: p.mode,
      paused: p.paused,
      upstreams: cfg.upstreams.map((u) => ({ id: u.id, kind: connectorForUpstream(u), baseUrl: u.baseUrl, hasCredential: hasCredential(u, ctx.credentials) })),
      counters: counters(),
      linkedToCloud: link() !== null,
    };
    return GatewayStatus.parse(status);
  });

  app.post("/maindy/pause", async () => {
    policy.pause(true);
    log.info("ORBIT pausado (passthrough)", { mode: policy.current().mode });
    return { paused: true };
  });
  app.post("/maindy/resume", async () => {
    policy.pause(false);
    log.info("ORBIT retomado", { mode: policy.current().mode });
    return { paused: false };
  });

  app.get("/maindy/policy", async () => ({
    policy: policy.current(),
    source: link() ? "cloud" : "local",
    localRollbacks: [...policy.localRollbacks()],
  }));
  app.put("/maindy/policy", async (req, reply) => {
    const parsed = OrbitPolicyDto.safeParse(jsonBody(req));
    if (!parsed.success) return bad(reply, 400, "invalid_policy", "Política inválida.");
    const saved = policy.setLocal(parsed.data);
    return { policy: saved, note: link() ? "Vinculado à nuvem: a política da nuvem prevalece no próximo refresh." : null };
  });
  app.post("/maindy/rollbacks/reset", async (req, reply) => {
    const b = jsonBody(req) as { technique?: string } | null;
    if (!b?.technique) return bad(reply, 400, "invalid", "technique obrigatório.");
    policy.clearRollback(b.technique as never);
    ctx.regression.reset(b.technique as never);
    return { ok: true };
  });

  app.get("/maindy/events", async (req) => {
    const q = req.query as { limit?: string; since?: string };
    const limit = Math.min(1000, Math.max(1, Number(q.limit ?? 100) || 100));
    return { linkedToCloud: link() !== null, events: db.listEvents(limit, q.since) };
  });

  app.get("/maindy/summary", async (req) => {
    const q = req.query as { from?: string; to?: string };
    const to = q.to ?? new Date().toISOString();
    const from = q.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const c = db.counters();
    return summarizeSavings(db.eventsBetween(from, to), {
      from,
      to,
      quality: { evaluations: c.quality_evaluations ?? 0, passed: c.quality_passed ?? 0, rollbacks: c.rollbacks ?? 0 },
      qualityApproved: (c.rollbacks ?? 0) === 0,
    });
  });

  app.get("/maindy/quotas", async () => ({ quotas: db.quotas() }));
  app.get("/maindy/capabilities", async () => CONNECTOR_CAPABILITIES);

  app.post("/maindy/flush", async () => flusher.flushAll());

  app.post("/maindy/statusline", async (req, reply) => {
    const body = jsonBody(req);
    if (body === undefined || body === null) return bad(reply, 400, "invalid_json", "JSON inválido.");
    const quotas: QuotaSnapshot[] = quotasFromStatusline(body);
    for (const q of quotas) {
      const { changed } = db.upsertQuota(q);
      if (changed) db.enqueue("quota", `${q.product}:${q.window}:${q.capturedAt}`, q.capturedAt, q);
    }
    const c = db.counters();
    return {
      ok: true,
      counters: {
        requests: c.requests ?? 0,
        cacheHits: c.cache_hits ?? 0,
        tokensAvoided: (c.tokens_avoided ?? 0) + (c.hook_tokens_avoided ?? 0),
        savedMicros: c.saved_micros ?? 0,
        savedSource: (c.baseline_events ?? 0) > 0 ? "experimentally_estimated" : "unavailable",
      },
      quotas,
    };
  });

  app.post("/maindy/compress", async (req, reply) => {
    const t0 = performance.now();
    const b = jsonBody(req) as { text?: unknown; toolName?: unknown; model?: unknown } | null | undefined;
    if (!b || typeof b.text !== "string") return bad(reply, 400, "invalid", "text obrigatório.");
    const text = b.text;
    const p = policy.current();
    const activeHere =
      !p.paused &&
      p.mode !== "observe" &&
      !policy.localRollbacks().has("tool_output_compression") &&
      (() => {
        const st = p.techniques.find((t) => t.name === "tool_output_compression");
        if (st) return st.enabled && !st.rolledBack;
        return p.mode === "balanced" || p.mode === "maximum";
      })();
    if (!activeHere) {
      return { applied: false, text, originalTokens: 0, compressedTokens: 0, tokensSaved: 0, source: "unavailable", reason: "policy", elapsedMs: Math.round(performance.now() - t0) };
    }
    const r = compressToolOutput(text, { model: typeof b.model === "string" ? b.model : "claude-sonnet-5-5" });
    const meaningful = r.applied && r.tokensSaved >= cfg.hookCompression.minTokensSaved && r.tokensSaved / Math.max(1, r.originalTokens) >= cfg.hookCompression.minRatio;
    if (meaningful) db.incr({ hook_tokens_avoided: r.tokensSaved, hook_compressions: 1 });
    // the text is never stored or logged — only sizes
    log.info("compress", { route: "/maindy/compress", count: meaningful ? r.tokensSaved : 0, ms: Math.round(performance.now() - t0) });
    return {
      applied: meaningful,
      text: meaningful ? r.text : text,
      originalTokens: r.originalTokens,
      compressedTokens: meaningful ? r.compressedTokens : r.originalTokens,
      tokensSaved: meaningful ? r.tokensSaved : 0,
      source: r.source,
      reason: meaningful ? undefined : r.reason ?? "below meaningful threshold",
      elapsedMs: Math.round(performance.now() - t0),
    };
  });

  registerAdminRoutes(app, ctx, { userHome: opts.userHome, searchPath: opts.searchPath, cliCommand: opts.cliCommand, port: () => listeningPort }, jsonBody);

  app.setNotFoundHandler((req, reply) => bad(reply, 404, "not_found", `Rota não suportada pelo gateway maindy: ${req.method} ${req.url.split("?")[0]}`));

  /* ---------- lifecycle ---------- */
  const timers: NodeJS.Timeout[] = [];
  const startTimers = () => {
    flusher.start(cfg.telemetry.flushIntervalMs);
    const t1 = setInterval(() => {
      deviceCache = readDevice(paths);
      void policy.refreshFromCloud();
    }, 30_000);
    const t2 = setInterval(() => {
      db.purgeExpired(Date.now());
      db.prune(Date.now());
    }, 10 * 60_000);
    t1.unref();
    t2.unref();
    timers.push(t1, t2);
    void policy.refreshFromCloud();
  };

  return {
    app,
    ctx,
    async listen() {
      warmEngine();
      await app.listen({ host: HOST, port: cfg.port });
      const addr = app.server.address();
      const port = typeof addr === "object" && addr ? addr.port : cfg.port;
      listeningPort = port;
      writePrivate(paths.runtime, `${JSON.stringify({ pid: process.pid, port, url: `http://${HOST}:${port}`, startedAt: new Date(ctx.startedAt).toISOString(), version: GATEWAY_VERSION, methodVersion: SAVINGS_METHOD_VERSION }, null, 2)}\n`);
      if (opts.timers !== false) startTimers();
      log.info("gateway maindy. ouvindo", { port, version: GATEWAY_VERSION, mode: policy.current().mode, home: paths.dir });
      return { port, url: `http://${HOST}:${port}` };
    },
    async close() {
      for (const t of timers) clearInterval(t);
      flusher.stop();
      await app.close();
      await ctx.dispatcher.close();
      db.close();
    },
  };
}
