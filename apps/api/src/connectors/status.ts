import { ConnectorKind, type ConnectorStatus, type OrbitMode } from "@maindy/contracts";
import { and, eq, gte, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { connectors, optimizationPolicies, requestUsage } from "../db/schema.js";

/**
 * Connector status from REAL evidence (request_usage events), merged with explicit user rows.
 *
 * Rules (documented in docs/ARCHITECTURE.md §4):
 *  - window: events of the last 7 days, per connector kind (ollama traffic counts as `openai_compatible`);
 *  - error rate > 30% over the latest 50 events → `attention`;
 *  - otherwise `optimization_active` only when the org policy is not `observe`, not paused, and some ORBIT
 *    technique was actually applied on that connector's traffic; else `connected_read_only`;
 *  - `lastSyncAt` = latest event time;
 *  - an explicit "connected" row (PUT by the user) shows `connected_read_only` even without traffic;
 *  - an explicit `not_connected` (disconnect) wins unless newer traffic arrived after it.
 */
export const EVIDENCE_WINDOW_DAYS = 7;
export const ERROR_SAMPLE = 50;
export const ATTENTION_ERROR_RATE = 0.3;

export interface ConnectorEvidence {
  events: number;
  lastEventAt: Date;
  /** events in the error sample (latest ≤ 50) */
  sampleSize: number;
  sampleErrors: number;
  /** a technique with applied=true appeared in this connector's events (any time) */
  techniqueApplied: boolean;
}

export interface ExplicitRow {
  status: ConnectorStatus;
  credentialRef: string | null;
  updatedAt: Date;
}

export interface PolicyState {
  mode: OrbitMode;
  paused: boolean;
}

export function deriveStatus(evidence: ConnectorEvidence | null, row: ExplicitRow | null, policy: PolicyState): ConnectorStatus {
  if (row?.status === "not_connected" && (!evidence || row.updatedAt.getTime() >= evidence.lastEventAt.getTime())) {
    return "not_connected";
  }
  if (evidence && evidence.events > 0) {
    if (evidence.sampleSize > 0 && evidence.sampleErrors / evidence.sampleSize > ATTENTION_ERROR_RATE) return "attention";
    const optimizing = policy.mode !== "observe" && !policy.paused && evidence.techniqueApplied;
    return optimizing ? "optimization_active" : "connected_read_only";
  }
  if (!row) return "not_connected";
  // no traffic: an explicit "connected" is shown as read-only (no evidence that ORBIT is optimizing anything)
  if (row.status === "optimization_active" || row.status === "connected_read_only") return "connected_read_only";
  return row.status;
}

/** Event connector → catalog kind. Local Ollama traffic is an OpenAI-compatible endpoint. */
const KIND_SQL = sql<string>`case when ${requestUsage.provider} = 'ollama' and ${requestUsage.connector} in ('openai_api', 'anthropic_api') then 'openai_compatible' else ${requestUsage.connector} end`;

export async function loadEvidence(db: DbOrTx, orgId: string, now = new Date()): Promise<Map<ConnectorKind, ConnectorEvidence>> {
  const since = new Date(now.getTime() - EVIDENCE_WINDOW_DAYS * 86_400_000);
  const ranked = db
    .select({
      kind: KIND_SQL.as("kind"),
      occurredAt: requestUsage.occurredAt,
      status: requestUsage.status,
      rn: sql<number>`row_number() over (partition by ${KIND_SQL} order by ${requestUsage.occurredAt} desc)`.as("rn"),
    })
    .from(requestUsage)
    .where(and(eq(requestUsage.organizationId, orgId), gte(requestUsage.occurredAt, since)))
    .as("ranked");
  const rows = await db
    .select({
      kind: ranked.kind,
      events: sql<number>`count(*)::int`,
      lastEventAt: sql<string>`max(${ranked.occurredAt})`,
      sampleSize: sql<number>`count(*) filter (where ${ranked.rn} <= ${ERROR_SAMPLE})::int`,
      sampleErrors: sql<number>`count(*) filter (where ${ranked.rn} <= ${ERROR_SAMPLE} and ${ranked.status} = 'error')::int`,
    })
    .from(ranked)
    .groupBy(ranked.kind);

  // "was any technique ever applied on this connector" — not limited to the 7-day window
  const applied = await db
    .selectDistinct({ kind: KIND_SQL })
    .from(requestUsage)
    .where(and(eq(requestUsage.organizationId, orgId), sql`${requestUsage.techniques} @> '[{"applied": true}]'::jsonb`));
  const appliedKinds = new Set(applied.map((r) => r.kind));

  const out = new Map<ConnectorKind, ConnectorEvidence>();
  for (const r of rows) {
    const kind = ConnectorKind.safeParse(r.kind);
    if (!kind.success) continue;
    out.set(kind.data, {
      events: Number(r.events),
      lastEventAt: new Date(r.lastEventAt),
      sampleSize: Number(r.sampleSize),
      sampleErrors: Number(r.sampleErrors),
      techniqueApplied: appliedKinds.has(r.kind),
    });
  }
  return out;
}

export async function loadPolicyState(db: DbOrTx, orgId: string): Promise<PolicyState> {
  const [p] = await db
    .select({ mode: optimizationPolicies.mode, paused: optimizationPolicies.paused })
    .from(optimizationPolicies)
    .where(eq(optimizationPolicies.organizationId, orgId));
  return p ?? { mode: "observe", paused: false };
}

/**
 * Explicit rows only. Before evidence-based derivation existed, telemetry ingestion auto-created rows
 * (status connected_read_only, lastSyncAt set, no credentialRef). Explicit PUTs now clear lastSyncAt,
 * so such legacy auto rows are recognised and ignored here.
 */
export async function loadExplicitRows(db: DbOrTx, orgId: string): Promise<Map<ConnectorKind, ExplicitRow & { lastSyncAt: Date | null }>> {
  const rows = await db.select().from(connectors).where(eq(connectors.organizationId, orgId));
  const out = new Map<ConnectorKind, ExplicitRow & { lastSyncAt: Date | null }>();
  for (const r of rows) {
    const legacyAuto = r.status === "connected_read_only" && r.credentialRef === null && r.lastSyncAt !== null;
    if (legacyAuto) continue;
    out.set(r.kind, { status: r.status, credentialRef: r.credentialRef, updatedAt: r.updatedAt, lastSyncAt: r.lastSyncAt });
  }
  return out;
}
