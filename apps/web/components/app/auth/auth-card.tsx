import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function AuthCard({ title, subtitle, children, footer, className }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <div className={cn("w-full", className)}>
      <div className="relative overflow-hidden rounded-[24px] border border-line-strong bg-[linear-gradient(180deg,color-mix(in_oklab,var(--m-surface-1)_92%,transparent),color-mix(in_oklab,var(--m-bg-deep)_92%,transparent))] p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,.8),inset_0_1px_0_0_rgba(255,255,255,.05)] backdrop-blur-xl sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-[color-mix(in_oklab,var(--m-neon)_70%,transparent)] to-transparent" />
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[24px]">{title}</h1>
        {subtitle ? <p className="mt-2 text-[14px] leading-relaxed text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-5 text-center text-[13px] text-subtle">{footer}</div> : null}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-[12px] border border-[color-mix(in_oklab,var(--m-error)_35%,transparent)] bg-[color-mix(in_oklab,var(--m-error)_9%,transparent)] px-3.5 py-2.5 text-[13px] text-fg">
      {children}
    </div>
  );
}

export function StatusIcon({ tone, children }: { tone: "success" | "violet" | "error" | "warning"; children: ReactNode }) {
  const color =
    tone === "success" ? "var(--m-success)" : tone === "error" ? "var(--m-error)" : tone === "warning" ? "var(--m-warning)" : "var(--m-neon)";
  return (
    <div
      className="mb-5 grid size-12 place-items-center rounded-[16px] border [&_svg]:size-5"
      style={{ color, borderColor: `color-mix(in oklab, ${color} 40%, transparent)`, background: `color-mix(in oklab, ${color} 10%, transparent)` }}
    >
      {children}
    </div>
  );
}
