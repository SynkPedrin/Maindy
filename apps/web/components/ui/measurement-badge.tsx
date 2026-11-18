import type { MeasurementSource } from "@maindy/contracts";
import { measurementLabel } from "@maindy/design-system";
import { Gauge, FlaskConical, Server, CircleSlash } from "lucide-react";
import { cn } from "@/lib/cn";

const meta: Record<MeasurementSource, { icon: typeof Gauge; className: string; hint: string }> = {
  provider_reported: { icon: Server, className: "text-muted border-line-strong", hint: "Valor retornado pelo provedor de IA (objeto usage, API oficial ou OTel da ferramenta)." },
  locally_measured: { icon: Gauge, className: "text-muted border-line-strong", hint: "Medido pelo gateway/SDK maindy. na sua máquina." },
  experimentally_estimated: {
    icon: FlaskConical,
    className: "text-gold border-[color-mix(in_oklab,var(--m-gold)_35%,transparent)]",
    hint: "Diferença contra um baseline validado. É uma estimativa, não um valor faturado.",
  },
  unavailable: { icon: CircleSlash, className: "text-subtle border-line", hint: "Sem fonte confiável para este número." },
};

/** Provenance chip shown next to every number (AGENT-RULES §5). */
export function MeasurementBadge({ source, className, compact }: { source: MeasurementSource; className?: string; compact?: boolean }) {
  const m = meta[source];
  const Icon = m.icon;
  return (
    <span
      title={m.hint}
      data-measurement={source}
      className={cn("inline-flex h-5 max-w-full shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 text-[11px] font-medium leading-none", m.className, className)}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className={compact ? "sr-only" : "truncate"}>{measurementLabel[source]}</span>
    </span>
  );
}
