# Claude Code — interfaces oficiais (pesquisa 2026-11-18)

Fontes: https://code.claude.com/docs/en/monitoring-usage.md · statusline.md · hooks.md · hooks-guide.md · costs.md · llm-gateway.md · llm-gateway-connect.md · llm-gateway-protocol.md

## OpenTelemetry (observabilidade oficial)
- `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_METRICS_EXPORTER=otlp`, `OTEL_LOGS_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` (suportado; default http/protobuf), `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` (ex.: `Authorization=Bearer x`).
- Intervalos: `OTEL_METRIC_EXPORT_INTERVAL` (60000 ms), `OTEL_LOGS_EXPORT_INTERVAL` (5000 ms).
- Devem ficar em `~/.claude/settings.json` → `env` (variáveis de exporter são ignoradas em `.claude/settings.json` de projeto).
- Prompts NÃO são logados por padrão (`OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_ASSISTANT_RESPONSES`, `OTEL_LOG_TOOL_DETAILS` controlam).
- Métricas: `claude_code.cost.usage` (USD; attrs model, query_source…), `claude_code.token.usage` (attr `type` = input|output|cacheRead|cacheCreation; model), `claude_code.session.count`, `claude_code.lines_of_code.count`, `claude_code.active_time.total`.
- Eventos (logs): `claude_code.api_request` com `model, cost_usd, duration_ms, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, request_id`; `claude_code.api_error` (`status_code, attempt`); `claude_code.tool_result` (`tool_name, success, duration_ms, tool_input_size_bytes, tool_result_size_bytes`). Atributos padrão: `session.id`, `app.version`.
- `cost_usd` é estimativa a preço de lista do próprio Claude Code (não é fatura).

## Status line
- settings: `{ "statusLine": { "type": "command", "command": "...", "padding": 0, "refreshInterval": 5 } }`
- stdin JSON: `session_id`, `model.id`, `model.display_name`, `workspace.current_dir`, `workspace.project_dir`, `cost.total_cost_usd`, `cost.total_duration_ms`, `context_window.{total_input_tokens,total_output_tokens,context_window_size,used_percentage}`, `rate_limits.five_hour.{used_percentage,resets_at}`, `rate_limits.seven_day.{used_percentage,resets_at}` (apenas Pro/Max/Ultra e após a 1ª resposta).
- É o ÚNICO sinal programático oficial de limite de assinatura; existe só enquanto o Claude Code roda. Não há API pública de limites de assinatura. O endpoint interno do `/usage` não deve ser usado.

## Hooks
- Config: `{ "hooks": { "PostToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "..." } ] } ] } }`
- PreToolUse: `hookSpecificOutput.updatedInput` (substitui o input inteiro), `permissionDecision`.
- PostToolUse: `hookSpecificOutput.updatedToolOutput` — para Bash `{stdout, stderr, interrupted, isImage}`; valor fora do schema é ignorado (fallback para o original). A ferramenta já executou; a telemetria registra o output original.
- Uso MAINDY: compressão estruturada de outputs verbosos (logs de teste, installs) via PostToolUse com fallback seguro.

## LLM gateway (ANTHROPIC_BASE_URL)
- Gateway serve `/v1/messages` (Claude Code posta em `/v1/messages?beta=true`), opcional `/v1/messages/count_tokens`, `GET /v1/models?limit=1000`.
- Repassar verbatim `anthropic-version`, `anthropic-beta`, `Authorization`, `x-api-key`.
- Assinantes (OAuth claude.ai): só `ANTHROPIC_BASE_URL` mantém a credencial da assinatura (limites e cobrança da assinatura continuam valendo); gateway deve repassar `Authorization` e `anthropic-beta`. MAINDY NÃO armazena nem reutiliza esse token — apenas repassa em trânsito quando o usuário configura explicitamente. Padrão MAINDY para assinantes: somente observabilidade (OTel + status line + hooks).
- Anthropic não endossa nem audita gateways de terceiros.
