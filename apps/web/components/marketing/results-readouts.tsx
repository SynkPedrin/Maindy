"use client";

import { cn } from "@/lib/cn";
import { Counter } from "./motion";
import { ProvenanceBadge } from "./ui";

const nInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const dec2 = (v: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const dec1 = (v: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

type Item = {
  value: number;
  format: (v: number) => string;
  unit?: string;
  suffix?: string;
  caption: string;
  source: "locally_measured" | "provider_reported" | "experimentally_estimated";
  accent?: boolean;
};

const items: Item[] = [
  { value: 12_840_392, format: (v) => nInt.format(v), caption: "tokens medidos", source: "locally_measured" },
  { value: 244.68, format: dec2, unit: "US$", caption: "custo registrado no provedor", source: "provider_reported" },
  { value: 167.4, format: dec2, unit: "US$", caption: "economia líquida vs. baseline", source: "experimentally_estimated", accent: true },
  { value: 98.6, format: dec1, suffix: "%", caption: "tarefas aprovadas pelo Quality Guard", source: "locally_measured" },
];

const cell = "border-b border-line py-8 sm:odd:border-r sm:odd:pr-6 sm:even:pl-6 lg:border-b-0 lg:border-r lg:px-6 lg:first:pl-0 lg:last:border-r-0";

export function ResultsReadouts() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-5">
      {items.map((it) => (
        <div key={it.caption} className={cell}>
          <p className={cn("mk-num whitespace-nowrap text-[clamp(2rem,3vw,2.75rem)]", it.accent ? "text-success" : "text-fg")}>
            {it.unit ? <span className="mr-1.5 align-top font-mono text-[12px] tracking-[0.08em] text-muted">{it.unit}</span> : null}
            <Counter value={it.value} format={it.format} />
            {it.suffix ? <span className="text-[0.6em] text-muted">{it.suffix}</span> : null}
          </p>
          <p className="mt-3 text-[13.5px] text-muted">{it.caption}</p>
          <ProvenanceBadge source={it.source} className="mt-3" />
        </div>
      ))}
      <div className={cell}>
        <p className="mk-num text-[clamp(2rem,3vw,2.75rem)] text-subtle">—</p>
        <p className="mt-3 text-[13.5px] text-muted">cota oficial restante — só com fonte oficial</p>
        <ProvenanceBadge source="unavailable" className="mt-3" />
      </div>
    </div>
  );
}
