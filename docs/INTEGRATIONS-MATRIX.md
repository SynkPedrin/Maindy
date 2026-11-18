# Matriz de integrações — o que a maindy. faz em cada conector

> Fonte em código: `packages/provider-adapters/src/capabilities.ts` (`CONNECTOR_CAPABILITIES`). A UI renderiza a partir dela.
> Pesquisa base: `docs/research/claude-code-official-interfaces.md` (code.claude.com/docs: monitoring-usage, statusline, hooks, llm-gateway) e `docs/research/providers-codex-pricing.md` (learn.chatgpt.com/docs/config-reference, /app-server; páginas de preço da OpenAI e da Anthropic).
> Legenda: **suportado** · **parcial** · **planejado** · **não suportado**.

| Conector | Observar uso | Observar custo | Cota oficial | Cache | Compressão | Roteamento | Quality Guard |
|---|---|---|---|---|---|---|---|
| API OpenAI (BYOK, `openai_api`) | suportado | suportado | não suportado | suportado | suportado | parcial | parcial |
| API Anthropic (BYOK, `anthropic_api`) | suportado | suportado | não suportado | suportado | suportado | parcial | parcial |
| OpenAI-compatible / Ollama (`openai_compatible`) | suportado | parcial | não suportado | suportado | suportado | parcial | parcial |
| Agentes locais / SDKs (`local_agent_sdk`) | suportado | suportado | não suportado | suportado | suportado | parcial | parcial |
| Claude Code (`claude_code`) | suportado | parcial | parcial | não suportado | parcial | não suportado | não suportado |
| Codex CLI (`codex`) | parcial | parcial | planejado | parcial | não suportado | não suportado | não suportado |
| Apps de chat Claude/ChatGPT (`chat_apps`) | não suportado | não suportado | não suportado | não suportado | não suportado | não suportado | não suportado |

## Por quê, conector a conector

### API OpenAI / Anthropic (BYOK pelo gateway `127.0.0.1:8787`)
- **Uso e custo: suportados.** O gateway lê o `usage` do provedor, inclusive em streaming: na OpenAI injeta `stream_options.include_usage` e remove o chunk extra quando o cliente não pediu; na Anthropic usa `message_start` + `message_delta` cumulativo. O custo é calculado com a tabela de **preço de lista** versionada (`PRICING_VERSION`). Descontos contratuais não aparecem.
- **Cota oficial: não suportada.** Não existe API de cota por chave. As Admin APIs de uso/custo (OpenAI `/v1/organization/usage|costs`, Anthropic `usage_report`/`cost_report`) exigem *admin key* e ainda não estão integradas.
- **Cache / compressão: suportados**, com as regras de elegibilidade de `docs/ORBIT-METHODOLOGY.md`.
- **Roteamento: parcial.** Só com mapeamento explícito na política, sempre visível (`x-maindy-routed-from`).
- **Quality Guard: parcial.** A amostragem shadow cobre requisições não-stream; streams são medidos mas não amostrados.
- Credenciais: o `Authorization`/`x-api-key` do cliente passa em trânsito sem ser gravado nem logado. Também é possível usar uma chave BYOK lida de variável de ambiente (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

### OpenAI-compatible (Ollama, vLLM, OpenRouter…)
- **Custo: parcial.** Execução local (Ollama, `local: true`) tem custo de API 0, com origem `locally_measured`. Energia e hardware não são medidos. Modelos remotos fora da tabela ficam com custo `indisponível`.
- Validado de ponta a ponta contra Ollama real (`docs/evidence/gateway-e2e.md`, `docs/evidence/orbit-benchmark.md`).

### Claude Code
- **Uso: suportado** via OpenTelemetry oficial (`claude_code.api_request` → `provider_reported`), instalado por `integrations/claude-code` em `~/.claude/settings.json` (`env`).
- **Custo: parcial.** `cost_usd` é a estimativa a preço de lista do próprio Claude Code, não fatura. Vai marcado com `pricingVersion: "claude-code-otel-list-estimate"`.
- **Cota oficial: parcial.** O único sinal oficial é `rate_limits.five_hour/seven_day` da status line. Só existe para Pro/Max, depois da 1ª resposta e enquanto o Claude Code está aberto. O endpoint interno do `/usage` **não** é usado.
- **Compressão: parcial.** Só saídas da ferramenta Bash, via hook `PostToolUse` (`updatedToolOutput`), com fallback para o original. A telemetria do Claude Code continua registrando a saída original.
- **Instalação pelo app:** `POST /maindy/integrations/claude-code/install` no gateway local grava OTel + status line + hook com backup. Com o app desktop, status line e hook rodam como subcomandos do próprio binário do gateway (`maindy-gateway statusline`, `maindy-gateway hook posttooluse`), sem exigir Node instalado. O status (`GET /maindy/integrations`) só diz "instalado" quando o OTel aponta para este gateway, e mostra o horário do último evento OTLP recebido.
- **Cache / roteamento / Quality Guard: não suportados** no modo padrão (somente observabilidade). Quem usa **chave de API** pode apontar `ANTHROPIC_BASE_URL=http://127.0.0.1:8787` e passa a ter os recursos de "API Anthropic". Assinantes (login claude.ai) ficam em observabilidade por padrão: a maindy não armazena nem reutiliza o token da assinatura, e a Anthropic não endossa gateways de terceiros. Quando o mesmo request chega pelo proxy e pelo OTel, ele é contado uma vez só (dedupe por `request_id`).

### Codex CLI
- **Uso: parcial.** O OTel (`[otel]` em `~/.codex/config.toml`, instalado por `integrations/codex`) emite `codex.sse_event`/`codex.api_request`, mas os nomes dos atributos de token não são estáveis. Por isso o parser é tolerante (`input_token_count`/`input_tokens`/`prompt_tokens`…).
- **Custo: parcial.** Equivalente a preço de lista calculado pela maindy (`experimentally_estimated`). Assinantes ChatGPT não pagam por token.
- **Cota oficial: planejado.** O leitor `account/rateLimits/read` do `codex app-server` existe atrás da flag `MAINDY_EXPERIMENTAL_CODEX_APP_SERVER=1` e só foi testado contra um app-server simulado.
- **Cache: parcial.** Somente com API key via `model_providers` (`wire_api = "responses"`) apontando para o gateway. Login ChatGPT por proxy não é documentado oficialmente, então **não é suportado**.

### Apps de chat (Claude Desktop/Web, ChatGPT)
- **Não suportado.** Não há API oficial de uso, cota ou interceptação. A maindy não captura conversas, cookies nem tokens. Um login maindy não autentica em Claude/ChatGPT.
