"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ArrowRight, Check, ChevronDown, LifeBuoy } from "lucide-react";
import { OnboardingStep } from "@maindy/contracts";
import { useMe, useOnboarding, useUpdateOnboarding } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { OpenInAppButton } from "../open-in-app";
import { PageIntro } from "../page-intro";
import { planName } from "../shell";

interface StepDef {
  step: OnboardingStep;
  title: string;
  body: string;
  href?: string;
  cta?: string;
  /** only steps the API lets the client self-report (plan_selected, app_downloaded, baseline_started) */
  manual?: boolean;
  trouble: string[];
}

const STEPS: StepDef[] = [
  { step: "plan_selected", title: "Escolha o plano", body: "Starter, Pro ou Master Economy. Os preços atuais são provisórios e aparecem antes de qualquer cobrança.", href: "/app/faturamento?origem=onboarding", cta: "Ver planos", trouble: ["Escolheu na página de preços? O plano já vem marcado — confirme em Faturamento.", "Dúvidas sobre equipes e auditoria: o Master Economy é sob consulta."] },
  { step: "checkout_completed", title: "Pagamento ou período de teste", body: "Conclua o checkout. Neste ambiente o pagamento é simulado e rotulado como teste.", href: "/app/faturamento?origem=onboarding", cta: "Ir ao checkout", trouble: ["O checkout expirou? Volte a Faturamento e gere um novo.", "Pagamento pendente aparece como “pagamento pendente” no menu lateral."] },
  { step: "app_downloaded", title: "Baixe o app", body: "Instalador para macOS (Apple Silicon/Intel) ou Windows (x64/ARM64), com SHA-256 e status de assinatura.", href: "/app/download", cta: "Abrir downloads", manual: true, trouble: ["Seu sistema aparece como “Ainda não disponível”? Ainda não há build real para ele — não oferecemos links falsos.", "O macOS bloqueou a abertura? Clique direito → Abrir."] },
  { step: "device_paired", title: "Pareie o dispositivo", body: "O app mostra um código XXXX-XXXX. Aprove aqui no navegador — nenhuma senha é digitada no app.", trouble: ["O código expira em 10 minutos. Feche e abra o app para gerar outro.", "Aprovou e o app não reagiu? Confira a conexão com a internet e se o relógio do sistema está correto."] },
  { step: "connector_added", title: "Conecte uma fonte", body: "API BYOK, Claude Code, Codex ou agentes locais apontando para o gateway. O app abre direto na integração escolhida.", href: "/app/conexoes", cta: "Ver instruções", trouble: ["O status só muda quando o gateway confirma a conexão — não marcamos manualmente.", "Chave inválida aparece como “Atenção” com o motivo.", "O botão não abriu o app? Instale-o em Downloads e abra uma vez; depois os links maindy:// funcionam."] },
  { step: "baseline_started", title: "Inicie o baseline (modo Observar)", body: "Medimos uso e custo reais sem alterar nenhuma requisição.", href: "/app/orbit", cta: "Abrir ORBIT", manual: true, trouble: ["Sem requisições no Overview? Confira se o seu cliente usa a base URL http://127.0.0.1:8787/v1."] },
  { step: "orbit_activated", title: "Ative o ORBIT", body: "Escolha um modo, simule e confirme. O Quality Guard reverte técnicas com regressão.", href: "/app/orbit", cta: "Configurar", trouble: ["Recomendamos alguns dias em Observar antes de ativar, para o baseline ter cobertura.", "Algo estranho? “Pausar tudo agora” faz as requisições seguirem originais."] },
  { step: "first_report", title: "Gere o primeiro relatório", body: "Exporte CSV ou PDF com IDs de evento, versão de preço e método de cálculo.", href: "/app/relatorios", cta: "Abrir relatórios", trouble: ["Relatório vazio? Ele só inclui requisições do período selecionado."] },
];

function PairCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(code.trim());
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const c = code.trim().toUpperCase().replace(/^([A-Z0-9]{4})-?([A-Z0-9]{4})$/, "$1-$2");
    router.push(`/app/dispositivos/parear?code=${encodeURIComponent(c)}`);
  }
  return (
    <form onSubmit={submit} className="flex max-w-sm gap-2">
      <Input aria-label="Código de pareamento" placeholder="XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} className="h-9 font-mono uppercase tracking-widest" maxLength={9} />
      <Button type="submit" size="sm" className="h-9" disabled={!valid}>
        Continuar
      </Button>
    </form>
  );
}

const QUICK_SOURCES: { kind: "claude_code" | "codex" | "openai_api" | "anthropic_api"; label: string }[] = [
  { kind: "claude_code", label: "Claude Code" },
  { kind: "codex", label: "Codex" },
  { kind: "openai_api", label: "OpenAI API" },
  { kind: "anthropic_api", label: "Anthropic API" },
];

/** "Conectar fonte": open the desktop app right on the chosen integration (maindy://integrations/<kind>). */
function ConnectSourceActions() {
  const [kind, setKind] = useState<(typeof QUICK_SOURCES)[number]["kind"]>("claude_code");
  return (
    <div className="flex w-full flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Fonte">
        {QUICK_SOURCES.map((q) => (
          <button
            key={q.kind}
            type="button"
            role="radio"
            aria-checked={kind === q.kind}
            onClick={() => setKind(q.kind)}
            className={cn(
              "h-8 rounded-full border px-3 text-[12.5px] transition-colors",
              kind === q.kind ? "border-[color-mix(in_oklab,var(--m-neon)_60%,transparent)] bg-surface-2 text-fg" : "border-line text-subtle hover:text-fg",
            )}
          >
            {q.label}
          </button>
        ))}
      </div>
      <OpenInAppButton kind={kind} />
    </div>
  );
}

export function OnboardingScreen() {
  const q = useOnboarding();
  const me = useMe();
  const update = useUpdateOnboarding();
  const toast = useToast();
  const router = useRouter();

  if (q.isPending) return <SkeletonCard lines={10} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;

  const completed = q.data.completed;
  const total = OnboardingStep.options.length;
  const doneCount = OnboardingStep.options.filter((s) => completed.includes(s)).length;
  const firstOpen = STEPS.find((s) => !completed.includes(s.step))?.step;
  const pct = Math.round((doneCount / total) * 100);
  const sub = me.data?.subscription;

  return (
    <div>
      <PageIntro
        eyebrow="Onboarding"
        title={doneCount === total ? "Tudo pronto." : "Vamos colocar a maindy. para trabalhar"}
        description="Seu progresso fica salvo — pare quando quiser e retome de onde parou, em qualquer dispositivo."
        actions={
          doneCount < total && !q.data.dismissed ? (
            <Button
              variant="ghost"
              size="sm"
              loading={update.isPending && update.variables?.dismissed === true}
              onClick={() =>
                update.mutate(
                  { dismissed: true },
                  { onSuccess: () => router.push("/app/overview"), onError: (e) => toast({ tone: "error", title: "Não foi possível", description: errorMessage(e) }) },
                )
              }
            >
              Fazer depois
            </Button>
          ) : (
            <ButtonLink href="/app/overview" size="sm" variant="secondary">
              Ir para o Overview
            </ButtonLink>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <Accordion.Root type="single" collapsible defaultValue={firstOpen}>
            {STEPS.map((s, i) => {
              const done = completed.includes(s.step);
              return (
                <Accordion.Item key={s.step} value={s.step} className="border-b border-line last:border-0" data-testid={`step-${s.step}`} data-done={done || undefined}>
                  <Accordion.Header>
                    <Accordion.Trigger className="group flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface-2/40 sm:px-6">
                      <span
                        className={cn(
                          "m-num grid size-8 shrink-0 place-items-center rounded-full border text-[12.5px] font-semibold",
                          done ? "border-transparent bg-[color-mix(in_oklab,var(--m-success)_16%,transparent)] text-success" : s.step === firstOpen ? "border-[color-mix(in_oklab,var(--m-neon)_60%,transparent)] text-fg" : "border-line-strong text-subtle",
                        )}
                      >
                        {done ? <Check className="size-4" aria-label="concluído" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[14.5px] font-medium", done ? "text-muted" : "text-fg")}>{s.title}</span>
                        {s.step === "plan_selected" && sub ? <span className="block text-[12px] text-subtle">Plano {planName(sub.planCode)}</span> : null}
                      </span>
                      {s.step === firstOpen ? <span className="hidden text-[11.5px] font-medium text-gold sm:inline">próximo passo</span> : null}
                      <ChevronDown className="size-4 text-subtle transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="px-5 pb-5 sm:px-6 sm:pl-[72px]">
                    <p className="text-[13.5px] leading-relaxed text-muted">{s.body}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {s.step === "device_paired" ? <PairCodeForm /> : null}
                      {s.step === "connector_added" ? <ConnectSourceActions /> : null}
                      {s.href ? (
                        <ButtonLink href={s.href} size="sm" variant={done || s.step === "connector_added" ? "secondary" : "primary"} data-testid={`step-action-${s.step}`}>
                          {s.cta} <ArrowRight className="size-3.5" aria-hidden />
                        </ButtonLink>
                      ) : null}
                      {s.manual && !done ? (
                        <Button size="sm" variant="ghost" onClick={() => update.mutate({ complete: [s.step] })} loading={update.isPending && update.variables?.complete?.[0] === s.step}>
                          {s.step === "baseline_started" ? "Iniciar medição agora" : "Marcar como concluído"}
                        </Button>
                      ) : null}
                    </div>
                    <details className="mt-4 rounded-[12px] border border-line bg-surface-2/40 px-3.5 py-2.5 text-[13px] [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex cursor-pointer items-center gap-2 text-subtle hover:text-fg">
                        <LifeBuoy className="size-3.5" aria-hidden /> Problemas nesta etapa?
                      </summary>
                      <ul className="mt-2 space-y-1.5 text-muted">
                        {s.trouble.map((t) => (
                          <li key={t}>• {t}</li>
                        ))}
                      </ul>
                    </details>
                  </Accordion.Content>
                </Accordion.Item>
              );
            })}
          </Accordion.Root>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <p className="m-label">Progresso</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="m-num text-[34px] font-semibold leading-none text-fg" data-testid="onboarding-progress">
                {doneCount}/{total}
              </span>
              <span className="pb-1 text-[13px] text-subtle">etapas</span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do onboarding">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--m-violet),var(--m-purple))] transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </Card>
          <Card className="p-5 text-[13px] leading-relaxed text-muted">
            <p className="font-medium text-fg">Privacidade por padrão</p>
            <p className="mt-1.5">Prompts e chaves ficam na sua máquina. A nuvem maindy. recebe apenas metadados: tokens, custo, latência e hashes.</p>
            <Link href="/privacidade" className="mt-3 inline-block text-subtle underline-offset-4 hover:text-fg hover:underline">
              Política de privacidade
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
