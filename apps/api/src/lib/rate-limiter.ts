import { ApiHttpError } from "./errors.js";

/**
 * Fixed-window in-memory limiter for auth-sensitive keys (per IP, per e-mail, …).
 * v0.1 runs a single API instance; a shared store (Postgres/Redis) is needed before horizontal scaling.
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private now: () => number = Date.now) {}

  /** Counts a hit; throws 429 `rate_limited` when `max` is exceeded within `windowMs`. */
  hit(key: string, max: number, windowMs: number): void {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - t) / 1000));
      throw new ApiHttpError(
        429,
        "rate_limited",
        "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        { retryAfterSeconds: retryAfter },
        { "retry-after": String(retryAfter) },
      );
    }
    if (this.buckets.size > 50_000) this.sweep(t);
  }

  reset(): void {
    this.buckets.clear();
  }

  private sweep(t: number): void {
    for (const [k, b] of this.buckets) if (b.resetAt <= t) this.buckets.delete(k);
  }
}

export const MINUTE = 60_000;
export const LIMITS = {
  loginPerIp: { max: 10, windowMs: 15 * MINUTE },
  loginPerEmail: { max: 10, windowMs: 15 * MINUTE },
  signupPerIp: { max: 10, windowMs: 60 * MINUTE },
  resendPerIp: { max: 10, windowMs: 60 * MINUTE },
  resendPerEmail: { max: 3, windowMs: 15 * MINUTE },
  forgotPerIp: { max: 10, windowMs: 60 * MINUTE },
  forgotPerEmail: { max: 3, windowMs: 15 * MINUTE },
  resetPerIp: { max: 20, windowMs: 15 * MINUTE },
  verifyPerIp: { max: 30, windowMs: 15 * MINUTE },
  pairStartPerIp: { max: 10, windowMs: 15 * MINUTE },
  pairPollPerIp: { max: 300, windowMs: 15 * MINUTE },
  // Global ceilings: independent of client IP, so header spoofing cannot bypass them.
  signupGlobal: { max: 600, windowMs: 60 * MINUTE },
  pairStartGlobal: { max: 1200, windowMs: 15 * MINUTE },
  mailGlobal: { max: 1000, windowMs: 60 * MINUTE },
} as const;
