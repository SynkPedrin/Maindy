import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { ApiError } from "@maindy/contracts";
import { z } from "zod";

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    {
      config: { rateLimit: false },
      schema: {
        tags: ["system"],
        response: { 200: z.object({ status: z.literal("ok"), db: z.literal("ok"), version: z.string(), time: z.string() }), 503: ApiError },
      },
    },
    async (req, reply) => {
      try {
        await app.deps.ping();
      } catch (err) {
        req.log.error({ err: err instanceof Error ? err.message : String(err) }, "health: db ping failed");
        return reply.status(503).send({ error: { code: "db_unavailable", message: "Banco de dados indisponível." } });
      }
      return { status: "ok" as const, db: "ok" as const, version: "0.1.0", time: new Date().toISOString() };
    },
  );
};
