"use client";
import * as D from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <D.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-line-strong bg-surface-1 p-6 shadow-2xl outline-none",
            className,
          )}
        >
          <D.Title className="pr-8 text-base font-semibold text-fg">{title}</D.Title>
          {description ? <D.Description className="mt-1.5 text-sm leading-relaxed text-muted">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
          {children ? <div className="mt-5">{children}</div> : null}
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
          <D.Close className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Fechar">
            <X className="size-4" />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
