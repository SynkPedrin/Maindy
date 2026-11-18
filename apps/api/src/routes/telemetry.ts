import {
  QualityEvaluationEvent,
  QuotaSnapshot,
  SAVINGS_METHOD_VERSION,
  TelemetryBatch,
  TelemetryIngestResponse,
  type RequestUsageEvent,
} from "@maindy/contracts";
import { sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Tx } from "../db/client.js";
import { providerQuotaSnapshots, qualityEvaluations, requestUsage, savingsLedger } from "../db/schema.js";
import { badRequest } from "../lib/errors.js";
import { hasValidBaseline, tokensAvoidedOf } from "../savings/math.js";
import { deviceAuth } from "../plugins/auth.js";
import { lockPolicy, toPolicyDto } from "../services/policy.js";
import { rollbackTechnique } from "./orbit.js";

const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

function assertNotFuture(dates: string[]) {
  const limit = Date.now() + MAX_FUTURE_MS;
  const bad = dates.findIndex((d) => new Date(d).getTime() > limit);
  if (bad >= 0) throw badRequest("validation_error", "Data do evento no futuro. Verifique o relógio do dispositivo.", { index: bad });
}

export function eventToRow(orgId: string, deviceId: string | null, e: RequestUsageEvent): typeof requestUsage.$inferInsert {
  return {
    organizationId: orgId,
    deviceId,
    eventId: e.eventId,
    occurredAt: new Date(e.occurredAt),
    connector: e.connector,
    provider: e.provider,
    model: e.model,
    endpoint: e.endpoint,
    projectKey: e.projectKey,
    agentKey: e.agentKey,
    sessionKey: e.sessionKey,
    streaming: e.streaming,
    status: e.status,
    httpStatus: e.httpStatus,
    latencyMs: e.latencyMs,
    orbitMode: e.orbitMode,
    inputTokens: e.usage.inputTokens,
    outputTokens: e.usage.outputTokens,
    cachedInputTokens: e.usage.cachedInputTokens,
    cacheWriteTokens: e.usage.cacheWriteTokens,
    usageSource: e.usage.source,
    costMicros: e.cost.micros,
    costCurrency: e.cost.currency,
    costSource: e.cost.source,
    pricingVersion: e.pricingVersion,
    baselineCostMicros: e.baselineCost?.micros ?? null,
    baselineCurrency: e.baselineCost?.currency ?? null,
    baselineSource: e.baselineCost?.source ?? null,
    baselineMethod: e.baselineMethod,
    overheadMicros: e.overheadCost.micros,
    overheadCurrency: e.overheadCost.currency,
    overheadSource: e.overheadCost.source,
    techniques: e.techniques,
    tokensAvoided: tokensAvoidedOf(e),
    cacheStatus: e.cache.status,
    promptHash: e.promptHash,
    fallbackOriginal: e.fallbackOriginal,
    errorCode: e.errorCode,
  };
}

/** Adds newly-inserted events to the daily ledger (same transaction as the insert). */
async function updateLedger(tx: Tx, orgId: string, events: RequestUsageEvent[]) {
  const buckets = new Map<string, typeof savingsLedger.$inferInsert>();
  for (const e of events) {
    const day = new Date(e.occurredAt).toISOString().slice(0, 10); // UTC day
    const key = `${day}|${e.cost.currency}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        organizationId: orgId,
        day,
        currency: e.cost.currency,
        requests: 0,
        requestsWithBaseline: 0,
        costMicros: 0,
        costWithBaselineMicros: 0,
        overheadMicros: 0,
        baselineMicros: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        tokensAvoided: 0,
        cacheHits: 0,
        cacheMisses: 0,
        methodVersion: SAVINGS_METHOD_VERSION,
      };
      buckets.set(key, b);
    }
    b.requests! += 1;
    b.costMicros! += e.cost.micros;
    b.overheadMicros! += e.overheadCost.micros;
    if (hasValidBaseline(e)) {
      b.requestsWithBaseline! += 1;
      b.baselineMicros! += e.baselineCost!.micros;
      b.costWithBaselineMicros! += e.cost.micros;
    }
    b.inputTokens! += e.usage.inputTokens;
    b.outputTokens! += e.usage.outputTokens;
    b.cachedInputTokens! += e.usage.cachedInputTokens;
    b.tokensAvoided! += tokensAvoidedOf(e);
    if (e.cache.status === "hit") b.cacheHits! += 1;
    if (e.cache.status === "miss" || e.cache.status === "store") b.cacheMisses! += 1;
  }
  const inc = (col: string) => sql.raw(`savings_ledger.${col} + excluded.${col}`);
  for (const b of buckets.values()) {
    await tx
      .insert(savingsLedger)
      .values(b)
      .onConflictDoUpdate({
        target: [savingsLedger.organizationId, savingsLedger.day, savingsLedger.currency],
        set: {
          requests: inc("requests"),
          requestsWithBaseline: inc("requests_with_baseline"),
          costMicros: inc("cost_micros"),
          costWithBaselineMicros: inc("cost_with_baseline_micros"),
          overheadMicros: inc("overhead_micros"),
          baselineMicros: inc("baseline_micros"),
          inputTokens: inc("input_tokens"),
          outputTokens: inc("output_tokens"),
          cachedInputTokens: inc("cached_input_tokens"),
          tokensAvoided: inc("tokens_avoided"),
          cacheHits: inc("cache_hits"),
          cacheMisses: inc("cache_misses"),
          updatedAt: sql`now()`,
        },
      });
  }
}

export const telemetryRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;

  app.post(
    "/telemetry/events",
    {
      bodyLimit: 4 * 1024 * 1024,
      config: { auth: "device" },
      schema: { tags: ["telemetry"], body: TelemetryBatch, response: { 200: TelemetryIngestResponse } },
    },
    async (req) => {
      const a = deviceAuth(req);
      const events = req.body.events;
      assertNotFuture(events.map((e) => e.occurredAt));
      const inserted = await db.transaction(async (tx) => {
        const rows = await tx
          .insert(requestUsage)
          .values(events.map((e) => eventToRow(a.orgId, a.deviceId, e)))
          .onConflictDoNothing({ target: requestUsage.eventId })
          .returning({ eventId: requestUsage.eventId });
        const ids = new Set(rows.map((r) => r.eventId));
        // a duplicated eventId inside the same batch is inserted once → count it once
        const seen = new Set<string>();
        const fresh = events.filter((e) => ids.has(e.eventId) && !seen.has(e.eventId) && seen.add(e.eventId));
        if (fresh.length) {
          await updateLedger(tx, a.orgId, fresh);
          // connector status is derived from these events at read time (connectors/status.ts)
        }
        return fresh.length;
      });
      return { accepted: inserted, duplicates: events.length - inserted };
    },
  );

  app.post(
    "/telemetry/quality",
    {
      config: { auth: "device" },
      schema: { tags: ["telemetry"], body: z.array(QualityEvaluationEvent).min(1).max(500), response: { 200: TelemetryIngestResponse } },
    },
    async (req) => {
      const a = deviceAuth(req);
      assertNotFuture(req.body.map((e) => e.occurredAt));
      const accepted = await db.transaction(async (tx) => {
        const rows = await tx
          .insert(qualityEvaluations)
          .values(
            req.body.map((q) => ({
              organizationId: a.orgId,
              deviceId: a.deviceId,
              evaluationId: q.evaluationId,
              occurredAt: new Date(q.occurredAt),
              technique: q.technique,
              method: q.method,
              passed: q.passed,
              score: q.score,
              projectKey: q.projectKey,
              detail: q.detail,
              triggeredRollback: q.triggeredRollback,
            })),
          )
          .onConflictDoNothing({ target: qualityEvaluations.evaluationId })
          .returning({ evaluationId: qualityEvaluations.evaluationId });
        const fresh = new Set(rows.map((r) => r.evaluationId));
        // Quality Guard rollbacks reported by the gateway are mirrored into the org policy
        const rollbacks = req.body.filter((q) => q.triggeredRollback && fresh.has(q.evaluationId));
        if (rollbacks.length) {
          const current = toPolicyDto(await lockPolicy(tx, a.orgId));
          const done = new Set(current.techniques.filter((t) => t.rolledBack).map((t) => t.name));
          for (const q of rollbacks) {
            if (done.has(q.technique)) continue;
            done.add(q.technique);
            await rollbackTechnique(tx, a, req.ip, q.technique, `Quality Guard: avaliação ${q.method} reprovada${q.score !== null ? ` (score ${q.score})` : ""}`);
          }
        }
        return rows.length;
      });
      return { accepted, duplicates: req.body.length - accepted };
    },
  );

  app.post(
    "/telemetry/quota",
    {
      config: { auth: "device" },
      schema: { tags: ["telemetry"], body: z.array(QuotaSnapshot).min(1).max(100), response: { 200: z.object({ accepted: z.number().int() }) } },
    },
    async (req) => {
      const a = deviceAuth(req);
      assertNotFuture(req.body.map((q) => q.capturedAt));
      await db.insert(providerQuotaSnapshots).values(
        req.body.map((q) => ({
          organizationId: a.orgId,
          deviceId: a.deviceId,
          provider: q.provider,
          product: q.product,
          window: q.window,
          usedPercentage: q.usedPercentage,
          resetsAt: q.resetsAt ? new Date(q.resetsAt) : null,
          collectedVia: q.collectedVia,
          capturedAt: new Date(q.capturedAt),
        })),
      );
      return { accepted: req.body.length };
    },
  );
};

