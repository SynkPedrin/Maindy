"use client";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { usePeriod, usePolicy, useQualityEvaluations } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { PageIntro } from "../page-intro";
import { MetricCard } from "../metric-card";
import { formatDateTime, formatPercent, techniqueLabel } from "../format";

const methodLabel: Record<string, { label: string; body: string }> = {
  exact_match: { label: "Igualdade exata", body: "A resposta otimizada é idêntica à original (cache e deduplicação determinísticos)." },
  schema_valid: { label: "Esquema válido", body: "A saída continua respeitando o formato esperado (JSON, tool calls, contratos)." },
  test_suite: { label: "Suíte de testes", body: "Para código: testes, linters e build continuam passando." },
  reference_similarity: { label: "Similaridade com referência", body: "A resposta mantém o conteúdo da resposta de referência acima do limiar definido." },
  human_review: { label: "Revisão humana", body: "Amostra revisada por alguém do time, quando configurado." },
};

export function QualityScreen() {
  const period = usePeriod();
  const q = useQualityEvaluations(period);
  const policy = usePolicy();
  const evals = q.data ?? [];
  const passed = evals.filter((e) => e.passed).length;
  const rate = evals.length ? passed / evals.length : null;
  const triggered = evals.filter((e) => e.triggeredRollback).length;
  const rolledBack = policy.data?.techniques.filter((t) => t.rolledBack) ?? [];

  return (
    <div>
      <PageIntro
        eyebrow="Qualidade"
        title="Quality Guard"
        description="Qualidade é um portão, não um gráfico decorativo: técnicas que causam regressão são revertidas automaticamente e a requisição segue original."
      />
      {q.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Taxa de aprovação" icon={<ShieldCheck />} value={rate == null ? "" : formatPercent(rate, 1)} unavailable={rate == null ? "Nenhuma avaliação no período." : null} source="locally_measured" sub={`${passed} de ${evals.length} avaliações`} />
          <MetricCard label="Avaliações" value={String(evals.length)} source="locally_measured" sub={period.label} />
          <MetricCard label="Rollbacks disparados" value={String(triggered)} source="locally_measured" sub={`${rolledBack.length} técnica(s) revertida(s) agora`} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Avaliações recentes" description="Comparações em modo sombra entre a resposta otimizada e a original." />
          <div className="mt-4 border-t border-line">
            {q.isPending ? null : evals.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck />}
                title="Sem avaliações no período"
                description="O Quality Guard só avalia quando há técnicas ativas e amostragem de qualidade maior que zero."
                className="py-10"
              >
                <ButtonLink href="/app/orbit" variant="secondary" size="sm">
                  Ajustar amostragem
                </ButtonLink>
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {evals.slice(0, 50).map((e, i) => (
                  <li key={e.evaluationId ?? e.id ?? i} className="flex items-start gap-3 px-5 py-3">
                    {e.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="aprovada" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-error" aria-label="reprovada" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] text-fg">
                        {techniqueLabel[e.technique] ?? e.technique} <span className="text-subtle">· {methodLabel[e.method]?.label ?? e.method}</span>
                      </p>
                      <p className="truncate text-[12px] text-subtle">
                        {formatDateTime(e.occurredAt)}
                        {e.projectKey ? ` · ${e.projectKey}` : ""}
                        {e.score != null ? ` · score ${e.score.toFixed(2)}` : ""}
                        {e.detail ? ` · ${e.detail}` : ""}
                      </p>
                    </div>
                    {e.triggeredRollback ? <Badge tone="warning" className="h-5 text-[11px]">rollback</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Técnicas revertidas" description="Bloqueadas até você reativar no ORBIT Engine." />
            <div className="p-5">
              {policy.isPending ? null : rolledBack.length === 0 ? (
                <p className="text-[13px] text-subtle">Nenhuma técnica revertida.</p>
              ) : (
                <ul className="space-y-3">
                  {rolledBack.map((t) => (
                    <li key={t.name} className="rounded-[12px] border border-[color-mix(in_oklab,var(--m-warning)_30%,transparent)] p-3 text-[13px]">
                      <p className="font-medium text-fg">{techniqueLabel[t.name]}</p>
                      <p className="mt-0.5 text-subtle">{t.rolledBackReason ?? "Regressão detectada"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Critérios de aceite" description="Como uma otimização é aprovada." />
            <dl className="space-y-3 p-5">
              {Object.entries(methodLabel).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[13px] font-medium text-fg">{v.label}</dt>
                  <dd className="text-[12.5px] leading-relaxed text-subtle">{v.body}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
