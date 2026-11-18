"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppWindow, Download } from "lucide-react";
import type { ConnectorKind } from "@maindy/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Deep link handled by the desktop app (validated there against an allowlist of connector kinds). */
export function appIntegrationUrl(kind: ConnectorKind): string {
  return `maindy://integrations/${kind}`;
}

/** If the page is still visible this long after the click, the app probably isn't installed. */
const FALLBACK_MS = 1500;

/**
 * "Abrir no app maindy.": opens the desktop app directly on this connector's screen (connect form or
 * install flow). Browsers give no reliable "handler missing" signal, so if the page didn't lose
 * visibility/focus within ~1.5 s we offer the download — the app may still open (e.g. after the browser's
 * own confirmation dialog), so the hint is phrased as a question.
 */
export function OpenInAppButton({ kind, size = "sm", variant = "primary", className, label = "Abrir no app maindy." }: { kind: ConnectorKind; size?: "sm" | "md"; variant?: "primary" | "secondary"; className?: string; label?: string }) {
  const [missing, setMissing] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  function open() {
    cleanup.current?.();
    setMissing(false);
    let left = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") left = true;
    };
    const onBlur = () => {
      left = true;
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    const timer = window.setTimeout(() => {
      if (!left && document.visibilityState === "visible") setMissing(true);
      cleanup.current?.();
    }, FALLBACK_MS);
    cleanup.current = () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      cleanup.current = null;
    };
    window.location.href = appIntegrationUrl(kind);
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      <Button size={size} variant={variant} onClick={open} data-testid={`open-app-${kind}`}>
        <AppWindow className="size-3.5" aria-hidden /> {label}
      </Button>
      {missing ? (
        <span role="status" className="text-[12.5px] text-subtle">
          App não encontrado?{" "}
          <Link href="/app/download" className="inline-flex items-center gap-1 text-fg underline-offset-4 hover:underline">
            <Download className="size-3.5" aria-hidden /> Baixe aqui
          </Link>
        </span>
      ) : null}
    </span>
  );
}
