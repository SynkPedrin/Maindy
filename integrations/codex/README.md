# maindy. × Codex CLI

Integração da maindy. com o Codex CLI usando apenas interfaces documentadas (ver `docs/research/providers-codex-pricing.md`).

## Instalar a telemetria (OTel)

O Codex vem com OpenTelemetry **desligado**. O instalador acrescenta ao seu `~/.codex/config.toml` um bloco gerenciado (delimitado por comentários) que envia os eventos ao gateway local da maindy.:

```toml
# >>> maindy otel (gerenciado) >>>
# Telemetria do Codex → gateway local maindy. (OTLP/HTTP JSON). Prompts continuam redigidos.
[otel]
log_user_prompt = false
exporter = { otlp-http = { endpoint = "http://127.0.0.1:8787/v1/logs", protocol = "json" } }
# <<< maindy otel <<<
```

```bash
node integrations/codex/bin/maindy-codex.mjs install --dry-run    # mostra o resultado, não grava
node integrations/codex/bin/maindy-codex.mjs install              # grava (com backup config.toml.maindy-backup-<data>)
node integrations/codex/bin/maindy-codex.mjs status
node integrations/codex/bin/maindy-codex.mjs uninstall            # remove só o bloco gerenciado
```

Opções: `--config <arquivo>` (outro config.toml), `--home <dir>`, `--endpoint <url>` (padrão `http://127.0.0.1:8787`; `/v1/logs` é acrescentado), `--json`.

Regras:
- O bloco é acrescentado ao **final** do arquivo (uma tabela nova é TOML válido em qualquer posição final). Nada do seu conteúdo é reescrito; rodar de novo não duplica.
- Se você já tem uma configuração `[otel]` (ou `otel.…` / `otel = {…}` na raiz) fora do bloco da maindy., o instalador **se recusa** (código de saída 2) e explica — não sobrescrevemos configurações suas.
- `otel` só vale no `config.toml` do usuário; config de projeto ignora `otel`, `model_provider` e `openai_base_url`.
- Reinicie o Codex depois de instalar.

## O que é coletado

O gateway recebe em `POST /v1/logs` (OTLP/HTTP JSON) os eventos do Codex, principalmente:
- `codex.sse_event` — contagem de tokens no `response.completed`;
- `codex.api_request` — duração, status, tentativa.

Os **nomes dos atributos de tokens não estão estabilizados** na documentação oficial (referência: PR openai/codex#2103 — `input_token_count`, `output_token_count`, `cached_token_count`, `reasoning_token_count`). Por isso o parser do gateway é tolerante a variações; quando não encontra tokens, a métrica fica `unavailable` (nunca inventamos números). Prompts não são registrados (`log_user_prompt = false`, que já é o padrão do Codex).

## Usar a API key pelo gateway

Quem usa o Codex com **chave de API da OpenAI** pode passar as requisições pelo gateway local para medição por requisição e técnicas do ORBIT (conforme o modo). Adicione ao `~/.codex/config.toml`:

```toml
model_provider = "maindy"

[model_providers.maindy]
name = "maindy gateway"
base_url = "http://127.0.0.1:8787/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
```

- `wire_api = "responses"` é o único suportado pelo Codex nesse caminho; o gateway atende `POST /v1/responses` e repassa o `Authorization: Bearer <OPENAI_API_KEY>` em trânsito, sem gravar nem logar.
- `model_provider` precisa ficar no config do usuário (config de projeto ignora essa chave).

**Login ChatGPT (assinatura) pelo gateway:** não é documentado oficialmente pela OpenAI → a maindy. **não suporta**. Para assinantes, a integração é somente observabilidade (OTel acima + leitura experimental de limites abaixo).

## Limites da assinatura (EXPERIMENTAL)

`src/app-server-rate-limits.mjs` lê os limites via `codex app-server` (JSON-RPC por stdio, interface oficial): `initialize` → `account/rateLimits/read` → `rateLimits.{primary,secondary}.{usedPercent,windowDurationMins,resetsAt}`, convertidos em `QuotaSnapshot` com `collectedVia: "codex.app_server"`.

- Desligado por padrão. Liga com `MAINDY_EXPERIMENTAL_CODEX_APP_SERVER=1` ou `maindy-codex rate-limits --experimental`.
- Timeout de 3 s; qualquer erro → lista vazia (o painel mostra "indisponível").
- Os schemas mudam por versão do Codex (`codex app-server generate-json-schema`); integrações comerciais podem exigir contato com a OpenAI (lista de clientes conhecidos). Só foi testado contra um app-server simulado — o Codex não estava instalado nesta máquina.

## Testes

```bash
cd integrations/codex && npx vitest run   # usa arquivos temporários; nunca toca o seu ~/.codex
npm run typecheck
```
