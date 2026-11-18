import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "violet" | "gold" | "success" | "warning" | "error" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted",
  violet: "bg-[color-mix(in_oklab,var(--m-neon)_16%,transparent)] text-[color-mix(in_oklab,var(--m-purple)_65%,var(--m-fg))]",
  gold: "bg-[color-mix(in_oklab,var(--m-gold)_14%,transparent)] text-gold",
  success: "bg-[color-mix(in_oklab,var(--m-success)_14%,transparent)] text-success",
  warning: "bg-[color-mix(in_oklab,var(--m-warning)_14%,transparent)] text-warning",
  error: "bg-[color-mix(in_oklab,var(--m-error)_14%,transparent)] text-error",
  outline: "border border-line-strong text-muted",
};

export function Badge({ tone = "neutral", className, dot, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium", tones[tone], className)} {...rest}>
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
