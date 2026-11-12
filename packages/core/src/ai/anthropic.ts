import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ModelConfig, ModelSpec } from './models.js';
import { estimateCostUsd } from './models.js';
import {
  AIUnavailableError,
  type AIProvider,
  type AgentInput,
  type AgentResponse,
  type StructuredInput,
  type ToolHandler,
  type UsageInfo,
} from './provider.js';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_TOOL_ROUNDS = 6;

/**
 * Claude provider (official Anthropic TypeScript SDK).
 * - adaptive thinking is always on for the Opus 5.5 family; depth is set with output_config.effort
 * - server-side refusal fallbacks (`fallbacks: "default"`) are enabled where the model supports them
 * - prompt caching on the stable system prefix
 * - typed SDK errors are mapped to AIUnavailableError (retryable or not)
 */
export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';
  readonly configured: boolean;
  private readonly client: Anthropic | null;

  constructor(private readonly config: ModelConfig, apiKey: string | undefined, clientOptions: { fetch?: typeof fetch; baseURL?: string } = {}) {
    this.configured = Boolean(apiKey && apiKey.trim());
    this.client = this.configured
      ? new Anthropic({ apiKey: apiKey!.trim(), timeout: config.timeoutMs, maxRetries: config.maxRetries, ...clientOptions })
      : null;
  }

  get modelId(): string | null {
    return this.configured ? this.config.primary.id : null;
  }

  private requireClient(): Anthropic {
    if (!this.client) throw new AIUnavailableError('ANTHROPIC_API_KEY is not configured', false);
    return this.client;
  }

  private usageFrom(spec: ModelSpec, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }, model?: string): UsageInfo {
    const u = { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens ?? 0 };
    return { model: model ?? spec.id, ...u, costUsd: estimateCostUsd(spec, u) };
  }

  private mapError(err: unknown): never {
    if (err instanceof AIUnavailableError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AIUnavailableError('Claude rejected the API credentials', false);
    }
    if (err instanceof Anthropic.BadRequestError) throw new AIUnavailableError(`Claude bad request: ${err.message}`, false);
    if (err instanceof Anthropic.RateLimitError) throw new AIUnavailableError('Claude rate limit reached', true);
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AIUnavailableError('Claude request timed out', true);
    if (err instanceof Anthropic.APIConnectionError) throw new AIUnavailableError('Could not reach Claude', true);
    if (err instanceof Anthropic.APIError) throw new AIUnavailableError(`Claude API error ${err.status ?? ''}`.trim(), (err.status ?? 500) >= 500);
    throw err;
  }

  private systemBlocks(input: AgentInput): Anthropic.Beta.BetaTextBlockParam[] {
    const blocks: Anthropic.Beta.BetaTextBlockParam[] = [];
    if (input.systemStable) blocks.push({ type: 'text', text: input.systemStable, cache_control: { type: 'ephemeral' } });
    blocks.push({ type: 'text', text: input.system });
    return blocks;
  }

  async generateResponse(input: AgentInput, onToolCall?: ToolHandler): Promise<AgentResponse> {
    const client = this.requireClient();
    const spec = this.config.primary;
    const tools: Anthropic.Beta.BetaTool[] = (input.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      strict: true,
    }));
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...input.history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.Beta.BetaMessageParam),
      { role: 'user', content: input.userMessage },
    ];
    const usage: UsageInfo[] = [];
    let text = '';

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await client.beta.messages.create(
          {
            model: spec.id,
            max_tokens: input.maxOutputTokens ?? this.config.maxOutputTokens,
            system: this.systemBlocks(input),
            messages,
            ...(tools.length ? { tools } : {}),
            output_config: { effort: input.effort ?? 'medium' },
            ...(spec.supportsFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
          },
          { signal: input.signal },
        );
        usage.push(this.usageFrom(spec, response.usage, response.model));

        if (response.stop_reason === 'refusal') {
          return { text: '', usage, stopReason: 'refusal', refused: true };
        }
        const roundText = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');
        if (roundText) text = roundText;

        const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
        if (response.stop_reason === 'pause_turn') {
          messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
          continue;
        }
        if (response.stop_reason !== 'tool_use' || toolUses.length === 0 || !onToolCall) {
          return { text, usage, stopReason: response.stop_reason ?? 'end_turn', refused: false };
        }
        messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
        const results = await Promise.all(
          toolUses.map(async (tu): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
            try {
              const r = await onToolCall({ id: tu.id, name: tu.name, input: tu.input });
              return { type: 'tool_result', tool_use_id: tu.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
            } catch (err) {
              return { type: 'tool_result', tool_use_id: tu.id, content: `Erro ao executar: ${(err as Error).message}`, is_error: true };
            }
          }),
        );
        messages.push({ role: 'user', content: results });
      }
      return { text: text || '', usage, stopReason: 'max_tool_rounds', refused: false };
    } catch (err) {
      this.mapError(err);
    }
  }

  async generateStructuredOutput<T>(input: StructuredInput<T>): Promise<{ data: T; usage: UsageInfo[] }> {
    const client = this.requireClient();
    const spec = input.fast ? this.config.fast : this.config.primary;
    try {
      const response = await client.messages.parse(
        {
          model: spec.id,
          max_tokens: 4_000,
          system: input.system,
          messages: [{ role: 'user', content: input.prompt }],
          output_config: { format: zodOutputFormat(input.schema as never), effort: 'low' },
        },
        { signal: input.signal },
      );
      const usage = [this.usageFrom(spec, response.usage, response.model)];
      if (response.stop_reason === 'refusal' || response.parsed_output == null) {
        throw new AIUnavailableError('Claude returned no structured output', false);
      }
      return { data: response.parsed_output as T, usage };
    } catch (err) {
      this.mapError(err);
    }
  }

  async *streamResponse(input: AgentInput): AsyncIterable<string> {
    const client = this.requireClient();
    const spec = this.config.primary;
    try {
      const stream = client.messages.stream(
        {
          model: spec.id,
          max_tokens: input.maxOutputTokens ?? this.config.maxOutputTokens,
          system: this.systemBlocks(input) as Anthropic.TextBlockParam[],
          messages: [
            ...input.history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
            { role: 'user', content: input.userMessage },
          ],
          output_config: { effort: input.effort ?? 'medium' },
        },
        { signal: input.signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
      }
    } catch (err) {
      this.mapError(err);
    }
  }
}
