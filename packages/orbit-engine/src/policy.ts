/**
 * Policy engine: OrbitPolicyDto (+ local extras) → the set of techniques that may run for a request.
 *
 *  - paused or mode "observe" ⇒ pure passthrough + measurement (empty set).
 *  - techniques listed in policy.techniques: `enabled && !rolledBack` decides.
 *  - techniques not listed: MODE_DEFAULT_TECHNIQUES[mode].
 *  - rolled back locally by Quality Guard ⇒ off, regardless of policy.
 *  - output_budget only in "maximum"; model_routing only with an explicit mapping; semantic_cache never
 *    (not implemented — opt-in only by design, and we do not ship it yet).
 */
import { MODE_DEFAULT_TECHNIQUES, type OrbitMode, type OrbitPolicyDto, type TechniqueName } from "@maindy/contracts";
import type { RoutingRule } from "./techniques/body.js";
import type { CachePolicyOptions } from "./techniques/cache.js";

export interface PolicyExtras {
  routing?: RoutingRule[];
  outputBudgetTokens?: number;
  cache?: CachePolicyOptions;
}

export const ALL_TECHNIQUES: TechniqueName[] = [
  "exact_cache",
  "semantic_cache",
  "tool_output_compression",
  "context_dedup",
  "loop_guard",
  "retry_budget",
  "output_budget",
  "model_routing",
  "prompt_cache_hints",
];

export function defaultPolicy(mode: OrbitMode = "observe", now = new Date()): OrbitPolicyDto {
  return {
    mode,
    paused: false,
    techniques: [],
    qualitySampleRate: 0.05,
    maxAddedLatencyMs: 50,
    cacheTtlSeconds: 86_400,
    updatedAt: now.toISOString(),
    version: 0,
  };
}

export function isPassthrough(policy: Pick<OrbitPolicyDto, "paused" | "mode">): boolean {
  return policy.paused || policy.mode === "observe";
}

export function activeTechniques(
  policy: OrbitPolicyDto,
  extras: PolicyExtras = {},
  localRollbacks: ReadonlySet<TechniqueName> = new Set(),
): Set<TechniqueName> {
  const out = new Set<TechniqueName>();
  if (isPassthrough(policy)) return out;
  const defaults = new Set(MODE_DEFAULT_TECHNIQUES[policy.mode]);
  const explicit = new Map(policy.techniques.map((t) => [t.name, t]));
  for (const name of ALL_TECHNIQUES) {
    const st = explicit.get(name);
    const on = st ? st.enabled && !st.rolledBack : defaults.has(name);
    if (!on) continue;
    if (localRollbacks.has(name)) continue;
    if (name === "semantic_cache") continue;
    if (name === "output_budget" && policy.mode !== "maximum") continue;
    if (name === "model_routing" && !(extras.routing && extras.routing.length > 0)) continue;
    out.add(name);
  }
  return out;
}
