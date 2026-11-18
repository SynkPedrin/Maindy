import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isTrustedPeer } from "../src/lib/ip.js";
import { createTestApp, PASSWORD, resetDb, signupVerified, testConfig, web, WEB_ORIGIN, type TestApp } from "./helpers.js";

describe("isTrustedPeer", () => {
  it("handles loopback, CIDR, lists and booleans", () => {
    expect(isTrustedPeer("127.0.0.1", "loopback")).toBe(true);
    expect(isTrustedPeer("::1", "loopback")).toBe(true);
    expect(isTrustedPeer("::ffff:127.0.0.1", "loopback")).toBe(true);
    expect(isTrustedPeer("203.0.113.5", "loopback")).toBe(false);
    expect(isTrustedPeer("10.1.2.3", ["loopback", "10.0.0.0/8"])).toBe(true);
    expect(isTrustedPeer("11.1.2.3", ["10.0.0.0/8"])).toBe(false);
    expect(isTrustedPeer("192.168.1.9", "uniquelocal")).toBe(true);
    expect(isTrustedPeer("8.8.8.8", true)).toBe(true);
    expect(isTrustedPeer("127.0.0.1", false)).toBe(false);
  });
});

describe("client IP hardening (CLIENT_IP_HEADER)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ config: testConfig({ CLIENT_IP_HEADER: "x-real-ip" }) });
  });
  afterAll(async () => t.close());
  beforeEach(async () => resetDb(t));

  const signup = (i: number, headers: Record<string, string>, remoteAddress = "127.0.0.1") =>
    t.app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      remoteAddress,
      headers,
      payload: { name: "Teste", email: `ip${i}-${Math.random().toString(36).slice(2)}@exemplo.test`, password: PASSWORD, acceptTerms: true },
    });

  it("rotating X-Forwarded-For does not bypass the per-IP limit when the edge header is authoritative", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await signup(i, { "x-forwarded-for": `198.51.100.${i}`, "x-real-ip": "203.0.113.7" })).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it("an untrusted peer cannot inject the edge header; its socket address is used", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await signup(i, { "x-real-ip": `198.51.100.${i}`, "x-forwarded-for": `192.0.2.${i}` }, "203.0.113.99")).statusCode);
    expect(codes[10]).toBe(429);
  });
});

describe("profile and report side effects", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t.close());
  beforeEach(async () => resetDb(t));

  it("PATCH /v1/me updates the name and requires CSRF", async () => {
    const a = await signupVerified(t, "perfil@exemplo.test");
    const noCsrf = await t.app.inject({ method: "PATCH", url: "/v1/me", headers: { cookie: `maindy_session=${a.cookie}`, origin: WEB_ORIGIN }, payload: { name: "Novo Nome" } });
    expect(noCsrf.statusCode).toBe(403);
    const ok = await web(t.app, a.cookie, { method: "PATCH", url: "/v1/me", payload: { name: "Novo Nome" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.name).toBe("Novo Nome");
    const bad = await web(t.app, a.cookie, { method: "PATCH", url: "/v1/me", payload: { name: "x" } });
    expect(bad.statusCode).toBe(400);
  });

  it("a JSON report preview does not complete onboarding; a CSV export does", async () => {
    const a = await signupVerified(t, "relatorio@exemplo.test");
    await web(t.app, a.cookie, { method: "GET", url: "/v1/reports/savings?format=json" });
    let ob = (await web(t.app, a.cookie, { method: "GET", url: "/v1/onboarding" })).json();
    expect(ob.completed).not.toContain("first_report");
    await web(t.app, a.cookie, { method: "GET", url: "/v1/reports/savings?format=csv" });
    ob = (await web(t.app, a.cookie, { method: "GET", url: "/v1/onboarding" })).json();
    expect(ob.completed).toContain("first_report");
  });
});
