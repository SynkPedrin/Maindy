"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Download, Eye, Plug, Activity } from "lucide-react";
import type { OnboardingStep } from "@maindy/contracts";
import { useMe, usePeriod, usePlans, useRuns, useSummary, useTimeseries } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { DemoFrame } from "@/components/ui/demo-frame";
import { ErrorState } from "@/components/ui/empty-state";
import { SkeletonCard, Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { OverviewView } from "../overview-view";
import { demoRuns, demoSeries, demoSummary } from "../demo-fixtures";

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const NEXT_STEPS: { step: OnboardingStep[]; title: string; body: string; href: string; cta: string; icon: typeof Download }[] = [
  { step: ["app_downloaded", "device_paired"], title: "Instale o app e pareie", body: "O gateway local roda na sua máquina e mede cada requisição sem enviar prompts.", href: "/app/download", cta: "Baixar o app", icon: Download },
  { step: ["connector_added"], title: "Conecte uma fonte", body: "API OpenAI/Anthropic (BYOK), Claude Code, Codex ou agentes locais.", href: "/app/conexoes", cta: "Ver integrações", icon: Plug },
  { step: ["baseline_started"], title: "Comece em modo Observar", body: "Medimos o baseline real antes de ativar qualquer otimização.", href: "/app/orbit", cta: "Abrir ORBIT", icon: Activity },
];

export function OverviewScreen() {
  const period = usePeriod();
  const me = useMe();
  const summary = useSummary(period);
  const series = useTimeseries(period);
  const runs = useRuns(8);
  const plans = usePlans();
  const [demo, setDemo] = useState(false);
  const demoData = useMemo(() => {
    const s = demoSeries(period.bucket === "hour" ? 14 : Math.min(30, Math.max(7, Math.round(period.monthFraction * 30))));
    return { series: s, summary: demoSummary(s), runs: demoRuns() };
  }, [period.bucket, period.monthFraction]);

  const first = me.data?.user.name.split(" ")[0] ?? "";
  const sub = me.data?.subscription ?? null;
  const plan = plans.data?.find((p) => p.code === sub?.planCode);
  const empty = summary.data ? summary.data.requests === 0 : false;
  const completed = me.data?.onboarding.completed ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-subtle">{period.label}</p>
          <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
            {greeting()}
            {first ? `, ${first}` : ""}.
          </h2>
        </div>
      </div>

      {summary.isPending ? (
        <div className="flex flex-col gap-4" aria-busy>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_1fr]">
            <Skeleton className="h-[340px] rounded-[18px]" />
            <Skeleton className="h-[340px] rounded-[18px]" />
          </div>
        </div>
      ) : summary.isError ? (
        <ErrorState message={errorMessage(summary.error)} onRetry={() => summary.refetch()} />
      ) : empty ? (
        <div className="flex flex-col gap-5">
          <Card className="overflow-hidden" data-testid="overview-empty">
            <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_1.35fr]">
              <div className="relative border-b border-line p-6 sm:p-8 lg:border-b-0 lg:border-r">
                <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--m-neon)_16%,transparent),transparent)]" />
                <div className="m-label mb-3">Sem dados no período</div>
                <h3 className="text-[20px] font-semibold leading-snug tracking-[-0.02em] text-fg">Ainda não há requisições medidas.</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-muted">
                  Não mostramos números até existir medição real. Assim que o gateway enviar a primeira telemetria, este painel exibe economia, custos e qualidade — cada valor com a sua origem.
                </p>
                <label className="mt-6 flex w-fit cursor-pointer items-center gap-3 rounded-[12px] border border-line bg-surface-2/60 px-3.5 py-2.5 text-[13px] text-muted">
                  <Switch checked={demo} onCheckedChange={setDemo} aria-label="Ver demonstração" data-testid="demo-toggle" />
                  <Eye className="size-4 text-subtle" aria-hidden />
                  Ver demonstração
                </label>
              </div>
              <ol className="divide-y divide-line">
                {NEXT_STEPS.map((s, i) => {
                  const done = s.step.every((x) => completed.includes(x));
                  const Icon = s.icon;
                  return (
                    <li key={s.href} className="flex items-start gap-4 p-5 sm:px-7">
                      <span
                        className={cn(
                          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-[12px] border text-[13px] font-semibold",
                          done ? "border-[color-mix(in_oklab,var(--m-success)_40%,transparent)] bg-[color-mix(in_oklab,var(--m-success)_12%,transparent)] text-success" : "border-line-strong bg-surface-2 text-muted",
                        )}
                        aria-hidden
                      >
                        {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium text-fg">
                          <span className="sr-only">Passo {i + 1}{done ? " (concluído)" : ""}: </span>
                          {s.title}
                        </p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-subtle">{s.body}</p>
                      </div>
                      <Link href={s.href} className="mt-1 inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-fg hover:text-[color-mix(in_oklab,var(--m-purple)_70%,white)]">
                        <span className="hidden sm:inline">{s.cta}</span> <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          </Card>
          {demo ? (
            <DemoFrame note="Valores ilustrativos gerados no navegador; não representam sua conta.">
              <OverviewView
                demo
                summary={demoData.summary}
                series={demoData.series}
                runs={demoData.runs}
                bucket="day"
                roi={{
                  subscription: { id: "demo", planCode: "pro", status: "active", interval: "month", provider: "sandbox", currentPeriodEnd: null, cancelAtPeriodEnd: false, trialEndsAt: null },
                  plan: { code: "pro", name: "Pro", tagline: "", priceMonthlyCents: 2900, priceYearlyCents: null, currency: "USD", provisional: true, trialDays: 0, limits: { environments: 3, projects: null, seats: null, devices: null }, features: [], highlighted: false },
                  monthFraction: demoData.series.length / 30,
                }}
              />
            </DemoFrame>
          ) : null}
        </div>
      ) : (
        <OverviewView
          summary={summary.data!}
          series={series.data}
          runs={runs.data?.items}
          bucket={period.bucket}
          roi={{ subscription: sub, plan, monthFraction: period.monthFraction }}
        />
      )}
      {!empty && !summary.isPending && !summary.isError && (series.isError || runs.isError) ? (
        <ErrorState className="mt-4" compact message={errorMessage(series.error ?? runs.error)} onRetry={() => (series.refetch(), runs.refetch())} />
      ) : null}
    </div>
  );
}
