import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthContext, DeviceAuth, WebAuth } from "../context.js";
import { ApiHttpError, forbidden, unauthorized } from "../lib/errors.js";
import { resolveDevice, resolveWebSession } from "../services/sessions.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Resolves `request.auth` per route config (`config.auth`), enforces roles and CSRF.
 * - Bearer device token wins when an Authorization header is present ("device"/"any" routes).
 * - Cookie-authenticated mutating requests must send `x-maindy-csrf: 1` and, when Origin is present,
 *   an Origin equal to WEB_PUBLIC_URL's origin.
 */
export function installAuth(app: FastifyInstance): void {
  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (req, reply) => {
    const mode = req.routeOptions.config?.auth ?? "none";
    if (mode === "none") return;
    const { db, config } = app.deps;

    let auth: AuthContext | null = null;
    const hasBearer = typeof req.headers.authorization === "string" && req.headers.authorization.length > 0;
    if ((mode === "device" || mode === "any") && hasBearer) {
      auth = await resolveDevice(db, req);
      if (!auth) throw new ApiHttpError(401, "invalid_device_token", "Token de dispositivo inválido ou revogado. Pareie o dispositivo novamente.");
    } else if (mode === "web" || mode === "any") {
      auth = await resolveWebSession(db, req, reply, config);
    }
    if (!auth) throw unauthorized(mode === "device" ? "Token de dispositivo ausente." : undefined);

    if (auth.kind === "web") {
      const roles = req.routeOptions.config?.roles;
      if (roles && !roles.includes(auth.role)) throw forbidden();
      if (MUTATING.has(req.method)) checkCsrf(req, config.webOrigin);
    }
    req.auth = auth;
  });
}

function checkCsrf(req: FastifyRequest, webOrigin: string): void {
  if (req.headers["x-maindy-csrf"] !== "1") {
    throw new ApiHttpError(403, "csrf_failed", "Requisição bloqueada por proteção CSRF. Recarregue a página e tente novamente.");
  }
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== webOrigin) {
    throw new ApiHttpError(403, "csrf_failed", "Origem da requisição não permitida.");
  }
}

export function webAuth(req: FastifyRequest): WebAuth {
  if (req.auth?.kind !== "web") throw unauthorized();
  return req.auth;
}

export function deviceAuth(req: FastifyRequest): DeviceAuth {
  if (req.auth?.kind !== "device") throw unauthorized("Token de dispositivo ausente.");
  return req.auth;
}

export function anyAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
