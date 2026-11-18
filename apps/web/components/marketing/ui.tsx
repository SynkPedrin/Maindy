import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { measurementLabel } from "@maindy/design-system";
import { cn } from "@/lib/cn";
import { DEMO_LABEL } from "@/lib/demo";
import { capabilityLabel, type Capability } from "./content";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1360px] px-5 sm:px-8 lg:px-12", className)}>{children}</div>;
}

/** Editorial index label: `02 —— ORBIT ENGINE` */
export function Eyebrow({ index, children, className }: { index?: string; children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("m-label flex items-center gap-3", className)}>
      {index ? <span className="text-muted">{index}</span> : null}
      {index ? <span aria-hidden className="h-px w-8 bg-line-strong" /> : null}
      <span>{children}</span>
    </p>
  );
}

export function DemoBadge({ className, label = DEMO_LABEL }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/[0.06] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-warning",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warning mk-blink" />
      {label}
    </span>
  );
}

type Source = keyof typeof measurementLabel;
const sourceDot: Record<Source, string> = {
  provider_reported: "bg-purple",
  locally_measured: "bg-success",
  experimentally_estimated: "bg-warning",
  unavailable: "border border-subtle bg-transparent",
};

export function ProvenanceBadge({ source, className }: { source: Source; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white/[0.02] px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.1em] text-muted",
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", sourceDot[source])} />
      {measurementLabel[source]}
    </span>
  );
}

const capStyle: Record<Capability, string> = {
  supported: "border-success/30 text-success bg-success/[0.06]",
  partial: "border-warning/30 text-warning bg-warning/[0.06]",
  not_supported: "border-error/30 text-error bg-error/[0.06]",
  planned: "border-line-strong text-muted",
};

export function CapabilityBadge({ level, className }: { level: Capability; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em]",
        capStyle[level],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {capabilityLabel[level]}
    </span>
  );
}

const btnBase =
  "group relative inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium tracking-[-0.01em] transition-[background-color,color,box-shadow,border-color,transform] duration-200 ease-out-expo focus-visible:outline-offset-4";

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className,
  arrow = true,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  arrow?: boolean;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  const styles = {
    primary:
      "bg-fg text-bg shadow-[0_0_0_1px_rgba(255,255,255,.4),0_12px_40px_-12px_rgba(164,36,255,.7)] hover:shadow-[0_0_0_1px_rgba(255,255,255,.6),0_16px_56px_-10px_rgba(199,36,255,.9)]",
    secondary: "border border-line-strong text-fg hover:border-fg/40 hover:bg-white/[0.04]",
    ghost: "px-0 text-muted hover:text-fg",
  }[variant];
  return (
    <Link href={href} className={cn(btnBase, styles, className)} {...rest}>
      <span>{children}</span>
      {arrow ? (
        <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5" />
      ) : null}
    </Link>
  );
}

export function TextLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 text-[15px] text-fg underline decoration-line-strong underline-offset-[6px] transition-colors hover:decoration-purple",
        className,
      )}
    >
      {children}
      <ArrowUpRight aria-hidden className="size-4 text-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
    </Link>
  );
}

/** Thin decorative orbital arcs echoing the brand film (violet bottom-left, gold top-right). */
export function OrbitArcs({ className, gold = true }: { className?: string; gold?: boolean }) {
  return (
    <svg aria-hidden className={cn("pointer-events-none absolute", className)} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" fill="none">
      <defs>
        <linearGradient id="arc-v" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#C724FF" stopOpacity=".0" />
          <stop offset=".35" stopColor="#C724FF" stopOpacity=".75" />
          <stop offset="1" stopColor="#8F20FF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="arc-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD21F" stopOpacity="0" />
          <stop offset=".55" stopColor="#FFD21F" stopOpacity=".7" />
          <stop offset="1" stopColor="#FFB21F" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M-40 560 C 120 820, 520 930, 900 900" stroke="url(#arc-v)" strokeWidth="1.4" />
      <path d="M-60 600 C 140 860, 560 960, 980 940" stroke="url(#arc-v)" strokeOpacity=".35" strokeWidth="1" />
      {gold ? <path d="M1080 -20 C 1340 60, 1560 260, 1640 520" stroke="url(#arc-g)" strokeWidth="1.4" /> : null}
    </svg>
  );
}
