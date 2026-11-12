import type { z } from 'zod';

/** Provider-neutral AI abstraction. Only the backend ever instantiates providers. */

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema object (additionalProperties: false, all required) */
  inputSchema: Record<string, unknown>;
}

export interface AgentTurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentInput {
  system: string;
  /** stable part of the system prompt, cacheable */
  systemStable?: string;
  history: AgentTurnMessage[];
  userMessage: string;
  tools?: ToolSpec[];
  effort?: 'low' | 'medium' | 'high';
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface UsageInfo {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface AgentResponse {
  text: string;
  usage: UsageInfo[];
  stopReason: string;
  refused: boolean;
}

/** Executes a tool call and returns the result that is sent back to the model. */
export type ToolHandler = (call: ToolCall) => Promise<{ content: string; isError?: boolean }>;

export interface StructuredInput<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  fast?: boolean;
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly id: string;
  readonly configured: boolean;
  readonly modelId: string | null;
  /** single response, optionally running a tool loop through `onToolCall` */
  generateResponse(input: AgentInput, onToolCall?: ToolHandler): Promise<AgentResponse>;
  generateStructuredOutput<T>(input: StructuredInput<T>): Promise<{ data: T; usage: UsageInfo[] }>;
  streamResponse(input: AgentInput): AsyncIterable<string>;
}

export class AIUnavailableError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'AIUnavailableError';
  }
}
