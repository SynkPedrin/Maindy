"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { PERIOD_OPTIONS, resolvePeriod, toDateInput, type PeriodKey } from "@/lib/api/period";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

export function PeriodSelector({ className }: { className?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const period = resolvePeriod(sp);
  const rawKey = (sp.get("periodo") as PeriodKey | null) ?? "7d";
  const activeKey: PeriodKey = rawKey === "custom" && period.key !== "custom" ? "7d" : period.key;
  const [open, setOpen] = useState(false);
  const [de, setDe] = useState(sp.get("de") ?? toDateInput(new Date(Date.now() - 13 * 86_400_000)));
  const [ate, setAte] = useState(sp.get("ate") ?? toDateInput(new Date()));
  const invalid = !de || !ate || de > ate;

  function push(params: Record<string, string | null>) {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v == null) q.delete(k);
      else q.set(k, v);
    }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div role="radiogroup" aria-label="Período" className="inline-flex rounded-[12px] border border-line bg-bg-deep/60 p-0.5">
        {PERIOD_OPTIONS.map((o) => {
          const active = o.key === activeKey;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => (o.key === "custom" ? setOpen(true) : push({ periodo: o.key, de: null, ate: null }))}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[12.5px] font-medium transition-colors",
                active ? "bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--m-line-strong)]" : "text-subtle hover:text-fg",
              )}
            >
              {o.key === "custom" ? <CalendarRange className="size-3.5" aria-hidden /> : null}
              {o.key === "custom" && activeKey === "custom" ? period.label : o.key === "custom" ? <span className="hidden sm:inline">{o.label}</span> : o.label}
              {o.key === "custom" && activeKey !== "custom" ? <span className="sr-only sm:hidden">{o.label}</span> : null}
            </button>
          );
        })}
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Período personalizado"
        description="Escolha as datas de início e fim. Os dados são agregados por dia (ou por hora em períodos de até 2 dias)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={invalid}
              onClick={() => {
                push({ periodo: "custom", de, ate });
                setOpen(false);
              }}
            >
              Aplicar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="De">{({ id }) => <Input id={id} type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />}</Field>
          <Field label="Até" error={invalid && de && ate ? "A data final precisa ser depois da inicial." : null}>
            {({ id }) => <Input id={id} type="date" value={ate} min={de} max={toDateInput(new Date())} onChange={(e) => setAte(e.target.value)} />}
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
