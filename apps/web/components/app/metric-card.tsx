import type { ReactNode } from "react";
import type { MeasurementSource } from "@maindy/contracts";
import { MeasurementBadge } from "@/components/ui/measurement-badge";
import { cn } from "@/lib/cn";

export function MetricCard({
  label,
  value,
  source,
  sub,
  icon,
  emphasis,
  unavailable,
  className,
  testId,
}: {
  label: string;
  value: ReactNode;
  source: MeasurementSource;
  sub?: ReactNode;
  icon?: ReactNode;
  emphasis?: boolean;
  /** reason shown instead of a number */
  unavailable?: string | null;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "relative flex min-h-[132px] flex-col overflow-hidden rounded-[18px] border border-line bg-surface-1 p-4 sm:min-h-[148px] sm:p-5",
        emphasis && "border-[color-mix(in_oklab,var(--m-neon)_28%,var(--m-line))]",
        className,
      )}
    >
      {emphasis ? (
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--m-neon)_22%,transparent),transparent)]" />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-medium text-muted sm:text-[13px] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle">
          {icon}
          {label}
        </span>
      </div>
      <div className="mt-3 flex-1">
        {unavailable ? (
          <>
            <div className="text-[22px] font-semibold tracking-[-0.02em] text-subtle">indisponível</div>
            <p className="mt-1 text-[12px] leading-relaxed text-subtle">{unavailable}</p>
          </>
        ) : (
          <>
            <div className="m-num text-[22px] font-semibold leading-tight text-fg sm:text-[28px]">{value}</div>
            {sub ? <div className="mt-1 text-[12px] leading-relaxed text-subtle">{sub}</div> : null}
          </>
        )}
      </div>
      <div className="mt-3">
        <MeasurementBadge source={unavailable ? "unavailable" : source} />
      </div>
    </div>
  );
}
