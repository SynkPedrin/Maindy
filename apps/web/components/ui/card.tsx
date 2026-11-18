import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative rounded-[18px] border border-line bg-surface-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,.03)] [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(21,17,46,.04)]",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ title, description, action, className, eyebrow }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; eyebrow?: ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="m-label mb-1.5">{eyebrow}</div> : null}
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {description ? <p className="mt-1 text-[13px] leading-relaxed text-subtle">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...rest} />;
}
