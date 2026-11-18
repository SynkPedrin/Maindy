import { Activity, Inbox } from "lucide-react";
import type { Dash } from "../../data";
import { useApp } from "../../data";
import type { Period, RequestUsageEvent, Section } from "../../types";
import { qualitySource } from "../../sources";
import { Bar, Card, Empty, ErrorLine, Metric, SourceBadge, ago, cx, money, pct, tokens } from "../../ui";

const periodText: Record<Period, string> = { "24h": "nas últimas 24 h", "7d": "nos últimos 7 dias", "30d": "nos últimos 30 dias" };

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function Overview({ d, period, go }: { d: Dash; period: Period; go: (s: Section) => void }) {
  const { demo } = useApp();
  const s = d.summary.data;
  const name = d.me.data?.user.name?.split(" ")[0];
  const hasData = !!s && s.requests > 0;
  const qualityRate = s && s.quality.evaluations > 0 ? s.quality.passed / s.quality.evaluations : null;

  return (
    <div className="stack">
      <div className="greet">
        <h2>
          {greeting()}
          {name ? `, ${name}` : ""}.
        </h2>
        <p>
          {d.me.data ? d.me.data.organization.name : ""}
          {hasData ? ` · ${s!.requests.toLocaleString("pt-BR")} requisições ${periodText[period]}` : ""}
        </p>
      </div>

      {d.summary.error && <ErrorLine message={`Resumo indisponível: ${d.summary.error}`} />}

      <div className="grid-5">
        <Metric
          label="Economia líquida"
          value={hasData ? money(s!.netSavings) : "indisponível"}
          source={hasData ? s!.netSavings.source : "unavailable"}
          tone="success"
          hint={hasData ? `cobertura de baseline ${pct(s!.baselineCoverage)}` : "sem baseline válido"}
        />
        <Metric
          label="Tokens evitados"
          value={hasData ? tokens(s!.tokens.avoided, s!.tokens.avoidedSource) : "indisponível"}
          source={hasData ? s!.tokens.avoidedSource : "unavailable"}
          hint={hasData ? (s!.tokens.avoidedSource === "experimentally_estimated" ? "estimativa" : "medição") : undefined}
        />
        <Metric label="Custo real" value={hasData ? money(s!.optimizedAiCost) : "indisponível"} source={hasData ? s!.optimizedAiCost.source : "unavailable"} />
        <Metric
          label="Qualidade aprovada"
          value={qualityRate != null ? pct(qualityRate, 1) : "indisponível"}
          source={qualitySource(s?.quality.evaluations)}
          hint={s && s.quality.evaluations > 0 ? `${s.quality.passed} de ${s.quality.evaluations} avaliações` : "sem avaliações"}
        />
        <Metric label="ROI da assinatura" value="indisponível" source="unavailable" hint={<button type="button" className="link" onClick={() => go("reports")}>calculado no relatório →</button>} />
      </div>

      <div className="grid-2-1">
        <Card title="Custo com e sem maindy." aside={hasData ? <SourceBadge source={s!.baselineCost.source} compact /> : undefined}>
          {hasData ? <Comparison d={d} /> : <Empty icon={<Inbox size={20} />} title="Sem comparação ainda">Quando houver requisições com baseline válido, o custo sem a maindy. aparece aqui ao lado do custo real.</Empty>}
        </Card>
        <Card title="Agora">
          <dl className="kv">
            <dt>Cache</dt>
            <dd>{s ? `${s.cache.hits.toLocaleString("pt-BR")} acertos · ${s.cache.misses.toLocaleString("pt-BR")} faltas` : "indisponível"}</dd>
            <dt>Multiplicador</dt>
            <dd>{s?.efficiencyMultiplier != null ? `${s.efficiencyMultiplier.toLocaleString("pt-BR")}×` : "indisponível"}</dd>
            <dt>Rollbacks</dt>
            <dd>{s ? s.quality.rollbacks : "indisponível"}</dd>
            <dt>Método</dt>
            <dd>
              <code>{s?.methodVersion ?? "—"}</code>
            </dd>
          </dl>
          <button type="button" className="link" onClick={() => go("savings")}>
            Ver detalhamento da economia →
          </button>
        </Card>
      </div>

      <Card title="Últimas operações" aside={d.runs.data && d.runs.data.length > 0 ? <span className="muted">{demo ? "simuladas" : `${d.runs.data.length} mais recentes`}</span> : undefined}>
        <RunsTable runs={d.runs.data} error={d.runs.error} />
      </Card>
    </div>
  );
}

function Comparison({ d }: { d: Dash }) {
  const s = d.summary.data!;
  const base = s.baselineCost.micros;
  const max = Math.max(base, s.optimizedAiCost.micros + s.overheadCost.micros, 1);
  return (
    <div className="compare">
      <div className="compare-row">
        <span>Sem maindy. (baseline)</span>
        <Bar value={base} max={max} tone="muted" label="Custo baseline" />
        <b>{money(s.baselineCost)}</b>
        <SourceBadge source={s.baselineCost.source} compact />
      </div>
      <div className="compare-row">
        <span>Custo real de IA</span>
        <Bar value={s.optimizedAiCost.micros} max={max} tone="violet" label="Custo real" />
        <b>{money(s.optimizedAiCost)}</b>
        <SourceBadge source={s.optimizedAiCost.source} compact />
      </div>
      <div className="compare-row">
        <span>Overhead da maindy.</span>
        <Bar value={s.overheadCost.micros} max={max} tone="gold" label="Overhead" />
        <b>{money(s.overheadCost)}</b>
        <SourceBadge source={s.overheadCost.source} compact />
      </div>
      <div className="compare-row total">
        <span>Economia líquida</span>
        <Bar value={Math.max(0, s.netSavings.micros)} max={max} tone="success" label="Economia líquida" />
        <b className="is-success">{money(s.netSavings)}</b>
        <SourceBadge source={s.netSavings.source} compact />
      </div>
    </div>
  );
}

const statusLabel: Record<RequestUsageEvent["status"], string> = {
  ok: "ok",
  error: "erro",
  cache_hit: "cache",
  blocked: "bloqueada",
  fallback: "original",
};

export function RunsTable({ runs, error, limit = 8 }: { runs: RequestUsageEvent[] | null; error: string | null; limit?: number }) {
  if (error) return <Empty icon={<Activity size={20} />} title="Operações indisponíveis">{error}</Empty>;
  if (!runs || runs.length === 0)
    return (
      <Empty icon={<Activity size={20} />} title="Nenhuma operação ainda">
        Aponte Claude Code, Codex ou seus agentes para o gateway local para ver as operações aqui.
      </Empty>
    );
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Origem</th>
            <th>Modelo</th>
            <th className="num">Tokens (entrada/saída)</th>
            <th className="num">Custo</th>
            <th>Técnicas</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {runs.slice(0, limit).map((r) => (
            <tr key={r.eventId}>
              <td className="muted">{ago(r.occurredAt)}</td>
              <td>{r.projectKey ?? r.connector}</td>
              <td>
                <code>{r.model}</code>
              </td>
              <td className="num">
                {tokens(r.usage.inputTokens)} / {tokens(r.usage.outputTokens)} <SourceBadge source={r.usage.source} compact />
              </td>
              <td className="num">
                {money(r.cost)} <SourceBadge source={r.cost.source} compact />
              </td>
              <td className="muted">{r.techniques.filter((t) => t.applied).map((t) => t.name).join(", ") || "—"}</td>
              <td>
                <span className={cx("tag", `tag-${r.status}`)}>{statusLabel[r.status]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
