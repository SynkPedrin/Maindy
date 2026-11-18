# Fase 0 — Auditoria do repositório e dos assets (2026-11-18)

## Repositório
- Branch `main`, 4 commits (último `742a7e6`). O histórico contém o **produto anterior** (assistente pessoal "segundo cérebro": `apps/api`, `apps/mobile` Expo, `apps/web`, `apps/obsidian-plugin`, `apps/brand-video`, `packages/core`, `supabase/`).
- No working tree, **401 arquivos rastreados desse produto estavam apagados (não commitados)** e só havia o `MAINDY_Codex_Kit/` novo e não rastreado. Interpretamos como reset intencional para o novo produto (SaaS de eficiência de IA). Os arquivos **não foram restaurados nem a exclusão foi commitada**: ela continua visível no `git status` para decisão do responsável. O código antigo segue recuperável via `git checkout 742a7e6 -- <caminho>`.
- Arquivos locais preservados: `.env.local`, `.env.cloud` (credenciais do produto anterior: Supabase/Vercel). **Não são usados pela v2.**
- Infraestrutura em nuvem do produto anterior (Vercel `maindy-api`, Supabase `maindy`) **não foi tocada**.

## Ambiente
| Item | Estado |
|---|---|
| Node / pnpm | 24.20 / 9.9 |
| Rust / cargo | 1.98 (Tauri 2 viável) |
| Xcode / Swift | instalado / 6.4.2 |
| Docker | 29.6 — Postgres 16 (:5433) e Mailpit (:1025/:8025) sobem via `infra/docker-compose.yml` |
| Ollama | rodando em :11434 com `qwen3.5:4b` — provedor **real** local para validar o gateway sem custo |
| Chaves OpenAI / Anthropic | **ausentes** (variáveis vazias). Integrações com esses provedores são testadas com upstream simulado até as chaves serem fornecidas |
| Stripe | sem chaves / CLI → billing em modo `sandbox` rotulado + caminho Stripe implementado e testado com assinaturas de webhook geradas localmente |
| Apple Developer ID | indisponível → builds macOS com assinatura ad-hoc, não notarizados |
| Windows | sem máquina Windows → builds Windows via GitHub Actions (`.github/workflows/desktop.yml`) |

## Assets da marca (`MAINDY_Codex_Kit/assets/`)
| Arquivo | Conteúdo | Uso |
|---|---|---|
| `log-escrita.png` (1594×897, transparente) | wordmark `maindy.` branco; pingo do "i" **dourado**, ponto final **violeta** | header, footer, app → `brand/derived/wordmark-white*.{png,webp}` (recortado sem distorção) |
| `maindy(1).png` (1672×941) | wordmark sobre fundo navy com arcos violeta/âmbar | OG image, hero alternativo |
| `icone-maindy.png` (1254², transparente) | orb `m.` com halo violeta/âmbar | UI (orb com glow) → `orb-*.webp` |
| `img-icone.png` (1254², fundo navy) | orb full-bleed | favicons, ícones de app (`icon-*.png`, Tauri icon set) |
| `icone_m_animado(1).webp/png` | orb animado 512/384 | estados de atividade |
| `maindy_logo_transform_4k(2).mp4` (6,5 s, 3840×2160) | transição wordmark → orb | intro/hero (nunca como tutorial) |
| `demo_interativo(1).html` | widget flutuante de demonstração (drag, snap, breathing, ripple, a11y) | referência de interação apenas; não embutido |
| `snapinsta-….mp4` (Kobi, 55 s) | referência de UX (launcher no topo + painel escuro) | só conceito; nada copiado |

Originais copiados sem alteração para `brand/original/`; derivados gerados por `scripts/derive-brand.mjs` em `brand/derived/`.

Tokens extraídos dos pixels: navy de fundo ≈ `#080623`/`#050417`, violeta do ponto ≈ `#9E24FF` (dentro da faixa `#8F20FF`–`#A424FF` do PRD), dourado ≈ `#FFC21A`–`#FFD21F`.

## Referências externas consultadas
- Oryzo (Lusion): narrativa em seções curtas com prova/interação, rótulos mono em caixa alta, leituras numéricas grandes, hero com vídeo sob demanda. Projeto satírico; nada copiado.
- Documentação oficial Claude Code (OTel, status line, hooks, LLM gateway) → `docs/research/claude-code-official-interfaces.md`.
- Codex (OTel, app-server, model_providers), Admin APIs de usage/cost da OpenAI e da Anthropic, preços, campos de usage em streaming → `docs/research/providers-codex-pricing.md`.
