# maindy.

**Sua IA trabalha mais. Você gasta menos.**
SaaS de economia e eficiência de IA, com agente desktop, gateway local e observabilidade. Powered by **ORBIT Engine™** (Observar · Reduzir · Balancear · Inteligência adaptativa · Testar).

> Status: v0.1, ambiente local de desenvolvimento. Nada está em produção. Veja [docs/ROADMAP.md](docs/ROADMAP.md) para o que falta e o que depende de credenciais externas.

## O que existe

| Módulo | Caminho | Estado verificado |
|---|---|---|
| Landing page + páginas públicas | `apps/web/app/(marketing)` | `/`, `/metodologia`, `/precos`, `/termos`, `/privacidade`, `/ajuda` |
| Cadastro, login, verificação de e-mail, dashboard | `apps/web/app/(auth)`, `apps/web/app/app` | 7/7 E2E Playwright |
| Control plane (API REST + OpenAPI) | `apps/api` | 63 testes (Postgres real) |
| Gateway local (data plane BYOK) | `apps/gateway` | 35 testes + E2E com Ollama real (17/17) |
| Motor ORBIT | `packages/orbit-engine` | 90 testes |
| Adapters OpenAI / Anthropic / OpenAI‑compatible | `packages/provider-adapters` | 23 testes |
| Integração Claude Code (OTel, status line, hook) | `integrations/claude-code` | 27 testes |
| Integração Codex (OTel) | `integrations/codex` | 12 testes |
| App desktop (Tauri: notch macOS, pílula Windows, tray; todas as páginas funcionais) | `apps/desktop` | 42 testes Rust; `.dmg` arm64 instalado e testado ao vivo; Windows via CI |
| Elo completo web → device → gateway → nuvem | `scripts/e2e-cloud-link.mjs` | 24/24 |

## Resultado medido (Ollama real, `qwen3.5:4b`)

Benchmark reproduzível: `pnpm --filter @maindy/gateway bench` → [docs/evidence/orbit-benchmark.md](docs/evidence/orbit-benchmark.md)

| Carga | Tokens: Observar → Equilibrado | Qualidade |
|---|---|---|
| Agente de código com logs grandes | 7.698 → 3.995 (**−48,1%**) | mantida (3/3) |
| Requisições determinísticas repetidas | 546 → 304 (**−44,3%**) | respostas idênticas (9/9) |
| Chat com documento reenviado | 2.330 → 1.697 (**−27,2%**) | mantida (3/3) |
| Controle (prompts únicos) | 0% (esperado) | mantida |
| **Total** | 10.776 → 6.198 (**−42,5%**) | 100% |

Reproduzido ao vivo pelo app desktop instalado: [docs/evidence/live-app-bench.md](docs/evidence/live-app-bench.md).

Os números são tokens reportados pelo provedor. Valores em dinheiro só existem com provedores pagos; para Ollama o custo é 0 e a economia em dinheiro mostrada é 0.

## Rodando localmente

Pré-requisitos: Node 24, pnpm 9, Docker. Opcional: Ollama (provedor local gratuito), Rust (desktop).

```bash
pnpm install
pnpm infra:up                               # Postgres :5433 + Mailpit :1025/:8025
pnpm --filter @maindy/contracts build && pnpm --filter @maindy/design-system build
pnpm --filter @maindy/api db:migrate && pnpm --filter @maindy/api db:seed
pnpm --filter @maindy/api serve             # API :4100  (OpenAPI em /docs)
pnpm --filter @maindy/web dev               # Web :3100
pnpm --filter @maindy/gateway build && node apps/gateway/dist/maindy-gateway.mjs   # gateway :8787
```

E-mails de verificação chegam no Mailpit: http://localhost:8025. Billing roda em modo `sandbox` (rotulado; nenhum pagamento real).

Usar o gateway em um app que fala OpenAI:
```bash
export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
```

## Testes

```bash
pnpm turbo run test --filter=!@maindy/desktop --filter=!@maindy/web
cd apps/web && BASE_URL=http://localhost:3100 pnpm exec playwright test
node scripts/e2e-cloud-link.mjs             # elo completo com Ollama real
```

## Documentação

[PRD](docs/PRD.md) · [Arquitetura](docs/ARCHITECTURE.md) · [Metodologia ORBIT](docs/ORBIT-METHODOLOGY.md) · [Matriz de integrações](docs/INTEGRATIONS-MATRIX.md) · [Design system](docs/DESIGN-SYSTEM.md) · [Segurança](docs/SECURITY.md) · [Roadmap](docs/ROADMAP.md) · [Auditoria inicial](docs/AUDIT.md) · [Evidências](docs/evidence/)
