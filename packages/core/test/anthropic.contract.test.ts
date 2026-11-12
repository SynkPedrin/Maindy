/**
 * Contract test for AnthropicProvider: the HTTP layer is intercepted, so this verifies the exact
 * request we send to the Messages API and the tool loop — it does not claim the live API was called.
 */
import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/ai/anthropic.js';
import { resolveModelConfig } from '../src/ai/models.js';
import { AIUnavailableError } from '../src/ai/provider.js';
import { toolSpecs } from '../src/agent/tools.js';

function fakeFetch(responses: Array<{ status: number; body: unknown }>, seen: Array<{ url: string; headers: Record<string, string>; body: any }>): typeof fetch {
  let i = 0;
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    seen.push({ url: String(url), headers, body: init?.body ? JSON.parse(String(init.body)) : null });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }) as typeof fetch;
}

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const msg = (content: unknown[], stop_reason: string) => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, stop_sequence: null, usage });

describe('AnthropicProvider (contract)', () => {
  const config = resolveModelConfig({ MAINDY_AI_MAX_RETRIES: '0' });

  it('reports not configured without a key and never calls the network', async () => {
    const p = new AnthropicProvider(config, undefined);
    expect(p.configured).toBe(false);
    await expect(p.generateResponse({ system: 's', history: [], userMessage: 'oi' })).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it('sends the documented request shape and runs the tool loop', async () => {
    const seen: any[] = [];
    const f = fakeFetch(
      [
        { status: 200, body: msg([{ type: 'tool_use', id: 'tu_1', name: 'search_memories', input: { query: 'mãe', limit: null } }], 'tool_use') },
        { status: 200, body: msg([{ type: 'text', text: 'Depois das 18h.' }], 'end_turn') },
      ],
      seen,
    );
    const p = new AnthropicProvider(config, 'sk-ant-test', { fetch: f });
    const calls: string[] = [];
    const res = await p.generateResponse(
      { systemStable: 'regras', system: 'contexto', history: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], userMessage: 'Quando ligar pra mãe?', tools: toolSpecs(), effort: 'medium' },
      async (call) => {
        calls.push(call.name);
        return { content: '[{"title":"Mãe"}]' };
      },
    );
    expect(res.text).toBe('Depois das 18h.');
    expect(calls).toEqual(['search_memories']);
    expect(res.usage).toHaveLength(2);
    expect(res.usage[0]!.costUsd).toBeCloseTo((100 * 4 + 20 * 20) / 1e6);

    const first = seen[0];
    expect(first.url).toContain('/v1/messages');
    expect(first.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(first.body.model).toBe('claude-opus-5-5');
    expect(first.body.fallbacks).toBe('default');
    expect(first.body.output_config).toEqual({ effort: 'medium' });
    expect(first.body.thinking).toBeUndefined(); // Opus 5.5: adaptive by default, `disabled` would 400
    expect(first.body.system[0]).toMatchObject({ type: 'text', text: 'regras', cache_control: { type: 'ephemeral' } });
    expect(first.body.tools.every((t: any) => t.strict === true && t.input_schema.additionalProperties === false)).toBe(true);
    expect(first.body.tool_choice).toBeUndefined(); // forced tool_choice 400s on Opus 5.5
    // second round echoes the assistant turn and returns the tool_result
    const second = seen[1].body.messages;
    expect(second.at(-2).role).toBe('assistant');
    expect(second.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_1' });
  });

  it('maps a refusal and typed API errors', async () => {
    const seen: any[] = [];
    const refused = new AnthropicProvider(config, 'sk-ant-test', { fetch: fakeFetch([{ status: 200, body: msg([], 'refusal') }], seen) });
    expect((await refused.generateResponse({ system: 's', history: [], userMessage: 'x' })).refused).toBe(true);
    const limited = new AnthropicProvider(config, 'sk-ant-test', { fetch: fakeFetch([{ status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } } }], seen) });
    await expect(limited.generateResponse({ system: 's', history: [], userMessage: 'x' })).rejects.toMatchObject({ name: 'AIUnavailableError', retryable: true });
    const auth = new AnthropicProvider(config, 'sk-ant-bad', { fetch: fakeFetch([{ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'bad key' } } }], seen) });
    await expect(auth.generateResponse({ system: 's', history: [], userMessage: 'x' })).rejects.toMatchObject({ retryable: false });
  });
});
