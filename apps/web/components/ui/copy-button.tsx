"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

export function CopyButton({ value, label = "Copiar", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked: user can still select the text */
        }
      }}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[8px] border border-line-strong bg-surface-2 px-2 text-[12px] text-muted transition-colors hover:text-fg",
        className,
      )}
      aria-label={copied ? "Copiado" : label}
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span>{copied ? "Copiado" : label}</span>
    </button>
  );
}

export function CodeLine({ value, className }: { value: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-[12px] border border-line bg-bg-deep/70 py-1.5 pl-3 pr-1.5", className)}>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12.5px] text-muted [scrollbar-width:none]">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}
