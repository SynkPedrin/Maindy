import type { CalendarEvent, FocusMode, NewEventInput, NewReminderInput, NewTaskInput, Reminder, Task } from '@maindy/core';
import type { Db } from '../db.js';

type Row = Record<string, any>;

export const mapTask = (r: Row): Task => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  status: r.status,
  priority: r.priority,
  dueAt: r.due_at,
  completedAt: r.completed_at,
  createdAt: r.created_at,
});

export const mapReminder = (r: Row): Reminder => ({
  id: r.id,
  title: r.title,
  body: r.body,
  remindAt: r.remind_at,
  timezone: r.timezone,
  recurrenceRule: r.recurrence_rule,
  status: r.status,
  taskId: r.task_id,
  deliveredAt: r.delivered_at,
  completedAt: r.completed_at,
});

export const mapEvent = (r: Row): CalendarEvent => ({
  id: r.id,
  title: r.title,
  description: r.description,
  location: r.location,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  allDay: r.all_day,
  timezone: r.timezone,
  recurrenceRule: r.recurrence_rule,
  source: r.source,
});

export async function createTask(db: Db, userId: string, t: NewTaskInput): Promise<Task> {
  const { rows } = await db.query(
    `insert into maindy.tasks (user_id, title, notes, priority, due_at, source_memory_id) values ($1,$2,$3,$4,$5,$6) returning *`,
    [userId, t.title, t.notes, t.priority, t.dueAt, t.sourceMemoryId ?? null],
  );
  return mapTask(rows[0]);
}

export async function listTasks(db: Db, status: 'pending' | 'done' | 'all'): Promise<Task[]> {
  const { rows } = await db.query(
    `select * from maindy.tasks where ($1 = 'all' or status = $1)
     order by case status when 'pending' then 0 else 1 end, priority, due_at nulls last, created_at desc limit 200`,
    [status],
  );
  return rows.map(mapTask);
}

export async function updateTask(db: Db, id: string, patch: { status?: 'pending' | 'done' | 'cancelled'; title?: string; priority?: number; dueAt?: string | null }): Promise<Task | null> {
  const { rows } = await db.query(
    `update maindy.tasks set
       status = coalesce($2, status),
       completed_at = case when $2 = 'done' then now() when $2 = 'pending' then null else completed_at end,
       title = coalesce($3, title), priority = coalesce($4, priority),
       due_at = case when $6 then $5::timestamptz else due_at end
     where id = $1 returning *`,
    [id, patch.status ?? null, patch.title ?? null, patch.priority ?? null, patch.dueAt ?? null, patch.dueAt !== undefined],
  );
  return rows[0] ? mapTask(rows[0]) : null;
}

export async function createReminder(db: Db, userId: string, r: NewReminderInput): Promise<Reminder> {
  const { rows } = await db.query(
    `insert into maindy.reminders (user_id, title, body, remind_at, timezone, recurrence_rule, task_id) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [userId, r.title, r.body, r.remindAt, r.timezone, r.recurrenceRule, r.taskId ?? null],
  );
  return mapReminder(rows[0]);
}

export async function listReminders(db: Db, fromIso: string | null, toIso: string | null, includeDone = false): Promise<Reminder[]> {
  const { rows } = await db.query(
    `select * from maindy.reminders
     where ($1::timestamptz is null or remind_at >= $1) and ($2::timestamptz is null or remind_at < $2)
       and ($3 or status in ('scheduled', 'delivered'))
     order by remind_at limit 200`,
    [fromIso, toIso, includeDone],
  );
  return rows.map(mapReminder);
}

export async function updateReminderStatus(db: Db, id: string, status: 'done' | 'cancelled' | 'scheduled', remindAt?: string): Promise<Reminder | null> {
  const { rows } = await db.query(
    `update maindy.reminders set status = $2,
       completed_at = case when $2 = 'done' then now() else completed_at end,
       remind_at = coalesce($3::timestamptz, remind_at),
       delivered_at = case when $2 = 'scheduled' then null else delivered_at end
     where id = $1 returning *`,
    [id, status, remindAt ?? null],
  );
  return rows[0] ? mapReminder(rows[0]) : null;
}

export async function createEvent(db: Db, userId: string, e: NewEventInput): Promise<CalendarEvent> {
  const { rows } = await db.query(
    `insert into maindy.calendar_events (user_id, title, description, location, starts_at, ends_at, timezone, recurrence_rule)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [userId, e.title, e.description, e.location, e.startsAt, e.endsAt, e.timezone, e.recurrenceRule],
  );
  return mapEvent(rows[0]);
}

export async function listEvents(db: Db, fromIso: string, toIso: string): Promise<CalendarEvent[]> {
  const { rows } = await db.query(
    `select * from maindy.calendar_events where starts_at < $2 and ends_at >= $1 order by starts_at limit 500`,
    [fromIso, toIso],
  );
  return rows.map(mapEvent);
}

export async function deleteEvent(db: Db, id: string): Promise<boolean> {
  const { rowCount } = await db.query(`delete from maindy.calendar_events where id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function startFocus(db: Db, userId: string, mode: FocusMode, minutes: number | null): Promise<{ id: string; endsAt: string | null }> {
  await db.query(`update maindy.focus_sessions set ended_at = now() where ended_at is null`);
  if (mode === 'off') return { id: '', endsAt: null };
  const { rows } = await db.query(
    `insert into maindy.focus_sessions (user_id, mode, planned_end_at) values ($1, $2, case when $3::int is null then null else now() + make_interval(mins => $3::int) end)
     returning id, planned_end_at`,
    [userId, mode, minutes],
  );
  return { id: rows[0].id, endsAt: rows[0].planned_end_at };
}

export async function currentFocus(db: Db): Promise<{ id: string; mode: FocusMode; startedAt: string; endsAt: string | null } | null> {
  const { rows } = await db.query(
    `select id, mode, started_at, planned_end_at from maindy.focus_sessions
     where ended_at is null and (planned_end_at is null or planned_end_at > now()) order by started_at desc limit 1`,
  );
  return rows[0] ? { id: rows[0].id, mode: rows[0].mode, startedAt: rows[0].started_at, endsAt: rows[0].planned_end_at } : null;
}
