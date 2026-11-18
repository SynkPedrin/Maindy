import type { downloadReleases, plans } from "./schema.js";

/**
 * Plans — PROVISIONAL prices (PROMPT_MESTRE "PLANOS E MONETIZAÇÃO"): editable in the DB, never announced as final.
 * Yearly ≈ 10× monthly (2 months free). Prices in BRL cents.
 */
export const PLAN_SEEDS: (typeof plans.$inferInsert)[] = [
  {
    code: "starter",
    name: "Starter",
    tagline: "Para devs individuais que querem ver e cortar o gasto com IA.",
    priceMonthlyCents: 3900,
    priceYearlyCents: 39000,
    priceIsStartingAt: false,
    currency: "BRL",
    provisional: true,
    trialDays: 14,
    limits: { environments: 1, projects: 3, seats: 1, devices: 1 },
    features: [
      "1 ambiente (1 máquina pareada)",
      "Gateway de API básico (BYOK)",
      "Cache seguro de respostas",
      "Compressão de saídas de ferramentas",
      "Painel econômico com origem de cada número",
      "Suporte self-serve",
    ],
    highlighted: false,
    sortOrder: 1,
  },
  {
    code: "pro",
    name: "Pro",
    tagline: "Otimização adaptativa para quem programa com IA todos os dias.",
    priceMonthlyCents: 14900,
    priceYearlyCents: 149000,
    priceIsStartingAt: false,
    currency: "BRL",
    provisional: true,
    trialDays: 14,
    limits: { environments: 3, projects: 20, seats: 1, devices: 3 },
    features: [
      "Até 3 ambientes",
      "Otimização adaptativa (ORBIT)",
      "Integrações de coding compatíveis (Claude Code, Codex — nas capacidades oficiais)",
      "Memória de contexto e deduplicação",
      "Quality benchmarks com rollback automático",
      "Políticas por projeto",
    ],
    highlighted: true,
    sortOrder: 2,
  },
  {
    code: "master_economy",
    name: "Master Economy",
    tagline: "Para times: a partir de R$ 699/mês, com políticas avançadas e auditoria.",
    priceMonthlyCents: 69900,
    priceYearlyCents: 699000,
    priceIsStartingAt: true,
    currency: "BRL",
    provisional: true,
    trialDays: 0,
    limits: { environments: null, projects: null, seats: null, devices: null },
    features: [
      "Times e múltiplos projetos e agentes",
      "Políticas avançadas de otimização",
      "Auditoria e relatórios rastreáveis",
      "Gestão de equipes",
      "API dedicada",
      "Implantação privada opcional",
    ],
    highlighted: false,
    sortOrder: 3,
  },
];

export const RELEASE_SEEDS: (typeof downloadReleases.$inferInsert)[] = [
  { target: "macos-arm64", version: "0.1.0", available: false, signing: "unsigned", minOsVersion: "macOS 12 (Monterey)", changelog: [] },
  { target: "macos-x64", version: "0.1.0", available: false, signing: "unsigned", minOsVersion: "macOS 12 (Monterey)", changelog: [] },
  { target: "windows-x64", version: "0.1.0", available: false, signing: "unsigned", minOsVersion: "Windows 10 (1809)", changelog: [] },
  { target: "windows-arm64", version: "0.1.0", available: false, signing: "unsigned", minOsVersion: "Windows 11", changelog: [] },
];
