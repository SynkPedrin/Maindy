import { OrbitMode, OrbitPolicyDto, TechniqueName } from "@maindy/contracts";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AuthContext } from "../context.js";
import type { Tx } from "../db/client.js";
import { optimizationPolicies, type TechniqueStateRow } from "../db/schema.js";
import { conflict, unprocessable } from "../lib/errors.js";
import { ipPrefix } from "../lib/ip.js";
import { anyAuth } from "../plugins/auth.js";
import { audit } from "../services/audit.js";
import { markOnboarding } from "../services/onboarding.js";
import { lockPolicy, techniquesForMode, toPolicyDto } from "../services/policy.js";

export const PolicyUpdateRequest = z.object({
  mode: OrbitMode.optional(),
  techniques: z.array(z.object({ name: TechniqueName, enabled: z.boolean() })).max(20).optional(),
  qualitySampleRate: z.number().min(0).max(1).optional(),
  maxAddedLatencyMs: z.number().int().min(0).max(60_000).optional(),
  cacheTtlSeconds: z.number().int().min(0).max(30 * 24 * 3600).optional(),
  /** optimistic concurrency: reject when the stored version differs */
  expectedVersion: z.number().int().optional(),
});

const enabledNames = (t: TechniqueStateRow[]) => t.filter((x) => x.enabled).map((x) => x.name);

/** Applies a policy mutation under row lock, bumps version, audits before/after. */
async function mutatePolicy(
  tx: Tx,
  auth: AuthContext,
  ip: string,
  action: string,
  fn: (row: typeof optimizationPolicies.$inferSelect) => Partial<typeof optimizationPolicies.$inferInsert> & { meta?: Record<string, unknown> },
) {
  const row = await lockPolicy(tx, auth.orgId);
  const { meta, ...changes } = fn(row);
  const [updated] = await tx
    .update(optimizationPolicies)
    .set({ ...changes, version: row.version + 1, updatedAt: new Date() })
    .where(eq(optimizationPolicies.id, row.id))
    .returning();
  await audit(tx, {
    orgId: auth.orgId,
    actor: auth,
    action,
    targetType: "orbit_policy",
    targetId: row.id,
    metadata: {
      ...meta,
      before: { version: row.version, mode: row.mode, paused: row.paused, enabled: enabledNames(row.techniques) },
      after: { version: updated!.version, mode: updated!.mode, paused: updated!.paused, enabled: enabledNames(updated!.techniques) },
    },
    ipPrefix: ipPrefix(ip),
  });
  if (updated!.mode !== "observe" && !updated!.paused) await markOnboarding(tx, auth.orgId, ["orbit_activated"]);
  return toPolicyDto(updated!);
}

export const orbitRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;
  const writers = { auth: "any" as const, roles: ["owner" as const, "admin" as const] };

  app.get("/orbit/policy", { config: { auth: "any" }, schema: { tags: ["orbit"], response: { 200: OrbitPolicyDto } } }, async (req) => {
    const a = anyAuth(req);
    return db.transaction(async (tx) => toPolicyDto(await lockPolicy(tx, a.orgId)));
  });

  app.put(
    "/orbit/policy",
    { config: writers, schema: { tags: ["orbit"], body: PolicyUpdateRequest, response: { 200: OrbitPolicyDto } } },
    async (req) => {
      const a = anyAuth(req);
      const body = req.body;
      return db.transaction((tx) =>
        mutatePolicy(tx, a, req.ip, "orbit.policy_updated", (row) => {
          if (body.expectedVersion !== undefined && body.expectedVersion !== row.version) {
            throw conflict("version_conflict", "A política foi alterada em outro lugar. Recarregue e tente novamente.", { currentVersion: row.version });
          }
          const mode = body.mode ?? row.mode;
          let techniques = body.mode && body.mode !== row.mode ? techniquesForMode(mode, row.techniques) : toPolicyDto(row).techniques;
          if (body.techniques) {
            // Only entries that differ from the stored state count as explicit changes. This keeps
            // GET → modify → PUT round-trips safe: echoing the old list neither undoes the new mode's
            // defaults nor silently clears a Quality Guard rollback.
            const previous = new Map(toPolicyDto(row).techniques.map((t) => [t.name, t.enabled]));
            const patch = new Map(
              body.techniques.filter((t) => previous.get(t.name) !== t.enabled).map((t) => [t.name, t.enabled]),
            );
            techniques = techniques.map((t) => {
              const enabled = patch.get(t.name as TechniqueName);
              if (enabled === undefined) return t;
              // explicit re-enable clears a Quality Guard rollback
              return enabled ? { ...t, enabled: true, rolledBack: false, rolledBackReason: null } : { ...t, enabled: false };
            });
          }
          if (mode === "observe" && techniques.some((t) => t.enabled)) {
            throw unprocessable("invalid_policy", "No modo Observar nenhuma técnica de otimização fica ativa. Escolha outro modo para ativar técnicas.");
          }
          return {
            mode,
            techniques,
            ...(body.qualitySampleRate !== undefined ? { qualitySampleRate: body.qualitySampleRate } : {}),
            ...(body.maxAddedLatencyMs !== undefined ? { maxAddedLatencyMs: body.maxAddedLatencyMs } : {}),
            ...(body.cacheTtlSeconds !== undefined ? { cacheTtlSeconds: body.cacheTtlSeconds } : {}),
          };
        }),
      );
    },
  );

  const pauseConfig = { auth: "any" as const, roles: ["owner" as const, "admin" as const, "member" as const] };

  app.post("/orbit/pause", { config: pauseConfig, schema: { tags: ["orbit"], response: { 200: OrbitPolicyDto } } }, async (req) => {
    const a = anyAuth(req);
    return db.transaction((tx) => mutatePolicy(tx, a, req.ip, "orbit.paused", () => ({ paused: true })));
  });

  app.post("/orbit/resume", { config: pauseConfig, schema: { tags: ["orbit"], response: { 200: OrbitPolicyDto } } }, async (req) => {
    const a = anyAuth(req);
    return db.transaction((tx) => mutatePolicy(tx, a, req.ip, "orbit.resumed", () => ({ paused: false })));
  });

  app.post(
    "/orbit/rollback",
    {
      config: pauseConfig,
      schema: {
        tags: ["orbit"],
        body: z.object({ technique: TechniqueName, reason: z.string().trim().min(1).max(300) }),
        response: { 200: OrbitPolicyDto },
      },
    },
    async (req) => {
      const a = anyAuth(req);
      return db.transaction((tx) => rollbackTechnique(tx, a, req.ip, req.body.technique, req.body.reason));
    },
  );
};

export function rollbackTechnique(tx: Tx, a: AuthContext, ip: string, technique: TechniqueName, reason: string) {
  return mutatePolicy(tx, a, ip, "orbit.technique_rolled_back", (row) => ({
    techniques: toPolicyDto(row).techniques.map((t) =>
      t.name === technique ? { ...t, enabled: false, rolledBack: true, rolledBackReason: reason } : t,
    ),
    meta: { technique, reason },
  }));
}
