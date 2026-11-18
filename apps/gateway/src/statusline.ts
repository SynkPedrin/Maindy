/**
 * Claude Code status line JSON → QuotaSnapshot[] (rate_limits.five_hour / seven_day).
 * This is the only official programmatic signal of subscription limits; it only exists while Claude Code
 * runs, only for Pro/Max plans and only after the first response.
 */
import { QuotaSnapshot } from "@maindy/contracts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** resets_at may be epoch seconds, epoch ms or an ISO string. */
export function toIso(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const ms = v > 1e12 ? v : v * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof v === "string" && v) {
    if (/^\d+(\.\d+)?$/.test(v)) return toIso(Number(v));
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return null;
}

export function quotasFromStatusline(body: unknown, now = new Date()): QuotaSnapshot[] {
  if (!isObj(body) || !isObj(body.rate_limits)) return [];
  const out: QuotaSnapshot[] = [];
  for (const window of ["five_hour", "seven_day"]) {
    const w = body.rate_limits[window];
    if (!isObj(w)) continue;
    const pct = typeof w.used_percentage === "number" ? w.used_percentage : Number(w.used_percentage);
    if (!Number.isFinite(pct)) continue;
    const snap = QuotaSnapshot.safeParse({
      provider: "anthropic",
      product: "claude_code_subscription",
      window,
      usedPercentage: Math.min(100, Math.max(0, pct)),
      resetsAt: toIso(w.resets_at),
      collectedVia: "claude_code.statusline",
      capturedAt: now.toISOString(),
    });
    if (snap.success) out.push(snap.data);
  }
  return out;
}
