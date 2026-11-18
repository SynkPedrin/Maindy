import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, device, pairDevice, resetDb, signupVerified, usageEvent, web, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t));

describe("tenant isolation", () => {
  it("org B cannot read org A stats, runs, devices, reports, quality or limits", async () => {
    const A = await signupVerified(t, "a@exemplo.test", "Org A");
    const B = await signupVerified(t, "b@exemplo.test", "Org B");
    const devA = await pairDevice(t, A.cookie, "Mac A");
    const devB = await pairDevice(t, B.cookie, "Mac B");

    const evA = usageEvent({ costMicros: 5000, baselineMicros: 9000 });
    await device(t.app, devA.token, { method: "POST", url: "/v1/telemetry/events", payload: { events: [evA] } });
    await device(t.app, devA.token, {
      method: "POST",
      url: "/v1/telemetry/quota",
      payload: [{ provider: "anthropic", product: "claude_code_subscription", window: "five_hour", usedPercentage: 42, resetsAt: null, collectedVia: "claude_code.statusline", capturedAt: new Date().toISOString() }],
    });

    // B via web
    const sumB = await web(t.app, B.cookie, { method: "GET", url: "/v1/stats/summary" });
    expect(sumB.json().requests).toBe(0);
    const runsB = await web(t.app, B.cookie, { method: "GET", url: "/v1/runs" });
    expect(runsB.json().items).toHaveLength(0);
    // device tokens may read /v1/runs (desktop app), still scoped to their own org
    expect((await device(t.app, devB.token, { method: "GET", url: "/v1/runs" })).json().items).toHaveLength(0);
    expect((await device(t.app, devA.token, { method: "GET", url: "/v1/runs" })).json().items[0].eventId).toBe(evA.eventId);
    const devsB = await web(t.app, B.cookie, { method: "GET", url: "/v1/devices" });
    expect(devsB.json().map((d: { id: string }) => d.id)).toEqual([devB.deviceId]);
    const repB = await web(t.app, B.cookie, { method: "GET", url: "/v1/reports/savings?format=csv" });
    expect(repB.body).not.toContain(evA.eventId);
    expect((await web(t.app, B.cookie, { method: "GET", url: "/v1/limits" })).json()).toHaveLength(0);

    // B via its device token
    const sumBDev = await device(t.app, devB.token, { method: "GET", url: "/v1/stats/summary" });
    expect(sumBDev.json().requests).toBe(0);

    // B cannot revoke or approve A's device / pairing
    expect((await web(t.app, B.cookie, { method: "DELETE", url: `/v1/devices/${devA.deviceId}` })).statusCode).toBe(404);
    expect((await web(t.app, B.cookie, { method: "DELETE", url: `/v1/auth/sessions/${devA.deviceId}` })).statusCode).toBe(404);

    // A sees its own data
    const sumA = await web(t.app, A.cookie, { method: "GET", url: "/v1/stats/summary" });
    expect(sumA.json().requests).toBe(1);
    expect((await web(t.app, A.cookie, { method: "GET", url: "/v1/runs" })).json().items[0].eventId).toBe(evA.eventId);
    expect((await web(t.app, A.cookie, { method: "GET", url: "/v1/limits" })).json()).toHaveLength(1);

    // replaying A's event id from B's device is a no-op duplicate and does not leak into B
    const replay = await device(t.app, devB.token, { method: "POST", url: "/v1/telemetry/events", payload: { events: [evA] } });
    expect(replay.json()).toEqual({ accepted: 0, duplicates: 1 });
    expect((await web(t.app, B.cookie, { method: "GET", url: "/v1/stats/summary" })).json().requests).toBe(0);

    // policy isolation
    await web(t.app, A.cookie, { method: "PUT", url: "/v1/orbit/policy", payload: { mode: "balanced" } });
    expect((await web(t.app, B.cookie, { method: "GET", url: "/v1/orbit/policy" })).json().mode).toBe("observe");

    // pairing approval details of a code decided by A are hidden from B
    const s = (await t.app.inject({ method: "POST", url: "/v1/devices/pair/start", payload: { deviceName: "X", platform: "windows", arch: "x64", appVersion: "0.1.0" } })).json();
    await web(t.app, A.cookie, { method: "POST", url: "/v1/devices/pair/approve", payload: { userCode: s.userCode, approve: false } });
    expect((await web(t.app, B.cookie, { method: "GET", url: `/v1/devices/pair/${s.userCode}` })).statusCode).toBe(404);
  });

  it("device tokens on quality, projects, agents, reports and connectors stay inside their own org", async () => {
    const A = await signupVerified(t, "da@exemplo.test", "Org A");
    const B = await signupVerified(t, "db@exemplo.test", "Org B");
    const devA = await pairDevice(t, A.cookie, "Mac A");
    const devB = await pairDevice(t, B.cookie, "Mac B");
    const asA = (o: Parameters<typeof device>[2]) => device(t.app, devA.token, o);
    const asB = (o: Parameters<typeof device>[2]) => device(t.app, devB.token, o);

    // quality evaluations
    const q = { evaluationId: randomUUID(), occurredAt: new Date().toISOString(), technique: "context_dedup", method: "exact_match", passed: true, score: 1, projectKey: null, detail: null, triggeredRollback: false };
    expect((await asA({ method: "POST", url: "/v1/telemetry/quality", payload: [q] })).statusCode).toBe(200);
    const qa = await asA({ method: "GET", url: "/v1/quality/evaluations" });
    expect(qa.statusCode).toBe(200);
    expect(qa.json().map((e: { evaluationId: string }) => e.evaluationId)).toEqual([q.evaluationId]);
    expect((await asB({ method: "GET", url: "/v1/quality/evaluations" })).json()).toHaveLength(0);

    // projects: device can create/read/update/delete its own; B can't see or touch A's
    const p = await asA({ method: "POST", url: "/v1/projects", payload: { key: "api-core", name: "API Core" } });
    expect(p.statusCode).toBe(201);
    const pid = p.json().id as string;
    expect((await asA({ method: "GET", url: "/v1/projects" })).json().map((x: { id: string }) => x.id)).toEqual([pid]);
    expect((await asB({ method: "GET", url: "/v1/projects" })).json()).toHaveLength(0);
    expect((await asB({ method: "PATCH", url: `/v1/projects/${pid}`, payload: { name: "hack" } })).statusCode).toBe(404);
    expect((await asB({ method: "DELETE", url: `/v1/projects/${pid}` })).statusCode).toBe(404);
    expect((await asA({ method: "PATCH", url: `/v1/projects/${pid}`, payload: { name: "API" } })).json().name).toBe("API");

    // agents: B can't attach its agent to A's project, nor touch A's agent
    expect((await asB({ method: "POST", url: "/v1/agents", payload: { key: "bot", name: "Bot", projectId: pid } })).statusCode).toBe(404);
    const ag = await asA({ method: "POST", url: "/v1/agents", payload: { key: "bot", name: "Bot", projectId: pid } });
    expect(ag.statusCode).toBe(201);
    const aid = ag.json().id as string;
    expect((await asB({ method: "GET", url: "/v1/agents" })).json()).toHaveLength(0);
    expect((await asB({ method: "PATCH", url: `/v1/agents/${aid}`, payload: { name: "x" } })).statusCode).toBe(404);
    expect((await asB({ method: "DELETE", url: `/v1/agents/${aid}` })).statusCode).toBe(404);
    expect((await asA({ method: "DELETE", url: `/v1/agents/${aid}` })).statusCode).toBe(200);
    expect((await asA({ method: "DELETE", url: `/v1/projects/${pid}` })).statusCode).toBe(200);

    // reports in all formats
    const ev = usageEvent({ costMicros: 5000, baselineMicros: 9000 });
    await asA({ method: "POST", url: "/v1/telemetry/events", payload: { events: [ev] } });
    const jsonA = await asA({ method: "GET", url: "/v1/reports/savings?format=json" });
    expect(jsonA.statusCode).toBe(200);
    expect(jsonA.body).toContain(ev.eventId);
    expect((await asA({ method: "GET", url: "/v1/reports/savings?format=csv" })).body).toContain(ev.eventId);
    expect((await asB({ method: "GET", url: "/v1/reports/savings?format=json" })).body).not.toContain(ev.eventId);
    expect((await asB({ method: "GET", url: "/v1/reports/savings?format=csv" })).body).not.toContain(ev.eventId);
    const pdfB = await asB({ method: "GET", url: "/v1/reports/savings?format=pdf" });
    expect(pdfB.statusCode).toBe(200);
    expect(pdfB.headers["content-type"]).toBe("application/pdf");

    // connectors PUT via device only affects its own org
    const put = await asB({ method: "PUT", url: "/v1/connectors/anthropic_api", payload: { status: "connected_read_only", credentialRef: "keychain:maindy/anthropic" } });
    expect(put.statusCode).toBe(200);
    const listA = (await asA({ method: "GET", url: "/v1/connectors" })).json() as { kind: string; status: string; credentialRef: string | null }[];
    expect(listA.find((c) => c.kind === "anthropic_api")).toMatchObject({ status: "not_connected", credentialRef: null });
    const listB = (await asB({ method: "GET", url: "/v1/connectors" })).json() as { kind: string; status: string; credentialRef: string | null }[];
    expect(listB.find((c) => c.kind === "anthropic_api")).toMatchObject({ status: "connected_read_only", credentialRef: "keychain:maindy/anthropic" });

    // a revoked/unknown token is rejected on the same routes
    for (const url of ["/v1/quality/evaluations", "/v1/projects", "/v1/agents", "/v1/reports/savings"]) {
      expect((await device(t.app, "not-a-real-token", { method: "GET", url })).statusCode).toBe(401);
    }
  });
});
