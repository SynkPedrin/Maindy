import { BadgeCheck, RotateCcw } from "lucide-react";
import { useState } from "react";
import { periodRange, useAction, useApiGet, useOps, useResource, type Dash } from "../../data";
import { qualitySource } from "../../sources";
import type { Period, QualityEvaluationEvent } from "../../types";
import { ActionMsg, Btn, Card, Empty, ErrorLine, Metric, ago, cx, pct } from "../../ui";
import { techniqueLabel } from "./OrbitEngine";

const methodLabel: Record<QualityEvaluationEvent["method"], string> = {
  exact_match: "Igualdade exata",
  schema_valid: "Schema válido",
  test_suite: "Suíte de testes",
  reference_similarity: "Similaridade com referência",
  human_review: "Revisão humana",
};

export function Quality({ d, period }: { d: Dash; period: Period }) {
  const get = useApiGet();
  const [only, setOnly] = useState<"all" | "failed">("all");
  const evals = useResource(() => get<QualityEvaluationEvent[]>("/v1/quality/evaluations", { ...periodRange(period), limit: "200" }), [get, period]);
  const list = evals.data ?? [];
  const shown = only === "failed" ? list.filter((e) => !e.passed) : list;
  const s = d.summary.data;
  const total = s?.quality.evaluations ?? list.length;
  const passed = s?.quality.passed ?? list.filter((e) => e.passed).length;
  const rolled = (d.policy.data?.techniques ?? []).filter((t) => t.rolledBack);
  const src = qualitySource(total);

  return (
    <div className="stack">
      <div className="grid-3">
        <Metric label="Avaliações no período" value={total ? total.toLocaleString("pt-BR") : "indisponível"} source={src} hint="Quality Guard: testes, schema e amostras" />
        <Metric label="Taxa de aprovação" value={total ? pct(passed / total, 1) : "indisponível"} source={src} hint={total ? `${passed.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}` : undefined} />
        <Metric label="Rollbacks automáticos" value={s ? s.quality.rollbacks.toLocaleString("pt-BR") : "indisponível"} source={s ? qualitySource(s.quality.evaluations || s.quality.rollbacks) : "unavailable"} hint={`${rolled.length} técnica(s) revertida(s) agora`} />
      </div>

      <Card title="Técnicas revertidas">
        {d.policy.error ? (
          <ErrorLine message={`Política indisponível: ${d.policy.error}`} />
        ) : rolled.length === 0 ? (
          <Empty icon={<BadgeCheck size={20} />} title="Nenhuma técnica revertida">
            Quando o Quality Guard detecta regressão (testes, schema, comparação com referência), a técnica é desligada automaticamente e aparece aqui.
          </Empty>
        ) : (
          <ul className="rolled">
            {rolled.map((t) => (
              <RolledRow key={t.name} name={t.name} reason={t.rolledBackReason} observe={d.policy.data?.mode === "observe"} onDone={d.reload} />
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Avaliações"
        aside={
          <div className="seg seg-sm" role="radiogroup" aria-label="Filtrar avaliações">
            {(
              [
                ["all", "Todas"],
                ["failed", "Reprovadas"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={only === k} className={cx(only === k && "on")} onClick={() => setOnly(k)}>
                {l}
              </button>
            ))}
          </div>
        }
      >
        {evals.error ? (
          <ErrorLine message={`Avaliações indisponíveis: ${evals.error}`} />
        ) : shown.length === 0 ? (
          <Empty icon={<BadgeCheck size={20} />} title={evals.loading ? "Carregando…" : only === "failed" ? "Nenhuma avaliação reprovada" : "Nenhuma avaliação no período"}>
            {!evals.loading && only === "all" && "As avaliações aparecem quando o ORBIT aplica técnicas e o Quality Guard confere o resultado (amostragem definida na política)."}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Técnica</th>
                  <th>Método</th>
                  <th>Resultado</th>
                  <th>Projeto</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.evaluationId}>
                    <td className="muted" title={new Date(e.occurredAt).toLocaleString("pt-BR")}>
                      {ago(e.occurredAt)}
                    </td>
                    <td>{techniqueLabel[e.technique] ?? e.technique}</td>
                    <td className="muted">{methodLabel[e.method] ?? e.method}</td>
                    <td>
                      <span className={cx("tag", e.passed ? "tag-ok" : "tag-error")}>{e.passed ? "aprovada" : "reprovada"}</span>
                      {e.score != null && <span className="muted score"> {pct(e.score, 0)}</span>}
                      {e.triggeredRollback && <span className="tag tag-fallback">rollback</span>}
                    </td>
                    <td className="muted">{e.projectKey ?? "—"}</td>
                    <td className="detail-cell">{e.detail ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length >= 200 && <p className="footnote">Mostrando as 200 avaliações mais recentes do período.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

function RolledRow({ name, reason, observe, onDone }: { name: string; reason: string | null; observe: boolean; onDone: () => Promise<void> }) {
  const ops = useOps();
  const act = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <li>
      <div className="rolled-h">
        <RotateCcw size={14} aria-hidden className="warn-ico" />
        <strong>{techniqueLabel[name] ?? name}</strong>
        <span className="t-reason">{reason ?? "sem motivo registrado"}</span>
        {!confirm && (
          <Btn size="sm" onClick={() => setConfirm(true)} disabled={observe} title={observe ? "No modo Observar nenhuma técnica fica ativa" : undefined}>
            Reativar
          </Btn>
        )}
      </div>
      {confirm && (
        <div className="confirm">
          <p>Reativar {techniqueLabel[name] ?? name}? Só esta técnica volta a valer (na próxima requisição); o Quality Guard continua amostrando e reverte de novo se a regressão voltar.</p>
          <div className="row">
            <Btn
              kind="primary"
              busy={act.busy}
              autoFocus
              onClick={async () => {
                const r = await act.run(() => ops.orbitReactivate(name), "Técnica reativada.");
                if (r) {
                  setConfirm(false);
                  await onDone();
                }
              }}
            >
              Reativar
            </Btn>
            <Btn kind="ghost" onClick={() => setConfirm(false)} disabled={act.busy}>
              Cancelar
            </Btn>
          </div>
        </div>
      )}
      <ActionMsg s={act} />
    </li>
  );
}
