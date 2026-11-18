"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CloudOff, RotateCw } from "lucide-react";
import { Orb } from "@/components/brand";
import { Button } from "@/components/ui/button";

export function AppUnavailable({ message }: { message: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid min-h-dvh place-items-center bg-bg-deep px-4">
      <div className="w-full max-w-md rounded-[24px] border border-line-strong bg-surface-1 p-8 text-center">
        <Orb size={56} className="mx-auto mb-5 opacity-80" />
        <div className="mx-auto mb-3 inline-flex items-center gap-2 text-[13px] text-warning">
          <CloudOff className="size-4" aria-hidden /> Painel temporariamente indisponível
        </div>
        <h1 className="text-lg font-semibold text-fg">Não conseguimos carregar sua conta</h1>
        <p className="mt-2 text-sm text-muted">{message} Sua sessão continua válida; tente novamente em instantes.</p>
        <Button className="mt-6" loading={pending} onClick={() => start(() => router.refresh())}>
          <RotateCw className="size-4" aria-hidden /> Tentar de novo
        </Button>
      </div>
    </div>
  );
}
