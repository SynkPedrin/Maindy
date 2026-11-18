"use client";
import { useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { Check, ChevronDown, Clock, Minus, Plug, X, KeyRound, RefreshCw } from "lucide-react";
import type { CapabilityLevel, ConnectorCapabilities, ConnectorDto, ConnectorStatus } from "@maindy/contracts";
import { connectorStatusLabel } from "@maindy/design-system";
import { useConnectors, useUpdateConnector } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { PageIntro } from "../page-intro";
import { ConnectorSetup } from "../connector-setup";
import { OpenInAppButton } from "../open-in-app";
import { relativeTime } from "../format";

export const statusTone: Record<ConnectorStatus, "neutral" | "violet" | "success" | "warning" | "outline"> = {
  not_connected: "neutral",
  connected_read_only: "violet",
  optimization_active: "success",
  attention: "warning",
  unavailable: "outline",
};

const capLabel: Record<keyof ConnectorCapabilities, string> = {
  observeUsage: "Uso (tokens)",
  observeCost: "Custo",
  officialQuota: "Cota oficial",
  cache: "Cache",
  compression: "Compressão",
  routing: "Roteamento",
  qualityGuard: "Quality Guard",
};
const levelLabel: Record<CapabilityLevel, string> = { supported: "Suportado", partial: "Parcial", planned: "Planejado", not_supported: "Não suportado" };

function LevelIcon({ level }: { level: CapabilityLevel }) {
  const cls = "size-3.5";
  const node =
    level === "supported" ? <Check className={cn(cls, "text-success")} /> : level === "partial" ? <Minus className={cn(cls, "text-warning")} /> : level === "planned" ? <Clock className={cn(cls, "text-subtle")} /> : <X className={cn(cls, "text-subtle opacity-70")} />;
  return (
    <span className="inline-flex items-center justify-center" title={levelLabel[level]}>
      {node}
      <span className="sr-only">{levelLabel[level]}</span>
    </span>
  );
}

function credentialPlace(ref: string | null) {
  if (!ref) return null;
  const [scheme] = ref.split(":");
  return scheme === "keychain" ? "Keychain / Credential Manager do dispositivo" : scheme === "env" ? "Variável de ambiente local" : ref;
}

function ConnectorCard({ c }: { c: ConnectorDto }) {
  const update = useUpdateConnector();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const caps = Object.entries(c.capabilities) as [keyof ConnectorCapabilities, CapabilityLevel][];
  const place = credentialPlace(c.credentialRef);
  return (
    <Card className="flex flex-col" data-testid={`connector-${c.kind}`}>
      <div className="flex items-start justify-between gap-3 p-5 pb-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-fg">{c.name}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-subtle">{c.description}</p>
        </div>
        <Badge tone={statusTone[c.status]} dot data-status={c.status}>
          {connectorStatusLabel[c.status]}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 text-[12px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <RefreshCw className="size-3.5" aria-hidden /> Última sincronização: {c.lastSyncAt ? relativeTime(c.lastSyncAt) : "nunca"}
        </span>
        {place ? (
          <span className="inline-flex items-center gap-1.5">
            <KeyRound className="size-3.5" aria-hidden /> Segredo em: {place}
          </span>
        ) : null}
      </div>
      <div className="mx-5 mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-[12px] border border-line bg-bg-deep/40 p-3 sm:grid-cols-4">
        {caps.map(([k, lvl]) => (
          <div key={k} className="flex items-center gap-2 text-[12px]">
            <LevelIcon level={lvl} />
            <span className={lvl === "not_supported" ? "text-subtle" : "text-muted"}>{capLabel[k]}</span>
          </div>
        ))}
      </div>
      {c.limitations.length ? (
        <ul className="mx-5 mt-3 space-y-1 text-[12.5px] leading-relaxed text-subtle">
          {c.limitations.map((l) => (
            <li key={l} className="flex gap-2">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-subtle" />
              {l}
            </li>
          ))}
        </ul>
      ) : null}
      {c.kind !== "chat_apps" && c.status !== "unavailable" ? (
        <div className="mx-5 mt-4">
          <OpenInAppButton kind={c.kind} variant={c.status === "not_connected" ? "primary" : "secondary"} />
          <p className="mt-1.5 text-[12px] text-subtle">Abre o app direto nesta integração, com o formulário ou a instalação prontos.</p>
        </div>
      ) : null}
      <Accordion.Root type="single" collapsible className="mt-4 border-t border-line">
        <Accordion.Item value="setup">
          <Accordion.Header className="flex">
            <Accordion.Trigger className="group flex flex-1 items-center justify-between px-5 py-3.5 text-left text-[13px] font-medium text-subtle hover:bg-surface-2/50 hover:text-fg">
              Como configurar manualmente
              <ChevronDown className="size-4 text-subtle transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="px-5 pb-5">
            <ConnectorSetup kind={c.kind} />
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
      {c.status !== "not_connected" && c.status !== "unavailable" ? (
        <div className="flex justify-end border-t border-line px-5 py-3">
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            Desconectar
          </Button>
          <Dialog
            open={confirm}
            onOpenChange={setConfirm}
            title={`Desconectar ${c.name}?`}
            description="A maindy. deixa de considerar esta fonte. O segredo continua no seu dispositivo; remova-o pelo app se quiser."
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirm(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  loading={update.isPending}
                  onClick={() =>
                    update.mutate(
                      { kind: c.kind, status: "not_connected" },
                      {
                        onSuccess: () => {
                          setConfirm(false);
                          toast({ tone: "success", title: `${c.name} desconectado` });
                        },
                        onError: (e) => toast({ tone: "error", title: "Não foi possível desconectar", description: errorMessage(e) }),
                      },
                    )
                  }
                >
                  Desconectar
                </Button>
              </>
            }
          />
        </div>
      ) : null}
    </Card>
  );
}

export function ConnectionsScreen() {
  const q = useConnectors();
  const connected = q.data?.filter((c) => c.status === "connected_read_only" || c.status === "optimization_active").length ?? 0;
  return (
    <div>
      <PageIntro
        eyebrow="Integrações"
        title="Fontes autorizadas"
        description="Cada fonte mostra exatamente o que conseguimos medir e otimizar. O status vem do seu gateway — nada aparece como conectado sem confirmação real."
        actions={q.data ? <Badge tone={connected ? "success" : "neutral"}>{connected} de {q.data.length} conectadas</Badge> : null}
      />
      {q.isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={6} />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Plug />} title="Catálogo vazio" description="A API não retornou conectores. Tente novamente mais tarde." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {q.data.map((c) => (
              <ConnectorCard key={c.kind} c={c} />
            ))}
          </div>
          <Card className="mt-6 overflow-hidden">
            <div className="px-5 pt-5">
              <h2 className="text-[15px] font-semibold text-fg">Matriz de capacidades</h2>
              <p className="mt-1 text-[13px] text-subtle">O que cada fonte permite hoje. “Parcial” e “Não suportado” refletem limites das interfaces oficiais dos provedores.</p>
            </div>
            <div className="m-scroll-thin mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-[12.5px]">
                <thead>
                  <tr className="border-y border-line bg-surface-2/50 text-left text-subtle">
                    <th className="px-5 py-2.5 font-medium">Fonte</th>
                    {Object.values(capLabel).map((l) => (
                      <th key={l} className="px-2 py-2.5 text-center font-medium">
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((c) => (
                    <tr key={c.kind} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 font-medium text-fg">{c.name}</td>
                      {(Object.keys(capLabel) as (keyof ConnectorCapabilities)[]).map((k) => (
                        <td key={k} className="px-2 py-2.5 text-center">
                          <LevelIcon level={c.capabilities[k]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-4 border-t border-line px-5 py-3 text-[12px] text-subtle">
              {(Object.keys(levelLabel) as CapabilityLevel[]).map((l) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <LevelIcon level={l} /> {levelLabel[l]}
                </span>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
