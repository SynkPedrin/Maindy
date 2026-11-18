# MAINDY — Roadmap e estado real (2026-11-18)

## Pronto e verificado (ambiente local)
- Landing page cinematográfica + `/metodologia`, `/precos`, `/termos`, `/privacidade`, `/ajuda` (screenshots em `docs/evidence/screens/lp-*`).
- Cadastro → verificação de e-mail → login → onboarding → checkout **sandbox** → download → pareamento (E2E Playwright 7/7; elo completo 24/24).
- Dashboard web completo com proveniência em todo número, estados vazios honestos e demo rotulada.
- Control plane: auth, sessões, CSRF, rate limit (com proteção contra falsificação de IP), tenancy, planos no banco, billing Stripe (webhook testado) + sandbox, devices, telemetria idempotente, relatórios JSON/CSV/PDF auditáveis, LGPD (53 testes).
- Gateway local BYOK com streaming, cache exato, compressão estruturada, dedup, loop guard, retry budget, Quality Guard com rollback, pausa fail-open, OTLP para Claude Code/Codex.
- Benchmark real (Ollama): −46,6% e −44,3% de tokens nas cargas qualificadas, 0% nas de controle, qualidade mantida.
- Desktop Tauri macOS: notch nativo verificado no hardware, barra de menus, Quick Panel, painel completo, Keychain, gateway embutido; `.dmg` arm64 e x64 (assinatura ad-hoc).

## Bloqueado por credenciais ou contas externas (ação do responsável)
| Item | O que falta | Impacto hoje |
|---|---|---|
| Assinatura/notarização Apple | conta Apple Developer (Developer ID Application + app-specific password) | macOS bloqueia a 1ª abertura; o usuário libera em Privacidade e Segurança |
| Assinatura Windows | certificado Authenticode | SmartScreen avisa |
| Build Windows | rodar `.github/workflows/desktop.yml` (push no GitHub) | pílula/tray/instalador nunca executados em Windows real |
| Chamadas reais OpenAI/Anthropic | chaves de API de teste | caminhos testados só com upstream simulado; economia em dinheiro ainda não medida ao vivo |
| Pagamentos | conta Stripe + price IDs + webhook secret | checkout em modo sandbox rotulado |
| E-mail transacional | provedor SMTP (Resend/SES/Postmark) + domínio verificado | e-mails só no Mailpit local |
| Produção | domínio, hospedagem (API + Postgres + storage de releases), `CLIENT_IP_HEADER` da borda, `SESSION_SECRET` | nada publicado; nenhum deploy declarado |
| Revisão jurídica | termos, privacidade, Economy Guarantee | páginas marcadas "minuta" |
| Updater do desktop | par de chaves de assinatura de update | auto-update desligado |

## Próximas entregas técnicas
1. Tutorial em vídeo gravado sobre o app real (roteiro pronto em `/app/download`).
2. Rate limiter compartilhado (Postgres/Redis) antes de escalar a API horizontalmente.
3. Dedup de contexto com limiar adaptativo (o benchmark mostrou 0% no chat com documento de ~1.000 caracteres).
4. Registrar compressões do hook do Claude Code como eventos de telemetria (hoje só contadores locais).
5. Notch como `NSPanel` não-ativante e atalho global de teclado.
6. Leitor de limites do Codex app-server (experimental, testado só contra servidor simulado).
7. Lenis/smooth scroll na LP (instalação bloqueada pela política de permissões nesta sessão).
8. Testes de carga e observabilidade (OpenTelemetry no control plane), backups e runbooks.
