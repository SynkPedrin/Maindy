/**
 * Response schemas for endpoints whose DTO is not (yet) in @maindy/contracts.
 * They are intentionally tolerant (loose objects, optional fields) and normalise
 * list responses that may come as `T[]` or `{ items | data | ...: T[] }`.
 * Anything with a contract in @maindy/contracts is parsed with the contract itself.
 */
import { z } from "zod";
import { MeasurementSource, Money, PlanCode, TechniqueName } from "@maindy/contracts";

const iso = z.string();

/** Accept `T[]` or `{ <key>: T[], nextCursor? }`. */
export function listOf<T extends z.ZodType>(item: T, keys: string[] = ["items", "data", "results"]) {
  return z.union([
    z.array(item).transform((items) => ({ items, nextCursor: null as string | null })),
    z.looseObject({}).transform((obj, ctx) => {
      for (const k of keys) {
        const v = (obj as Record<string, unknown>)[k];
        if (Array.isArray(v)) {
          const parsed = z.array(item).safeParse(v);
          if (!parsed.success) {
            for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: [k, ...issue.path] } as never);
            return z.NEVER;
          }
          const nc = (obj as Record<string, unknown>).nextCursor ?? (obj as Record<string, unknown>).cursor ?? null;
          return { items: parsed.data, nextCursor: typeof nc === "string" ? nc : null };
        }
      }
      ctx.addIssue({ code: "custom", message: `lista esperada em ${keys.join("|")}` });
      return z.NEVER;
    }),
  ]);
}

const MoneyLoose = Money.extend({ currency: z.string().default("USD") });

export const RunDto = z.looseObject({
  id: z.string().optional(),
  eventId: z.string().optional(),
  occurredAt: iso,
  connector: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  endpoint: z.string().optional(),
  projectKey: z.string().nullable().optional(),
  agentKey: z.string().nullable().optional(),
  status: z.string(),
  latencyMs: z.number().optional(),
  orbitMode: z.string().optional(),
  usage: z
    .looseObject({
      inputTokens: z.number(),
      outputTokens: z.number(),
      cachedInputTokens: z.number().optional(),
      source: MeasurementSource,
    })
    .optional(),
  cost: MoneyLoose.optional(),
  baselineCost: MoneyLoose.nullable().optional(),
  baselineMethod: z.string().optional(),
  overheadCost: MoneyLoose.optional(),
  techniques: z
    .array(z.looseObject({ name: z.string(), applied: z.boolean().optional(), tokensSaved: z.number().optional(), source: MeasurementSource.optional() }))
    .optional(),
  fallbackOriginal: z.boolean().optional(),
});
export type RunDto = z.infer<typeof RunDto>;
export const RunsResponse = listOf(RunDto, ["items", "runs", "events", "data"]);

/** One time bucket. Money fields are micros. */
export const TimeseriesPoint = z
  .looseObject({
    t: iso.optional(),
    ts: iso.optional(),
    bucket: iso.optional(),
    bucketStart: iso.optional(),
    start: iso.optional(),
    requests: z.number().optional(),
    baselineCost: z.union([z.number(), MoneyLoose]).nullable().optional(),
    optimizedAiCost: z.union([z.number(), MoneyLoose]).nullable().optional(),
    optimizedCost: z.union([z.number(), MoneyLoose]).nullable().optional(),
    cost: z.union([z.number(), MoneyLoose]).nullable().optional(),
    overheadCost: z.union([z.number(), MoneyLoose]).nullable().optional(),
    netSavings: z.union([z.number(), MoneyLoose]).nullable().optional(),
    tokensAvoided: z.number().optional(),
    source: MeasurementSource.optional(),
  })
  .transform((p) => {
    const m = (v: unknown): number | null => (v == null ? null : typeof v === "number" ? v : (v as { micros: number }).micros);
    const src = (v: unknown): MeasurementSource | undefined =>
      v && typeof v === "object" && "source" in v ? ((v as { source: MeasurementSource }).source) : undefined;
    return {
      at: p.t ?? p.ts ?? p.bucketStart ?? p.bucket ?? p.start ?? "",
      requests: p.requests ?? 0,
      baselineMicros: m(p.baselineCost),
      optimizedMicros: m(p.optimizedAiCost ?? p.optimizedCost ?? p.cost),
      overheadMicros: m(p.overheadCost),
      netSavingsMicros: m(p.netSavings),
      tokensAvoided: p.tokensAvoided ?? 0,
      baselineSource: src(p.baselineCost) ?? p.source ?? "experimentally_estimated",
      optimizedSource: src(p.optimizedAiCost ?? p.optimizedCost ?? p.cost) ?? p.source ?? "provider_reported",
    };
  });
export type TimeseriesPoint = z.infer<typeof TimeseriesPoint>;
export const TimeseriesResponse = listOf(TimeseriesPoint, ["points", "series", "items", "buckets", "data"]);

export const ProjectDto = z.looseObject({
  id: z.string(),
  name: z.string(),
  key: z.string().optional(),
  slug: z.string().optional(),
  description: z.string().nullable().optional(),
  createdAt: iso.optional(),
});
export type ProjectDto = z.infer<typeof ProjectDto>;
export const ProjectsResponse = listOf(ProjectDto, ["items", "projects", "data"]);

export const AgentDto = z.looseObject({
  id: z.string(),
  name: z.string(),
  key: z.string().optional(),
  slug: z.string().optional(),
  projectId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  createdAt: iso.optional(),
});
export type AgentDto = z.infer<typeof AgentDto>;
export const AgentsResponse = listOf(AgentDto, ["items", "agents", "data"]);

export const QualityEvaluationRow = z.looseObject({
  evaluationId: z.string().optional(),
  id: z.string().optional(),
  occurredAt: iso,
  technique: z.union([TechniqueName, z.string()]),
  method: z.string(),
  passed: z.boolean(),
  score: z.number().nullable().optional(),
  projectKey: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
  triggeredRollback: z.boolean().optional(),
});
export type QualityEvaluationRow = z.infer<typeof QualityEvaluationRow>;
export const QualityEvaluationsResponse = listOf(QualityEvaluationRow, ["items", "evaluations", "data"]);

export const InvoiceDto = z.looseObject({
  id: z.string(),
  number: z.string().nullable().optional(),
  status: z.string(),
  amountCents: z.number().optional(),
  amountDueCents: z.number().optional(),
  totalCents: z.number().optional(),
  currency: z.string().optional(),
  createdAt: iso.optional(),
  issuedAt: iso.nullable().optional(),
  periodStart: iso.nullable().optional(),
  periodEnd: iso.nullable().optional(),
  hostedUrl: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  pdfUrl: z.string().nullable().optional(),
  provider: z.string().optional(),
  planCode: z.union([PlanCode, z.string()]).optional(),
  description: z.string().nullable().optional(),
  /** sandbox invoices — simulated, no money moved */
  simulated: z.boolean().optional(),
});
export type InvoiceDto = z.infer<typeof InvoiceDto>;
export const InvoicesResponse = listOf(InvoiceDto, ["items", "invoices", "data"]);

export const AuditEventDto = z.looseObject({
  id: z.string(),
  action: z.string(),
  createdAt: iso.optional(),
  occurredAt: iso.optional(),
  actorUserId: z.string().nullable().optional(),
  target: z.unknown().optional(),
  metadata: z.unknown().optional(),
});
export const AuditResponse = listOf(AuditEventDto, ["items", "events", "data"]);

export const CheckoutResponse = z.looseObject({ url: z.string(), provider: z.string().optional() });
export const OkResponse = z.unknown();

export const PairDetails = z.looseObject({
  userCode: z.string().optional(),
  deviceName: z.string().optional(),
  name: z.string().optional(),
  platform: z.string().optional(),
  arch: z.string().optional(),
  appVersion: z.string().optional(),
  status: z.string().optional(),
  expiresAt: iso.nullable().optional(),
  createdAt: iso.optional(),
});
export type PairDetails = z.infer<typeof PairDetails>;
