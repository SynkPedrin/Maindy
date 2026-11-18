import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageIntro({ eyebrow, title, description, actions, className }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? <div className="m-label mb-2">{eyebrow}</div> : null}
        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[26px]">{title}</h2>
        {description ? <p className="mt-2 text-[14px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
