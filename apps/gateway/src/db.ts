/**
 * Local persistence (node:sqlite, $MAINDY_HOME/gateway.db).
 *
 * Privacy contract:
 *  - cache_entries holds RESPONSE bodies (needed to replay) — never request/prompt text. Lives only on this machine.
 *  - telemetry_outbox / quota_snapshots / kv / seen_request_ids / counters hold metadata only
 *    (RequestUsageEvent has no prompt text by contract).
 */
import { chmodSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { QuotaSnapshot, RequestUsageEvent, UsageTokens } from "@maindy/contracts";
import type { CacheEntry, ExactCacheStore } from "@maindy/orbit-engine";

export type OutboxKind = "usage" | "quality" | "quota";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS cache_entries (
  key TEXT PRIMARY KEY,
  tenant TEXT NOT NULL,
  project TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  stream INTEGER NOT NULL,
  status INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  body TEXT NOT NULL,
  usage_json TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cache_entries_expires ON cache_entries(expires_at);
CREATE TABLE IF NOT EXISTS telemetry_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS telemetry_outbox_pending ON telemetry_outbox(kind, sent_at, next_attempt_at);
CREATE TABLE IF NOT EXISTS quota_snapshots (
  provider TEXT NOT NULL,
  product TEXT NOT NULL,
  window TEXT NOT NULL,
  used_percentage REAL NOT NULL,
  resets_at TEXT,
  collected_via TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  PRIMARY KEY (provider, product, window)
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seen_request_ids (id TEXT PRIMARY KEY, source TEXT NOT NULL, seen_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
`;

export class GatewayDb implements ExactCacheStore {
  readonly db: DatabaseSync;

  constructor(path: string) {
    const fresh = path !== ":memory:" && !existsSync(path);
    this.db = new DatabaseSync(path);
    if (fresh) {
      try {
        chmodSync(path, 0o600);
      } catch {
        /* ignore */
      }
    }
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  /* ------------------------------ cache ------------------------------ */

  get(key: string, now: number): CacheEntry | null {
    const row = this.db.prepare("SELECT * FROM cache_entries WHERE key = ?").get(key) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (Number(row.expires_at) <= now) {
      this.delete(key);
      return null;
    }
    this.db.prepare("UPDATE cache_entries SET hits = hits + 1 WHERE key = ?").run(key);
    return {
      key,
      tenant: String(row.tenant),
      project: row.project === null ? null : String(row.project),
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
      model: String(row.model),
      provider: String(row.provider),
      stream: Number(row.stream) === 1,
      status: Number(row.status),
      contentType: String(row.content_type),
      body: String(row.body),
      usage: JSON.parse(String(row.usage_json)) as UsageTokens,
    };
  }

  set(e: CacheEntry): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO cache_entries (key, tenant, project, created_at, expires_at, model, provider, stream, status, content_type, body, usage_json, hits)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(e.key, e.tenant, e.project, e.createdAt, e.expiresAt, e.model, e.provider, e.stream ? 1 : 0, e.status, e.contentType, e.body, JSON.stringify(e.usage));
  }

  delete(key: string): void {
    this.db.prepare("DELETE FROM cache_entries WHERE key = ?").run(key);
  }

  purgeExpired(now: number): number {
    return Number(this.db.prepare("DELETE FROM cache_entries WHERE expires_at <= ?").run(now).changes);
  }

  cacheStats(): { entries: number; hits: number } {
    const r = this.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(hits),0) AS h FROM cache_entries").get() as { n: number; h: number };
    return { entries: Number(r.n), hits: Number(r.h) };
  }

  /* ------------------------------ outbox ------------------------------ */

  enqueue(kind: OutboxKind, id: string, occurredAt: string, payload: unknown, now = Date.now()): boolean {
    const r = this.db
      .prepare("INSERT OR IGNORE INTO telemetry_outbox (id, kind, occurred_at, payload, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, kind, occurredAt, JSON.stringify(payload), now);
    return Number(r.changes) > 0;
  }

  pending(kind: OutboxKind, now: number, limit: number): { id: string; payload: unknown; attempts: number }[] {
    const rows = this.db
      .prepare("SELECT id, payload, attempts FROM telemetry_outbox WHERE kind = ? AND sent_at IS NULL AND next_attempt_at <= ? ORDER BY created_at LIMIT ?")
      .all(kind, now, limit) as { id: string; payload: string; attempts: number }[];
    return rows.map((r) => ({ id: r.id, payload: JSON.parse(r.payload), attempts: Number(r.attempts) }));
  }

  markSent(ids: string[], now: number): void {
    const st = this.db.prepare("UPDATE telemetry_outbox SET sent_at = ?, last_error = NULL WHERE id = ?");
    for (const id of ids) st.run(now, id);
  }

  markFailed(ids: string[], nextAttemptAt: number, error: string): void {
    const st = this.db.prepare("UPDATE telemetry_outbox SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE id = ?");
    for (const id of ids) st.run(nextAttemptAt, error.slice(0, 200), id);
  }

  pendingCount(kind?: OutboxKind): number {
    const r = kind
      ? (this.db.prepare("SELECT COUNT(*) AS n FROM telemetry_outbox WHERE sent_at IS NULL AND kind = ?").get(kind) as { n: number })
      : (this.db.prepare("SELECT COUNT(*) AS n FROM telemetry_outbox WHERE sent_at IS NULL").get() as { n: number });
    return Number(r.n);
  }

  listEvents(limit: number, since?: string): RequestUsageEvent[] {
    const rows = (since
      ? this.db.prepare("SELECT payload FROM telemetry_outbox WHERE kind = 'usage' AND occurred_at >= ? ORDER BY occurred_at DESC LIMIT ?").all(since, limit)
      : this.db.prepare("SELECT payload FROM telemetry_outbox WHERE kind = 'usage' ORDER BY occurred_at DESC LIMIT ?").all(limit)) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as RequestUsageEvent);
  }

  eventsBetween(from: string, to: string): RequestUsageEvent[] {
    const rows = this.db
      .prepare("SELECT payload FROM telemetry_outbox WHERE kind = 'usage' AND occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at")
      .all(from, to) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as RequestUsageEvent);
  }

  /** Retention: sent rows older than `days` are removed; unsent rows are capped. */
  prune(now: number, days = 30, maxRows = 200_000): void {
    this.db.prepare("DELETE FROM telemetry_outbox WHERE sent_at IS NOT NULL AND sent_at < ?").run(now - days * 86_400_000);
    this.db
      .prepare("DELETE FROM telemetry_outbox WHERE id IN (SELECT id FROM telemetry_outbox ORDER BY created_at DESC LIMIT -1 OFFSET ?)")
      .run(maxRows);
    this.db.prepare("DELETE FROM seen_request_ids WHERE seen_at < ?").run(now - 7 * 86_400_000);
  }

  /* ------------------------------ quotas ------------------------------ */

  upsertQuota(q: QuotaSnapshot): { changed: boolean } {
    const prev = this.db
      .prepare("SELECT used_percentage, resets_at, captured_at FROM quota_snapshots WHERE provider = ? AND product = ? AND window = ?")
      .get(q.provider, q.product, q.window) as { used_percentage: number; resets_at: string | null; captured_at: string } | undefined;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO quota_snapshots (provider, product, window, used_percentage, resets_at, collected_via, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(q.provider, q.product, q.window, q.usedPercentage, q.resetsAt, q.collectedVia, q.capturedAt);
    const changed =
      !prev ||
      prev.used_percentage !== q.usedPercentage ||
      prev.resets_at !== q.resetsAt ||
      Date.parse(q.capturedAt) - Date.parse(prev.captured_at) > 10 * 60_000;
    return { changed };
  }

  quotas(): QuotaSnapshot[] {
    const rows = this.db.prepare("SELECT * FROM quota_snapshots ORDER BY provider, product, window").all() as Record<string, unknown>[];
    return rows.map((r) => ({
      provider: String(r.provider),
      product: String(r.product),
      window: String(r.window),
      usedPercentage: Number(r.used_percentage),
      resetsAt: r.resets_at === null ? null : String(r.resets_at),
      collectedVia: String(r.collected_via),
      capturedAt: String(r.captured_at),
    }));
  }

  /* ------------------------------ kv / counters / dedupe ------------------------------ */

  getKv<T>(key: string): T | null {
    const r = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
    return r ? (JSON.parse(r.value) as T) : null;
  }

  setKv(key: string, value: unknown): void {
    this.db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
  }

  /** returns true if newly seen */
  markSeen(id: string, source: string, now = Date.now()): boolean {
    return Number(this.db.prepare("INSERT OR IGNORE INTO seen_request_ids (id, source, seen_at) VALUES (?, ?, ?)").run(id, source, now).changes) > 0;
  }

  seenBy(id: string): string | null {
    const r = this.db.prepare("SELECT source FROM seen_request_ids WHERE id = ?").get(id) as { source: string } | undefined;
    return r ? r.source : null;
  }

  incr(values: Record<string, number>): void {
    const st = this.db.prepare("INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = value + excluded.value");
    for (const [k, v] of Object.entries(values)) if (v) st.run(k, Math.round(v));
  }

  counters(): Record<string, number> {
    const rows = this.db.prepare("SELECT name, value FROM counters").all() as { name: string; value: number }[];
    return Object.fromEntries(rows.map((r) => [r.name, Number(r.value)]));
  }
}
