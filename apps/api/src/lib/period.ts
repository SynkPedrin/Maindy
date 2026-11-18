import { z } from "zod";
import { badRequest } from "./errors.js";

const DAY = 86_400_000;

export const PeriodQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  currency: z.string().length(3).toUpperCase().default("USD"),
});

/** Defaults: to = now, from = to − 30 days. Validates order and max span. */
export function resolvePeriod(q: { from?: string; to?: string }, maxDays = 366): { from: Date; to: Date } {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * DAY);
  if (from >= to) throw badRequest("invalid_period", "O início do período precisa ser anterior ao fim.");
  if (to.getTime() - from.getTime() > maxDays * DAY) throw badRequest("invalid_period", `O período máximo é de ${maxDays} dias.`);
  return { from, to };
}
