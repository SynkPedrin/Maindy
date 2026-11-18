# MAINDY — Segurança, privacidade e threat model

## 1. Fronteiras de confiança
1. **Navegador ↔ web/API (nuvem):** sessão por cookie httpOnly `maindy_session` (SameSite=Lax, Secure em produção), token aleatório de 32 bytes armazenado como SHA-256, expiração deslizante de 30 dias, revogável. Mutações exigem `x-maindy-csrf: 1` e `Origin` permitido.
2. **Desktop/gateway ↔ API:** device token (pareamento estilo OAuth device flow com aprovação explícita na web), armazenado no Keychain (macOS) / Credential Manager (Windows), revogável por dispositivo.
3. **Clientes locais ↔ gateway:** o gateway escuta só em `127.0.0.1`; rotas administrativas `/maindy/*` exigem `x-maindy-key` (arquivo 0600 em `~/.maindy`).
4. **Gateway ↔ provedores:** TLS; credencial BYOK do Keychain/env ou repassada pelo cliente em trânsito (nunca persistida nem logada).

## 2. Dados
| Dado | Onde fica | Sai da máquina? |
|---|---|---|
| Prompts e respostas | memória do gateway; cache local SQLite em `~/.maindy` (máquina do cliente) | **Não**, por padrão |
| Chaves de API dos provedores | Keychain/Credential Manager ou env | Não |
| Metadados de uso (tokens, custo, modelo, latência, hash SHA-256 do request normalizado, técnicas) | outbox local → API | Sim (necessário ao serviço) |
| Conta (nome, e-mail, hash de senha argon2id) | Postgres | — |
Retenção configurável; exportação (`GET /v1/account/export`) e exclusão (`DELETE /v1/account`) atendem à LGPD.

## 3. Threat model (STRIDE resumido)
| Ameaça | Mitigação |
|---|---|
| Credential stuffing / brute force | argon2id, rate limit por IP e por e-mail, respostas que não revelam se o e-mail existe |
| Falsificação de IP para burlar limites | o rewrite `/api` do Next repassa o `X-Forwarded-For` do cliente sem acrescentar o IP real (verificado no código do Next 16). Em produção, `CLIENT_IP_HEADER` aponta para o cabeçalho autoritativo da borda, aceito só quando o peer TCP é proxy confiável (`TRUST_PROXY`); peers não confiáveis têm o XFF descartado. Tetos globais em cadastro, envio de e-mail e pareamento independem de IP. Testes: `apps/api/test/hardening.test.ts` |
| Roubo de sessão | cookie httpOnly/Secure/SameSite, rotação no login, revogação, reset de senha revoga todas |
| CSRF | SameSite=Lax + header customizado + checagem de Origin |
| Vazamento entre tenants | `organization_id` obrigatório em toda query de domínio; testes de isolamento |
| Replay/duplicação de telemetria | `eventId` único (idempotência) |
| Webhook forjado (billing) | assinatura Stripe verificada sobre o corpo bruto; idempotência por `event.id` |
| Device token roubado | escopo por org, revogação por dispositivo, hash no servidor, armazenamento no Keychain |
| Processo local malicioso chamando o gateway | loopback apenas; `x-maindy-key` nas rotas admin; sem CORS aberto |
| Exfiltração de prompts pela telemetria | contrato `RequestUsageEvent` não tem campo de texto; teste garante ausência de texto no outbox |
| Cache servindo dado sensível/dinâmico | cache exato só determinístico; bypass com `x-maindy-no-cache`, temperatura > 0, ferramentas/dados dinâmicos; cache semântico desligado por padrão; isolamento por org+projeto |
| Otimização degradando qualidade | Quality Guard (amostragem shadow), rollback automático por técnica, pausa global imediata, fail-open |
| Update malicioso do app | updater Tauri exige assinatura (chave pública embutida); desabilitado até haver chave de assinatura |
| MITM / inspeção de tráfego de terceiros | **proibido por design**: sem certificados raiz, sem proxy de sistema, sem captura de tela de outros apps |

## 4. Logs
Pino com redação de `authorization`, `cookie`, `x-api-key`, `password`, `token`, `deviceToken`. Nunca logar corpos de requisição de provedores.

## 5. Releases
SHA-256 publicado por artefato; estado de assinatura real (`unsigned`, `adhoc`, `developer_id`, `notarized`, `authenticode`) exibido na página de download. Assinatura/notarização no CI só quando os segredos existirem.

## 6. Reporte de vulnerabilidades
E-mail `seguranca@maindy.ai` (a confirmar), resposta inicial em até 5 dias úteis, divulgação coordenada em 90 dias. Sem bug bounty pago na v1.
