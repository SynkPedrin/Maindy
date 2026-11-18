import { MODE_DEFAULT_TECHNIQUES, TechniqueName, type OrbitMode, type OrbitPolicyDto } from "@maindy/contracts";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { optimizationPolicies, type TechniqueStateRow } from "../db/schema.js";

export const DEFAULT_POLICY = {
  mode: "observe" as OrbitMode,
  qualitySampleRate: 0.05,
  maxAddedLatencyMs: 150,
  cacheTtlSeconds: 3600,
};

/**
 * Techniques for a mode. Rolled-back techniques (Quality Guard) stay disabled + flagged across mode changes
 * until a user explicitly re-enables them.
 */
export function techniquesForMode(mode: OrbitMode, previous: TechniqueStateRow[] = []): TechniqueStateRow[] {
  const defaults = new Set<string>(MODE_DEFAULT_TECHNIQUES[mode]);
  const prev = new Map(previous.map((t) => [t.name, t]));
  return TechniqueName.options.map((name) => {
    const p = prev.get(name);
    if (p?.rolledBack) return { name, enabled: false, rolledBack: true, rolledBackReason: p.rolledBackReason };
    return { name, enabled: defaults.has(name), rolledBack: false, rolledBackReason: null };
  });
}

export function toPolicyDto(row: typeof optimizationPolicies.$inferSelect): OrbitPolicyDto {
  const byName = new Map(row.techniques.map((t) => [t.name, t]));
  return {
    mode: row.mode,
    paused: row.paused,
    techniques: TechniqueName.options.map((name) => {
      const t = byName.get(name);
      return {
        name,
        enabled: t?.enabled ?? false,
        rolledBack: t?.rolledBack ?? false,
        rolledBackReason: t?.rolledBackReason ?? null,
      };
    }),
    qualitySampleRate: row.qualitySampleRate,
    maxAddedLatencyMs: row.maxAddedLatencyMs,
    cacheTtlSeconds: row.cacheTtlSeconds,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

export async function createDefaultPolicy(db: DbOrTx, orgId: string): Promise<void> {
  await db
    .insert(optimizationPolicies)
    .values({
      organizationId: orgId,
      mode: DEFAULT_POLICY.mode,
      paused: false,
      techniques: techniquesForMode(DEFAULT_POLICY.mode),
      qualitySampleRate: DEFAULT_POLICY.qualitySampleRate,
      maxAddedLatencyMs: DEFAULT_POLICY.maxAddedLatencyMs,
      cacheTtlSeconds: DEFAULT_POLICY.cacheTtlSeconds,
      version: 1,
    })
    .onConflictDoNothing();
}

/** Loads the org policy row FOR UPDATE (creating the default if missing). */
export async function lockPolicy(tx: DbOrTx, orgId: string) {
  await createDefaultPolicy(tx, orgId);
  const [row] = await tx.select().from(optimizationPolicies).where(eq(optimizationPolicies.organizationId, orgId)).for("update");
  if (!row) throw new Error("policy row missing after upsert");
  return row;
}
