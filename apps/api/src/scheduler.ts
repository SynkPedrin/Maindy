import { nextOccurrence } from '@maindy/core';
import type { AppServices } from './services.js';
import * as S from './repo/system.js';

/**
 * Reminder dispatcher. Every 30 s it claims due reminders (FOR UPDATE SKIP LOCKED, so several
 * API instances can run it safely), sends an Expo push to the user's active devices, marks the
 * reminder delivered and, for recurring reminders, schedules the next occurrence.
 * The app also schedules a local notification at creation time, so reminders still fire
 * offline; the push is the cross-device path.
 */

export interface DispatchResult {
  delivered: number;
  pushed: number;
  rescheduled: number;
}

async function sendExpoPush(messages: Array<{ to: string; title: string; body: string; data: Record<string, unknown> }>): Promise<number> {
  if (!messages.length) return 0;
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages.map((m) => ({ ...m, sound: 'default', priority: 'high', channelId: 'reminders' }))),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
  const j = (await res.json()) as { data?: Array<{ status: string }> };
  return (j.data ?? []).filter((d) => d.status === 'ok').length;
}

export async function dispatchDueReminders(s: AppServices, now = new Date()): Promise<DispatchResult> {
  return s.db.withService(async (db) => {
    const { rows } = await db.query(
      `select r.* from maindy.reminders r where r.status = 'scheduled' and r.remind_at <= $1 order by r.remind_at limit 100 for update skip locked`,
      [now.toISOString()],
    );
    const result: DispatchResult = { delivered: 0, pushed: 0, rescheduled: 0 };
    for (const r of rows) {
      const { rows: devices } = await db.query(`select push_token from maindy.devices where user_id = $1 and revoked_at is null and push_token like 'ExponentPushToken%'`, [r.user_id]);
      try {
        result.pushed += await sendExpoPush(devices.map((d) => ({ to: d.push_token, title: r.title, body: r.body ?? 'Lembrete da MAINDY', data: { reminderId: r.id, url: `maindy://reminders/${r.id}` } })));
      } catch (err) {
        s.log.warn({ err: (err as Error).message, reminderId: r.id }, 'push delivery failed');
      }
      const next = r.recurrence_rule ? nextOccurrence(r.recurrence_rule, new Date(r.remind_at), now, r.timezone) : null;
      if (next) {
        await db.query(`update maindy.reminders set remind_at = $2, delivered_at = now() where id = $1`, [r.id, next.toISOString()]);
        result.rescheduled++;
      } else {
        await db.query(`update maindy.reminders set status = 'delivered', delivered_at = now() where id = $1`, [r.id]);
      }
      await S.audit(db, r.user_id, 'system', 'reminder.delivered', 'reminder', r.id, { devices: devices.length, next: next?.toISOString() ?? null });
      result.delivered++;
    }
    return result;
  });
}

export function startScheduler(s: AppServices, intervalMs = 30_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await dispatchDueReminders(s);
      if (r.delivered) s.log.info(r, 'reminders dispatched');
    } catch (err) {
      s.log.error({ err: (err as Error).message }, 'reminder dispatch failed');
    } finally {
      running = false;
    }
  };
  const handle = setInterval(tick, intervalMs);
  void tick();
  return () => clearInterval(handle);
}
