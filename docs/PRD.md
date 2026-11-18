# MAINDY — PRD (v0.1)

**Produto:** maindy. — SaaS de economia e eficiência de IA, com agente local (desktop), gateway local (data plane) e camada de observabilidade.
**Promessa:** "Sua IA trabalha mais. Você gasta menos."
**Metodologia:** ORBIT Engine™ (Observar, Reduzir, Balancear, Inteligência adaptativa, Testar).

## 1. Problema
Times e devs desperdiçam dinheiro e capacidade de IA com contexto excessivo, requisições repetidas, saídas de ferramentas verbosas, agentes em loop, retries descontrolados e falta de visibilidade sobre custo × resultado.

## 2. Público
Dev individual · software house · operação de agentes/automações · equipe de tecnologia corporativa.

## 3. Metas e não-metas
**Metas comerciais (não comprovadas até haver benchmark):** 30–60% de redução de gasto de API em cargas qualificadas; até 2× de eficiência em tarefas comparáveis.
**Não-metas:** aumentar limites oficiais de Claude/ChatGPT/Codex; revender cotas; acessar histórico de chats; interceptar tráfego privado (sem MITM).

## 4. Princípios
1. Medir antes de otimizar: modo Observar gera baseline antes de qualquer mudança.
2. Toda métrica com origem: `provider_reported`, `locally_measured`, `experimentally_estimated`, `unavailable`.
3. Qualidade é um portão: Quality Guard com amostragem, regressão → rollback automático; fail-open.
4. Local-first: prompts não saem da máquina do cliente por padrão.
5. Transparência de capacidade: integração indisponível aparece como indisponível.

## 5. Jornada
LP → Planos → Cadastro → Verificação de e-mail → Login → Checkout/Trial → Boas-vindas/Download → Tutorial → Instalação → Pareamento do dispositivo → Conectar fontes → Baseline (Observar) → Ativar ORBIT → Dashboard ao vivo.

## 6. Escopo funcional v1
| Área | Requisitos | Aceite |
|---|---|---|
| Landing + páginas públicas | `/`, `/metodologia`, `/precos`, `/privacidade`, `/termos`, `/ajuda` | identidade correta mobile/desktop; dados de demo rotulados |
| Auth | cadastro, verificação de e-mail, login, recuperação de senha, sessões revogáveis, rate limit | E2E Playwright |
| Planos/assinatura | planos no banco (provisórios), checkout Stripe ou sandbox, webhook idempotente, cancelamento | testes de idempotência |
| Download/onboarding | releases reais com SHA-256 e estado de assinatura verdadeiro; checklist retomável; roteiro do tutorial | sem links falsos |
| Desktop | Tauri; notch nativo no macOS com fallback; pílula + tray no Windows; Quick Panel; dashboard | build real + teste de geometria |
| Gateway + ORBIT | proxy BYOK OpenAI/Anthropic/OpenAI-compatible com streaming; cache exato; compressão estruturada; loop guard; retry budget; Quality Guard; telemetria sem texto | E2E com Ollama real |
| Integrações coding | Claude Code (OTel, status line, hooks); Codex (OTel, provider via API key) | instaladores testados em HOME temporário |
| Dashboard | Overview, Economia, Integrações, Agentes & Projetos, Limites & Sessões, ORBIT, Qualidade, Relatórios, Faturamento, Configurações | sem números fabricados |
| Relatórios | JSON/CSV/PDF com trilha de auditoria | IDs de evento + versão de preço + método |

## 7. Planos (provisórios, editáveis no banco)
| Plano | Preço sugerido | Escopo |
|---|---|---|
| Starter | R$ 39/mês | 1 ambiente, gateway básico, cache seguro, compressão de outputs, painel, suporte self-serve |
| Pro | R$ 149/mês | até 3 ambientes, otimização adaptativa, integrações de coding, quality benchmarks, políticas por projeto |
| Master Economy | a partir de R$ 699/mês | times, múltiplos projetos/agentes, políticas avançadas, auditoria, API dedicada, implantação privada opcional |

**Economy Guarantee:** contratual, condicionada a baseline válido, volume mínimo elegível, qualidade mantida e janela de avaliação. Critérios configuráveis por plano.

## 8. Métricas de produto
Ativação (dispositivo pareado + 1ª requisição medida em 24 h), cobertura de baseline, economia líquida por org, taxa de rollback, pass rate do Quality Guard, conversão trial → pago, churn.

## 9. Dependências externas pendentes
Chaves de API dos provedores (teste), conta Stripe, provedor de e-mail transacional, domínio, Apple Developer ID (assinatura/notarização), certificado Authenticode, hospedagem (control plane + Postgres + storage de releases).
