import { PairStartResponse } from "@maindy/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { normalizeUserCode, USER_CODE_ALPHABET } from "../src/lib/crypto.js";
import { createTestApp, device, pairDevice, resetDb, signupVerified, web, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t));

const start = () =>
  t.app.inject({ method: "POST", url: "/v1/devices/pair/start", payload: { deviceName: "MacBook Pro", platform: "macos", arch: "arm64", appVersion: "0.1.0" } });

describe("device pairing (device authorization flow)", () => {
  it("start → pending → approve → token once → bearer works → revoke rejects", async () => {
    const a = await signupVerified(t, "dev@exemplo.test");
    const s = await start();
    expect(s.statusCode).toBe(200);
    const body = PairStartResponse.parse(s.json());
    expect(body.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    for (const ch of body.userCode.replace("-", "")) expect(USER_CODE_ALPHABET).toContain(ch);
    expect(body.expiresIn).toBe(600);
    expect(body.interval).toBe(3);
    expect(body.verificationUrlComplete).toBe(`http://localhost:3100/app/dispositivos/parear?code=${body.userCode}`);
    expect(body.deviceCode.length).toBeGreaterThanOrEqual(43);

    const pending = await t.app.inject({ method: "POST", url: "/v1/devices/pair/poll", payload: { deviceCode: body.deviceCode } });
    expect(pending.json()).toEqual({ status: "pending" });

    const details = await web(t.app, a.cookie, { method: "GET", url: `/v1/devices/pair/${body.userCode.toLowerCase().replace("-", "")}` });
    expect(details.statusCode).toBe(200);
    expect(details.json().deviceName).toBe("MacBook Pro");
    expect(details.json().status).toBe("pending");

    const unauth = await t.app.inject({ method: "POST", url: "/v1/devices/pair/approve", payload: { userCode: body.userCode, approve: true } });
    expect(unauth.statusCode).toBe(401);

    const approve = await web(t.app, a.cookie, { method: "POST", url: "/v1/devices/pair/approve", payload: { userCode: body.userCode, approve: true } });
    expect(approve.json()).toEqual({ status: "approved" });

    const poll = await t.app.inject({ method: "POST", url: "/v1/devices/pair/poll", payload: { deviceCode: body.deviceCode } });
    const p = poll.json();
    expect(p.status).toBe("approved");
    expect(p.organizationId).toBe(a.orgId);
    expect(p.deviceToken.length).toBeGreaterThanOrEqual(43);

    const again = await t.app.inject({ method: "POST", url: "/v1/devices/pair/poll", payload: { deviceCode: body.deviceCode } });
    expect(again.json()).toEqual({ status: "expired" });

    const me = await device(t.app, p.deviceToken, { method: "GET", url: "/v1/me" });
    expect(me.statusCode).toBe(200);
    expect(me.json().organization.id).toBe(a.orgId);
    const meObj = await web(t.app, a.cookie, { method: "GET", url: "/v1/me" });
    expect(meObj.json().onboarding.completed).toContain("device_paired");

    // device auth cannot reach web-only routes
    expect((await device(t.app, p.deviceToken, { method: "GET", url: "/v1/devices" })).statusCode).toBe(401);

    const list = await web(t.app, a.cookie, { method: "GET", url: "/v1/devices" });
    expect(list.json()).toHaveLength(1);
    const rev = await web(t.app, a.cookie, { method: "DELETE", url: `/v1/devices/${p.deviceId}` });
    expect(rev.statusCode).toBe(200);
    expect(rev.json().revoked).toBe(true);

    const after = await device(t.app, p.deviceToken, { method: "GET", url: "/v1/me" });
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe("invalid_device_token");
  });

  it("deny → poll returns denied; unknown device code → 400; garbage bearer → 401", async () => {
    const a = await signupVerified(t, "deny@exemplo.test");
    const s = (await start()).json();
    await web(t.app, a.cookie, { method: "POST", url: "/v1/devices/pair/approve", payload: { userCode: s.userCode, approve: false } });
    expect((await t.app.inject({ method: "POST", url: "/v1/devices/pair/poll", payload: { deviceCode: s.deviceCode } })).json()).toEqual({ status: "denied" });
    expect((await t.app.inject({ method: "POST", url: "/v1/devices/pair/poll", payload: { deviceCode: "nao-existe-nao-existe" } })).statusCode).toBe(400);
    expect((await device(t.app, "x".repeat(43), { method: "GET", url: "/v1/stats/summary" })).statusCode).toBe(401);
  });

  it("enforces plan device limit server-side on approve (no subscription → 1 device)", async () => {
    const a = await signupVerified(t, "limit@exemplo.test");
    await pairDevice(t, a.cookie, "Primeiro");
    const s = (await start()).json();
    const r = await web(t.app, a.cookie, { method: "POST", url: "/v1/devices/pair/approve", payload: { userCode: s.userCode, approve: true } });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("plan_limit_reached");
    expect(r.json().error.details.max).toBe(1);
  });

  it("rate limits pair/start per IP", async () => {
    for (let i = 0; i < 10; i++) expect((await start()).statusCode).toBe(200);
    expect((await start()).statusCode).toBe(429);
  });

  it("normalizes user codes", () => {
    expect(normalizeUserCode("kq7m 2xwd")).toBe("KQ7M-2XWD");
    expect(normalizeUserCode("KQ7M-2XW0")).toBeNull(); // 0 is not in the alphabet
    expect(normalizeUserCode("abc")).toBeNull();
  });
});
