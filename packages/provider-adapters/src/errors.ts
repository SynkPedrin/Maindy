/**
 * Provider error normalization (OpenAI `{error:{message,type,code}}`, Anthropic `{type:"error",error:{type,message}}`,
 * Ollama `{error:"..."}`) + gateway-originated errors in each wire format.
 */
import type { WireFormat } from "./usage.js";

export interface NormalizedError {
  httpStatus: number;
  /** stable short code, e.g. "rate_limit", "overloaded", "invalid_request", "auth", "upstream_error" */
  code: string;
  providerType: string | null;
  message: string;
  retryable: boolean;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function codeFor(status: number, providerType: string | null): string {
  const t = (providerType ?? "").toLowerCase();
  if (status === 429 || t.includes("rate_limit")) return "rate_limit";
  if (status === 529 || t.includes("overloaded")) return "overloaded";
  if (status === 401 || status === 403 || t.includes("authentication") || t.includes("permission")) return "auth";
  if (status === 404 || t.includes("not_found")) return "not_found";
  if (status === 408 || t.includes("timeout")) return "timeout";
  if (status === 413 || t.includes("too_large")) return "request_too_large";
  if (status >= 400 && status < 500) return "invalid_request";
  return "upstream_error";
}

export function normalizeError(status: number, body: unknown): NormalizedError {
  let providerType: string | null = null;
  let message = "";
  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      message = body.slice(0, 300);
    }
  }
  if (isObj(parsed)) {
    const e = parsed.error;
    if (isObj(e)) {
      providerType = typeof e.type === "string" ? e.type : typeof e.code === "string" ? e.code : null;
      message = typeof e.message === "string" ? e.message : message;
    } else if (typeof e === "string") {
      message = e;
    }
  }
  return {
    httpStatus: status,
    code: codeFor(status, providerType),
    providerType,
    message: message.slice(0, 300),
    retryable: status === 429 || status === 408 || status === 529 || status >= 500,
  };
}

/** Build an error body in the client's wire format (so SDKs surface it properly). */
export function errorBody(format: WireFormat | null, type: string, message: string): Obj {
  if (format === "anthropic_messages") return { type: "error", error: { type, message } };
  return { error: { message, type, code: type } };
}
