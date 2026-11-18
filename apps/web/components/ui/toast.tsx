"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

const ToastCtx = createContext<{ toast: (t: Omit<ToastItem, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === "error" ? 7000 : 4200);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertTriangle : Info;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                role={t.tone === "error" ? "alert" : "status"}
                className="pointer-events-auto flex items-start gap-3 rounded-[14px] border border-line-strong bg-surface-2 p-3.5 shadow-2xl"
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", t.tone === "success" ? "text-success" : t.tone === "error" ? "text-error" : "text-muted")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{t.title}</p>
                  {t.description ? <p className="mt-0.5 text-[13px] text-muted">{t.description}</p> : null}
                </div>
                <button onClick={() => dismiss(t.id)} className="text-subtle hover:text-fg" aria-label="Fechar aviso">
                  <X className="size-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast fora do ToastProvider");
  return ctx.toast;
}
