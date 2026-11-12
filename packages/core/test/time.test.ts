import { describe, expect, it } from 'vitest';
import { parseClock, parseRecurrencePtBr, parseWhenPtBr } from '../src/time/parse-ptbr.js';
import { nextOccurrence, parseRRule, describeRRulePtBr } from '../src/time/rrule.js';
import { toZonedParts, zonedTimeToUtc } from '../src/time/zoned.js';

const TZ = 'America/Sao_Paulo';
// Thursday 2026-11-12 10:30 in São Paulo (UTC-3, no DST since 2019)
const NOW = new Date('2026-11-12T13:30:00Z');

describe('timezone conversion', () => {
  it('converts wall-clock to UTC for São Paulo', () => {
    expect(zonedTimeToUtc(2026, 11, 12, 18, 0, TZ).toISOString()).toBe('2026-11-12T21:00:00.000Z');
  });
  it('handles DST in New York', () => {
    expect(zonedTimeToUtc(2026, 7, 1, 9, 0, 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedTimeToUtc(2026, 12, 1, 9, 0, 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });
  it('reads zoned parts', () => {
    const p = toZonedParts(NOW, TZ);
    expect([p.year, p.month, p.day, p.hour, p.minute, p.weekday]).toEqual([2026, 11, 12, 10, 30, 4]);
  });
});

describe('pt-BR time expressions', () => {
  it('parses clocks', () => {
    expect(parseClock('às 18h')).toMatchObject({ hour: 18, minute: 0 });
    expect(parseClock('as 9:45')).toMatchObject({ hour: 9, minute: 45 });
    expect(parseClock('às 7 da noite')).toMatchObject({ hour: 19 });
    expect(parseClock('meio-dia')).toMatchObject({ hour: 12 });
  });
  it('relative offsets', () => {
    expect(parseWhenPtBr('daqui a 20 minutos', NOW, TZ)?.date.toISOString()).toBe('2026-11-12T13:50:00.000Z');
    expect(parseWhenPtBr('em 2 horas', NOW, TZ)?.date.toISOString()).toBe('2026-11-12T15:30:00.000Z');
    expect(parseWhenPtBr('daqui a uma hora e meia', NOW, TZ)?.date.toISOString()).toBe('2026-11-12T15:00:00.000Z');
  });
  it('days and times', () => {
    expect(parseWhenPtBr('amanhã às 9h', NOW, TZ)?.date.toISOString()).toBe('2026-11-13T12:00:00.000Z');
    expect(parseWhenPtBr('hoje às 18h', NOW, TZ)?.date.toISOString()).toBe('2026-11-12T21:00:00.000Z');
    expect(parseWhenPtBr('sexta às 15h', NOW, TZ)?.date.toISOString()).toBe('2026-11-13T18:00:00.000Z');
    expect(parseWhenPtBr('quinta às 15h', NOW, TZ)?.date.toISOString()).toBe('2026-11-19T18:00:00.000Z');
    expect(parseWhenPtBr('dia 25/12 às 10h', NOW, TZ)?.date.toISOString()).toBe('2026-12-25T13:00:00.000Z');
  });
  it('time already passed today rolls to tomorrow', () => {
    expect(parseWhenPtBr('às 8h', NOW, TZ)?.date.toISOString()).toBe('2026-11-13T11:00:00.000Z');
  });
  it('day without time defaults to 9:00 and flags dateOnly', () => {
    const r = parseWhenPtBr('amanhã', NOW, TZ);
    expect(r?.dateOnly).toBe(true);
    expect(r?.date.toISOString()).toBe('2026-11-13T12:00:00.000Z');
  });
  it('returns null without a time expression', () => {
    expect(parseWhenPtBr('comprar pão', NOW, TZ)).toBeNull();
  });
  it('recurrence phrases', () => {
    expect(parseRecurrencePtBr('todo dia às 8h')).toBe('FREQ=DAILY;INTERVAL=1');
    expect(parseRecurrencePtBr('toda segunda')).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(parseRecurrencePtBr('uma vez')).toBeNull();
  });
});

describe('RRULE', () => {
  const start = zonedTimeToUtc(2026, 11, 12, 8, 0, TZ);
  it('daily', () => {
    expect(nextOccurrence('FREQ=DAILY', start, start, TZ)?.toISOString()).toBe('2026-11-13T11:00:00.000Z');
  });
  it('weekly by day', () => {
    // from Thu 12 → next Monday 16
    expect(nextOccurrence('FREQ=WEEKLY;BYDAY=MO,FR', start, start, TZ)?.toISOString()).toBe('2026-11-13T11:00:00.000Z');
    expect(nextOccurrence('FREQ=WEEKLY;BYDAY=MO', start, start, TZ)?.toISOString()).toBe('2026-11-16T11:00:00.000Z');
  });
  it('monthly skips months without the day', () => {
    const jan31 = zonedTimeToUtc(2027, 1, 31, 9, 0, TZ);
    expect(nextOccurrence('FREQ=MONTHLY', jan31, jan31, TZ)?.toISOString()).toBe('2027-03-31T12:00:00.000Z');
  });
  it('respects COUNT and UNTIL', () => {
    expect(nextOccurrence('FREQ=DAILY;COUNT=2', start, new Date(start.getTime() + 86_400_000), TZ)).toBeNull();
    expect(nextOccurrence('FREQ=DAILY;UNTIL=20261113T235959Z', start, new Date(start.getTime() + 86_400_000), TZ)).toBeNull();
  });
  it('rejects unsupported rules and describes them in pt-BR', () => {
    expect(() => parseRRule('FREQ=SECONDLY')).toThrow();
    expect(describeRRulePtBr('FREQ=WEEKLY;BYDAY=MO')).toBe('toda semana (segunda)');
  });
});
