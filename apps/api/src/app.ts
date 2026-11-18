import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { isTrustedPeer } from "./lib/ip.js";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { createBillingProvider, type BillingProvider } from "./billing/provider.js";
import type { Config } from "./config.js";
import type { AppDeps } from "./context.js";
import { createDb, type DbHandle } from "./db/client.js";
import { ApiHttpError } from "./lib/errors.js";
import { RateLimiter } from "./lib/rate-limiter.js";
import { SmtpMailer, type Mailer } from "./mail/mailer.js";
import { installAuth } from "./plugins/auth.js";
import { accountRoutes } from "./routes/account.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes } from "./routes/billing.js";
import { connectorRoutes } from "./routes/connectors.js";
import { deviceRoutes } from "./routes/devices.js";
import { healthRoutes } from "./routes/health.js";
import { orbitRoutes } from "./routes/orbit.js";
import { projectRoutes } from "./routes/projects.js";
import { releaseRoutes } from "./routes/releases.js";
import { reportRoutes } from "./routes/reports.js";
import { statsRoutes } from "./routes/stats.js";
import { telemetryRoutes } from "./routes/telemetry.js";

// pt-BR messages for zod validation details
z.config(z.locales.pt());

export const API_VERSION = "0.1.0";

export interface BuildAppOptions {
  config: Config;
  /** inject an existing DB handle (tests); otherwise one is created from DATABASE_URL */
  dbHandle?: DbHandle;
  mailer?: Mailer;
  billing?: BillingProvider;
  logger?: FastifyServerOptions["logger"];
}

export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "res.headers['set-cookie']",
  "*.password",
  "*.token",
  "*.deviceToken",
  "*.deviceCode",
  "*.sessionToken",
  "*.secret",
  "*.authorization",
  "*.cookie",
];

export function loggerOptions(config: Config): FastifyServerOptions["logger"] {
  return {
    level: config.LOG_LEVEL,
    redact: { paths: LOG_REDACT_PATHS, censor: "[redacted]" },
  };
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = opts;
  const dbHandle = opts.dbHandle ?? createDb(config.DATABASE_URL);
  const ownsDb = !opts.dbHandle;

  const app = Fastify({
    logger: opts.logger ?? loggerOptions(config),
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Client IP hardening. The Next.js `/api` rewrite forwards a client-supplied X-Forwarded-For
  // verbatim (it does not append the real peer), so XFF alone is spoofable. When CLIENT_IP_HEADER
  // is configured (an authoritative header set by the edge, e.g. x-vercel-forwarded-for,
  // cf-connecting-ip, x-real-ip), it replaces XFF — but only when the TCP peer is itself a trusted
  // proxy hop. Fastify's `req.ip` is computed lazily from headers, so this runs before any use.
  const ipHeader = config.CLIENT_IP_HEADER?.toLowerCase();
  if (ipHeader) {
    app.addHook("onRequest", async (req) => {
      const raw = req.raw;
      const peer = raw.socket.remoteAddress ?? "";
      const trusted = isTrustedPeer(peer, config.TRUST_PROXY);
      const edgeValue = raw.headers[ipHeader];
      const edgeIp = (Array.isArray(edgeValue) ? edgeValue[0] : edgeValue)?.split(",")[0]?.trim();
      if (trusted && edgeIp) raw.headers["x-forwarded-for"] = edgeIp;
      else delete raw.headers["x-forwarded-for"];
    });
  } else if (config.isProd && config.TRUST_PROXY !== false) {
    app.log.warn(
      "CLIENT_IP_HEADER não configurado em produção: X-Forwarded-For repassado pelo Next pode ser falsificado e enfraquecer os limites por IP. Configure o cabeçalho autoritativo da sua borda.",
    );
  }

  const deps: AppDeps = {
    config,
    db: dbHandle.db,
    ping: async () => {
      await dbHandle.sql`select 1`;
    },
    mailer: opts.mailer ?? new SmtpMailer(config.SMTP_URL, config.MAIL_FROM),
    billing: opts.billing ?? createBillingProvider(config),
    limiter: new RateLimiter(),
  };
  app.decorate("deps", deps);
  if (ownsDb) app.addHook("onClose", async () => dbHandle.close());

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: {
          code: "validation_error",
          message: "Dados inválidos. Verifique os campos e tente novamente.",
          details: err.validation.map((v) => ({
            path: `${err.validationContext ?? "body"}${v.instancePath}`,
            message: v.message,
          })),
        },
      });
    }
    if (err instanceof ApiHttpError) {
      if (err.headers) reply.headers(err.headers);
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
      });
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err: { message: err.message, issues: err.cause?.issues?.slice(0, 5) } }, "response serialization failed");
      return reply.status(500).send({ error: { code: "internal_error", message: "Erro interno. Tente novamente em instantes." } });
    }
    const status = err.statusCode ?? 500;
    if (status === 429) {
      return reply.status(429).send({ error: { code: "rate_limited", message: "Muitas requisições. Aguarde um pouco e tente novamente." } });
    }
    if (status === 413) {
      return reply.status(413).send({ error: { code: "payload_too_large", message: "Corpo da requisição grande demais." } });
    }
    if (status === 415) {
      return reply.status(415).send({ error: { code: "unsupported_media_type", message: "Tipo de conteúdo não suportado. Envie JSON." } });
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: "bad_request", message: "Requisição inválida." } });
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({ error: { code: "internal_error", message: "Erro interno. Tente novamente em instantes." } });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: "not_found", message: "Rota não encontrada." } });
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } });
  await app.register(cors, {
    origin: [config.webOrigin],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-maindy-csrf", "authorization"],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, ctx) =>
      new ApiHttpError(429, "rate_limited", "Muitas requisições. Aguarde um pouco e tente novamente.", undefined, {
        "retry-after": String(Math.ceil(ctx.ttl / 1000)),
      }),
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "maindy. control plane API",
        version: API_VERSION,
        description:
          "API do control plane da maindy (ORBIT Engine). Erros seguem `{ error: { code, message, details? } }`. Dinheiro em micros (`Money`).",
      },
      servers: [{ url: config.API_PUBLIC_URL }],
      components: {
        securitySchemes: {
          sessionCookie: { type: "apiKey", in: "cookie", name: "maindy_session" },
          deviceToken: { type: "http", scheme: "bearer" },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs", staticCSP: true });

  installAuth(app);

  await app.register(healthRoutes);
  await app.register(releaseRoutes);
  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(accountRoutes);
      await v1.register(billingRoutes);
      await v1.register(deviceRoutes);
      await v1.register(connectorRoutes);
      await v1.register(orbitRoutes);
      await v1.register(projectRoutes);
      await v1.register(telemetryRoutes);
      await v1.register(statsRoutes);
      await v1.register(reportRoutes);
    },
    { prefix: "/v1" },
  );

  return app;
}
