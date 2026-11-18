/**
 * Request-side optimization pipeline (pure). The gateway handles exact_cache / loop_guard / retry_budget
 * around the upstream call; everything that rewrites the request body lives here, wrapped in
 * fallback_original (any error or latency budget overrun ⇒ the original body is sent untouched).
 */
import type { MeasurementSource, OrbitMode, TechniqueApplication, TechniqueName } from "@maindy/contracts";
import { applyModelRouting, applyOutputBudget, applyPromptCacheHints } from "./techniques/body.js";
import { compressToolOutput, type CompressionOptions } from "./techniques/compression.js";
import { dedupeContext } from "./techniques/dedup.js";
import type { PolicyExtras } from "./policy.js";
import { withFallback } from "./quality.js";
import { application, type JsonObject, type TextSlot, type WireFormat } from "./types.js";
import { weakestSource } from "./savings.js";

export interface OptimizeInput {
  format: WireFormat;
  body: JsonObject;
  /** builds mutable text slots over a body (provider-adapters.requestSlots) */
  buildSlots: (body: JsonObject) => TextSlot[];
  active: ReadonlySet<TechniqueName>;
  mode: OrbitMode;
  extras?: PolicyExtras;
  maxAddedLatencyMs: number;
  compression?: CompressionOptions;
  /** context_dedup minimum duplicated block size, in tokens (default 64) */
  dedupMinBlockTokens?: number;
  now?: () => number;
}

export interface OptimizeOutput {
  body: JsonObject;
  modified: boolean;
  applications: TechniqueApplication[];
  /** prompt tokens removed by compression/dedup (basis for pre_optimization_tokens) */
  tokensRemoved: number;
  tokensRemovedSource: MeasurementSource;
  promptCacheHintAdded: boolean;
  routedFrom: string | null;
  fallbackOriginal: boolean;
  fallbackReason: string | null;
  elapsedMs: number;
}

const BODY_TECHNIQUES: TechniqueName[] = ["tool_output_compression", "context_dedup", "prompt_cache_hints", "output_budget", "model_routing"];

export function optimizeRequest(input: OptimizeInput): OptimizeOutput {
  const wanted = BODY_TECHNIQUES.filter((t) => input.active.has(t));
  const base: OptimizeOutput = {
    body: input.body,
    modified: false,
    applications: [],
    tokensRemoved: 0,
    tokensRemovedSource: "unavailable",
    promptCacheHintAdded: false,
    routedFrom: null,
    fallbackOriginal: false,
    fallbackReason: null,
    elapsedMs: 0,
  };
  if (wanted.length === 0) return base;
  const model = typeof input.body.model === "string" ? input.body.model : null;

  const run = (): OptimizeOutput => {
    const body = structuredClone(input.body);
    const apps: TechniqueApplication[] = [];
    let removed = 0;
    const removedSources: MeasurementSource[] = [];
    let hint = false;
    let routedFrom: string | null = null;
    let modified = false;
    const slots = input.buildSlots(body);

    if (input.active.has("tool_output_compression")) {
      let saved = 0;
      let count = 0;
      let src: MeasurementSource = "unavailable";
      for (const s of slots) {
        if (s.kind !== "tool_result") continue;
        const r = compressToolOutput(s.text, { ...input.compression, model });
        if (r.applied) {
          s.set(r.text);
          saved += r.tokensSaved;
          src = r.source;
          count++;
        }
      }
      apps.push(application("tool_output_compression", count > 0, saved, count ? src : "unavailable", count ? `${count} saída(s)` : undefined));
      if (count) {
        removed += saved;
        removedSources.push(src);
        modified = true;
      }
    }
    if (input.active.has("context_dedup")) {
      const r = dedupeContext(input.buildSlots(body), { model, minBlockTokens: input.dedupMinBlockTokens });
      apps.push(r.application);
      if (r.blocksReplaced) {
        removed += r.tokensRemoved;
        removedSources.push(r.application.source);
        modified = true;
      }
    }
    if (input.active.has("prompt_cache_hints")) {
      const r = applyPromptCacheHints(input.format, body);
      apps.push(r.application);
      hint = r.added;
      modified ||= r.added;
    }
    if (input.active.has("output_budget") && input.mode === "maximum") {
      const a = applyOutputBudget(input.format, body, input.extras?.outputBudgetTokens ?? 8192);
      apps.push(a);
      modified ||= a.applied;
    }
    if (input.active.has("model_routing") && input.extras?.routing?.length) {
      const promptLen = slots.reduce((n, s) => n + s.text.length, 0);
      const r = applyModelRouting(body, input.extras.routing, promptLen);
      apps.push(r.application);
      routedFrom = r.routedFrom;
      modified ||= r.application.applied;
    }
    return {
      body,
      modified,
      applications: apps,
      tokensRemoved: removed,
      tokensRemovedSource: weakestSource(removedSources),
      promptCacheHintAdded: hint,
      routedFrom,
      fallbackOriginal: false,
      fallbackReason: null,
      elapsedMs: 0,
    };
  };

  const g = withFallback(() => base, run, input.maxAddedLatencyMs, input.now);
  return { ...g.value, fallbackOriginal: g.fallbackOriginal, fallbackReason: g.reason, elapsedMs: Math.round(g.elapsedMs) };
}
