# Provedores, Codex e preços — pesquisa 2026-11-18

> Preços mudam. A tabela versionada usada pelo motor fica em `packages/orbit-engine/src/pricing.ts` (`PRICING_VERSION`). Revalidar antes de cada release.

## Codex CLI (fontes: learn.chatgpt.com/docs/config-file/config-reference · /config-advanced · /app-server)
- OTel desligado por padrão; `[otel]` em `~/.codex/config.toml` (config de projeto ignora `otel`, `model_provider`, `openai_base_url`).
  `otel.exporter = { otlp-http = { endpoint = "...", protocol = "json", headers = {...} } }`; `otel.log_user_prompt` off por padrão (prompt redigido).
- Eventos: `codex.conversation_starts`, `codex.api_request`, `codex.sse_event` (contagem de tokens em `response.completed`), `codex.tool_result`, `codex.user_prompt`…
  INCERTO: nomes dos atributos de token (PR openai/codex#2103: `input_token_count`, `output_token_count`, `cached_token_count`, `reasoning_token_count`). Parser deve ser tolerante.
- App Server (JSON-RPC via stdio JSONL; `codex app-server`): `account/rateLimits/read` → `rateLimits{primary,secondary}{usedPercent,windowDurationMins,resetsAt}`; notificação `account/rateLimits/updated`; `thread/tokenUsage/updated`. Schemas por versão: `codex app-server generate-json-schema`. Integrações enterprise: contatar OpenAI (known clients list). Status: integrar como leitura opcional, feature flag.
- Gateway com API key: `model_providers.<id>.base_url` + `env_key`, `wire_api = "responses"` (único suportado). Login ChatGPT via proxy: NÃO documentado oficialmente → MAINDY não suporta.

## OpenAI Admin API (admin key)
- `GET /v1/organization/usage/completions` (bucket 1m/1h/1d; `input_tokens` inclui cached; `input_cached_tokens`, `output_tokens`, `num_model_requests`; group_by model/project_id/api_key_id…)
- `GET /v1/organization/costs` (1d; `amount.value`, `amount.currency` minúsculo)

## Anthropic Admin API (admin key `sk-ant-admin01-…` em `x-api-key`)
- Legacy (suportado; lag ~30 min): `GET /v1/organizations/usage_report/messages` (`uncached_input_tokens`, `cache_read_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`, `…_1h_…`, `output_tokens`), `GET /v1/organizations/cost_report` (`amount` string em CENTAVOS).
- Novo: `GET /v1/organizations/analytics/usage|cost` com `anthropic-beta: analytics-usage-cost-2026-08-24` (lag 4–24h).

## Preços de lista (USD / 1M tokens)
| Modelo | Input | Cache read | Cache write | Output |
|---|---|---|---|---|
| claude-opus-5-5 | 4 | 0.20 | 5 (5m) / 8 (1h) | 20 |
| claude-sonnet-5-5 | 2 | 0.10 | 2.50 / 4 | 10 |
| claude-haiku-5-5 (≤100K) | 0.10 | 0.01 | 0.125 / 0.20 | 0.50 |
| gpt-6.2-astra | 8 | 0.40 | 10 (30m) / 20 (12h) | 40 |
| gpt-6.2-sol | 2 | 0.10 | 2.50 / 5 | 10 |
| gpt-6.1-terra | 1 | 0.05 | 1.25 / 2.50 | 5 |
| gpt-6-luna | 0.10 | 0.01 | 0.125 / 0.25 | 0.50 |
| gpt-5.6-sol | 4 | 0.40 | 5 / 10 | 20 |
| gpt-5.4-mini | 0.75 | 0.075 | – | 4.50 |
- Batch: −50% (ambos). OpenAI long context (>272K) ≈ 2× input / 1.5× output. Haiku >100K: 0.50/0.05/0.625/2.50.
- Fontes: platform.claude.com/docs/en/about-claude/pricing · developers.openai.com/api/docs/pricing

## Streaming usage
- OpenAI chat: `stream_options.include_usage=true` → chunk final com `choices: []` e `usage{prompt_tokens, completion_tokens, prompt_tokens_details.cached_tokens, prompt_tokens_details.cache_write_tokens}`. Pode faltar se o stream for interrompido → usage `unavailable`/estimado.
- OpenAI Responses: `response.completed.response.usage{input_tokens, input_tokens_details.cached_tokens, output_tokens}`.
- Anthropic SSE: `message_start.message.usage{input_tokens, cache_creation_input_tokens, cache_read_input_tokens}`; `message_delta.usage.output_tokens` cumulativo (último é autoritativo).
