import { SAVINGS_METHOD_VERSION, type MeasurementSource, type SavingsSummary } from "@maindy/contracts";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import PDFDocument from "pdfkit";
import type { DbOrTx } from "../db/client.js";
import { organizations, requestUsage } from "../db/schema.js";
import { computeSummary, netSavingsMicros } from "../savings/math.js";
import { loadAggregate, loadBuckets, loadQuality } from "../savings/repo.js";

export const REPORT_VERSION = "maindy-savings-report-v1";
export const MAX_REPORT_EVENTS = 50_000;
const PDF_EVENT_ROWS = 400;

export const METHOD_DEFINITIONS: { term: string; definition: string }[] = [
  { term: "baseline_cost", definition: "Custo estimado da requisição equivalente sem a maindy. Só existe quando há um método de baseline válido." },
  { term: "cache_replay", definition: "Hit de cache: baseline = custo medido da resposta original armazenada (tokens reais x preço vigente)." },
  { term: "pre_optimization_tokens", definition: "Compressão/deduplicação: baseline = custo com os tokens de entrada ANTES da técnica (contados localmente) + saída real." },
  { term: "paired_sample", definition: "Experimentos pareados (shadow) em amostras controladas." },
  { term: "none", definition: "Sem baseline válido: a requisição NÃO entra no cálculo de economia." },
  { term: "optimized_ai_cost", definition: "Custo real de IA pago ao provedor (0 em hit de cache)." },
  { term: "gross_savings", definition: "baseline_cost - optimized_ai_cost, somente sobre requisições com baseline válido." },
  {
    term: "net_savings",
    definition:
      "baseline_cost - (optimized_ai_cost das requisições com baseline + overhead_cost de TODAS as requisições do período). Conservador: todo custo extra da maindy é descontado.",
  },
  { term: "efficiency_multiplier", definition: "baseline_cost / (optimized_ai_cost com baseline + overhead_cost). Nulo quando não há baseline ou o denominador é zero." },
  { term: "baseline_coverage", definition: "Fração das requisições com baseline válido. Transparência sobre quanto do uso foi comparado." },
  { term: "descontos nativos", definition: "Descontos já oferecidos pelo provedor (ex.: prompt caching nativo) ficam dentro do baseline e não contam como economia da maindy." },
];

export const SOURCE_DEFINITIONS: Record<MeasurementSource, string> = {
  provider_reported: "Informado pelo provedor (objeto usage, API administrativa, OTel oficial da ferramenta).",
  locally_measured: "Medido pela maindy na sua máquina (gateway/SDK), ex.: contagem local de tokens.",
  experimentally_estimated: "Estimativa contrafactual contra um baseline validado (toda economia é deste tipo).",
  unavailable: "Sem fonte confiável — exibido como indisponível, nunca como número.",
};

export const ESTIMATES_NOTICE =
  "Valores de baseline e economia são ESTIMATIVAS rotuladas (experimentally_estimated): representam o custo que a mesma carga teria sem a maindy, calculado pelos métodos abaixo. Custos reais vêm do provedor ou de medição local e trazem a fonte ao lado. Requisições sem baseline válido não entram na economia.";

export interface ReportEvent {
  eventId: string;
  occurredAt: string;
  connector: string;
  provider: string;
  model: string;
  endpoint: string;
  status: string;
  projectKey: string | null;
  agentKey: string | null;
  pricingVersion: string;
  baselineMethod: string;
  validBaseline: boolean;
  currency: string;
  costMicros: number;
  costSource: string;
  baselineCostMicros: number | null;
  baselineSource: string | null;
  overheadMicros: number;
  overheadSource: string;
  grossSavingsMicros: number | null;
  netSavingsMicros: number | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  tokensAvoided: number;
  usageSource: string;
  techniquesApplied: string[];
  cacheStatus: string;
}

export interface SavingsReport {
  reportVersion: string;
  methodVersion: string;
  generatedAt: string;
  organization: { id: string; name: string; slug: string };
  period: { from: string; to: string };
  currency: string;
  estimatesNotice: string;
  summary: SavingsSummary;
  definitions: typeof METHOD_DEFINITIONS;
  sources: typeof SOURCE_DEFINITIONS;
  daily: { day: string; requests: number; requestsWithBaseline: number; costMicros: number; baselineMicros: number; overheadMicros: number; netSavingsMicros: number }[];
  events: ReportEvent[];
  eventsTruncated: boolean;
}

export async function buildSavingsReport(db: DbOrTx, orgId: string, from: Date, to: Date, currency: string): Promise<SavingsReport> {
  const p = { orgId, from, to, currency };
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const [agg, quality, days] = await Promise.all([loadAggregate(db, p), loadQuality(db, p), loadBuckets(db, p, "day")]);
  const rows = await db
    .select()
    .from(requestUsage)
    .where(and(eq(requestUsage.organizationId, orgId), gte(requestUsage.occurredAt, from), lt(requestUsage.occurredAt, to), eq(requestUsage.costCurrency, currency)))
    .orderBy(asc(requestUsage.occurredAt), asc(requestUsage.id))
    .limit(MAX_REPORT_EVENTS + 1);
  const events: ReportEvent[] = rows.slice(0, MAX_REPORT_EVENTS).map((r) => {
    const valid = r.baselineCostMicros !== null && r.baselineMethod !== "none" && r.baselineCurrency === r.costCurrency;
    return {
      eventId: r.eventId,
      occurredAt: r.occurredAt.toISOString(),
      connector: r.connector,
      provider: r.provider,
      model: r.model,
      endpoint: r.endpoint,
      status: r.status,
      projectKey: r.projectKey,
      agentKey: r.agentKey,
      pricingVersion: r.pricingVersion,
      baselineMethod: r.baselineMethod,
      validBaseline: valid,
      currency: r.costCurrency,
      costMicros: r.costMicros,
      costSource: r.costSource,
      baselineCostMicros: r.baselineCostMicros,
      baselineSource: r.baselineSource,
      overheadMicros: r.overheadMicros,
      overheadSource: r.overheadSource,
      grossSavingsMicros: valid ? r.baselineCostMicros! - r.costMicros : null,
      netSavingsMicros: valid ? r.baselineCostMicros! - r.costMicros - r.overheadMicros : null,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cachedInputTokens: r.cachedInputTokens,
      tokensAvoided: r.tokensAvoided,
      usageSource: r.usageSource,
      techniquesApplied: r.techniques.filter((t) => t.applied).map((t) => t.name),
      cacheStatus: r.cacheStatus,
    };
  });
  return {
    reportVersion: REPORT_VERSION,
    methodVersion: SAVINGS_METHOD_VERSION,
    generatedAt: new Date().toISOString(),
    organization: { id: orgId, name: org?.name ?? "", slug: org?.slug ?? "" },
    period: { from: from.toISOString(), to: to.toISOString() },
    currency,
    estimatesNotice: ESTIMATES_NOTICE,
    summary: computeSummary(agg, quality, { from, to, currency }),
    definitions: METHOD_DEFINITIONS,
    sources: SOURCE_DEFINITIONS,
    daily: days.map(({ t, agg: d }) => ({
      day: t.toISOString().slice(0, 10),
      requests: d.requests,
      requestsWithBaseline: d.requestsWithBaseline,
      costMicros: d.costMicros,
      baselineMicros: d.baselineMicros,
      overheadMicros: d.overheadMicros,
      netSavingsMicros: netSavingsMicros(d),
    })),
    events,
    eventsTruncated: rows.length > MAX_REPORT_EVENTS,
  };
}

/* ------------------------------- CSV (RFC 4180) ------------------------------- */

export function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("|") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  "organization_id",
  "event_id",
  "occurred_at",
  "connector",
  "provider",
  "model",
  "endpoint",
  "status",
  "project_key",
  "agent_key",
  "pricing_version",
  "baseline_method",
  "valid_baseline",
  "currency",
  "cost_micros",
  "cost_source",
  "baseline_cost_micros",
  "baseline_source",
  "overhead_micros",
  "overhead_source",
  "gross_savings_micros",
  "net_savings_micros",
  "input_tokens",
  "output_tokens",
  "cached_input_tokens",
  "tokens_avoided",
  "usage_source",
  "techniques_applied",
  "cache_status",
  "method_version",
  "generated_at",
] as const;

export function reportToCsv(r: SavingsReport): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const e of r.events) {
    lines.push(
      [
        r.organization.id,
        e.eventId,
        e.occurredAt,
        e.connector,
        e.provider,
        e.model,
        e.endpoint,
        e.status,
        e.projectKey,
        e.agentKey,
        e.pricingVersion,
        e.baselineMethod,
        e.validBaseline,
        e.currency,
        e.costMicros,
        e.costSource,
        e.baselineCostMicros,
        e.baselineSource,
        e.overheadMicros,
        e.overheadSource,
        e.grossSavingsMicros,
        e.netSavingsMicros,
        e.inputTokens,
        e.outputTokens,
        e.cachedInputTokens,
        e.tokensAvoided,
        e.usageSource,
        e.techniquesApplied,
        e.cacheStatus,
        r.methodVersion,
        r.generatedAt,
      ]
        .map(csvField)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/* ------------------------------- PDF (pt-BR) ------------------------------- */

const SOURCE_LABEL: Record<string, string> = {
  provider_reported: "informado pelo provedor",
  locally_measured: "medido localmente",
  experimentally_estimated: "estimativa",
  unavailable: "indisponível",
};

export function formatMoney(micros: number, currency: string): string {
  const v = micros / 1_000_000;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(v);
  } catch {
    return `${currency} ${v.toFixed(6)}`;
  }
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};

/** WinAnsi-safe text for the built-in Helvetica font. */
const t = (s: string) => s.replace(/[−–]/g, "-").replace(/[≈]/g, "~").replace(/[^\x20-\x7E -ÿ—…]/g, "?");

export function reportToPdf(r: SavingsReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: "maindy. - Relatório de economia", Author: "maindy.", Subject: r.methodVersion } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const s = r.summary;
    const cur = r.currency;
    const W = doc.page.width - 80;

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#111111").text("maindy.");
    doc.moveDown(0.2).font("Helvetica-Bold").fontSize(14).text(t("Relatório de economia — ORBIT Engine"));
    doc.moveDown(0.4).font("Helvetica").fontSize(9).fillColor("#333333");
    doc.text(t(`Organização: ${r.organization.name} (${r.organization.id})`));
    doc.text(t(`Período: ${fmtDate(r.period.from)} a ${fmtDate(r.period.to)}`));
    doc.text(t(`Gerado em: ${fmtDate(r.generatedAt)}  ·  Método: ${r.methodVersion}  ·  Relatório: ${r.reportVersion}  ·  Moeda: ${cur}`));

    doc.moveDown(0.8);
    const boxY = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#7a4b00").text(t("Estimativas rotuladas"), 50, boxY + 8, { width: W - 20 });
    doc.font("Helvetica").fontSize(8.5).fillColor("#4a3200").text(t(r.estimatesNotice), { width: W - 20 });
    const boxH = doc.y - boxY + 8;
    doc.rect(40, boxY, W, boxH).strokeColor("#d9a400").lineWidth(1).stroke();
    doc.y = boxY + boxH + 12;
    doc.x = 40;

    const line = (label: string, value: string, source?: string) => {
      const y = doc.y;
      doc.font("Helvetica").fontSize(9.5).fillColor("#333333").text(t(label), 40, y, { width: 220 });
      doc.font("Helvetica-Bold").fillColor("#111111").text(t(value), 260, y, { width: 150 });
      if (source) doc.font("Helvetica").fontSize(8).fillColor("#666666").text(t(`fonte: ${SOURCE_LABEL[source] ?? source}`), 410, y + 1, { width: 145 });
      doc.x = 40;
      doc.moveDown(0.35);
    };

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111").text("Resumo");
    doc.moveDown(0.4);
    line("Requisições no período", String(s.requests));
    line("Custo real de IA (otimizado)", formatMoney(s.optimizedAiCost.micros, cur), s.optimizedAiCost.source);
    line("Custo extra da maindy (overhead)", formatMoney(s.overheadCost.micros, cur), s.overheadCost.source);
    line("Custo de referência (baseline)", formatMoney(s.baselineCost.micros, cur), s.baselineCost.source);
    line("Economia bruta", formatMoney(s.grossSavings.micros, cur), s.grossSavings.source);
    line("Economia líquida", formatMoney(s.netSavings.micros, cur), s.netSavings.source);
    line("Multiplicador de eficiência", s.efficiencyMultiplier === null ? "indisponível" : `${s.efficiencyMultiplier.toFixed(2).replace(".", ",")}x`, s.efficiencyMultiplier === null ? "unavailable" : "experimentally_estimated");
    line("Cobertura de baseline", `${(s.baselineCoverage * 100).toFixed(1).replace(".", ",")}% das requisições`);
    line("Tokens (entrada / saída / cache)", `${s.tokens.input} / ${s.tokens.output} / ${s.tokens.cachedInput}`);
    line("Tokens evitados", String(s.tokens.avoided), s.tokens.avoidedSource);
    line("Cache (hits / misses)", `${s.cache.hits} / ${s.cache.misses}`);
    line("Quality Guard (avaliações / aprovadas / rollbacks)", `${s.quality.evaluations} / ${s.quality.passed} / ${s.quality.rollbacks}`);

    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111").text(t("Definições do método"));
    doc.moveDown(0.3);
    for (const d of r.definitions) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111111").text(t(d.term), { continued: true }).font("Helvetica").fillColor("#333333").text(t(`: ${d.definition}`), { width: W });
      doc.moveDown(0.15);
    }
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111").text(t("Fontes de medição"));
    doc.moveDown(0.3);
    for (const [k, v] of Object.entries(r.sources)) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111111").text(k, { continued: true }).font("Helvetica").fillColor("#333333").text(t(`: ${v}`), { width: W });
      doc.moveDown(0.15);
    }

    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111").text(t("Trilha de auditoria (eventos)"));
    doc.font("Helvetica").fontSize(8).fillColor("#555555").text(
      t(
        `${r.events.length} evento(s) no período${r.eventsTruncated ? " (lista truncada)" : ""}. ${
          r.events.length > PDF_EVENT_ROWS ? `Este PDF mostra os primeiros ${PDF_EVENT_ROWS}; a lista completa está no CSV/JSON do mesmo relatório.` : ""
        } Sem conteúdo de prompts: apenas metadados.`,
      ),
      { width: W },
    );
    doc.moveDown(0.5);
    const cols = [
      { h: "Data (UTC)", w: 62 },
      { h: "ID do evento", w: 128 },
      { h: "Modelo", w: 80 },
      { h: "Preços", w: 52 },
      { h: "Baseline", w: 70 },
      { h: "Custo", w: 61 },
      { h: "Líquido", w: 62 },
    ];
    const row = (vals: string[], bold = false) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      let x = 40;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(6.5).fillColor("#111111");
      vals.forEach((v, i) => {
        doc.text(t(v), x, y, { width: cols[i]!.w - 3, lineBreak: false, ellipsis: true });
        x += cols[i]!.w;
      });
      doc.x = 40;
      doc.y = y + 10;
    };
    row(cols.map((c) => c.h), true);
    for (const e of r.events.slice(0, PDF_EVENT_ROWS)) {
      const d = new Date(e.occurredAt);
      row([
        `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`,
        e.eventId,
        e.model,
        e.pricingVersion,
        e.baselineMethod,
        formatMoney(e.costMicros, e.currency),
        e.netSavingsMicros === null ? "-" : formatMoney(e.netSavingsMicros, e.currency),
      ]);
    }
    doc.end();
  });
}
