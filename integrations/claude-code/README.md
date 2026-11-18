# maindy. × Claude Code

Integração da maindy. com o Claude Code usando **somente interfaces oficiais** (OpenTelemetry, status line e hooks — ver `docs/research/claude-code-official-interfaces.md`). Nada aqui lê cookies, tokens de assinatura ou endpoints internos.

## O que cada peça faz

| Peça | Arquivo | O que faz |
|---|---|---|
| Telemetria OTel | `env` em `~/.claude/settings.json` | O Claude Code envia eventos `claude_code.api_request` (tokens, `cost_usd`, modelo, sessão) via OTLP/HTTP JSON para o gateway local (`http://127.0.0.1:8787/v1/logs` e `/v1/metrics`). O gateway transforma em `RequestUsageEvent` com origem `provider_reported`. Observação: `cost_usd` é a estimativa a preço de lista do próprio Claude Code — não é fatura. |
| Status line | `bin/maindy-statusline.mjs` | Lê o JSON que o Claude Code manda no stdin, repassa ao gateway (`POST /maindy/statusline`, timeout ~150 ms) e imprime uma linha: `maindy. Sonnet 5.5 · US$ 0,42 sessão · ctx 37% · 5h 22% · 7d 41% · cache 12 hits · 18,4k tok evitados`. Os limites 5h/7d vêm do campo oficial `rate_limits` (só Pro/Max e após a 1ª resposta). Nunca bloqueia mais de ~200 ms; se o gateway não responder, mostra os últimos contadores (`$MAINDY_HOME/statusline-cache.json`) e `gateway offline`. |
| Hook PostToolUse (Bash) | `bin/maindy-posttooluse.mjs` | Quando a saída de um comando Bash é grande (≥ 2.000 caracteres), pede ao gateway (`POST /maindy/compress`) uma compressão estruturada (linhas repetidas, ANSI, stack traces duplicados, cabeça+cauda de logs enormes com marcador `[maindy: N linhas omitidas]`). Só devolve `hookSpecificOutput.updatedToolOutput` se economizar ≥ 200 tokens **e** ≥ 15% e o gateway responder em até ~1,5 s. Qualquer falha → não imprime nada e o Claude Code usa a saída original. |
| Instalador | `bin/maindy-claude-code.mjs` | Mescla as três peças acima no `settings.json` do usuário, com backup. |

O gateway é encontrado por `MAINDY_GATEWAY_URL` ou pela porta em `$MAINDY_HOME/gateway.json` (padrão `8787`); a chave local `x-maindy-key` vem de `MAINDY_GATEWAY_KEY` ou `$MAINDY_HOME/gateway.key`. `MAINDY_HOME` padrão: `~/.maindy`.

## Instalar / remover

```bash
# ver o que mudaria, sem gravar nada
node integrations/claude-code/bin/maindy-claude-code.mjs install --dry-run

# instalar (cria backup settings.json.maindy-backup-<data>)
node integrations/claude-code/bin/maindy-claude-code.mjs install

# conferir
node integrations/claude-code/bin/maindy-claude-code.mjs status

# remover — restaura só o que a maindy. mudou
node integrations/claude-code/bin/maindy-claude-code.mjs uninstall
```

Opções: `--home <dir>` (outro diretório home; usado nos testes), `--endpoint <url>` (padrão `http://127.0.0.1:8787`), `--force-statusline` (troca uma status line sua pela da maindy.; a sua volta no uninstall), `--json`.

O que o instalador grava em `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:8787"
  },
  "statusLine": { "type": "command", "command": "node \"…/bin/maindy-statusline.mjs\"", "padding": 0 },
  "hooks": {
    "PostToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node \"…/bin/maindy-posttooluse.mjs\"", "timeout": 5 }] }
    ]
  }
}
```

Regras do instalador:
- Preserva todas as suas chaves, hooks e variáveis. Se você já tem uma `statusLine`, ela é mantida (a menos que use `--force-statusline`).
- Antes de qualquer mudança grava um backup com data/hora ao lado do arquivo. Rodar `install` de novo não duplica nada.
- O que foi substituído (valores anteriores de `env`, status line anterior) fica em `$MAINDY_HOME/claude-code-install.json` (0600). O `uninstall` restaura esses valores e remove apenas as entradas da maindy.; se você mudou uma variável depois da instalação, ela é mantida.
- As variáveis de exporter OTel só funcionam no `settings.json` do usuário (no de projeto são ignoradas), por isso o instalador usa `~/.claude/settings.json`.
- **Nunca** define `ANTHROPIC_BASE_URL`.

## Privacidade

- Prompts e respostas **não** são enviados: `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_ASSISTANT_RESPONSES` e `OTEL_LOG_TOOL_DETAILS` continuam desligados (padrão do Claude Code). O instalador não liga nenhum deles.
- A telemetria vai para o gateway **local** (127.0.0.1). Para a nuvem maindy. seguem só metadados (`RequestUsageEvent`: tokens, custo, modelo, hashes — sem texto).
- O texto da saída do Bash enviado ao `/maindy/compress` fica na sua máquina (o gateway só escuta em loopback e não grava esse texto).

## Modo gateway (ANTHROPIC_BASE_URL) — somente para quem usa chave de API

Quem usa o Claude Code com **chave de API da Anthropic** pode, opcionalmente, passar as requisições pelo gateway para ganhar medição por requisição e as técnicas do ORBIT (cache exato, compressão, etc., conforme o modo):

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
claude
```

- O gateway atende `POST /v1/messages` (o Claude Code chama `/v1/messages?beta=true`) e `GET /v1/models`.
- Os cabeçalhos `x-api-key`, `Authorization`, `anthropic-beta` e `anthropic-version` são repassados **literalmente** à Anthropic, em trânsito — nunca são gravados nem aparecem em logs.
- Isso é configuração manual e explícita; o instalador não faz isso por você.

**Assinantes (login claude.ai / OAuth, planos Pro/Max):** o padrão da maindy. é **somente observabilidade** (OTel + status line + hook). Motivos:
1. A credencial OAuth da assinatura é do usuário e do Claude Code; a maindy. não coleta, não armazena e não reutiliza esse token.
2. Os limites e a cobrança da assinatura continuam valendo de qualquer forma — o gateway não aumenta cota oficial.
3. A Anthropic não endossa nem audita gateways de terceiros; para assinantes, OTel + status line + hooks já cobrem medição e compressão de saídas de ferramentas pelas interfaces oficiais.

## Testes

```bash
cd integrations/claude-code && npx vitest run   # usa HOME temporário; nunca toca o seu ~/.claude
npm run typecheck                                 # node --check em bin/ e src/
```
