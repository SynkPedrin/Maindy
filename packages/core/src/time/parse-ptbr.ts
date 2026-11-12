import { addDays, toZonedParts, zonedTimeToUtc } from './zoned.js';

/**
 * Deterministic Brazilian-Portuguese date/time expression parser.
 * Used for reminders/tasks in offline mode and to validate Claude's output.
 */

export interface ParsedWhen {
  date: Date;
  /** true when only a day was given (no explicit time) */
  dateOnly: boolean;
  matched: string;
}

const WEEKDAY_NAMES: Array<[RegExp, number]> = [
  [/\bdomingo\b/, 0],
  [/\bsegunda(?:-feira)?\b/, 1],
  [/\bterca(?:-feira)?\b/, 2],
  [/\bquarta(?:-feira)?\b/, 3],
  [/\bquinta(?:-feira)?\b/, 4],
  [/\bsexta(?:-feira)?\b/, 5],
  [/\bsabado\b/, 6],
];

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, meia: 30,
};

function toNumber(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

/** lower-case + strip diacritics so every regex below can use ASCII and \b safely */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extracts an explicit clock time ("às 18h", "18:30", "9h15", "meio-dia", "às 7 da noite"). */
export function parseClock(text: string): { hour: number; minute: number; matched: string } | null {
  const t = normalize(text);
  if (/\bmeio[- ]dia\b/.test(t)) return { hour: 12, minute: 0, matched: 'meio-dia' };
  if (/\bmeia[- ]noite\b/.test(t)) return { hour: 0, minute: 0, matched: 'meia-noite' };

  const m =
    t.match(/\b(?:as?|ao)\s+(\d{1,2})(?:[:h](\d{2}))?(?:\s*(?:h(?:oras?)?|hrs?)\b)?(?:\s+(da manha|da tarde|da noite))?/) ??
    t.match(/\b(\d{1,2})[:h](\d{2})\b(?:\s+(da manha|da tarde|da noite))?/) ??
    t.match(/\b(\d{1,2})\s*(?:h|horas?)\b(?:\s+(da manha|da tarde|da noite))?/);
  if (!m) return null;
  let hour = Number(m[1]);
  // the third pattern has the period in group 2
  const minuteRaw = m[2] && /^\d+$/.test(m[2]) ? m[2] : undefined;
  const period = m[3] ?? (m[2] && !minuteRaw ? m[2] : undefined);
  const minute = minuteRaw ? Number(minuteRaw) : 0;
  if (period && /tarde|noite/.test(period) && hour < 12) hour += 12;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute, matched: m[0] };
}

/**
 * Parses a pt-BR time expression relative to `now` in `timeZone`.
 * Returns null when no time expression is present.
 */
export function parseWhenPtBr(text: string, now: Date, timeZone: string): ParsedWhen | null {
  const t = normalize(text);
  const today = toZonedParts(now, timeZone);

  // "daqui a 20 minutos", "em 2 horas", "daqui a uma hora e meia"
  const rel = t.match(
    /\b(?:daqui a|daqui|em|dentro de)\s+(\d+|\p{L}+)\s+(minutos?|min|horas?|h|dias?|semanas?)(\s+e\s+meia)?\b/u,
  );
  if (rel) {
    const n = toNumber(rel[1] ?? '');
    if (n !== null) {
      const unit = rel[2] ?? '';
      let ms = 0;
      if (unit.startsWith('min')) ms = n * 60_000;
      else if (unit.startsWith('h')) ms = n * 3_600_000 + (rel[3] ? 1_800_000 : 0);
      else if (unit.startsWith('dia')) ms = n * 86_400_000;
      else ms = n * 7 * 86_400_000;
      return { date: new Date(now.getTime() + ms), dateOnly: false, matched: rel[0] };
    }
  }

  // Day resolution
  let target: { y: number; m: number; d: number } | null = null;
  let matchedDay = '';
  if (/\bdepois de amanha\b/.test(t)) {
    target = addDays(today.year, today.month, today.day, 2);
    matchedDay = 'depois de amanhã';
  } else if (/\bamanha\b/.test(t)) {
    target = addDays(today.year, today.month, today.day, 1);
    matchedDay = 'amanhã';
  } else if (/\bhoje\b/.test(t)) {
    target = { y: today.year, m: today.month, d: today.day };
    matchedDay = 'hoje';
  } else {
    const dm = t.match(/\b(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/) ?? null;
    if (dm) {
      const d = Number(dm[1]);
      const mo = Number(dm[2]);
      let y = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : today.year;
      if (!dm[3] && (mo < today.month || (mo === today.month && d < today.day))) y += 1;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        target = { y, m: mo, d };
        matchedDay = dm[0];
      }
    } else {
      const dayOnly = t.match(/\bdia\s+(\d{1,2})\b/);
      if (dayOnly) {
        const d = Number(dayOnly[1]);
        let mo = today.month;
        let y = today.year;
        if (d < today.day) {
          mo += 1;
          if (mo > 12) {
            mo = 1;
            y += 1;
          }
        }
        target = { y, m: mo, d };
        matchedDay = dayOnly[0];
      } else {
        for (const [re, wd] of WEEKDAY_NAMES) {
          const wm = t.match(re);
          if (wm) {
            let delta = (wd - today.weekday + 7) % 7;
            if (delta === 0) delta = 7; // "sexta" said on a Friday means next Friday
            target = addDays(today.year, today.month, today.day, delta);
            matchedDay = wm[0];
            break;
          }
        }
      }
    }
  }

  let clock = parseClock(t);
  if (!clock) {
    if (/\bde manha\b|\bpela manha\b/.test(t)) clock = { hour: 9, minute: 0, matched: 'de manhã' };
    else if (/\ba tarde\b|\bde tarde\b/.test(t)) clock = { hour: 15, minute: 0, matched: 'à tarde' };
    else if (/\ba noite\b|\bde noite\b/.test(t)) clock = { hour: 20, minute: 0, matched: 'à noite' };
  }

  if (!target && !clock) return null;

  if (!target && clock) {
    // only a time: today, or tomorrow if that time already passed
    let candidate = zonedTimeToUtc(today.year, today.month, today.day, clock.hour, clock.minute, timeZone);
    if (candidate.getTime() <= now.getTime()) {
      const tm = addDays(today.year, today.month, today.day, 1);
      candidate = zonedTimeToUtc(tm.y, tm.m, tm.d, clock.hour, clock.minute, timeZone);
    }
    return { date: candidate, dateOnly: false, matched: clock.matched };
  }

  const day = target!;
  if (clock) {
    return {
      date: zonedTimeToUtc(day.y, day.m, day.d, clock.hour, clock.minute, timeZone),
      dateOnly: false,
      matched: `${matchedDay} ${clock.matched}`.trim(),
    };
  }
  // day without time → 9:00 local as the default reminder time
  return { date: zonedTimeToUtc(day.y, day.m, day.d, 9, 0, timeZone), dateOnly: true, matched: matchedDay };
}

/** "todo dia", "toda segunda", "toda semana", "todo mês" → RRULE subset. */
export function parseRecurrencePtBr(text: string): string | null {
  const t = normalize(text);
  if (/\b(todo dia|todos os dias|diariamente)\b/.test(t)) return 'FREQ=DAILY;INTERVAL=1';
  const codes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  for (const [re, wd] of WEEKDAY_NAMES) {
    const src = re.source.replace(/^\\b/, '');
    if (new RegExp(`\\b(?:toda|todas as|todo)\\s+${src}`).test(t)) return `FREQ=WEEKLY;BYDAY=${codes[wd]}`;
  }
  if (/\b(toda semana|semanalmente)\b/.test(t)) return 'FREQ=WEEKLY;INTERVAL=1';
  if (/\b(todo mes|mensalmente)\b/.test(t)) return 'FREQ=MONTHLY;INTERVAL=1';
  if (/\b(todo ano|anualmente)\b/.test(t)) return 'FREQ=YEARLY;INTERVAL=1';
  return null;
}
