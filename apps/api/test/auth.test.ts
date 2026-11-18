import { randomBytes } from "node:crypto";
import { MeDto } from "@maindy/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, onboardingProgress, optimizationPolicies, users } from "../src/db/schema.js";
import { SmtpMailer } from "../src/mail/mailer.js";
import { createTestApp, PASSWORD, resetDb, sessionCookie, signupVerified, testConfig, tokenFromMail, web, WEB_ORIGIN, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t);
  t.mailer.messages = [];
});

const signup = (email: string, extra: Record<string, unknown> = {}) =>
  t.app.inject({ method: "POST", url: "/v1/auth/signup", payload: { name: "Ana Teste", email, password: PASSWORD, acceptTerms: true, ...extra } });

describe("signup → verify → login → me", () => {
  it("creates org, owner membership, onboarding, observe policy; e-mail in pt-BR; verify creates session", async () => {
    const res = await signup("Ana@Exemplo.test", { planCode: "pro" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.needsVerification).toBe(true);
    expect(body.user.email).toBe("ana@exemplo.test");
    expect(body.user.emailVerified).toBe(false);
    expect(sessionCookie(res)).toBeUndefined();

    const mail = t.mailer.lastTo("ana@exemplo.test")!;
    expect(mail.subject).toContain("Confirme seu e-mail");
    expect(mail.text).toContain("http://localhost:3100/verificar-email?token=");
    expect(mail.html).toContain("maindy.");

    const [policy] = await t.db.db.select().from(optimizationPolicies);
    expect(policy!.mode).toBe("observe");
    const [ob] = await t.db.db.select().from(onboardingProgress);
    expect(ob!.completed).toEqual(["plan_selected"]);

    const verify = await t.app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token: tokenFromMail(mail.text) } });
    expect(verify.statusCode).toBe(200);
    const me = MeDto.parse(verify.json());
    expect(me.role).toBe("owner");
    expect(me.user.emailVerified).toBe(true);
    const cookie = verify.cookies.find((c) => c.name === "maindy_session")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.path).toBe("/");
    expect(cookie.secure).toBeFalsy(); // NODE_ENV=test → not production

    // token is single-use
    const again = await t.app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token: tokenFromMail(mail.text) } });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe("invalid_token");

    const login = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "ana@exemplo.test", password: PASSWORD } });
    expect(login.statusCode).toBe(200);
    const meRes = await t.app.inject({ method: "GET", url: "/v1/me", cookies: { maindy_session: sessionCookie(login)! } });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().organization.id).toBe(me.organization.id);
  });

  it("rejects duplicate e-mail and invalid body with pt-BR validation_error", async () => {
    await signup("dup@exemplo.test");
    const dup = await signup("dup@exemplo.test");
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("email_taken");

    const bad = await t.app.inject({ method: "POST", url: "/v1/auth/signup", payload: { name: "A", email: "x", password: "123", acceptTerms: false } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("validation_error");
    expect(bad.json().error.message).toMatch(/Dados inválidos/);
  });

  it("login: unverified → 403 email_not_verified; wrong password and unknown e-mail → same 401", async () => {
    await signup("nv@exemplo.test");
    const unverified = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "nv@exemplo.test", password: PASSWORD } });
    expect(unverified.statusCode).toBe(403);
    expect(unverified.json().error.code).toBe("email_not_verified");

    const wrong = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "nv@exemplo.test", password: "errada-errada" } });
    const unknown = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "ninguem@exemplo.test", password: "errada-errada" } });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it("rate limits login per IP (10/15min) and per e-mail", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: `x${i}@exemplo.test`, password: "errada-errada" } });
      expect(r.statusCode).toBe(401);
    }
    const blocked = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "y@exemplo.test", password: "errada-errada" } });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("rate_limited");
    expect(blocked.headers["retry-after"]).toBeDefined();

    t.app.deps.limiter.reset();
    for (let i = 0; i < 10; i++) {
      await t.app.inject({ method: "POST", url: "/v1/auth/login", remoteAddress: `10.0.${i}.1`, payload: { email: "alvo@exemplo.test", password: "errada-errada" } });
    }
    const perEmail = await t.app.inject({ method: "POST", url: "/v1/auth/login", remoteAddress: "10.9.9.9", payload: { email: "alvo@exemplo.test", password: "x" } });
    expect(perEmail.statusCode).toBe(429);
  });

  it("resend-verification and forgot-password always 202 (no enumeration)", async () => {
    for (const url of ["/v1/auth/resend-verification", "/v1/auth/forgot-password"]) {
      const r = await t.app.inject({ method: "POST", url, payload: { email: "inexistente@exemplo.test" } });
      expect(r.statusCode).toBe(202);
    }
    expect(t.mailer.messages).toHaveLength(0);
  });
});

describe("sessions, CSRF, password reset", () => {
  it("lists and revokes sessions; revoked cookie is rejected", async () => {
    const a = await signupVerified(t, "s@exemplo.test");
    const login2 = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "s@exemplo.test", password: PASSWORD }, headers: { "user-agent": "Firefox" } });
    const cookie2 = sessionCookie(login2)!;

    const list = await web(t.app, a.cookie, { method: "GET", url: "/v1/auth/sessions" });
    expect(list.statusCode).toBe(200);
    const sessions = list.json() as { id: string; current: boolean; kind: string; userAgent: string | null }[];
    expect(sessions.filter((s) => s.kind === "web")).toHaveLength(2);
    const other = sessions.find((s) => !s.current)!;
    expect(other.userAgent).toBe("Firefox");

    const del = await web(t.app, a.cookie, { method: "DELETE", url: `/v1/auth/sessions/${other.id}` });
    expect(del.statusCode).toBe(200);
    const me2 = await t.app.inject({ method: "GET", url: "/v1/me", cookies: { maindy_session: cookie2 } });
    expect(me2.statusCode).toBe(401);

    const logout = await web(t.app, a.cookie, { method: "POST", url: "/v1/auth/logout" });
    expect(logout.statusCode).toBe(200);
    const me1 = await t.app.inject({ method: "GET", url: "/v1/me", cookies: { maindy_session: a.cookie } });
    expect(me1.statusCode).toBe(401);

    const actions = (await t.db.db.select().from(auditEvents).where(eq(auditEvents.organizationId, a.orgId))).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["auth.signup", "auth.email_verified", "auth.login", "auth.session_revoked", "auth.logout"]));
  });

  it("revoke-others keeps only the current session", async () => {
    const a = await signupVerified(t, "ro@exemplo.test");
    const l2 = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "ro@exemplo.test", password: PASSWORD } });
    const r = await web(t.app, a.cookie, { method: "POST", url: "/v1/auth/sessions/revoke-others" });
    expect(r.json().revoked).toBe(1);
    expect((await t.app.inject({ method: "GET", url: "/v1/me", cookies: { maindy_session: sessionCookie(l2)! } })).statusCode).toBe(401);
    expect((await t.app.inject({ method: "GET", url: "/v1/me", cookies: { maindy_session: a.cookie } })).statusCode).toBe(200);
  });

  it("CSRF: cookie-authenticated mutation needs x-maindy-csrf and an allowed Origin", async () => {
    const a = await signupVerified(t, "csrf@exemplo.test");
    const noHeader = await t.app.inject({ method: "POST", url: "/v1/orbit/pause", cookies: { maindy_session: a.cookie } });
    expect(noHeader.statusCode).toBe(403);
    expect(noHeader.json().error.code).toBe("csrf_failed");

    const badOrigin = await t.app.inject({
      method: "POST",
      url: "/v1/orbit/pause",
      cookies: { maindy_session: a.cookie },
      headers: { "x-maindy-csrf": "1", origin: "https://evil.example" },
    });
    expect(badOrigin.statusCode).toBe(403);

    const noOrigin = await t.app.inject({ method: "POST", url: "/v1/orbit/pause", cookies: { maindy_session: a.cookie }, headers: { "x-maindy-csrf": "1" } });
    expect(noOrigin.statusCode).toBe(200);
    const ok = await t.app.inject({ method: "POST", url: "/v1/orbit/resume", cookies: { maindy_session: a.cookie }, headers: { "x-maindy-csrf": "1", origin: WEB_ORIGIN } });
    expect(ok.statusCode).toBe(200);

    // GET does not need CSRF
    expect((await t.app.inject({ method: "GET", url: "/v1/orbit/policy", cookies: { maindy_session: a.cookie } })).statusCode).toBe(200);
  });

  it("password reset: single-use token, revokes all sessions, new password works", async () => {
    const a = await signupVerified(t, "reset@exemplo.test");
    const f = await t.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "reset@exemplo.test" } });
    expect(f.statusCode).toBe(202);
    const mail = t.mailer.lastTo("reset@exemplo.test")!;
    expect(mail.text).toContain("http://localhost:3100/redefinir-senha?token=");
    const token = tokenFromMail(mail.text);
    const r = await t.app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token, password: "nova-senha-456" } });
    expect(r.statusCode).toBe(200);
    expect((await t.app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token, password: "outra-senha-789" } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: "GET", url: "/v1/me", cookies: { maindy_session: a.cookie } })).statusCode).toBe(401);
    expect((await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "reset@exemplo.test", password: PASSWORD } })).statusCode).toBe(401);
    expect((await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "reset@exemplo.test", password: "nova-senha-456" } })).statusCode).toBe(200);
  });

  it("password is stored as argon2id", async () => {
    await signupVerified(t, "hash@exemplo.test");
    const [u] = await t.db.db.select().from(users).where(eq(users.email, "hash@exemplo.test"));
    expect(u!.passwordHash.startsWith("$argon2id$")).toBe(true);
  });
});

describe("real SMTP → Mailpit", () => {
  it("delivers the verification e-mail to Mailpit and the link verifies the account", async () => {
    const mailpit = "http://127.0.0.1:8025";
    const reachable = await fetch(`${mailpit}/api/v1/messages?limit=1`).then((r) => r.ok).catch(() => false);
    if (!reachable) {
      console.warn("Mailpit not reachable — skipping SMTP e2e");
      return;
    }
    const cfg = testConfig();
    const smtp = await createTestApp({ mailer: new SmtpMailer(cfg.SMTP_URL, cfg.MAIL_FROM) });
    try {
      const email = `teste-${randomBytes(6).toString("hex")}@exemplo.test`;
      const res = await smtp.app.inject({ method: "POST", url: "/v1/auth/signup", payload: { name: "Mailpit Teste", email, password: PASSWORD, acceptTerms: true } });
      expect(res.statusCode).toBe(201);
      let id: string | undefined;
      for (let i = 0; i < 20 && !id; i++) {
        const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
        id = search.messages[0]?.ID;
        if (!id) await new Promise((r) => setTimeout(r, 150));
      }
      expect(id).toBeDefined();
      const msg = (await fetch(`${mailpit}/api/v1/message/${id}`).then((r) => r.json())) as { Subject: string; Text: string; HTML: string };
      expect(msg.Subject).toBe("Confirme seu e-mail — maindy.");
      const verify = await smtp.app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token: tokenFromMail(msg.Text) } });
      expect(verify.statusCode).toBe(200);
      await fetch(`${mailpit}/api/v1/messages`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ IDs: [id] }) });
    } finally {
      await smtp.close();
    }
  });
});
