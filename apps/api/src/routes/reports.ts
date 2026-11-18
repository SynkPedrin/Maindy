import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { PeriodQuery, resolvePeriod } from "../lib/period.js";
import { ipPrefix } from "../lib/ip.js";
import { anyAuth } from "../plugins/auth.js";
import { buildSavingsReport, reportToCsv, reportToPdf } from "../reports/savings-report.js";
import { audit } from "../services/audit.js";
import { markOnboarding } from "../services/onboarding.js";

export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;

  app.get(
    "/reports/savings",
    {
      config: { auth: "any" },
      schema: {
        tags: ["reports"],
        description: "Relatório auditável de economia (JSON, CSV RFC 4180 ou PDF pt-BR).",
        querystring: PeriodQuery.extend({ format: z.enum(["json", "csv", "pdf"]).default("json") }),
      },
    },
    async (req, reply) => {
      const a = anyAuth(req);
      const { from, to } = resolvePeriod(req.query);
      const report = await buildSavingsReport(db, a.orgId, from, to, req.query.currency);
      // A JSON preview is a read; only an actual export (CSV/PDF) completes the onboarding step.
      if (req.query.format !== "json") await markOnboarding(db, a.orgId, ["first_report"]);
      await audit(db, {
        orgId: a.orgId,
        actor: a,
        action: "report.savings_generated",
        metadata: { format: req.query.format, from: report.period.from, to: report.period.to, events: report.events.length },
        ipPrefix: ipPrefix(req.ip),
      });
      const base = `maindy-economia-${report.period.from.slice(0, 10)}_${report.period.to.slice(0, 10)}`;
      reply.header("cache-control", "no-store");
      if (req.query.format === "csv") {
        return reply
          .header("content-type", "text/csv; charset=utf-8; header=present")
          .header("content-disposition", `attachment; filename="${base}.csv"`)
          .send(reportToCsv(report));
      }
      if (req.query.format === "pdf") {
        const pdf = await reportToPdf(report);
        return reply.header("content-type", "application/pdf").header("content-disposition", `attachment; filename="${base}.pdf"`).send(pdf);
      }
      return reply.header("content-type", "application/json; charset=utf-8").send(report);
    },
  );
};
