"use client";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, LineChart } from "lucide-react";
import type { TimeseriesPoint } from "@/lib/api/schemas";
import { MeasurementBadge } from "@/components/ui/measurement-badge";
import { formatMoney } from "./format";

interface Row {
  label: string;
  full: string;
  baseline: number | null;
  optimized: number | null;
}

function axisMoney(v: number, currency: string) {
  const value = v / 1_000_000;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, notation: "compact", maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
}

/** Baseline (dashed, gold) vs. optimized cost (solid, violet). Legend + table view keep identity off color alone. */
export function ComparisonChart({ series, currency = "USD", bucket }: { series: TimeseriesPoint[]; currency?: string; bucket: "hour" | "day" }) {
  const [table, setTable] = useState(false);
  const rows: Row[] = useMemo(() => {
    const short = new Intl.DateTimeFormat("pt-BR", bucket === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" });
    const full = new Intl.DateTimeFormat("pt-BR", bucket === "hour" ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } : { weekday: "short", day: "2-digit", month: "short" });
    return series.map((p) => {
      const d = new Date(p.at);
      return { label: short.format(d), full: full.format(d), baseline: p.baselineMicros, optimized: p.optimizedMicros == null ? null : p.optimizedMicros + (p.overheadMicros ?? 0) };
    });
  }, [series, bucket]);
  const hasBaseline = rows.some((r) => (r.baseline ?? 0) > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
        <span className="flex items-center gap-2">
          <svg width="22" height="8" aria-hidden>
            <line x1="1" y1="4" x2="21" y2="4" stroke="var(--m-chart-baseline)" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
          </svg>
          Baseline sem maindy.
          <MeasurementBadge source="experimentally_estimated" compact />
        </span>
        <span className="flex items-center gap-2">
          <svg width="22" height="8" aria-hidden>
            <line x1="1" y1="4" x2="21" y2="4" stroke="var(--m-chart-optimized)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Custo otimizado (IA + overhead)
          <MeasurementBadge source="provider_reported" compact />
        </span>
        <button type="button" onClick={() => setTable((t) => !t)} className="ml-auto inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-subtle hover:bg-surface-2 hover:text-fg" aria-pressed={table}>
          {table ? <LineChart className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
          {table ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {table ? (
        <div className="m-scroll-thin max-h-[280px] overflow-auto rounded-[12px] border border-line">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Custo baseline vs. otimizado por período</caption>
            <thead className="sticky top-0 bg-surface-2 text-left text-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">Período</th>
                <th className="px-3 py-2 text-right font-medium">Baseline</th>
                <th className="px-3 py-2 text-right font-medium">Otimizado</th>
                <th className="px-3 py-2 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody className="m-num">
              {rows.map((r) => (
                <tr key={r.full} className="border-t border-line">
                  <td className="px-3 py-2 text-muted">{r.full}</td>
                  <td className="px-3 py-2 text-right">{r.baseline == null ? "—" : formatMoney(r.baseline, currency)}</td>
                  <td className="px-3 py-2 text-right">{r.optimized == null ? "—" : formatMoney(r.optimized, currency)}</td>
                  <td className="px-3 py-2 text-right text-success">{r.baseline == null || r.optimized == null ? "—" : formatMoney(r.baseline - r.optimized, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="m-chart h-[260px] w-full xl:h-[440px]" role="img" aria-label={`Gráfico de custo baseline versus otimizado em ${rows.length} períodos.${hasBaseline ? "" : " Sem baseline válido no período."}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="m-opt-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--m-chart-optimized)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--m-chart-optimized)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} dy={6} />
              <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => axisMoney(v, currency)} />
              <Tooltip
                cursor={{ stroke: "var(--m-line-strong)", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as Row;
                  return (
                    <div className="m-num rounded-[12px] border border-line-strong bg-surface-2 px-3 py-2.5 text-[12.5px] shadow-xl">
                      <div className="mb-1.5 text-subtle">{r.full}</div>
                      <div className="flex justify-between gap-6">
                        <span className="text-muted">Baseline</span>
                        <span className="text-fg">{r.baseline == null ? "—" : formatMoney(r.baseline, currency)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-muted">Otimizado</span>
                        <span className="text-fg">{r.optimized == null ? "—" : formatMoney(r.optimized, currency)}</span>
                      </div>
                      {r.baseline != null && r.optimized != null ? (
                        <div className="mt-1 flex justify-between gap-6 border-t border-line pt-1">
                          <span className="text-muted">Economia estimada</span>
                          <span className="text-success">{formatMoney(r.baseline - r.optimized, currency)}</span>
                        </div>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="optimized" stroke="var(--m-chart-optimized)" strokeWidth={2} fill="url(#m-opt-fill)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--m-surface-1)" }} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="baseline" stroke="var(--m-chart-baseline)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--m-surface-1)" }} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
