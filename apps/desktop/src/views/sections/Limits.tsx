import { Gauge, Users } from "lucide-react";
import { sessionsFrom, useApp } from "../../data";
import type { Dash } from "../../data";
import { gatewayCounterSource, quotaSource } from "../../sources";
import type { Section } from "../../types";
import { Bar, Card, Empty, ErrorLine, SourceBadge, ago, tokens } from "../../ui";

const windowLabel: Record<string, string> = { five_hour: "Janela de 5 horas", seven_day: "Janela de 7 dias", daily: "Diário", monthly: "Mensal" };

export function Limits({ d, go }: { d: Dash; go: (s: Section) => void }) {
  const { gateway } = useApp();
  const quotas = d.limits.data ?? [];
  const sessions = sessionsFrom(d.runs.data);
  const c = gateway.status?.counters;
  return (
    <div className="stack">
      <Card title="Cotas oficiais">
        {d.limits.error ? (
          <ErrorLine message={`Limites indisponíveis: ${d.limits.error}`} />
        ) : quotas.length === 0 ? (
          <Empty
            icon={<Gauge size={20} />}
            title="Nenhuma fonte oficial de cota"
            action={
              <button type="button" className="btn btn-ghost" onClick={() => go("integrations")}>
                Instalar a status line do Claude Code
              </button>
            }
          >
            Percentuais e horários de renovação só aparecem quando uma fonte legítima os fornece: a status line do Claude Code (Pro/Max, enquanto ele está
            aberto) ou o app-server do Codex. A maindy. não estima cotas.
          </Empty>
        ) : (
          <div className="quota-list">
            {quotas.map((q) => (
              <div className="quota" key={`${q.provider}-${q.product}-${q.window}`}>
                <div className="quota-h">
                  <strong>
                    {q.provider} · {q.product}
                  </strong>
                  <span className="muted">{windowLabel[q.window] ?? q.window}</span>
                </div>
                <div className="quota-bar">
                  <Bar value={q.usedPercentage} max={100} tone={q.usedPercentage > 85 ? "gold" : "violet"} label={`Uso ${q.window}`} />
                  <b>{Math.round(q.usedPercentage)}%</b>
                </div>
                <div className="quota-f">
                  <SourceBadge source={quotaSource(q)} compact />
                  <span className="muted">
                    coletado via <code>{q.collectedVia}</code> {ago(q.capturedAt)}
                    {q.resetsAt ? ` · renova ${ago(q.resetsAt)}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Sessões recentes">
        {sessions.length === 0 ? (
          <Empty icon={<Users size={20} />} title={d.runs.error ? "Sessões indisponíveis" : "Nenhuma sessão registrada"}>
            {d.runs.error ?? "Sessões aparecem quando as requisições trazem x-maindy-session (ou o session id do Claude Code/Codex)."}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sessão</th>
                  <th>Projeto / agente</th>
                  <th>Modelo</th>
                  <th className="num">Requisições</th>
                  <th className="num">Tokens</th>
                  <th>Última atividade</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.key}>
                    <td>
                      <code>{s.key.slice(0, 12)}</code>
                    </td>
                    <td>{[s.project, s.agent].filter(Boolean).join(" / ") || s.connector}</td>
                    <td>
                      <code>{s.model}</code>
                    </td>
                    <td className="num">{s.requests}</td>
                    <td className="num">
                      {tokens(s.tokens)} <SourceBadge source={s.source} compact />
                    </td>
                    <td className="muted">{ago(s.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Gateway local (desde o último início)" aside={gateway.status ? <span className="muted">no ar há {uptime(gateway.status.uptimeSeconds)}</span> : undefined}>
        {c ? (
          <dl className="kv kv-4">
            <dt>Requisições</dt>
            <dd>{c.requests.toLocaleString("pt-BR")}</dd>
            <dt>Acertos de cache</dt>
            <dd>{c.cacheHits.toLocaleString("pt-BR")}</dd>
            <dt>Tokens evitados</dt>
            <dd>
              {tokens(c.tokensAvoided)} <SourceBadge source={gatewayCounterSource(gateway.healthy)} compact />
            </dd>
            <dt>Erros</dt>
            <dd>{c.errors.toLocaleString("pt-BR")}</dd>
            <dt>Tokens (entrada/saída)</dt>
            <dd>
              {tokens(c.tokensIn)} / {tokens(c.tokensOut)} <SourceBadge source={gatewayCounterSource(gateway.healthy)} compact />
            </dd>
            <dt>Telemetria pendente</dt>
            <dd>{c.pendingTelemetry}</dd>
          </dl>
        ) : (
          <p className="muted">Gateway local não está respondendo — contadores indisponíveis.</p>
        )}
      </Card>
    </div>
  );
}

function uptime(s: number): string {
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
}
