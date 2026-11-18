/**
 * loop_guard and retry_budget — protect against agent loops, duplicate calls and retry storms.
 * Both are in-memory, time-windowed and keyed by (scope, promptHash). They never see prompt text.
 */
import type { OrbitMode } from "@maindy/contracts";

export type GuardAction = "allow" | "warn" | "block";

export interface GuardVerdict {
  action: GuardAction;
  count: number;
  /** pt-BR message for the client when warn/block */
  message?: string;
}

export interface LoopGuardThresholds {
  warnAt: number;
  blockAt: number | null;
}

/** Per-mode thresholds (identical requests within the window). */
export const LOOP_GUARD_THRESHOLDS: Record<OrbitMode, LoopGuardThresholds> = {
  observe: { warnAt: Infinity, blockAt: null },
  conservative: { warnAt: 5, blockAt: null },
  balanced: { warnAt: 5, blockAt: 8 },
  maximum: { warnAt: 4, blockAt: 6 },
};

export class LoopGuard {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly windowMs = 60_000, private readonly maxKeys = 10_000) {}

  /** Record one occurrence and return the verdict for it. */
  check(key: string, mode: OrbitMode, now: number, active = true): GuardVerdict {
    const cutoff = now - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > this.maxKeys) this.prune(now);
    const count = arr.length;
    if (!active) return { action: "allow", count };
    const th = LOOP_GUARD_THRESHOLDS[mode];
    const secs = Math.round(this.windowMs / 1000);
    if (th.blockAt !== null && count >= th.blockAt) {
      return {
        action: "block",
        count,
        message: `maindy. loop guard: a mesma requisição foi enviada ${count}× em ${secs}s. Bloqueada para evitar custo repetido. Altere a requisição, aguarde ${secs}s ou pause a otimização.`,
      };
    }
    if (count >= th.warnAt) {
      return { action: "warn", count, message: `possível loop: requisição idêntica ${count}× em ${secs}s` };
    }
    return { action: "allow", count };
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [k, arr] of this.hits) {
      const fresh = arr.filter((t) => t > cutoff);
      if (fresh.length === 0) this.hits.delete(k);
      else this.hits.set(k, fresh);
    }
  }
}

export interface RetryBudgetOptions {
  windowMs?: number;
  /** max retries of the same request (after a failure) inside the window */
  maxRetriesPerRequest?: number;
  /** max retries across all requests inside the window (retry-storm breaker) */
  maxRetriesGlobal?: number;
}

/**
 * A request counts as a retry when the same key failed (429/5xx/network) within the window.
 * Exceeding the per-request or global budget blocks the call instead of hammering the provider.
 */
export class RetryBudget {
  private readonly failures = new Map<string, number[]>();
  private readonly retries: number[] = [];
  private readonly o: Required<RetryBudgetOptions>;
  constructor(options: RetryBudgetOptions = {}) {
    this.o = { windowMs: 60_000, maxRetriesPerRequest: 4, maxRetriesGlobal: 30, ...options };
  }

  check(key: string, now: number, active = true): GuardVerdict {
    const cutoff = now - this.o.windowMs;
    const f = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    if (f.length) this.failures.set(key, f);
    else this.failures.delete(key);
    while (this.retries.length && this.retries[0]! <= cutoff) this.retries.shift();
    if (f.length === 0) return { action: "allow", count: 0 };
    // this call is a retry of a recently failed request
    if (!active) return { action: "allow", count: f.length };
    if (f.length >= this.o.maxRetriesPerRequest) {
      return {
        action: "block",
        count: f.length,
        message: `maindy. retry budget: esta requisição já falhou ${f.length}× no último minuto. Bloqueada para evitar retry storm.`,
      };
    }
    if (this.retries.length >= this.o.maxRetriesGlobal) {
      return {
        action: "block",
        count: this.retries.length,
        message: `maindy. retry budget: ${this.retries.length} novas tentativas no último minuto em todas as requisições. Aguarde antes de tentar de novo.`,
      };
    }
    this.retries.push(now);
    return { action: "allow", count: f.length };
  }

  recordOutcome(key: string, now: number, failed: boolean): void {
    if (failed) {
      const arr = this.failures.get(key) ?? [];
      arr.push(now);
      this.failures.set(key, arr);
    } else {
      this.failures.delete(key);
    }
  }

  static isRetryableFailure(httpStatus: number | null): boolean {
    return httpStatus === null || httpStatus === 429 || httpStatus === 408 || httpStatus >= 500;
  }
}
