/**
 * Marketing copy + honest capability data. Every illustrative number lives in `demo*` objects and
 * is rendered inside a "Demonstração — dados simulados" frame. Capability levels mirror
 * docs/research/*.md — keep them in sync when integrations change.
 */
import type { PlanCode, PlanDto } from "@maindy/contracts";

export const SUPPORT_EMAIL = "suporte@maindy.ai";

export const nav = [
  { label: "Produto", href: "/#produto" },
  { label: "ORBIT", href: "/#orbit" },
  { label: "Como funciona", href: "/#como-funciona" },
  { label: "Planos", href: "/precos" },
  { label: "Baixar", href: "/#baixar" },
] as const;

export type Capability = "supported" | "partial" | "not_supported" | "planned";

export const capabilityLabel: Record<Capability, string> = {
  supported: "Suportado",
  partial: "Parcial",
  not_supported: "Não suportado",
  planned: "Planejado",
};

export type ConnectorRow = {
  name: string;
  group: string;
  level: Capability;
  how: string;
  detail: string;
  note?: string;
};

export const connectors: ConnectorRow[] = [
  {
    name: "OpenAI API",
    group: "API · BYOK",
    level: "supported",
    how: "base_url → 127.0.0.1:8787",
    detail: "Chat Completions e Responses com streaming. Tokens e custo medidos por requisição, cache e compressão segura.",
  },
  {
    name: "Anthropic API",
    group: "API · BYOK",
    level: "supported",
    how: "ANTHROPIC_BASE_URL → gateway",
    detail: "Messages API com streaming. Dicas de prompt caching quando elegível; descontos nativos não contam como economia nossa.",
  },
  {
    name: "OpenAI-compatible / Ollama",
    group: "API · local",
    level: "supported",
    how: "qualquer endpoint compatível",
    detail: "Ollama, vLLM e similares. Execução local opcional e consentida para tarefas elegíveis.",
  },
  {
    name: "Agentes TypeScript / Python",
    group: "Agentes",
    level: "supported",
    how: "SDK oficial + base URL local",
    detail: "Sem reescrever o agente: aponte o cliente para o gateway. Loop guard e orçamento de retries por projeto.",
  },
  {
    name: "Claude Code",
    group: "Ferramentas de código",
    level: "partial",
    how: "OpenTelemetry · status line · hooks",
    detail: "Observabilidade pelas interfaces oficiais e compressão de saídas de ferramentas via hooks, com fallback.",
    note: "Em planos de assinatura, limites e cobrança continuam os do provedor.",
  },
  {
    name: "Codex",
    group: "Ferramentas de código",
    level: "partial",
    how: "OpenTelemetry · Responses API",
    detail: "Telemetria oficial. Com API key própria, passa pelo gateway via Responses.",
    note: "Login ChatGPT através de proxy não é suportado.",
  },
  {
    name: "Claude e ChatGPT (apps de chat)",
    group: "Apps de chat",
    level: "partial",
    how: "somente integrações oficiais",
    detail: "Compatibilidade parcial / depende de integrações oficiais. Não interceptamos conversas nem acessamos seu histórico.",
  },
];

export const notDone = [
  "Aumentar limites oficiais de Claude, ChatGPT ou Codex",
  "Reutilizar o login da sua assinatura como API oculta",
  "Ler o tráfego ou o conteúdo de outros aplicativos",
] as const;

export const wasteKinds = [
  { k: "01", title: "Requisições duplicadas", body: "A mesma pergunta, os mesmos tokens, cobrados de novo." },
  { k: "02", title: "Contexto repetido", body: "Instruções e arquivos reenviados inteiros a cada chamada." },
  { k: "03", title: "Agentes em loop", body: "Retries e chamadas idênticas que ninguém percebe até a fatura." },
  { k: "04", title: "Código lido em excesso", body: "Logs verbosos e arquivos completos para mudar uma linha." },
] as const;

export const orbitDetail = [
  {
    key: "O",
    name: "Observar",
    summary: "Mede uso real, custos, latência, repetição e perfil de trabalho antes de mudar qualquer coisa.",
    techniques: ["Modo observação sem otimizar", "Baseline por projeto e agente", "Origem de cada número registrada"],
    signal: "40 blocos medidos",
  },
  {
    key: "R",
    name: "Reduzir",
    summary: "Contexto seletivo, compressão segura de saídas, deduplicação e cache com isolamento.",
    techniques: ["Cache determinístico", "Deduplicação de contexto", "Compressão estruturada de logs"],
    signal: "40 → 28 blocos",
  },
  {
    key: "B",
    name: "Balancear",
    summary: "Escolhe estratégia, modelo e modalidade conforme custo, prazo, consentimento e exigência de qualidade.",
    techniques: ["Roteamento por política", "Batch para tarefas assíncronas", "Execução local consentida"],
    signal: "2 rotas por política",
  },
  {
    key: "I",
    name: "Inteligência adaptativa",
    summary: "Aprende, com dados autorizados de cada projeto, o que economiza sem regressão.",
    techniques: ["Políticas por projeto", "Ajuste progressivo", "Rollback por técnica"],
    signal: "política v3 ativa",
  },
  {
    key: "T",
    name: "Testar",
    summary: "Valida critérios de aceite e custo líquido. Otimização que piora a entrega é bloqueada.",
    techniques: ["Quality Guard com amostragem", "Fallback para o original", "Custo líquido com overhead"],
    signal: "1 técnica revertida",
  },
] as const;

export const provenance = [
  { key: "provider_reported", label: "Reportado pelo provedor", body: "Tokens e custo informados pela API ou telemetria oficial do provedor." },
  { key: "locally_measured", label: "Medido localmente", body: "Contado pelo gateway ou SDK na sua máquina." },
  { key: "experimentally_estimated", label: "Estimado vs. baseline", body: "Diferença contra um baseline validado. Sempre rotulado como estimativa." },
  { key: "unavailable", label: "Indisponível", body: "Sem fonte confiável. Mostramos o traço, nunca um palpite." },
] as const;

export const useCases = [
  {
    k: "01",
    who: "Dev indie",
    pain: "Paga a API do próprio bolso e não sabe para onde vai cada dólar.",
    gain: "Um gateway local, cache seguro e um painel que mostra custo por projeto.",
    plan: "Starter",
  },
  {
    k: "02",
    who: "Software house",
    pain: "Vários clientes, vários ambientes, custos de IA misturados no mesmo cartão.",
    gain: "Ambientes separados, políticas por projeto e relatórios para repassar ao cliente.",
    plan: "Pro",
  },
  {
    k: "03",
    who: "Operação de agentes",
    pain: "Agentes em produção com loops, retries e contexto que cresce sem controle.",
    gain: "Loop guard, orçamento de retries e Quality Guard com fallback para o original.",
    plan: "Pro · Master",
  },
  {
    k: "04",
    who: "Equipe de tecnologia",
    pain: "Precisa provar retorno da IA para a diretoria com números auditáveis.",
    gain: "Baseline documentado, trilha de origem por número e auditoria por equipe.",
    plan: "Master Economy",
  },
] as const;

export const guaranteeConditions = [
  { k: "01", title: "Baseline real", body: "Medimos sua carga em modo observação antes de otimizar. Sem baseline válido, não há comparação." },
  { k: "02", title: "Volume mínimo elegível", body: "A carga precisa ter volume e repetição suficientes para a comparação ser estatisticamente útil." },
  { k: "03", title: "Qualidade mantida", body: "Só conta a economia de tarefas aceitas pelo Quality Guard. Regressão desativa a técnica." },
  { k: "04", title: "Janela de avaliação", body: "Resultado apurado em um período definido, com relatório rastreável por requisição." },
] as const;

export const faq = [
  {
    q: "Meus prompts saem da minha máquina?",
    a: "Por padrão, não. O gateway roda localmente e envia à nuvem maindy. apenas metadados de uso — tokens, custo, latência e hashes — nunca o texto dos prompts ou respostas. Segredos de API ficam no Keychain (macOS) ou no cofre de credenciais do Windows.",
  },
  {
    q: "Como a maindy. se conecta às minhas ferramentas?",
    a: "Você aponta o base URL do seu SDK, agente ou ferramenta para o gateway local (127.0.0.1:8787) e continua usando a sua própria chave de API. Para Claude Code e Codex usamos as interfaces oficiais de telemetria, status line e hooks.",
  },
  {
    q: "Funciona com a minha assinatura do Claude, ChatGPT ou Codex?",
    a: "De forma limitada. Com assinaturas, oferecemos observabilidade pelas interfaces oficiais e compressão de saídas onde há hook suportado. Não aumentamos limites semanais ou de sessão, não reutilizamos o login da assinatura e não acessamos o histórico dos apps de chat.",
  },
  {
    q: "Como a economia é medida?",
    a: "Cada número carrega a sua origem: reportado pelo provedor, medido localmente, estimado contra baseline ou indisponível. Economia líquida = custo de baseline − (custo de IA otimizado + overhead da própria otimização). Descontos nativos que já existiam no seu baseline não contam.",
  },
  {
    q: "Quais provedores e ferramentas são compatíveis?",
    a: "OpenAI API, Anthropic API, endpoints OpenAI-compatible (incluindo Ollama), agentes em TypeScript e Python, e Claude Code e Codex com alcance parcial. A matriz completa, com o que é parcial ou não suportado, está na seção de integrações.",
  },
  {
    q: "A otimização pode piorar as respostas?",
    a: "O Quality Guard existe para impedir isso. Começamos em modo observação, ativamos técnicas aos poucos e avaliamos amostras. Se uma técnica causa regressão ou excede o limite de latência, ela é revertida e a requisição original segue sem otimização.",
  },
  {
    q: "Eu pago o provedor de IA pela maindy.?",
    a: "Não. A assinatura maindy. é cobrada separadamente. Você continua pagando o seu provedor (OpenAI, Anthropic etc.) diretamente, com a sua própria conta. Não revendemos cotas de nenhum provedor.",
  },
  {
    q: "Os preços já são definitivos?",
    a: "Ainda não. Os valores exibidos são provisórios até a confirmação comercial e podem mudar antes do lançamento. Quem assinar verá o preço final antes de qualquer cobrança.",
  },
] as const;

/* ---------------- Plans (fallback when the API is unreachable) ---------------- */

export const PLAN_FALLBACK: PlanDto[] = [
  {
    code: "starter",
    name: "Starter",
    tagline: "Para o dev que paga a própria API.",
    priceMonthlyCents: 3900,
    priceYearlyCents: 39000,
    currency: "BRL",
    provisional: true,
    trialDays: 0,
    limits: { environments: 1, projects: 3, seats: 1, devices: 2 },
    features: ["1 ambiente", "API Gateway básico", "Cache seguro", "Compressão de saídas", "Painel econômico", "Suporte self-serve"],
    highlighted: false,
  },
  {
    code: "pro",
    name: "Pro",
    tagline: "Otimização adaptativa para quem vive de código.",
    priceMonthlyCents: 14900,
    priceYearlyCents: 149000,
    currency: "BRL",
    provisional: true,
    trialDays: 0,
    limits: { environments: 3, projects: 15, seats: 3, devices: 6 },
    features: [
      "Até 3 ambientes",
      "Otimização adaptativa",
      "Integrações de coding compatíveis",
      "Memória versionada",
      "Quality benchmarks",
      "Políticas por projeto",
    ],
    highlighted: true,
  },
  {
    code: "master_economy",
    name: "Master Economy",
    tagline: "Times, múltiplos projetos e agentes em produção.",
    priceMonthlyCents: 69900,
    priceYearlyCents: 699000,
    currency: "BRL",
    provisional: true,
    trialDays: 0,
    limits: { environments: null, projects: null, seats: null, devices: null },
    features: [
      "Times e múltiplos projetos",
      "Policies avançadas",
      "Auditoria",
      "Gestão de equipes",
      "API dedicada",
      "Implantação privada opcional",
    ],
    highlighted: false,
  },
];

/** "a partir de" prefix for plans whose price is a floor. */
export const PLAN_PRICE_FLOOR: Partial<Record<PlanCode, boolean>> = { master_economy: true };

type Cell = boolean | string;
export const comparison: { group: string; rows: { label: string; values: Record<PlanCode, Cell> }[] }[] = [
  {
    group: "Escopo",
    rows: [
      { label: "Ambientes", values: { starter: "1", pro: "Até 3", master_economy: "Sob medida" } },
      { label: "Projetos e agentes", values: { starter: "Individuais", pro: "Por projeto", master_economy: "Múltiplos, por equipe" } },
      { label: "Assentos", values: { starter: "1", pro: "Pequeno time", master_economy: "Equipes" } },
    ],
  },
  {
    group: "Mecanismos ORBIT",
    rows: [
      { label: "Gateway local (BYOK)", values: { starter: true, pro: true, master_economy: true } },
      { label: "Cache seguro e loop guard", values: { starter: true, pro: true, master_economy: true } },
      { label: "Compressão de saídas", values: { starter: true, pro: true, master_economy: true } },
      { label: "Otimização adaptativa", values: { starter: false, pro: true, master_economy: true } },
      { label: "Integrações de coding compatíveis", values: { starter: false, pro: true, master_economy: true } },
      { label: "Memória versionada", values: { starter: false, pro: true, master_economy: true } },
      { label: "Quality benchmarks", values: { starter: false, pro: true, master_economy: true } },
      { label: "Políticas por projeto", values: { starter: false, pro: true, master_economy: true } },
      { label: "Policies avançadas e auditoria", values: { starter: false, pro: false, master_economy: true } },
    ],
  },
  {
    group: "Operação",
    rows: [
      { label: "Painel econômico e relatórios", values: { starter: true, pro: true, master_economy: true } },
      { label: "Gestão de equipes", values: { starter: false, pro: false, master_economy: true } },
      { label: "API dedicada", values: { starter: false, pro: false, master_economy: true } },
      { label: "Implantação privada", values: { starter: false, pro: false, master_economy: "Opcional" } },
      { label: "Suporte", values: { starter: "Self-serve", pro: "E-mail", master_economy: "Prioritário" } },
    ],
  },
];
