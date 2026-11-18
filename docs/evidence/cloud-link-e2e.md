# Evidência — elo completo web → dispositivo → gateway → nuvem (2026-11-18)

Script reproduzível: `node scripts/e2e-cloud-link.mjs` (pré-requisitos no cabeçalho do script). Tudo real: API Fastify + Postgres, e-mail via SMTP/Mailpit, gateway (bundle) e **Ollama local `qwen3.5:4b`** como provedor.

## Bug encontrado e corrigido nesta rodada
Primeira execução: 19/24. Mudar o modo para **Equilibrado** via GET → alterar → PUT não ligava nenhuma técnica: a lista de técnicas reenviada (do modo Observar) sobrescrevia os padrões do novo modo. A mesma rota permitia que um cliente que reenviasse a política limpasse sem querer um rollback do Quality Guard.
Correção: `apps/api/src/routes/orbit.ts` só aplica as técnicas que **diferem do estado salvo**. Teste de regressão em `apps/api/test/features.test.ts` ("GET → modify → PUT round trip").

## Resultado final: 24/24
| Verificação | Resultado |
|---|---|
| cadastro → e-mail real no Mailpit → verificação cria sessão | PASS |
| pareamento: pending → aprovação web → token entregue **uma única vez** | PASS |
| política Equilibrado (v2) puxada da nuvem pelo gateway vinculado | PASS |
| 1ª chamada ao provedor: miss, 14,8 s · repetição: **cache hit idêntico, 0,9 s** | PASS |
| agente com log de 260 linhas: compressão aplicada e o modelo ainda identifica `discount.test.ts` | PASS |
| outbox esvaziado; nuvem registra 3 requisições, 1 cache hit, **498 tokens evitados** (`experimentally_estimated`) | PASS |
| técnicas registradas por evento: `exact_cache`, `tool_output_compression` | PASS |
| custo do Ollama = 0 e economia em dinheiro = 0 (nenhum valor inventado para execução local) | PASS |
| nenhum texto de prompt na API, no relatório ou no log do gateway | PASS |
| conta de teste removida (LGPD delete) | PASS |

Observação: a economia em **dinheiro** só aparece com provedores pagos (OpenAI/Anthropic), cujas chamadas reais dependem das chaves do cliente. A matemática de preço está coberta por testes com upstream simulado (`apps/gateway`, `packages/orbit-engine`).
