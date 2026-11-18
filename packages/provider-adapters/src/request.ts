/**
 * Request-side helpers: wire-format detection, stream/usage flags, and mutable text slots over a body
 * (consumed by orbit-engine techniques, which stay format-agnostic).
 */
import type { WireFormat } from "./usage.js";

export type SlotKind = "system" | "developer" | "user" | "assistant" | "tool_result";

export interface TextSlot {
  messageIndex: number;
  kind: SlotKind;
  text: string;
  set(next: string): void;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function formatForPath(path: string): WireFormat | null {
  const p = path.split("?")[0]!.replace(/\/+$/, "");
  if (p.endsWith("/chat/completions")) return "openai_chat";
  if (p.endsWith("/responses")) return "openai_responses";
  if (p.endsWith("/messages")) return "anthropic_messages";
  return null;
}

export function requestModel(body: unknown): string | null {
  return isObj(body) && typeof body.model === "string" ? body.model : null;
}

export function isStreamRequest(body: unknown): boolean {
  return isObj(body) && body.stream === true;
}

/** Did the client itself ask for the usage chunk on an OpenAI chat stream? */
export function clientRequestedStreamUsage(body: unknown): boolean {
  return isObj(body) && isObj(body.stream_options) && body.stream_options.include_usage === true;
}

/**
 * Ensure the final usage chunk is emitted for OpenAI chat streams. Returns true when we injected it
 * (the gateway must then strip the extra usage chunk / `usage: null` fields before the client sees them).
 */
export function injectIncludeUsage(format: WireFormat, body: Obj): boolean {
  if (format !== "openai_chat" || body.stream !== true || clientRequestedStreamUsage(body)) return false;
  const so = isObj(body.stream_options) ? body.stream_options : {};
  body.stream_options = { ...so, include_usage: true };
  return true;
}

function slot(messageIndex: number, kind: SlotKind, holder: Obj, key: string): TextSlot | null {
  const v = holder[key];
  if (typeof v !== "string") return null;
  return {
    messageIndex,
    kind,
    get text() {
      return holder[key] as string;
    },
    set(next: string) {
      holder[key] = next;
    },
  };
}

function partsSlots(messageIndex: number, kind: SlotKind, parts: unknown[], textTypes: Set<string>): TextSlot[] {
  const out: TextSlot[] = [];
  for (const p of parts) {
    if (!isObj(p)) continue;
    const t = typeof p.type === "string" ? p.type : "text";
    if (textTypes.has(t)) {
      const s = slot(messageIndex, kind, p, "text");
      if (s) out.push(s);
    }
  }
  return out;
}

const CHAT_TEXT = new Set(["text", "input_text"]);

function roleKind(role: unknown): SlotKind {
  switch (role) {
    case "system":
      return "system";
    case "developer":
      return "developer";
    case "assistant":
      return "assistant";
    case "tool":
    case "function":
      return "tool_result";
    default:
      return "user";
  }
}

export function requestSlots(format: WireFormat, body: Obj): TextSlot[] {
  const out: TextSlot[] = [];
  if (format === "openai_chat") {
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    msgs.forEach((m, i) => {
      if (!isObj(m)) return;
      const kind = roleKind(m.role);
      if (typeof m.content === "string") out.push(slot(i, kind, m, "content")!);
      else if (Array.isArray(m.content)) out.push(...partsSlots(i, kind, m.content, CHAT_TEXT));
    });
    return out;
  }
  if (format === "openai_responses") {
    const ins = slot(-1, "system", body, "instructions");
    if (ins) out.push(ins);
    if (typeof body.input === "string") {
      out.push(slot(0, "user", body, "input")!);
      return out;
    }
    const items = Array.isArray(body.input) ? body.input : [];
    items.forEach((it, i) => {
      if (!isObj(it)) return;
      if (it.type === "function_call_output" || it.type === "custom_tool_call_output" || it.type === "local_shell_call_output") {
        if (typeof it.output === "string") out.push(slot(i, "tool_result", it, "output")!);
        else if (Array.isArray(it.output)) out.push(...partsSlots(i, "tool_result", it.output, new Set(["input_text", "output_text", "text"])));
        return;
      }
      if (it.role !== undefined) {
        const kind = roleKind(it.role);
        if (typeof it.content === "string") out.push(slot(i, kind, it, "content")!);
        else if (Array.isArray(it.content)) out.push(...partsSlots(i, kind, it.content, new Set(["input_text", "output_text", "text"])));
      }
    });
    return out;
  }
  // anthropic_messages
  if (typeof body.system === "string") out.push(slot(-1, "system", body, "system")!);
  else if (Array.isArray(body.system)) out.push(...partsSlots(-1, "system", body.system, new Set(["text"])));
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  msgs.forEach((m, i) => {
    if (!isObj(m)) return;
    const kind = roleKind(m.role);
    if (typeof m.content === "string") {
      out.push(slot(i, kind, m, "content")!);
      return;
    }
    if (!Array.isArray(m.content)) return;
    for (const b of m.content) {
      if (!isObj(b)) continue;
      if (b.type === "text") {
        const s = slot(i, kind, b, "text");
        if (s) out.push(s);
      } else if (b.type === "tool_result") {
        if (typeof b.content === "string") out.push(slot(i, "tool_result", b, "content")!);
        else if (Array.isArray(b.content)) out.push(...partsSlots(i, "tool_result", b.content, new Set(["text"])));
      }
    }
  });
  return out;
}

/** Text the user/system wrote (not tool outputs) — used for the cache's dynamic-content check only. */
export function promptTextForChecks(format: WireFormat, body: Obj): string {
  return requestSlots(format, body)
    .filter((s) => s.kind !== "tool_result" && s.kind !== "assistant")
    .map((s) => s.text)
    .join("\n");
}

export function requestWantsJson(format: WireFormat, body: Obj): { wantsJson: boolean; schema?: unknown } {
  if (format === "openai_chat" && isObj(body.response_format)) {
    const rf = body.response_format;
    if (rf.type === "json_object") return { wantsJson: true };
    if (rf.type === "json_schema" && isObj(rf.json_schema)) return { wantsJson: true, schema: rf.json_schema.schema };
  }
  if (format === "openai_responses" && isObj(body.text) && isObj(body.text.format)) {
    const f = body.text.format;
    if (f.type === "json_object") return { wantsJson: true };
    if (f.type === "json_schema") return { wantsJson: true, schema: f.schema };
  }
  return { wantsJson: false };
}
