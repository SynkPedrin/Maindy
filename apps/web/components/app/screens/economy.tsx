"use client";
import { useMemo, useState } from "react";
import { PiggyBank } from "lucide-react";
import type { MeasurementSource } from "@maindy/contracts";
import { usePeriod, useRunsInPeriod, useSummary } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import type { RunDto } from "@/lib/api/schemas";
import { Card, CardHeader } from "@/components/ui/card";
import { DemoFrame } from "@/components/ui/demo-frame";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { MeasurementBadge } from "@/components/ui/measurement-badge";
import { Segmented } from "@/components/ui/segmented";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageIntro } from "../page-intro";
import { BreakdownBars, type BreakdownRow } from "../breakdown-bars";
import { MetricCard } from "../metric-card";
import { demoModelBreakdown, demoProjectBreakdown, demoRuns, demoTechniqueBreakdown } from "../demo-fixtures";
import { connectorKindLabel, formatDateTime, formatMoney, formatPercent, formatTokens, runStatusLabel, techniqueLabel } from "../format";

type Dim = "technique" | "model" | "project";

function net(r: RunDto): number | null {
  if (!r.baselineCost || !r.cost || r.baselineMethod === "none") return null;
  return r.baselineCost.micros - r.cost.micros - (r.overheadCost?.micros ?? 0);
}

function breakdown(runs: RunDto[], dim: Dim): BreakdownRow[] {
  const m = new Map<string, { value: number; count: number }>();
  for (const r of runs) {
    if (dim === "technique") {
      for (const t of r.techniques ?? []) {
        if (t.applied === false) continue;
        const cur = m.get(t.name) ?? { value: 0, count: 0 };
        cur.value += t.tokensSaved ?? 0;
        cur.count++;
        m.set(t.name, cur);
      }
    } else {
      const n = net(r);
      if (n == null) continue;
      const key = (dim === "model" ? r.model : r.projectKey) ?? "sem projeto";
      const cur = m.get(key) ?? { value: 0, count: 0 };
      cur.value += n;
      cur.count++;
      m.set(key, cur);
    }
  }
  return [...m.entries()]
    .map(([key, v]) => ({ key, label: dim === "technique" ? techniqueLabel[key] ?? key : key, value: v.value, secondary: `${v.count} req.` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function Ledger({ runs, currency }: { runs: RunDto[]; currency: string }) {
  return (
    <div className="m-scroll-thin overflow-x-auto">
      <table className="w-full min-w-[860px] text-[12.5px]">
        <caption className="sr-only">Livro de economia por operação</caption>
        <thead className="text-left text-subtle">
          <tr className="border-b border-line">
            <th className="px-5 py-2.5 font-medium">Quando</th>
            <th className="px-3 py-2.5 font-medium">Modelo / fonte</th>
            <th className="px-3 py-2.5 font-medium">Método</th>
            <th className="px-3 py-2.5 text-right font-medium">Baseline</th>
            <th className="px-3 py-2.5 text-right font-medium">Custo real</th>
            <th className="px-3 py-2.5 text-right font-medium">Overhead</th>
            <th className="px-5 py-2.5 text-right font-medium">Líquido</th>
          </tr>
        </thead>
        <tbody>
          {runs.slice(0, 50).map((r, i) => {
            const n = net(r);
            return (
              <tr key={r.eventId ?? r.id ?? i} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-5 py-2.5 text-muted">{formatDateTime(r.occurredAt)}</td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-fg">{r.model}</span>
                  <span className="block text-[11.5px] text-subtle">
                    {r.connector ? connectorKindLabel[r.connector] ?? r.connector : r.provider} · {runStatusLabel[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[11.5px] text-subtle">{r.baselineMethod ?? "—"}</td>
                <td className="m-num px-3 py-2.5 text-right">
                  {r.baselineCost ? (
                    <span className="inline-flex items-center gap-1.5">
                      {formatMoney(r.baselineCost.micros, currency)} <MeasurementBadge source={r.baselineCost.source} compact />
                    </span>
                  ) : (
                    <span className="text-subtle">indisponível</span>
                  )}
                </td>
                <td className="m-num px-3 py-2.5 text-right">
                  {r.cost ? (
                    <span className="inline-flex items-center gap-1.5">
                      {formatMoney(r.cost.micros, currency)} <MeasurementBadge source={r.cost.source} compact />
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="m-num px-3 py-2.5 text-right text-muted">{r.overheadCost ? formatMoney(r.overheadCost.micros, currency) : "—"}</td>
                <td className={`m-num px-5 py-2.5 text-right ${n != null && n > 0 ? "text-success" : "text-muted"}`}>{n == null ? "—" : formatMoney(n, currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EconomyBody({ runs, currency, dim, setDim, totals }: { runs: RunDto[]; currency: string; dim: Dim; setDim: (d: Dim) => void; totals: { net: number; gross: number; baseline: number; coverage: number; source: MeasurementSource; tokens: number; tokensSource: MeasurementSource } | null }) {
  const rows = useMemo(() => breakdown(runs, dim), [runs, dim]);
  return (
    <div className="flex flex-col gap-4">
      {totals ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <MetricCard label="Economia líquida" emphasis value={formatMoney(totals.net, currency)} source={totals.source} sub="baseline − (custo IA + overhead)" />
          <MetricCard label="Economia bruta" value={formatMoney(totals.gross, currency)} source={totals.source} sub="baseline − custo IA" />
          <MetricCard label="Baseline do período" value={formatMoney(totals.baseline, currency)} source={totals.source} sub={`Cobertura ${formatPercent(totals.coverage)} das requisições`} />
          <MetricCard label="Tokens evitados" value={formatTokens(totals.tokens)} source={totals.tokensSource} sub="Somados das técnicas aplicadas" />
        </div>
      ) : null}
      <Card>
        <CardHeader
          title="De onde vem a economia"
          description={dim === "technique" ? "Tokens evitados por técnica (medição local). Uma requisição pode usar mais de uma técnica." : "Economia líquida por requisição com baseline válido."}
          action={
            <Segmented
              size="sm"
              label="Agrupar por"
              value={dim}
              onChange={setDim}
              options={[
                { value: "technique", label: "Técnica" },
                { value: "model", label: "Modelo" },
                { value: "project", label: "Projeto" },
              ]}
            />
          }
        />
        <div className="p-5">
          <BreakdownBars rows={rows} kind={dim === "technique" ? "tokens" : "money"} currency={currency} source={dim === "technique" ? "locally_measured" : "experimentally_estimated"} emptyText="Nenhuma operação com dados para este agrupamento." />
        </div>
      </Card>
      <Card>
        <CardHeader title="Livro de economia" description="Cada linha é uma operação, com o método do baseline e a origem de cada valor. Mostra até 50 operações; exporte o período completo em Relatórios." />
        <div className="mt-4 border-t border-line">
          {runs.length ? <Ledger runs={runs} currency={currency} /> : <EmptyState title="Sem operações no período" className="py-8" />}
        </div>
      </Card>
    </div>
  );
}

export function EconomyScreen() {
  const period = usePeriod();
  const summary = useSummary(period);
  const runs = useRunsInPeriod(period);
  const [dim, setDim] = useState<Dim>("technique");
  const [demo, setDemo] = useState(false);
  const demoRunsData = useMemo(() => demoRuns(), []);

  const s = summary.data;
  const empty = s ? s.requests === 0 : false;

  return (
    <div>
      <PageIntro
        eyebrow="Economia"
        title="Economia verificável"
        description="Só contamos economia onde existe baseline válido (replay de cache, tokens antes da otimização ou amostras pareadas). Descontos nativos do provedor não entram como economia da maindy."
      />
      {summary.isPending || runs.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
          <SkeletonCard lines={8} className="sm:col-span-2 xl:col-span-4" />
        </div>
      ) : summary.isError || runs.isError ? (
        <ErrorState message={errorMessage(summary.error ?? runs.error)} onRetry={() => (summary.refetch(), runs.refetch())} />
      ) : empty ? (
        <div className="flex flex-col gap-5">
          <Card>
            <EmptyState
              icon={<PiggyBank />}
              title="Nenhuma economia medida neste período"
              description="Quando o gateway enviar operações com baseline válido, o detalhamento por técnica, modelo e projeto aparece aqui."
            >
              <label className="flex cursor-pointer items-center gap-3 text-[13px] text-muted">
                <Switch checked={demo} onCheckedChange={setDemo} aria-label="Ver demonstração" /> Ver demonstração
              </label>
            </EmptyState>
          </Card>
          {demo ? (
            <DemoFrame>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {[
                  { t: "Por técnica", rows: demoTechniqueBreakdown.map((r) => ({ key: r.key, label: techniqueLabel[r.key] ?? r.key, value: r.savingsMicros })) },
                  { t: "Por modelo", rows: demoModelBreakdown.map((r) => ({ key: r.key, label: r.key, value: r.savingsMicros })) },
                  { t: "Por projeto", rows: demoProjectBreakdown.map((r) => ({ key: r.key, label: r.key, value: r.savingsMicros })) },
                ].map((g) => (
                  <Card key={g.t}>
                    <CardHeader title={g.t} />
                    <div className="p-5">
                      <BreakdownBars rows={g.rows} kind="money" source="experimentally_estimated" emptyText="" />
                    </div>
                  </Card>
                ))}
              </div>
              <Card className="mt-4">
                <CardHeader title="Livro de economia" />
                <div className="mt-4 border-t border-line">
                  <Ledger runs={demoRunsData} currency="USD" />
                </div>
              </Card>
            </DemoFrame>
          ) : null}
        </div>
      ) : (
        <>
          <EconomyBody
            runs={runs.data!.items}
            currency={s!.currency}
            dim={dim}
            setDim={setDim}
            totals={{ net: s!.netSavings.micros, gross: s!.grossSavings.micros, baseline: s!.baselineCost.micros, coverage: s!.baselineCoverage, source: s!.netSavings.source, tokens: s!.tokens.avoided, tokensSource: s!.tokens.avoidedSource }}
          />
          {runs.data!.truncated ? <p className="mt-3 text-[12px] text-subtle">O detalhamento considera as operações mais recentes do período; exporte o relatório para o conjunto completo.</p> : null}
        </>
      )}
    </div>
  );
}
