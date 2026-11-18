# Relatório de uso e economia — maindy. (18/11/2026)

**Conta:** `teste@maindy.local` (org "Pedro (teste)", plano Pro em sandbox) · **Período:** últimas 24 h · **Método:** `orbit-savings-v1`
**Relatório auditável do produto (PDF, com IDs de evento):** `~/Downloads/maindy-relatorio-uso-economia-2026-11-18.pdf`

> Legenda de origem: **Reportado** = número vindo do provedor ou da ferramenta (usage da API, OpenTelemetry). **Medido** = medido localmente pelo gateway. **Estimado** = contrafactual contra baseline ou preço de lista. **Simulação** = tokens medidos × preço de lista, sem cobrança real.

## 1. Fontes conectadas (estado real)

| Fonte | Status | Como chega o dado |
|---|---|---|
| Ollama local (`qwen3.5:4b`) via gateway | Conectado, otimização ativa nas rodadas Equilibrado | proxy BYOK do gateway local |
| Claude Code | **Conectado** (instalado hoje) | OpenTelemetry oficial + status line + hook de compressão |
| Codex CLI | **Conectado** (instalado hoje) | OpenTelemetry oficial (`[otel]` em `~/.codex/config.toml`) |
| OpenAI API / Anthropic API | Não conectado | aguardando chave do cliente (fica no Keychain) |
| Apps de chat (Claude.ai / ChatGPT) | Não suportado | não há API oficial; nada é capturado |

## 2. Uso registrado (24 h)

| Origem · modelo | Requisições | Tokens de entrada | Saída | Entrada servida do cache do provedor | Custo | Origem do custo |
|---|---|---|---|---|---|---|
| Ollama `qwen3.5:4b` | 88 | 34.079 | 616 | 14.226 | US$ 0,00 | Medido (local, gratuito) |
| Claude Code · `claude-opus-5-5` | 1 | 44.452 | 4 | 24.631 | US$ 0,1636 | Reportado (preço de lista calculado pelo Claude Code) |
| Claude Code · `claude-haiku-5-5` | 1 | 1.178 | 20 | 0 | US$ 0,0001 | Reportado |
| Codex · `gpt-5.6-sol` | 2 | 34.022 | 5 | 0 | US$ 0,1362 | **Estimado** (equivalente a preço de API; uso via assinatura ChatGPT não é cobrado por token) |
| **Total** | **92** | **113.731** | **645** | **38.857** | **US$ 0,2999** | |

**Achado principal: custo fixo de contexto.** Uma pergunta trivial ("responda apenas: ok") consumiu **45.630 tokens de entrada no Claude Code** e **34.022 no Codex**. Quase tudo é prompt de sistema, definições de ferramentas e MCP que as ferramentas enviam em toda sessão. Esse é o maior desperdício endereçável no seu uso real de coding agents.

**Observação de medição (Codex):** o Codex informou "tokens used 21.494" ao final, mas emitiu **duas** respostas `response.completed` na mesma sessão (12.533 + 21.494 tokens). A maindy registra as duas como eventos distintos; não há duplicação no parser. O resumo do Codex conta só a última resposta.

## 3. Economia medida (ORBIT, tráfego real)

Benchmark determinístico rodado **duas vezes** pelo gateway do app instalado na sua conta (Observar = baseline, Equilibrado = otimizado):

| Carga | Tokens Observar → Equilibrado | Redução (Reportado) | Simulação a preço Sonnet 5.5 | Qualidade |
|---|---|---|---|---|
| Agente de código com logs grandes | 7.698 → 3.995 | **48,1%** | US$ 0,015524 → 0,008118 (−47,7%) | 3/3 |
| Requisições determinísticas repetidas | 546 → 304 | **44,3%** | US$ 0,001260 → 0,000696 (−44,8%) | 9/9, respostas idênticas |
| Chat com documento reenviado | 2.330 → 1.697 | **27,2%** | US$ 0,005156 → 0,003890 (−24,6%) | 3/3 |
| Controle (prompts únicos) | 202 → 202 | 0% (esperado) | sem mudança | 6/6 |
| **Total** | **10.776 → 6.198** | **42,5%** | **−42,5% em tokens** | **100%** |

- **Na conta (24 h):** 6.815 tokens evitados (Estimado pelo gateway; a redução medida pelo provedor no benchmark foi maior) · 8 respostas servidas do cache exato da maindy.
- **Quality Guard:** 16 avaliações, **16 aprovadas, 0 rollbacks**.
- **Economia em dinheiro na conta: US$ 0,00.** Correto: o tráfego otimizado foi no Ollama (gratuito), e Claude Code e Codex estão em modo de observação (assinatura). A maindy não inventa valores.

## 4. O que isso significa para você

1. **Em APIs pagas (OpenAI/Anthropic via gateway):** nas cargas qualificadas (agentes com logs e ferramentas, requisições repetidas, documentos reenviados), a redução medida foi de **27% a 48%** dos tokens, sem perda de qualidade. Em prompts curtos e únicos, praticamente nenhuma; a maindy mostra isso em vez de inflar o número.
2. **Claude Code e Codex por assinatura:** a maindy **observa** custo, tokens e limites (5h/7d pela status line) e **comprime saídas de comando** via hook. Não altera limites oficiais nem intercepta a assinatura.
3. **Maior oportunidade no seu uso real:** reduzir o contexto fixo de ~45k tokens por sessão. Caminhos: (a) menos servidores MCP ativos por sessão; (b) usar o gateway com chave de API, onde cache e deduplicação se aplicam.

## 5. Validações executadas hoje

| Verificação | Resultado |
|---|---|
| Testes automatizados (API 63, motor 90, gateway 42, adapters 23, Claude Code 27, Codex 12, desktop 50) | todos passando |
| Fluxo completo conta → e-mail → pareamento → gateway → nuvem | 24/24 |
| E2E web (Playwright) | 7/7 |
| Instalação Claude Code e Codex (com backup, só acréscimos) | OK, configs originais intactas |
| Telemetria real Claude Code e Codex chegando à conta | OK |
| Nenhum texto de prompt fora da máquina | OK |

## 6. Pendências que dependem de credenciais externas

Chaves OpenAI/Anthropic (economia em dinheiro ao vivo) · conta Stripe · provedor de e-mail e domínio · Apple Developer ID (remove o aviso do macOS) · hospedagem/deploy · revisão jurídica.
