import { LayoutDashboard, Pause, Play, PlugZap, Settings2, X, Link2 } from "lucide-react";
import { useState } from "react";
import { bridge, errorMessage } from "../bridge";
import { gatewayLabel, orbitStatus, orbitStatusLabel, sessionsFrom, useApp, useDashboard } from "../data";
import { Bar, DemoBanner, Orb, SourceBadge, StatusDot, ago, cx, money, tokens } from "../ui";

export type QuickVariant = "notch" | "tray" | "pill";

const windowLabel: Record<string, string> = { five_hour: "Janela de 5 h", seven_day: "Janela de 7 dias", daily: "Diário", monthly: "Mensal" };

export function QuickPanel({ variant, onClose, onNavigate }: { variant: QuickVariant; onClose: () => void; onNavigate?: () => void }) {
  const { boot, gateway, demo } = useApp();
  const d = useDashboard("24h", ["summary", "runs", "policy", "limits"], 30_000);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const status = orbitStatus(d.policy.data, gateway);
  const paused = status === "paused";
  const s = d.summary.data;
  const sessions = sessionsFrom(d.runs.data).slice(0, 2);
  const quotas = d.limits.data ?? [];
  const connected = boot.paired || demo;

  const go = async (section: string) => {
    onNavigate?.();
    await bridge().openMain(section);
  };

  const togglePause = async () => {
    setBusy(true);
    setNote(null);
    try {
      if (demo) {
        d.setDemoPaused(!paused);
        setNote(paused ? "ORBIT retomado (demonstração)." : "ORBIT pausado (demonstração).");
      } else {
        const r = paused ? await bridge().orbitResume() : await bridge().orbitPause();
        const parts = [
          r.gateway === "ok" ? "gateway local" : null,
          r.api === "ok" ? "conta (nuvem)" : null,
        ].filter(Boolean);
        setNote(
          parts.length
            ? `${r.paused ? "Pausado" : "Retomado"} em: ${parts.join(" e ")}.`
            : r.messages[0] ?? "Nada para pausar: conecte a conta ou ative o gateway local.",
        );
        await d.reload();
      }
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx("qp", `qp-${variant}`)} role="dialog" aria-label="Painel rápido da maindy." tabIndex={-1}>
      <header className="qp-head">
        <Orb size={26} active={status === "active" && !boot.reduceMotion} />
        <div className="qp-title">
          <strong>maindy.</strong>
          <span className={cx("chip", `chip-${status}`)}>
            <StatusDot tone={status === "active" ? "violet" : status === "paused" ? "warn" : "idle"} />
            {orbitStatusLabel[status]}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar painel rápido (Esc)">
          <X size={15} />
        </button>
      </header>

      {demo && <DemoBanner compact />}

      {!connected ? (
        <div className="qp-connect">
          <Link2 size={20} aria-hidden />
          <strong>Conecte sua conta</strong>
          <p>Pareie este computador para ver economia, sessões e limites reais.</p>
          <button type="button" className="btn btn-primary" onClick={() => void go("overview")}>
            Conectar
          </button>
        </div>
      ) : (
        <div className="qp-body">
          <div className="qp-hero">
            <div>
              <span className="qp-k">Economia líquida · 24 h</span>
              <span className={cx("qp-big", s && s.netSavings.source !== "unavailable" && s.netSavings.micros > 0 && "is-success")}>
                {s ? money(s.netSavings) : d.summary.error ? "indisponível" : "—"}
              </span>
              <SourceBadge source={s?.netSavings.source ?? "unavailable"} compact />
            </div>
            <div>
              <span className="qp-k">Tokens · 24 h</span>
              <span className="qp-big">{s ? tokens(s.tokens.input + s.tokens.output) : "—"}</span>
              <SourceBadge source={s?.optimizedAiCost.source ?? "unavailable"} compact />
            </div>
          </div>
          <div className="qp-row3">
            <div>
              <span className="qp-k">Evitados</span>
              <b>{s ? tokens(s.tokens.avoided, s.tokens.avoidedSource) : "—"}</b>
            </div>
            <div>
              <span className="qp-k">Custo real</span>
              <b>{s ? money(s.optimizedAiCost) : "—"}</b>
            </div>
            <div>
              <span className="qp-k">Requisições</span>
              <b>{s ? s.requests.toLocaleString("pt-BR") : "—"}</b>
            </div>
          </div>
          {!s && !d.loading && (
            <p className="qp-muted">{d.summary.error ?? "Ainda sem dados nas últimas 24 h — nenhum número estimado é exibido."}</p>
          )}

          {quotas.length > 0 && (
            <div className="qp-section">
              <span className="qp-k">Cota oficial</span>
              {quotas.slice(0, 1).map((q) => (
                <div className="qp-quota" key={`${q.product}-${q.window}`}>
                  <div className="qp-quota-top">
                    <span>
                      {q.provider} · {windowLabel[q.window] ?? q.window}
                    </span>
                    <b>{Math.round(q.usedPercentage)}%</b>
                  </div>
                  <Bar value={q.usedPercentage} max={100} tone={q.usedPercentage > 85 ? "gold" : "violet"} label={`Uso da cota ${q.window}`} />
                  <span className="qp-quota-meta">
                    via {q.collectedVia}
                    {q.resetsAt ? ` · renova ${ago(q.resetsAt)}` : ""}
                  </span>
                </div>
              ))}
              {quotas.length > 1 && <span className="qp-quota-meta">+{quotas.length - 1} janela(s) em Limites &amp; Sessões</span>}
            </div>
          )}
          <div className="qp-section">
            <span className="qp-k">Sessões recentes</span>
            {sessions.length === 0 ? (
              <p className="qp-muted">{d.runs.error ? "Sessões indisponíveis para este dispositivo." : "Nenhuma sessão registrada."}</p>
            ) : (
              <ul className="qp-sessions">
                {sessions.map((x) => (
                  <li key={x.key}>
                    <span className="qp-sess-name">{x.project ?? x.agent ?? x.connector}</span>
                    <span className="qp-sess-meta">
                      {x.model} · {x.requests} req · {tokens(x.tokens)} tok · {ago(x.last)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      )}

      <div className="qp-gw">
        <StatusDot tone={gateway.healthy ? "ok" : gateway.phase === "crashed" ? "error" : "idle"} />
        <span>{gatewayLabel(gateway)}</span>
      </div>

      {note && (
        <div className="qp-note" role="status">
          {note}
        </div>
      )}

      <nav className="qp-actions" aria-label="Ações rápidas">
        <button type="button" className="qa" onClick={() => void go("overview")}>
          <LayoutDashboard size={16} aria-hidden />
          Abrir dashboard
        </button>
        <button type="button" className={cx("qa", paused ? "qa-resume" : "qa-pause")} onClick={() => void togglePause()} disabled={busy || (!connected && !gateway.healthy)}>
          {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
          {paused ? "Retomar ORBIT" : "Pausar ORBIT"}
        </button>
        <button type="button" className="qa" onClick={() => void go("integrations")}>
          <PlugZap size={16} aria-hidden />
          Conexões
        </button>
        <button type="button" className="qa" onClick={() => void go("settings")}>
          <Settings2 size={16} aria-hidden />
          Configurações
        </button>
      </nav>
    </div>
  );
}
