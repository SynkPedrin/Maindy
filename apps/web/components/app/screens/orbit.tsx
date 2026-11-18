"use client";
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Pause, Play, RotateCcw, Save, ShieldAlert, Undo2 } from "lucide-react";
import { MODE_DEFAULT_TECHNIQUES, TechniqueName, type OrbitMode, type OrbitPolicyDto } from "@maindy/contracts";
import { orbitModeLabel, orbitStages } from "@maindy/design-system";
import { usePauseOrbit, usePolicy, useSavePolicy, useUpdateOnboarding, useRollback } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { MeasurementBadge } from "@/components/ui/measurement-badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { PageIntro } from "../page-intro";
import { formatDateTime, techniqueLabel } from "../format";

const MODES: { mode: OrbitMode; body: string }[] = [
  { mode: "observe", body: "Só mede. Nenhuma requisição é alterada — é assim que o baseline real é construído." },
  { mode: "conservative", body: "Cache exato, proteção contra loops e orçamento de retentativas. O conteúdo das requisições não muda." },
  { mode: "balanced", body: "Adiciona compressão de saídas de ferramentas, deduplicação de contexto e dicas de prompt caching, com Quality Guard." },
  { mode: "maximum", body: "Inclui orçamento de saída e roteamento de modelo por política. Exige baseline e amostragem de qualidade." },
];

const TECH: Record<TechniqueName, { body: string; affects: string; risk: "baixo" | "médio"; optIn?: boolean }> = {
  exact_cache: { body: "Reutiliza respostas idênticas e determinísticas, isoladas por organização e projeto.", affects: "Requisições repetidas", risk: "baixo" },
  semantic_cache: { body: "Reaproveita respostas para perguntas equivalentes. Nunca para dados dinâmicos ou sensíveis.", affects: "Requisições semelhantes", risk: "médio", optIn: true },
  tool_output_compression: { body: "Estrutura e resume logs e saídas verbosas de ferramentas, com fallback para o original.", affects: "Tokens de entrada", risk: "baixo" },
  context_dedup: { body: "Remove blocos repetidos no contexto enviado ao modelo.", affects: "Tokens de entrada", risk: "baixo" },
  loop_guard: { body: "Detecta chamadas idênticas em sequência e agentes em loop.", affects: "Requisições desperdiçadas", risk: "baixo" },
  retry_budget: { body: "Limita retentativas e evita tempestades de retry.", affects: "Requisições com erro", risk: "baixo" },
  output_budget: { body: "Define um teto de saída enxuto quando o cliente não definiu um.", affects: "Tokens de saída", risk: "médio" },
  model_routing: { body: "Usa um modelo mais barato em tarefas elegíveis, conforme a política do projeto.", affects: "Preço por token", risk: "médio" },
  prompt_cache_hints: { body: "Marca prefixos estáveis para o prompt caching nativo do provedor, quando elegível.", affects: "Tokens de entrada em cache", risk: "baixo" },
};

type Draft = Pick<OrbitPolicyDto, "mode" | "techniques" | "qualitySampleRate" | "maxAddedLatencyMs" | "cacheTtlSeconds">;

function toDraft(p: OrbitPolicyDto): Draft {
  return { mode: p.mode, techniques: p.techniques, qualitySampleRate: p.qualitySampleRate, maxAddedLatencyMs: p.maxAddedLatencyMs, cacheTtlSeconds: p.cacheTtlSeconds };
}

function normalizeTechniques(list: OrbitPolicyDto["techniques"]) {
  const map = new Map(list.map((t) => [t.name, t]));
  return TechniqueName.options.map((name) => map.get(name) ?? { name, enabled: false, rolledBack: false, rolledBackReason: null });
}

export function OrbitScreen() {
  const q = usePolicy();
  const save = useSavePolicy();
  const pause = usePauseOrbit();
  const rollback = useRollback();
  const onboarding = useUpdateOnboarding();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [rbTarget, setRbTarget] = useState<TechniqueName | null>(null);
  const [rbReason, setRbReason] = useState("");

  useEffect(() => {
    if (q.data) setDraft(toDraft(q.data));
  }, [q.data]);

  const techniques = useMemo(() => normalizeTechniques(draft?.techniques ?? []), [draft?.techniques]);
  const dirty = !!(q.data && draft && JSON.stringify({ ...toDraft(q.data), techniques: normalizeTechniques(q.data.techniques) }) !== JSON.stringify({ ...draft, techniques }));
  const wouldApply = draft && draft.mode !== "observe" ? techniques.filter((t) => t.enabled && !t.rolledBack) : [];
  const currentApply = q.data && q.data.mode !== "observe" ? normalizeTechniques(q.data.techniques).filter((t) => t.enabled && !t.rolledBack) : [];

  if (q.isPending || !draft) {
    if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={8} className="lg:col-span-2" />
      </div>
    );
  }
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const policy = q.data!;

  function setMode(mode: OrbitMode) {
    setDraft((d) =>
      d && {
        ...d,
        mode,
        techniques: normalizeTechniques(d.techniques).map((t) => ({
          ...t,
          enabled: t.rolledBack ? false : t.name === "semantic_cache" ? t.enabled && mode !== "observe" : MODE_DEFAULT_TECHNIQUES[mode].includes(t.name),
        })),
      },
    );
  }
  function toggle(name: TechniqueName, enabled: boolean) {
    setDraft((d) => d && { ...d, techniques: normalizeTechniques(d.techniques).map((t) => (t.name === name ? { ...t, enabled } : t)) });
  }
  function reenable(name: TechniqueName) {
    setDraft((d) => d && { ...d, techniques: normalizeTechniques(d.techniques).map((t) => (t.name === name ? { ...t, enabled: true, rolledBack: false, rolledBackReason: null } : t)) });
  }

  async function persist() {
    if (!draft) return;
    try {
      const saved = await save.mutateAsync({
        mode: draft.mode,
        techniques: techniques.filter((t) => !t.rolledBack || t.enabled).map((t) => ({ name: t.name, enabled: draft.mode === "observe" ? false : t.enabled })),
        qualitySampleRate: draft.qualitySampleRate,
        maxAddedLatencyMs: draft.maxAddedLatencyMs,
        cacheTtlSeconds: draft.cacheTtlSeconds,
        expectedVersion: policy.version,
      });
      setSimOpen(false);
      toast({ tone: "success", title: "Política salva", description: `Versão ${saved.version} · modo ${orbitModeLabel[saved.mode]}` });
      // orbit_activated is marked by the API itself; the baseline start is client-reported.
      onboarding.mutate({ complete: ["baseline_started"] });
    } catch (e) {
      toast({ tone: "error", title: "Não foi possível salvar", description: errorMessage(e) });
    }
  }

  const added = wouldApply.filter((t) => !currentApply.some((c) => c.name === t.name));
  const removed = currentApply.filter((c) => !wouldApply.some((t) => t.name === c.name));

  return (
    <div>
      <PageIntro
        eyebrow="ORBIT Engine™"
        title="Política de otimização"
        description="Comece observando, ative por etapas e deixe o Quality Guard desligar sozinho o que causar regressão. Toda mudança vale para o gateway na próxima sincronização."
      />

      <Card className={cn("mb-4 overflow-hidden", policy.paused && "border-[color-mix(in_oklab,var(--m-warning)_40%,transparent)]")}>
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-4">
            <span className="relative grid size-12 place-items-center">
              <span className={cn("absolute inset-0 rounded-full", policy.paused ? "bg-[color-mix(in_oklab,var(--m-warning)_14%,transparent)]" : "bg-[color-mix(in_oklab,var(--m-neon)_16%,transparent)]")} />
              <span className={cn("relative size-3 rounded-full", policy.paused ? "bg-warning" : "bg-neon shadow-[0_0_16px_rgba(164,36,255,.9)]")} />
            </span>
            <div>
              <p className="text-[17px] font-semibold text-fg" data-testid="orbit-state">
                {policy.paused ? "ORBIT pausado" : `ORBIT ativo — modo ${orbitModeLabel[policy.mode]}`}
              </p>
              <p className="mt-0.5 text-[12.5px] text-subtle">
                {policy.paused ? "Todas as requisições seguem sem otimização (fail-open)." : `${currentApply.length} técnica(s) aplicadas`} · versão {policy.version} · atualizado {formatDateTime(policy.updatedAt)}
              </p>
            </div>
          </div>
          <div className="sm:ml-auto">
            <Button
              size="lg"
              variant={policy.paused ? "primary" : "secondary"}
              className={cn("min-w-[200px]", !policy.paused && "border-[color-mix(in_oklab,var(--m-warning)_45%,transparent)]")}
              loading={pause.isPending}
              onClick={() =>
                pause.mutate(!policy.paused, {
                  onSuccess: () => toast({ tone: "success", title: policy.paused ? "ORBIT retomado" : "ORBIT pausado", description: policy.paused ? undefined : "O gateway passa as requisições sem alteração." }),
                  onError: (e) => toast({ tone: "error", title: "Falha ao alterar", description: errorMessage(e) }),
                })
              }
            >
              {!pause.isPending ? policy.paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden /> : null}
              {policy.paused ? "Retomar ORBIT" : "Pausar tudo agora"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-5 border-t border-line">
          {orbitStages.map((s) => (
            <div key={s.key} className="border-r border-line px-3 py-3 last:border-r-0 sm:px-4" title={s.summary}>
              <div className="font-mono text-[15px] font-semibold text-[color-mix(in_oklab,var(--m-purple)_60%,var(--m-fg))]">{s.key}</div>
              <div className="mt-0.5 truncate text-[11.5px] text-subtle">{s.name}</div>
            </div>
          ))}
        </div>
      </Card>

      <div role="radiogroup" aria-label="Modo do ORBIT" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MODES.map(({ mode, body }) => {
          const active = draft.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(mode)}
              className={cn(
                "flex flex-col items-stretch justify-start rounded-[16px] border p-4 text-left transition-[border-color,background] duration-150",
                active ? "border-[color-mix(in_oklab,var(--m-neon)_55%,transparent)] bg-[color-mix(in_oklab,var(--m-neon)_8%,var(--m-surface-1))]" : "border-line bg-surface-1 hover:border-line-strong",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-fg">{orbitModeLabel[mode]}</span>
                <span className={cn("size-4 rounded-full border-2", active ? "border-neon bg-neon shadow-[inset_0_0_0_3px_var(--m-surface-1)]" : "border-line-strong")} aria-hidden />
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-subtle">{body}</p>
              {policy.mode === mode ? <Badge tone="outline" className="mt-3 h-5 w-fit text-[11px]">em vigor</Badge> : null}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Técnicas"
            description={draft.mode === "observe" ? "No modo Observar nada é aplicado. Escolha outro modo para ligar técnicas." : "Ligue ou desligue individualmente. Técnicas revertidas pelo Quality Guard ficam bloqueadas até você reativar."}
          />
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {techniques.map((t) => {
              const meta = TECH[t.name];
              return (
                <li key={t.name} className="flex items-start gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium text-fg">{techniqueLabel[t.name]}</span>
                      {meta.optIn ? <Badge tone="outline" className="h-5 text-[11px]">opt-in</Badge> : null}
                      {t.rolledBack ? (
                        <Badge tone="warning" className="h-5 text-[11px]">
                          <ShieldAlert className="size-3" aria-hidden /> Revertida
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-subtle">{meta.body}</p>
                    {t.rolledBack ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-[color-mix(in_oklab,var(--m-warning)_30%,transparent)] bg-[color-mix(in_oklab,var(--m-warning)_7%,transparent)] px-3 py-2 text-[12.5px] text-muted">
                        <span className="min-w-0 flex-1">Motivo: {t.rolledBackReason ?? "regressão de qualidade detectada"}</span>
                        <Button size="sm" variant="secondary" onClick={() => reenable(t.name)}>
                          <RotateCcw className="size-3.5" aria-hidden /> Reativar
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    {!t.rolledBack && policy.techniques.find((x) => x.name === t.name)?.enabled ? (
                      <button type="button" onClick={() => setRbTarget(t.name)} className="hidden rounded-[8px] p-1.5 text-subtle hover:bg-surface-2 hover:text-fg sm:block" title="Reverter agora" aria-label={`Reverter ${techniqueLabel[t.name]}`}>
                        <Undo2 className="size-4" />
                      </button>
                    ) : null}
                    <Switch checked={t.enabled && !t.rolledBack} disabled={draft.mode === "observe" || t.rolledBack} onCheckedChange={(v) => toggle(t.name, v)} aria-label={techniqueLabel[t.name]} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Limites de segurança" description="Controles do Quality Guard e do fallback para a requisição original." />
            <div className="flex flex-col gap-5 p-5">
              <Field label="Amostragem de qualidade" hint="Fração das requisições elegíveis também avaliadas em modo sombra. Mais amostras = mais confiança e mais custo.">
                {({ id, describedBy }) => (
                  <div className="flex items-center gap-3">
                    <input
                      id={id}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(draft.qualitySampleRate * 100)}
                      onChange={(e) => setDraft({ ...draft, qualitySampleRate: Number(e.target.value) / 100 })}
                      aria-describedby={describedBy}
                      className="h-1.5 flex-1 cursor-pointer accent-[var(--m-violet)]"
                    />
                    <span className="m-num w-12 text-right text-[13px] text-fg">{Math.round(draft.qualitySampleRate * 100)}%</span>
                  </div>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latência extra máx. (ms)" hint="Acima disso: fallback original.">
                  {({ id, describedBy }) => (
                    <Input id={id} type="number" min={0} step={10} inputMode="numeric" value={draft.maxAddedLatencyMs} aria-describedby={describedBy} onChange={(e) => setDraft({ ...draft, maxAddedLatencyMs: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                  )}
                </Field>
                <Field label="TTL do cache (s)" hint="Validade das respostas em cache.">
                  {({ id, describedBy }) => (
                    <Input id={id} type="number" min={0} step={60} inputMode="numeric" value={draft.cacheTtlSeconds} aria-describedby={describedBy} onChange={(e) => setDraft({ ...draft, cacheTtlSeconds: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                  )}
                </Field>
              </div>
            </div>
          </Card>
          <Card className="sticky top-20">
            <div className="flex flex-col gap-3 p-5">
              <p className="text-[13px] text-muted">{dirty ? "Há alterações não salvas." : "Nenhuma alteração pendente."}</p>
              <Button variant="secondary" onClick={() => setSimOpen(true)} disabled={!dirty}>
                <FlaskConical className="size-4" aria-hidden /> Simular antes de ativar
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" disabled={!dirty} onClick={() => setDraft(toDraft(policy))}>
                  Descartar
                </Button>
                <Button className="flex-1" disabled={!dirty} loading={save.isPending} onClick={() => setSimOpen(true)}>
                  <Save className="size-4" aria-hidden /> Salvar
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={simOpen}
        onOpenChange={setSimOpen}
        className="max-w-lg"
        title="Simulação da nova política"
        description="Prévia do que mudaria no gateway. Os efeitos são qualitativos — a economia real só é contada depois, medida contra o baseline."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSimOpen(false)}>
              Voltar
            </Button>
            <Button loading={save.isPending} onClick={persist} data-testid="orbit-confirm-save">
              Confirmar e ativar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">Modo:</span>
            <Badge tone="outline">{orbitModeLabel[policy.mode]}</Badge>→<Badge tone="violet">{orbitModeLabel[draft.mode]}</Badge>
            <MeasurementBadge source="experimentally_estimated" className="ml-auto" />
          </div>
          {wouldApply.length === 0 ? (
            <p className="rounded-[12px] border border-line bg-surface-2/60 p-3 text-muted">Nenhuma técnica será aplicada. O gateway apenas mede (baseline).</p>
          ) : (
            <ul className="m-scroll-thin max-h-64 divide-y divide-line overflow-y-auto rounded-[12px] border border-line">
              {wouldApply.map((t) => (
                <li key={t.name} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div>
                    <p className="font-medium text-fg">
                      {techniqueLabel[t.name]} {added.some((a) => a.name === t.name) ? <span className="text-[11px] text-success">nova</span> : null}
                    </p>
                    <p className="text-[12px] text-subtle">Efeito esperado: menos {TECH[t.name].affects.toLowerCase()} · risco {TECH[t.name].risk}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {removed.length ? <p className="text-subtle">Deixam de ser aplicadas: {removed.map((r) => techniqueLabel[r.name]).join(", ")}.</p> : null}
          <p className="text-[12px] leading-relaxed text-subtle">
            Amostragem de qualidade {Math.round(draft.qualitySampleRate * 100)}% · fallback acima de +{draft.maxAddedLatencyMs} ms · cache por {draft.cacheTtlSeconds}s. Se o Quality Guard detectar regressão, a técnica é revertida automaticamente.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={!!rbTarget}
        onOpenChange={(o) => !o && setRbTarget(null)}
        title={rbTarget ? `Reverter ${techniqueLabel[rbTarget]}?` : ""}
        description="A técnica é desligada imediatamente em todos os dispositivos e fica marcada como revertida."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRbTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={rollback.isPending}
              disabled={rbReason.trim().length < 3}
              onClick={() =>
                rbTarget &&
                rollback.mutate(
                  { technique: rbTarget, reason: rbReason.trim() },
                  {
                    onSuccess: () => {
                      toast({ tone: "success", title: "Técnica revertida" });
                      setRbTarget(null);
                      setRbReason("");
                    },
                    onError: (e) => toast({ tone: "error", title: "Falha ao reverter", description: errorMessage(e) }),
                  },
                )
              }
            >
              Reverter
            </Button>
          </>
        }
      >
        <Field label="Motivo (fica na trilha de auditoria)">{({ id }) => <Input id={id} value={rbReason} onChange={(e) => setRbReason(e.target.value)} placeholder="Ex.: respostas truncadas no agente de suporte" />}</Field>
      </Dialog>
    </div>
  );
}
