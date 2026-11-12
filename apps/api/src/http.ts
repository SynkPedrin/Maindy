import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from './db.js';
import type { AppServices, RequestUser } from './services.js';

export class HttpError extends Error {
  constructor(readonly statusCode: number, message: string, readonly code = 'error') {
    super(message);
  }
}

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), 'validation_error');
  return r.data;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: RequestUser | null;
  }
}

export function requireUser(req: FastifyRequest): RequestUser {
  if (!req.user) throw new HttpError(401, 'Autenticação necessária', 'unauthorized');
  return req.user;
}

/** Runs `fn` inside the caller's RLS-scoped transaction. */
export function asUser<T>(s: AppServices, req: FastifyRequest, fn: (db: Db, user: RequestUser) => Promise<T>): Promise<T> {
  const user = requireUser(req);
  return s.db.withUser(user.claims, (db) => fn(db, user));
}

/**
 * Idempotency for mutating requests: when the client sends `Idempotency-Key`, the first
 * response is stored per user and replayed for retries with the same body.
 */
export async function idempotent<T>(s: AppServices, req: FastifyRequest, reply: FastifyReply, status: number, fn: (db: Db, user: RequestUser) => Promise<T>): Promise<T> {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !key) {
    const out = await asUser(s, req, fn);
    reply.code(status);
    return out;
  }
  if (key.length > 200) throw new HttpError(400, 'Idempotency-Key muito longa');
  const hash = createHash('sha256').update(`${req.method} ${req.routeOptions.url} ${JSON.stringify(req.body ?? null)}`).digest('hex');
  return asUser(s, req, async (db, user) => {
    const { rows } = await db.query(`select request_hash, status_code, response from maindy.idempotency_keys where key = $1`, [key]);
    if (rows[0]) {
      if (rows[0].request_hash !== hash) throw new HttpError(422, 'Idempotency-Key reutilizada com outro conteúdo', 'idempotency_mismatch');
      reply.code(rows[0].status_code).header('Idempotent-Replayed', 'true');
      return rows[0].response as T;
    }
    const out = await fn(db, user);
    await db.query(`insert into maindy.idempotency_keys (user_id, key, route, request_hash, status_code, response) values ($1,$2,$3,$4,$5,$6)`, [
      user.id,
      key,
      req.routeOptions.url ?? '',
      hash,
      status,
      JSON.stringify(out ?? null),
    ]);
    reply.code(status);
    return out;
  });
}

export const uuid = z.string().uuid();
export const idParams = z.object({ id: uuid });
