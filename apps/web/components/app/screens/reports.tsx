"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { FileJson, FileSpreadsheet, FileText, Eye } from "lucide-react";
import { useAudit, useMe, usePeriod } from "@/lib/api/hooks";
import { api, apiUrl, errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/input";
import { MeasurementBadge } from "@/components/ui/measurement-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "../page-intro";
import { formatDateTime, formatMoney } from "../format";

const ReportEvent = z.looseObject({
  eventId: z.string(),
  occurredAt: z.string(),
  connector: z.string(),
  model: z.string(),
  status: z.string(),
  projectKey: z.string().nullable(),
  agentKey: z.string().nullable().optional(),
  pricingVersion: z.string(),
  baselineMethod: z.string(),
  netSavingsMicros: z.number().nullable(),
});
const SavingsReport = z.looseObject({
  reportVersion: z.string().optional(),
  methodVersion: z.string(),
  generatedAt: z.string(),
  period: z.object({ from: z.string(), to: z.string() }),
  currency: z.string(),
  estimatesNotice: z.string().optional(),
  events: z.array(ReportEvent),
  eventsTruncated: z.boolean().optional(),
});

export function ReportsScreen() {
  const period = usePeriod();
  const me = useMe();
  const [currency, setCurrency] = useState("USD");
  const [project, setProject] = useState("");
  const [connector, setConnector] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(false);
  const isAdmin = me.data?.role === "owner" || me.data?.role === "admin";
  const audit = useAudit(isAdmin);
  const qs = `from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}&currency=${currency}`;
  const report = useQuery({ queryKey: ["report", period.from, period.to, currency], queryFn: () => api(`/v1/reports/savings?${qs}&format=json`, SavingsReport), enabled: preview });

  const events = report.data?.events ?? [];
  const options = useMemo(
    () => ({
      projects: [...new Set(events.map((e) => e.projectKey).filter(Boolean))] as string[],
      connectors: [...new Set(events.map((e) => e.connector))],
      statuses: [...new Set(events.map((e) => e.status))],
    }),
    [events],
  );
  const filtered = events.filter((e) => (!project || e.projectKey === project) && (!connector || e.connector === connector) && (!status || e.status === status));
  const previewJson = report.data
    ? JSON.stringify({ ...report.data, events: filtered.slice(0, 20), eventsShown: Math.min(20, filtered.length), eventsMatchingFilters: filtered.length }, null, 2)
    : "";

  return (
    <div>
      <PageIntro
        eyebrow="Relatórios"
        title="Relatórios auditáveis"
        description="Cada relatório traz os IDs dos eventos, a versão de preço usada, o método do baseline e a origem de cada número. A economia é sempre identificada como estimativa contra baseline."
      />
      <Card className="mb-4">
        <CardHeader title="Exportar" description={`Período: ${period.label}. Mude o período no topo da página.`} />
        <div className="flex flex-wrap items-end gap-3 p-5">
          <Field label="Moeda" className="w-32">
            {({ id }) => (
              <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD</option>
                <option value="BRL">BRL</option>
                <option value="EUR">EUR</option>
              </Select>
            )}
          </Field>
          <a href={apiUrl(`/v1/reports/savings?${qs}&format=csv`)} download className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-line-strong bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface-3" data-testid="download-csv">
            <FileSpreadsheet className="size-4" aria-hidden /> Baixar CSV
          </a>
          <a href={apiUrl(`/v1/reports/savings?${qs}&format=pdf`)} download className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-line-strong bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface-3" data-testid="download-pdf">
            <FileText className="size-4" aria-hidden /> Baixar PDF
          </a>
          <Button size="lg" variant={preview ? "ghost" : "primary"} className="h-11" onClick={() => (preview ? report.refetch() : setPreview(true))} loading={report.isFetching}>
            <Eye className="size-4" aria-hidden /> {preview ? "Atualizar prévia" : "Pré-visualizar (JSON)"}
          </Button>
          <MeasurementBadge source="experimentally_estimated" className="ml-auto" />
        </div>
        <p className="border-t border-line px-5 py-3 text-[12px] text-subtle">Os arquivos exportados incluem o período inteiro; os filtros abaixo refinam apenas a pré-visualização.</p>
      </Card>

      {preview ? (
        <Card className="mb-4">
          <CardHeader
            title="Trilha de auditoria — pré-visualização"
            description={report.data ? `${events.length} evento(s) no relatório${report.data.eventsTruncated ? " (truncado)" : ""} · método ${report.data.methodVersion} · gerado ${formatDateTime(report.data.generatedAt)}` : undefined}
            action={report.data ? <CopyButton value={previewJson} label="Copiar JSON" /> : null}
          />
          <div className="p-5">
            {report.isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : report.isError ? (
              <ErrorState message={errorMessage(report.error)} onRetry={() => report.refetch()} />
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <Field label="Projeto">
                    {({ id }) => (
                      <Select id={id} value={project} onChange={(e) => setProject(e.target.value)}>
                        <option value="">Todos</option>
                        {options.projects.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Fonte">
                    {({ id }) => (
                      <Select id={id} value={connector} onChange={(e) => setConnector(e.target.value)}>
                        <option value="">Todas</option>
                        {options.connectors.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Status">
                    {({ id }) => (
                      <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">Todos</option>
                        {options.statuses.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                {report.data?.estimatesNotice ? <p className="mb-3 text-[12.5px] text-subtle">{report.data.estimatesNotice}</p> : null}
                <pre className="m-scroll-thin max-h-[420px] overflow-auto rounded-[12px] border border-line bg-bg-deep/70 p-4 font-mono text-[11.5px] leading-relaxed text-muted" data-testid="report-json">
                  <code>{previewJson}</code>
                </pre>
                {filtered.length ? (
                  <p className="mt-3 text-[12px] text-subtle">
                    Economia líquida dos eventos filtrados: {formatMoney(filtered.reduce((a, e) => a + (e.netSavingsMicros ?? 0), 0), report.data!.currency)} (somente eventos com baseline válido)
                  </p>
                ) : null}
              </>
            )}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Registro de auditoria da organização" description="Ações sensíveis: políticas, pareamentos, cobranças, sessões e exportações." action={<FileJson className="size-4 text-subtle" aria-hidden />} />
        <div className="mt-4 border-t border-line">
          {!isAdmin ? (
            <EmptyState title="Disponível para owner e admin" description="Peça a um administrador da organização para consultar o registro." className="py-8" />
          ) : audit.isPending ? (
            <div className="p-5">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : audit.isError ? (
            <div className="p-5">
              <ErrorState compact message={errorMessage(audit.error)} onRetry={() => audit.refetch()} />
            </div>
          ) : audit.data.length === 0 ? (
            <EmptyState title="Nenhum evento registrado" className="py-8" />
          ) : (
            <ul className="divide-y divide-line">
              {audit.data.slice(0, 30).map((ev) => (
                <li key={ev.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[12.5px]">
                  <code className="font-mono text-fg">{ev.action}</code>
                  {"actorType" in ev ? <Badge tone="outline" className="h-5 text-[10.5px]">{String(ev.actorType)}</Badge> : null}
                  <span className="ml-auto text-subtle">{formatDateTime(ev.createdAt ?? ev.occurredAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
