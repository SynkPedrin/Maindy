import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StripeBilling } from "../src/billing/provider.js";
import { billingCheckouts, billingEvents, invoices, subscriptions } from "../src/db/schema.js";
import { createTestApp, resetDb, signupVerified, testConfig, web, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t));

describe("plans", () => {
  it("lists the 3 provisional plans from the database", async () => {
    const r = await t.app.inject({ method: "GET", url: "/v1/plans" });
    const plans = r.json();
    expect(plans.map((p: { code: string }) => p.code)).toEqual(["starter", "pro", "master_economy"]);
    expect(plans.every((p: { provisional: boolean }) => p.provisional)).toBe(true);
    expect(plans[0]).toMatchObject({ priceMonthlyCents: 3900, priceYearlyCents: 39000, currency: "BRL", trialDays: 14 });
    expect(plans[1]).toMatchObject({ priceMonthlyCents: 14900, trialDays: 14, highlighted: true });
    expect(plans[2]).toMatchObject({ priceMonthlyCents: 69900, trialDays: 0 });
  });
});

describe("sandbox billing", () => {
  it("checkout → complete (twice) is idempotent: one subscription, one invoice", async () => {
    const a = await signupVerified(t, "bill@exemplo.test");
    const co = await web(t.app, a.cookie, { method: "POST", url: "/v1/billing/checkout", payload: { planCode: "pro", interval: "month" } });
    expect(co.statusCode).toBe(200);
    const { url, provider, checkoutId } = co.json();
    expect(provider).toBe("sandbox");
    expect(url).toBe(`http://localhost:3100/app/faturamento/sandbox?checkout=${checkoutId}`);

    const c1 = await web(t.app, a.cookie, { method: "POST", url: "/v1/billing/sandbox/complete", payload: { checkoutId } });
    expect(c1.statusCode).toBe(200);
    expect(c1.json()).toMatchObject({ duplicate: false, simulated: true, subscription: { planCode: "pro", status: "trialing", provider: "sandbox", interval: "month" } });
    const c2 = await web(t.app, a.cookie, { method: "POST", url: "/v1/billing/sandbox/complete", payload: { checkoutId } });
    expect(c2.json().duplicate).toBe(true);

    expect(await t.db.db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId))).toHaveLength(1);
    const inv = await t.db.db.select().from(invoices).where(eq(invoices.organizationId, a.orgId));
    expect(inv).toHaveLength(1);
    expect(inv[0]!.amountCents).toBe(0); // trial start
    expect((await t.db.db.select().from(billingEvents)).filter((e) => e.provider === "sandbox")).toHaveLength(1);

    const me = (await web(t.app, a.cookie, { method: "GET", url: "/v1/me" })).json();
    expect(me.subscription.status).toBe("trialing");
    expect(me.onboarding.completed).toEqual(expect.arrayContaining(["plan_selected", "checkout_completed"]));

    const invList = (await web(t.app, a.cookie, { method: "GET", url: "/v1/billing/invoices" })).json();
    expect(invList[0].simulated).toBe(true);

    const portal = await web(t.app, a.cookie, { method: "POST", url: "/v1/billing/portal" });
    expect(portal.json().url).toContain("/app/faturamento");
    const cancel = await web(t.app, a.cookie, { method: "POST", url: "/v1/billing/cancel" });
    expect(cancel.json().cancelAtPeriodEnd).toBe(true);
  });

  it("another org cannot complete someone else's checkout", async () => {
    const a = await signupVerified(t, "a1@exemplo.test");
    const b = await signupVerified(t, "b1@exemplo.test");
    const { checkoutId } = (await web(t.app, a.cookie, { method: "POST", url: "/v1/billing/checkout", payload: { planCode: "starter", interval: "year" } })).json();
    const r = await web(t.app, b.cookie, { method: "POST", url: "/v1/billing/sandbox/complete", payload: { checkoutId } });
    expect(r.statusCode).toBe(404);
  });

  it("subscription raises the device limit (pro → 3)", async () => {
    const a = await signupVerified(t, "lim@exemplo.test");
    const { checkoutId } = (await web(t.app, a.cookie, { method: "POST", url: "/v1/billing/checkout", payload: { planCode: "pro", interval: "month" } })).json();
    await web(t.app, a.cookie, { method: "POST", url: "/v1/billing/sandbox/complete", payload: { checkoutId } });
    const { pairDevice } = await import("./helpers.js");
    await pairDevice(t, a.cookie, "1");
    await pairDevice(t, a.cookie, "2");
    await pairDevice(t, a.cookie, "3");
    await expect(pairDevice(t, a.cookie, "4")).rejects.toThrow(/409/);
  });

  it("stripe webhook route is disabled in sandbox mode", async () => {
    const r = await t.app.inject({ method: "POST", url: "/v1/billing/webhooks/stripe", payload: { id: "evt" }, headers: { "stripe-signature": "t=1,v1=x" } });
    expect(r.statusCode).toBe(404);
  });
});

describe("stripe webhooks", () => {
  const SECRET = "whsec_test_maindy_local";
  let s: TestApp;
  let stripe: StripeBilling;
  beforeAll(async () => {
    const cfg = testConfig();
    stripe = new StripeBilling(cfg, "sk_test_maindy_dummy_not_used_for_network", SECRET);
    s = await createTestApp({ billing: stripe });
  });
  afterAll(async () => s.close());

  const send = (event: object, opts: { secret?: string; header?: string } = {}) => {
    const payload = JSON.stringify(event);
    const header = opts.header ?? stripe.stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET });
    return s.app.inject({ method: "POST", url: "/v1/billing/webhooks/stripe", payload, headers: { "content-type": "application/json", "stripe-signature": header } });
  };
  const evt = (type: string, object: object, id = `evt_${randomUUID().replace(/-/g, "")}`) => ({
    id,
    object: "event",
    type,
    api_version: "2025-10-29.clover",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object },
  });

  it("verifies signatures and applies checkout/subscription/invoice events idempotently", async () => {
    const a = await signupVerified(s, "stripe@exemplo.test");
    const [co] = await s.db.db
      .insert(billingCheckouts)
      .values({ organizationId: a.orgId, userId: a.userId, planCode: "starter", interval: "month", provider: "stripe", providerSessionId: "cs_test_1" })
      .returning();

    const bad = await send(evt("checkout.session.completed", {}), { secret: "whsec_wrong" });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("invalid_signature");
    const missing = await s.app.inject({ method: "POST", url: "/v1/billing/webhooks/stripe", payload: "{}", headers: { "content-type": "application/json" } });
    expect(missing.statusCode).toBe(400);

    const completed = evt("checkout.session.completed", {
      id: "cs_test_1",
      object: "checkout.session",
      client_reference_id: co!.id,
      customer: "cus_test_1",
      subscription: "sub_test_1",
      invoice: "in_test_1",
      amount_total: 0,
      currency: "brl",
      payment_status: "no_payment_required",
      metadata: { checkoutId: co!.id, organizationId: a.orgId, planCode: "starter", interval: "month" },
    });
    const r1 = await send(completed);
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toEqual({ received: true, duplicate: false });
    const r2 = await send(completed);
    expect(r2.json()).toEqual({ received: true, duplicate: true });

    let [sub] = await s.db.db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId));
    expect(sub).toMatchObject({ provider: "stripe", planCode: "starter", status: "trialing", providerSubscriptionId: "sub_test_1", providerCustomerId: "cus_test_1" });

    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
    await send(
      evt("customer.subscription.updated", {
        id: "sub_test_1",
        object: "subscription",
        customer: "cus_test_1",
        status: "active",
        cancel_at_period_end: true,
        trial_end: null,
        canceled_at: null,
        metadata: { organizationId: a.orgId, planCode: "pro" },
        items: { object: "list", data: [{ id: "si_1", current_period_start: periodEnd - 30 * 86400, current_period_end: periodEnd, price: { id: "price_x", recurring: { interval: "month" } } }] },
      }),
    );
    [sub] = await s.db.db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId));
    expect(sub).toMatchObject({ status: "active", planCode: "pro", cancelAtPeriodEnd: true });
    expect(sub!.currentPeriodEnd!.getTime()).toBe(periodEnd * 1000);

    await send(
      evt("invoice.payment_failed", {
        id: "in_test_2",
        object: "invoice",
        amount_due: 14900,
        amount_paid: 0,
        currency: "brl",
        hosted_invoice_url: "https://invoice.stripe.com/i/test",
        period_start: periodEnd - 30 * 86400,
        period_end: periodEnd,
        parent: { type: "subscription_details", subscription_details: { subscription: "sub_test_1" } },
      }),
    );
    [sub] = await s.db.db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId));
    expect(sub!.status).toBe("past_due");
    const failed = (await s.db.db.select().from(invoices).where(eq(invoices.providerInvoiceId, "in_test_2")))[0];
    expect(failed).toMatchObject({ status: "failed", amountCents: 14900, currency: "BRL" });

    await send(evt("invoice.paid", { id: "in_test_2", object: "invoice", amount_due: 14900, amount_paid: 14900, currency: "brl", parent: { subscription_details: { subscription: "sub_test_1" } } }));
    [sub] = await s.db.db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId));
    expect(sub!.status).toBe("active");

    await send(evt("customer.subscription.deleted", { id: "sub_test_1", object: "subscription", customer: "cus_test_1", status: "canceled", metadata: {}, items: { data: [] } }));
    [sub] = await s.db.db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId));
    expect(sub!.status).toBe("canceled");
    expect(await s.db.db.select().from(subscriptions).where(eq(subscriptions.organizationId, a.orgId))).toHaveLength(1);

    // unknown types are acknowledged and recorded once
    const other = evt("customer.created", { id: "cus_x" });
    expect((await send(other)).json().duplicate).toBe(false);
    expect((await send(other)).json().duplicate).toBe(true);

    // sandbox completion is not available in stripe mode
    expect((await web(s.app, a.cookie, { method: "POST", url: "/v1/billing/sandbox/complete", payload: { checkoutId: co!.id } })).statusCode).toBe(404);
  });
});
