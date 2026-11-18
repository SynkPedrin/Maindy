/**
 * Provenance (MeasurementSource) derivation for numbers whose payload has no per-value `source`.
 * Every view takes provenance from here or from the data itself — never an inline literal.
 */
import type { MeasurementSource, QuotaSnapshot } from "./types";

const STRENGTH: Record<MeasurementSource, number> = {
  provider_reported: 0,
  locally_measured: 1,
  experimentally_estimated: 2,
  unavailable: 3,
};

/** Weakest provenance among contributing values, ignoring "unavailable" unless it is the only one
 *  (same rule as apps/api `savings/math.ts#weakestSource`). */
export function weakestSource(sources: Iterable<MeasurementSource>): MeasurementSource {
  let out: MeasurementSource | null = null;
  for (const s of sources) {
    if (s === "unavailable") continue;
    if (out === null || STRENGTH[s] > STRENGTH[out]) out = s;
  }
  return out ?? "unavailable";
}

/** Quality Guard verdicts are produced on this machine by the gateway (tests, schema checks, shadow
 *  samples) and only counted by the API. No evaluations → nothing to show. */
export function qualitySource(evaluations: number | null | undefined): MeasurementSource {
  return evaluations && evaluations > 0 ? "locally_measured" : "unavailable";
}

/** Official collectors the API accepts for quota snapshots. Anything else is not shown as official. */
const OFFICIAL_QUOTA_COLLECTORS = /^(claude_code\.statusline|codex\.app_server|codex\.app-server|[a-z_]+\.admin_api)/;

export function quotaSource(q: Pick<QuotaSnapshot, "collectedVia">): MeasurementSource {
  return OFFICIAL_QUOTA_COLLECTORS.test(q.collectedVia) ? "provider_reported" : "unavailable";
}

/** Counters in /maindy/status are counted by the local gateway itself since its last start. */
export function gatewayCounterSource(running: boolean): MeasurementSource {
  return running ? "locally_measured" : "unavailable";
}

/** Latency of a test we timed ourselves. */
export function timedLocally(ms: number | null | undefined): MeasurementSource {
  return ms == null ? "unavailable" : "locally_measured";
}
