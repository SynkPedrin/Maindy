import { OnboardingDto, OnboardingStep } from "@maindy/contracts";
import { and, count, desc, eq, lt, or } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  agents,
  auditEvents,
  connectors,
  devices,
  integrationCredentialRefs,
  invoices,
  memberships,
  onboardingProgress,
  optimizationPolicies,
  organizations,
  projects,
  providerQuotaSnapshots,
  qualityEvaluations,
  requestUsage,
  savingsLedger,
  sessions,
  subscriptions,
  users,
} from "../db/schema.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { ApiHttpError, unauthorized, unprocessable } from "../lib/errors.js";
import { ipPrefix } from "../lib/ip.js";
import { verifyPassword } from "../lib/password.js";
import { webAuth } from "../plugins/auth.js";
import { audit } from "../services/audit.js";
import { getOnboarding, markOnboarding } from "../services/onboarding.js";
import { clearSessionCookie } from "../services/sessions.js";

/** Steps a client may self-report; the rest are set by the server when the real event happens. */
const CLIENT_STEPS = new Set<OnboardingStep>(["plan_selected", "app_downloaded", "baseline_started"]);

export const AuditEventDto = z.object({
  id: z.string(),
  actorType: z.enum(["user", "device", "system", "billing"]),
  actorId: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  ipPrefix: z.string().nullable(),
  createdAt: z.string().datetime(),
});

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const accountRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, billing } = app.deps;

  app.get("/onboarding", { config: { auth: "web" }, schema: { tags: ["onboarding"], response: { 200: OnboardingDto } } }, async (req) => {
    return getOnboarding(db, webAuth(req).orgId);
  });

  app.patch(
    "/onboarding",
    {
      config: { auth: "web" },
      schema: {
        tags: ["onboarding"],
        body: z.object({ complete: z.array(OnboardingStep).max(8).optional(), dismissed: z.boolean().optional() }),
        response: { 200: OnboardingDto },
      },
    },
    async (req) => {
      const a = webAuth(req);
      const steps = req.body.complete ?? [];
      const serverManaged = steps.filter((s) => !CLIENT_STEPS.has(s));
      if (serverManaged.length) {
        throw unprocessable("step_server_managed", "Estas etapas são concluídas automaticamente quando a ação real acontece.", { steps: serverManaged });
      }
      await markOnboarding(db, a.orgId, steps);
      if (req.body.dismissed !== undefined) {
        await db
          .insert(onboardingProgress)
          .values({ organizationId: a.orgId, completed: [], dismissed: req.body.dismissed })
          .onConflictDoUpdate({ target: onboardingProgress.organizationId, set: { dismissed: req.body.dismissed, updatedAt: new Date() } });
      }
      return getOnboarding(db, a.orgId);
    },
  );

  app.get(
    "/audit",
    {
      config: { auth: "web", roles: ["owner", "admin"] },
      schema: {
        tags: ["account"],
        querystring: z.object({ cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }),
        response: { 200: z.object({ items: z.array(AuditEventDto), nextCursor: z.string().nullable() }) },
      },
    },
    async (req) => {
      const a = webAuth(req);
      const c = decodeCursor(req.query.cursor);
      const rows = await db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, a.orgId),
            c ? or(lt(auditEvents.createdAt, c.t), and(eq(auditEvents.createdAt, c.t), lt(auditEvents.id, c.id))) : undefined,
          ),
        )
        .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
        .limit(req.query.limit + 1);
      const page = rows.slice(0, req.query.limit);
      const last = page[page.length - 1];
      return {
        items: page.map((r) => ({
          id: r.id,
          actorType: r.actorType,
          actorId: r.actorId,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          metadata: r.metadata,
          ipPrefix: r.ipPrefix,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor: rows.length > req.query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
      };
    },
  );

  app.get("/account/export", { config: { auth: "web" }, schema: { tags: ["account"] } }, async (req, reply) => {
    const a = webAuth(req);
    const org = a.orgId;
    const [u] = await db.select().from(users).where(eq(users.id, a.userId));
    if (!u) throw unauthorized();
    const [o] = await db.select().from(organizations).where(eq(organizations.id, org));
    const data = {
      exportedAt: new Date().toISOString(),
      format: "maindy-lgpd-export-v1",
      notice: "Exportação LGPD: dados da sua conta e da sua organização. Segredos, hashes de senha e tokens nunca são exportados.",
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        emailVerifiedAt: iso(u.emailVerifiedAt),
        termsAcceptedAt: iso(u.termsAcceptedAt),
        marketingOptIn: u.marketingOptIn,
        createdAt: iso(u.createdAt),
      },
      organization: o ? { id: o.id, name: o.name, slug: o.slug, createdAt: iso(o.createdAt) } : null,
      memberships: await db.select({ userId: memberships.userId, role: memberships.role, createdAt: memberships.createdAt }).from(memberships).where(eq(memberships.organizationId, org)),
      sessions: await db
        .select({ id: sessions.id, userAgent: sessions.userAgent, ipPrefix: sessions.ipPrefix, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt, revokedAt: sessions.revokedAt })
        .from(sessions)
        .where(eq(sessions.userId, a.userId)),
      subscription: (await db.select().from(subscriptions).where(eq(subscriptions.organizationId, org)))[0] ?? null,
      invoices: await db.select().from(invoices).where(eq(invoices.organizationId, org)),
      devices: await db
        .select({ id: devices.id, name: devices.name, platform: devices.platform, arch: devices.arch, appVersion: devices.appVersion, createdAt: devices.createdAt, lastSeenAt: devices.lastSeenAt, revokedAt: devices.revokedAt })
        .from(devices)
        .where(eq(devices.organizationId, org)),
      connectors: await db.select().from(connectors).where(eq(connectors.organizationId, org)),
      credentialRefs: await db.select().from(integrationCredentialRefs).where(eq(integrationCredentialRefs.organizationId, org)),
      projects: await db.select().from(projects).where(eq(projects.organizationId, org)),
      agents: await db.select().from(agents).where(eq(agents.organizationId, org)),
      policy: (await db.select().from(optimizationPolicies).where(eq(optimizationPolicies.organizationId, org)))[0] ?? null,
      onboarding: await getOnboarding(db, org),
      requestUsage: await db.select().from(requestUsage).where(eq(requestUsage.organizationId, org)).orderBy(desc(requestUsage.occurredAt)),
      qualityEvaluations: await db.select().from(qualityEvaluations).where(eq(qualityEvaluations.organizationId, org)),
      quotaSnapshots: await db.select().from(providerQuotaSnapshots).where(eq(providerQuotaSnapshots.organizationId, org)),
      savingsLedger: await db.select().from(savingsLedger).where(eq(savingsLedger.organizationId, org)),
      auditEvents: await db.select().from(auditEvents).where(eq(auditEvents.organizationId, org)).orderBy(desc(auditEvents.createdAt)),
    };
    await audit(db, { orgId: org, actor: a, action: "account.exported", ipPrefix: ipPrefix(req.ip) });
    reply.header("content-disposition", `attachment; filename="maindy-export-${new Date().toISOString().slice(0, 10)}.json"`);
    reply.header("cache-control", "no-store");
    return data;
  });

  app.delete(
    "/account",
    {
      config: { auth: "web" },
      schema: {
        tags: ["account"],
        body: z.object({ confirm: z.literal("EXCLUIR"), password: z.string().min(1).max(200) }),
        response: { 200: z.object({ ok: z.literal(true), organizationDeleted: z.boolean() }) },
      },
    },
    async (req, reply) => {
      const a = webAuth(req);
      const [u] = await db.select().from(users).where(eq(users.id, a.userId));
      if (!u) throw unauthorized();
      if (!(await verifyPassword(u.passwordHash, req.body.password))) {
        throw new ApiHttpError(401, "invalid_credentials", "Senha incorreta.");
      }
      const [{ n: members } = { n: 0 }] = await db.select({ n: count() }).from(memberships).where(eq(memberships.organizationId, a.orgId));
      const deleteOrg = members <= 1;
      if (!deleteOrg && a.role === "owner") {
        const [{ n: owners } = { n: 0 }] = await db
          .select({ n: count() })
          .from(memberships)
          .where(and(eq(memberships.organizationId, a.orgId), eq(memberships.role, "owner")));
        if (owners <= 1) {
          throw new ApiHttpError(409, "transfer_ownership_required", "Transfira a propriedade da organização antes de excluir sua conta.");
        }
      }
      if (deleteOrg) {
        const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId));
        if (sub && sub.provider === "stripe" && sub.status !== "canceled") {
          try {
            await billing.cancelNow({ providerSubscriptionId: sub.providerSubscriptionId });
          } catch (err) {
            req.log.error({ err: err instanceof Error ? err.message : String(err) }, "failed to cancel provider subscription on account deletion");
            throw new ApiHttpError(502, "billing_provider_error", "Não foi possível cancelar sua assinatura no provedor de pagamento. Tente novamente.");
          }
        }
      }
      await db.transaction(async (tx) => {
        if (deleteOrg) {
          await tx.delete(organizations).where(eq(organizations.id, a.orgId));
        } else {
          await tx.delete(memberships).where(and(eq(memberships.organizationId, a.orgId), eq(memberships.userId, a.userId)));
          await audit(tx, { orgId: a.orgId, actor: { kind: "system" }, action: "account.member_deleted", targetType: "user", targetId: a.userId });
        }
        await tx.delete(users).where(eq(users.id, a.userId));
      });
      req.log.info({ organizationDeleted: deleteOrg }, "account deleted (LGPD)");
      clearSessionCookie(reply, app.deps.config);
      return { ok: true as const, organizationDeleted: deleteOrg };
    },
  );
};
