import { Download, FileSpreadsheet, FileText, FolderOpen, RefreshCw } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useAction, useApp, useOps, useResource } from "../../data";
import type { ExportView } from "../../types";
import { ActionMsg, Btn, Card, Empty, ErrorLine, Metric, SourceBadge, ago, cx, money, pct, tokens } from "../../ui";

type Preset = "7d" | "30d" | "90d" | "month" | "prev_month" | "custom";

const presetLabel: Record<Preset, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  month: "Este mês",
  prev_month: "Mês passado",
  custom: "Personalizado",
};

const DAY = 86_400_000;
const dateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeFor(p: Preset, customFrom: string, customTo: string): { from: string; to: string } | null {
  const now = new Date();
  switch (p) {
    case "7d":
    case "30d":
    case "90d": {
      const days = p === "7d" ? 7 : p === "30d" ? 30 : 90;
      return { from: new Date(now.getTime() - days * DAY).toISOString(), to: now.toISOString() };
    }
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() };
    case "prev_month":
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(), to: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
    case "custom": {
      if (!customFrom || !customTo) return null;
      const f = new Date(`${customFrom}T00:00:00`);
      const t = new Date(`${customTo}T00:00:00`);
      t.setDate(t.getDate() + 1); // inclusive end day
      if (!(f < t) || t.getTime() - f.getTime() > 366 * DAY) return null;
      return { from: f.toISOString(), to: (t > now ? now : t).toISOString() };
    }
  }
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function Reports() {
  const { demo } = useApp();
  const ops = useOps();
  const [preset, setPreset] = useState<Preset>("30d");
  const [cFrom, setCFrom] = useState(dateInput(new Date(Date.now() - 14 * DAY)));
  const [cTo, setCTo] = useState(dateInput(new Date()));
  const [ask, setAsk] = useState(true);
  const range = useMemo(() => rangeFor(preset, cFrom, cTo), [preset, cFrom, cTo]);
  const preview = useResource(async () => (range ? ops.reportPreview(range.from, range.to) : null), [ops, range?.from.slice(0, 13), range?.to.slice(0, 13)]);
  const [saved, setSaved] = useState<ExportView | null>(null);
  const exp = useAction();
  const reveal = useAction();
  const fid = useId();
  const r = preview.data;
  const s = r?.summary;

  const doExport = async (format: "csv" | "pdf") => {
    if (!range) return;
    setSaved(null);
    reveal.reset();
    const v = await exp.run(
      () => ops.reportExport(range.from, range.to, format, ask),
      (x) => (x.cancelled ? "Exportação cancelada." : demo ? `Demonstração: nenhum arquivo foi gravado (${x.fileName}).` : `${format.toUpperCase()} salvo (${kb(x.bytes)}).`),
    );
    if (v && !v.cancelled) setSaved(v);
  };

  return (
    <div className="stack">
      <Card title="Período do relatório">
        <div className="period-pick">
          <div className="seg" role="radiogroup" aria-label="Período">
            {(Object.keys(presetLabel) as Preset[]).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={preset === p} className={cx(preset === p && "on")} onClick={() => setPreset(p)}>
                {presetLabel[p]}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="date-range">
              <label htmlFor={`${fid}-f`}>De</label>
              <input id={`${fid}-f`} type="date" value={cFrom} max={cTo} onChange={(e) => setCFrom(e.target.value)} />
              <label htmlFor={`${fid}-t`}>até</label>
              <input id={`${fid}-t`} type="date" value={cTo} min={cFrom} max={dateInput(new Date())} onChange={(e) => setCTo(e.target.value)} />
            </div>
          )}
        </div>
        {range ? (
          <p className="muted">
            {fmtDate(range.from)} → {fmtDate(range.to)} · relatório auditável com IDs de evento, versão de preço e método de baseline.
          </p>
        ) : (
          <p className="field-err">Período inválido (o início precisa ser antes do fim; máximo de 366 dias).</p>
        )}
        <div className="export-row">
          <Btn kind="primary" busy={exp.busy} disabled={!range} icon={<FileSpreadsheet size={15} aria-hidden />} onClick={() => void doExport("csv")}>
            Exportar CSV
          </Btn>
          <Btn kind="primary" busy={exp.busy} disabled={!range} icon={<FileText size={15} aria-hidden />} onClick={() => void doExport("pdf")}>
            Exportar PDF
          </Btn>
          <label className="check-inline">
            <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} />
            Perguntar onde salvar {ask ? "" : "(salva direto em Downloads)"}
          </label>
        </div>
        <ActionMsg s={exp} />
        {saved?.path && (
          <div className="saved" role="status">
            <Download size={15} aria-hidden />
            <code title={saved.path}>{saved.path}</code>
            {demo && <span className="chip chip-sm chip-sandbox">simulado</span>}
            <Btn size="sm" busy={reveal.busy} disabled={demo} icon={<FolderOpen size={13} aria-hidden />} onClick={() => void reveal.run(() => ops.revealPath(saved.path!))}>
              Mostrar no Finder
            </Btn>
          </div>
        )}
        <ActionMsg s={reveal} />
      </Card>

      <Card
        title="Prévia (JSON)"
        aside={
          <Btn size="sm" kind="ghost" busy={preview.loading} icon={<RefreshCw size={13} aria-hidden />} onClick={() => void preview.reload()} disabled={!range}>
            Atualizar
          </Btn>
        }
      >
        {preview.error ? (
          <ErrorLine message={`Prévia indisponível: ${preview.error}`} />
        ) : !r || !s ? (
          <p className="muted">{preview.loading ? "Gerando prévia…" : "Escolha um período."}</p>
        ) : s.requests === 0 ? (
          <Empty icon={<FileText size={20} />} title="Nenhuma requisição no período">
            O relatório sai mesmo assim, com totais zerados e as definições do método.
          </Empty>
        ) : (
          <>
            <div className="grid-4">
              <Metric label="Requisições" value={s.requests.toLocaleString("pt-BR")} source={s.optimizedAiCost.source} hint={`${pct(s.baselineCoverage)} com baseline válido`} />
              <Metric label="Custo real de IA" value={money(s.optimizedAiCost)} source={s.optimizedAiCost.source} />
              <Metric label="Custo sem maindy. (baseline)" value={money(s.baselineCost)} source={s.baselineCost.source} />
              <Metric label="Economia líquida" value={money(s.netSavings)} source={s.netSavings.source} tone="success" hint={`overhead ${money(s.overheadCost)}`} />
            </div>
            <p className="footnote estimates">{r.estimatesNotice}</p>
            <h4 className="sub-h">
              Trilha de auditoria · {r.events.length} de {r.eventsTotal.toLocaleString("pt-BR")} eventos {r.eventsTruncated ? "(relatório truncado no servidor)" : ""}
            </h4>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th>Quando</th>
                    <th>Modelo</th>
                    <th className="num">Tokens</th>
                    <th className="num">Custo</th>
                    <th>Baseline</th>
                    <th className="num">Economia líquida</th>
                  </tr>
                </thead>
                <tbody>
                  {r.events.map((e) => (
                    <tr key={e.eventId}>
                      <td>
                        <code title={e.eventId}>{e.eventId.slice(0, 8)}</code>
                      </td>
                      <td className="muted">{ago(e.occurredAt)}</td>
                      <td>
                        <code>{e.model}</code>
                      </td>
                      <td className="num">
                        {tokens(e.inputTokens + e.outputTokens)} <SourceBadge source={e.usageSource} compact />
                      </td>
                      <td className="num">
                        {money({ micros: e.costMicros, currency: e.currency, source: e.costSource })} <SourceBadge source={e.costSource} compact />
                      </td>
                      <td className="muted">
                        <code>{e.baselineMethod}</code>
                      </td>
                      <td className="num">
                        {e.netSavingsMicros == null ? (
                          <span className="muted">sem baseline</span>
                        ) : (
                          <>
                            {money({ micros: e.netSavingsMicros, currency: e.currency, source: e.baselineSource ?? "experimentally_estimated" })}{" "}
                            <SourceBadge source={e.baselineSource ?? "unavailable"} compact />
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="footnote">
              Método <code>{r.methodVersion}</code> · relatório <code>{r.reportVersion}</code> · gerado {ago(r.generatedAt)} para {r.organization.name}.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
