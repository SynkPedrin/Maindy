import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {icon ? (
        <div className="mb-4 grid size-11 place-items-center rounded-[14px] border border-line-strong bg-surface-2 text-muted [&_svg]:size-5">{icon}</div>
      ) : null}
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      {description ? <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-subtle">{description}</p> : null}
      {children ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry, className, compact }: { message: string; onRetry?: () => void; className?: string; compact?: boolean }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-[14px] border border-[color-mix(in_oklab,var(--m-error)_30%,transparent)] bg-[color-mix(in_oklab,var(--m-error)_7%,transparent)] p-4 text-sm",
        compact && "p-3",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">Não foi possível carregar.</p>
        <p className="mt-0.5 text-[13px] text-muted">{message}</p>
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RotateCw className="size-3.5" aria-hidden /> Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}
