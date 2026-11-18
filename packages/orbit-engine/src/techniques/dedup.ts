/**
 * context_dedup — content repeated verbatim inside a conversation: keep the first occurrence, replace later
 * copies with an explicit reference marker the model can follow.
 *
 * How it works (v2):
 *  - Matching is line-based and CONTIGUOUS: a run of consecutive lines in a user/tool message that appears,
 *    in the same order, in ONE earlier visible place (an earlier message, the system prompt, or earlier in the
 *    same message) is a candidate. This catches a document pasted again even when the surrounding sentence on
 *    the same paragraph changed, and a block repeated inside one tool output.
 *  - Threshold is in TOKENS (model tokenizer when available), default ≥ 64 tokens, and the marker must save
 *    at least half of the run. Size in tokens adapts to the content (code and Portuguese prose tokenize very
 *    differently per character), instead of a fixed character count.
 *  - The marker says where the original is and quotes its first words:
 *      [maindy: conteúdo idêntico ao da mensagem #2 acima, omitido (~290 tokens; começa com "Política de…")]
 *
 * Never touched:
 *  - system/developer prompts and assistant messages (they are only registered as sources);
 *  - the first occurrence of anything (including inside the latest message);
 *  - fenced code blocks (``` / ~~~) in user messages — every user message was the latest one when it was
 *    sent, so "never edit code in the latest message" must hold for all of them to keep the request prefix
 *    byte-stable across turns (provider prompt caching) and the savings baseline honest;
 *  - tool results whose whole text is JSON (structured payloads), tool-call arguments and images (they are
 *    not text slots at all);
 *  - lines that only re-match a marker or blank lines (runs never start or end on a blank line).
 *
 * Decisions depend only on earlier content, so the same message is rewritten identically on every later turn.
 */
import { countTokens } from "../tokens.js";
import { application, type SlotKind, type TextSlot } from "../types.js";
import type { TechniqueApplication } from "@maindy/contracts";

export interface DedupOptions {
  /** minimum size of a duplicated run, in tokens of the request model (default 64) */
  minBlockTokens?: number;
  model?: string | null;
}

export interface DedupResult {
  application: TechniqueApplication;
  tokensRemoved: number;
  blocksReplaced: number;
}

export const DEFAULT_MIN_BLOCK_TOKENS = 64;
/** never index more positions than this per distinct line (bounds CPU on very repetitive text) */
const MAX_POSITIONS_PER_LINE = 32;
const FENCE = /^\s*(```|~~~)/;
/** a value no real line can have (markers are never matched against) */
const UNMATCHABLE = "\u0000maindy-marker\u0000";

interface Source {
  messageIndex: number;
  kind: SlotKind;
  /** normalized visible lines (after any replacement in this source) */
  lines: string[];
}

const norm = (line: string) => line.replace(/\s+$/, "");
const isBlank = (line: string) => line.trim().length === 0;

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** lines that are fence delimiters or inside a fenced block */
function fencedLines(lines: string[]): boolean[] {
  const out = new Array<boolean>(lines.length).fill(false);
  let open: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE.exec(lines[i]!);
    if (open) {
      out[i] = true;
      if (m && m[1] === open) open = null;
    } else if (m) {
      out[i] = true;
      open = m[1]!;
    }
  }
  return out;
}

function anchor(line: string): string {
  const flat = line.trim().replace(/\s+/g, " ").replace(/"/g, "'");
  if (flat.length <= 60) return flat;
  const cut = flat.slice(0, 60);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 30 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function where(src: Source, current: Source): string {
  if (src === current) return "ao trecho anterior desta mensagem";
  if (src.kind === "system" || src.kind === "developer") return "ao das instruções do sistema";
  return `ao da mensagem #${src.messageIndex + 1} acima`;
}

export function dedupeContext(slots: TextSlot[], options: DedupOptions = {}): DedupResult {
  const minTokens = Math.max(1, options.minBlockTokens ?? DEFAULT_MIN_BLOCK_TOKENS);
  const model = options.model ?? null;
  const sources: Source[] = [];
  const index = new Map<string, [Source, number][]>();
  let removed = 0;
  let replaced = 0;
  let source: TechniqueApplication["source"] = countTokens("x", model).source;

  const indexLine = (src: Source, pos: number) => {
    const key = src.lines[pos]!;
    if (key === UNMATCHABLE || isBlank(key) || FENCE.test(key)) return;
    let list = index.get(key);
    if (!list) index.set(key, (list = []));
    if (list.length < MAX_POSITIONS_PER_LINE) list.push([src, pos]);
  };
  const registerAll = (slot: TextSlot) => {
    const src: Source = { messageIndex: slot.messageIndex, kind: slot.kind, lines: slot.text.split("\n").map(norm) };
    sources.push(src);
    for (let i = 0; i < src.lines.length; i++) indexLine(src, i);
  };

  for (const slot of slots) {
    const target = slot.kind === "user" || slot.kind === "tool_result";
    if (!target || looksLikeJson(slot.text)) {
      registerAll(slot);
      continue;
    }
    const lines = slot.text.split("\n");
    const keys = lines.map(norm);
    const locked = slot.kind === "user" ? fencedLines(lines) : new Array<boolean>(lines.length).fill(false);
    const current: Source = { messageIndex: slot.messageIndex, kind: slot.kind, lines: [] };
    sources.push(current);
    const out: string[] = [];
    let changed = false;

    const emit = (i: number) => {
      out.push(lines[i]!);
      current.lines.push(keys[i]!);
      indexLine(current, current.lines.length - 1);
    };

    let i = 0;
    while (i < lines.length) {
      const key = keys[i]!;
      const candidates = !locked[i] && !isBlank(key) && !FENCE.test(key) ? index.get(key) : undefined;
      if (!candidates) {
        emit(i);
        i++;
        continue;
      }
      // longest contiguous match among the indexed positions of this line
      let best: { src: Source; len: number } | null = null;
      for (const [src, start] of candidates) {
        let m = 0;
        while (
          i + m < lines.length &&
          start + m < src.lines.length &&
          !locked[i + m] &&
          !FENCE.test(keys[i + m]!) &&
          keys[i + m] === src.lines[start + m]
        ) {
          m++;
        }
        while (m > 0 && isBlank(keys[i + m - 1]!)) m--; // never swallow the separator after the block
        if (m > 0 && (!best || m > best.len)) best = { src, len: m };
      }
      if (best) {
        const runText = lines.slice(i, i + best.len).join("\n");
        // cheap pre-filter: a run shorter (in chars) than the token threshold can never reach it
        if (runText.length >= minTokens) {
          const t = countTokens(runText, model, runText.length);
          if (t.tokens >= minTokens) {
            const marker = `[maindy: conteúdo idêntico ${where(best.src, current)}, omitido (~${t.tokens} tokens; começa com "${anchor(lines[i]!)}")]`;
            const saved = t.tokens - countTokens(marker, model, runText.length).tokens;
            if (saved >= t.tokens / 2) {
              out.push(marker);
              current.lines.push(UNMATCHABLE);
              removed += saved;
              replaced++;
              changed = true;
              source = t.source;
              i += best.len;
              continue;
            }
          }
        }
      }
      emit(i);
      i++;
    }
    if (changed) slot.set(out.join("\n"));
  }
  return {
    application: application("context_dedup", replaced > 0, removed, source, replaced ? `${replaced} bloco(s)` : undefined),
    tokensRemoved: removed,
    blocksReplaced: replaced,
  };
}
