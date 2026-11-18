import { forwardRef, type ButtonHTMLAttributes, type AnchorHTMLAttributes } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-medium transition-[background,border-color,color,box-shadow,transform] duration-150 ease-out-expo disabled:pointer-events-none disabled:opacity-50 active:translate-y-px select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-violet text-white shadow-[0_0_0_1px_rgba(164,36,255,.35),0_8px_24px_-10px_rgba(143,32,255,.7)] hover:bg-neon",
  secondary: "border border-line-strong bg-surface-2 text-fg hover:border-[color-mix(in_oklab,var(--m-neon)_45%,transparent)] hover:bg-surface-3",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "border border-[color-mix(in_oklab,var(--m-error)_45%,transparent)] bg-[color-mix(in_oklab,var(--m-error)_12%,transparent)] text-error hover:bg-[color-mix(in_oklab,var(--m-error)_20%,transparent)]",
  gold: "bg-gold text-[#1a1306] hover:brightness-105 shadow-[0_8px_24px_-12px_rgba(255,210,31,.6)]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  external,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant; size?: Size; external?: boolean }) {
  if (external) return <a href={href} className={cn(base, variants[variant], sizes[size], className)} {...rest} />;
  return <Link href={href} className={cn(base, variants[variant], sizes[size], className)} {...rest} />;
}
