# Evidência — teste ao vivo pelo app desktop instalado (2026-11-18)

App: `/Applications/maindy.app` (build arm64 corrigido, gateway embutido com JIT entitlements), pareado com a conta `teste@maindy.local` (plano Pro, sandbox) pelo fluxo real de device code. Gateway do app vinculado à nuvem (`linkedToCloud=true`), política alternada pela API.
Executor: `MAINDY_COOKIE=… pnpm --filter @maindy/gateway exec tsx bench/live.ts` (mesmas cargas determinísticas de `bench/run.ts`, provedor real Ollama `qwen3.5:4b`).

| Carga | Tokens Observar | Tokens Equilibrado | Redução | Qualidade (obs / eq) |
|---|---|---|---|---|
| Agente de código com saídas de ferramenta grandes e repetitivas | 7.698 | 4.109 | 46,6% | 3/3 / 3/3 |
| Agente que reenvia requisições determinísticas idênticas | 546 | 304 | 44,3% | 9/9 / 9/9 |
| Chat multi-turno com o mesmo documento colado várias vezes | 2.330 | 2.330 | 0,0% | 3/3 / 3/3 |
| Controle: prompts curtos e únicos | 202 | 202 | 0,0% | 6/6 / 6/6 |

Idêntico ao benchmark isolado (`orbit-benchmark.md`): resultado reproduzível.

Na conta (API `/v1/stats/summary`, 24 h): 44 requisições · cache 4 acertos / 15 faltas · 2.338 tokens evitados (estimativa do gateway; a diferença medida pelo provedor foi maior) · custo US$ 0 (Ollama local) · economia em dinheiro US$ 0 (nenhum valor inventado) · Quality Guard 7/7 aprovadas (asserções específicas da tarefa nas requisições em que uma técnica foi aplicada).

## Bugs encontrados neste teste e corrigidos
1. Faltas de cache contadas como 0: eventos `store` (falta cuja resposta foi gravada no cache) não eram contados. Corrigido em `apps/api/src/savings/{repo,math}.ts` e `routes/telemetry.ts`; teste em `apps/api/test/telemetry.test.ts`.
2. Tela Economia rotulava "Tokens evitados" como "Medido localmente" fixo; agora usa a origem enviada pela API (`tokens.avoidedSource`).
3. Avaliações de qualidade do benchmark não chegavam ao Quality Guard da conta: `bench/live.ts` passou a enviá-las (`POST /v1/telemetry/quality`, uma por técnica aplicada).

## Rodada 2 — app desktop v2 + context_dedup v2 (2026-11-18, mesma conta, mesmo provedor)
App reinstalado (`/Applications/maindy.app`, todas as páginas do sidebar funcionais; gateway com `context_dedup` v2 e compressão de linhas quase idênticas).

| Carga | Tokens Observar | Tokens Equilibrado | Redução | Qualidade (obs / eq) |
|---|---|---|---|---|
| Agente de código com saídas de ferramenta grandes e repetitivas | 7.698 | 3.995 | 48,1% | 3/3 / 3/3 |
| Agente que reenvia requisições determinísticas idênticas | 546 | 304 | 44,3% | 9/9 / 9/9 |
| Chat multi-turno com o mesmo documento colado várias vezes | 2.330 | 1.697 | 27,2% (antes 0%) | 3/3 / 3/3 |
| Controle: prompts curtos e únicos | 202 | 202 | 0,0% | 6/6 / 6/6 |
| **Total** | **10.776** | **6.198** | **42,5%** | 100% |

Idêntico ao benchmark isolado (`orbit-benchmark.md`). 9 avaliações de qualidade enviadas automaticamente ao Quality Guard da conta.

Checagens ao vivo com o token do app instalado: upstreams do gateway, teste do Ollama (5 modelos, 50 ms), OpenAI sem chave → `missing_credential`, detecção de Claude Code/Codex, dry run do instalador (7 alterações previstas, nada gravado), status do conector derivado do uso (`openai_compatible = optimization_active`), CRUD de projetos, avaliações de qualidade, export CSV e PDF — todos OK.
