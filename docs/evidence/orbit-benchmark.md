# Benchmark ORBIT — evidência reproduzível

> Gerado por `pnpm --filter @maindy/gateway bench` em 2026-11-18T13:33:01.755Z. Arquivo bruto: `docs/evidence/orbit-benchmark.json`.

## Como foi medido

- Mesmas requisições (geradas deterministicamente, `temperature: 0`) enviadas pelo gateway maindy. duas vezes contra **Ollama real** (`qwen3.5:4b`, Ollama 0.40.16, contexto 4096 tokens): primeiro em modo **Observar** (linha de base, passthrough puro) e depois em modo **Equilibrado**. Cada modo usa um `MAINDY_HOME` novo (cache vazio).
- **Tokens**: os do próprio Ollama (`prompt_tokens`/`completion_tokens` = `prompt_eval_count`/`eval_count`), origem `provider_reported`. Em hit de cache o provedor não processa nada (0 tokens).
- **Latência**: medida no cliente, ponta a ponta através do gateway.
- **Qualidade**: asserções específicas da tarefa (ex.: o modelo ainda encontra o arquivo de teste que falhou) nos dois modos; hits de cache comparados byte a byte com a primeira resposta.
- **Dinheiro = SIMULAÇÃO DE PREÇO**: tokens medidos × preço de lista (tabela `2026-11-18`) de `claude-sonnet-5-5` e `gpt-6.2-sol`, sem prompt caching do provedor em nenhum dos lados. Os dois modelos têm o mesmo preço de lista (US$ 2 de entrada e US$ 10 de saída por 1M tokens), por isso as colunas coincidem. O Ollama em si custa US$ 0; nenhum valor abaixo foi cobrado de ninguém.
- Shadow sampling do Quality Guard desligado (`qualitySampleRate: 0`) para não misturar chamadas extras na contagem; a qualidade foi medida pelas asserções.

## Resultado por carga de trabalho

| Carga | Req. | Tokens (Observar → Equilibrado) | Redução de tokens | Hits de cache | Latência total | Qualidade (asserções O / E) | Hits idênticos | Simulação Sonnet 5.5 | Simulação GPT-6.2 Sol |
|---|---|---|---|---|---|---|---|---|---|
| Agente de código com saídas de ferramenta grandes e repetitivas | 3 | 7698 → 3995 | **48.1%** (entrada 48.2%) | 0 | 18001 → 13785 ms (23.4%) | 3/3 / 3/3 | 0/0 | US$ 0.015524 → US$ 0.008118 (47.7%) | US$ 0.015524 → US$ 0.008118 (47.7%) |
| Agente que reenvia requisições determinísticas idênticas | 9 | 546 → 304 | **44.3%** (entrada 44.2%) | 4 | 5446 → 3119 ms (42.7%) | 9/9 / 9/9 | 4/4 | US$ 0.001260 → US$ 0.000696 (44.8%) | US$ 0.001260 → US$ 0.000696 (44.8%) |
| Chat multi-turno com o mesmo documento colado várias vezes | 4 | 2330 → 1697 | **27.2%** (entrada 27.9%) | 0 | 14353 → 7195 ms (49.9%) | 3/3 / 3/3 | 0/0 | US$ 0.005156 → US$ 0.003890 (24.6%) | US$ 0.005156 → US$ 0.003890 (24.6%) |
| Controle: prompts curtos e únicos (ORBIT não deve ajudar) | 6 | 202 → 202 | **0%** (entrada 0%) | 0 | 15584 → 7052 ms (54.7%) | 6/6 / 6/6 | 0/0 | US$ 0.000884 → US$ 0.000884 (0%) | US$ 0.000884 → US$ 0.000884 (0%) |

**Total (todas as cargas):** 10776 → 6198 tokens (42.5%). **Sem o controle:** 10574 → 5996 (43.3%). O total depende da mistura de cargas escolhida aqui; não é uma promessa de economia para outro perfil de uso.

## Leitura honesta

### Agente de código com saídas de ferramenta grandes e repetitivas (`coding_agent_tool_logs`)

- Expectativa declarada antes de rodar: tool_output_compression reduz tokens de entrada (ANSI, redraws de progresso, linhas repetidas, stack traces idênticos); o modelo deve continuar achando as respostas.
- Técnicas efetivamente aplicadas no modo Equilibrado: tool_output_compression.
- Tokens de entrada medidos pelo Ollama: 7682 → 3979 (48.2%); saída: 16 → 16.
- Estimativa do próprio gateway (o200k como proxy do tokenizador para modelos não-OpenAI): 3605 tokens removidos; diferença medida pelo provedor: 3703. A medida do provedor é a que vale.
- Qualidade: asserções 3/3 (Observar) vs 3/3 (Equilibrado); respostas idênticas às do modo Observar: 3/3; hits de cache idênticos: 0/0.
- Diagnóstico (análise pós-execução, sem alterar carga nem limiares): até a rodada 2 a contagem do gateway para modelos não-OpenAI era a regra de 3,6 caracteres/token, que subestimou a redução real destes logs (ANSI e spinners custam mais tokens) e, numa execução intermediária desta versão (3b), superestimou em 22% a do `context_dedup` no documento em português. Agora o gateway usa o o200k como proxy, que ficou 1–5% abaixo do medido pelo Ollama nas duas cargas. O ganho extra desta rodada vem das réguas decorativas longas do vitest (`⎯⎯⎯…[1/1]⎯`), presentes nas etapas 2 e 3.

### Agente que reenvia requisições determinísticas idênticas (`repeated_deterministic_requests`)

- Expectativa declarada antes de rodar: exact_cache serve as repetições localmente (0 tokens no provedor) com conteúdo idêntico ao original.
- Técnicas efetivamente aplicadas no modo Equilibrado: exact_cache.
- Tokens de entrada medidos pelo Ollama: 525 → 293 (44.2%); saída: 21 → 11.
- Qualidade: asserções 9/9 (Observar) vs 9/9 (Equilibrado); respostas idênticas às do modo Observar: 9/9; hits de cache idênticos: 4/4.
- Requisições em que o cache foi recusado (`bypass`): ticket1_round1, ticket1_round2, ticket1_round3.
- Diagnóstico (análise pós-execução, sem alterar carga nem limiares): o ticket 1 ("...charged twice for my subscription this month...") contém "this month", que a regra de conteúdo dependente do tempo trata como dinâmico. Por isso as 3 repetições dele foram ao provedor. É um falso positivo conservador: na dúvida, a maindy não usa o cache.

### Chat multi-turno com o mesmo documento colado várias vezes (`multiturn_duplicated_context`)

- Expectativa declarada antes de rodar: context_dedup substitui as cópias repetidas do documento por uma referência à primeira; respostas devem continuar corretas.
- Técnicas efetivamente aplicadas no modo Equilibrado: context_dedup.
- Tokens de entrada medidos pelo Ollama: 2268 → 1635 (27.9%); saída: 62 → 62.
- Estimativa do próprio gateway (o200k como proxy do tokenizador para modelos não-OpenAI): 630 tokens removidos; diferença medida pelo provedor: 633. A medida do provedor é a que vale.
- Qualidade: asserções 3/3 (Observar) vs 3/3 (Equilibrado); respostas idênticas às do modo Observar: 4/4; hits de cache idênticos: 0/0.
- Diagnóstico (análise pós-execução, sem alterar carga nem limiares): na rodada 2 o documento repetido (~1.070 caracteres) ficou abaixo do limiar fixo de 1.200 caracteres do `context_dedup` v1 e nada foi substituído (0%). O `context_dedup` v2 mede o bloco repetido em tokens (mínimo 64) e casa linhas contíguas, então as cópias coladas de novo viram uma referência explícita à 1ª ocorrência. A carga e o documento não mudaram entre as rodadas.

### Controle: prompts curtos e únicos (ORBIT não deve ajudar) (`control_unique_short`)

- Expectativa declarada antes de rodar: nenhuma técnica se aplica (sem repetição, sem saídas de ferramenta, sem duplicação): economia ~0. Serve para mostrar que o método não infla números.
- Técnicas efetivamente aplicadas no modo Equilibrado: nenhuma.
- Tokens de entrada medidos pelo Ollama: 142 → 142 (0%); saída: 60 → 60.
- Qualidade: asserções 6/6 (Observar) vs 6/6 (Equilibrado); respostas idênticas às do modo Observar: 6/6; hits de cache idênticos: 0/0.
- Economia ~0, como esperado: não há redundância para remover, e o método não gera números do nada.

## Requisição a requisição

| Modo | Carga / requisição | Cache | Entrada | Saída | Latência (ms) | Técnicas aplicadas | Asserção |
|---|---|---|---|---|---|---|---|
| observe | coding_agent_tool_logs/step1_install | disabled | 1381 | 4 | 4100 | — | ok |
| observe | coding_agent_tool_logs/step2_tests | disabled | 2756 | 7 | 7434 | — | ok |
| observe | coding_agent_tool_logs/step3_retry | disabled | 3545 | 5 | 6467 | — | ok |
| observe | repeated_deterministic_requests/ticket1_round1 | disabled | 59 | 2 | 1351 | — | ok |
| observe | repeated_deterministic_requests/ticket2_round1 | disabled | 61 | 2 | 265 | — | ok |
| observe | repeated_deterministic_requests/ticket3_round1 | disabled | 55 | 3 | 405 | — | ok |
| observe | repeated_deterministic_requests/ticket1_round2 | disabled | 59 | 2 | 679 | — | ok |
| observe | repeated_deterministic_requests/ticket2_round2 | disabled | 61 | 2 | 644 | — | ok |
| observe | repeated_deterministic_requests/ticket3_round2 | disabled | 55 | 3 | 574 | — | ok |
| observe | repeated_deterministic_requests/ticket1_round3 | disabled | 59 | 2 | 475 | — | ok |
| observe | repeated_deterministic_requests/ticket2_round3 | disabled | 61 | 2 | 489 | — | ok |
| observe | repeated_deterministic_requests/ticket3_round3 | disabled | 55 | 3 | 564 | — | ok |
| observe | multiturn_duplicated_context/turn1 | disabled | 303 | 43 | 5401 | — | — |
| observe | multiturn_duplicated_context/turn2 | disabled | 348 | 14 | 2376 | — | ok |
| observe | multiturn_duplicated_context/turn3_dup | disabled | 658 | 3 | 3386 | — | ok |
| observe | multiturn_duplicated_context/turn4_dup2 | disabled | 959 | 2 | 3190 | — | ok |
| observe | control_unique_short/unique1 | disabled | 25 | 2 | 3669 | — | ok |
| observe | control_unique_short/unique2 | disabled | 28 | 3 | 2021 | — | ok |
| observe | control_unique_short/unique3 | disabled | 21 | 3 | 1854 | — | ok |
| observe | control_unique_short/unique4 | disabled | 25 | 2 | 1723 | — | ok |
| observe | control_unique_short/unique5 | disabled | 19 | 48 | 5081 | — | ok |
| observe | control_unique_short/unique6 | disabled | 24 | 2 | 1236 | — | ok |
| balanced | coding_agent_tool_logs/step1_install | miss | 628 | 4 | 3061 | tool_output_compression(715) | ok |
| balanced | coding_agent_tool_logs/step2_tests | miss | 1407 | 7 | 5497 | tool_output_compression(1336) | ok |
| balanced | coding_agent_tool_logs/step3_retry | miss | 1944 | 5 | 5227 | tool_output_compression(1554) | ok |
| balanced | repeated_deterministic_requests/ticket1_round1 | bypass | 59 | 2 | 1470 | — | ok |
| balanced | repeated_deterministic_requests/ticket2_round1 | miss | 61 | 2 | 278 | — | ok |
| balanced | repeated_deterministic_requests/ticket3_round1 | miss | 55 | 3 | 392 | — | ok |
| balanced | repeated_deterministic_requests/ticket1_round2 | bypass | 59 | 2 | 709 | — | ok |
| balanced | repeated_deterministic_requests/ticket2_round2 | hit | 0 | 0 | 16 | exact_cache(63) | ok |
| balanced | repeated_deterministic_requests/ticket3_round2 | hit | 0 | 0 | 5 | exact_cache(58) | ok |
| balanced | repeated_deterministic_requests/ticket1_round3 | bypass | 59 | 2 | 242 | — | ok |
| balanced | repeated_deterministic_requests/ticket2_round3 | hit | 0 | 0 | 4 | exact_cache(63) | ok |
| balanced | repeated_deterministic_requests/ticket3_round3 | hit | 0 | 0 | 3 | exact_cache(58) | ok |
| balanced | multiturn_duplicated_context/turn1 | miss | 303 | 43 | 4109 | — | — |
| balanced | multiturn_duplicated_context/turn2 | miss | 348 | 14 | 1282 | — | ok |
| balanced | multiturn_duplicated_context/turn3_dup | miss | 447 | 3 | 1025 | context_dedup(210) | ok |
| balanced | multiturn_duplicated_context/turn4_dup2 | miss | 537 | 2 | 779 | context_dedup(420) | ok |
| balanced | control_unique_short/unique1 | miss | 25 | 2 | 807 | — | ok |
| balanced | control_unique_short/unique2 | miss | 28 | 3 | 752 | — | ok |
| balanced | control_unique_short/unique3 | miss | 21 | 3 | 463 | — | ok |
| balanced | control_unique_short/unique4 | miss | 25 | 2 | 605 | — | ok |
| balanced | control_unique_short/unique5 | miss | 19 | 48 | 3908 | — | ok |
| balanced | control_unique_short/unique6 | miss | 24 | 2 | 517 | — | ok |

## Histórico de rodadas

- **Rodada 1** (`orbit-benchmark-run1-coldstart.json`, mesmas cargas): no modo Equilibrado a 1ª requisição comprimível (`coding_agent_tool_logs/step1_install`) caiu em `fallback_original`. A primeira compressão num processo recém-iniciado (JIT) passou do orçamento de latência de 50 ms, e o corpo original foi enviado intacto, que é o comportamento fail-open esperado. Correção de engenharia: aquecimento do motor ao iniciar o gateway (`warmEngine()` em `apps/gateway/src/server.ts`), com texto sintético. As cargas não foram alteradas entre as rodadas. Nessa rodada a carga 1 teve redução de 36,8%.
- **Rodada 2** (`orbit-benchmark-run2-dedup-v1.json`, 2026-11-18T04:28:35.726Z, commit 742a7e6): `context_dedup` v1 (limiar fixo de 1.200 caracteres), compressão sem colapso de linhas quase idênticas nem encurtamento de réguas decorativas. Mesmas cargas, mesmo modelo.
- **Rodada 3a** (`orbit-benchmark-run3a-fallback.json`, código desta rodada, mas ainda com a contagem não-OpenAI pela regra de caracteres): rodou com a máquina sob carga (outro processo pesado + arquivos de `node_modules` sendo rebaixados do iCloud). A requisição `coding_agent_tool_logs/step3_retry` passou do orçamento de 50 ms do motor e caiu em `fallback_original` (corpo original enviado, 0 economia nela; fail-open correto). Reproduzida isoladamente, a mesma otimização leva 0–2 ms. A rodada foi repetida com a máquina normal; os números abaixo e acima são dessa repetição. Na 3a, as demais requisições tiveram os mesmos tokens desta rodada.
- **Rodada 3b** (`orbit-benchmark-run3b-char-estimate.json`): repetição com a máquina normal, ainda com a regra de 3,6 caracteres/token para estimar tokens não-OpenAI no gateway. Tokens medidos pelo Ollama e respostas idênticos aos desta rodada, requisição a requisição; só a estimativa do próprio gateway mudou (dedup: 774 estimados vs 633 medidos, +22%; logs: 2.106 vs 3.703, −43%). Por isso o gateway passou a usar o o200k como proxy.
- **Esta rodada**: `context_dedup` v2 (limiar em tokens, linhas contíguas, referência explícita) + colapso de linhas que só diferem em horário/IDs + encurtamento de réguas decorativas longas.

| Carga | Observar | Equilibrado (rodada 2) | Redução (rodada 2) | Equilibrado (esta) | Redução (esta) | Qualidade E (rodada 2 → esta) |
|---|---|---|---|---|---|---|
| Agente de código com saídas de ferramenta grandes e repetitivas | 7698 / 7698 | 4109 | 46.6% | 3995 | 48.1% | 3/3 → 3/3 |
| Agente que reenvia requisições determinísticas idênticas | 546 / 546 | 304 | 44.3% | 304 | 44.3% | 9/9 → 9/9 |
| Chat multi-turno com o mesmo documento colado várias vezes | 2330 / 2330 | 2330 | 0% | 1697 | 27.2% | 3/3 → 3/3 |
| Controle: prompts curtos e únicos (ORBIT não deve ajudar) | 202 / 202 | 202 | 0% | 202 | 0% | 6/6 → 6/6 |

Total: rodada 2 10776 → 6945 (35.6%); esta rodada 10776 → 6198 (42.5%). A coluna Observar mostra "rodada 2 / esta" — é a mesma linha de base, medida de novo.

## Limitações

- Contexto do Ollama limitado a 4096 tokens: as saídas de ferramenta foram dimensionadas para caber (senão o Ollama trunca o prompt silenciosamente e a comparação deixa de valer). Logs reais de agentes costumam ser muito maiores; nesse regime o passo de cabeça+cauda (só acima de 400 linhas) nem chegou a ser acionado aqui.
- Modelo local pequeno (4B) e uma única rodada por modo; as respostas são determinísticas (`temperature: 0`), mas a latência varia com o reaproveitamento de KV-cache do Ollama entre requisições consecutivas (afeta os dois modos).
- Provedores reais têm prompt caching nativo (desconto em prefixos repetidos). A simulação de preço não aplica esse desconto em nenhum dos lados; com ele, a economia absoluta das cargas multi-turno seria menor. Descontos nativos nunca são contados como economia maindy.
- A carga de controle existe para mostrar o caso em que o ORBIT não ajuda; ela entra no total.

## Reproduzir

```bash
pnpm --filter @maindy/orbit-engine build && pnpm --filter @maindy/provider-adapters build
pnpm --filter @maindy/gateway bench   # requer Ollama em 127.0.0.1:11434 com qwen3.5:4b
```

Ambiente: darwin 25.6.0, Apple M5, Node v24.20.0, commit 742a7e6.
