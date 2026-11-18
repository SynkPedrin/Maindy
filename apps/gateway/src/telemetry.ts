/**
 * Telemetry outbox → control plane.
 *  usage   → POST {api}/v1/telemetry/events   { events: RequestUsageEvent[] }  (idempotent by eventId)
 *  quality → POST {api}/v1/telemetry/quality  QualityEvaluationEvent[]
 *  quota   → POST {api}/v1/telemetry/quota    QuotaSnapshot[]
 * Rows stay in sqlite until a 2xx; failures back off exponentially (5s · 2^attempts, max 10 min).
 * Not linked → nothing is sent; events stay local (GET /maindy/events).
 */
import { RequestUsageEvent } from "@maindy/contracts";
import type { GatewayDb, OutboxKind } from "./db.js";
import type { DeviceFile } from "./home.js";
import type { Logger } from "./logger.js";

export interface CloudLink {
  apiUrl: string;
  token: string;
}

export function resolveLink(device: DeviceFile | null, configuredApiUrl: string | null): CloudLink | null {
  if (!device) return null;
  const apiUrl = (process.env.GATEWAY_API_URL || device.apiUrl || configuredApiUrl || "http://127.0.0.1:4100").replace(/\/+$/, "");
  return { apiUrl, token: device.deviceToken };
}

const ENDPOINT: Record<OutboxKind, string> = {
  usage: "/v1/telemetry/events",
  quality: "/v1/telemetry/quality",
  quota: "/v1/telemetry/quota",
};

export function backoffMs(attempts: number): number {
  return Math.min(5000 * 2 ** attempts, 10 * 60_000);
}

export class TelemetryFlusher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: GatewayDb,
    private readonly link: () => CloudLink | null,
    private readonly log: Logger,
    private readonly batchSize = 100,
  ) {}

  start(intervalMs: number): void {
    this.timer = setInterval(() => void this.flushAll(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async flushAll(now = Date.now()): Promise<{ sent: number; failed: number }> {
    if (this.running) return { sent: 0, failed: 0 };
    const l = this.link();
    if (!l) return { sent: 0, failed: 0 };
    this.running = true;
    let sent = 0;
    let failed = 0;
    try {
      for (const kind of ["usage", "quality", "quota"] as OutboxKind[]) {
        const r = await this.flushKind(kind, l, now);
        sent += r.sent;
        failed += r.failed;
      }
    } finally {
      this.running = false;
    }
    return { sent, failed };
  }

  private async flushKind(kind: OutboxKind, l: CloudLink, now: number): Promise<{ sent: number; failed: number }> {
    const rows = this.db.pending(kind, now, this.batchSize);
    if (rows.length === 0) return { sent: 0, failed: 0 };
    const ids = rows.map((r) => r.id);
    const maxAttempts = Math.max(...rows.map((r) => r.attempts));
    let payloads = rows.map((r) => r.payload);
    if (kind === "usage") {
      // defensive: never ship something that is not a valid (text-free) RequestUsageEvent
      payloads = payloads.filter((p) => RequestUsageEvent.safeParse(p).success);
    }
    const body = kind === "usage" ? { events: payloads } : payloads;
    try {
      const res = await fetch(`${l.apiUrl}${ENDPOINT[kind]}`, {
        method: "POST",
        headers: { authorization: `Bearer ${l.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        this.db.markSent(ids, now);
        this.log.info("telemetria enviada", { route: ENDPOINT[kind], count: ids.length, status: res.status });
        return { sent: ids.length, failed: 0 };
      }
      this.db.markFailed(ids, now + backoffMs(maxAttempts), `http_${res.status}`);
      this.log.warn("telemetria rejeitada", { route: ENDPOINT[kind], status: res.status, count: ids.length });
      return { sent: 0, failed: ids.length };
    } catch (err) {
      this.db.markFailed(ids, now + backoffMs(maxAttempts), (err as Error).name ?? "network");
      this.log.warn("telemetria offline; nova tentativa com backoff", { route: ENDPOINT[kind], count: ids.length, code: (err as Error).name });
      return { sent: 0, failed: ids.length };
    }
  }
}
