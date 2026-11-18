import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Config } from "../config.js";
import type { DbOrTx } from "../db/client.js";
import { devices, memberships, sessions, users } from "../db/schema.js";
import { randomToken, sha256Hex } from "../lib/crypto.js";
import { ipPrefix } from "../lib/ip.js";
import type { DeviceAuth, WebAuth } from "../context.js";

export const SESSION_COOKIE = "maindy_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** sliding refresh granularity — avoids a write on every request */
const SLIDE_AFTER_MS = 10 * 60 * 1000;
const DEVICE_SEEN_AFTER_MS = 5 * 60 * 1000;

export function cookieOptions(config: Config) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.isProd,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function setSessionCookie(reply: FastifyReply, config: Config, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(config));
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: config.isProd });
}

export async function createSession(
  db: DbOrTx,
  input: { userId: string; orgId: string; userAgent: string | undefined; ip: string },
): Promise<{ token: string; sessionId: string }> {
  const token = randomToken(32);
  const [row] = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      organizationId: input.orgId,
      tokenHash: sha256Hex(token),
      userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
      ipPrefix: ipPrefix(input.ip),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    .returning({ id: sessions.id });
  return { token, sessionId: row!.id };
}

export async function resolveWebSession(
  db: DbOrTx,
  req: FastifyRequest,
  reply: FastifyReply,
  config: Config,
): Promise<WebAuth | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token || token.length > 200) return null;
  const now = new Date();
  const [row] = await db
    .select({ s: sessions, role: memberships.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(memberships, and(eq(memberships.userId, sessions.userId), eq(memberships.organizationId, sessions.organizationId)))
    .where(and(eq(sessions.tokenHash, sha256Hex(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)));
  if (!row) return null;
  if (now.getTime() - row.s.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS), ipPrefix: ipPrefix(req.ip) })
      .where(eq(sessions.id, row.s.id));
    setSessionCookie(reply, config, token);
  }
  return { kind: "web", userId: row.s.userId, orgId: row.s.organizationId, role: row.role, sessionId: row.s.id };
}

export async function resolveDevice(db: DbOrTx, req: FastifyRequest): Promise<DeviceAuth | null> {
  const header = req.headers.authorization;
  if (!header) return null;
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header.trim());
  if (!m) return null;
  const [d] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.tokenHash, sha256Hex(m[1]!)), isNull(devices.revokedAt)));
  if (!d) return null;
  const now = Date.now();
  if (!d.lastSeenAt || now - d.lastSeenAt.getTime() > DEVICE_SEEN_AFTER_MS) {
    await db.update(devices).set({ lastSeenAt: new Date(now), lastIpPrefix: ipPrefix(req.ip) }).where(eq(devices.id, d.id));
  }
  return { kind: "device", deviceId: d.id, orgId: d.organizationId, approvedByUserId: d.approvedByUserId };
}
