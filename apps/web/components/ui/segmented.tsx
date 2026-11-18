"use client";
import { cn } from "@/lib/cn";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-[12px] border border-line bg-bg-deep/60 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[10px] px-3 font-medium transition-colors duration-150",
              size === "sm" ? "h-7 text-[12px]" : "h-8 text-[13px]",
              active ? "bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--m-line-strong)]" : "text-subtle hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
