import {
  EmailOnlyRequest,
  LoginRequest,
  MeDto,
  ResetPasswordRequest,
  SessionDto,
  SignupRequest,
  UserDto,
  VerifyEmailRequest,
  type Role,
} from "@maindy/contracts";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { devices, memberships, onboardingProgress, organizations, sessions, users } from "../db/schema.js";
import { hmacHex, randomToken } from "../lib/crypto.js";
import { ApiHttpError, badRequest, conflict, notFound, unauthorized } from "../lib/errors.js";
import { ipPrefix } from "../lib/ip.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { LIMITS } from "../lib/rate-limiter.js";
import { passwordResetEmail, verificationEmail } from "../mail/templates.js";
import { anyAuth, webAuth } from "../plugins/auth.js";
import { audit } from "../services/audit.js";
import { consumeEmailToken, issueEmailToken } from "../services/email-tokens.js";
import { createDefaultPolicy } from "../services/policy.js";
import { buildMe, primaryMembership, toUserDto } from "../services/me.js";
import { clearSessionCookie, createSession, setSessionCookie } from "../services/sessions.js";

export const SignupResponse = z.object({ user: UserDto, needsVerification: z.literal(true) });
const Accepted = z.object({ ok: z.literal(true) });

const emailKey = (deps: AppDeps, email: string) => hmacHex(deps.config.SESSION_SECRET, email.toLowerCase());

export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 6)}`;
}

const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && ((err as { code?: string }).code === "23505" || (err as { cause?: { code?: string } }).cause?.code === "23505");

async function sendSafely(req: FastifyRequest, deps: AppDeps, msg: Parameters<AppDeps["mailer"]["send"]>[0], kind: string) {
  try {
    await deps.mailer.send(msg);
  } catch (err) {
    req.log.error({ kind, err: err instanceof Error ? err.message : String(err) }, "email delivery failed");
  }
}

function verifyUrl(deps: AppDeps, token: string) {
  const u = new URL("/verificar-email", deps.config.WEB_PUBLIC_URL);
  u.searchParams.set("token", token);
  return u.toString();
}
function resetUrl(deps: AppDeps, token: string) {
  const u = new URL("/redefinir-senha", deps.config.WEB_PUBLIC_URL);
  u.searchParams.set("token", token);
  return u.toString();
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const deps = app.deps;
  const { db, limiter } = deps;

  app.post(
    "/auth/signup",
    { schema: { tags: ["auth"], body: SignupRequest, response: { 201: SignupResponse } } },
    async (req, reply) => {
      limiter.hit(`signup:ip:${req.ip}`, LIMITS.signupPerIp.max, LIMITS.signupPerIp.windowMs);
      limiter.hit("signup:global", LIMITS.signupGlobal.max, LIMITS.signupGlobal.windowMs);
      const body = req.body;
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
      if (existing) throw conflict("email_taken", "Este e-mail já está cadastrado. Faça login ou recupere sua senha.");

      const passwordHash = await hashPassword(body.password);
      let created: { user: typeof users.$inferSelect; orgId: string };
      try {
        created = await db.transaction(async (tx) => {
          const [user] = await tx
            .insert(users)
            .values({
              email: body.email,
              name: body.name,
              passwordHash,
              termsAcceptedAt: new Date(),
              marketingOptIn: body.marketingOptIn,
            })
            .returning();
          const [org] = await tx.insert(organizations).values({ name: body.name, slug: slugify(body.name) }).returning();
          await tx.insert(memberships).values({ organizationId: org!.id, userId: user!.id, role: "owner" });
          await tx.insert(onboardingProgress).values({ organizationId: org!.id, completed: body.planCode ? ["plan_selected"] : [] });
          await createDefaultPolicy(tx, org!.id);
          await audit(tx, {
            orgId: org!.id,
            actor: { kind: "system" },
            action: "auth.signup",
            targetType: "user",
            targetId: user!.id,
            metadata: body.planCode ? { planSelected: body.planCode } : {},
            ipPrefix: ipPrefix(req.ip),
          });
          return { user: user!, orgId: org!.id };
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict("email_taken", "Este e-mail já está cadastrado. Faça login ou recupere sua senha.");
        throw err;
      }

      const token = await issueEmailToken(db, created.user.id, "verify_email");
      await sendSafely(req, deps, verificationEmail(created.user.email, created.user.name, verifyUrl(deps, token)), "verify_email");
      return reply.status(201).send({ user: toUserDto(created.user), needsVerification: true as const });
    },
  );

  app.post(
    "/auth/verify-email",
    { schema: { tags: ["auth"], body: VerifyEmailRequest, response: { 200: MeDto } } },
    async (req, reply) => {
      limiter.hit(`verify:ip:${req.ip}`, LIMITS.verifyPerIp.max, LIMITS.verifyPerIp.windowMs);
      const result = await db.transaction(async (tx) => {
        const userId = await consumeEmailToken(tx, req.body.token, "verify_email");
        if (!userId) return null;
        await tx.update(users).set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, updatedAt: new Date() }).where(eq(users.id, userId));
        const m = await primaryMembership(tx, userId);
        if (!m) return null;
        const s = await createSession(tx, { userId, orgId: m.orgId, userAgent: req.headers["user-agent"], ip: req.ip });
        await audit(tx, { orgId: m.orgId, actor: { kind: "system" }, action: "auth.email_verified", targetType: "user", targetId: userId, ipPrefix: ipPrefix(req.ip) });
        return { userId, orgId: m.orgId, role: m.role as Role, token: s.token };
      });
      if (!result) throw badRequest("invalid_token", "Link inválido ou expirado. Peça um novo e-mail de verificação.");
      setSessionCookie(reply, deps.config, result.token);
      const me = await buildMe(db, result.userId, result.orgId, result.role);
      if (!me) throw unauthorized();
      return me;
    },
  );

  app.post(
    "/auth/resend-verification",
    { schema: { tags: ["auth"], body: EmailOnlyRequest, response: { 202: Accepted } } },
    async (req, reply) => {
      limiter.hit(`resend:ip:${req.ip}`, LIMITS.resendPerIp.max, LIMITS.resendPerIp.windowMs);
      limiter.hit("mail:global", LIMITS.mailGlobal.max, LIMITS.mailGlobal.windowMs);
      limiter.hit(`resend:email:${emailKey(deps, req.body.email)}`, LIMITS.resendPerEmail.max, LIMITS.resendPerEmail.windowMs);
      const [user] = await db.select().from(users).where(eq(users.email, req.body.email));
      if (user && !user.emailVerifiedAt) {
        const token = await issueEmailToken(db, user.id, "verify_email");
        await sendSafely(req, deps, verificationEmail(user.email, user.name, verifyUrl(deps, token)), "verify_email");
      }
      return reply.status(202).send({ ok: true as const });
    },
  );

  app.post(
    "/auth/login",
    { schema: { tags: ["auth"], body: LoginRequest, response: { 200: MeDto } } },
    async (req, reply) => {
      limiter.hit(`login:ip:${req.ip}`, LIMITS.loginPerIp.max, LIMITS.loginPerIp.windowMs);
      limiter.hit(`login:email:${emailKey(deps, req.body.email)}`, LIMITS.loginPerEmail.max, LIMITS.loginPerEmail.windowMs);
      const [user] = await db.select().from(users).where(eq(users.email, req.body.email));
      const ok = await verifyPassword(user?.passwordHash ?? null, req.body.password);
      if (!user || !ok) throw new ApiHttpError(401, "invalid_credentials", "E-mail ou senha incorretos.");
      if (!user.emailVerifiedAt) {
        throw new ApiHttpError(403, "email_not_verified", "Confirme seu e-mail para entrar. Enviamos um link de verificação para sua caixa de entrada.");
      }
      const m = await primaryMembership(db, user.id);
      if (!m) throw new ApiHttpError(403, "no_organization", "Sua conta não pertence a nenhuma organização.");
      const s = await createSession(db, { userId: user.id, orgId: m.orgId, userAgent: req.headers["user-agent"], ip: req.ip });
      await audit(db, { orgId: m.orgId, actor: { kind: "web", userId: user.id, orgId: m.orgId, role: m.role, sessionId: s.sessionId }, action: "auth.login", targetType: "session", targetId: s.sessionId, ipPrefix: ipPrefix(req.ip) });
      setSessionCookie(reply, deps.config, s.token);
      const me = await buildMe(db, user.id, m.orgId, m.role);
      if (!me) throw unauthorized();
      return me;
    },
  );

  app.post(
    "/auth/logout",
    { config: { auth: "web" }, schema: { tags: ["auth"], response: { 200: Accepted } } },
    async (req, reply) => {
      const a = webAuth(req);
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, a.sessionId), isNull(sessions.revokedAt)));
      await audit(db, { orgId: a.orgId, actor: a, action: "auth.logout", targetType: "session", targetId: a.sessionId, ipPrefix: ipPrefix(req.ip) });
      clearSessionCookie(reply, deps.config);
      return { ok: true as const };
    },
  );

  app.post(
    "/auth/forgot-password",
    { schema: { tags: ["auth"], body: EmailOnlyRequest, response: { 202: Accepted } } },
    async (req, reply) => {
      limiter.hit(`forgot:ip:${req.ip}`, LIMITS.forgotPerIp.max, LIMITS.forgotPerIp.windowMs);
      limiter.hit("mail:global", LIMITS.mailGlobal.max, LIMITS.mailGlobal.windowMs);
      limiter.hit(`forgot:email:${emailKey(deps, req.body.email)}`, LIMITS.forgotPerEmail.max, LIMITS.forgotPerEmail.windowMs);
      const [user] = await db.select().from(users).where(eq(users.email, req.body.email));
      if (user) {
        const token = await issueEmailToken(db, user.id, "reset_password");
        await sendSafely(req, deps, passwordResetEmail(user.email, user.name, resetUrl(deps, token)), "reset_password");
      }
      return reply.status(202).send({ ok: true as const });
    },
  );

  app.post(
    "/auth/reset-password",
    { schema: { tags: ["auth"], body: ResetPasswordRequest, response: { 200: Accepted } } },
    async (req) => {
      limiter.hit(`reset:ip:${req.ip}`, LIMITS.resetPerIp.max, LIMITS.resetPerIp.windowMs);
      const passwordHash = await hashPassword(req.body.password);
      const ok = await db.transaction(async (tx) => {
        const userId = await consumeEmailToken(tx, req.body.token, "reset_password");
        if (!userId) return false;
        const now = new Date();
        // the reset link proves ownership of the e-mail address
        await tx
          .update(users)
          .set({ passwordHash, passwordChangedAt: now, updatedAt: now, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
          .where(eq(users.id, userId));
        await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
        const m = await primaryMembership(tx, userId);
        if (m) await audit(tx, { orgId: m.orgId, actor: { kind: "system" }, action: "auth.password_reset", targetType: "user", targetId: userId, ipPrefix: ipPrefix(req.ip) });
        return true;
      });
      if (!ok) throw badRequest("invalid_token", "Link inválido ou expirado. Peça uma nova redefinição de senha.");
      return { ok: true as const };
    },
  );

  app.patch(
    "/me",
    {
      config: { auth: "web" },
      schema: { tags: ["auth"], body: z.object({ name: z.string().trim().min(2).max(120) }), response: { 200: MeDto } },
    },
    async (req) => {
      const a = webAuth(req);
      await db.update(users).set({ name: req.body.name, updatedAt: new Date() }).where(eq(users.id, a.userId));
      await audit(db, { orgId: a.orgId, actor: a, action: "account.profile_updated", targetType: "user", targetId: a.userId, ipPrefix: ipPrefix(req.ip) });
      const me = await buildMe(db, a.userId, a.orgId, a.role);
      if (!me) throw unauthorized();
      return me;
    },
  );

  app.get("/me", { config: { auth: "any" }, schema: { tags: ["auth"], response: { 200: MeDto } } }, async (req) => {
    const a = anyAuth(req);
    if (a.kind === "web") {
      const me = await buildMe(db, a.userId, a.orgId, a.role);
      if (!me) throw unauthorized();
      return me;
    }
    // device: render for the approving user, falling back to the org owner
    let userId = a.approvedByUserId;
    let role: Role = "member";
    const [m] = userId
      ? await db.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.organizationId, a.orgId)))
      : [];
    if (m) role = m.role;
    else {
      const [owner] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.organizationId, a.orgId), eq(memberships.role, "owner")))
        .orderBy(asc(memberships.createdAt))
        .limit(1);
      if (!owner) throw unauthorized();
      userId = owner.userId;
      role = owner.role;
    }
    const me = await buildMe(db, userId!, a.orgId, role);
    if (!me) throw unauthorized();
    return me;
  });

  app.get(
    "/auth/sessions",
    { config: { auth: "web" }, schema: { tags: ["auth"], response: { 200: z.array(SessionDto) } } },
    async (req) => {
      const a = webAuth(req);
      const web = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, a.userId), eq(sessions.organizationId, a.orgId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
        .orderBy(desc(sessions.lastSeenAt));
      const devs = await db
        .select()
        .from(devices)
        .where(and(eq(devices.organizationId, a.orgId), isNull(devices.revokedAt)))
        .orderBy(desc(devices.createdAt));
      return [
        ...web.map((s) => ({
          id: s.id,
          current: s.id === a.sessionId,
          kind: "web" as const,
          userAgent: s.userAgent,
          ipPrefix: s.ipPrefix,
          createdAt: s.createdAt.toISOString(),
          lastSeenAt: s.lastSeenAt.toISOString(),
        })),
        ...devs.map((d) => ({
          id: d.id,
          current: false,
          kind: "device" as const,
          userAgent: `maindy. desktop ${d.appVersion} — ${d.name} (${d.platform}/${d.arch})`,
          ipPrefix: d.lastIpPrefix,
          createdAt: d.createdAt.toISOString(),
          lastSeenAt: (d.lastSeenAt ?? d.createdAt).toISOString(),
        })),
      ];
    },
  );

  app.delete(
    "/auth/sessions/:id",
    { config: { auth: "web" }, schema: { tags: ["auth"], params: z.object({ id: z.string().uuid() }), response: { 200: Accepted } } },
    async (req) => {
      const a = webAuth(req);
      const id = req.params.id;
      const revoked = await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.id, id), eq(sessions.userId, a.userId), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      if (revoked.length) {
        await audit(db, { orgId: a.orgId, actor: a, action: "auth.session_revoked", targetType: "session", targetId: id, ipPrefix: ipPrefix(req.ip) });
        return { ok: true as const };
      }
      const [dev] = await db.select().from(devices).where(and(eq(devices.id, id), eq(devices.organizationId, a.orgId), isNull(devices.revokedAt)));
      if (!dev) throw notFound("Sessão não encontrada.");
      if (!(a.role === "owner" || a.role === "admin" || dev.approvedByUserId === a.userId)) {
        throw new ApiHttpError(403, "forbidden", "Somente quem aprovou o dispositivo ou um administrador pode revogá-lo.");
      }
      await db.update(devices).set({ revokedAt: new Date() }).where(eq(devices.id, dev.id));
      await audit(db, { orgId: a.orgId, actor: a, action: "device.revoked", targetType: "device", targetId: dev.id, ipPrefix: ipPrefix(req.ip) });
      return { ok: true as const };
    },
  );

  app.post(
    "/auth/sessions/revoke-others",
    { config: { auth: "web" }, schema: { tags: ["auth"], response: { 200: z.object({ revoked: z.number().int() }) } } },
    async (req) => {
      const a = webAuth(req);
      const rows = await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, a.userId), ne(sessions.id, a.sessionId), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      await audit(db, { orgId: a.orgId, actor: a, action: "auth.sessions_revoked_others", metadata: { count: rows.length }, ipPrefix: ipPrefix(req.ip) });
      return { revoked: rows.length };
    },
  );
};
