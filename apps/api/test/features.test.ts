import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { MODE_DEFAULT_TECHNIQUES } from "@maindy/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { organizations, users } from "../src/db/schema.js";
import { csvField } from "../src/reports/savings-report.js";
import { createTestApp, device, pairDevice, PASSWORD, resetDb, signupVerified, testConfig, usageEvent, web, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t));

describe("reports", () => {
  it("CSV (RFC 4180) contains every event id + audit columns; PDF and JSON are generated", async () => {
    const a = await signupVerified(t, "rep@exemplo.test");
    const d = await pairDevice(t, a.cookie);
    const events = [
      usageEvent({ costMicros: 1000, baselineMicros: 5000, baselineMethod: "cache_replay", model: 'modelo,"estranho"' }),
      usageEvent({ costMicros: 2000 }),
    ];
    await device(t.app, d.token, { method: "POST", url: "/v1/telemetry/events", payload: { events } });

    const csv = await web(t.app, a.cookie, { method: "GET", url: "/v1/reports/savings?format=csv" });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.headers["content-disposition"]).toMatch(/attachment; filename="maindy-economia-.*\.csv"/);
    const lines = csv.body.trimEnd().split("\r\n");
    expect(lines[0]).toContain("event_id");
    expect(lines[0]).toContain("pricing_version");
    expect(lines[0]).toContain("baseline_method");
    expect(lines[0]).toContain("method_version");
    expect(lines).toHaveLength(3);
    for (const e of events) expect(csv.body).toContain(e.eventId);
    expect(csv.body).toContain('"modelo,""estranho"""');
    expect(csv.body).toContain("orbit-savings-v1");

    const json = (await web(t.app, a.cookie, { method: "GET", url: "/v1/reports/savings?format=json" })).json();
    expect(json.methodVersion).toBe("orbit-savings-v1");
    expect(json.organization.id).toBe(a.orgId);
    expect(json.events).toHaveLength(2);
    expect(json.estimatesNotice).toMatch(/ESTIMATIVAS/);
    expect(json.summary.netSavings.micros).toBe(4000);
    const withBaseline = json.events.find((e: { eventId: string }) => e.eventId === events[0]!.eventId);
    expect(withBaseline).toMatchObject({ validBaseline: true, netSavingsMicros: 4000, baselineMethod: "cache_replay", pricingVersion: "2026-11-18" });

    const pdf = await web(t.app, a.cookie, { method: "GET", url: "/v1/reports/savings?format=pdf" });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");

    const me = (await web(t.app, a.cookie, { method: "GET", url: "/v1/me" })).json();
    expect(me.onboarding.completed).toContain("first_report");
  });

  it("csvField quotes per RFC 4180", () => {
    expect(csvField("a")).toBe("a");
    expect(csvField('a"b')).toBe('"a""b"');
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField(null)).toBe("");
    expect(csvField(["x", "y"])).toBe("x|y");
  });
});

describe("ORBIT policy", () => {
  it("GET default, PUT increments version, mode defaults, observe guard, conflicts, rollback, pause, audit", async () => {
    const a = await signupVerified(t, "orbit@exemplo.test");
    const p0 = (await web(t.app, a.cookie, { method: "GET", url: "/v1/orbit/policy" })).json();
    expect(p0).toMatchObject({ mode: "observe", paused: false, version: 1 });
    expect(p0.techniques).toHaveLength(9);
    expect(p0.techniques.every((x: { enabled: boolean }) => !x.enabled)).toBe(true);

    const p1 = (await web(t.app, a.cookie, { method: "PUT", url: "/v1/orbit/policy", payload: { mode: "balanced", expectedVersion: 1 } })).json();
    expect(p1.version).toBe(2);
    expect(p1.techniques.filter((x: { enabled: boolean }) => x.enabled).map((x: { name: string }) => x.name).sort()).toEqual([...MODE_DEFAULT_TECHNIQUES.balanced].sort());

    const conflict = await web(t.app, a.cookie, { method: "PUT", url: "/v1/orbit/policy", payload: { cacheTtlSeconds: 10, expectedVersion: 1 } });
    expect(conflict.statusCode).toBe(409);

    const observeBad = await web(t.app, a.cookie, { method: "PUT", url: "/v1/orbit/policy", payload: { mode: "observe", techniques: [{ name: "model_routing", enabled: true }] } });
    expect(observeBad.statusCode).toBe(422);

    const rb = (await web(t.app, a.cookie, { method: "POST", url: "/v1/orbit/rollback", payload: { technique: "exact_cache", reason: "respostas divergentes" } })).json();
    expect(rb.version).toBe(3);
    expect(rb.techniques.find((x: { name: string }) => x.name === "exact_cache")).toMatchObject({ enabled: false, rolledBack: true, rolledBackReason: "respostas divergentes" });

    // mode change keeps the rollback; explicit re-enable clears it
    const p4 = (await web(t.app, a.cookie, { method: "PUT", url: "/v1/orbit/policy", payload: { mode: "maximum" } })).json();
    expect(p4.techniques.find((x: { name: string }) => x.name === "exact_cache")).toMatchObject({ enabled: false, rolledBack: true });
    const p5 = (await web(t.app, a.cookie, { method: "PUT", url: "/v1/orbit/policy", payload: { techniques: [{ name: "exact_cache", enabled: true }] } })).json();
    expect(p5.techniques.find((x: { name: string }) => x.name === "exact_cache")).toMatchObject({ enabled: true, rolledBack: false });

    // GET → modify → PUT round trip (what UIs do): echoing the stale technique list must neither
    // cancel the new mode's defaults nor clear a rollback.
    await web(t.app, a.cookie, { method: "POST", url: "/v1/orbit/rollback", payload: { technique: "loop_guard", reason: "teste" } });
    const cur = (await web(t.app, a.cookie, { method: "PUT", url: "/v1/orbit/policy", payload: { mode: "observe", techniques: p5.techniques.map((x: { name: string }) => ({ name: x.name, enabled: false })) } })).json();
    expect(cur.techniques.every((x: { enabled: boolean }) => !x.enabled)).toBe(true);
    const echoed = (await web(t.app, a.cookie, { method: "PUT", url: "/v1/orbit/policy", payload: { ...cur, mode: "conservative" } })).json();
    const enabledNow = echoed.techniques.filter((x: { enabled: boolean }) => x.enabled).map((x: { name: string }) => x.name).sort();
    expect(enabledNow).toEqual(MODE_DEFAULT_TECHNIQUES.conservative.filter((n) => n !== "loop_guard").sort());
    expect(echoed.techniques.find((x: { name: string }) => x.name === "loop_guard")).toMatchObject({ enabled: false, rolledBack: true });

    const paused = (await web(t.app, a.cookie, { method: "POST", url: "/v1/orbit/pause" })).json();
    expect(paused.paused).toBe(true);
    const d = await pairDevice(t, a.cookie);
    const viaDevice = (await device(t.app, d.token, { method: "GET", url: "/v1/orbit/policy" })).json();
    expect(viaDevice.paused).toBe(true);
    const resumed = (await device(t.app, d.token, { method: "POST", url: "/v1/orbit/resume" })).json();
    expect(resumed.paused).toBe(false);

    const audit = (await web(t.app, a.cookie, { method: "GET", url: "/v1/audit?limit=100" })).json();
    const actions = audit.items.map((x: { action: string }) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["orbit.policy_updated", "orbit.technique_rolled_back", "orbit.paused", "orbit.resumed"]));
    const resumedEvt = audit.items.find((x: { action: string }) => x.action === "orbit.resumed");
    expect(resumedEvt.actorType).toBe("device");
    expect(me(a.cookie)).toBeDefined();
  });
});
const me = (cookie: string) => web(t.app, cookie, { method: "GET", url: "/v1/me" });

describe("connectors, onboarding, projects", () => {
  it("catalog is honest and server-enforced", async () => {
    const a = await signupVerified(t, "con@exemplo.test");
    const list = (await web(t.app, a.cookie, { method: "GET", url: "/v1/connectors" })).json();
    expect(list.map((c: { kind: string }) => c.kind)).toEqual(["openai_api", "anthropic_api", "openai_compatible", "local_agent_sdk", "claude_code", "codex", "chat_apps"]);
    const chat = list.find((c: { kind: string }) => c.kind === "chat_apps");
    expect(Object.values(chat.capabilities).every((v) => v === "not_supported")).toBe(true);
    const cc = list.find((c: { kind: string }) => c.kind === "claude_code");
    expect(cc.capabilities).toMatchObject({ officialQuota: "partial", cache: "not_supported", compression: "partial", routing: "not_supported" });

    expect((await web(t.app, a.cookie, { method: "PUT", url: "/v1/connectors/chat_apps", payload: { status: "optimization_active" } })).statusCode).toBe(422);
    const secret = await web(t.app, a.cookie, { method: "PUT", url: "/v1/connectors/openai_api", payload: { status: "connected_read_only", credentialRef: "keychain:sk-proj-abcdef123" } });
    expect(secret.statusCode).toBe(422);
    expect(secret.json().error.code).toBe("invalid_credential_ref");
    const ok = await web(t.app, a.cookie, { method: "PUT", url: "/v1/connectors/openai_api", payload: { status: "optimization_active", credentialRef: "keychain:maindy/openai" } });
    expect(ok.statusCode).toBe(200);
    // no traffic yet: an explicit connection is shown read-only (status is derived from real events)
    expect(ok.json()).toMatchObject({ status: "connected_read_only", credentialRef: "keychain:maindy/openai" });
    expect((await me(a.cookie)).json().onboarding.completed).toContain("connector_added");
  });

  it("onboarding PATCH accepts client steps only", async () => {
    const a = await signupVerified(t, "onb@exemplo.test");
    const r = await web(t.app, a.cookie, { method: "PATCH", url: "/v1/onboarding", payload: { complete: ["app_downloaded"], dismissed: true } });
    expect(r.json()).toMatchObject({ completed: ["app_downloaded"], dismissed: true });
    const bad = await web(t.app, a.cookie, { method: "PATCH", url: "/v1/onboarding", payload: { complete: ["device_paired"] } });
    expect(bad.statusCode).toBe(422);
  });

  it("projects/agents CRUD, plan limit and key uniqueness", async () => {
    const a = await signupVerified(t, "proj@exemplo.test");
    const p = await web(t.app, a.cookie, { method: "POST", url: "/v1/projects", payload: { key: "api-core", name: "API Core" } });
    expect(p.statusCode).toBe(201);
    // no subscription → 1 project
    const p2 = await web(t.app, a.cookie, { method: "POST", url: "/v1/projects", payload: { key: "web", name: "Web" } });
    expect(p2.statusCode).toBe(409);
    const ag = await web(t.app, a.cookie, { method: "POST", url: "/v1/agents", payload: { key: "reviewer", name: "Revisor", projectId: p.json().id } });
    expect(ag.statusCode).toBe(201);
    expect((await web(t.app, a.cookie, { method: "POST", url: "/v1/agents", payload: { key: "reviewer", name: "Outro" } })).statusCode).toBe(409);
    const patched = await web(t.app, a.cookie, { method: "PATCH", url: `/v1/projects/${p.json().id}`, payload: { name: "API Núcleo" } });
    expect(patched.json().name).toBe("API Núcleo");
    expect((await web(t.app, a.cookie, { method: "GET", url: "/v1/agents" })).json()).toHaveLength(1);
    expect((await web(t.app, a.cookie, { method: "DELETE", url: `/v1/agents/${ag.json().id}` })).statusCode).toBe(200);
    expect((await web(t.app, a.cookie, { method: "DELETE", url: `/v1/projects/${p.json().id}` })).statusCode).toBe(200);
  });
});

describe("account (LGPD)", () => {
  it("export has no secrets; delete requires EXCLUIR + password and removes user and org", async () => {
    const a = await signupVerified(t, "lgpd@exemplo.test");
    const exp = await web(t.app, a.cookie, { method: "GET", url: "/v1/account/export" });
    expect(exp.statusCode).toBe(200);
    expect(exp.headers["content-disposition"]).toContain("maindy-export-");
    expect(exp.body).not.toMatch(/password|token_hash|tokenHash|argon2/i);
    expect(exp.json().user.email).toBe("lgpd@exemplo.test");

    expect((await web(t.app, a.cookie, { method: "DELETE", url: "/v1/account", payload: { confirm: "EXCLUIR", password: "errada-errada" } })).statusCode).toBe(401);
    expect((await web(t.app, a.cookie, { method: "DELETE", url: "/v1/account", payload: { confirm: "excluir", password: PASSWORD } })).statusCode).toBe(400);
    const del = await web(t.app, a.cookie, { method: "DELETE", url: "/v1/account", payload: { confirm: "EXCLUIR", password: PASSWORD } });
    expect(del.json()).toEqual({ ok: true, organizationDeleted: true });
    expect(await t.db.db.select().from(users).where(eq(users.id, a.userId))).toHaveLength(0);
    expect(await t.db.db.select().from(organizations).where(eq(organizations.id, a.orgId))).toHaveLength(0);
    expect((await me(a.cookie)).statusCode).toBe(401);
  });

  it("audit list is owner/admin only and requires a session", async () => {
    expect((await t.app.inject({ method: "GET", url: "/v1/audit" })).statusCode).toBe(401);
  });
});

describe("releases", () => {
  it("lists 4 unavailable targets; register-release makes a real file downloadable with sha256", async () => {
    const list = (await t.app.inject({ method: "GET", url: "/v1/releases" })).json();
    expect(list).toHaveLength(4);
    expect(list.every((r: { available: boolean; url: string | null }) => !r.available && r.url === null)).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), "maindy-rel-"));
    const file = join(dir, "maindy_0.1.0_aarch64.dmg");
    const content = Buffer.from("fake-but-real-file-bytes-for-test");
    writeFileSync(file, content);
    const relDir = join(dir, "out");
    const cfg = testConfig();
    execFileSync(process.execPath, ["--import", "tsx", resolve("src/scripts/register-release.ts"), "macos-arm64", file, "0.1.0", "adhoc"], {
      env: { ...process.env, DATABASE_URL: cfg.TEST_DATABASE_URL, RELEASES_DIR: relDir, NODE_ENV: "test" },
      stdio: "pipe",
    });
    const app2 = await createTestApp({ config: { ...testConfig(), releasesDirAbs: relDir } });
    try {
      const rel = (await app2.app.inject({ method: "GET", url: "/v1/releases" })).json().find((r: { target: string }) => r.target === "macos-arm64");
      const sha = createHash("sha256").update(content).digest("hex");
      expect(rel).toMatchObject({ available: true, sha256: sha, sizeBytes: content.length, signing: "adhoc", fileName: "maindy_0.1.0_aarch64.dmg" });
      expect(rel.url).toBe("http://localhost:4100/releases/macos-arm64/maindy_0.1.0_aarch64.dmg");
      const dl = await app2.app.inject({ method: "GET", url: "/releases/macos-arm64/maindy_0.1.0_aarch64.dmg" });
      expect(dl.statusCode).toBe(200);
      expect(dl.headers["content-disposition"]).toContain('attachment; filename="maindy_0.1.0_aarch64.dmg"');
      expect(dl.headers["content-type"]).toBe("application/x-apple-diskimage");
      expect(dl.rawPayload.equals(content)).toBe(true);
      expect((await app2.app.inject({ method: "GET", url: "/releases/macos-arm64/..%2F..%2Fetc%2Fpasswd" })).statusCode).toBe(404);
      expect((await app2.app.inject({ method: "GET", url: "/releases/windows-x64/maindy_0.1.0_aarch64.dmg" })).statusCode).toBe(404);
    } finally {
      await app2.close();
    }
  });
});

describe("system", () => {
  it("health pings the DB; OpenAPI is served; unknown routes use ApiError", async () => {
    const h = await t.app.inject({ method: "GET", url: "/health" });
    expect(h.statusCode).toBe(200);
    expect(h.json()).toMatchObject({ status: "ok", db: "ok" });
    const spec = (await t.app.inject({ method: "GET", url: "/docs/json" })).json();
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(["/v1/auth/signup", "/v1/telemetry/events", "/v1/stats/summary", "/v1/reports/savings"]));
    const nf = await t.app.inject({ method: "GET", url: "/v1/nada" });
    expect(nf.statusCode).toBe(404);
    expect(nf.json().error.code).toBe("not_found");
    const cors = await t.app.inject({ method: "OPTIONS", url: "/v1/me", headers: { origin: "http://localhost:3100", "access-control-request-method": "GET" } });
    expect(cors.headers["access-control-allow-origin"]).toBe("http://localhost:3100");
    expect(cors.headers["access-control-allow-credentials"]).toBe("true");
  });
});
