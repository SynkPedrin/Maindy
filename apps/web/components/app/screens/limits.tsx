"use client";
import { Gauge, Info } from "lucide-react";
import { useLimits } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { MeasurementBadge } from "@/components/ui/measurement-badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { PageIntro } from "../page-intro";
import { DevicesCard, SessionsCard } from "../sessions-devices";
import { formatDateTime, relativeTime } from "../format";

const windowLabel: Record<string, string> = { five_hour: "Janela de 5 horas", seven_day: "Janela de 7 dias", seven_day_opus: "7 dias (Opus)", daily: "Diário", monthly: "Mensal" };
const productLabel: Record<string, string> = { claude_code_subscription: "Claude Code (assinatura)", codex: "Codex" };

export function LimitsScreen() {
  const q = useLimits();
  return (
    <div>
      <PageIntro
        eyebrow="Limites & Sessões"
        title="Cotas oficiais e acessos"
        description="Só mostramos percentual e reset quando o próprio provedor os expõe por uma interface oficial. Nada aqui é estimado."
      />
      <Card className="mb-6">
        <CardHeader title="Cotas dos provedores" description="Coletadas pela status line do Claude Code e por outras fontes oficiais, quando disponíveis." />
        <div className="p-5">
          {q.isPending ? (
            <div className="grid gap-3 md:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : q.isError ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          ) : q.data.length === 0 ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
              <EmptyState
                className="items-start px-0 py-2 text-left"
                icon={<Gauge />}
                title="Nenhuma cota oficial recebida"
                description="Ainda não chegou nenhum snapshot de limite de uma fonte oficial para esta organização."
              />
              <div className="rounded-[14px] border border-line bg-surface-2/40 p-4 text-[13px] leading-relaxed text-muted">
                <p className="flex items-center gap-2 font-medium text-fg">
                  <Info className="size-4 text-subtle" aria-hidden /> Por que pode estar indisponível
                </p>
                <ul className="mt-2 space-y-1.5">
                  <li>• <strong className="font-medium text-fg">Claude Code:</strong> os limites (rate_limits) só aparecem na status line para assinantes, depois da instalação via <code className="font-mono text-[12px]">maindy-claude-code install</code>.</li>
                  <li>• <strong className="font-medium text-fg">APIs OpenAI/Anthropic:</strong> não expõem uma cota mensal consultável; mostramos uso e custo, não “quanto falta”.</li>
                  <li>• <strong className="font-medium text-fg">ChatGPT/Claude (chat):</strong> não há interface oficial — não estimamos cotas de terceiros.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {q.data.map((s) => {
                const pct = Math.max(0, Math.min(100, s.usedPercentage));
                const tone = pct >= 90 ? "bg-error" : pct >= 70 ? "bg-warning" : "bg-[linear-gradient(90deg,var(--m-violet),var(--m-purple))]";
                return (
                  <div key={`${s.provider}-${s.product}-${s.window}`} className="rounded-[16px] border border-line bg-surface-2/30 p-4" data-testid="quota-snapshot">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-medium text-fg">{productLabel[s.product] ?? s.product}</p>
                        <p className="text-[12px] text-subtle">
                          {s.provider} · {windowLabel[s.window] ?? s.window}
                        </p>
                      </div>
                      <span className="m-num text-[22px] font-semibold text-fg">{pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Uso da ${windowLabel[s.window] ?? s.window}`}>
                      <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-subtle">
                      <span>{s.resetsAt ? `Reinicia ${formatDateTime(s.resetsAt)}` : "Reset não informado pelo provedor"}</span>
                      <span>· coletado via <code className="font-mono">{s.collectedVia}</code> {relativeTime(s.capturedAt)}</span>
                      <MeasurementBadge source="provider_reported" compact />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SessionsCard />
        <DevicesCard />
      </div>
    </div>
  );
}
