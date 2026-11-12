import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CATEGORIES, MEMORY_TYPES, extractMemoryLocal, isValidTimeZone, nextOccurrence, parseRRule } from '@maindy/core';
import { HttpError, asUser, idParams, idempotent, parse } from '../http.js';
import { MemoryService, type AppServices } from '../services.js';
import * as M from '../repo/memories.js';
import * as P from '../repo/planning.js';
import * as S from '../repo/system.js';

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'data ISO-8601 inválida');
const rrule = z
  .string()
  .max(200)
  .refine((v) => {
    try {
      parseRRule(v);
      return true;
    } catch {
      return false;
    }
  }, 'RRULE inválida');

export async function dataRoutes(app: FastifyInstance, s: AppServices) {
  // ───────── memories ─────────
  const createMemory = z.object({
    content: z.string().trim().min(1).max(4000),
    title: z.string().trim().min(1).max(140).optional(),
    type: z.enum(MEMORY_TYPES).optional(),
    category: z.enum(CATEGORIES).optional(),
    tags: z.array(z.string().max(40)).max(10).optional(),
    people: z.array(z.object({ name: z.string().min(1).max(80), relation: z.string().max(40).nullable().default(null) })).max(10).optional(),
    source: z.enum(['voice', 'text', 'import']).default('text'),
  });

  app.post('/v1/memories', { schema: { tags: ['memories'], summary: 'Salva uma memória (extração automática quando campos não são enviados)' } }, async (req, reply) => {
    const body = parse(createMemory, req.body);
    return idempotent(s, req, reply, 201, async (db, user) => {
      const ex = extractMemoryLocal(body.content);
      return new MemoryService(s, db, user).create({
        title: body.title ?? ex.title,
        content: body.title ? body.content : ex.content,
        type: body.type ?? ex.type,
        category: body.category ?? ex.category,
        tags: body.tags ?? ex.tags,
        people: body.people ?? ex.people,
        source: body.source,
        provenance: 'user_confirmed',
        confidence: 1,
        originalUtterance: body.content,
      });
    });
  });

  app.get('/v1/memories/search', { schema: { tags: ['memories'], summary: 'Busca híbrida (texto + semântica + pessoas + recência)' } }, async (req) => {
    const q = parse(z.object({ q: z.string().trim().min(1).max(500), limit: z.coerce.number().int().min(1).max(30).default(10) }), req.query);
    return asUser(s, req, (db, user) => new MemoryService(s, db, user).search(q.q, q.limit));
  });

  app.get('/v1/memories', { schema: { tags: ['memories'], summary: 'Lista memórias (filtros: categoria, tipo, pessoa; paginação por data)' } }, async (req) => {
    const q = parse(
      z.object({ category: z.string().optional(), type: z.string().optional(), personId: z.string().uuid().optional(), before: isoDate.optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }),
      req.query,
    );
    return asUser(s, req, (db) => M.listMemories(db, { category: q.category ?? null, type: q.type ?? null, personId: q.personId ?? null, before: q.before ?? null, limit: q.limit }));
  });

  app.get('/v1/memories/:id', { schema: { tags: ['memories'] } }, async (req) => {
    const { id } = parse(idParams, req.params);
    return asUser(s, req, async (db) => {
      const row = await M.getMemoryRow(db, id);
      if (!row) throw new HttpError(404, 'Memória não encontrada');
      const { rows } = await db.query(`select version, title, content, changed_by, created_at from maindy.memory_versions where memory_id = $1 order by version desc`, [id]);
      return { ...row.memory, versions: rows.map((r) => ({ version: r.version, title: r.title, content: r.content, changedBy: r.changed_by, createdAt: r.created_at })) };
    });
  });

  app.patch('/v1/memories/:id', { schema: { tags: ['memories'] } }, async (req) => {
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ title: z.string().trim().min(1).max(140).optional(), content: z.string().trim().min(1).max(4000).optional(), category: z.enum(CATEGORIES).optional(), tags: z.array(z.string().max(40)).max(10).optional() }), req.body);
    return asUser(s, req, async (db, user) => {
      const m = await new MemoryService(s, db, user).update(id, body, 'user');
      if (!m) throw new HttpError(404, 'Memória não encontrada');
      return m;
    });
  });

  app.delete('/v1/memories/:id', { schema: { tags: ['memories'], summary: 'Apaga a memória (banco, embeddings, arquivo e histórico do vault)' } }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await asUser(s, req, async (db, user) => {
      if (!(await new MemoryService(s, db, user).delete(id, 'user'))) throw new HttpError(404, 'Memória não encontrada');
    });
    reply.code(204);
    return null;
  });

  app.get('/v1/people', { schema: { tags: ['memories'] } }, async (req) => asUser(s, req, (db) => M.listPeople(db)));

  // ───────── vaults ─────────
  app.post('/v1/vaults/provision', { schema: { tags: ['vaults'], summary: 'Cria o vault Obsidian gerenciado do usuário' } }, async (req, reply) =>
    idempotent(s, req, reply, 201, async (db, user) => {
      const key = await new MemoryService(s, db, user).vaultKey();
      const { rows } = await db.query(`select id, kind, status, last_synced_at, created_at from maindy.vaults where storage_key = $1`, [key]);
      return { id: rows[0].id, kind: rows[0].kind, status: rows[0].status, lastSyncedAt: rows[0].last_synced_at, folders: (await import('@maindy/core')).VAULT_FOLDERS };
    }),
  );

  app.post('/v1/vaults/sync', { schema: { tags: ['vaults'], summary: 'Sincroniza banco ↔ vault (edições do Obsidian, conflitos, restauração)' } }, async (req) =>
    asUser(s, req, (db, user) => new MemoryService(s, db, user).sync()),
  );

  app.get('/v1/vaults/export', { schema: { tags: ['vaults'], summary: 'Exporta o vault em .zip' } }, async (req, reply) => {
    const zip = await asUser(s, req, async (db, user) => {
      const svc = new MemoryService(s, db, user);
      const key = await svc.vaultKey();
      // on serverless hosts the vault dir is ephemeral: rebuild it from the database first
      await svc.sync();
      await S.audit(db, user.id, 'user', 'vault.exported', 'vault', key);
      return s.vault.exportZip(key);
    });
    reply.header('Content-Type', 'application/zip').header('Content-Disposition', 'attachment; filename="maindy-vault.zip"');
    return Buffer.from(zip);
  });

  app.post('/v1/vaults/connect', { schema: { tags: ['vaults'], summary: 'Gera um token para o plugin do Obsidian conectar um vault existente' } }, async (req, reply) => {
    const body = parse(z.object({ deviceLabel: z.string().max(80).default('Obsidian') }), req.body ?? {});
    return idempotent(s, req, reply, 201, async (db, user) => {
      const { randomBytes, createHash } = await import('node:crypto');
      const key = await new MemoryService(s, db, user).vaultKey();
      const { rows: v } = await db.query(`select id from maindy.vaults where storage_key = $1`, [key]);
      const token = `mdy_${randomBytes(24).toString('base64url')}`;
      const { rows } = await db.query(
        `insert into maindy.vault_connections (user_id, vault_id, device_label, token_hash) values ($1,$2,$3,$4) returning id, created_at`,
        [user.id, v[0].id, body.deviceLabel, createHash('sha256').update(token).digest('hex')],
      );
      await S.audit(db, user.id, 'user', 'vault.connection_created', 'vault_connection', rows[0].id);
      return { id: rows[0].id, token, note: 'Guarde este token: ele não será mostrado de novo.' };
    });
  });

  // ───────── tasks ─────────
  app.get('/v1/tasks', { schema: { tags: ['tasks'] } }, async (req) => {
    const q = parse(z.object({ status: z.enum(['pending', 'done', 'all']).default('pending') }), req.query);
    return asUser(s, req, (db) => P.listTasks(db, q.status));
  });

  app.post('/v1/tasks', { schema: { tags: ['tasks'] } }, async (req, reply) => {
    const body = parse(z.object({ title: z.string().trim().min(1).max(200), notes: z.string().max(2000).nullable().default(null), priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2), dueAt: isoDate.nullable().default(null) }), req.body);
    return idempotent(s, req, reply, 201, async (db, user) => {
      const t = await P.createTask(db, user.id, body);
      await S.audit(db, user.id, 'user', 'task.created', 'task', t.id);
      return t;
    });
  });

  app.patch('/v1/tasks/:id', { schema: { tags: ['tasks'] } }, async (req) => {
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ status: z.enum(['pending', 'done', 'cancelled']).optional(), title: z.string().trim().min(1).max(200).optional(), priority: z.number().int().min(1).max(3).optional(), dueAt: isoDate.nullable().optional() }), req.body);
    return asUser(s, req, async (db, user) => {
      const t = await P.updateTask(db, id, body);
      if (!t) throw new HttpError(404, 'Tarefa não encontrada');
      await S.audit(db, user.id, 'user', 'task.updated', 'task', id, { status: body.status });
      return t;
    });
  });

  // ───────── reminders ─────────
  app.post('/v1/reminders', { schema: { tags: ['reminders'] } }, async (req, reply) => {
    const body = parse(
      z.object({ title: z.string().trim().min(1).max(200), body: z.string().max(1000).nullable().default(null), remindAt: isoDate, timezone: z.string().refine(isValidTimeZone, 'fuso inválido').optional(), recurrenceRule: rrule.nullable().default(null), taskId: z.string().uuid().nullable().default(null) }),
      req.body,
    );
    if (Date.parse(body.remindAt) < Date.now() - 60_000) throw new HttpError(400, 'remindAt está no passado');
    return idempotent(s, req, reply, 201, async (db, user) => {
      const tz = body.timezone ?? (await S.getProfile(db))?.timezone ?? 'America/Sao_Paulo';
      const r = await P.createReminder(db, user.id, { ...body, remindAt: new Date(body.remindAt).toISOString(), timezone: tz });
      await S.audit(db, user.id, 'user', 'reminder.created', 'reminder', r.id);
      return r;
    });
  });

  app.get('/v1/reminders', { schema: { tags: ['reminders'] } }, async (req) => {
    const q = parse(z.object({ from: isoDate.optional(), to: isoDate.optional(), includeDone: z.coerce.boolean().default(false) }), req.query);
    return asUser(s, req, (db) => P.listReminders(db, q.from ?? null, q.to ?? null, q.includeDone));
  });

  app.post('/v1/reminders/:id/complete', { schema: { tags: ['reminders'], summary: 'Conclui; lembretes recorrentes avançam para a próxima ocorrência' } }, async (req) => {
    const { id } = parse(idParams, req.params);
    return asUser(s, req, async (db, user) => {
      const { rows } = await db.query(`select * from maindy.reminders where id = $1`, [id]);
      const r = rows[0];
      if (!r) throw new HttpError(404, 'Lembrete não encontrado');
      await S.audit(db, user.id, 'user', 'reminder.completed', 'reminder', id);
      if (r.recurrence_rule) {
        const next = nextOccurrence(r.recurrence_rule, new Date(r.remind_at), new Date(Math.max(Date.now(), Date.parse(r.remind_at))), r.timezone);
        if (next) return P.updateReminderStatus(db, id, 'scheduled', next.toISOString());
      }
      return P.updateReminderStatus(db, id, 'done');
    });
  });

  app.post('/v1/reminders/:id/snooze', { schema: { tags: ['reminders'] } }, async (req) => {
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ minutes: z.number().int().min(1).max(1440).default(10) }), req.body ?? {});
    return asUser(s, req, async (db) => {
      const r = await P.updateReminderStatus(db, id, 'scheduled', new Date(Date.now() + body.minutes * 60_000).toISOString());
      if (!r) throw new HttpError(404, 'Lembrete não encontrado');
      return r;
    });
  });

  app.delete('/v1/reminders/:id', { schema: { tags: ['reminders'] } }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await asUser(s, req, async (db, user) => {
      if (!(await P.updateReminderStatus(db, id, 'cancelled'))) throw new HttpError(404, 'Lembrete não encontrado');
      await S.audit(db, user.id, 'user', 'reminder.cancelled', 'reminder', id);
    });
    reply.code(204);
    return null;
  });

  // ───────── calendar ─────────
  app.get('/v1/calendar/events', { schema: { tags: ['calendar'] } }, async (req) => {
    const q = parse(z.object({ from: isoDate, to: isoDate }), req.query);
    return asUser(s, req, (db) => P.listEvents(db, new Date(q.from).toISOString(), new Date(q.to).toISOString()));
  });

  app.post('/v1/calendar/events', { schema: { tags: ['calendar'] } }, async (req, reply) => {
    const body = parse(
      z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2000).nullable().default(null), location: z.string().max(300).nullable().default(null), startsAt: isoDate, endsAt: isoDate, timezone: z.string().refine(isValidTimeZone).optional(), recurrenceRule: rrule.nullable().default(null) }),
      req.body,
    );
    if (Date.parse(body.endsAt) < Date.parse(body.startsAt)) throw new HttpError(400, 'endsAt deve ser depois de startsAt');
    return idempotent(s, req, reply, 201, async (db, user) => {
      const tz = body.timezone ?? (await S.getProfile(db))?.timezone ?? 'America/Sao_Paulo';
      const e = await P.createEvent(db, user.id, { ...body, startsAt: new Date(body.startsAt).toISOString(), endsAt: new Date(body.endsAt).toISOString(), timezone: tz });
      await S.audit(db, user.id, 'user', 'calendar.event_created', 'calendar_event', e.id);
      return e;
    });
  });

  app.delete('/v1/calendar/events/:id', { schema: { tags: ['calendar'], summary: 'Apagar evento (a UI pede confirmação antes de chamar)' } }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await asUser(s, req, async (db, user) => {
      if (!(await P.deleteEvent(db, id))) throw new HttpError(404, 'Evento não encontrado');
      await S.audit(db, user.id, 'user', 'calendar.event_deleted', 'calendar_event', id);
    });
    reply.code(204);
    return null;
  });

  // ───────── focus ─────────
  app.get('/v1/focus', { schema: { tags: ['focus'] } }, async (req) => asUser(s, req, (db) => P.currentFocus(db)));
  app.post('/v1/focus', { schema: { tags: ['focus'] } }, async (req) => {
    const body = parse(z.object({ mode: z.enum(['off', 'work', 'study', 'rest', 'sleep', 'driving']), minutes: z.number().int().min(5).max(600).nullable().default(null) }), req.body);
    return asUser(s, req, async (db, user) => {
      const r = await P.startFocus(db, user.id, body.mode, body.minutes);
      await S.audit(db, user.id, 'user', body.mode === 'off' ? 'focus.ended' : 'focus.started', 'focus_session', r.id || null, { mode: body.mode });
      return P.currentFocus(db);
    });
  });
}
