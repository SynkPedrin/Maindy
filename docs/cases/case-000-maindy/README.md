# Case 0 · maindy. construindo a maindy.

**Status:** O · Observar concluído (baseline publicado). R e B em andamento a partir de 19/11/2026.
**Carga:** desenvolvimento do próprio produto com Claude Code (Claude Opus 5.5), um desenvolvedor, monorepo TypeScript.
**Dono da carga:** maindy. (consentimento: nosso). Nenhum texto de conversa ou código sai deste case; só agregados.

## O · Observar (baseline)

Período: **12/11/2026 a 18/11/2026**, 5 sessões do Claude Code neste repositório, nenhuma otimização ativa.
Dados: [`data/baseline-2026-11-18.json`](data/baseline-2026-11-18.json).

| Métrica | Valor | Origem |
|---|---|---|
| Requisições à API | 1.261 | reportado pelo provedor |
| Pedidos humanos (mensagens digitadas) | 43 | medido localmente |
| Requisições por pedido humano | 29,3 | medido localmente |
| Tokens de entrada (total) | 475,96 milhões | reportado pelo provedor |
| …dos quais leitura de cache | 471,79 milhões (**99,1%**) | reportado pelo provedor |
| …escrita de cache | 4,17 milhões | reportado pelo provedor |
| Tokens de saída | 1,56 milhão | reportado pelo provedor |
| **Contexto médio por requisição** | **377 mil tokens** | reportado pelo provedor |
| Custo a preço de lista | US$ 158,36 | estimado (tokens × tabela ORBIT 2026-11-18; não é fatura) |
| Custo a preço de lista por pedido humano | US$ 3,68 | estimado |

**Para onde vai o custo** (preço de lista): leitura de cache **59,5%**, escrita de cache 20,8%, saída 19,6%, entrada sem cache ~0%.

### Diagnóstico

1. **O desperdício está no contexto que cresce, não nos logs.** Quase todo token de entrada é o histórico da sessão sendo reenviado (do cache) a cada uma das ~29 chamadas que um pedido gera. Uma sessão longa chega a 400 mil tokens por chamada.
2. **A técnica que já temos para o Claude Code ajuda pouco nesta carga.** Reprocessamos offline as 960 saídas de Bash com o compressor real do ORBIT: 114 eram grandes (≥ 2.000 caracteres, ~118 mil tokens estimados), mas só 2 passariam no critério do hook (≥ 200 tokens e ≥ 15% de economia), somando ~1,8 mil tokens. Motivo provável: nossos comandos já filtram a saída (`tail`, `grep`, `head`).
3. **Quase não há roteamento de modelo.** 99% das requisições foram no Opus 5.5, inclusive buscas e leituras amplas que um modelo menor faria.

Isso já é um resultado útil: aponta onde o produto precisa evoluir para cargas de agente de código (orçamento de contexto, roteamento de subagentes), e não só compressão de saída.

## Intervenções (R · B)

Cada intervenção tem hipótese, métrica e critério de qualidade. Nada é declarado como resultado antes do período "depois" medido.

| # | Etapa | Intervenção | Hipótese | Métrica principal | Desde |
|---|---|---|---|---|---|
| R1 | Reduzir | **Higiene de contexto**: uma tarefa por sessão, `/clear` ao trocar de assunto, `/compact` ao passar de ~50% de contexto, leitura de arquivos por trecho. Regras em [`CLAUDE.md`](../../../CLAUDE.md). | Menos histórico reenviado por chamada | contexto médio por requisição (meta: < 200 mil) | 19/11/2026 |
| R2 | Reduzir | **Compressão de saída de ferramenta** ligada no gateway (`tool_output_compression`). | Ganho pequeno, mas custo zero e fail-open | tokens evitados pelo hook (contador do gateway) | pendente: ativar no painel `/app/orbit` |
| B1 | Balancear | **Buscas amplas em subagentes** (contexto separado), em vez de no contexto principal. | O contexto principal cresce mais devagar | contexto médio e requisições por pedido | 19/11/2026 |

## T · Testar (critério de qualidade)

A economia só vale se a entrega não piorar. Para este case:

- `pnpm typecheck` sem erros;
- E2E da landing (`apps/web/e2e/landing.spec.ts`) e testes da API/gateway passando;
- nenhuma regressão revertida por falta de contexto (registrar aqui se acontecer).

## Resultados

_Pendente: período "depois" a partir de 19/11/2026. Comparação por métrica normalizada (contexto médio por requisição, custo por requisição e custo por pedido humano)._

## O que pode ser dito publicamente hoje

- ✅ "Somos o case 0: medimos o nosso próprio uso de IA para construir a maindy. Em 7 dias, 99% dos tokens de entrada foram contexto reenviado."
- ✅ "Antes de otimizar, medimos. O baseline está publicado, com a origem de cada número."
- ❌ Qualquer percentual de economia: ainda não existe período "depois".

## Reproduzir

```bash
node scripts/cases/claude-code-baseline.mjs --until 2026-11-18T23:59:59Z --out docs/cases/case-000-maindy/data/baseline-2026-11-18.json
```
