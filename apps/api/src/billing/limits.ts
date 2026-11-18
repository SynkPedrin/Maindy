import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { devicePairings, devices, memberships, plans, projects, subscriptions } from "../db/schema.js";
import { ApiHttpError } from "../lib/errors.js";

export type LimitKey = "devices" | "projects" | "seats" | "environments";
export type Limits = Record<LimitKey, number | null>;

/** Limits applied when the org has no subscription in good standing (lets a user evaluate with one machine). */
export const NO_PLAN_LIMITS: Limits = { environments: 1, projects: 1, seats: 1, devices: 1 };

const GOOD_STANDING = new Set(["trialing", "active", "past_due"]);

export async function effectiveLimits(db: DbOrTx, orgId: string): Promise<{ planCode: string | null; limits: Limits }> {
  const [row] = await db
    .select({ status: subscriptions.status, planCode: subscriptions.planCode, limits: plans.limits })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.code, subscriptions.planCode))
    .where(eq(subscriptions.organizationId, orgId));
  if (!row || !GOOD_STANDING.has(row.status)) return { planCode: null, limits: NO_PLAN_LIMITS };
  return { planCode: row.planCode, limits: row.limits };
}

async function usage(db: DbOrTx, orgId: string, key: LimitKey): Promise<number> {
  switch (key) {
    case "devices":
    case "environments": {
      const [r] = await db.select({ n: count() }).from(devices).where(and(eq(devices.organizationId, orgId), isNull(devices.revokedAt)));
      // approved pairings not yet picked up by the device also reserve a slot
      const [p] = await db
        .select({ n: count() })
        .from(devicePairings)
        .where(and(eq(devicePairings.organizationId, orgId), eq(devicePairings.status, "approved"), gt(devicePairings.expiresAt, sql`now()`)));
      return (r?.n ?? 0) + (p?.n ?? 0);
    }
    case "projects": {
      const [r] = await db.select({ n: count() }).from(projects).where(eq(projects.organizationId, orgId));
      return r?.n ?? 0;
    }
    case "seats": {
      const [r] = await db.select({ n: count() }).from(memberships).where(eq(memberships.organizationId, orgId));
      return r?.n ?? 0;
    }
  }
}

const LABEL: Record<LimitKey, string> = {
  devices: "dispositivos",
  projects: "projetos",
  seats: "assentos",
  environments: "ambientes",
};

/** Server-side plan enforcement: throws 409 plan_limit_reached when adding one more `key` would exceed the plan. */
export async function assertCanAdd(db: DbOrTx, orgId: string, key: LimitKey): Promise<void> {
  const { planCode, limits } = await effectiveLimits(db, orgId);
  const max = limits[key];
  if (max === null) return;
  const used = await usage(db, orgId, key);
  if (used + 1 > max) {
    throw new ApiHttpError(
      409,
      "plan_limit_reached",
      planCode
        ? `Seu plano permite até ${max} ${LABEL[key]}. Faça upgrade ou remova um item para continuar.`
        : `Sem assinatura ativa, o limite é de ${max} ${LABEL[key]}. Escolha um plano para continuar.`,
      { limit: key, max, used, planCode },
    );
  }
}
