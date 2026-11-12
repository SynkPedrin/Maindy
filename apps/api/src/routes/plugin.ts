import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { extractMemoryLocal } from '@maindy/core';
import { HttpError, parse } from '../http.js';
import { MemoryService, type AppServices, type RequestUser } from '../services.js';
import * as M from '../repo/memories.js';
import * as S from '../repo/system.js';

/**
 * Endpoints for the Obsidian plugin (existing-vault integration). Authenticated with a
 * per-device connection token (`Authorization: MaindyVault mdy_…`) created in the app via
 * POST /v1/vaults/connect. Only its SHA-256 is stored; tokens are revocable.
 */
async function pluginUser(s: AppServices, req: FastifyRequest): Promise<RequestUser> {
  const header = req.headers.authorization ?? '';
  const m = header.match(/^MaindyVault\s+(mdy_[A-Za-z0-9_-]{20,})$/);
  if (!m) throw new HttpError(401, 'Token do plugin ausente', 'unauthorized');
  const hash = createHash('sha256').update(m[1]!).digest('hex');
  const row = await s.db.withService(async (db) => {
    const { rows } = await db.query(
      `update maindy.vault_connections set last_seen_at = now() where token_hash = $1 and revoked_at is null returning user_id`,
      [hash],
    );
    return rows[0] as { user_id: string } | undefined;
  });
  if (!row) throw new HttpError(401, 'Token do plugin inválido ou revogado', 'unauthorized');
  return { id: row.user_id, email: undefined, appRole: 'user', claims: { sub: row.user_id, role: 'authenticated' } };
}

export async function pluginRoutes(app: FastifyInstance, s: AppServices) {
  const opts = { config: { public: true, rateLimit: { max: 60, timeWindow: '1 minute' } } };

  app.get('/v1/plugin/memories', { ...opts, schema: { tags: ['vaults'], summary: 'Plugin Obsidian: memórias alteradas desde `since`' } }, async (req) => {
    const user = await pluginUser(s, req);
    const q = parse(z.object({ since: z.string().optional() }), req.query);
    return s.db.withUser(user.claims, async (db) => {
      const all = await M.listMemories(db, { limit: 100 });
      const since = q.since ? Date.parse(q.since) : 0;
      return { serverTime: new Date().toISOString(), memories: all.filter((m) => Date.parse(m.updatedAt) > since) };
    });
  });

  app.post('/v1/plugin/notes', { ...opts, schema: { tags: ['vaults'], summary: 'Plugin Obsidian: envia uma nota marcada com #maindy como memória' } }, async (req, reply) => {
    const user = await pluginUser(s, req);
    const body = parse(z.object({ path: z.string().max(500), title: z.string().max(140), content: z.string().min(1).max(8000) }), req.body);
    const memory = await s.db.withUser(user.claims, async (db) => {
      const ex = extractMemoryLocal(body.content);
      const m = await new MemoryService(s, db, user).create({
        title: body.title || ex.title,
        content: body.content,
        type: ex.type,
        category: ex.category,
        tags: [...new Set([...ex.tags, 'obsidian'])],
        people: ex.people,
        source: 'vault',
        provenance: 'user_confirmed',
        confidence: 1,
        originalUtterance: null,
      });
      await S.audit(db, user.id, 'user', 'vault.plugin_note_imported', 'memory', m.id, { path: body.path });
      return m;
    });
    reply.code(201);
    return memory;
  });
}
