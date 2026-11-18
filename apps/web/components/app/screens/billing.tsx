"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Check, CreditCard, ExternalLink, FileText, Info } from "lucide-react";
import type { BillingInterval, PlanCode, PlanDto } from "@maindy/contracts";
import { useCancelSubscription, useCheckout, useInvoices, useMe, usePlans, usePortal, useSubscription } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { PageIntro } from "../page-intro";
import { formatCents, formatDate } from "../format";
import { planName, statusName } from "../shell";

const invoiceStatus: Record<string, { label: string; tone: "success" | "warning" | "error" | "neutral" }> = {
  paid: { label: "Paga", tone: "success" },
  open: { label: "Em aberto", tone: "warning" },
  draft: { label: "Rascunho", tone: "neutral" },
  void: { label: "Anulada", tone: "neutral" },
  uncollectible: { label: "Incobrável", tone: "error" },
  failed: { label: "Falhou", tone: "error" },
};

function PlanCard({ plan, interval, current, onChoose, loading }: { plan: PlanDto; interval: BillingInterval; current: boolean; onChoose: () => void; loading: boolean }) {
  const cents = interval === "year" ? plan.priceYearlyCents : plan.priceMonthlyCents;
  const custom = cents == null;
  return (
    <div
      data-testid={`plan-${plan.code}`}
      className={cn(
        "relative flex flex-col rounded-[18px] border bg-surface-1 p-5",
        plan.highlighted ? "border-[color-mix(in_oklab,var(--m-neon)_45%,transparent)]" : "border-line",
      )}
    >
      {plan.highlighted ? <Badge tone="violet" className="absolute right-4 top-4 h-5 text-[11px]">Mais escolhido</Badge> : null}
      <h3 className="text-[16px] font-semibold text-fg">{plan.name}</h3>
      <p className="mt-1 min-h-[40px] text-[13px] leading-relaxed text-subtle">{plan.tagline}</p>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="m-num text-[28px] font-semibold text-fg">{custom ? "Sob consulta" : formatCents(cents, plan.currency)}</span>
        {!custom ? <span className="text-[13px] text-subtle">/{interval === "year" ? "ano" : "mês"}</span> : null}
      </div>
      <p className="mt-1 text-[12px] text-subtle">
        {plan.provisional ? "Preço provisório — confirmado antes da cobrança." : ""} {plan.trialDays ? `${plan.trialDays} dias de teste.` : ""}
      </p>
      <ul className="mt-4 flex-1 space-y-1.5">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2 text-[13px] text-muted">
            <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> {f}
          </li>
        ))}
      </ul>
      <Button className="mt-5 w-full" variant={current ? "secondary" : plan.highlighted ? "primary" : "secondary"} disabled={current || custom} loading={loading} onClick={onChoose} data-testid={`choose-${plan.code}`}>
        {current ? "Plano atual" : custom ? "Fale com vendas" : "Escolher plano"}
      </Button>
    </div>
  );
}

export function BillingScreen() {
  const sp = useSearchParams();
  const me = useMe();
  const sub = useSubscription();
  const plans = usePlans();
  const invoices = useInvoices();
  const checkout = useCheckout();
  const cancel = useCancelSubscription();
  const portal = usePortal();
  const toast = useToast();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [pending, setPending] = useState<PlanCode | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const canManage = me.data?.role === "owner" || me.data?.role === "admin";
  const s = sub.data;
  const result = sp.get("checkout");

  async function choose(code: PlanCode) {
    setPending(code);
    try {
      const r = await checkout.mutateAsync({ planCode: code, interval });
      window.location.assign(r.url);
    } catch (e) {
      toast({ tone: "error", title: "Não foi possível iniciar o checkout", description: errorMessage(e) });
      setPending(null);
    }
  }

  return (
    <div>
      <PageIntro eyebrow="Faturamento" title="Assinatura e pagamentos" description="Você paga a maindy. separadamente do seu provedor de IA. Não revendemos cotas de Claude ou ChatGPT." />
      {result === "sucesso" ? (
        <div role="status" className="mb-4 rounded-[14px] border border-[color-mix(in_oklab,var(--m-success)_35%,transparent)] bg-[color-mix(in_oklab,var(--m-success)_8%,transparent)] px-4 py-3 text-[13.5px] text-fg">
          Pagamento confirmado. Sua assinatura já está ativa.
        </div>
      ) : result === "cancelado" ? (
        <div role="status" className="mb-4 rounded-[14px] border border-line bg-surface-2/60 px-4 py-3 text-[13.5px] text-muted">
          Checkout cancelado. Nada foi cobrado.
        </div>
      ) : null}

      <Card className="mb-6">
        {sub.isPending ? (
          <div className="p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-4 w-64" />
          </div>
        ) : sub.isError ? (
          <div className="p-5">
            <ErrorState message={errorMessage(sub.error)} onRetry={() => sub.refetch()} />
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6" data-testid="current-subscription">
            <div className="grid size-11 shrink-0 place-items-center rounded-[14px] border border-line-strong bg-surface-2">
              <CreditCard className="size-5 text-muted" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              {s ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-semibold text-fg">Plano {planName(s.planCode)}</span>
                    <Badge tone={s.status === "active" || s.status === "trialing" ? "success" : s.status === "past_due" ? "warning" : "neutral"} dot>
                      {statusName(s.status)}
                    </Badge>
                    {s.provider === "sandbox" ? <Badge tone="gold">Ambiente de testes</Badge> : null}
                  </div>
                  <p className="mt-1 text-[13px] text-subtle">
                    {s.interval === "year" ? "Cobrança anual" : "Cobrança mensal"}
                    {s.trialEndsAt ? ` · teste até ${formatDate(s.trialEndsAt)}` : ""}
                    {s.currentPeriodEnd ? ` · ${s.cancelAtPeriodEnd ? "encerra em" : "renova em"} ${formatDate(s.currentPeriodEnd)}` : ""}
                  </p>
                </>
              ) : (
                <>
                  <span className="text-[16px] font-semibold text-fg">Nenhuma assinatura ativa</span>
                  <p className="mt-1 text-[13px] text-subtle">Escolha um plano abaixo. Você vê o valor final antes de confirmar.</p>
                </>
              )}
            </div>
            {s && canManage ? (
              <div className="flex flex-wrap gap-2">
                {s.provider === "stripe" ? (
                  <Button variant="secondary" size="sm" loading={portal.isPending} onClick={() => portal.mutate(undefined, { onSuccess: (r) => window.location.assign(r.url), onError: (e) => toast({ tone: "error", title: "Portal indisponível", description: errorMessage(e) }) })}>
                    Gerenciar pagamento <ExternalLink className="size-3.5" aria-hidden />
                  </Button>
                ) : null}
                {!s.cancelAtPeriodEnd && (s.status === "active" || s.status === "trialing") ? (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)}>
                    Cancelar assinatura
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-fg">{s ? "Trocar de plano" : "Planos"}</h2>
        <Segmented label="Intervalo de cobrança" value={interval} onChange={setInterval} options={[{ value: "month", label: "Mensal" }, { value: "year", label: "Anual" }]} />
      </div>
      {plans.isPending ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} lines={6} />
          ))}
        </div>
      ) : plans.isError ? (
        <ErrorState message={errorMessage(plans.error)} onRetry={() => plans.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.data.map((p) => (
            <PlanCard key={p.code} plan={p} interval={interval} current={!!s && s.planCode === p.code && s.status !== "canceled" && !s.cancelAtPeriodEnd} loading={pending === p.code} onChoose={() => (canManage ? choose(p.code) : toast({ tone: "info", title: "Somente owner ou admin podem alterar o plano." }))} />
          ))}
        </div>
      )}
      <p className="mt-3 flex items-start gap-2 text-[12.5px] text-subtle">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Valores provisórios, em validação comercial. Impostos aplicáveis aparecem no checkout.
      </p>

      <Card className="mt-8">
        <CardHeader title="Faturas" description="Histórico de cobranças da organização." />
        <div className="mt-4 border-t border-line">
          {invoices.isPending ? (
            <div className="p-5">
              <Skeleton className="h-4 w-full" />
            </div>
          ) : invoices.isError ? (
            <div className="p-5">
              <ErrorState message={errorMessage(invoices.error)} onRetry={() => invoices.refetch()} compact />
            </div>
          ) : invoices.data.length === 0 ? (
            <EmptyState icon={<FileText />} title="Nenhuma fatura ainda" description="As faturas aparecem aqui depois do primeiro pagamento." className="py-10" />
          ) : (
            <div className="m-scroll-thin overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead className="text-left text-subtle">
                  <tr className="border-b border-line">
                    <th className="px-5 py-2.5 font-medium">Data</th>
                    <th className="px-3 py-2.5 font-medium">Descrição</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.map((inv) => {
                    const st = invoiceStatus[inv.status] ?? { label: inv.status, tone: "neutral" as const };
                    const amount = inv.amountCents ?? inv.totalCents ?? inv.amountDueCents ?? null;
                    const link = inv.hostedUrl ?? inv.url ?? inv.pdfUrl;
                    return (
                      <tr key={inv.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-3 text-muted">{formatDate(inv.createdAt ?? inv.issuedAt)}</td>
                        <td className="px-3 py-3 text-fg">
                          {String(inv.description ?? inv.number ?? "Assinatura maindy.")}
                          {inv.simulated ? <Badge tone="gold" className="ml-2 h-5 text-[10.5px]">simulada</Badge> : null}
                          {link ? (
                            <a href={link} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-subtle hover:text-fg">
                              ver <ExternalLink className="size-3" aria-hidden />
                            </a>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td className="m-num px-5 py-3 text-right text-fg">{amount == null ? "—" : formatCents(amount, inv.currency ?? "BRL")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar assinatura?"
        description={`O acesso continua até ${s?.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : "o fim do período atual"}. Depois disso, o ORBIT volta ao modo Observar e os relatórios continuam disponíveis para exportação.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Manter plano
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmCancel(false);
                    toast({ tone: "success", title: "Cancelamento agendado para o fim do período" });
                  },
                  onError: (e) => toast({ tone: "error", title: "Não foi possível cancelar", description: errorMessage(e) }),
                })
              }
            >
              Cancelar assinatura
            </Button>
          </>
        }
      />
    </div>
  );
}
