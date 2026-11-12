import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { AppServices } from '../services.js';
import { dispatchDueReminders } from '../scheduler.js';

/**
 * Public gateway pieces used when the API is the only thing exposed to the internet
 * (e.g. a tunnel for testing on a phone):
 *  - `/auth/v1/*` → Supabase Auth (GoTrue), allow-listed user endpoints only. The local Supabase
 *    stack itself is never exposed (its default service-role key is public knowledge).
 *  - `/download/*` → build artifacts (APK) from MAINDY_DOWNLOADS_DIR.
 */
const AUTH_ALLOW = [/^token$/, /^signup$/, /^user$/, /^logout$/, /^recover$/, /^verify$/, /^settings$/, /^health$/, /^\.well-known\/jwks\.json$/, /^otp$/, /^resend$/];

export async function gatewayRoutes(app: FastifyInstance, s: AppServices) {
  app.all('/auth/v1/*', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const sub = (req.params as { '*': string })['*'];
    if (!AUTH_ALLOW.some((re) => re.test(sub))) return reply.code(404).send({ error: 'not_found', message: 'Not found' });
    const url = new URL(`${s.config.supabaseUrl}/auth/v1/${sub}`);
    for (const [k, v] of Object.entries(req.query as Record<string, string>)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    for (const h of ['apikey', 'authorization', 'x-client-info', 'x-supabase-api-version']) {
      const v = req.headers[h];
      if (typeof v === 'string') headers[h] = v;
    }
    const res = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {}),
    });
    reply.code(res.status);
    const ct = res.headers.get('content-type');
    if (ct) reply.header('content-type', ct);
    return Buffer.from(await res.arrayBuffer());
  });

  // Reminder dispatch for serverless hosts: called every minute by Supabase pg_cron (pg_net)
  // with `x-cron-secret: <CRON_SECRET>`. Idempotent and safe to call concurrently (SKIP LOCKED).
  app.post('/v1/internal/reminders/dispatch', { config: { public: true }, schema: { tags: ['system'], summary: 'Despacha lembretes vencidos (cron)' } }, async (req, reply) => {
    const secret = s.config.cronSecret;
    const got = Buffer.from(String(req.headers['x-cron-secret'] ?? ''));
    if (!secret || got.length !== Buffer.byteLength(secret) || !timingSafeEqual(got, Buffer.from(secret))) {
      return reply.code(403).send({ error: 'forbidden', message: 'forbidden' });
    }
    return dispatchDueReminders(s);
  });

  const dir = process.env.MAINDY_DOWNLOADS_DIR;
  app.get('/download', async (_req, reply) => {
    const has = dir && existsSync(path.join(dir, 'maindy.apk'));
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MAINDY</title>
<body style="margin:0;background:#05082B;color:#F8F8FF;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">
<div><h1 style="font-size:34px;margin:0 0 8px">maindy<span style="color:#7600FF">.</span></h1>
<p style="color:#A8AAC6">Versão de teste para Android</p>
${has ? `<a href="/download/maindy.apk" style="display:inline-block;margin-top:16px;padding:16px 28px;border-radius:999px;background:#7600FF;color:#fff;text-decoration:none;font-weight:600">Baixar APK (${Math.round(statSync(path.join(dir!, 'maindy.apk')).size / 1e6)} MB)</a>
<p style="color:#A8AAC6;font-size:13px;margin-top:16px">Depois de baixar, permita “instalar apps desconhecidos” para o navegador.</p>` : '<p>Nenhum build disponível.</p>'}
</div></body></html>`;
  });

  app.get('/download/maindy.apk', async (_req, reply) => {
    const file = dir ? path.join(dir, 'maindy.apk') : '';
    if (!file || !existsSync(file)) return reply.code(404).send({ error: 'not_found', message: 'Nenhum build disponível' });
    reply.header('Content-Type', 'application/vnd.android.package-archive').header('Content-Disposition', 'attachment; filename="maindy.apk"').header('Content-Length', String(statSync(file).size));
    return reply.send(createReadStream(file));
  });
}
