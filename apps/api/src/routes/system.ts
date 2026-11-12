import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CAPABILITIES, addDays, isValidTimeZone, toZonedParts, validateGrantRequest, zonedTimeToUtc, type HealthStatus } from '@maindy/core';
import { HttpError, asUser, idParams, idempotent, parse, requireUser } from '../http.js';
import { MemoryService, type AppServices } from '../services.js';
import { exchangeCode, googleAuthUrl, storeTokens } from '../integrations/google.js';
import { fetchWeather } from '../integrations/weather.js';
import * as M from '../repo/memories.js';
import * as P from '../repo/planning.js';
import * as S from '../repo/system.js';

export async function systemRoutes(app: FastifyInstance, s: AppServices) {
  // ───────── health (public) ─────────
  app.get('/v1/health', { config: { public: true }, schema: { tags: ['system'] } }, async (): Promise<HealthStatus> => {
    const [database, ...voice] = await Promise.all([s.db.ping(), ...s.voice.list().map(async (p) => ({ provider: p.id, ...(await p.health()) }))]);
    return {
      ok: database,
      database,
      ai: { provider: 'anthropic', configured: s.ai.configured, model: s.ai.modelId },
      voice,
      embeddings: { provider: s.embeddings.id, ready: s.embeddings.ready() },
    };
  });

  // ───────── profile / agent / settings ─────────
  app.get('/v1/me', { schema: { tags: ['agent'] } }, async (req) =>
    asUser(s, req, async (db, user) => ({ profile: await S.getProfile(db), agent: await S.ensureAgent(db, user.id), settings: await S.getSettings(db), email: user.email })),
  );

  app.patch('/v1/me', { schema: { tags: ['agent'] } }, async (req) => {
    const body = parse(z.object({ displayName: z.string().trim().min(1).max(80).optional(), timezone: z.string().refine(isValidTimeZone, 'fuso inválido').optional(), locale: z.string().max(10).optional(), onboardingCompleted: z.boolean().optional() }), req.body);
    return asUser(s, req, async (db, user) => {
      await S.updateProfile(db, user.id, body);
      return S.getProfile(db);
    });
  });

  const agentPatch = z.object({
    name: z.string().trim().min(1).max(40).optional(),
    personality: z.string().trim().min(1).max(200).optional(),
    tone: z.string().trim().min(1).max(60).optional(),
    language: z.string().max(10).optional(),
    responseStyle: z.enum(['curto', 'equilibrado', 'detalhado']).optional(),
    voiceProvider: z.enum(['device', 'voicestudio', 'elevenlabs', 'openai']).optional(),
    voiceId: z.string().max(120).optional(),
  });

  app.post('/v1/agents', { schema: { tags: ['agent'], summary: 'Cria (ou retorna) o agente do usuário' } }, async (req, reply) => {
    const body = parse(agentPatch, req.body ?? {});
    return idempotent(s, req, reply, 201, async (db, user) => {
      await S.ensureAgent(db, user.id);
      return S.updateAgent(db, body);
    });
  });
  app.get('/v1/agents/me', { schema: { tags: ['agent'] } }, async (req) => asUser(s, req, (db, user) => S.ensureAgent(db, user.id)));
  app.patch('/v1/agents/me', { schema: { tags: ['agent'] } }, async (req) => {
    const body = parse(agentPatch, req.body);
    return asUser(s, req, async (db, user) => {
      await S.ensureAgent(db, user.id);
      const a = await S.updateAgent(db, body);
      await S.audit(db, user.id, 'user', 'agent.updated', 'agent', a?.id ?? null, { fields: Object.keys(body) });
      return a;
    });
  });

  app.get('/v1/settings', { schema: { tags: ['agent'] } }, async (req) => asUser(s, req, (db) => S.getSettings(db)));
  app.patch('/v1/settings', { schema: { tags: ['agent'] } }, async (req) => {
    const body = parse(z.object({ autoSaveMemories: z.boolean().optional(), speechRate: z.number().min(0.5).max(2).optional(), speakResponses: z.boolean().optional(), storeAudio: z.boolean().optional(), allowModelTraining: z.boolean().optional(), forwardNotificationContents: z.boolean().optional() }), req.body);
    return asUser(s, req, async (db, user) => {
      const out = await S.updateSettings(db, body);
      await S.audit(db, user.id, 'user', 'settings.updated', 'agent_settings', null, body);
      return out;
    });
  });

  // ───────── about the user (onboarding "Sobre você") ─────────
  const ABOUT = {
    work: { title: 'Sobre mim — trabalho', category: 'work', type: 'personal' },
    activities: { title: 'Sobre mim — o que eu faço', category: 'personal', type: 'personal' },
    routine: { title: 'Sobre mim — minha rotina', category: 'routines', type: 'habit' },
  } as const;
  app.get('/v1/profile/about', { schema: { tags: ['agent'], summary: 'O que o usuário contou sobre si (trabalho, atividades, rotina)' } }, async (req) =>
    asUser(s, req, async (db) => {
      const { rows } = await db.query(`select title, content from maindy.memories where 'perfil' = any(tags)`);
      const out: Record<string, string> = { work: '', activities: '', routine: '' };
      for (const [k, v] of Object.entries(ABOUT)) out[k] = rows.find((r) => r.title === v.title)?.content ?? '';
      return out;
    }),
  );
  app.put('/v1/profile/about', { schema: { tags: ['agent'], summary: 'Salva "Sobre você" como memórias confirmadas (tag perfil)' } }, async (req) => {
    const body = parse(z.object({ work: z.string().max(2000).default(''), activities: z.string().max(2000).default(''), routine: z.string().max(2000).default('') }), req.body);
    return asUser(s, req, async (db, user) => {
      const svc = new MemoryService(s, db, user);
      for (const [k, meta] of Object.entries(ABOUT) as Array<[keyof typeof ABOUT, (typeof ABOUT)[keyof typeof ABOUT]]>) {
        const content = body[k].trim();
        const { rows } = await db.query(`select id from maindy.memories where title = $1 and 'perfil' = any(tags) limit 1`, [meta.title]);
        if (!content) {
          if (rows[0]) await svc.delete(rows[0].id, 'user');
          continue;
        }
        if (rows[0]) await svc.update(rows[0].id, { content }, 'user');
        else await svc.create({ title: meta.title, content, type: meta.type, category: meta.category, tags: ['perfil', meta.category], people: [], source: 'text', provenance: 'user_confirmed', confidence: 1, originalUtterance: content });
      }
      return { ok: true };
    });
  });

  // ───────── home dashboard ─────────
  app.get('/v1/home', { schema: { tags: ['agent'], summary: 'Resumo do dia: prioridades, lembretes, agenda, foco e memórias recentes' } }, async (req) =>
    asUser(s, req, async (db, user) => {
      const profile = await S.getProfile(db);
      const tz = profile?.timezone ?? 'America/Sao_Paulo';
      const now = new Date();
      const p = toZonedParts(now, tz);
      const start = zonedTimeToUtc(p.year, p.month, p.day, 0, 0, tz);
      const n = addDays(p.year, p.month, p.day, 1);
      const end = zonedTimeToUtc(n.y, n.m, n.d, 0, 0, tz);
      const [tasks, reminders, events, focus, recent, agent] = await Promise.all([
        P.listTasks(db, 'pending'),
        P.listReminders(db, now.toISOString(), new Date(now.getTime() + 7 * 86_400_000).toISOString()),
        P.listEvents(db, start.toISOString(), end.toISOString()),
        P.currentFocus(db),
        M.listMemories(db, { limit: 5 }),
        S.ensureAgent(db, user.id),
      ]);
      return { profile, agent, timezone: tz, now: now.toISOString(), priorities: tasks.slice(0, 5), pendingTasks: tasks.length, upcomingReminders: reminders.slice(0, 5), todayEvents: events, focus, recentMemories: recent };
    }),
  );

  // ───────── permissions ─────────
  app.get('/v1/permissions', { schema: { tags: ['permissions'] } }, async (req) =>
    asUser(s, req, async (db) => ({ capabilities: Object.values(CAPABILITIES), grants: await S.listGrants(db) })),
  );
  app.post('/v1/permissions', { schema: { tags: ['permissions'], summary: 'Concede/ajusta uma permissão (só a partir da UI autenticada)' } }, async (req, reply) => {
    const body = parse(z.object({ capability: z.string(), integration: z.string().max(40).nullable().default(null), mode: z.enum(['auto', 'confirm', 'deny']), expiresAt: z.string().nullable().default(null) }), req.body);
    try {
      validateGrantRequest(body);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    return idempotent(s, req, reply, 201, async (db, user) => {
      const g = await S.createGrant(db, user.id, body);
      await S.audit(db, user.id, 'user', 'permission.granted', 'permission', g.id, body);
      return g;
    });
  });
  app.delete('/v1/permissions/:id', { schema: { tags: ['permissions'] } }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await asUser(s, req, async (db, user) => {
      if (!(await S.revokeGrant(db, id))) throw new HttpError(404, 'Permissão não encontrada ou já revogada');
      await S.audit(db, user.id, 'user', 'permission.revoked', 'permission', id);
    });
    reply.code(204);
    return null;
  });

  app.get('/v1/audit', { schema: { tags: ['permissions'] } }, async (req) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    return asUser(s, req, (db) => S.listAudit(db, q.limit));
  });

  // ───────── integrations ─────────
  const stateSecret = Buffer.from(s.config.credentialsKey, 'hex');
  const signState = (userId: string) => {
    const payload = `${userId}.${Date.now()}.${randomBytes(8).toString('hex')}`;
    return `${payload}.${createHmac('sha256', stateSecret).update(payload).digest('base64url')}`;
  };
  const verifyState = (state: string): string => {
    const i = state.lastIndexOf('.');
    const payload = state.slice(0, i);
    const sig = Buffer.from(state.slice(i + 1));
    const expected = Buffer.from(createHmac('sha256', stateSecret).update(payload).digest('base64url'));
    if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) throw new HttpError(400, 'state inválido');
    const [userId, ts] = payload.split('.');
    if (Date.now() - Number(ts) > 10 * 60_000) throw new HttpError(400, 'state expirado');
    return userId!;
  };

  app.get('/v1/integrations', { schema: { tags: ['integrations'] } }, async (req) =>
    asUser(s, req, async (db) => {
      const { rows } = await db.query(`select provider, status, scopes, connected_at from maindy.integrations`);
      const known = [
        { provider: 'google', label: 'Google (Gmail + Agenda)', available: Boolean(s.config.google) },
        { provider: 'weather', label: 'Clima (Open-Meteo)', available: true },
        { provider: 'device_calendar', label: 'Agenda do aparelho', available: true, note: 'Lida no próprio aparelho, com permissão do sistema.' },
      ];
      return known.map((k) => {
        const r = rows.find((x) => x.provider === k.provider);
        return { ...k, status: k.provider === 'weather' ? 'connected' : (r?.status ?? 'disconnected'), scopes: r?.scopes ?? [], connectedAt: r?.connected_at ?? null };
      });
    }),
  );

  app.post('/v1/integrations/:provider/connect', { schema: { tags: ['integrations'], summary: 'Inicia OAuth; retorna a URL de autorização' } }, async (req) => {
    const { provider } = parse(z.object({ provider: z.enum(['google']) }), req.params);
    if (!s.config.google) throw new HttpError(503, 'Integração Google não configurada no servidor (GOOGLE_CLIENT_ID/SECRET).', 'integration_not_configured');
    return asUser(s, req, async (db, user) => {
      await db.query(`insert into maindy.integrations (user_id, provider, status) values ($1, $2, 'pending') on conflict (user_id, provider) do update set status = 'pending'`, [user.id, provider]);
      await S.audit(db, user.id, 'user', 'integration.connect_started', 'integration', provider);
      return { authorizationUrl: googleAuthUrl(s.config.google!, signState(user.id)) };
    });
  });

  app.get('/v1/integrations/google/callback', { config: { public: true }, schema: { tags: ['integrations'], summary: 'Callback OAuth do Google' } }, async (req, reply) => {
    const q = parse(z.object({ code: z.string().optional(), state: z.string(), error: z.string().optional() }), req.query);
    const userId = verifyState(q.state);
    if (q.error || !q.code || !s.config.google) {
      reply.type('text/html');
      return '<p>Conexão cancelada. Você pode fechar esta janela.</p>';
    }
    const tokens = await exchangeCode(s.config.google, q.code);
    await s.db.withService(async (db) => {
      const { rows } = await db.query(
        `insert into maindy.integrations (user_id, provider, status, scopes, connected_at) values ($1, 'google', 'connected', $2, now())
         on conflict (user_id, provider) do update set status = 'connected', scopes = excluded.scopes, connected_at = now() returning id`,
        [userId, (tokens.scope ?? '').split(' ').filter(Boolean)],
      );
      await storeTokens(db, userId, rows[0].id, tokens, s.config.credentialsKey);
      await S.audit(db, userId, 'user', 'integration.connected', 'integration', 'google');
    });
    reply.type('text/html');
    return '<p>Google conectado à MAINDY. Você pode voltar ao app.</p>';
  });

  app.delete('/v1/integrations/:provider', { schema: { tags: ['integrations'] } }, async (req, reply) => {
    const { provider } = parse(z.object({ provider: z.string().max(40) }), req.params);
    const user = requireUser(req);
    await s.db.withService(async (db) => {
      await db.query(`delete from maindy.provider_credentials c using maindy.integrations i where c.integration_id = i.id and i.user_id = $1 and i.provider = $2`, [user.id, provider]);
      await db.query(`update maindy.integrations set status = 'revoked' where user_id = $1 and provider = $2`, [user.id, provider]);
      await S.audit(db, user.id, 'user', 'integration.revoked', 'integration', provider);
    });
    reply.code(204);
    return null;
  });

  app.get('/v1/weather', { schema: { tags: ['integrations'], summary: 'Clima real (Open-Meteo) para a localização enviada pelo app' } }, async (req) => {
    const q = parse(z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) }), req.query);
    const tz = await asUser(s, req, async (db) => (await S.getProfile(db))?.timezone ?? 'America/Sao_Paulo');
    try {
      return await fetchWeather(q.lat, q.lon, tz);
    } catch (err) {
      throw new HttpError(502, `Clima indisponível: ${(err as Error).message}`, 'weather_unavailable');
    }
  });

  // ───────── devices ─────────
  app.post('/v1/devices', { schema: { tags: ['devices'], summary: 'Registra o aparelho e o token de push' } }, async (req, reply) => {
    const body = parse(z.object({ platform: z.enum(['ios', 'android', 'web']), name: z.string().max(80).nullable().default(null), pushToken: z.string().max(300).nullable().default(null) }), req.body);
    return idempotent(s, req, reply, 201, async (db, user) => {
      const { rows } = body.pushToken
        ? await db.query(
            `insert into maindy.devices (user_id, platform, name, push_token) values ($1,$2,$3,$4)
             on conflict (user_id, push_token) where push_token is not null do update set last_seen_at = now(), revoked_at = null, name = excluded.name returning *`,
            [user.id, body.platform, body.name, body.pushToken],
          )
        : await db.query(`insert into maindy.devices (user_id, platform, name) values ($1,$2,$3) returning *`, [user.id, body.platform, body.name]);
      return { id: rows[0].id, platform: rows[0].platform, name: rows[0].name, lastSeenAt: rows[0].last_seen_at };
    });
  });
  app.get('/v1/devices', { schema: { tags: ['devices'] } }, async (req) =>
    asUser(s, req, async (db) => {
      const { rows } = await db.query(`select id, platform, name, last_seen_at, revoked_at, created_at from maindy.devices order by last_seen_at desc`);
      return rows.map((r) => ({ id: r.id, platform: r.platform, name: r.name, lastSeenAt: r.last_seen_at, revokedAt: r.revoked_at, createdAt: r.created_at }));
    }),
  );
  app.delete('/v1/devices/:id', { schema: { tags: ['devices'] } }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await asUser(s, req, async (db, user) => {
      await db.query(`update maindy.devices set revoked_at = now(), push_token = null where id = $1`, [id]);
      await S.audit(db, user.id, 'user', 'device.revoked', 'device', id);
    });
    reply.code(204);
    return null;
  });

  // ───────── voice ─────────
  app.get('/v1/voice/providers', { schema: { tags: ['voice'] } }, async () =>
    Promise.all(s.voice.list().map(async (p) => ({ id: p.id, label: p.label, ...(await p.health()) }))),
  );
  app.get('/v1/voice/voices', { schema: { tags: ['voice'] } }, async (req) => {
    requireUser(req);
    const q = parse(z.object({ provider: z.enum(['voicestudio', 'elevenlabs', 'openai']) }), req.query);
    try {
      return await s.voice.get(q.provider).getVoices();
    } catch (err) {
      throw new HttpError(503, (err as Error).message, 'voice_unavailable');
    }
  });
  app.post('/v1/voice/preview', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags: ['voice'], summary: 'Sintetiza uma prévia da voz escolhida' } }, async (req, reply) => {
    requireUser(req);
    const body = parse(z.object({ provider: z.enum(['voicestudio', 'elevenlabs', 'openai']), voiceId: z.string().max(120), text: z.string().min(1).max(400), language: z.string().default('pt-BR'), speed: z.number().min(0.5).max(2).default(1) }), req.body);
    try {
      const out = await s.voice.get(body.provider).synthesize(body);
      reply.header('Content-Type', out.mimeType);
      return Buffer.from(out.audio);
    } catch (err) {
      throw new HttpError(503, (err as Error).message, 'voice_unavailable');
    }
  });

  // ───────── privacy (LGPD): export & delete ─────────
  app.get('/v1/privacy/export', { schema: { tags: ['privacy'], summary: 'Exporta todos os dados pessoais em JSON' } }, async (req) =>
    asUser(s, req, async (db, user) => {
      const q = async (sql: string) => (await db.query(sql)).rows;
      const data = {
        exportedAt: new Date().toISOString(),
        profile: await S.getProfile(db),
        agent: await S.getAgent(db),
        settings: await S.getSettings(db),
        memories: await q(`select id, type, category, title, content, source, provenance, confidence, tags, original_utterance, created_at, updated_at, vault_path from maindy.memories order by created_at`),
        people: await q(`select id, name, relation, aliases, notes, created_at from maindy.people`),
        tasks: await q(`select * from maindy.tasks`),
        reminders: await q(`select * from maindy.reminders`),
        calendarEvents: await q(`select * from maindy.calendar_events`),
        conversations: await q(`select c.id, c.title, c.created_at, json_agg(json_build_object('role', m.role, 'content', m.content, 'at', m.created_at) order by m.created_at) as messages from maindy.conversations c left join maindy.conversation_messages m on m.conversation_id = c.id group by c.id`),
        permissions: await S.listGrants(db),
        consents: await q(`select kind, granted, policy_version, created_at from maindy.consents`),
        auditLog: await S.listAudit(db, 1000),
      };
      await S.audit(db, user.id, 'user', 'privacy.exported', null, null);
      return data;
    }),
  );

  app.post('/v1/consents', { schema: { tags: ['privacy'] } }, async (req, reply) => {
    const body = parse(z.object({ kind: z.enum(['terms', 'privacy', 'ai_processing', 'notification_contents', 'voice_processing']), granted: z.boolean(), policyVersion: z.string().max(40) }), req.body);
    return idempotent(s, req, reply, 201, async (db, user) => {
      await db.query(`insert into maindy.consents (user_id, kind, granted, policy_version) values ($1,$2,$3,$4)`, [user.id, body.kind, body.granted, body.policyVersion]);
      await S.audit(db, user.id, 'user', 'consent.recorded', 'consent', body.kind, body);
      return { ok: true };
    });
  });

  app.delete('/v1/account', { schema: { tags: ['privacy'], summary: 'Apaga a conta e TODOS os dados (irreversível; exige confirm="APAGAR")' } }, async (req, reply) => {
    const user = requireUser(req);
    parse(z.object({ confirm: z.literal('APAGAR') }), req.body);
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) throw new HttpError(503, 'Exclusão de conta indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor');
    const key = await asUser(s, req, async (db) => (await db.query(`select storage_key from maindy.vaults limit 1`)).rows[0]?.storage_key as string | undefined);
    await s.db.withService(async (db) => {
      await db.query(`select set_config('maindy.allow_audit_purge', 'on', true)`);
      await db.query(`delete from maindy.audit_logs where user_id = $1`, [user.id]);
    });
    const res = await fetch(`${s.config.supabaseUrl}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!res.ok) throw new HttpError(502, `Falha ao apagar a conta (HTTP ${res.status})`);
    if (key) await s.vault.destroy(key);
    s.log.info({ userId: user.id }, 'account deleted');
    reply.code(204);
    return null;
  });

  // ───────── master (super admin): aggregate metrics only, never personal content ─────────
  app.get('/v1/admin/stats', { schema: { tags: ['admin'], summary: 'Métricas agregadas (somente usuário master)' } }, async (req) => {
    const user = requireUser(req);
    if (user.appRole !== 'master') throw new HttpError(403, 'Apenas o usuário master', 'forbidden');
    return s.db.withService(async (db) => {
      const { rows } = await db.query(`select
        (select count(*) from auth.users)::int as users,
        (select count(*) from maindy.memories)::int as memories,
        (select count(*) from maindy.reminders where status = 'scheduled')::int as scheduled_reminders,
        (select count(*) from maindy.conversation_messages where created_at > now() - interval '24 hours')::int as messages_24h,
        (select coalesce(sum(cost_usd), 0)::float from maindy.usage_records where created_at > now() - interval '30 days') as ai_cost_30d_usd`);
      return rows[0];
    });
  });
}
