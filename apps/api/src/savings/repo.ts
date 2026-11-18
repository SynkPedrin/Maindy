import { sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { EMPTY_AGGREGATE, type QualityAggregate, type SavingsAggregate } from "./math.js";

/** SQL twin of math.hasValidBaseline */
export const VALID_BASELINE = sql`(ru.baseline_cost_micros is not null and ru.baseline_method <> 'none' and ru.baseline_currency = ru.cost_currency)`;

export interface Period {
  orgId: string;
  from: Date;
  to: Date;
  currency: string;
}

const where = (p: Period): SQL =>
  sql`ru.organization_id = ${p.orgId} and ru.occurred_at >= ${p.from.toISOString()} and ru.occurred_at < ${p.to.toISOString()} and ru.cost_currency = ${p.currency}`;

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

const AGG_COLUMNS = sql`
  count(*)::int as requests,
  (count(*) filter (where ${VALID_BASELINE}))::int as requests_with_baseline,
  coalesce(sum(ru.cost_micros), 0)::text as cost,
  coalesce(sum(ru.cost_micros) filter (where ${VALID_BASELINE}), 0)::text as cost_wb,
  coalesce(sum(ru.overhead_micros), 0)::text as overhead,
  coalesce(sum(ru.baseline_cost_micros) filter (where ${VALID_BASELINE}), 0)::text as baseline,
  coalesce(sum(ru.input_tokens), 0)::text as input_tokens,
  coalesce(sum(ru.output_tokens), 0)::text as output_tokens,
  coalesce(sum(ru.cached_input_tokens), 0)::text as cached_input_tokens,
  coalesce(sum(ru.tokens_avoided), 0)::text as tokens_avoided,
  (count(*) filter (where ru.cache_status = 'hit'))::int as cache_hits,
  (count(*) filter (where ru.cache_status in ('miss', 'store')))::int as cache_misses,
  coalesce(array_agg(distinct ru.cost_source) filter (where ru.cost_source is not null), '{}') as cost_sources,
  coalesce(array_agg(distinct ru.overhead_source) filter (where ru.overhead_source is not null), '{}') as overhead_sources`;

type AggRow = Record<string, unknown>;

function rowToAggregate(r: AggRow | undefined, avoidedSources: string[]): SavingsAggregate {
  if (!r) return { ...EMPTY_AGGREGATE };
  return {
    requests: n(r.requests),
    requestsWithBaseline: n(r.requests_with_baseline),
    costMicros: n(r.cost),
    costWithBaselineMicros: n(r.cost_wb),
    overheadMicros: n(r.overhead),
    baselineMicros: n(r.baseline),
    inputTokens: n(r.input_tokens),
    outputTokens: n(r.output_tokens),
    cachedInputTokens: n(r.cached_input_tokens),
    tokensAvoided: n(r.tokens_avoided),
    cacheHits: n(r.cache_hits),
    cacheMisses: n(r.cache_misses),
    costSources: (r.cost_sources as string[]) ?? [],
    overheadSources: (r.overhead_sources as string[]) ?? [],
    avoidedSources,
  };
}

export async function loadAggregate(db: DbOrTx, p: Period): Promise<SavingsAggregate> {
  const rows = (await db.execute(sql`select ${AGG_COLUMNS} from request_usage ru where ${where(p)}`)) as unknown as AggRow[];
  const avoided = (await db.execute(sql`
    select distinct t->>'source' as source
    from request_usage ru, jsonb_array_elements(ru.techniques) t
    where ${where(p)} and (t->>'applied')::boolean and (t->>'tokensSaved')::int > 0`)) as unknown as { source: string }[];
  return rowToAggregate(rows[0], avoided.map((x) => x.source));
}

export async function loadQuality(db: DbOrTx, p: Omit<Period, "currency">): Promise<QualityAggregate> {
  const rows = (await db.execute(sql`
    select count(*)::int as evaluations,
           (count(*) filter (where passed))::int as passed,
           (count(*) filter (where triggered_rollback))::int as rollbacks
    from quality_evaluations
    where organization_id = ${p.orgId} and occurred_at >= ${p.from.toISOString()} and occurred_at < ${p.to.toISOString()}`)) as unknown as AggRow[];
  const r = rows[0];
  return { evaluations: n(r?.evaluations), passed: n(r?.passed), rollbacks: n(r?.rollbacks) };
}

export async function loadBuckets(db: DbOrTx, p: Period, bucket: "hour" | "day"): Promise<{ t: Date; agg: SavingsAggregate }[]> {
  const unit = bucket === "hour" ? sql.raw("'hour'") : sql.raw("'day'");
  const rows = (await db.execute(sql`
    select to_char(date_trunc(${unit}, ru.occurred_at at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:00:00"Z"') as bucket, ${AGG_COLUMNS}
    from request_usage ru where ${where(p)}
    group by 1 order by 1`)) as unknown as AggRow[];
  return rows.map((r) => ({ t: new Date(String(r.bucket)), agg: rowToAggregate(r, []) }));
}
