"use client";

import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { useState } from "react";
import type { PlanDto } from "@maindy/contracts";
import { cn } from "@/lib/cn";
import { comparison } from "./content";
import { formatPrice, isPriceFloor } from "./format";

type Interval = "month" | "year";

function priceFor(p: PlanDto, interval: Interval) {
  if (interval === "year" && p.priceYearlyCents != null) return { perMonth: Math.round(p.priceYearlyCents / 12), total: p.priceYearlyCents };
  if (p.priceMonthlyCents != null) return { perMonth: p.priceMonthlyCents, total: null };
  return null;
}

function yearlySaving(p: PlanDto) {
  if (p.priceMonthlyCents == null || p.priceYearlyCents == null) return 0;
  return Math.round((1 - p.priceYearlyCents / (p.priceMonthlyCents * 12)) * 100);
}

export function Pricing({ plans }: { plans: PlanDto[] }) {
  const [interval, setBilling] = useState<Interval>("month");
  const maxSaving = Math.max(0, ...plans.map(yearlySaving));

  return (
    <div>
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label="Ciclo de cobrança" className="inline-flex rounded-full border border-line bg-surface-1/60 p-1">
          {(
            [
              ["month", "Mensal"],
              ["year", "Anual"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={interval === v}
              onClick={() => setBilling(v)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  setBilling((i) => (i === "month" ? "year" : "month"));
                }
              }}
              tabIndex={interval === v ? 0 : -1}
              className={cn(
                "h-10 rounded-full px-5 text-[14px] transition-colors duration-200",
                interval === v ? "bg-fg text-bg" : "text-muted hover:text-fg",
              )}
            >
              {l}
              {v === "year" && maxSaving > 0 ? <span className={cn("ml-2 font-mono text-[11px]", interval === v ? "text-violet" : "text-success")}>−{maxSaving}%</span> : null}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-subtle">Valores em reais · provisórios até confirmação comercial · impostos conforme a região</p>
      </div>

      <ul className="mt-8 grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const price = priceFor(p, interval);
          const href = `/cadastro?plano=${p.code}${interval === "year" ? "&intervalo=year" : ""}`;
          return (
            <li
              key={p.code}
              className={cn(
                "relative flex flex-col rounded-[24px] border p-7 sm:p-8",
                p.highlighted
                  ? "border-purple/40 bg-[linear-gradient(180deg,rgba(143,32,255,.16),rgba(21,17,46,.6))] shadow-[0_40px_100px_-40px_rgba(164,36,255,.6)]"
                  : "border-line bg-surface-1/40",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[24px] font-medium tracking-[-0.025em] text-fg">{p.name}</h2>
                {p.highlighted ? <span className="m-label text-purple">Recomendado</span> : null}
              </div>
              <p className="mt-2 min-h-[44px] text-[14.5px] text-muted">{p.tagline}</p>
              <div className="mt-8 min-h-[92px]">
                {price ? (
                  <>
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      {isPriceFloor(p) ? <span className="text-[13px] text-muted">a partir de</span> : null}
                      <span className="mk-num text-[48px] text-fg">{formatPrice(price.perMonth, p.currency)}</span>
                      <span className="text-[14px] text-muted">/mês</span>
                    </p>
                    <p className="mt-2 text-[13px] text-subtle">
                      {price.total != null ? `${formatPrice(price.total, p.currency)} cobrados por ano` : "cobrança mensal"}
                      {p.trialDays > 0 ? ` · ${p.trialDays} dias de teste` : ""}
                    </p>
                  </>
                ) : (
                  <p className="mk-num text-[40px] text-fg">Sob consulta</p>
                )}
              </div>
              <Link
                href={href}
                className={cn(
                  "mt-6 inline-flex h-12 w-full items-center justify-center rounded-full text-[15px] font-medium transition-colors duration-200",
                  p.highlighted ? "bg-fg text-bg hover:bg-white" : "border border-line-strong text-fg hover:bg-white/[0.05]",
                )}
              >
                Começar com {p.name}
              </Link>
              <ul className="mt-8 space-y-3 border-t border-line pt-6">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-[14.5px] text-fg/90">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-purple" />
                    {f}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ComparisonTable({ plans }: { plans: PlanDto[] }) {
  const codes = plans.map((p) => p.code);
  return (
    <div className="mk-rail -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">Comparação de recursos entre os planos</caption>
        <thead>
          <tr className="border-b border-line-strong">
            <th scope="col" className="w-[40%] py-4 pr-4 align-bottom">
              <span className="m-label">Recurso</span>
            </th>
            {plans.map((p) => (
              <th key={p.code} scope="col" className="px-3 py-4 text-[16px] font-medium tracking-[-0.02em] text-fg">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        {comparison.map((g) => (
          <tbody key={g.group}>
            <tr>
              <th scope="colgroup" colSpan={codes.length + 1} className="pb-2 pt-8 text-left">
                <span className="m-label text-muted">{g.group}</span>
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.label} className="border-b border-line">
                <th scope="row" className="py-3.5 pr-4 text-[14.5px] font-normal text-muted">
                  {r.label}
                </th>
                {codes.map((c) => {
                  const v = r.values[c];
                  return (
                    <td key={c} className="px-3 py-3.5 text-[14.5px] text-fg">
                      {v === true ? (
                        <>
                          <Check aria-hidden className="size-4 text-purple" />
                          <span className="sr-only">Incluído</span>
                        </>
                      ) : v === false ? (
                        <>
                          <Minus aria-hidden className="size-4 text-subtle" />
                          <span className="sr-only">Não incluído</span>
                        </>
                      ) : (
                        v
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
