import { PiggyBank } from "lucide-react";
import type { Dash } from "../../data";
import type { Money, Period } from "../../types";
import { Card, Empty, ErrorLine, SourceBadge, money, pct, tokens } from "../../ui";

function Row({ label, m, note }: { label: string; m: Money; note?: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{money(m)}</td>
      <td>
        <SourceBadge source={m.source} />
      </td>
      <td className="muted">{note}</td>
    </tr>
  );
}

export function Savings({ d, period }: { d: Dash; period: Period }) {
  const s = d.summary.data;
  if (d.summary.error) return <ErrorLine message={`Resumo indisponível: ${d.summary.error}`} />;
  if (!s || s.requests === 0)
    return (
      <Card>
        <Empty icon={<PiggyBank size={20} />} title="Sem economia medida neste período">
          A economia só aparece quando existe baseline válido (replay de cache, tokens antes da otimização ou amostra pareada). Nada é estimado sem
          base.
        </Empty>
      </Card>
    );
  return (
    <div className="stack">
      <Card title={`Composição · ${period === "24h" ? "24 h" : period === "7d" ? "7 dias" : "30 dias"}`}>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <Row label="Custo sem maindy. (baseline)" m={s.baselineCost} note="só requisições com baseline válido" />
              <Row label="Custo real de IA" m={s.optimizedAiCost} note="0 em acertos de cache" />
              <Row label="Overhead da maindy." m={s.overheadCost} note="Quality Guard, amostras, sondas" />
              <Row label="Economia bruta" m={s.grossSavings} note="baseline − custo real" />
              <Row label="Economia líquida" m={s.netSavings} note="baseline − (custo real + overhead)" />
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid-3">
        <Card title="Tokens">
          <p className="card-sub">Soma dos eventos do período; a origem varia por evento (veja a trilha em Relatórios).</p>
          <dl className="kv">
            <dt>Entrada</dt>
            <dd>{tokens(s.tokens.input)}</dd>
            <dt>Saída</dt>
            <dd>{tokens(s.tokens.output)}</dd>
            <dt>Entrada em cache</dt>
            <dd>{tokens(s.tokens.cachedInput)}</dd>
            <dt>Evitados</dt>
            <dd>
              {tokens(s.tokens.avoided, s.tokens.avoidedSource)} <SourceBadge source={s.tokens.avoidedSource} compact />
            </dd>
          </dl>
        </Card>
        <Card title="Transparência">
          <dl className="kv">
            <dt>Cobertura de baseline</dt>
            <dd>{pct(s.baselineCoverage)}</dd>
            <dt>Multiplicador</dt>
            <dd>{s.efficiencyMultiplier != null ? `${s.efficiencyMultiplier.toLocaleString("pt-BR")}×` : "indisponível (sem baseline aceito)"}</dd>
            <dt>Método</dt>
            <dd>
              <code>{s.methodVersion}</code>
            </dd>
          </dl>
        </Card>
        <Card title="Cache">
          <dl className="kv">
            <dt>Acertos</dt>
            <dd>{s.cache.hits.toLocaleString("pt-BR")}</dd>
            <dt>Faltas</dt>
            <dd>{s.cache.misses.toLocaleString("pt-BR")}</dd>
            <dt>Taxa</dt>
            <dd>{s.cache.hits + s.cache.misses > 0 ? pct(s.cache.hits / (s.cache.hits + s.cache.misses), 1) : "indisponível"}</dd>
          </dl>
        </Card>
      </div>
      <p className="footnote">
        Descontos nativos do provedor (ex.: prompt caching) já estão no baseline e não contam como economia da maindy.
      </p>
    </div>
  );
}
