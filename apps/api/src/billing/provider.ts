import Stripe from "stripe";
import type { Config } from "../config.js";
import { ApiHttpError } from "../lib/errors.js";

export interface CheckoutInput {
  checkoutId: string;
  organizationId: string;
  customerEmail: string;
  planCode: string;
  interval: "month" | "year";
  /** Stripe price id from plans.stripe_price_monthly/yearly (null in sandbox) */
  stripePriceId: string | null;
  trialDays: number;
  existingCustomerId: string | null;
}

export interface BillingProvider {
  readonly name: "sandbox" | "stripe";
  createCheckout(input: CheckoutInput): Promise<{ url: string; providerSessionId: string | null }>;
  createPortal(input: { organizationId: string; customerId: string | null }): Promise<string>;
  cancelAtPeriodEnd(input: { providerSubscriptionId: string | null }): Promise<void>;
  /** immediate cancellation (account deletion) */
  cancelNow(input: { providerSubscriptionId: string | null }): Promise<void>;
  /** Stripe only: verifies the signature over the raw body and returns the event. */
  constructWebhookEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event;
}

/** Local, clearly-labeled simulated billing. No money moves. */
export class SandboxBilling implements BillingProvider {
  readonly name = "sandbox" as const;
  constructor(private config: Config) {}
  async createCheckout(input: CheckoutInput) {
    const url = new URL("/app/faturamento/sandbox", this.config.WEB_PUBLIC_URL);
    url.searchParams.set("checkout", input.checkoutId);
    return { url: url.toString(), providerSessionId: null };
  }
  async createPortal() {
    const url = new URL("/app/faturamento", this.config.WEB_PUBLIC_URL);
    url.searchParams.set("portal", "sandbox");
    return url.toString();
  }
  async cancelAtPeriodEnd() {}
  async cancelNow() {}
  constructWebhookEvent(): Stripe.Event {
    throw new ApiHttpError(404, "not_found", "Webhook Stripe desativado (BILLING_PROVIDER=sandbox).");
  }
}

export class StripeBilling implements BillingProvider {
  readonly name = "stripe" as const;
  readonly stripe: Stripe;
  constructor(
    private config: Config,
    secretKey: string,
    private webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, appInfo: { name: "maindy-api" } });
  }

  async createCheckout(input: CheckoutInput) {
    if (!input.stripePriceId) {
      throw new ApiHttpError(
        503,
        "billing_not_configured",
        "Este plano ainda não tem preço configurado no Stripe. Tente novamente mais tarde.",
      );
    }
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: input.stripePriceId, quantity: 1 }],
      client_reference_id: input.checkoutId,
      ...(input.existingCustomerId ? { customer: input.existingCustomerId } : { customer_email: input.customerEmail }),
      metadata: { checkoutId: input.checkoutId, organizationId: input.organizationId, planCode: input.planCode, interval: input.interval },
      subscription_data: {
        metadata: { organizationId: input.organizationId, planCode: input.planCode, interval: input.interval },
        ...(input.trialDays > 0 ? { trial_period_days: input.trialDays } : {}),
      },
      success_url: `${this.config.WEB_PUBLIC_URL}/app/faturamento?checkout=sucesso`,
      cancel_url: `${this.config.WEB_PUBLIC_URL}/app/faturamento?checkout=cancelado`,
      locale: "pt-BR",
    });
    if (!session.url) throw new ApiHttpError(502, "billing_provider_error", "O provedor de pagamento não retornou a URL de checkout.");
    return { url: session.url, providerSessionId: session.id };
  }

  async createPortal(input: { organizationId: string; customerId: string | null }) {
    if (!input.customerId) throw new ApiHttpError(409, "no_billing_customer", "Ainda não há assinatura para gerenciar.");
    const portal = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: `${this.config.WEB_PUBLIC_URL}/app/faturamento`,
    });
    return portal.url;
  }

  async cancelAtPeriodEnd(input: { providerSubscriptionId: string | null }) {
    if (!input.providerSubscriptionId) return;
    await this.stripe.subscriptions.update(input.providerSubscriptionId, { cancel_at_period_end: true });
  }

  async cancelNow(input: { providerSubscriptionId: string | null }) {
    if (!input.providerSubscriptionId) return;
    await this.stripe.subscriptions.cancel(input.providerSubscriptionId);
  }

  constructWebhookEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!signature) throw new ApiHttpError(400, "invalid_signature", "Assinatura do webhook ausente.");
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new ApiHttpError(400, "invalid_signature", "Assinatura do webhook inválida.");
    }
  }
}

export function createBillingProvider(config: Config): BillingProvider {
  if (config.BILLING_PROVIDER === "stripe") {
    return new StripeBilling(config, config.STRIPE_SECRET_KEY!, config.STRIPE_WEBHOOK_SECRET!);
  }
  return new SandboxBilling(config);
}
