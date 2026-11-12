import { addDays, toZonedParts, zonedTimeToUtc } from './zoned.js';

/**
 * Minimal RFC 5545 RRULE support for reminders: FREQ (DAILY|WEEKLY|MONTHLY|YEARLY),
 * INTERVAL, BYDAY (weekly only), COUNT and UNTIL are validated; occurrences keep
 * the wall-clock time of the first occurrence in the reminder's timezone (DST-safe).
 */

export interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay: number[] | null;
  until: Date | null;
  count: number | null;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function parseRRule(rule: string): RRule {
  const parts = Object.fromEntries(
    rule
      .replace(/^RRULE:/i, '')
      .split(';')
      .filter(Boolean)
      .map((kv) => {
        const [k, v] = kv.split('=');
        return [String(k).toUpperCase(), String(v ?? '').toUpperCase()];
      }),
  ) as Record<string, string>;
  const freq = parts.FREQ;
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') {
    throw new Error(`Unsupported RRULE FREQ: ${freq ?? '(missing)'}`);
  }
  const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 366) throw new Error('Invalid INTERVAL');
  let byDay: number[] | null = null;
  if (parts.BYDAY) {
    byDay = parts.BYDAY.split(',').map((c) => {
      const i = DAY_CODES.indexOf(c);
      if (i < 0) throw new Error(`Invalid BYDAY: ${c}`);
      return i;
    });
  }
  let until: Date | null = null;
  if (parts.UNTIL) {
    const m = parts.UNTIL.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
    if (!m) throw new Error('Invalid UNTIL');
    until = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 23), +(m[5] ?? 59), +(m[6] ?? 59)));
  }
  const count = parts.COUNT ? Number(parts.COUNT) : null;
  return { freq, interval, byDay, until, count };
}

/** Next occurrence strictly after `after`, anchored at `dtstart`. Returns null when the rule ended. */
export function nextOccurrence(rule: string, dtstart: Date, after: Date, timeZone: string): Date | null {
  const r = parseRRule(rule);
  const start = toZonedParts(dtstart, timeZone);
  const at = (y: number, m: number, d: number) => zonedTimeToUtc(y, m, d, start.hour, start.minute, timeZone);
  let produced = 0;
  const ok = (d: Date) => (!r.until || d.getTime() <= r.until.getTime()) && (r.count === null || produced <= r.count);

  // iterate candidates in order; bounded to avoid infinite loops on bad input
  for (let step = 0; step < 5000; step++) {
    let candidates: Date[] = [];
    if (r.freq === 'DAILY') {
      const d = addDays(start.year, start.month, start.day, step * r.interval);
      candidates = [at(d.y, d.m, d.d)];
    } else if (r.freq === 'WEEKLY') {
      const days = r.byDay ?? [start.weekday];
      const weekStart = addDays(start.year, start.month, start.day, -start.weekday + step * 7 * r.interval);
      candidates = days
        .map((wd) => addDays(weekStart.y, weekStart.m, weekStart.d, wd))
        .map((d) => at(d.y, d.m, d.d))
        .filter((d) => d.getTime() >= dtstart.getTime())
        .sort((a, b) => a.getTime() - b.getTime());
    } else if (r.freq === 'MONTHLY') {
      const mIndex = start.month - 1 + step * r.interval;
      const y = start.year + Math.floor(mIndex / 12);
      const m = (mIndex % 12) + 1;
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      if (start.day <= daysInMonth) candidates = [at(y, m, start.day)];
    } else {
      const y = start.year + step * r.interval;
      const daysInMonth = new Date(Date.UTC(y, start.month, 0)).getUTCDate();
      if (start.day <= daysInMonth) candidates = [at(y, start.month, start.day)];
    }
    for (const c of candidates) {
      produced++;
      if (!ok(c)) return null;
      if (c.getTime() > after.getTime()) return c;
    }
  }
  return null;
}

export function describeRRulePtBr(rule: string): string {
  const r = parseRRule(rule);
  const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  if (r.freq === 'DAILY') return r.interval === 1 ? 'todos os dias' : `a cada ${r.interval} dias`;
  if (r.freq === 'WEEKLY') {
    const days = r.byDay ? r.byDay.map((d) => names[d]).join(', ') : null;
    const base = r.interval === 1 ? 'toda semana' : `a cada ${r.interval} semanas`;
    return days ? `${base} (${days})` : base;
  }
  if (r.freq === 'MONTHLY') return r.interval === 1 ? 'todo mês' : `a cada ${r.interval} meses`;
  return r.interval === 1 ? 'todo ano' : `a cada ${r.interval} anos`;
}
