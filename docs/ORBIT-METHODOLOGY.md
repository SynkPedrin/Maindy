# ORBIT Engine — metodologia implementada

> Versão do método: `orbit-savings-v1` · tabela de preços: `2026-11-18` (`packages/orbit-engine/src/pricing.ts`).
> Este documento descreve **o que o código faz hoje**. O que ainda não existe está marcado como tal.

O ORBIT Engine é uma biblioteca pura em TypeScript (`packages/orbit-engine`) usada pelo gateway local da maindy. (`apps/gateway`, `127.0.0.1:8787`). Ela não faz I/O de rede. Cache e telemetria entram por *stores* injetáveis (SQLite no gateway).

## 1. As cinco etapas e as técnicas concretas

| Etapa | O que o código faz | Onde |
|---|---|---|
| **O — Observar** | Toda requisição gera um `RequestUsageEvent`, só com metadados (sem texto de prompt): provedor, modelo, tokens (input/output/cached/cache write), custo em micros, latência, status, hash do prompt, técnicas aplicadas e origem de cada número. Streams são medidos durante a passagem: chunk final de `include_usage` na OpenAI, `response.completed` no Responses, `message_start`/`message_delta` cumulativo na Anthropic. Também entram o Claude Code via OpenTelemetry (`claude_code.api_request`), o Codex via OTel (parser tolerante) e as cotas 5h/7d da status line. | `provider-adapters/src/sse.ts`, `usage.ts`; `gateway/src/proxy.ts`, `otlp.ts`, `statusline.ts` |
| **R — Reduzir** | `tool_output_compression`: remove ANSI, resolve redesenhos de progresso (`\r`), colapsa linhas idênticas consecutivas com contagem explícita, colapsa ≥ 4 linhas seguidas que só diferem em horário/UUID/ID hexadecimal longo (mantém a 1ª e a última na íntegra + contagem), encurta réguas decorativas longas no início da linha (`⎯⎯⎯⎯⎯⎯⎯⎯ Failed ⎯⎯⎯⎯⎯⎯⎯⎯` → `⎯⎯⎯ Failed ⎯⎯⎯`; barras de progresso e tabelas não casam) e deduplica stack traces idênticos. Só se o texto ainda for enorme (>400 linhas) mantém cabeça + cauda + linhas de erro, com o marcador `[maindy: N linhas omitidas]`. Nunca altera JSON nem blocos de código cercados. Só atua em resultados de ferramenta acima de 2.000 caracteres. `context_dedup` (v2): uma sequência contígua de linhas de uma mensagem do usuário ou saída de ferramenta que já apareceu, na mesma ordem, num único lugar anterior (mensagem anterior, system prompt ou antes na mesma mensagem) e tem **≥ 64 tokens** (tokenizador do modelo quando existe) vira `[maindy: conteúdo idêntico ao da mensagem #N acima, omitido (~T tokens; começa com "…")]`, desde que o marcador economize ≥ metade. Nunca edita system prompt, mensagens do assistente, a 1ª ocorrência de nada, blocos de código cercados (```) em mensagens do usuário, saídas de ferramenta que são JSON, argumentos de ferramentas nem imagens. A decisão depende só do conteúdo anterior, então cada mensagem é reescrita igual em todos os turnos seguintes (prefixo estável para o prompt caching do provedor). `exact_cache`: cache determinístico local, isolado por tenant + projeto + upstream. | `orbit-engine/src/techniques/compression.ts`, `dedup.ts`, `cache.ts` |
| **B — Balancear** | `prompt_cache_hints`: coloca `cache_control` da Anthropic num system prompt grande e estável, só quando o cliente ainda não usa. `output_budget`: só no modo Máximo e só se o cliente não definiu limite de saída. `model_routing`: desligado sem mapeamento explícito na política e nunca silencioso (header `x-maindy-routed-from` + registro da técnica). Upstream escolhido por header `x-maindy-upstream` ou por regras de prefixo do modelo (execução local via Ollama quando o usuário aponta para ela). | `techniques/body.ts`, `gateway/src/upstreams.ts` |
| **I — Inteligência adaptativa** | Motor de política: modo + estado por técnica (`enabled`, `rolledBack`) + rollbacks locais do Quality Guard decidem o que roda em cada requisição. A política vem da nuvem quando o dispositivo está vinculado (com cache local) ou de `policy.json` quando não está. `loop_guard` e `retry_budget` protegem contra loops de agente e *retry storms*. | `orbit-engine/src/policy.ts`, `techniques/guards.ts`, `gateway/src/policy.ts` |
| **T — Testar** | Quality Guard (seção 4): amostragem *shadow* pareada, avaliadores, detecção de regressão por técnica com rollback automático e `fallback_original`. Benchmark reproduzível contra modelo real em `docs/evidence/orbit-benchmark.md`. | `orbit-engine/src/quality.ts`, `apps/gateway/bench` |

Ainda **não implementado** (não anunciar como existente): cache semântico (o enum existe, mas a técnica nunca roda), batch/flex assíncrono, recuperação de contexto orientada à tarefa, memória versionada.

## 2. Modos

| Modo | Técnicas ativas por padrão (`MODE_DEFAULT_TECHNIQUES`) | Comportamento |
|---|---|---|
| **Observar** (`observe`) | nenhuma | Passthrough puro + medição. O corpo enviado ao provedor é byte a byte o do cliente (há teste disso). É o padrão em instalação nova. |
| **Conservador** | `exact_cache`, `loop_guard` (só avisa), `retry_budget` | Não reescreve nenhum texto. |
| **Equilibrado** | + `tool_output_compression`, `context_dedup`, `prompt_cache_hints`; `loop_guard` bloqueia a partir de 8 repetições idênticas em 60 s | Reescreve somente saídas de ferramenta, blocos duplicados e marcação de cache. |
| **Máximo** | + `output_budget`, `model_routing` (só com mapeamento) ; `loop_guard` bloqueia a partir de 6 | |

**Pausa** (`POST /maindy/pause`) vale na hora, sobrepõe qualquer política e é *fail-open*: a requisição original segue sem otimização, mas continua medida.

Regras do cache exato (na dúvida, não usar): exige `temperature: 0` explícito, porque o padrão dos provedores não é determinístico. Não é usado com `x-maindy-no-cache`, com `n > 1`, com ferramentas cujo nome sugere efeito colateral (`send_email`, `delete_*`, `bash`…), com ferramentas embutidas dinâmicas (web search, code interpreter…) nem com texto dependente do relógio ("agora", "hoje", "now", "today"…). Streams em cache são reproduzidos como SSE.

## 3. Proveniência das medições

Todo número carrega `MeasurementSource`:

- `provider_reported`: tokens do objeto `usage` do provedor e o custo `cost_usd` do OTel do Claude Code. Este último é uma estimativa a preço de lista feita pelo próprio Claude Code, não fatura, e vai marcado com `pricingVersion: "claude-code-otel-list-estimate"`.
- `locally_measured`: custo calculado pela maindy (tokens × tabela de preços versionada), contagem o200k para modelos OpenAI e latência. Ollama/local: custo 0 com essa origem.
- `experimentally_estimated`: toda economia, porque é contrafactual. Também tokens contados em modelos sem tokenizador local (Claude, Qwen…): usamos o o200k como *proxy* (`o200k_proxy`; acima de 200 mil caracteres, 3,6 caracteres/token). No benchmark o proxy ficou 1–5% abaixo da contagem do Ollama/qwen (conservador), contra −50%…+22% da regra de caracteres e o custo equivalente do Codex a preço de lista (`<versão>:codex-list-equivalent`).
- `unavailable`: modelo fora da tabela, uso ausente. A UI mostra "indisponível" e nunca um número inventado.

Dinheiro sempre em micros inteiros (1 USD = 1.000.000). Os preços têm até 3 casas e são calculados em mili-micros, com um único arredondamento.

## 4. Linhas de base (`baselineMethod`) e economia

Implementado em `orbit-engine/src/savings.ts` (definições do §6 da arquitetura):

| Método | Quando | Baseline |
|---|---|---|
| `cache_replay` | hit do cache exato | custo da resposta original armazenada, com seus tokens reais e seu próprio split de tokens em cache, a preço vigente |
| `pre_optimization_tokens` | compressão/dedup removeram tokens | uso real + tokens removidos somados como input **não cacheado**; o cache que o provedor aplicou continua aplicado |
| `pre_optimization_tokens` (dica de cache) | a maindy adicionou `cache_control` onde o cliente não tinha | todos os tokens do prompt sem cache. Pode dar economia **negativa** na 1ª chamada (prêmio de escrita), e isso é reportado |
| `paired_sample` | amostra shadow do Quality Guard | custo medido da requisição original enviada em paralelo |
| `none` | todo o resto | não entra na economia |

- `gross = baseline − custo_otimizado` (só eventos com baseline válido)
- `net = baseline − (custo_otimizado + overhead)`, onde overhead inclui o custo das amostras shadow. O resumo subtrai o overhead de **todos** os eventos (conservador).
- `efficiencyMultiplier = baseline / (otimizado + overhead)`: `null` sem baseline, com denominador zero ou quando a qualidade não está aprovada (houve rollback).
- `baselineCoverage` mostra a fração de requisições que têm baseline válido.
- Idempotência: eventos são deduplicados por `eventId`, e o OTel usa um UUID estável derivado do `request_id`. Se a mesma requisição foi medida pelo proxy, o OTel do Claude Code é ignorado.

**Descontos nativos nunca contam como economia maindy.** Prompt caching que o cliente ou o provedor já faria fica dos dois lados da subtração (há testes específicos). Uma requisição local (Ollama) tem baseline em dinheiro igual a 0: tokens evitados são registrados, dinheiro economizado não.

## 5. Quality Guard e rollback

- **Amostragem shadow** (`qualitySampleRate` da política, padrão 5%): em requisições não-stream cujo texto foi alterado (compressão, dedup, orçamento de saída, roteamento) ou que foram servidas do cache, o gateway reenvia a requisição **original** em segundo plano. O custo dela vira `overheadCost` e o baseline passa a ser `paired_sample`.
- **Avaliadores**: `schema_valid` quando o pedido exigia JSON (valida um subconjunto de JSON Schema); `exact_match` para respostas determinísticas idênticas; `reference_similarity` (F1 de sobreposição de tokens, limiar 0,6) nos demais casos. Os resultados viram `QualityEvaluationEvent` e vão para `/v1/telemetry/quality`.
- **Regressão**: janela móvel de 20 avaliações por técnica. Com pelo menos 5 amostras e taxa de falha acima de 20%, a técnica é desligada localmente na hora (persistido) e o rollback é reportado à nuvem (`/v1/orbit/rollback`).
- **`fallback_original`**: se uma técnica lança erro ou passa do orçamento de latência (`maxAddedLatencyMs`, padrão 50 ms), o corpo original é enviado intacto (`fallbackOriginal: true`, `status: "fallback"`).

## 6. O que NÃO afirmamos

- Não afirmamos economia em dinheiro sem baseline válido, nem para execução local (custo de API zero não é "economia").
- A tabela de preços é de **lista**. Descontos contratuais, impostos e câmbio não estão incluídos.
- Não aumentamos cota oficial de assinatura, não lemos o endpoint interno do `/usage` e não reutilizamos login de assinatura (Claude/ChatGPT) como API.
- Os números do benchmark (`docs/evidence/orbit-benchmark.md`) valem para aquelas cargas, naquele modelo, com contexto de 4K. São evidência do mecanismo, não promessa de percentual para outro uso.
- `tokensSaved` de compressão/dedup em modelos não-OpenAI é estimativa (o200k como proxy do tokenizador do fornecedor). Quando há medição do provedor (benchmark, `paired_sample`), ela prevalece.
- Cache semântico, batch e roteamento automático sem regra explícita não existem.
