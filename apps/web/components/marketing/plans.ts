import { PlanDto } from "@maindy/contracts";
import { PLAN_FALLBACK } from "./content";

export type PlansResult = { plans: PlanDto[]; source: "api" | "fallback" };

const ORDER = ["starter", "pro", "master_economy"] as const;

/** Server-side fetch of `GET /v1/plans` with a graceful, clearly-labelled fallback. */
export async function getPlans(): Promise<PlansResult> {
  const base = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4100";
  try {
    const res = await fetch(`${base}/v1/plans`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(2500),
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`plans ${res.status}`);
    const json: unknown = await res.json();
    const raw = Array.isArray(json) ? json : (json as { plans?: unknown })?.plans;
    const parsed = PlanDto.array().safeParse(raw);
    if (!parsed.success || parsed.data.length === 0) throw new Error("plans: invalid payload");
    const plans = [...parsed.data].sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
    return { plans, source: "api" };
  } catch {
    return { plans: PLAN_FALLBACK, source: "fallback" };
  }
}
