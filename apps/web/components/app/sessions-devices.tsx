"use client";
import { useState } from "react";
import { Apple, Globe, Laptop, LogOut, Monitor, ShieldOff } from "lucide-react";
import { useDevices, useRevokeDevice, useRevokeOtherSessions, useRevokeSession, useSessions } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "./format";

function describeUA(ua: string | null): string {
  if (!ua) return "Navegador desconhecido";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" · ");
}

function ListSkeleton() {
  return (
    <div className="space-y-3 p-5">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function SessionsCard() {
  const q = useSessions();
  const revoke = useRevokeSession();
  const others = useRevokeOtherSessions();
  const toast = useToast();
  const web = q.data?.filter((s) => s.kind === "web") ?? [];
  return (
    <Card>
      <CardHeader
        title="Sessões ativas"
        description="Navegadores conectados à sua conta. Encerre qualquer sessão que você não reconheça."
        action={
          web.filter((s) => !s.current).length ? (
            <Button
              size="sm"
              variant="secondary"
              loading={others.isPending}
              onClick={() => others.mutate(undefined, { onSuccess: () => toast({ tone: "success", title: "Outras sessões encerradas" }), onError: (e) => toast({ tone: "error", title: "Falha", description: errorMessage(e) }) })}
            >
              <LogOut className="size-3.5" aria-hidden /> Encerrar as outras
            </Button>
          ) : null
        }
      />
      <div className="mt-4 border-t border-line">
        {q.isPending ? (
          <ListSkeleton />
        ) : q.isError ? (
          <div className="p-5">
            <ErrorState compact message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          </div>
        ) : web.length === 0 ? (
          <EmptyState title="Nenhuma sessão" className="py-8" />
        ) : (
          <ul className="divide-y divide-line">
            {web.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3.5" data-testid="session-row">
                <Globe className="size-4 shrink-0 text-subtle" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-[13.5px] text-fg">
                    {describeUA(s.userAgent)} {s.current ? <Badge tone="success" className="h-5 text-[11px]">esta sessão</Badge> : null}
                  </p>
                  <p className="text-[12px] text-subtle">
                    {s.ipPrefix ? `IP ${s.ipPrefix} · ` : ""}ativa {relativeTime(s.lastSeenAt)} · criada {relativeTime(s.createdAt)}
                  </p>
                </div>
                {!s.current ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={revoke.isPending && revoke.variables === s.id}
                    onClick={() => revoke.mutate(s.id, { onSuccess: () => toast({ tone: "success", title: "Sessão encerrada" }), onError: (e) => toast({ tone: "error", title: "Falha", description: errorMessage(e) }) })}
                  >
                    Encerrar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function DevicesCard() {
  const q = useDevices();
  const revoke = useRevokeDevice();
  const toast = useToast();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const active = q.data?.filter((d) => !d.revoked) ?? [];
  const revoked = q.data?.filter((d) => d.revoked) ?? [];
  return (
    <Card>
      <CardHeader title="Dispositivos pareados" description="Apps desktop com acesso à organização. Revogar invalida o token do dispositivo imediatamente." />
      <div className="mt-4 border-t border-line">
        {q.isPending ? (
          <ListSkeleton />
        ) : q.isError ? (
          <div className="p-5">
            <ErrorState compact message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          </div>
        ) : active.length + revoked.length === 0 ? (
          <EmptyState icon={<Laptop />} title="Nenhum dispositivo pareado" description="Instale o app e aprove o código de pareamento que ele mostrar." className="py-8" />
        ) : (
          <ul className="divide-y divide-line">
            {[...active, ...revoked].map((d) => {
              const Icon = d.platform === "macos" ? Apple : d.platform === "windows" ? Monitor : Laptop;
              return (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Icon className="size-4 shrink-0 text-subtle" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[13.5px] text-fg">
                      {d.name} {d.revoked ? <Badge tone="neutral" className="h-5 text-[11px]">revogado</Badge> : null}
                    </p>
                    <p className="text-[12px] text-subtle">
                      {d.platform} {d.arch} · app {d.appVersion} · visto {relativeTime(d.lastSeenAt)}
                    </p>
                  </div>
                  {!d.revoked ? (
                    <Button size="sm" variant="ghost" onClick={() => setTarget({ id: d.id, name: d.name })}>
                      <ShieldOff className="size-3.5" aria-hidden /> Revogar
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Dialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Revogar “${target?.name ?? ""}”?`}
        description="O app nesse computador perde o acesso na próxima requisição e precisará ser pareado de novo. O gateway local continua repassando as requisições sem otimização (fail-open)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() =>
                target &&
                revoke.mutate(target.id, {
                  onSuccess: () => {
                    toast({ tone: "success", title: "Dispositivo revogado" });
                    setTarget(null);
                  },
                  onError: (e) => toast({ tone: "error", title: "Falha ao revogar", description: errorMessage(e) }),
                })
              }
            >
              Revogar acesso
            </Button>
          </>
        }
      />
    </Card>
  );
}
