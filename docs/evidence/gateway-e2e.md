# Evidência — gateway maindy. de ponta a ponta

Data: 2026-11-18 · Node v24.20.0 · Ollama 0.40.16 · modelo `qwen3.5:4b` · gateway 0.1.0 (bundle `apps/gateway/dist/maindy-gateway.mjs`)

## 1. Ollama real através do bundle

```bash
pnpm --filter @maindy/orbit-engine build && pnpm --filter @maindy/provider-adapters build
pnpm --filter @maindy/gateway build            # esbuild → dist/maindy-gateway.mjs (arquivo único)
node apps/gateway/scripts/e2e-ollama.mjs --home <scratchpad>/e2e-home
```

O script sobe o **bundle** como processo filho (`--port 0 --home <dir>`) com política `conservative` (`qualitySampleRate: 0`). Depois envia ao Ollama, pelo gateway, uma chat completion não-stream e uma em stream (`temperature: 0`, `max_tokens: 32`, `reasoning_effort: "none"`, prompt com um marcador aleatório) e repete as duas.

Resultado (17/17 verificações PASS, exit 0):

| Verificação | Resultado |
|---|---|
| Gateway escuta só em 127.0.0.1 (porta aleatória lida de `runtime.json`) | PASS |
| non-stream 200 / stream 200 com SSE e `data: [DONE]` | PASS |
| Stream sem o chunk de usage injetado (o cliente não pediu `include_usage`) | PASS |
| 1ª chamada `x-maindy-cache: miss`, repetição `hit` (non-stream e stream) | PASS. Latência: miss 15,4 s (inclui carga do modelo) e 2,4 s; hit 36 ms e 750 ms (máquina com load average > 200) |
| Hit devolve conteúdo **idêntico** (JSON byte a byte; SSE byte a byte) | PASS |
| Uso medido pelo provedor nos misses | PASS: 35 tokens de entrada / 19 de saída, `provider_reported` |
| Custo 0 com origem `locally_measured`, `provider: "ollama"` | PASS |
| Eventos de hit no outbox com `baselineMethod: "cache_replay"` e `cache.status: "hit"` | PASS |
| Baseline do hit = 0 micros (execução local: nenhuma economia em dinheiro inventada; tokens evitados vão em `techniques[exact_cache].tokensSaved`) | PASS |
| Marcador do prompt **ausente** de `telemetry_outbox`, `quota_snapshots`, `kv`, `seen_request_ids`, `counters` | PASS |
| Marcador do prompt ausente de `gateway.log` e do stdout/stderr | PASS |
| `cache_entries` tem 2 linhas (corpos de **resposta**, nunca de requisição) | PASS |

Contadores no fim: `requests 4, cacheHits 2, tokensIn 70, tokensOut 38, tokensAvoided 108, pendingTelemetry 4`. Como o gateway não estava vinculado à nuvem, os eventos ficaram locais em `GET /maindy/events`.

Antes, uma rodada manual de fumaça com `curl` (non-stream + stream contra Ollama) confirmou a passagem chunk a chunk e a remoção do chunk de usage.

## 2. Upstreams OpenAI/Anthropic simulados (preços reais da tabela)

```bash
pnpm --filter @maindy/gateway test     # vitest: 25 testes, servidores HTTP mock locais
```

O que é verificado (`apps/gateway/test/gateway.test.ts`):

- **Matemática em micros** com `gpt-6.2-sol`: 10.000 de entrada (2.000 em cache) + 500 de saída = 8.000×2 + 2.000×0,10 + 500×10 = **21.200 micros**. Com `claude-sonnet-5-5`: 100 de entrada + 1.000 em cache + 50 de saída = **800 micros**. Stream OpenAI: 1.000×2 + 3×10 = 2.030 micros.
- **Chaves nunca logadas nem persistidas**: a chave BYOK (`OPENAI_API_KEY`) e a `x-api-key` do cliente não aparecem em `gateway.log`, `telemetry_outbox`, `kv` nem `seen_request_ids`. O prompt também não. Do lado do upstream, a chave chega intacta (BYOK injetada só quando o cliente não manda a própria; `x-api-key`/`anthropic-version`/`anthropic-beta`/`?beta=true` repassados verbatim).
- `include_usage` é injetado e o chunk extra + `"usage":null` são removidos quando o cliente não pediu. Quando o cliente pediu, o stream passa byte a byte.
- Cache exato: store → hit idêntico, com baseline `cache_replay` de 21.200 micros e `tokensSaved` de 10.500. Recusa (`bypass`) com `temperature` ausente e com `x-maindy-no-cache`. Stream reproduzido como SSE.
- Compressão (Equilibrado): o corpo enviado ao upstream encolhe, a linha `FAIL` é preservada, o marcador `[maindy: N linhas omitidas]` aparece, e `baseline − custo = tokensSaved × 2 micros` (preço de entrada sem cache).
- Modo Observar: corpo **byte-idêntico** ao do cliente.
- Pausa imediata e fail-open; retomada reativa o cache.
- Loop guard: a 8ª requisição idêntica no modo Equilibrado recebe 429 `maindy_loop_guard` e o evento sai com status `blocked`.
- Quality Guard: shadow pareado (overhead = 21.200 micros, baseline `paired_sample`). Respostas divergentes geram rollback local de `tool_output_compression` depois de 5 avaliações, e a requisição seguinte sai sem compressão.
- OTLP: `claude_code.api_request` vira evento `provider_reported` (custo 0,0123 → 12.300 micros, `pricingVersion: claude-code-otel-list-estimate`), com dedupe por `request_id`. É ignorado se o proxy já mediu o mesmo `request-id`. Codex tem parsing tolerante. Protobuf recebe 415.
- Status line → 2 `QuotaSnapshot` (`claude_code.statusline`), sem reenfileirar valores iguais. `/maindy/compress` respeita a política. `/maindy/events` e `/maindy/summary` funcionam em modo local.
- Telemetria: lote com `Bearer <device token>`, backoff depois de 503 e nenhum reenvio depois de 2xx.
- Arquivos `gateway.json`, `gateway.key`, `policy.json` e `gateway.db` criados com permissão 0600. `/maindy/*` exige `x-maindy-key`.

## 3. Benchmark do método

Ver `docs/evidence/orbit-benchmark.md` (Observar vs Equilibrado, Ollama real, 4 cargas incluindo controle).
