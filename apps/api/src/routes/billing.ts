import { BillingInterval, PlanCode, PlanDto, SubscriptionDto } from "@maindy/contracts";
import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { applyCheckoutCompleted, handleStripeEvent, processBillingEvent } from "../billing/handlers.js";
import { billingCheckouts, invoices, plans, subscriptions, users } from "../db/schema.js";
import { ApiHttpError, conflict, notFound } from "../lib/errors.js";
import { ipPrefix } from "../lib/ip.js";
import { webAuth } from "../plugins/auth.js";
import { audit } from "../services/audit.js";
import { toSubscriptionDto } from "../services/me.js";
import { markOnboarding } from "../services/onboarding.js";

export function toPlanDto(p: typeof plans.$inferSelect): PlanDto {
  return {
    code: p.code,
    name: p.name,
    tagline: p.tagline,
    priceMonthlyCents: p.priceMonthlyCents,
    priceYearlyCents: p.priceYearlyCents,
    currency: p.currency,
    provisional: p.provisional,
    trialDays: p.trialDays,
    limits: p.limits,
    features: p.features,
    highlighted: p.highlighted,
  };
}

export const InvoiceDto = z.object({
  id: z.string(),
  provider: z.enum(["stripe", "sandbox"]),
  amountCents: z.number().int(),
  currency: z.string(),
  status: z.enum(["draft", "open", "paid", "uncollectible", "void", "failed"]),
  description: z.string().nullable(),
  hostedUrl: z.string().nullable(),
  periodStart: z.string().datetime().nullable(),
  periodEnd: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  /** true for sandbox invoices — simulated, no money moved */
  simulated: z.boolean(),
});

const BILLING_ROLES = ["owner", "admin"] as const;
const UrlResponse = z.object({ url: z.string().url(), provider: z.enum(["stripe", "sandbox"]) });

export const billingRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, billing } = app.deps;

  app.get("/plans", { schema: { tags: ["billing"], response: { 200: z.array(PlanDto) } } }, async () => {
    const rows = await db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder));
    return rows.map(toPlanDto);
  });

  app.post(
    "/billing/checkout",
    {
      config: { auth: "web", roles: [...BILLING_ROLES] },
      schema: {
        tags: ["billing"],
        body: z.object({ planCode: PlanCode, interval: BillingInterval }),
        response: { 200: UrlResponse.extend({ checkoutId: z.string().uuid() }) },
      },
    },
    async (req) => {
      const a = webAuth(req);
      const [plan] = await db.select().from(plans).where(and(eq(plans.code, req.body.planCode), eq(plans.active, true)));
      if (!plan) throw notFound("Plano não encontrado.");
      const price = req.body.interval === "month" ? plan.priceMonthlyCents : plan.priceYearlyCents;
      if (price === null) throw conflict("plan_not_self_serve", "Este plano é contratado com nosso time comercial.");
      const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId));
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, a.userId));
      const [checkout] = await db
        .insert(billingCheckouts)
        .values({ organizationId: a.orgId, userId: a.userId, planCode: plan.code, interval: req.body.interval, provider: billing.name })
        .returning();
      const result = await billing.createCheckout({
        checkoutId: checkout!.id,
        organizationId: a.orgId,
        customerEmail: u!.email,
        planCode: plan.code,
        interval: req.body.interval,
        stripePriceId: req.body.interval === "month" ? plan.stripePriceMonthly : plan.stripePriceYearly,
        trialDays: existing ? 0 : plan.trialDays,
        existingCustomerId: existing?.providerCustomerId ?? null,
      });
      if (result.providerSessionId) {
        await db.update(billingCheckouts).set({ providerSessionId: result.providerSessionId }).where(eq(billingCheckouts.id, checkout!.id));
      }
      await markOnboarding(db, a.orgId, ["plan_selected"]);
      await audit(db, {
        orgId: a.orgId,
        actor: a,
        action: "billing.checkout_started",
        targetType: "checkout",
        targetId: checkout!.id,
        metadata: { planCode: plan.code, interval: req.body.interval, provider: billing.name },
        ipPrefix: ipPrefix(req.ip),
      });
      return { url: result.url, provider: billing.name, checkoutId: checkout!.id };
    },
  );

  app.post(
    "/billing/sandbox/complete",
    {
      config: { auth: "web", roles: [...BILLING_ROLES] },
      schema: {
        tags: ["billing"],
        description: "Somente BILLING_PROVIDER=sandbox: simula `checkout.session.completed` pelo mesmo handler idempotente do Stripe.",
        body: z.object({ checkoutId: z.string().uuid() }),
        response: { 200: z.object({ subscription: SubscriptionDto, duplicate: z.boolean(), simulated: z.literal(true) }) },
      },
    },
    async (req) => {
      if (billing.name !== "sandbox") throw notFound("Sandbox de pagamento desativado.");
      const a = webAuth(req);
      const [checkout] = await db
        .select()
        .from(billingCheckouts)
        .where(and(eq(billingCheckouts.id, req.body.checkoutId), eq(billingCheckouts.organizationId, a.orgId)));
      if (!checkout || checkout.provider !== "sandbox") throw notFound("Checkout não encontrado.");
      const { duplicate } = await processBillingEvent(
        db,
        { eventId: `sandbox_evt_checkout_${checkout.id}`, provider: "sandbox", type: "checkout.session.completed", orgId: a.orgId },
        (tx) =>
          applyCheckoutCompleted(tx, {
            checkoutId: checkout.id,
            provider: "sandbox",
            customerId: `sandbox_cus_${a.orgId}`,
            providerSubscriptionId: `sandbox_sub_${a.orgId}`,
            invoice: "sandbox",
          }),
      );
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId));
      if (!sub) throw new ApiHttpError(500, "internal_error", "Assinatura não registrada.");
      return { subscription: toSubscriptionDto(sub), duplicate, simulated: true as const };
    },
  );

  // Stripe webhook: needs the raw body for signature verification → isolated content-type parser.
  await app.register(async (scope) => {
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser("application/json", { parseAs: "buffer", bodyLimit: 1024 * 1024 }, (_req, body, done) => done(null, body));
    scope.post(
      "/billing/webhooks/stripe",
      { schema: { tags: ["billing"], description: "Webhook assinado do Stripe (raw body)." } },
      async (req) => {
        if (billing.name !== "stripe") throw notFound("Webhook Stripe desativado (BILLING_PROVIDER=sandbox).");
        const raw = req.body;
        if (!Buffer.isBuffer(raw)) throw new ApiHttpError(400, "invalid_payload", "Corpo do webhook ausente.");
        const sig = req.headers["stripe-signature"];
        const event = billing.constructWebhookEvent(raw, typeof sig === "string" ? sig : undefined);
        const { duplicate } = await handleStripeEvent(db, event);
        req.log.info({ stripeEvent: event.type, duplicate }, "stripe webhook processed");
        return { received: true, duplicate };
      },
    );
  });

  app.get(
    "/billing/subscription",
    { config: { auth: "web" }, schema: { tags: ["billing"], response: { 200: SubscriptionDto.nullable() } } },
    async (req) => {
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, webAuth(req).orgId));
      return sub ? toSubscriptionDto(sub) : null;
    },
  );

  app.post(
    "/billing/portal",
    { config: { auth: "web", roles: [...BILLING_ROLES] }, schema: { tags: ["billing"], response: { 200: UrlResponse } } },
    async (req) => {
      const a = webAuth(req);
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId));
      const url = await billing.createPortal({ organizationId: a.orgId, customerId: sub?.providerCustomerId ?? null });
      return { url, provider: billing.name };
    },
  );

  app.post(
    "/billing/cancel",
    { config: { auth: "web", roles: [...BILLING_ROLES] }, schema: { tags: ["billing"], response: { 200: SubscriptionDto } } },
    async (req) => {
      const a = webAuth(req);
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId));
      if (!sub || sub.status === "canceled") throw notFound("Nenhuma assinatura ativa para cancelar.");
      if (sub.provider !== billing.name) throw conflict("billing_provider_mismatch", "Esta assinatura foi criada em outro provedor de pagamento.");
      await billing.cancelAtPeriodEnd({ providerSubscriptionId: sub.providerSubscriptionId });
      const [updated] = await db
        .update(subscriptions)
        .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(subscriptions.id, sub.id))
        .returning();
      await audit(db, { orgId: a.orgId, actor: a, action: "billing.cancel_at_period_end", targetType: "subscription", targetId: sub.id, ipPrefix: ipPrefix(req.ip) });
      return toSubscriptionDto(updated!);
    },
  );

  app.get(
    "/billing/invoices",
    { config: { auth: "web" }, schema: { tags: ["billing"], response: { 200: z.array(InvoiceDto) } } },
    async (req) => {
      const rows = await db
        .select()
        .from(invoices)
        .where(eq(invoices.organizationId, webAuth(req).orgId))
        .orderBy(desc(invoices.createdAt))
        .limit(200);
      return rows.map((i) => ({
        id: i.id,
        provider: i.provider,
        amountCents: i.amountCents,
        currency: i.currency,
        status: i.status,
        description: i.description,
        hostedUrl: i.hostedUrl,
        periodStart: i.periodStart?.toISOString() ?? null,
        periodEnd: i.periodEnd?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
        simulated: i.provider === "sandbox",
      }));
    },
  );
};
