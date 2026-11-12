import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

/**
 * Serverless entry (Vercel). The Fastify app and its DB pool are created once per warm
 * instance. No background scheduler here: reminders are dispatched by Supabase pg_cron
 * calling POST /v1/internal/reminders/dispatch.
 */
let ready: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  if (!ready) {
    ready = (async () => {
      process.env.MAINDY_DOCS ??= 'off';
      process.env.MAINDY_STORAGE_ROOT ??= '/tmp/maindy';
      process.env.DB_POOL_MAX ??= '3';
      process.env.MAINDY_SCHEDULER ??= 'off';
      process.env.EMBEDDINGS_PROVIDER ??= 'none';
      // Names injected by the Vercel ↔ Supabase marketplace integration.
      process.env.DATABASE_URL ||= process.env.POSTGRES_URL ?? '';
      process.env.SUPABASE_URL ||= process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
      const { app } = await buildApp(loadConfig());
      await app.ready();
      return app;
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    app.server.emit('request', req, res);
  } catch (err) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'unavailable', message: (err as Error).message.replace(/(key|secret|password)[^\s]*/gi, '[redacted]') }));
  }
}
