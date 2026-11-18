import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import type { Db, Tx } from "../db/client.js";
import { billingCheckouts, billingEvents, invoices, organizations, plans, subscriptions } from "../db/schema.js";
import { audit } from "../services/audit.js";
import { markOnboarding } from "../services/onboarding.js";

type Provider = "stripe" | "sandbox";
type SubStatus = (typeof subscriptions.$inferSelect)["status"];

const DAY_MS = 86_400_000;

export function addInterval(d: Date, interval: "month" | "year"): Date {
  const r = new Date(d);
  if (interval === "month") r.setUTCMonth(r.getUTCMonth() + 1);
  else r.setUTCFullYear(r.getUTCFullYear() + 1);
  return r;
}

/**
 * Runs `handler` exactly once per provider event id (billing_events.event_id UNIQUE) inside one transaction.
 * If the handler throws, the event row is rolled back too, so the provider's retry is processed again.
 */
export async function processBillingEvent(
  db: Db,
  ev: { eventId: string; provider: Provider; type: string; orgId?: string | null },
  handler: (tx: Tx) => Promise<{ orgId?: string | null; summary?: Record<string, unknown> } | void>,
): Promise<{ duplicate: boolean }> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(billingEvents)
      .values({ eventId: ev.eventId, provider: ev.provider, type: ev.type, organizationId: ev.orgId ?? null })
      .onConflictDoNothing({ target: billingEvents.eventId })
      .returning({ id: billingEvents.id });
    if (inserted.length === 0) return { duplicate: true };
    const result = await handler(tx);
    await tx
      .update(billingEvents)
      .set({
        processedAt: new Date(),
        organizationId: result?.orgId ?? ev.orgId ?? null,
        summary: result?.summary ?? {},
      })
      .where(eq(billingEvents.id, inserted[0]!.id));
    return { duplicate: false };
  });
}

export interface InvoiceInput {
  providerInvoiceId: string;
  amountCents: number;
  currency: string;
  status: (typeof invoices.$inferInsert)["status"];
  description?: string | null;
  hostedUrl?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

async function upsertInvoice(tx: Tx, orgId: string, subscriptionId: string | null, provider: Provider, inv: InvoiceInput) {
  await tx
    .insert(invoices)
    .values({
      organizationId: orgId,
      subscriptionId,
      provider,
      providerInvoiceId: inv.providerInvoiceId,
      amountCents: inv.amountCents,
      currency: inv.currency.toUpperCase(),
      status: inv.status,
      description: inv.description ?? null,
      hostedUrl: inv.hostedUrl ?? null,
      periodStart: inv.periodStart ?? null,
      periodEnd: inv.periodEnd ?? null,
    })
    .onConflictDoUpdate({
      target: invoices.providerInvoiceId,
      set: { status: inv.status, amountCents: inv.amountCents, hostedUrl: inv.hostedUrl ?? null, updatedAt: new Date() },
    });
}

export interface CheckoutCompletedInput {
  checkoutId: string;
  provider: Provider;
  customerId: string | null;
  providerSubscriptionId: string | null;
  /** sandbox synthesizes one; Stripe passes the session invoice when present */
  invoice?: InvoiceInput | "sandbox";
}

/**
 * The single handler behind Stripe `checkout.session.completed` AND `POST /v1/billing/sandbox/complete`.
 * Must be called inside processBillingEvent (idempotency).
 */
export async function applyCheckoutCompleted(tx: Tx, input: CheckoutCompletedInput): Promise<{ orgId: string | null; summary: Record<string, unknown> }> {
  const [checkout] = await tx.select().from(billingCheckouts).where(eq(billingCheckouts.id, input.checkoutId)).for("update");
  if (!checkout) return { orgId: null, summary: { ignored: "unknown_checkout" } };
  const [plan] = await tx.select().from(plans).where(eq(plans.code, checkout.planCode));
  if (!plan) return { orgId: checkout.organizationId, summary: { ignored: "unknown_plan" } };

  const now = new Date();
  const trialEndsAt = plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * DAY_MS) : null;
  const status: SubStatus = trialEndsAt ? "trialing" : "active";
  const periodEnd = trialEndsAt ?? addInterval(now, checkout.interval);

  const [sub] = await tx
    .insert(subscriptions)
    .values({
      organizationId: checkout.organizationId,
      planCode: checkout.planCode,
      status,
      interval: checkout.interval,
      provider: input.provider,
      providerCustomerId: input.customerId,
      providerSubscriptionId: input.providerSubscriptionId,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      trialEndsAt,
    })
    .onConflictDoUpdate({
      target: subscriptions.organizationId,
      set: {
        planCode: checkout.planCode,
        status,
        interval: checkout.interval,
        provider: input.provider,
        providerCustomerId: input.customerId,
        providerSubscriptionId: input.providerSubscriptionId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        trialEndsAt,
        canceledAt: null,
        updatedAt: now,
      },
    })
    .returning();

  if (input.invoice === "sandbox") {
    const price = checkout.interval === "month" ? plan.priceMonthlyCents : plan.priceYearlyCents;
    await upsertInvoice(tx, checkout.organizationId, sub!.id, "sandbox", {
      providerInvoiceId: `sandbox_inv_${checkout.id}`,
      amountCents: trialEndsAt ? 0 : (price ?? 0),
      currency: plan.currency,
      status: "paid",
      description: `${plan.name} (${checkout.interval === "month" ? "mensal" : "anual"})${trialEndsAt ? ` — início do teste de ${plan.trialDays} dias` : ""} — sandbox, simulado`,
      periodStart: now,
      periodEnd,
    });
  } else if (input.invoice) {
    await upsertInvoice(tx, checkout.organizationId, sub!.id, input.provider, input.invoice);
  }

  await tx.update(billingCheckouts).set({ status: "completed", completedAt: now }).where(eq(billingCheckouts.id, checkout.id));
  await markOnboarding(tx, checkout.organizationId, ["plan_selected", "checkout_completed"]);
  await audit(tx, {
    orgId: checkout.organizationId,
    actor: { kind: "billing", id: input.provider },
    action: "billing.checkout_completed",
    targetType: "subscription",
    targetId: sub!.id,
    metadata: { planCode: checkout.planCode, interval: checkout.interval, provider: input.provider, status },
  });
  return { orgId: checkout.organizationId, summary: { checkoutId: checkout.id, planCode: checkout.planCode, status } };
}

/* ----------------------------- Stripe dispatch ----------------------------- */

const idOf = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "id" in v && typeof (v as { id: unknown }).id === "string") return (v as { id: string }).id;
  return null;
};
const tsToDate = (v: unknown): Date | null => (typeof v === "number" && v > 0 ? new Date(v * 1000) : null);

export function mapStripeStatus(s: string): SubStatus {
  switch (s) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "incomplete":
      return s;
    case "incomplete_expired":
      return "canceled";
    case "unpaid":
    case "paused":
      return "past_due";
    default:
      return "incomplete";
  }
}

async function planCodeFromStripe(tx: Tx, sub: Stripe.Subscription): Promise<(typeof plans.$inferSelect)["code"] | null> {
  const meta = sub.metadata?.planCode;
  if (meta === "starter" || meta === "pro" || meta === "master_economy") return meta;
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  const [p] = await tx
    .select({ code: plans.code })
    .from(plans)
    .where(sql`${plans.stripePriceMonthly} = ${priceId} or ${plans.stripePriceYearly} = ${priceId}`);
  return p?.code ?? null;
}

async function applyStripeSubscription(tx: Tx, sub: Stripe.Subscription, deleted: boolean) {
  const raw = sub as unknown as Record<string, unknown>;
  const item = sub.items?.data?.[0] as unknown as Record<string, unknown> | undefined;
  const periodEnd = tsToDate(item?.current_period_end ?? raw.current_period_end);
  const periodStart = tsToDate(item?.current_period_start ?? raw.current_period_start);
  const status = deleted ? "canceled" : mapStripeStatus(sub.status);
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "year" : "month";

  let [local] = await tx.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, sub.id));
  let orgId = local?.organizationId ?? null;
  if (!local) {
    const metaOrg = sub.metadata?.organizationId;
    if (!metaOrg) return { orgId: null, summary: { ignored: "unknown_subscription" } };
    const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, metaOrg));
    if (!org) return { orgId: null, summary: { ignored: "unknown_organization" } };
    orgId = org.id;
  }
  const planCode = (await planCodeFromStripe(tx, sub)) ?? local?.planCode;
  if (!planCode) return { orgId, summary: { ignored: "unknown_plan" } };
  const values = {
    planCode,
    status,
    interval: interval as "month" | "year",
    provider: "stripe" as const,
    providerCustomerId: idOf(sub.customer),
    providerSubscriptionId: sub.id,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    trialEndsAt: tsToDate(sub.trial_end),
    canceledAt: deleted ? new Date() : tsToDate(sub.canceled_at),
    updatedAt: new Date(),
  };
  [local] = await tx
    .insert(subscriptions)
    .values({ organizationId: orgId!, ...values })
    .onConflictDoUpdate({ target: subscriptions.organizationId, set: values })
    .returning();
  await audit(tx, {
    orgId: orgId!,
    actor: { kind: "billing", id: "stripe" },
    action: deleted ? "billing.subscription_deleted" : "billing.subscription_updated",
    targetType: "subscription",
    targetId: local!.id,
    metadata: { status, planCode, cancelAtPeriodEnd: values.cancelAtPeriodEnd },
  });
  return { orgId, summary: { status, planCode } };
}

async function applyStripeInvoice(tx: Tx, inv: Stripe.Invoice, paid: boolean) {
  const raw = inv as unknown as Record<string, unknown>;
  const parent = raw.parent as { subscription_details?: { subscription?: unknown } } | null | undefined;
  const subId = idOf(parent?.subscription_details?.subscription) ?? idOf(raw.subscription);
  if (!subId || !inv.id) return { orgId: null, summary: { ignored: "invoice_without_subscription" } };
  const [local] = await tx.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, subId));
  if (!local) return { orgId: null, summary: { ignored: "unknown_subscription" } };
  await upsertInvoice(tx, local.organizationId, local.id, "stripe", {
    providerInvoiceId: inv.id,
    amountCents: paid ? (inv.amount_paid ?? 0) : (inv.amount_due ?? 0),
    currency: inv.currency ?? "brl",
    status: paid ? "paid" : "failed",
    description: inv.description ?? null,
    hostedUrl: inv.hosted_invoice_url ?? null,
    periodStart: tsToDate(inv.period_start),
    periodEnd: tsToDate(inv.period_end),
  });
  if (!paid && local.status !== "canceled") {
    await tx.update(subscriptions).set({ status: "past_due", updatedAt: new Date() }).where(eq(subscriptions.id, local.id));
  } else if (paid && local.status === "past_due") {
    await tx.update(subscriptions).set({ status: "active", updatedAt: new Date() }).where(eq(subscriptions.id, local.id));
  }
  await audit(tx, {
    orgId: local.organizationId,
    actor: { kind: "billing", id: "stripe" },
    action: paid ? "billing.invoice_paid" : "billing.invoice_payment_failed",
    targetType: "invoice",
    targetId: inv.id,
  });
  return { orgId: local.organizationId, summary: { invoice: inv.id, paid } };
}

export async function handleStripeEvent(db: Db, event: Stripe.Event): Promise<{ duplicate: boolean }> {
  return processBillingEvent(db, { eventId: event.id, provider: "stripe", type: event.type }, async (tx) => {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        const checkoutId = s.client_reference_id ?? s.metadata?.checkoutId ?? null;
        if (!checkoutId || !/^[0-9a-f-]{36}$/i.test(checkoutId)) return { summary: { ignored: "no_checkout_reference" } };
        const invoiceId = idOf(s.invoice);
        return applyCheckoutCompleted(tx, {
          checkoutId,
          provider: "stripe",
          customerId: idOf(s.customer),
          providerSubscriptionId: idOf(s.subscription),
          ...(invoiceId
            ? {
                invoice: {
                  providerInvoiceId: invoiceId,
                  amountCents: s.amount_total ?? 0,
                  currency: s.currency ?? "brl",
                  status: s.payment_status === "unpaid" ? "open" : "paid",
                },
              }
            : {}),
        });
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
        return applyStripeSubscription(tx, event.data.object, false);
      case "customer.subscription.deleted":
        return applyStripeSubscription(tx, event.data.object, true);
      case "invoice.paid":
        return applyStripeInvoice(tx, event.data.object, true);
      case "invoice.payment_failed":
        return applyStripeInvoice(tx, event.data.object, false);
      default:
        return { summary: { ignored: "unhandled_type" } };
    }
  });
}
