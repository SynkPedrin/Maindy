import { Money, QualityEvaluationEvent, QuotaSnapshot, RequestUsageEvent, SAVINGS_METHOD_VERSION, SavingsSummary, type MeasurementSource } from "@maindy/contracts";
import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { qualityEvaluations, requestUsage } from "../db/schema.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { PeriodQuery, resolvePeriod } from "../lib/period.js";
import { anyAuth } from "../plugins/auth.js";
import { computeSummary, netSavingsMicros, weakestSource } from "../savings/math.js";
import { loadAggregate, loadBuckets, loadQuality } from "../savings/repo.js";

export const TimeseriesPoint = z.object({
  t: z.string().datetime(),
  requests: z.number().int(),
  requestsWithBaseline: z.number().int(),
  optimizedAiCost: Money,
  overheadCost: Money,
  baselineCost: Money,
  netSavings: Money,
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  tokensAvoided: z.number().int(),
  cacheHits: z.number().int(),
});
export const TimeseriesResponse = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  bucket: z.enum(["hour", "day"]),
  currency: z.string(),
  methodVersion: z.string(),
  points: z.array(TimeseriesPoint),
});

export function rowToEvent(r: typeof requestUsage.$inferSelect): RequestUsageEvent {
  return {
    eventId: r.eventId,
    occurredAt: r.occurredAt.toISOString(),
    connector: r.connector as RequestUsageEvent["connector"],
    provider: r.provider,
    model: r.model,
    endpoint: r.endpoint,
    projectKey: r.projectKey,
    agentKey: r.agentKey,
    sessionKey: r.sessionKey,
    streaming: r.streaming,
    status: r.status as RequestUsageEvent["status"],
    httpStatus: r.httpStatus,
    latencyMs: r.latencyMs,
    orbitMode: r.orbitMode as RequestUsageEvent["orbitMode"],
    usage: {
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cachedInputTokens: r.cachedInputTokens,
      cacheWriteTokens: r.cacheWriteTokens,
      source: r.usageSource as MeasurementSource,
    },
    cost: { micros: r.costMicros, currency: r.costCurrency, source: r.costSource as MeasurementSource },
    pricingVersion: r.pricingVersion,
    baselineCost:
      r.baselineCostMicros !== null
        ? { micros: r.baselineCostMicros, currency: r.baselineCurrency ?? r.costCurrency, source: (r.baselineSource ?? "unavailable") as MeasurementSource }
        : null,
    baselineMethod: r.baselineMethod as RequestUsageEvent["baselineMethod"],
    overheadCost: { micros: r.overheadMicros, currency: r.overheadCurrency, source: r.overheadSource as MeasurementSource },
    techniques: r.techniques as RequestUsageEvent["techniques"],
    cache: { status: r.cacheStatus as RequestUsageEvent["cache"]["status"] },
    promptHash: r.promptHash,
    fallbackOriginal: r.fallbackOriginal,
    errorCode: r.errorCode,
  };
}

export const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;

  app.get(
    "/stats/summary",
    { config: { auth: "any" }, schema: { tags: ["stats"], querystring: PeriodQuery, response: { 200: SavingsSummary } } },
    async (req) => {
      const a = anyAuth(req);
      const { from, to } = resolvePeriod(req.query);
      const p = { orgId: a.orgId, from, to, currency: req.query.currency };
      const [agg, quality] = await Promise.all([loadAggregate(db, p), loadQuality(db, p)]);
      return computeSummary(agg, quality, { from, to, currency: req.query.currency });
    },
  );

  app.get(
    "/stats/timeseries",
    {
      config: { auth: "any" },
      schema: {
        tags: ["stats"],
        querystring: PeriodQuery.extend({ bucket: z.enum(["hour", "day"]).default("day") }),
        response: { 200: TimeseriesResponse },
      },
    },
    async (req) => {
      const a = anyAuth(req);
      const bucket = req.query.bucket;
      const { from, to } = resolvePeriod(req.query, bucket === "hour" ? 31 : 366);
      const cur = req.query.currency;
      const buckets = await loadBuckets(db, { orgId: a.orgId, from, to, currency: cur }, bucket);
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        bucket,
        currency: cur,
        methodVersion: SAVINGS_METHOD_VERSION,
        points: buckets.map(({ t, agg }) => {
          const savingsSource: MeasurementSource = agg.requestsWithBaseline > 0 ? "experimentally_estimated" : "unavailable";
          return {
            t: t.toISOString(),
            requests: agg.requests,
            requestsWithBaseline: agg.requestsWithBaseline,
            optimizedAiCost: { micros: agg.costMicros, currency: cur, source: weakestSource(agg.costSources) },
            overheadCost: { micros: agg.overheadMicros, currency: cur, source: weakestSource(agg.overheadSources) },
            baselineCost: { micros: agg.baselineMicros, currency: cur, source: savingsSource },
            netSavings: { micros: netSavingsMicros(agg), currency: cur, source: savingsSource },
            tokensIn: agg.inputTokens,
            tokensOut: agg.outputTokens,
            tokensAvoided: agg.tokensAvoided,
            cacheHits: agg.cacheHits,
          };
        }),
      };
    },
  );

  app.get(
    "/runs",
    {
      config: { auth: "any" },
      schema: {
        tags: ["stats"],
        querystring: z.object({ cursor: z.string().max(300).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }),
        response: { 200: z.object({ items: z.array(RequestUsageEvent), nextCursor: z.string().nullable() }) },
      },
    },
    async (req) => {
      const a = anyAuth(req); // desktop (device token) reads recent operations of its own org
      const c = decodeCursor(req.query.cursor);
      const rows = await db
        .select()
        .from(requestUsage)
        .where(
          and(
            eq(requestUsage.organizationId, a.orgId),
            c ? or(lt(requestUsage.occurredAt, c.t), and(eq(requestUsage.occurredAt, c.t), lt(requestUsage.id, c.id))) : undefined,
          ),
        )
        .orderBy(desc(requestUsage.occurredAt), desc(requestUsage.id))
        .limit(req.query.limit + 1);
      const page = rows.slice(0, req.query.limit);
      const last = page[page.length - 1];
      return {
        items: page.map(rowToEvent),
        nextCursor: rows.length > req.query.limit && last ? encodeCursor(last.occurredAt, last.id) : null,
      };
    },
  );

  app.get(
    "/quality/evaluations",
    {
      config: { auth: "any" },
      schema: {
        tags: ["stats"],
        querystring: PeriodQuery.omit({ currency: true }).extend({ limit: z.coerce.number().int().min(1).max(500).default(100) }),
        response: { 200: z.array(QualityEvaluationEvent) },
      },
    },
    async (req) => {
      const a = anyAuth(req);
      const { from, to } = resolvePeriod(req.query);
      const rows = await db
        .select()
        .from(qualityEvaluations)
        .where(and(eq(qualityEvaluations.organizationId, a.orgId), gte(qualityEvaluations.occurredAt, from), lt(qualityEvaluations.occurredAt, to)))
        .orderBy(desc(qualityEvaluations.occurredAt))
        .limit(req.query.limit);
      return rows.map((q) => ({
        evaluationId: q.evaluationId,
        occurredAt: q.occurredAt.toISOString(),
        technique: q.technique as QualityEvaluationEvent["technique"],
        method: q.method as QualityEvaluationEvent["method"],
        passed: q.passed,
        score: q.score,
        projectKey: q.projectKey,
        detail: q.detail,
        triggeredRollback: q.triggeredRollback,
      }));
    },
  );

  app.get("/limits", { config: { auth: "any" }, schema: { tags: ["stats"], response: { 200: z.array(QuotaSnapshot) } } }, async (req) => {
    const a = anyAuth(req);
    const rows = (await db.execute(sql`
      select distinct on (provider, product, "window") provider, product, "window", used_percentage, resets_at, collected_via, captured_at
      from provider_quota_snapshots
      where organization_id = ${a.orgId}
      order by provider, product, "window", captured_at desc`)) as unknown as Array<{
      provider: string;
      product: string;
      window: string;
      used_percentage: number;
      resets_at: Date | string | null;
      collected_via: string;
      captured_at: Date | string;
    }>;
    const iso = (d: Date | string) => new Date(d).toISOString();
    return rows.map((r) => ({
      provider: r.provider,
      product: r.product,
      window: r.window,
      usedPercentage: Number(r.used_percentage),
      resetsAt: r.resets_at ? iso(r.resets_at) : null,
      collectedVia: r.collected_via,
      capturedAt: iso(r.captured_at),
    }));
  });
};
