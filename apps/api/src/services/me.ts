import type { MeDto, Role, SubscriptionDto } from "@maindy/contracts";
import { and, asc, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { memberships, organizations, subscriptions, users } from "../db/schema.js";
import { getOnboarding } from "./onboarding.js";

export function toSubscriptionDto(s: typeof subscriptions.$inferSelect): SubscriptionDto {
  return {
    id: s.id,
    planCode: s.planCode,
    status: s.status,
    interval: s.interval,
    provider: s.provider,
    currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
  };
}

export function toUserDto(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    emailVerified: u.emailVerifiedAt !== null,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Primary membership of a user (v0.1: exactly one org per user, created at signup). */
export async function primaryMembership(db: DbOrTx, userId: string) {
  const [m] = await db
    .select({ orgId: memberships.organizationId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  return m ?? null;
}

export async function buildMe(db: DbOrTx, userId: string, orgId: string, role: Role): Promise<MeDto | null> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const [o] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!u || !o) return null;
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, orgId)));
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId));
  return {
    user: toUserDto(u),
    organization: { id: o.id, name: o.name, slug: o.slug },
    role: m?.role ?? role,
    subscription: s ? toSubscriptionDto(s) : null,
    onboarding: await getOnboarding(db, orgId),
  };
}
