import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deriveStatus } from "../src/connectors/status.js";
import { connectors } from "../src/db/schema.js";
import { createTestApp, device, pairDevice, resetDb, signupVerified, usageEvent, web, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t));

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;
const DAY = 86_400_000;

type C = { kind: string; status: string; lastSyncAt: string | null; credentialRef: string | null };
async function list(cookieOrToken: { cookie?: string; token?: string }) {
  const res = cookieOrToken.cookie
    ? await web(t.app, cookieOrToken.cookie, { method: "GET", url: "/v1/connectors" })
    : await device(t.app, cookieOrToken.token!, { method: "GET", url: "/v1/connectors" });
  expect(res.statusCode).toBe(200);
  return new Map((res.json() as C[]).map((c) => [c.kind, c]));
}
async function send(token: string, events: ReturnType<typeof usageEvent>[]) {
  for (let i = 0; i < events.length; i += 500) {
    const r = await device(t.app, token, { method: "POST", url: "/v1/telemetry/events", payload: { events: events.slice(i, i + 500) } });
    expect(r.statusCode).toBe(200);
  }
}
const applied = [{ name: "context_dedup" as const, applied: true, tokensSaved: 120, source: "experimentally_estimated" as const }];

describe("connector status derived from real events", () => {
  it("no events and no explicit row → not_connected everywhere", async () => {
    const a = await signupVerified(t, "c0@exemplo.test");
    const m = await list({ cookie: a.cookie });
    expect([...m.values()].every((c) => c.status === "not_connected" && c.lastSyncAt === null)).toBe(true);
  });

  it("traffic in observe mode → connected_read_only with lastSyncAt = latest event; ollama counts as openai_compatible", async () => {
    const a = await signupVerified(t, "c1@exemplo.test");
    const d = await pairDevice(t, a.cookie);
    const latest = ago(2 * MIN);
    const ollamaLatest = ago(4 * MIN);
    await send(d.token, [
      usageEvent({ occurredAt: ago(10 * MIN), orbitMode: "observe" }),
      usageEvent({ occurredAt: latest, orbitMode: "observe" }),
      // gateway's ollama upstream reports openai_compatible; a mislabelled one is normalized too
      usageEvent({ occurredAt: ago(5 * MIN), connector: "openai_compatible", provider: "ollama", model: "qwen3.5:4b" }),
      usageEvent({ occurredAt: ollamaLatest, connector: "openai_api", provider: "ollama", model: "qwen3.5:4b", techniques: applied }),
      usageEvent({ occurredAt: ago(3 * MIN), connector: "claude_code", provider: "anthropic", model: "claude-sonnet-5-5" }),
    ]);
    const m = await list({ cookie: a.cookie });
    expect(m.get("openai_api")).toMatchObject({ status: "connected_read_only", lastSyncAt: latest });
    // policy is observe → never "optimization_active", even though a technique was applied on ollama traffic
    expect(m.get("openai_compatible")).toMatchObject({ status: "connected_read_only", lastSyncAt: ollamaLatest });
    expect(m.get("claude_code")?.status).toBe("connected_read_only");
    expect(m.get("anthropic_api")?.status).toBe("not_connected");
    // device token sees the same derived view
    expect((await list({ token: d.token })).get("openai_api")?.status).toBe("connected_read_only");
  });

  it("optimization_active only when the policy optimizes AND a technique was really applied", async () => {
    const a = await signupVerified(t, "c2@exemplo.test");
    const d = await pairDevice(t, a.cookie);
    await web(t.app, a.cookie, { method: "PUT", url: "/v1/orbit/policy", payload: { mode: "balanced" } });
    await send(d.token, [
      usageEvent({ occurredAt: ago(MIN), connector: "openai_api", techniques: applied }),
      usageEvent({ occurredAt: ago(MIN), connector: "anthropic_api", provider: "anthropic", model: "claude-sonnet-5-5" }),
      // applied 6 days ago still counts ("ever applied"), the window only bounds traffic presence
      usageEvent({ occurredAt: ago(6 * DAY), connector: "local_agent_sdk", techniques: applied }),
      usageEvent({ occurredAt: ago(MIN), connector: "local_agent_sdk" }),
    ]);
    let m = await list({ cookie: a.cookie });
    expect(m.get("openai_api")?.status).toBe("optimization_active");
    expect(m.get("anthropic_api")?.status).toBe("connected_read_only");
    expect(m.get("local_agent_sdk")?.status).toBe("optimization_active");
    // pause → passthrough → read-only again
    await web(t.app, a.cookie, { method: "POST", url: "/v1/orbit/pause" });
    m = await list({ cookie: a.cookie });
    expect(m.get("openai_api")?.status).toBe("connected_read_only");
  });

  it("error rate > 30% over the latest 50 events → attention; older errors and old events don't count", async () => {
    const a = await signupVerified(t, "c3@exemplo.test");
    const d = await pairDevice(t, a.cookie);
    const err = { status: "error" as const, httpStatus: 500, errorCode: "upstream_500" };
    // openai_api: 16/50 errors (32%) → attention
    const evA = Array.from({ length: 50 }, (_, i) => usageEvent({ occurredAt: ago((i + 1) * MIN), ...(i < 16 ? err : {}) }));
    // anthropic_api: 15/50 (30%, not > 30%) → read-only
    const evB = Array.from({ length: 50 }, (_, i) =>
      usageEvent({ occurredAt: ago((i + 1) * MIN), connector: "anthropic_api", provider: "anthropic", ...(i < 15 ? err : {}) }),
    );
    // local_agent_sdk: 50 recent ok + 40 older errors outside the sample → read-only
    const evC = [
      ...Array.from({ length: 50 }, (_, i) => usageEvent({ occurredAt: ago((i + 1) * MIN), connector: "local_agent_sdk" })),
      ...Array.from({ length: 40 }, (_, i) => usageEvent({ occurredAt: ago(DAY + i * MIN), connector: "local_agent_sdk", ...err })),
    ];
    // codex: only 8-day-old traffic → outside the 7-day window
    const evD = [usageEvent({ occurredAt: ago(8 * DAY), connector: "codex", provider: "openai" })];
    await send(d.token, [...evA, ...evB, ...evC, ...evD]);
    const m = await list({ cookie: a.cookie });
    expect(m.get("openai_api")?.status).toBe("attention");
    expect(m.get("anthropic_api")?.status).toBe("connected_read_only");
    expect(m.get("local_agent_sdk")?.status).toBe("connected_read_only");
    expect(m.get("codex")).toMatchObject({ status: "not_connected", lastSyncAt: null });
  });

  it("explicit connect shows read-only without traffic; a later disconnect wins until newer traffic arrives", async () => {
    const a = await signupVerified(t, "c4@exemplo.test");
    const d = await pairDevice(t, a.cookie);
    const put = (kind: string, payload: object) => web(t.app, a.cookie, { method: "PUT", url: `/v1/connectors/${kind}`, payload });

    const r = await put("anthropic_api", { status: "connected_read_only", credentialRef: "keychain:maindy/anthropic" });
    expect(r.json()).toMatchObject({ status: "connected_read_only", credentialRef: "keychain:maindy/anthropic", lastSyncAt: null });
    // claiming "optimization_active" without any evidence is shown as read-only
    expect((await put("openai_api", { status: "optimization_active", credentialRef: "keychain:maindy/openai" })).json().status).toBe("connected_read_only");

    await send(d.token, [usageEvent({ occurredAt: ago(5 * MIN), connector: "codex", provider: "openai" })]);
    expect((await list({ cookie: a.cookie })).get("codex")?.status).toBe("connected_read_only");
    const disc = await put("codex", { status: "not_connected" });
    expect(disc.json()).toMatchObject({ status: "not_connected" });
    expect((await list({ cookie: a.cookie })).get("codex")?.status).toBe("not_connected");

    // traffic that happened after the disconnect is real evidence again
    await send(d.token, [usageEvent({ occurredAt: new Date(Date.now() + 1000).toISOString(), connector: "codex", provider: "openai" })]);
    expect((await list({ cookie: a.cookie })).get("codex")?.status).toBe("connected_read_only");
  });

  it("legacy rows auto-created by telemetry are not treated as an explicit connection", async () => {
    const a = await signupVerified(t, "c5@exemplo.test");
    await t.db.db.insert(connectors).values({ organizationId: a.orgId, kind: "openai_api", status: "connected_read_only", lastSyncAt: new Date(Date.now() - 9 * DAY) });
    expect((await list({ cookie: a.cookie })).get("openai_api")).toMatchObject({ status: "not_connected", lastSyncAt: null });
  });

  it("derivation is tenant isolated", async () => {
    const A = await signupVerified(t, "c6a@exemplo.test", "Org A");
    const B = await signupVerified(t, "c6b@exemplo.test", "Org B");
    const dA = await pairDevice(t, A.cookie, "Mac A");
    const dB = await pairDevice(t, B.cookie, "Mac B");
    await send(dA.token, [usageEvent({ occurredAt: ago(MIN) })]);
    expect((await list({ token: dA.token })).get("openai_api")?.status).toBe("connected_read_only");
    expect((await list({ token: dB.token })).get("openai_api")?.status).toBe("not_connected");
    expect((await list({ cookie: B.cookie })).get("openai_api")?.lastSyncAt).toBeNull();
  });
});

describe("deriveStatus (pure)", () => {
  const now = new Date();
  const ev = (o: Partial<Parameters<typeof deriveStatus>[0] & object> = {}) => ({ events: 3, lastEventAt: now, sampleSize: 3, sampleErrors: 0, techniqueApplied: false, ...o });
  const obs = { mode: "observe" as const, paused: false };
  it("covers the precedence rules", () => {
    expect(deriveStatus(null, null, obs)).toBe("not_connected");
    expect(deriveStatus(ev(), null, obs)).toBe("connected_read_only");
    expect(deriveStatus(ev({ techniqueApplied: true }), null, { mode: "maximum", paused: false })).toBe("optimization_active");
    expect(deriveStatus(ev({ sampleErrors: 2 }), null, obs)).toBe("attention");
    expect(deriveStatus(null, { status: "attention", credentialRef: null, updatedAt: now }, obs)).toBe("attention");
    expect(deriveStatus(ev(), { status: "not_connected", credentialRef: null, updatedAt: new Date(now.getTime() + 1) }, obs)).toBe("not_connected");
    expect(deriveStatus(ev(), { status: "not_connected", credentialRef: null, updatedAt: new Date(now.getTime() - 1) }, obs)).toBe("connected_read_only");
  });
});
