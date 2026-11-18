import { CreditCard, ExternalLink } from "lucide-react";
import { bridge } from "../../bridge";
import { useAction, type Dash } from "../../data";
import type { MeDto } from "../../types";
import { ActionMsg, Btn, Card, Empty, ErrorLine, StatusDot, ago } from "../../ui";

type Sub = NonNullable<MeDto["subscription"]>;

const planName: Record<string, string> = { starter: "Starter", pro: "Pro", master_economy: "Master Economy" };

const statusInfo: Record<Sub["status"], { label: string; tone: "ok" | "warn" | "error" | "idle" | "violet" }> = {
  none: { label: "Sem assinatura", tone: "idle" },
  trialing: { label: "Em período de teste", tone: "violet" },
  active: { label: "Ativa", tone: "ok" },
  past_due: { label: "Pagamento pendente", tone: "warn" },
  canceled: { label: "Cancelada", tone: "error" },
  incomplete: { label: "Incompleta", tone: "warn" },
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—");

export function Billing({ d }: { d: Dash }) {
  const sub = d.me.data?.subscription ?? null;
  const role = d.me.data?.role;
  const open = useAction();
  const canManage = role === "owner" || role === "admin";
  return (
    <div className="stack">
      {d.me.error && <ErrorLine message={`Assinatura indisponível: ${d.me.error}`} />}
      <Card title="Assinatura">
        {sub ? (
          <div className="billing">
            <div className="billing-hero">
              <span className="billing-plan">{planName[sub.planCode] ?? sub.planCode}</span>
              <span className="chip">
                <StatusDot tone={statusInfo[sub.status].tone} />
                {statusInfo[sub.status].label}
              </span>
              {sub.provider === "sandbox" && <span className="chip chip-sm chip-sandbox">ambiente de testes — pagamento simulado</span>}
            </div>
            <dl className="billing-facts">
              <dt>Cobrança</dt>
              <dd data-k="Cobrança">{sub.interval === "year" ? "Anual" : "Mensal"}</dd>
              {sub.status === "trialing" && (
                <>
                  <dt>Teste termina</dt>
                  <dd data-k="Teste termina">
                    {fmt(sub.trialEndsAt)} {sub.trialEndsAt && <span className="muted">({ago(sub.trialEndsAt)})</span>}
                  </dd>
                </>
              )}
              <dt>{sub.cancelAtPeriodEnd || sub.status === "canceled" ? "Acesso até" : "Próxima renovação"}</dt>
              <dd data-k={sub.cancelAtPeriodEnd || sub.status === "canceled" ? "Acesso até" : "Próxima renovação"}>
                {fmt(sub.currentPeriodEnd)} {sub.currentPeriodEnd && <span className="muted">({ago(sub.currentPeriodEnd)})</span>}
              </dd>
            </dl>
            {sub.cancelAtPeriodEnd && sub.status !== "canceled" && <p className="warn-text">A assinatura foi cancelada e não será renovada no fim do período.</p>}
            {sub.status === "past_due" && <p className="warn-text">O último pagamento não foi concluído. Atualize a forma de pagamento no navegador para não perder o acesso.</p>}
          </div>
        ) : (
          <Empty icon={<CreditCard size={20} />} title={d.loading ? "Carregando…" : "Nenhuma assinatura ativa"}>
            {!d.loading && "Escolha um plano no painel web. Sem assinatura, a conta fica limitada a 1 dispositivo."}
          </Empty>
        )}
        <p className="muted">
          Pagamentos, faturas e mudança de plano acontecem no navegador, na sessão segura do painel web — este app não processa nem guarda dados de pagamento.
          {!canManage && role ? " Seu papel nesta organização não permite alterar a assinatura; peça a um administrador." : ""}
        </p>
        <div className="row">
          <Btn kind="primary" busy={open.busy} icon={<ExternalLink size={15} aria-hidden />} onClick={() => void open.run(() => bridge().openWeb("billing"), "Faturamento aberto no navegador.")}>
            {sub ? "Gerenciar no navegador" : "Escolher um plano"}
          </Btn>
        </div>
        <ActionMsg s={open} />
      </Card>
    </div>
  );
}
