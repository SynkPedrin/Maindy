import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { DEMO_LABEL } from "@/lib/demo";
import { cn } from "@/lib/cn";

/**
 * Every simulated number must render inside this frame (AGENT-RULES §5).
 * The label is always visible and the region is announced to assistive tech.
 */
export function DemoFrame({ children, className, note }: { children: ReactNode; className?: string; note?: ReactNode }) {
  return (
    <section
      data-demo="true"
      aria-label={DEMO_LABEL}
      className={cn(
        "relative rounded-[22px] border border-dashed border-[color-mix(in_oklab,var(--m-gold)_45%,transparent)] bg-[color-mix(in_oklab,var(--m-gold)_3%,transparent)] p-3 sm:p-4",
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-gold px-2.5 text-[12px] font-semibold text-[#1a1306]">
          <FlaskConical className="size-3.5" aria-hidden />
          {DEMO_LABEL}
        </span>
        {note ? <span className="text-xs text-subtle">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}
