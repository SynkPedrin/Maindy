import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createHash } from 'node:crypto';
import { redact } from '@maindy/core';
import type { AppConfig } from './config.js';
import { HttpError } from './http.js';
import { agentRoutes } from './routes/agent.js';
import { dataRoutes } from './routes/data.js';
import { systemRoutes } from './routes/system.js';
import { pluginRoutes } from './routes/plugin.js';
import { gatewayRoutes } from './routes/gateway.js';
import { createServices, type AppServices } from './services.js';

export async function buildApp(config: AppConfig, overrides: Partial<AppServices> = {}): Promise<{ app: FastifyInstance; services: AppServices }> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["idempotency-key"]'], censor: '[redacted]' },
    },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
    genReqId: () => createHash('sha1').update(`${Date.now()}${Math.random()}`).digest('hex').slice(0, 16),
  });
  const services = createServices(config, app.log, overrides);
  app.decorateRequest('user', null);

  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'apikey', 'x-client-info', 'x-supabase-api-version'],
    exposedHeaders: ['Idempotent-Replayed', 'Content-Disposition'],
    credentials: false,
    maxAge: 600,
  });
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
  await app.register(rateLimit, {
    max: 240,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const auth = req.headers.authorization;
      return auth ? createHash('sha256').update(auth).digest('hex').slice(0, 32) : req.ip;
    },
  });
  await app.register(swagger, {
    openapi: {
      info: { title: 'MAINDY API', version: '1.0.0', description: 'API do assistente pessoal MAINDY. Autenticação: Bearer <Supabase access token>.' },
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearer: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Authentication: every /v1 route except the ones flagged public
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/v1/')) return;
    const isPublic = (req.routeOptions.config as { public?: boolean } | undefined)?.public === true;
    const header = req.headers.authorization;
    if (!header) {
      if (isPublic) return;
      throw new HttpError(401, 'Autenticação necessária', 'unauthorized');
    }
    const token = header.replace(/^Bearer\s+/i, '');
    try {
      const claims = await services.auth.verify(token);
      req.user = { id: claims.sub, email: claims.email, appRole: claims.appRole, claims };
    } catch {
      if (isPublic) return;
      throw new HttpError(401, 'Token inválido ou expirado', 'unauthorized');
    }
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string; validation?: unknown }, req, reply) => {
    const status = err instanceof HttpError ? err.statusCode : (err.statusCode ?? 500);
    if (status >= 500) req.log.error({ err: redact(err.stack ?? err.message) }, 'request failed');
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '42501') return reply.code(403).send({ error: 'forbidden', message: 'Acesso negado' });
    if (pgCode === '22P02') return reply.code(400).send({ error: 'validation_error', message: 'Identificador inválido' });
    reply.code(status).send({
      error: err instanceof HttpError ? err.code : status === 429 ? 'rate_limited' : status >= 500 ? 'internal_error' : 'error',
      message: status >= 500 ? 'Erro interno. Tente novamente.' : redact(err.message),
    });
  });

  app.get('/', { config: { public: true } }, async () => ({ name: 'maindy-api', docs: '/docs', health: '/v1/health' }));
  await systemRoutes(app, services);
  await dataRoutes(app, services);
  await agentRoutes(app, services);
  await pluginRoutes(app, services);
  await gatewayRoutes(app, services);

  app.addHook('onClose', async () => services.db.close());
  return { app, services };
}
