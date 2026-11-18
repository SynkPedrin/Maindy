import { orbitModeLabel, orbitStages } from "@maindy/design-system";
import { MODE_DEFAULT_TECHNIQUES } from "@maindy/contracts";
import { Cloud, Laptop, Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import { bridge } from "../../bridge";
import { useAction, useApp, useOps, type Dash } from "../../data";
import type { OrbitPolicyDto } from "../../types";
import { ActionMsg, Btn, Card, ErrorLine, StatusDot, ago, cx, pct } from "../../ui";

type Mode = OrbitPolicyDto["mode"];
type Tech = OrbitPolicyDto["techniques"][number];

const modeHelp: Record<Mode, string> = {
  observe: "Só mede. Nenhuma requisição é alterada.",
  conservative: "Cache exato, guarda contra loops e limite de retries.",
  balanced: "Inclui compressão de saídas de ferramentas, deduplicação e dicas de prompt caching.",
  maximum: "Inclui orçamento de saída e roteamento de modelo por política. Exige Quality Guard ativo.",
};

export const techniqueLabel: Record<string, string> = {
  exact_cache: "Cache exato",
  semantic_cache: "Cache semântico (opt-in)",
  tool_output_compression: "Compressão de saídas de ferramentas",
  context_dedup: "Deduplicação de contexto",
  loop_guard: "Guarda contra loops",
  retry_budget: "Orçamento de retries",
  output_budget: "Orçamento de saída",
  model_routing: "Roteamento de modelo",
  prompt_cache_hints: "Dicas de prompt caching",
};

export function OrbitEngine({ d }: { d: Dash }) {
  const ops = useOps();
  const p = d.policy.data;
  const [pending, setPending] = useState<Mode | null>(null);
  const modeAct = useAction();
  if (d.policy.error) return <ErrorLine message={`Política indisponível: ${d.policy.error}`} />;
  if (!p) return <p className="muted">Carregando política…</p>;

  const apply = async (mode: Mode) => {
    const r = await modeAct.run(() => ops.orbitPolicyPatch({ mode, expectedVersion: p.version }), `Modo ${orbitModeLabel[mode]} aplicado. Vale a partir da próxima requisição.`);
    setPending(null);
    await d.reload();
    return r;
  };
  const preview = pending ? new Set<string>(MODE_DEFAULT_TECHNIQUES[pending]) : null;

  return (
    <div className="stack">
      <EffectiveState d={d} />

      <Card title="Modo" aside={<span className="muted">versão {p.version} · alterada {ago(p.updatedAt)}</span>}>
        <div className="modes" role="radiogroup" aria-label="Modo do ORBIT">
          {(Object.keys(orbitModeLabel) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={p.mode === m}
              className={cx("mode", p.mode === m && "on", pending === m && "pending")}
              onClick={() => {
                modeAct.reset();
                setPending(m === p.mode ? null : m);
              }}
            >
              <strong>{orbitModeLabel[m]}</strong>
              <span>{modeHelp[m]}</span>
            </button>
          ))}
        </div>
        {pending && preview && (
          <div className="simulate" role="region" aria-label="Simulação da mudança">
            <strong>Antes de ativar: o que muda em {orbitModeLabel[pending]}</strong>
            <ul>
              {p.techniques.map((t) => {
                const willBe = preview.has(t.name) && !t.rolledBack;
                if (willBe === t.enabled) return null;
                return (
                  <li key={t.name} className={willBe ? "plus" : "minus"}>
                    {willBe ? "+ ativa" : "− desativa"} {techniqueLabel[t.name] ?? t.name}
                  </li>
                );
              })}
            </ul>
            <p className="muted">Técnicas revertidas pelo Quality Guard continuam desligadas. Qualquer erro do ORBIT segue com a requisição original.</p>
            <div className="row">
              <Btn kind="primary" busy={modeAct.busy} onClick={() => void apply(pending)}>
                Ativar {orbitModeLabel[pending]}
              </Btn>
              <Btn kind="ghost" onClick={() => setPending(null)} disabled={modeAct.busy}>
                Cancelar
              </Btn>
            </div>
          </div>
        )}
        <ActionMsg s={modeAct} />
      </Card>

      <Card title="Técnicas" aside={p.mode === "observe" ? <span className="muted">No modo Observar nenhuma técnica fica ativa.</span> : undefined}>
        <ul className="techniques tech-edit">
          {p.techniques.map((t) => (
            <TechniqueRow key={t.name} t={t} policy={p} onDone={d.reload} />
          ))}
        </ul>
        <dl className="kv kv-3">
          <dt>Amostragem do Quality Guard</dt>
          <dd>{pct(p.qualitySampleRate)}</dd>
          <dt>Latência extra máxima</dt>
          <dd>{p.maxAddedLatencyMs} ms</dd>
          <dt>TTL do cache</dt>
          <dd>{Math.round(p.cacheTtlSeconds / 3600)} h</dd>
        </dl>
      </Card>

      <Card title="Método ORBIT">
        <ol className="stages">
          {orbitStages.map((s) => (
            <li key={s.key}>
              <b>{s.key}</b>
              <div>
                <strong>{s.name}</strong>
                <span>{s.summary}</span>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

/** Cloud policy vs what the local gateway is actually applying. */
function EffectiveState({ d }: { d: Dash }) {
  const { gateway, demo } = useApp();
  const p = d.policy.data!;
  const st = gateway.status;
  const act = useAction();
  const cloudPaused = p.paused;
  const gwPaused = st?.paused ?? null;
  const inSync = !!st && st.mode === p.mode && st.paused === p.paused;
  const paused = cloudPaused || gwPaused === true;
  const toggle = () =>
    act.run(async () => {
      if (demo) {
        d.setDemoPaused(!paused);
        return paused ? "ORBIT retomado (demonstração)." : "ORBIT pausado (demonstração).";
      }
      const r = paused ? await bridge().orbitResume() : await bridge().orbitPause();
      await d.reload();
      const where = [r.gateway === "ok" && "gateway local", r.api === "ok" && "sua conta"].filter(Boolean).join(" e ");
      if (r.gateway === "error" && r.api === "error") throw { code: "pause_failed", message: r.messages.join(" ") || "Não foi possível alterar a pausa." };
      return `${r.paused ? "Pausado" : "Retomado"} em ${where || "nenhum lugar"}.${r.messages.length ? ` ${r.messages.join(" ")}` : ""}`;
    }, (m) => m);
  return (
    <Card
      title="Estado efetivo"
      aside={
        <Btn kind={paused ? "primary" : "default"} busy={act.busy} icon={paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />} onClick={() => void toggle()}>
          {paused ? "Retomar ORBIT" : "Pausar ORBIT"}
        </Btn>
      }
    >
      <div className="eff">
        <div className="eff-col">
          <span className="eff-k">
            <Cloud size={14} aria-hidden /> Sua conta (política)
          </span>
          <strong>{orbitModeLabel[p.mode]}</strong>
          <span className={cx("tag", cloudPaused ? "tag-fallback" : "tag-ok")}>{cloudPaused ? "pausado" : "ativo"}</span>
        </div>
        <div className={cx("eff-arrow", st && !inSync && "syncing")} aria-hidden>
          {st && !inSync ? <RefreshCw size={15} className="spin" /> : "→"}
        </div>
        <div className="eff-col">
          <span className="eff-k">
            <Laptop size={14} aria-hidden /> Gateway local (aplicando)
          </span>
          {st ? (
            <>
              <strong>{orbitModeLabel[st.mode]}</strong>
              <span className={cx("tag", st.paused ? "tag-fallback" : "tag-ok")}>{st.paused ? "pausado" : "ativo"}</span>
            </>
          ) : (
            <span className="muted">gateway desligado — requisições não passam pelo ORBIT</span>
          )}
        </div>
        <div className="eff-note">
          {!st ? null : inSync ? (
            <span className="ok-text">
              <StatusDot tone="ok" /> Em sincronia
            </span>
          ) : st.linkedToCloud ? (
            <span className="warn-text" role="status">
              <StatusDot tone="warn" /> sincronizando… o gateway busca a política a cada 30 s (pausa e retomada valem na hora).
            </span>
          ) : (
            <span className="warn-text">
              <StatusDot tone="warn" /> Gateway em modo local (não vinculado à conta): ative “Gateway local” em Configurações com este computador conectado.
            </span>
          )}
        </div>
      </div>
      <ActionMsg s={act} />
    </Card>
  );
}

function TechniqueRow({ t, policy, onDone }: { t: Tech; policy: OrbitPolicyDto; onDone: () => Promise<void> }) {
  const ops = useOps();
  const act = useAction();
  const [rb, setRb] = useState(false);
  const [reason, setReason] = useState("");
  const observe = policy.mode === "observe";
  const name = techniqueLabel[t.name] ?? t.name;
  const setEnabled = (enabled: boolean) =>
    act.run(async () => {
      await (t.rolledBack && enabled ? ops.orbitReactivate(t.name) : ops.orbitPolicyPatch({ techniques: [{ name: t.name, enabled }], expectedVersion: policy.version }));
      await onDone();
    }, enabled ? `${name}: ativada.` : `${name}: desligada.`);
  return (
    <li className="tech-row">
      <StatusDot tone={t.rolledBack ? "warn" : t.enabled ? "violet" : "idle"} />
      <span className="t-name">{name}</span>
      <span className={cx("tag", t.rolledBack ? "tag-fallback" : t.enabled ? "tag-ok" : "tag-off")}>{t.rolledBack ? "revertida" : t.enabled ? "ativa" : "desligada"}</span>
      <span className="tech-actions">
        {t.enabled && !rb && (
          <button type="button" className="link" onClick={() => setRb(true)}>
            Reverter…
          </button>
        )}
        {t.rolledBack ? (
          <Btn size="sm" busy={act.busy} disabled={observe} onClick={() => void setEnabled(true)}>
            Reativar
          </Btn>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={t.enabled}
            aria-label={`${name}: ${t.enabled ? "desligar" : "ligar"}`}
            className={cx("switch", t.enabled && "on")}
            disabled={act.busy || (observe && !t.enabled)}
            title={observe && !t.enabled ? "No modo Observar nenhuma técnica fica ativa" : undefined}
            onClick={() => void setEnabled(!t.enabled)}
          >
            <i />
          </button>
        )}
      </span>
      {t.rolledBack && t.rolledBackReason && (
        <span className="t-reason tech-reason">
          <RotateCcw size={12} aria-hidden /> {t.rolledBackReason}
        </span>
      )}
      {rb && (
        <form
          className="rb-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act.run(() => ops.orbitRollback(t.name, reason), `${name}: revertida.`);
            if (r) {
              setRb(false);
              setReason("");
              await onDone();
            }
          }}
        >
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (ex.: respostas piores no projeto X)" aria-label="Motivo da reversão" autoFocus maxLength={300} />
          <Btn type="submit" kind="danger" size="sm" busy={act.busy} disabled={!reason.trim()}>
            Reverter
          </Btn>
          <Btn size="sm" kind="ghost" onClick={() => setRb(false)}>
            Cancelar
          </Btn>
        </form>
      )}
      {(act.ok || act.error) && <ActionMsg s={act} className="tech-msg" />}
    </li>
  );
}
