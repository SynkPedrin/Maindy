# MAINDY — Arquitetura

> Status: v0.1 (2026-11-18). Este documento é o contrato entre os módulos. Mudou uma rota? Atualize aqui e em `packages/contracts`.

## 1. Visão geral

```
                ┌────────────────────────── Nuvem MAINDY (control plane) ──────────────────────────┐
 Navegador ───► │ apps/web (Next.js :3100)  ──/api/* rewrite──►  apps/api (Fastify :4100) ──► Postgres │
                │   LP, auth, /app dashboard                     auth, tenancy, planos, billing,     │
                │                                                devices, telemetria (metadados),    │
                │                                                ledger de economia, relatórios      │
                └──────────────────────────────────────────────────────▲───────────────────────────────┘
                                                                       │ HTTPS, Bearer device token
                                                                       │ (somente metadados: tokens, custo, hashes)
 Máquina do cliente ───────────────────────────────────────────────────┼────────────────────────────────
   apps/desktop (Tauri 2)  ── gerencia ──► apps/gateway (data plane, 127.0.0.1:8787)
     notch macOS / pílula Windows            ORBIT Engine: cache, compressão, loop guard, Quality Guard
     Quick Panel, dashboard, Keychain        BYOK ──► OpenAI / Anthropic / OpenAI‑compatible (Ollama…)
   Claude Code / Codex ── OTel http/json ──► gateway /v1/logs|/v1/metrics (observabilidade oficial)
   Claude Code status line / hooks ───────► integrations/claude-code (scripts) ──► gateway
```

Princípios:
1. **Prompts nunca saem da máquina do cliente por padrão.** O gateway envia ao control plane apenas `RequestUsageEvent` (contratos), sem texto.
2. **Segredos de provedores ficam no Keychain (macOS) / Credential Manager (Windows)** ou em variáveis de ambiente locais. O backend guarda apenas `credentialRef` ("keychain:maindy/openai").
3. **Toda métrica carrega `MeasurementSource`** (`provider_reported | locally_measured | experimentally_estimated | unavailable`). A UI mostra a origem ao lado do número.
4. **Demo nunca vai para o banco de um tenant real.** Demonstrações são fixtures client-side rotuladas.

## 2. Stack e justificativas

| Camada | Escolha | Por quê |
|---|---|---|
| Monorepo | pnpm 9 + Turborepo | pedido no PRD; cache de build |
| Contratos | `packages/contracts` (zod 4) | validação em runtime nas fronteiras + tipos compartilhados |
| Control plane | **Fastify 5** + `fastify-type-provider-zod` + OpenAPI (`@fastify/swagger`) | O PRD sugeria NestJS; optamos por Fastify pela menor superfície, mesma runtime do gateway, schemas zod reutilizados direto como OpenAPI e testes `inject()` sem servidor. Modularização por plugins por domínio. |
| ORM | **Drizzle** + postgres.js | SQL explícito, migrations versionadas em SQL legível, tipos inferidos, sem engine binária (vs Prisma) |
| Banco | PostgreSQL 16 | multi-tenant por `organization_id` em todas as tabelas de domínio |
| Filas / cache efêmero | Postgres (tabelas + `FOR UPDATE SKIP LOCKED`) na v0.1; Redis previsto quando houver volume | evitar infra sem necessidade (PRD: "não pulverizar") |
| E-mail | SMTP (nodemailer). Dev: Mailpit (:1025/:8025) | verificação de e-mail testável de ponta a ponta |
| Billing | Stripe (Checkout + Portal + webhooks assinados) + provider `sandbox` local rotulado | sem chaves Stripe no ambiente atual |
| Web | Next.js 16 App Router, Tailwind 4, Radix, motion, TanStack Query, Geist | |
| Desktop | Tauri 2 (Rust) + React/Vite; AppKit via `objc2` para notch | binário pequeno, Keychain nativo, multiplataforma |
| Gateway | Node (TS) + Fastify + undici, empacotado como sidecar (Node SEA) | reaproveita `orbit-engine` e adapters em TS |
| Cache local do gateway | `node:sqlite` em `~/.maindy/gateway.db` | persistente, local, sem dependência nativa |
| Tokenização local | `gpt-tokenizer` (o200k) para OpenAI; estimativa rotulada para outros | |

## 3. Pacotes

```
packages/contracts         DTOs zod e enums compartilhados (fonte da verdade)
packages/design-system     tokens (TS + tokens.css), labels pt-BR, formatadores
packages/orbit-engine      biblioteca pura: pricing versionado, custo, ledger de economia,
                           técnicas (cache, compressão, dedup, loop guard, retry budget,
                           output budget, routing), Quality Guard, política por modo
packages/provider-adapters normalização OpenAI/Anthropic/OpenAI‑compatible: request, usage
                           (incl. streaming SSE), erros, capacidades por conector
apps/api                   control plane
apps/gateway               data plane local (proxy BYOK + OTLP receiver)
apps/web                   site + app web
apps/desktop               Tauri (macOS/Windows)
integrations/claude-code   status line + hooks + instalador de config OTel
integrations/codex         config OTel + leitor opcional do app-server
```

## 4. Control plane — API REST (`apps/api`, prefixo `/v1`)

Convenções: JSON; erros `{ error: { code, message(pt-BR), details? } }` (`ApiError`); datas ISO-8601 UTC; dinheiro em **micros** (`Money`). Autenticação web por cookie `maindy_session` (httpOnly, `SameSite=Lax`, `Secure` em prod); mutações web exigem header `x-maindy-csrf: 1` + checagem de `Origin`. Desktop/gateway usam `Authorization: Bearer <deviceToken>`. OpenAPI em `GET /docs`.

### Auth & conta
| Método | Rota | Auth | Notas |
|---|---|---|---|
| POST | /v1/auth/signup | — | `SignupRequest` → 201 `{ user, needsVerification: true }`; envia e-mail de verificação; cria Organization + Membership(owner) |
| POST | /v1/auth/verify-email | — | `{token}` → verifica e **cria sessão** (cookie) → `MeDto` |
| POST | /v1/auth/resend-verification | — | `{email}` → 202 sempre (não vaza existência) |
| POST | /v1/auth/login | — | `LoginRequest` → cookie + `MeDto`; 403 `email_not_verified`; 429 rate limit (por IP e por e-mail) |
| POST | /v1/auth/logout | web | revoga sessão atual |
| POST | /v1/auth/forgot-password | — | 202 sempre |
| POST | /v1/auth/reset-password | — | `{token,password}` → revoga todas as sessões |
| GET | /v1/me | web/device | `MeDto` |
| GET | /v1/auth/sessions | web | `SessionDto[]` (web + devices) |
| DELETE | /v1/auth/sessions/:id | web | revoga |
| POST | /v1/auth/sessions/revoke-others | web | |
| GET | /v1/account/export | web | JSON LGPD (dados do usuário e da org, sem segredos) |
| DELETE | /v1/account | web | exige `{ confirm: "EXCLUIR" , password }`; exclui/anonimiza |

### Planos, billing, onboarding, releases
| Método | Rota | Auth | Notas |
|---|---|---|---|
| GET | /v1/plans | — | `PlanDto[]` (do banco; `provisional: true`) |
| POST | /v1/billing/checkout | web | `{planCode, interval}` → `{ url, provider }` (Stripe Checkout ou página sandbox `/app/faturamento/sandbox?checkout=...`) |
| POST | /v1/billing/sandbox/complete | web | só quando `BILLING_PROVIDER=sandbox`; simula webhook `checkout.session.completed` pelo mesmo caminho idempotente |
| POST | /v1/billing/webhooks/stripe | assinatura Stripe | raw body, `stripe.webhooks.constructEvent`, idempotência por `event.id` |
| GET | /v1/billing/subscription | web | `SubscriptionDto \| null` |
| POST | /v1/billing/portal | web | Stripe portal URL (sandbox: página local) |
| POST | /v1/billing/cancel | web | cancela ao fim do período |
| GET | /v1/billing/invoices | web | lista |
| GET/PATCH | /v1/onboarding | web | `OnboardingDto`; PATCH `{ complete?: OnboardingStep[], dismissed?: boolean }` |
| GET | /v1/releases | — | `ReleaseDto[]` para os 4 alvos; `available=false` quando não há build real |

### Devices (pareamento estilo OAuth device flow)
| Método | Rota | Auth | Notas |
|---|---|---|---|
| POST | /v1/devices/pair/start | — (rate limited) | `PairStartRequest` → `PairStartResponse` (TTL 10 min, interval 3 s) |
| POST | /v1/devices/pair/poll | — | `{deviceCode}` → `PairPollResponse`; token entregue **uma vez** |
| GET | /v1/devices/pair/:userCode | web | detalhes para tela de aprovação |
| POST | /v1/devices/pair/approve | web | `{ userCode, approve: boolean }` |
| GET | /v1/devices | web | `DeviceDto[]` |
| DELETE | /v1/devices/:id | web | revoga token do device |

Token de device: 32 bytes aleatórios, armazenado como SHA-256; escopo `org`; revogável.

### ORBIT, conectores, telemetria, relatórios
| Método | Rota | Auth | Notas |
|---|---|---|---|
| GET | /v1/connectors | web/device | catálogo + status **derivado de eventos reais** da org (`ConnectorDto[]`; regras abaixo) |
| PUT | /v1/connectors/:kind | web/device | `{ status, credentialRef? }` (nunca o segredo); conexão/desconexão explícita do usuário |
| GET/PUT | /v1/orbit/policy | web/device | `OrbitPolicyDto` (PUT incrementa `version`) |
| POST | /v1/orbit/pause · /v1/orbit/resume | web/device | pausa global imediata |
| POST | /v1/orbit/rollback | web/device | `{ technique, reason }` |
| GET/POST · PATCH/DELETE `/:id` | /v1/projects · /v1/agents | web/device | CRUD simples por org (`key` = valor de `x-maindy-project`/`x-maindy-agent`; limite de projetos do plano) |
| POST | /v1/telemetry/events | device | `TelemetryBatch` → `{accepted, duplicates}`; idempotente por `eventId` (unique) |
| POST | /v1/telemetry/quality | device | `QualityEvaluationEvent[]` |
| POST | /v1/telemetry/quota | device | `QuotaSnapshot[]` |
| GET | /v1/stats/summary?from&to | web/device | `SavingsSummary` |
| GET | /v1/stats/timeseries?from&to&bucket=hour\|day | web/device | séries com origem |
| GET | /v1/runs?cursor&limit | web/device | últimas operações (eventos) |
| GET | /v1/quality/evaluations | web/device | `QualityEvaluationEvent[]` (`from`, `to`, `limit` ≤ 500) |
| GET | /v1/limits | web/device | `QuotaSnapshot[]` mais recentes por janela (só fontes oficiais) |
| GET | /v1/reports/savings?from&to&format=json\|csv\|pdf | web/device | relatório auditável (IDs de evento, versão de preço, método) |
| GET | /v1/audit?cursor&limit | web (owner/admin) | `{ items: AuditEvent[], nextCursor }` |

#### Notas de implementação (apps/api v0.1)
- Fora de `/v1`: `GET /health` (ping no banco; 503 `db_unavailable`), `GET /docs` (+ `/docs/json`), `GET /releases/:target/:file` (somente o arquivo registrado via `src/scripts/register-release.ts`; `content-disposition: attachment`, header `x-maindy-sha256`).
- Paginação por cursor opaco: `GET /v1/runs` e `GET /v1/audit` → `{ items, nextCursor }` (`items` de `/runs` são `RequestUsageEvent`).
- `POST /v1/billing/checkout` → `{ url, provider, checkoutId }`; `POST /v1/billing/sandbox/complete` `{checkoutId}` → `{ subscription, duplicate, simulated: true }`. `GET /v1/billing/invoices` → `InvoiceDto[]` (`simulated: true` no sandbox). Rotas de billing mutáveis: owner/admin.
- `POST /v1/devices/pair/start`: `verificationUrl` = `${WEB}/app/dispositivos/parear` e `verificationUrlComplete` = `…?code=USERCODE` (semântica OAuth device flow). Após o token ser entregue, novos polls retornam `expired`. `GET /v1/devices/pair/:userCode` → detalhes do pedido (nome, plataforma, IP /24, expiração). Aprovação checa o limite de dispositivos do plano (409 `plan_limit_reached`; sem assinatura = 1 dispositivo). `DELETE /v1/devices/:id` → `DeviceDto` revogado.
- `PATCH /v1/onboarding`: o cliente só marca `plan_selected`, `app_downloaded`, `baseline_started`; as demais etapas são marcadas pelo servidor quando o evento real acontece (422 `step_server_managed`).
- `PUT /v1/orbit/policy` body: `{ mode?, techniques?: {name, enabled}[], qualitySampleRate?, maxAddedLatencyMs?, cacheTtlSeconds?, expectedVersion? }` (409 `version_conflict`; modo `observe` não aceita técnicas ativas). Mudança de modo aplica `MODE_DEFAULT_TECHNIQUES`, preservando rollbacks do Quality Guard até reativação explícita. `POST /v1/telemetry/quality` com `triggeredRollback` espelha o rollback na política.
- `POST /v1/telemetry/quality` → `{accepted, duplicates}` (idempotente por `evaluationId`); `/quota` → `{accepted}`. `GET /v1/stats/timeseries` → `{ from, to, bucket, currency, methodVersion, points[] }` (cada valor é `Money` com origem). `/stats/*` e `/reports/*` aceitam `currency` (padrão USD).
- **Device token** (`Authorization: Bearer`) vale em todas as rotas "web/device": escopo = a org do dispositivo (isolamento por `organization_id`, testado em `test/tenancy.test.ts`). Papéis (`roles`) só se aplicam a sessões web.
- **Status de conector derivado** (`src/connectors/status.ts`), por `kind`, a cada `GET /v1/connectors`:
  1. evidência = eventos `request_usage` da org nos últimos **7 dias**; tráfego de `provider = "ollama"` rotulado `openai_api`/`anthropic_api` conta como `openai_compatible`;
  2. taxa de erro (`status = "error"`) **> 30%** nos últimos **50** eventos do conector → `attention`;
  3. senão `optimization_active` só se a política da org não é `observe`, não está pausada **e** alguma técnica teve `applied: true` em eventos desse conector (qualquer data); caso contrário `connected_read_only`;
  4. `lastSyncAt` = horário do evento mais recente (null sem tráfego);
  5. linha explícita (PUT) "conectado" (`connected_read_only`/`optimization_active`, com ou sem `credentialRef`) aparece como `connected_read_only` mesmo sem tráfego; `attention`/`unavailable` explícitos valem sem tráfego;
  6. `not_connected` explícito (desconectar) vence a derivação, a menos que chegue tráfego **posterior** ao PUT;
  7. `chat_apps` nunca é derivado (não há API para observar).
  A ingestão de telemetria não cria mais linhas em `connectors`; linhas antigas criadas automaticamente (status `connected_read_only`, sem `credentialRef`, com `last_sync_at`) são ignoradas como explícitas. O PUT grava `last_sync_at = null`.
- `GET /v1/reports/savings` também marca a etapa `first_report`. Erros de validação: 400 `validation_error` (mensagem pt-BR + `details[]`). Rate limit: 429 `rate_limited` com `retry-after`.

## 5. Data plane — gateway local (`apps/gateway`, `127.0.0.1:8787`)

| Rota | Função |
|---|---|
| POST /v1/chat/completions | OpenAI-compatible; upstream escolhido por header `x-maindy-upstream` ou prefixo de modelo; streaming SSE preservado; injeta `stream_options.include_usage` e remove o chunk extra se o cliente não pediu |
| POST /v1/responses | OpenAI Responses (passthrough + medição; necessário para Codex com API key) |
| POST /v1/messages | Anthropic Messages (Claude Code via `ANTHROPIC_BASE_URL`, SDKs); repassa `anthropic-version`, `anthropic-beta`, `x-api-key`, `Authorization` sem armazenar |
| GET /v1/models | passthrough |
| POST /v1/logs · /v1/metrics | OTLP/HTTP **JSON** receiver (Claude Code `claude_code.api_request`; Codex `codex.sse_event`) → eventos `provider_reported` |
| POST /maindy/statusline | recebe JSON da status line do Claude Code → `QuotaSnapshot` (`rate_limits`) |
| POST /maindy/compress | usado pelo hook PostToolUse: comprime saída de ferramenta com fallback |
| GET /maindy/health · /maindy/status | `GatewayStatus` |
| POST /maindy/pause · /maindy/resume | pausa local imediata (fail-open para o original) |
| GET/PUT /maindy/upstreams… · /maindy/integrations… | administração pelo desktop (contrato abaixo) |

### Endpoints de administração (desktop ↔ gateway) — contrato final

Todos exigem `x-maindy-key`; 401 `{ error: { code: "unauthorized", message } }` sem ela. Implementação: `apps/gateway/src/admin.ts`; testes: `apps/gateway/test/admin.test.ts`.

| Rota | Corpo | Resposta |
|---|---|---|
| GET /maindy/upstreams | — | `{ upstreams: UpstreamView[] }` |
| PUT /maindy/upstreams/:id | `{ baseUrl?: string, apiKey?: string \| null }` | `UpstreamView` · 400 `invalid_body`/`invalid_base_url` · 404 `unknown_upstream` · 500 `config_write_failed` |
| POST /maindy/upstreams/:id/test | — | `{ ok: boolean, latencyMs: number, models: string[] (≤ 50), error: { code, message } \| null }` (sempre 200; 404 `unknown_upstream`) |
| GET /maindy/integrations | — | `{ claudeCode: { detected, installed, settingsPath, otel, statusLine, hook, lastEventAt }, codex: { detected, installed, configPath, otel, lastEventAt } }` |
| POST /maindy/integrations/claude-code/install · /uninstall | `{ dryRun?: boolean, forceStatusline?: boolean }` | `{ ok: true, changed: string[], messages: string[], backupPath: string \| null, preview?: string }` · 422 `{ ok: false, changed: [], backupPath: null, error: { code: "invalid_config", message } }` |
| POST /maindy/integrations/codex/install · /uninstall | `{ dryRun?: boolean }` | igual ao acima · 409 `config_conflict` quando já existe um `[otel]` do usuário (a maindy não sobrescreve) |

- `UpstreamView = { id: string, kind: ConnectorKind ("openai_api" \| "anthropic_api" \| "openai_compatible"), baseUrl: string, hasCredential: boolean, credentialSource: "memory" \| "env" \| "none" }`. `kind` usa o mesmo enum de `GatewayStatus.upstreams[].kind`.
- `apiKey` fica **só na memória do processo** (`CredentialStore`): nunca vai para `gateway.json`, log, SQLite ou telemetria (há teste que varre todos os arquivos de `MAINDY_HOME`). `null` apaga; ausente = não muda. Precedência: memória > variável de ambiente (`apiKeyEnv`) > nenhuma. Reiniciar o gateway apaga a chave: o desktop deve reenviá-la a partir do Keychain.
- `baseUrl`: só `http`/`https`; `http` só para loopback (`127.0.0.1`, `localhost`, `::1`); sem usuário/senha, query ou fragmento. É gravada em `gateway.json` (0600). Barra final removida.
- Teste: `GET {baseUrl}/v1/models` com a credencial configurada (Anthropic: `x-api-key` + `anthropic-version`), timeout de 10 s, não gasta tokens. Códigos de erro: `missing_credential` (OpenAI/Anthropic sem chave; nenhuma chamada é feita), `unauthorized` (401/403), `not_found` (404), `rate_limited` (429), `upstream_error` (outro ≥ 400), `invalid_response`, `timeout`, `unreachable`. Mensagens em pt-BR.
- Integrações: `detected` = `~/.claude` (ou `~/.codex`) existe ou o binário `claude`/`codex` está no `PATH`. Claude Code: `otel` = variáveis OTel presentes **e** apontando para este gateway (loopback + porta atual); `installed` = `otel && hook` (a status line é opcional, porque uma status line do usuário é preservada). Codex: `installed` = bloco gerenciado presente; `otel` = bloco gerenciado apontando para este gateway. `lastEventAt` = último payload OTLP (logs ou métricas) recebido de cada ferramenta (por `service.name` e prefixo do evento/métrica), ou `null`.
- Instalação só grava quando chamada explicitamente, sempre com backup `<arquivo>.maindy-backup-<timestamp>`, preservando todas as outras chaves; `dryRun` não grava nada e devolve `preview` (o arquivo resultante). `changed` lista o que mudou (vazio quando já estava instalado). Reaproveita `integrations/claude-code/src/installer.mjs` e `integrations/codex/src/installer.mjs` (empacotados no bundle).
- Comandos gravados no `settings.json` do Claude Code: binário SEA (sidecar do desktop, detectado por `node:sea` `isSea()`) → `"<process.execPath>" statusline` e `"<process.execPath>" hook posttooluse` (funcionam **sem Node instalado**); bundle sob Node → `node "<…/maindy-gateway.mjs>" statusline`. Se o `MAINDY_HOME` do gateway não for o padrão, o comando recebe `--home "<dir>"`. Os subcomandos usam a mesma lógica de `integrations/claude-code` e leem a porta real em `runtime.json`.
- CLI sem chave (para um agente de IA no editor do usuário): `maindy-gateway integrations <claude-code|codex> <install|uninstall|status> [--dry-run] [--json] [--home <home do usuário>] [--maindy-home <dir>] [--force-statusline]` — mesma lógica dos endpoints (`apps/gateway/src/integrations.ts`), resumo em pt-BR com diff no `--dry-run` (valores que parecem segredos mascarados). Saída: 0 ok · 1 falha de gravação · 2 conflito (`[otel]` do usuário no Codex) · 3 arquivo inválido (nada gravado) · 64 uso.

Headers opcionais de atribuição: `x-maindy-project`, `x-maindy-agent`, `x-maindy-session`, `x-maindy-no-cache: 1`.
Credencial do gateway: o gateway só escuta em loopback e exige `x-maindy-key` (gerado no primeiro start e salvo no Keychain/arquivo 0600) para rotas `/maindy/*`; rotas de provedor aceitam a credencial do provedor do próprio cliente (passthrough) **ou** usam a credencial BYOK configurada.

**Fail-open**: qualquer erro do ORBIT → requisição original segue sem otimização (`fallbackOriginal: true`).

## 6. Economia — definições operacionais (implementadas em `orbit-engine/src/savings.ts`)

- `baseline_cost` = custo para a requisição equivalente sem MAINDY:
  - `cache_replay`: hit de cache → baseline = custo medido da resposta original armazenada (tokens reais × preço vigente);
  - `pre_optimization_tokens`: compressão/dedup → baseline = custo com os tokens de entrada **antes** da técnica (contados localmente) + output real;
  - `paired_sample`: experimentos pareados (shadow) — amostras controladas;
  - `none`: sem baseline válido → não entra na economia.
- `optimized_ai_cost` = custo real (0 em hit de cache).
- `gross_savings = baseline_cost − optimized_ai_cost` (só onde há baseline)
- `net_savings = baseline_cost − (optimized_ai_cost + overhead_cost)`
- `customer_net_benefit = net_savings − assinatura MAINDY rateada − taxas` (relatórios)
- `efficiency_multiplier = baseline_cost / (optimized_ai_cost + overhead_cost)` — só com baseline válido e qualidade aprovada.
- Descontos nativos já existentes no baseline (ex.: prompt caching do provedor) não contam como economia MAINDY.

## 7. Modelo de dados (resumo)

`users, organizations, memberships, sessions, email_tokens, plans, subscriptions, billing_events, invoices, devices, device_pairings, connectors, integration_credential_refs, projects, agents, optimization_policies, baseline_experiments, request_usage (eventos), cache_events (agregados), quality_evaluations, savings_ledger (agregado diário), provider_quota_snapshots, download_releases, onboarding_progress, audit_events`. Toda tabela de domínio tem `organization_id` e todos os repositórios filtram por ele.

Implementação v0.1 (`apps/api/src/db/schema.ts`, migrations em `apps/api/drizzle/`): + `billing_checkouts` (checkout pendente). `cache_events` não é tabela separada: hits/misses ficam em `request_usage.cache_status` e no agregado `savings_ledger`. Tabelas globais (sem `organization_id`): `users`, `email_tokens`, `plans`, `download_releases`; `billing_events.organization_id` é anulável (webhook pode chegar antes do mapeamento).

## 8. Portas locais

web 3100 · api 4100 · gateway 8787 · postgres 5433 · mailpit 1025/8025 · ollama 11434 (opcional, provedor real local).
