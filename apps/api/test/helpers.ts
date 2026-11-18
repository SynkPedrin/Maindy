import { randomUUID } from "node:crypto";
import type { RequestUsageEvent } from "@maindy/contracts";
import { sql } from "drizzle-orm";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { buildApp } from "../src/app.js";
import type { BillingProvider } from "../src/billing/provider.js";
import { buildConfig, loadEnvFiles, type Config } from "../src/config.js";
import { createDb, type DbHandle } from "../src/db/client.js";
import { MemoryMailer, type Mailer } from "../src/mail/mailer.js";

loadEnvFiles();

export const WEB_ORIGIN = "http://localhost:3100";

export function testConfig(overrides: Record<string, string> = {}): Config {
  const base = buildConfig({ ...process.env, NODE_ENV: "test", LOG_LEVEL: "silent", ...overrides });
  return { ...base, DATABASE_URL: base.TEST_DATABASE_URL };
}

let shared: DbHandle | null = null;
export function testDb(): DbHandle {
  shared ??= createDb(testConfig().TEST_DATABASE_URL, { max: 5 });
  return shared;
}

export interface TestApp {
  app: FastifyInstance;
  mailer: MemoryMailer;
  db: DbHandle;
  close: () => Promise<void>;
}

export async function createTestApp(opts: { billing?: BillingProvider; mailer?: Mailer; config?: Config } = {}): Promise<TestApp> {
  const mailer = new MemoryMailer();
  const db = testDb();
  const app = await buildApp({ config: opts.config ?? testConfig(), dbHandle: db, mailer: opts.mailer ?? mailer, billing: opts.billing, logger: false });
  await app.ready();
  return { app, mailer, db, close: () => app.close() };
}

const KEEP = new Set(["plans", "download_releases"]);
export async function resetDb(t?: TestApp): Promise<void> {
  const db = testDb();
  const rows = (await db.db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)) as unknown as { tablename: string }[];
  const tables = rows.map((r) => r.tablename).filter((n) => !KEEP.has(n));
  if (tables.length) await db.db.execute(sql.raw(`truncate table ${tables.map((n) => `"${n}"`).join(", ")} restart identity cascade`));
  await db.db.execute(sql`update download_releases set available = false, file_name = null, size_bytes = null, sha256 = null, released_at = null`);
  t?.app.deps.limiter.reset();
}

export function sessionCookie(res: LightMyRequestResponse): string | undefined {
  const c = res.cookies.find((x) => x.name === "maindy_session");
  return c?.value;
}

/** Web request with session cookie + CSRF header + allowed Origin. */
export function web(app: FastifyInstance, cookie: string, opts: InjectOptions) {
  return app.inject({
    ...opts,
    headers: { "x-maindy-csrf": "1", origin: WEB_ORIGIN, ...(opts.headers ?? {}), cookie: `maindy_session=${cookie}` },
  });
}

export function device(app: FastifyInstance, token: string, opts: InjectOptions) {
  return app.inject({ ...opts, headers: { ...(opts.headers ?? {}), authorization: `Bearer ${token}` } });
}

export const PASSWORD = "senha-forte-123";

export function tokenFromMail(text: string): string {
  const m = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!m) throw new Error("token not found in e-mail");
  return m[1]!;
}

/** signup → verify (via captured e-mail) → returns session cookie + ids */
export async function signupVerified(t: TestApp, email: string, name = "Ana Teste", extra: Record<string, unknown> = {}) {
  const res = await t.app.inject({
    method: "POST",
    url: "/v1/auth/signup",
    payload: { name, email, password: PASSWORD, acceptTerms: true, ...extra },
  });
  if (res.statusCode !== 201) throw new Error(`signup failed ${res.statusCode} ${res.body}`);
  const mail = t.mailer.lastTo(email);
  if (!mail) throw new Error("no verification mail");
  const verify = await t.app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token: tokenFromMail(mail.text) } });
  if (verify.statusCode !== 200) throw new Error(`verify failed ${verify.statusCode} ${verify.body}`);
  const cookie = sessionCookie(verify)!;
  const me = verify.json();
  return { cookie, userId: me.user.id as string, orgId: me.organization.id as string, me };
}

/** Full device pairing → device token. */
export async function pairDevice(t: TestApp, cookie: string, name = "MacBook de teste") {
  const start = await t.app.inject({
    method: "POST",
    url: "/v1/devices/pair/start",
    payload: { deviceName: name, platform: "macos", arch: "arm64", appVersion: "0.1.0" },
  });
  const { deviceCode, userCode } = start.json();
  const approve = await web(t.app, cookie, { method: "POST", url: "/v1/devices/pair/approve", payload: { userCode, approve: true } });
  if (approve.statusCode !== 200) throw new Error(`approve failed ${approve.statusCode} ${approve.body}`);
  const poll = await t.app.inject({ method: "POST", url: "/v1/devices/pair/poll", payload: { deviceCode } });
  const body = poll.json();
  if (body.status !== "approved") throw new Error(`poll: ${poll.body}`);
  return { token: body.deviceToken as string, deviceId: body.deviceId as string };
}

const HASH = "a".repeat(64);
export function usageEvent(p: Partial<RequestUsageEvent> & { costMicros?: number; baselineMicros?: number | null; overheadMicros?: number } = {}): RequestUsageEvent {
  const { costMicros = 1000, baselineMicros = null, overheadMicros = 0, ...rest } = p;
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    connector: "openai_api",
    provider: "openai",
    model: "gpt-6.1-terra",
    endpoint: "/v1/chat/completions",
    projectKey: null,
    agentKey: null,
    sessionKey: null,
    streaming: false,
    status: "ok",
    httpStatus: 200,
    latencyMs: 120,
    orbitMode: "balanced",
    usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0, cacheWriteTokens: 0, source: "provider_reported" },
    cost: { micros: costMicros, currency: "USD", source: "provider_reported" },
    pricingVersion: "2026-11-18",
    baselineCost: baselineMicros === null ? null : { micros: baselineMicros, currency: "USD", source: "experimentally_estimated" },
    baselineMethod: baselineMicros === null ? "none" : "pre_optimization_tokens",
    overheadCost: { micros: overheadMicros, currency: "USD", source: "locally_measured" },
    techniques: [],
    cache: { status: "miss" },
    promptHash: HASH,
    fallbackOriginal: false,
    errorCode: null,
    ...rest,
  };
}
