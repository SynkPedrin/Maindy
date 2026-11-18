"use client";
import { MeasurementBadge } from "@/components/ui/measurement-badge";
import type { MeasurementSource } from "@maindy/contracts";
import { formatMoney, formatTokens } from "./format";

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
  secondary?: string;
}

/** Single-hue magnitude bars (one series → no legend). Value text uses text tokens, never the bar color. */
export function BreakdownBars({ rows, kind, currency = "USD", source, emptyText }: { rows: BreakdownRow[]; kind: "money" | "tokens"; currency?: string; source: MeasurementSource; emptyText: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-subtle">{emptyText}</p>;
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => {
          const w = Math.max(2, (Math.abs(r.value) / max) * 100);
          const text = kind === "money" ? formatMoney(r.value, currency) : `${formatTokens(r.value)} tokens`;
          return (
            <li key={r.key} className="group" title={`${r.label}: ${text}`}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-muted">{r.label}</span>
                <span className="m-num shrink-0 text-fg">
                  {text}
                  {r.secondary ? <span className="ml-2 text-[11.5px] text-subtle">{r.secondary}</span> : null}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-3/60">
                <div className="h-2 rounded-full bg-[var(--m-chart-bar)] transition-[width] duration-300 group-hover:brightness-125" style={{ width: `${w}%`, opacity: r.value < 0 ? 0.45 : 1 }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <MeasurementBadge source={source} />
      </div>
    </div>
  );
}
