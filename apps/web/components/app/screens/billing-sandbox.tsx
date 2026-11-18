"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FlaskConical } from "lucide-react";
import { z } from "zod";
import { SubscriptionDto } from "@maindy/contracts";
import { api, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { planName } from "../shell";

const SandboxCompleteResponse = z.looseObject({ subscription: SubscriptionDto, duplicate: z.boolean().optional(), simulated: z.boolean().optional() });

export function BillingSandboxScreen() {
  const sp = useSearchParams();
  const checkoutId = sp.get("checkout");
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SubscriptionDto | null>(null);

  async function complete() {
    if (!checkoutId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api("/v1/billing/sandbox/complete", SandboxCompleteResponse, { method: "POST", body: { checkoutId } });
      setDone(r.subscription);
      await Promise.all([qc.invalidateQueries({ queryKey: qk.me }), qc.invalidateQueries({ queryKey: qk.subscription }), qc.invalidateQueries({ queryKey: qk.onboarding }), qc.invalidateQueries({ queryKey: qk.invoices })]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div role="note" className="mb-4 flex items-center gap-3 rounded-[14px] border-2 border-dashed border-[color-mix(in_oklab,var(--m-gold)_60%,transparent)] bg-[color-mix(in_oklab,var(--m-gold)_8%,transparent)] px-4 py-3" data-testid="sandbox-banner">
        <FlaskConical className="size-5 shrink-0 text-gold" aria-hidden />
        <p className="text-[14px] font-semibold text-fg">Ambiente de testes — nenhum pagamento real</p>
      </div>
      <Card className="p-7">
        {done ? (
          <div className="text-center" data-testid="sandbox-done">
            <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
            <h2 className="mt-4 text-[19px] font-semibold text-fg">Pagamento simulado aprovado</h2>
            <p className="mt-2 text-[13.5px] text-muted">
              Plano {planName(done.planCode)} ativo{done.trialEndsAt ? " em período de teste" : ""}. Nenhum valor foi cobrado — a fatura gerada é marcada como simulada.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <ButtonLink href="/app/onboarding" data-testid="sandbox-continue">
                Continuar onboarding
              </ButtonLink>
              <ButtonLink href="/app/faturamento" variant="secondary">
                Ver faturamento
              </ButtonLink>
            </div>
          </div>
        ) : (
          <>
            <p className="m-label">Checkout simulado</p>
            <h2 className="mt-2 text-[19px] font-semibold text-fg">Confirme a assinatura de teste</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              Esta página substitui o Stripe enquanto a cobrança real não está configurada. O botão abaixo executa o mesmo caminho do webhook de pagamento aprovado — idempotente e auditado.
            </p>
            <dl className="mt-5 rounded-[12px] border border-line bg-bg-deep/50 p-3.5 text-[13px]">
              <dt className="text-subtle">Checkout</dt>
              <dd className="mt-0.5 break-all font-mono text-[12px] text-muted">{checkoutId ?? "ausente"}</dd>
            </dl>
            {error ? (
              <p role="alert" className="mt-4 text-[13px] text-error">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button size="lg" onClick={complete} loading={busy} disabled={!checkoutId} data-testid="sandbox-approve">
                Simular pagamento aprovado
              </Button>
              <ButtonLink href="/app/faturamento?checkout=cancelado" variant="ghost" size="lg">
                Cancelar
              </ButtonLink>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
