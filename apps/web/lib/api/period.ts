/** Period selector state shared through URL search params: ?periodo=24h|7d|30d|custom&de=YYYY-MM-DD&ate=YYYY-MM-DD */
export type PeriodKey = "24h" | "7d" | "30d" | "custom";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "custom", label: "Personalizado" },
];

export interface ResolvedPeriod {
  key: PeriodKey;
  from: string; // ISO
  to: string; // ISO
  bucket: "hour" | "day";
  label: string;
  /** fraction of a 30-day month covered — used to allocate the subscription price */
  monthFraction: number;
}

const DAY = 86_400_000;

function parseDate(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `now` is injectable for tests; we round to the minute so query keys are stable within a render burst. */
export function resolvePeriod(params: URLSearchParams | { get(k: string): string | null }, now = new Date()): ResolvedPeriod {
  const raw = params.get("periodo");
  const key: PeriodKey = raw === "24h" || raw === "30d" || raw === "custom" ? raw : "7d";
  const end = new Date(Math.ceil(now.getTime() / 60_000) * 60_000);
  if (key === "custom") {
    const de = parseDate(params.get("de"));
    const ate = parseDate(params.get("ate"));
    if (de && ate && de <= ate) {
      const to = new Date(ate.getTime() + DAY - 1);
      const span = to.getTime() - de.getTime();
      const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
      return {
        key,
        from: de.toISOString(),
        to: to.toISOString(),
        bucket: span <= 2 * DAY ? "hour" : "day",
        label: `${fmt.format(de)} – ${fmt.format(ate)}`,
        monthFraction: span / (30 * DAY),
      };
    }
  }
  const effective = key === "custom" ? "7d" : key;
  const span = effective === "24h" ? DAY : effective === "30d" ? 30 * DAY : 7 * DAY;
  return {
    key: effective,
    from: new Date(end.getTime() - span).toISOString(),
    to: end.toISOString(),
    bucket: effective === "24h" ? "hour" : "day",
    label: effective === "24h" ? "Últimas 24 horas" : effective === "30d" ? "Últimos 30 dias" : "Últimos 7 dias",
    monthFraction: span / (30 * DAY),
  };
}

/** Keep only the period params so links across the sidebar preserve the selection. */
export function periodQuery(params: { get(k: string): string | null }): string {
  const q = new URLSearchParams();
  for (const k of ["periodo", "de", "ate"]) {
    const v = params.get(k);
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
