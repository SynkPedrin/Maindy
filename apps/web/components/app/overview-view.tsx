"use client";
import Link from "next/link";
import { ArrowUpRight, CircleDollarSign, Coins, ShieldCheck, Sparkles, TrendingDown } from "lucide-react";
import type { PlanDto, SavingsSummary, SubscriptionDto } from "@maindy/contracts";
import type { RunDto, TimeseriesPoint } from "@/lib/api/schemas";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MeasurementBadge } from "@/components/ui/measurement-badge";
import { ComparisonChart } from "./comparison-chart";
import { MetricCard } from "./metric-card";
import { RunsList } from "./runs-list";
import { formatMoney, formatPercent, formatTokens, formatNumber } from "./format";

export interface RoiInput {
  subscription: SubscriptionDto | null;
  plan: PlanDto | undefined;
  monthFraction: number;
}

/** customer_net_benefit = net_savings − subscription allocated to the period (ARCHITECTURE §6). */
export function computeRoi(summary: SavingsSummary, roi: RoiInput): { micros: number; note: string } | { unavailable: string } {
  const hasBaseline = summary.baselineCoverage > 0 && summary.baselineCost.source !== "unavailable" && summary.baselineCost.micros > 0;
  if (!hasBaseline) return { unavailable: "Sem baseline válido no período — não dá para calcular o retorno." };
  const net = summary.netSavings.micros;
  const sub = roi.subscription;
  if (!sub || sub.status === "canceled" || sub.status === "none") return { micros: net, note: "Sem assinatura ativa no período: benefício = economia líquida." };
  if (sub.status === "trialing") return { micros: net, note: "Período de teste: nenhuma cobrança rateada." };
  if (!roi.plan) return { unavailable: "Preço do plano indisponível para ratear a assinatura." };
  const cents = sub.interval === "year" ? (roi.plan.priceYearlyCents ?? null) : roi.plan.priceMonthlyCents;
  if (cents == null) return { unavailable: "Plano sob consulta — informe o valor contratado para calcular." };
  if (roi.plan.currency !== summary.currency) {
    return {
      unavailable: `A economia é medida em ${summary.currency} e a assinatura é cobrada em ${roi.plan.currency}. Sem uma taxa de câmbio com fonte e data, não convertemos.`,
    };
  }
  const monthlyCents = sub.interval === "year" ? cents / 12 : cents;
  const allocatedMicros = Math.round(monthlyCents * 10_000 * roi.monthFraction);
  return { micros: net - allocatedMicros, note: `Economia líquida − ${formatMoney(allocatedMicros, summary.currency)} de assinatura rateada no período.` };
}

export function OverviewView({
  summary,
  series,
  runs,
  roi,
  bucket,
  demo,
  now,
}: {
  summary: SavingsSummary;
  series: TimeseriesPoint[] | undefined;
  runs: RunDto[] | undefined;
  roi: RoiInput;
  bucket: "hour" | "day";
  demo?: boolean;
  now?: number;
}) {
  const cur = summary.currency;
  const hasBaseline = summary.baselineCoverage > 0 && summary.baselineCost.source !== "unavailable";
  const passRate = summary.quality.evaluations > 0 ? summary.quality.passed / summary.quality.evaluations : null;
  const roiResult = computeRoi(summary, roi);
  const runsHref = demo ? undefined : "/app/economia";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <MetricCard
          testId="metric-net-savings"
          emphasis
          className="col-span-2 xl:col-span-1"
          icon={<TrendingDown />}
          label="Economia líquida"
          source={summary.netSavings.source}
          value={formatMoney(summary.netSavings.micros, cur)}
          unavailable={hasBaseline ? null : "Ainda sem baseline válido. Rode o modo Observar para medir."}
          sub={summary.efficiencyMultiplier ? `${summary.efficiencyMultiplier.toLocaleString("pt-BR")}× eficiência · cobertura de baseline ${formatPercent(summary.baselineCoverage)}` : `Cobertura de baseline ${formatPercent(summary.baselineCoverage)}`}
        />
        <MetricCard
          testId="metric-tokens-avoided"
          icon={<Coins />}
          label="Tokens evitados"
          source={summary.tokens.avoidedSource}
          value={formatTokens(summary.tokens.avoided)}
          unavailable={summary.tokens.avoidedSource === "unavailable" ? "Nenhuma técnica mediu tokens evitados no período." : null}
          sub={summary.tokens.avoidedSource === "experimentally_estimated" ? "Estimativa contra baseline" : "Medição local do gateway"}
        />
        <MetricCard
          testId="metric-real-cost"
          icon={<CircleDollarSign />}
          label="Custo real"
          source={summary.optimizedAiCost.source}
          value={formatMoney(summary.optimizedAiCost.micros + summary.overheadCost.micros, cur)}
          sub={`IA ${formatMoney(summary.optimizedAiCost.micros, cur)} + overhead ${formatMoney(summary.overheadCost.micros, cur)} · ${formatNumber(summary.requests)} req.`}
        />
        <MetricCard
          testId="metric-quality"
          icon={<ShieldCheck />}
          label="Qualidade aprovada"
          source="locally_measured"
          value={passRate == null ? "—" : formatPercent(passRate, 1)}
          unavailable={passRate == null ? "Nenhuma avaliação do Quality Guard no período." : null}
          sub={`${formatNumber(summary.quality.passed)} de ${formatNumber(summary.quality.evaluations)} avaliações · ${summary.quality.rollbacks} rollback(s)`}
        />
        <MetricCard
          testId="metric-roi"
          icon={<Sparkles />}
          label="ROI da assinatura"
          source="experimentally_estimated"
          value={"micros" in roiResult ? formatMoney(roiResult.micros, cur) : ""}
          unavailable={"unavailable" in roiResult ? roiResult.unavailable : null}
          sub={"note" in roiResult ? roiResult.note : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Baseline vs. otimizado"
            description="Quanto as mesmas requisições custariam sem a maindy., comparado ao custo real. Só entram requisições com baseline válido."
          />
          <div className="p-5 pt-4">
            {series && series.length ? (
              <ComparisonChart series={series} currency={cur} bucket={bucket} />
            ) : (
              <EmptyState title="Sem pontos no período" description="Ainda não há séries temporais para este intervalo." className="py-14" />
            )}
          </div>
        </Card>
        <Card className="flex flex-col">
          <CardHeader
            title="Últimas operações"
            description="Metadados das requisições — o conteúdo dos prompts nunca sai da sua máquina."
            action={
              runsHref ? (
                <Link href={runsHref} className="inline-flex items-center gap-1 text-[12.5px] text-subtle hover:text-fg">
                  Ver tudo <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              ) : null
            }
          />
          <div className="mt-3 flex-1 border-t border-line">
            {runs && runs.length ? (
              <RunsList runs={runs.slice(0, 6)} now={now} />
            ) : (
              <EmptyState title="Nenhuma operação" description="As requisições aparecem aqui assim que o gateway enviar telemetria." className="py-10" />
            )}
          </div>
        </Card>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-[12px] text-subtle">
        Método {summary.methodVersion} · cache {formatNumber(summary.cache.hits)} acertos / {formatNumber(summary.cache.misses)} faltas
        <MeasurementBadge source="locally_measured" compact />
      </p>
    </div>
  );
}
