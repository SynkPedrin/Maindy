/**
 * Quality Guard — quality is a gate, not a chart.
 *
 *  - shadow sampling: decide which optimized requests also run the ORIGINAL request for comparison
 *    (rate = policy.qualitySampleRate; the shadow's cost is recorded as overhead);
 *  - evaluators: exact_match (deterministic), schema_valid (JSON outputs), reference_similarity
 *    (token-overlap F1);
 *  - regression detection per technique over a rolling window → rollback signal;
 *  - fallback_original: technique error or latency budget exceeded → send the original request.
 */
import type { QualityEvaluationEvent, TechniqueName } from "@maindy/contracts";
import { isObject } from "./types.js";

/* ------------------------------ sampling ------------------------------ */

export function shouldSample(rate: number, rng: () => number = Math.random): boolean {
  if (!(rate > 0)) return false;
  if (rate >= 1) return true;
  return rng() < rate;
}

/* ------------------------------ evaluators ------------------------------ */

export type EvalMethod = QualityEvaluationEvent["method"];

export interface Evaluation {
  method: EvalMethod;
  passed: boolean;
  score: number | null;
  detail: string | null;
}

export function exactMatch(reference: string, candidate: string): Evaluation {
  const passed = reference.trim() === candidate.trim();
  return { method: "exact_match", passed, score: passed ? 1 : 0, detail: null };
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

/** Token-overlap F1 over bag-of-words (multiset). 1 = same words, 0 = disjoint. */
export function tokenOverlapF1(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 && wb.length === 0) return 1;
  if (wa.length === 0 || wb.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const w of wa) counts.set(w, (counts.get(w) ?? 0) + 1);
  let overlap = 0;
  for (const w of wb) {
    const c = counts.get(w) ?? 0;
    if (c > 0) {
      overlap++;
      counts.set(w, c - 1);
    }
  }
  const p = overlap / wb.length;
  const r = overlap / wa.length;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

export function referenceSimilarity(reference: string, candidate: string, threshold = 0.6): Evaluation {
  const score = Math.round(tokenOverlapF1(reference, candidate) * 1000) / 1000;
  return { method: "reference_similarity", passed: score >= threshold, score, detail: `threshold ${threshold}` };
}

/** Minimal JSON-Schema subset: type, properties, required, items, enum, additionalProperties:false. */
export function validateJsonSchema(value: unknown, schema: unknown, path = "$"): string | null {
  if (!isObject(schema)) return null;
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) return `${path}: not in enum`;
  const type = schema.type;
  const types = Array.isArray(type) ? type : type ? [type] : [];
  if (types.length) {
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "number" && Number.isInteger(value) ? "integer" : typeof value;
    const ok = types.some((t) => t === actual || (t === "number" && actual === "integer"));
    if (!ok) return `${path}: expected ${types.join("|")}, got ${actual}`;
  }
  if (isObject(value)) {
    const props = isObject(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const r of schema.required) if (typeof r === "string" && !(r in value)) return `${path}.${r}: required`;
    }
    for (const [k, v] of Object.entries(value)) {
      if (k in props) {
        const err = validateJsonSchema(v, props[k], `${path}.${k}`);
        if (err) return err;
      } else if (schema.additionalProperties === false) {
        return `${path}.${k}: additional property`;
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      const err = validateJsonSchema(value[i], schema.items, `${path}[${i}]`);
      if (err) return err;
    }
  }
  return null;
}

export function schemaValid(candidate: string, schema?: unknown): Evaluation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { method: "schema_valid", passed: false, score: 0, detail: "invalid JSON" };
  }
  const err = schema ? validateJsonSchema(parsed, schema) : null;
  return { method: "schema_valid", passed: err === null, score: err === null ? 1 : 0, detail: err };
}

export interface EvaluateInput {
  reference: string;
  candidate: string;
  /** request asked for deterministic output (temperature 0) */
  deterministic: boolean;
  /** request asked for JSON (response_format json_object/json_schema) */
  jsonSchema?: unknown;
  wantsJson?: boolean;
  similarityThreshold?: number;
}

/** Choose the strongest applicable evaluator. */
export function evaluate(input: EvaluateInput): Evaluation {
  if (input.wantsJson || input.jsonSchema) return schemaValid(input.candidate, input.jsonSchema);
  if (input.deterministic && input.reference.trim() === input.candidate.trim()) return exactMatch(input.reference, input.candidate);
  return referenceSimilarity(input.reference, input.candidate, input.similarityThreshold);
}

/* ------------------------------ regression detection ------------------------------ */

export interface RegressionOptions {
  windowSize?: number;
  minSamples?: number;
  /** rollback when failure rate in the window exceeds this */
  maxFailureRate?: number;
}

export interface RollbackSignal {
  technique: TechniqueName;
  reason: string;
  failureRate: number;
  samples: number;
}

export class RegressionDetector {
  private readonly windows = new Map<TechniqueName, boolean[]>();
  private readonly rolledBack = new Set<TechniqueName>();
  private readonly o: Required<RegressionOptions>;
  constructor(options: RegressionOptions = {}) {
    this.o = { windowSize: 20, minSamples: 5, maxFailureRate: 0.2, ...options };
  }

  /** Record an evaluation; returns a rollback signal the first time the threshold is crossed. */
  record(technique: TechniqueName, passed: boolean): RollbackSignal | null {
    const w = this.windows.get(technique) ?? [];
    w.push(passed);
    while (w.length > this.o.windowSize) w.shift();
    this.windows.set(technique, w);
    if (this.rolledBack.has(technique) || w.length < this.o.minSamples) return null;
    const failures = w.filter((p) => !p).length;
    const rate = failures / w.length;
    if (rate > this.o.maxFailureRate) {
      this.rolledBack.add(technique);
      return {
        technique,
        failureRate: rate,
        samples: w.length,
        reason: `Quality Guard: ${failures}/${w.length} avaliações reprovadas (${Math.round(rate * 100)}% > ${Math.round(this.o.maxFailureRate * 100)}%)`,
      };
    }
    return null;
  }

  isRolledBack(t: TechniqueName): boolean {
    return this.rolledBack.has(t);
  }
  rolledBackSet(): ReadonlySet<TechniqueName> {
    return this.rolledBack;
  }
  /** manual re-enable (e.g. after the user reviews) */
  reset(t: TechniqueName): void {
    this.rolledBack.delete(t);
    this.windows.delete(t);
  }
  stats(t: TechniqueName): { samples: number; failures: number } {
    const w = this.windows.get(t) ?? [];
    return { samples: w.length, failures: w.filter((p) => !p).length };
  }
}

/* ------------------------------ fallback_original ------------------------------ */

export interface GuardedResult<T> {
  value: T;
  fallbackOriginal: boolean;
  reason: string | null;
  elapsedMs: number;
}

/**
 * Run `optimize` and fall back to `original` if it throws or exceeds the latency budget.
 * `now` is injectable for tests.
 */
export function withFallback<T>(
  original: () => T,
  optimize: () => T,
  maxAddedLatencyMs: number,
  now: () => number = () => performance.now(),
): GuardedResult<T> {
  const t0 = now();
  try {
    const value = optimize();
    const elapsedMs = now() - t0;
    if (elapsedMs > maxAddedLatencyMs) {
      return { value: original(), fallbackOriginal: true, reason: "latency budget exceeded", elapsedMs };
    }
    return { value, fallbackOriginal: false, reason: null, elapsedMs };
  } catch (err) {
    return { value: original(), fallbackOriginal: true, reason: `technique error: ${(err as Error)?.name ?? "Error"}`, elapsedMs: now() - t0 };
  }
}
