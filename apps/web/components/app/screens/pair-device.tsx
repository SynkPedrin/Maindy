"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Apple, CheckCircle2, Laptop, Monitor, XCircle } from "lucide-react";
import { usePairDetails, useApprovePairing } from "@/lib/api/hooks";
import { ApiClientError, errorMessage } from "@/lib/api/client";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";

const platformLabel: Record<string, string> = { macos: "macOS", windows: "Windows", linux: "Linux" };

export function PairDeviceScreen() {
  const sp = useSearchParams();
  const code = (sp.get("code") ?? "").toUpperCase();
  const valid = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
  const q = usePairDetails(valid ? code : null);
  const approve = useApprovePairing();
  const [result, setResult] = useState<"approved" | "denied" | null>(null);

  if (!valid) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h2 className="text-lg font-semibold text-fg">Código inválido</h2>
        <p className="mt-2 text-sm text-muted">O código de pareamento tem o formato XXXX-XXXX e aparece no app maindy.</p>
        <ButtonLink href="/app/onboarding" variant="secondary" className="mt-6">
          Voltar ao onboarding
        </ButtonLink>
      </Card>
    );
  }
  if (q.isPending) return <SkeletonCard className="mx-auto max-w-lg" lines={5} />;
  if (q.isError) {
    const notFound = q.error instanceof ApiClientError && (q.error.status === 404 || q.error.status === 410);
    return notFound ? (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <XCircle className="mx-auto size-8 text-error" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold text-fg">Código expirado ou não encontrado</h2>
        <p className="mt-2 text-sm text-muted">Códigos valem por 10 minutos. Abra o app novamente para gerar outro.</p>
      </Card>
    ) : (
      <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
    );
  }

  const d = q.data;
  const name = d.deviceName ?? d.name ?? "Dispositivo sem nome";
  const Icon = d.platform === "macos" ? Apple : d.platform === "windows" ? Monitor : Laptop;
  const decide = (ok: boolean) =>
    approve.mutate(
      { userCode: code, approve: ok },
      {
        onSuccess: () => {
          setResult(ok ? "approved" : "denied");
        },
      },
    );

  if (result) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center" data-testid="pair-result">
        {result === "approved" ? <CheckCircle2 className="mx-auto size-9 text-success" aria-hidden /> : <XCircle className="mx-auto size-9 text-error" aria-hidden />}
        <h2 className="mt-4 text-lg font-semibold text-fg">{result === "approved" ? "Dispositivo aprovado" : "Pareamento recusado"}</h2>
        <p className="mt-2 text-sm text-muted">
          {result === "approved" ? `Volte ao app em “${name}”: ele recebe o acesso automaticamente em alguns segundos.` : "O app não recebeu acesso. Se não foi você, revise suas sessões em Configurações."}
        </p>
        <ButtonLink href={result === "approved" ? "/app/onboarding" : "/app/configuracoes"} variant="secondary" className="mt-6">
          {result === "approved" ? "Continuar onboarding" : "Ver sessões"}
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg overflow-hidden">
      <div className="p-7 text-center">
        <p className="m-label">Pedido de acesso</p>
        <div className="mx-auto mt-5 grid size-16 place-items-center rounded-[20px] border border-line-strong bg-surface-2">
          <Icon className="size-7 text-muted" aria-hidden />
        </div>
        <h2 className="mt-4 text-[18px] font-semibold text-fg">{name}</h2>
        <p className="mt-1 text-[13px] text-subtle">
          {[d.platform ? platformLabel[d.platform] ?? d.platform : null, d.arch, d.appVersion ? `app ${d.appVersion}` : null].filter(Boolean).join(" · ")}
        </p>
        <div className="mx-auto mt-5 w-fit rounded-[12px] border border-line bg-bg-deep/70 px-4 py-2 font-mono text-[20px] tracking-[0.2em] text-fg">{code}</div>
        <p className="mx-auto mt-4 max-w-sm text-[13px] leading-relaxed text-muted">
          Confirme que este é o código exibido no seu app. Ao aprovar, o dispositivo poderá enviar métricas e ler a política do ORBIT da sua organização.
        </p>
        {approve.isError ? <p className="mt-3 text-[13px] text-error">{errorMessage(approve.error)}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
        <Button variant="secondary" size="lg" onClick={() => decide(false)} disabled={approve.isPending}>
          Recusar
        </Button>
        <Button size="lg" onClick={() => decide(true)} loading={approve.isPending && approve.variables?.approve === true}>
          Aprovar
        </Button>
      </div>
    </Card>
  );
}
