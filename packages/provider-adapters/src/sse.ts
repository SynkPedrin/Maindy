/**
 * Incremental SSE parsing + per-format stream meters.
 *
 * SseParser is byte-boundary safe: feed it arbitrary chunks, it yields complete events
 * (blank-line terminated, per the SSE spec, with \n or \r\n line endings).
 *
 * StreamMeter extracts model / usage / finish state from the events of each wire format:
 *  - OpenAI chat: final chunk with `choices: []` and `usage` (requires stream_options.include_usage)
 *  - OpenAI Responses: `response.completed` → response.usage
 *  - Anthropic: `message_start.message.usage` (input + cache) and `message_delta.usage` (cumulative output; last wins)
 * Assistant text is accumulated (bounded, memory only) solely to estimate usage when a stream ends early.
 */
import { anthropicUsage, openAiChatUsage, openAiResponsesUsage, type NormalizedUsage, type WireFormat } from "./usage.js";

export interface SseEvent {
  event: string | null;
  data: string;
  id: string | null;
  /** the exact raw text of the event including its terminating blank line */
  raw: string;
}

export class SseParser {
  private buf = "";

  feed(chunk: string): SseEvent[] {
    this.buf += chunk;
    const out: SseEvent[] = [];
    for (;;) {
      const m = /\r?\n\r?\n/.exec(this.buf);
      if (!m) break;
      const end = m.index + m[0].length;
      const raw = this.buf.slice(0, end);
      this.buf = this.buf.slice(end);
      const ev = parseEventBlock(raw);
      if (ev) out.push(ev);
    }
    return out;
  }

  /** Remaining partial data (an event without the terminating blank line). */
  flush(): SseEvent[] {
    const rest = this.buf;
    this.buf = "";
    if (!rest.trim()) return [];
    const ev = parseEventBlock(rest);
    return ev ? [ev] : [];
  }
}

function parseEventBlock(raw: string): SseEvent | null {
  let event: string | null = null;
  let id: string | null = null;
  const data: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
    else if (field === "event") event = value;
    else if (field === "id") id = value;
  }
  if (data.length === 0 && event === null) return null;
  return { event, data: data.join("\n"), id, raw };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseJsonData(ev: SseEvent): Obj | null {
  if (!ev.data || ev.data === "[DONE]") return null;
  try {
    const v = JSON.parse(ev.data);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

export interface StreamMeterResult {
  model: string | null;
  usage: NormalizedUsage | null;
  finishReason: string | null;
  /** provider error event observed mid-stream */
  error: { type: string; message: string } | null;
  completed: boolean;
  /** bounded accumulation of streamed assistant text (memory only) */
  outputText: string;
  /** provider response id (chatcmpl-…, msg_…, resp_…) */
  responseId: string | null;
}

const MAX_TEXT = 1_000_000;

export class StreamMeter {
  private r: StreamMeterResult = { model: null, usage: null, finishReason: null, error: null, completed: false, outputText: "", responseId: null };
  private anthropicStart: NormalizedUsage | null = null;
  private anthropicOutput: number | null = null;
  constructor(readonly format: WireFormat) {}

  private addText(t: unknown): void {
    if (typeof t === "string" && this.r.outputText.length < MAX_TEXT) this.r.outputText += t;
  }

  /** Feed one SSE event. Returns true when the event is the OpenAI usage-only chunk (choices: [] + usage). */
  onEvent(ev: SseEvent): boolean {
    if (this.format === "openai_chat" && ev.data === "[DONE]") {
      this.r.completed = true;
      return false;
    }
    const d = parseJsonData(ev);
    if (!d) return false;
    switch (this.format) {
      case "openai_chat":
        return this.onChat(d);
      case "openai_responses":
        this.onResponses(ev, d);
        return false;
      case "anthropic_messages":
        this.onAnthropic(ev, d);
        return false;
    }
  }

  private onChat(d: Obj): boolean {
    if (typeof d.model === "string") this.r.model = d.model;
    if (typeof d.id === "string" && !this.r.responseId) this.r.responseId = d.id;
    if (isObj(d.error)) {
      this.r.error = { type: String(d.error.type ?? d.error.code ?? "error"), message: String(d.error.message ?? "") };
    }
    const choices = Array.isArray(d.choices) ? d.choices : [];
    for (const c of choices) {
      if (!isObj(c)) continue;
      if (isObj(c.delta)) {
        this.addText(c.delta.content);
        this.addText(c.delta.reasoning);
        this.addText(c.delta.reasoning_content);
      }
      if (typeof c.finish_reason === "string") this.r.finishReason = c.finish_reason;
    }
    const usage = openAiChatUsage(d.usage);
    if (usage) {
      this.r.usage = usage;
      return choices.length === 0;
    }
    return false;
  }

  private onResponses(ev: SseEvent, d: Obj): void {
    const type = typeof d.type === "string" ? d.type : ev.event ?? "";
    const resp = isObj(d.response) ? d.response : null;
    if (resp) {
      if (typeof resp.model === "string") this.r.model = resp.model;
      if (typeof resp.id === "string") this.r.responseId = resp.id;
    }
    if (type === "response.output_text.delta" || type === "response.reasoning_summary_text.delta") this.addText(d.delta);
    if (type === "response.completed" || type === "response.incomplete" || type === "response.failed") {
      const u = openAiResponsesUsage(resp?.usage);
      if (u) this.r.usage = u;
      this.r.completed = true;
      this.r.finishReason = type === "response.completed" ? "completed" : type.replace("response.", "");
      if (type === "response.failed" && resp && isObj(resp.error)) {
        this.r.error = { type: String(resp.error.code ?? "failed"), message: String(resp.error.message ?? "") };
      }
    }
    if (type === "error") {
      this.r.error = { type: String(d.code ?? "error"), message: String(d.message ?? "") };
    }
  }

  private onAnthropic(ev: SseEvent, d: Obj): void {
    const type = typeof d.type === "string" ? d.type : ev.event ?? "";
    if (type === "message_start" && isObj(d.message)) {
      const m = d.message;
      if (typeof m.model === "string") this.r.model = m.model;
      if (typeof m.id === "string") this.r.responseId = m.id;
      this.anthropicStart = anthropicUsage(m.usage);
      if (this.anthropicStart) this.anthropicOutput = this.anthropicStart.outputTokens;
    } else if (type === "content_block_delta" && isObj(d.delta)) {
      this.addText(d.delta.text);
      this.addText(d.delta.thinking);
      this.addText(d.delta.partial_json);
    } else if (type === "message_delta") {
      if (isObj(d.delta) && typeof d.delta.stop_reason === "string") this.r.finishReason = d.delta.stop_reason;
      if (isObj(d.usage)) {
        const u = d.usage;
        // output_tokens is cumulative: the last value is authoritative
        if (typeof u.output_tokens === "number") this.anthropicOutput = u.output_tokens;
        // newer API versions may also repeat (cumulative) input/cache counts here
        if (typeof u.input_tokens === "number" || typeof u.cache_read_input_tokens === "number" || typeof u.cache_creation_input_tokens === "number") {
          const merged = anthropicUsage({
            input_tokens: u.input_tokens ?? 0,
            cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
            output_tokens: this.anthropicOutput ?? 0,
          });
          if (merged && (!this.anthropicStart || merged.inputTokens >= this.anthropicStart.inputTokens)) this.anthropicStart = merged;
        }
      }
    } else if (type === "message_stop") {
      this.r.completed = true;
    } else if (type === "error" && isObj(d.error)) {
      this.r.error = { type: String(d.error.type ?? "error"), message: String(d.error.message ?? "") };
    }
    if (this.anthropicStart) {
      this.r.usage = { ...this.anthropicStart, outputTokens: this.anthropicOutput ?? this.anthropicStart.outputTokens };
    }
  }

  result(): StreamMeterResult {
    return { ...this.r };
  }
}
