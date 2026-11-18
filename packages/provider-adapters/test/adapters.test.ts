import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConnectorKind } from "@maindy/contracts";
import {
  CONNECTOR_CAPABILITIES,
  clientRequestedStreamUsage,
  errorBody,
  formatForPath,
  injectIncludeUsage,
  normalizeError,
  promptTextForChecks,
  requestSlots,
  requestWantsJson,
  responseText,
  SseParser,
  StreamMeter,
  usageFromResponse,
  type WireFormat,
} from "../src/index.js";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const json = (name: string) => JSON.parse(fx(name));

/** Feed a recorded SSE body in awkward chunk sizes to prove boundary safety. */
function meter(format: WireFormat, sse: string, chunk = 7) {
  const p = new SseParser();
  const m = new StreamMeter(format);
  const usageChunks: number[] = [];
  let i = 0;
  let n = 0;
  for (let off = 0; off < sse.length; off += chunk) {
    for (const ev of p.feed(sse.slice(off, off + chunk))) {
      if (m.onEvent(ev)) usageChunks.push(n);
      n++;
      i++;
    }
  }
  for (const ev of p.flush()) m.onEvent(ev);
  return { result: m.result(), events: n, usageChunks };
}

describe("non-stream usage", () => {
  it("OpenAI chat (cached included in prompt_tokens)", () => {
    expect(usageFromResponse("openai_chat", json("openai-chat.json"))).toEqual({
      inputTokens: 2048,
      outputTokens: 12,
      cachedInputTokens: 1536,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      source: "provider_reported",
    });
    expect(responseText("openai_chat", json("openai-chat.json"))).toBe("Olá! Como posso ajudar?");
  });
  it("OpenAI Responses", () => {
    expect(usageFromResponse("openai_responses", json("openai-responses.json"))).toMatchObject({
      inputTokens: 3000,
      cachedInputTokens: 2048,
      outputTokens: 50,
      reasoningTokens: 20,
    });
    expect(responseText("openai_responses", json("openai-responses.json"))).toBe("Resposta curta.");
  });
  it("Anthropic (input excludes cache → normalized total)", () => {
    expect(usageFromResponse("anthropic_messages", json("anthropic-message.json"))).toEqual({
      inputTokens: 120 + 2000 + 8000,
      outputTokens: 42,
      cachedInputTokens: 8000,
      cacheWriteTokens: 2000,
      cacheWriteLongTokens: 500,
      source: "provider_reported",
    });
    expect(responseText("anthropic_messages", json("anthropic-message.json"))).toBe("Olá! Tudo certo.");
  });
  it("real Ollama non-stream response", () => {
    expect(usageFromResponse("openai_chat", json("ollama-chat.json"))).toMatchObject({ inputTokens: 16, outputTokens: 40, cachedInputTokens: 12 });
  });
  it("missing usage → null", () => {
    expect(usageFromResponse("openai_chat", { choices: [] })).toBeNull();
    expect(usageFromResponse("anthropic_messages", "nope")).toBeNull();
  });
});

describe("SSE parser", () => {
  it("handles CRLF, comments, multi-line data and partial chunks", () => {
    const p = new SseParser();
    expect(p.feed(": keepalive\r\n\r\nevent: a\r\ndata: 1\r\n")).toEqual([]);
    const evs = p.feed("data: 2\r\n\r\ndata: x");
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ event: "a", data: "1\n2" });
    expect(evs[0]!.raw).toBe("event: a\r\ndata: 1\r\ndata: 2\r\n\r\n");
    expect(p.flush()[0]!.data).toBe("x");
  });
});

describe("stream meters", () => {
  it("OpenAI chat: include_usage final chunk detected and flagged", () => {
    const { result, usageChunks, events } = meter("openai_chat", fx("openai-chat-stream.sse"));
    expect(events).toBe(6);
    expect(usageChunks).toEqual([4]);
    expect(result).toMatchObject({
      model: "gpt-6.2-sol-2026-09-01",
      finishReason: "stop",
      completed: true,
      outputText: "Olá!",
      responseId: "chatcmpl-AbC124",
      usage: { inputTokens: 1200, outputTokens: 3, cachedInputTokens: 1024, source: "provider_reported" },
    });
  });
  it("real Ollama chat stream (thinking model: reasoning deltas)", () => {
    const { result, usageChunks } = meter("openai_chat", fx("ollama-chat-stream.sse"), 13);
    expect(usageChunks).toHaveLength(1);
    expect(result.usage).toMatchObject({ inputTokens: 16, outputTokens: 40 });
    expect(result.finishReason).toBe("length");
    expect(result.outputText.length).toBeGreaterThan(0);
  });
  it("OpenAI chat stream without usage chunk → usage null (caller estimates)", () => {
    const sse = fx("openai-chat-stream.sse").split("\n\n").filter((b) => !b.includes('"choices":[]')).join("\n\n");
    expect(meter("openai_chat", sse).result.usage).toBeNull();
  });
  it("OpenAI Responses: response.completed usage", () => {
    const { result } = meter("openai_responses", fx("openai-responses-stream.sse"), 11);
    expect(result).toMatchObject({ model: "gpt-6.1-terra", completed: true, outputText: "Resposta curta.", usage: { inputTokens: 3000, cachedInputTokens: 2048, outputTokens: 50 } });
  });
  it("real Ollama Responses stream", () => {
    const { result } = meter("openai_responses", fx("ollama-responses-stream.sse"), 5);
    expect(result.completed).toBe(true);
    expect(result.usage?.inputTokens).toBeGreaterThan(0);
    expect(result.usage?.outputTokens).toBeGreaterThan(0);
  });
  it("Anthropic: message_start input + cumulative message_delta output (last wins)", () => {
    const { result } = meter("anthropic_messages", fx("anthropic-stream.sse"), 3);
    expect(result).toMatchObject({
      model: "claude-opus-5-5",
      finishReason: "end_turn",
      completed: true,
      outputText: "Olá, mundo",
      responseId: "msg_01Str",
      usage: { inputTokens: 4025, cachedInputTokens: 4000, cacheWriteTokens: 0, outputTokens: 17 },
    });
  });
  it("Anthropic message_delta with cumulative input fields (newer API)", () => {
    const sse =
      'event: message_start\ndata: {"type":"message_start","message":{"id":"m","model":"claude-sonnet-5-5","usage":{"input_tokens":10,"output_tokens":1}}}\n\n' +
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":10,"cache_read_input_tokens":500,"output_tokens":9}}\n\n';
    expect(meter("anthropic_messages", sse).result.usage).toMatchObject({ inputTokens: 510, cachedInputTokens: 500, outputTokens: 9 });
  });
  it("Anthropic error event", () => {
    expect(meter("anthropic_messages", fx("anthropic-stream-error.sse")).result.error).toEqual({ type: "overloaded_error", message: "Overloaded" });
  });
});

describe("errors", () => {
  it("normalizes provider errors", () => {
    expect(normalizeError(429, fx("anthropic-error.json"))).toMatchObject({ code: "rate_limit", providerType: "rate_limit_error", retryable: true });
    expect(normalizeError(401, json("openai-error.json"))).toMatchObject({ code: "auth", retryable: false });
    expect(normalizeError(404, fx("ollama-error.json"))).toMatchObject({ code: "not_found", message: "model 'nope:1b' not found" });
    expect(normalizeError(529, "")).toMatchObject({ code: "overloaded", retryable: true });
    expect(normalizeError(502, "<html>bad gateway</html>")).toMatchObject({ code: "upstream_error", message: "<html>bad gateway</html>" });
  });
  it("builds wire-format error bodies", () => {
    expect(errorBody("anthropic_messages", "x", "m")).toEqual({ type: "error", error: { type: "x", message: "m" } });
    expect(errorBody("openai_chat", "x", "m")).toEqual({ error: { message: "m", type: "x", code: "x" } });
  });
});

describe("request helpers", () => {
  it("detects formats from paths", () => {
    expect(formatForPath("/v1/chat/completions")).toBe("openai_chat");
    expect(formatForPath("/v1/responses")).toBe("openai_responses");
    expect(formatForPath("/v1/messages?beta=true")).toBe("anthropic_messages");
    expect(formatForPath("/v1/models")).toBeNull();
  });
  it("injects include_usage only when needed", () => {
    const b: Record<string, unknown> = { stream: true };
    expect(injectIncludeUsage("openai_chat", b)).toBe(true);
    expect(clientRequestedStreamUsage(b)).toBe(true);
    expect(injectIncludeUsage("openai_chat", { stream: true, stream_options: { include_usage: true } })).toBe(false);
    expect(injectIncludeUsage("openai_chat", { stream: false })).toBe(false);
    expect(injectIncludeUsage("anthropic_messages", { stream: true })).toBe(false);
  });
  it("builds slots for OpenAI chat (string + parts) and mutates in place", () => {
    const body = {
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: [{ type: "text", text: "U" }, { type: "image_url", image_url: { url: "x" } }] },
        { role: "assistant", content: null, tool_calls: [] },
        { role: "tool", tool_call_id: "1", content: "T" },
      ],
    };
    const s = requestSlots("openai_chat", body);
    expect(s.map((x) => [x.kind, x.text])).toEqual([["system", "S"], ["user", "U"], ["tool_result", "T"]]);
    s[2]!.set("T2");
    expect(body.messages[3]!.content).toBe("T2");
    expect(promptTextForChecks("openai_chat", body)).toBe("S\nU");
  });
  it("builds slots for Responses (instructions, input items, function_call_output)", () => {
    const body = {
      instructions: "I",
      input: [
        { role: "user", content: [{ type: "input_text", text: "U" }] },
        { type: "function_call", call_id: "c", name: "f", arguments: "{}" },
        { type: "function_call_output", call_id: "c", output: "OUT" },
      ],
    };
    expect(requestSlots("openai_responses", body).map((x) => [x.kind, x.text])).toEqual([["system", "I"], ["user", "U"], ["tool_result", "OUT"]]);
    expect(requestSlots("openai_responses", { input: "hi" }).map((x) => x.text)).toEqual(["hi"]);
  });
  it("builds slots for Anthropic (system blocks, tool_result string/blocks)", () => {
    const body = {
      system: [{ type: "text", text: "S" }],
      messages: [
        { role: "user", content: "U" },
        { role: "assistant", content: [{ type: "tool_use", id: "t", name: "bash", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "R1" }, { type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: "R2" }] }] },
      ],
    };
    const s = requestSlots("anthropic_messages", body);
    expect(s.map((x) => [x.kind, x.text])).toEqual([["system", "S"], ["user", "U"], ["tool_result", "R1"], ["tool_result", "R2"]]);
    s[3]!.set("R2b");
    expect((body.messages[2]!.content as { content: { text: string }[] }[])[1]!.content[0]!.text).toBe("R2b");
  });
  it("detects JSON output requests", () => {
    expect(requestWantsJson("openai_chat", { response_format: { type: "json_schema", json_schema: { schema: { type: "object" } } } })).toEqual({ wantsJson: true, schema: { type: "object" } });
    expect(requestWantsJson("openai_responses", { text: { format: { type: "json_object" } } }).wantsJson).toBe(true);
    expect(requestWantsJson("anthropic_messages", {}).wantsJson).toBe(false);
  });
});

describe("capability matrix", () => {
  it("covers every ConnectorKind with pt-BR limitations", () => {
    for (const k of ConnectorKind.options) {
      expect(CONNECTOR_CAPABILITIES[k].kind).toBe(k);
      expect(CONNECTOR_CAPABILITIES[k].limitations.length).toBeGreaterThan(0);
    }
    expect(CONNECTOR_CAPABILITIES.chat_apps.capabilities.observeUsage).toBe("not_supported");
    expect(CONNECTOR_CAPABILITIES.claude_code.capabilities.cache).toBe("not_supported");
  });
});
