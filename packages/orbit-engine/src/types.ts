import type { MeasurementSource, TechniqueApplication, TechniqueName } from "@maindy/contracts";

/** Wire formats the gateway understands. Kept structurally identical to provider-adapters' WireFormat. */
export type WireFormat = "openai_chat" | "openai_responses" | "anthropic_messages";

export type SlotKind = "system" | "developer" | "user" | "assistant" | "tool_result";

/**
 * A mutable view over one text field of a request body (built by provider-adapters).
 * Techniques read `text` and call `set()` — they never need to know the wire format.
 */
export interface TextSlot {
  /** position of the owning message in the conversation (0-based) */
  messageIndex: number;
  kind: SlotKind;
  text: string;
  set(next: string): void;
}

export function application(
  name: TechniqueName,
  applied: boolean,
  tokensSaved: number,
  source: MeasurementSource,
  detail?: string,
): TechniqueApplication {
  const app: TechniqueApplication = { name, applied, tokensSaved: Math.max(0, Math.round(tokensSaved)), source };
  if (detail) app.detail = detail.slice(0, 300);
  return app;
}

export type JsonObject = Record<string, unknown>;

export function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
