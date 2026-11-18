/**
 * tool_output_compression — structured, lossless-first compression of tool/function outputs.
 *
 * Steps (in order, each only if it helps):
 *  1. strip ANSI escape sequences and carriage-return progress redraws (keep the final state of the line);
 *  2. collapse runs of identical consecutive lines → one line + "[maindy: linha repetida N×]";
 *  3. collapse runs of ≥ 4 consecutive lines that differ ONLY in timestamps / UUIDs / long hex ids
 *     (heartbeats, polling, retries): first and last line kept verbatim + an explicit count marker;
 *  4. shorten long decorative rules ("⎯⎯⎯⎯⎯⎯⎯ Failed Tests ⎯⎯⎯⎯⎯⎯⎯", "==========") to 3 characters — only
 *     when the rule starts the line (progress bars like "[=====>   ]" never match);
 *  5. dedupe stack traces identical to an earlier one → reference marker;
 *  6. only if still huge: keep head + tail + error-looking lines from the middle, with an explicit
 *     "[maindy: N linhas omitidas]" marker (the only lossy step).
 *
 * Never touched: whole-JSON payloads (parsed successfully) and fenced code blocks (``` … ```).
 * Below `minChars` nothing happens. If the result saves less than `minSavingsRatio`, the original is kept.
 */
import { countTokens } from "../tokens.js";
import type { MeasurementSource } from "@maindy/contracts";

export interface CompressionOptions {
  /** do nothing below this size (chars) */
  minChars?: number;
  /** head+tail truncation kicks in above this many lines (after lossless steps) */
  maxLines?: number;
  headLines?: number;
  tailLines?: number;
  /** keep at most this many "interesting" (error/warn) lines from the omitted middle */
  keepMiddleMatches?: number;
  /** min fraction of tokens saved to accept the result */
  minSavingsRatio?: number;
  /** model used to count tokens (o200k for OpenAI-family, estimate otherwise) */
  model?: string | null;
}

export interface CompressionResult {
  text: string;
  applied: boolean;
  originalTokens: number;
  compressedTokens: number;
  tokensSaved: number;
  source: MeasurementSource;
  steps: string[];
  reason?: string;
}

const DEFAULTS = {
  minChars: 2000,
  maxLines: 400,
  headLines: 120,
  tailLines: 120,
  keepMiddleMatches: 40,
  minSavingsRatio: 0.05,
};

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
const INTERESTING = /(error|erro|fail|falh|exception|panic|fatal|traceback|warn|aviso|assert|denied|not found|✗|✘|×)/i;
const STACK_FRAME = /^\s+(at\s.+|File ".+", line \d+.*|\S+\.(java|kt|scala):\d+\)?|#\d+\s+0x[0-9a-f]+.*|\d+:\s+0x[0-9a-f]+.*)$/i;

export function stripAnsi(s: string): string {
  return s.replace(ANSI, "");
}

/** Resolve "\r" redraws: keep only what remains visible on each line. */
export function resolveCarriageReturns(s: string): string {
  if (!s.includes("\r")) return s;
  return s
    .split("\n")
    .map((line) => {
      const l = line.endsWith("\r") ? line.slice(0, -1) : line; // CRLF
      if (!l.includes("\r")) return l;
      const parts = l.split("\r").filter((p) => p.length > 0);
      return parts.length ? parts[parts.length - 1]! : "";
    })
    .join("\n");
}

export function collapseRepeatedLines(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    let j = i + 1;
    while (j < lines.length && lines[j] === line) j++;
    const count = j - i;
    if (count >= 3 && line.trim().length > 0) {
      out.push(line, `[maindy: linha acima repetida mais ${count - 1}×]`);
    } else {
      for (let k = i; k < j; k++) out.push(line);
    }
    i = j;
  }
  return out;
}

/* ------------- near-duplicate lines (only timestamps / ids differ) ------------- */

const VOLATILE: RegExp[] = [
  // ISO-8601 / RFC 3339 date-times (optionally with fraction and zone), then bare dates
  /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g,
  /\b\d{4}[-/]\d{2}[-/]\d{2}\b/g,
  // clock times 10:00:01(.123)
  /\b\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?\b/g,
  // UUIDs
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  // long hex ids (trace ids, container ids, shas): ≥ 12 hex chars with at least one digit and one letter
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{12,}\b/gi,
  // unix epoch seconds / millis
  /\b1\d{9}(?:\d{3})?\b/g,
];

/** Line with volatile tokens masked; null when nothing volatile was found or too little is left. */
export function lineSkeleton(line: string): string | null {
  let s = line;
  for (const re of VOLATILE) s = s.replace(re, "\u0001");
  if (s === line) return null;
  const rest = s.replace(/\u0001/g, "").replace(/[^A-Za-z0-9]/g, "");
  return rest.length >= 8 ? s : null;
}

export function collapseNearDuplicateLines(lines: string[], minRun = 4): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const sk = lineSkeleton(lines[i]!);
    let j = i + 1;
    if (sk !== null) while (j < lines.length && lines[j] !== lines[j - 1] && lineSkeleton(lines[j]!) === sk) j++;
    const count = j - i;
    if (sk !== null && count >= minRun) {
      out.push(lines[i]!, `[maindy: mais ${count - 2} linhas iguais à de cima, mudando só horário/IDs]`, lines[j - 1]!);
    } else {
      for (let k = i; k < j; k++) out.push(lines[k]!);
    }
    i = j;
  }
  return out;
}

/* ------------- decorative rules ------------- */

const RULE = /^(\s*)([-=_*~.·⎯─━═╌┄])\2{7,}(.*)$/u;

export function shortenRules(lines: string[]): string[] {
  return lines.map((line) => {
    const m = RULE.exec(line);
    if (!m) return line;
    const [, indent, ch, rest] = m as unknown as [string, string, string, string];
    // a trailing run (≥ 8) of the same character after the label is shortened too
    let end = rest.length;
    while (end > 0 && /\s/.test(rest[end - 1]!)) end--;
    let k = end;
    while (k > 0 && rest[k - 1] === ch) k--;
    const tail = end - k >= 8 ? `${rest.slice(0, k)}${ch.repeat(3)}` : rest;
    return `${indent}${ch.repeat(3)}${tail}`;
  });
}

export function dedupeStackTraces(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  let traceNo = 0;
  let i = 0;
  while (i < lines.length) {
    if (!STACK_FRAME.test(lines[i]!)) {
      out.push(lines[i]!);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && STACK_FRAME.test(lines[j]!)) j++;
    const block = lines.slice(i, j);
    if (block.length >= 3) {
      const key = block.join("\n");
      const prev = seen.get(key);
      if (prev !== undefined) {
        out.push(`[maindy: stack trace idêntico ao #${prev} omitido (${block.length} linhas)]`);
      } else {
        traceNo++;
        seen.set(key, traceNo);
        out.push(...block);
      }
    } else {
      out.push(...block);
    }
    i = j;
  }
  return out;
}

export function headTail(lines: string[], o: Required<Pick<CompressionOptions, "maxLines" | "headLines" | "tailLines" | "keepMiddleMatches">>): string[] {
  if (lines.length <= o.maxLines) return lines;
  const head = lines.slice(0, o.headLines);
  const tail = lines.slice(lines.length - o.tailLines);
  const middle = lines.slice(o.headLines, lines.length - o.tailLines);
  const out = [...head];
  let omitted = 0;
  let kept = 0;
  for (const l of middle) {
    if (kept < o.keepMiddleMatches && INTERESTING.test(l)) {
      if (omitted > 0) out.push(`[maindy: ${omitted} linhas omitidas]`);
      omitted = 0;
      out.push(l);
      kept++;
    } else {
      omitted++;
    }
  }
  if (omitted > 0) out.push(`[maindy: ${omitted} linhas omitidas]`);
  out.push(...tail);
  return out;
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** Split into alternating [prose, fence, prose, fence…] segments; fences are returned verbatim. */
function splitFences(text: string): { fenced: boolean; text: string }[] {
  const segs: { fenced: boolean; text: string }[] = [];
  const re = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) segs.push({ fenced: false, text: text.slice(last, m.index) });
    segs.push({ fenced: true, text: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) segs.push({ fenced: false, text: text.slice(last) });
  return segs;
}

export function compressToolOutput(input: string, options: CompressionOptions = {}): CompressionResult {
  const o = { ...DEFAULTS, ...options };
  const model = options.model ?? null;
  const before = countTokens(input, model, input.length);
  const unchanged = (reason: string): CompressionResult => ({
    text: input,
    applied: false,
    originalTokens: before.tokens,
    compressedTokens: before.tokens,
    tokensSaved: 0,
    source: before.source,
    steps: [],
    reason,
  });
  if (input.length < o.minChars) return unchanged("below size threshold");
  if (looksLikeJson(input)) return unchanged("json payload preserved");

  const steps = new Set<string>();
  const segments = splitFences(input).map((seg) => {
    if (seg.fenced) return seg.text;
    let t = seg.text;
    const noAnsi = stripAnsi(t);
    if (noAnsi !== t) steps.add("strip_ansi");
    t = resolveCarriageReturns(noAnsi);
    if (t !== noAnsi) steps.add("carriage_returns");
    let lines = t.split("\n");
    const collapsed = collapseRepeatedLines(lines);
    if (collapsed.length !== lines.length) steps.add("collapse_repeats");
    lines = collapsed;
    const near = collapseNearDuplicateLines(lines);
    if (near.length !== lines.length) steps.add("collapse_near_duplicates");
    lines = near;
    const ruled = shortenRules(lines);
    if (ruled.some((l, k) => l !== lines[k])) steps.add("shorten_rules");
    lines = ruled;
    const deduped = dedupeStackTraces(lines);
    if (deduped.length !== lines.length) steps.add("dedupe_stack_traces");
    return deduped.join("\n");
  });
  let text = segments.join("");

  // lossy step only on the whole (post-lossless) text, and only outside fences
  const lineCount = text.split("\n").length;
  if (lineCount > o.maxLines && !/^(```|~~~)/m.test(text)) {
    text = headTail(text.split("\n"), o).join("\n");
    steps.add("head_tail");
  }

  const after = countTokens(text, model, input.length);
  const saved = before.tokens - after.tokens;
  if (saved <= 0 || saved / Math.max(1, before.tokens) < o.minSavingsRatio) return unchanged("savings below threshold");
  return {
    text,
    applied: true,
    originalTokens: before.tokens,
    compressedTokens: after.tokens,
    tokensSaved: saved,
    source: before.source,
    steps: [...steps],
  };
}
