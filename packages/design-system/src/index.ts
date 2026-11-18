/** MAINDY design tokens (source of truth). CSS mirror lives in ./tokens.css. */
export const color = {
  bgPrimary: "#080623",
  bgDeep: "#050417",
  surface1: "#15112E",
  surface2: "#1C1636",
  surface3: "#251D45",
  line: "rgba(190, 183, 214, 0.12)",
  lineStrong: "rgba(190, 183, 214, 0.22)",
  violet: "#8F20FF",
  neon: "#A424FF",
  purpleHighlight: "#C724FF",
  gold: "#FFD21F",
  amber: "#FFB21F",
  fg: "#FAF8FF",
  muted: "#BEB7D6",
  subtle: "#8A83A8",
  success: "#4FD1A1",
  error: "#FF7A6B",
  warning: "#FFC861",
} as const;

export const lightColor = {
  bgPrimary: "#F7F5FC",
  bgDeep: "#EFEBF8",
  surface1: "#FFFFFF",
  surface2: "#F4F1FA",
  surface3: "#E9E4F5",
  line: "rgba(21, 17, 46, 0.10)",
  lineStrong: "rgba(21, 17, 46, 0.18)",
  violet: "#7A12E6",
  neon: "#8F20FF",
  purpleHighlight: "#A51AD6",
  gold: "#B88A00",
  amber: "#B87400",
  fg: "#15112E",
  muted: "#4F4870",
  subtle: "#7A7397",
  success: "#11865C",
  error: "#C8402F",
  warning: "#A46A00",
} as const;

export const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, pill: 999 } as const;
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96, 32: 128 } as const;
export const motion = {
  fast: 150,
  base: 220,
  slow: 350,
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;
export const font = {
  sans: '"Geist", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace',
} as const;

/** pt-BR labels for measurement provenance — used everywhere a number is shown. */
export const measurementLabel = {
  provider_reported: "Reportado pelo provedor",
  locally_measured: "Medido localmente",
  experimentally_estimated: "Estimado vs. baseline",
  unavailable: "Indisponível",
} as const;

export const connectorStatusLabel = {
  not_connected: "Não conectado",
  connected_read_only: "Conectado — somente leitura",
  optimization_active: "Otimização ativa",
  attention: "Atenção",
  unavailable: "Indisponível",
} as const;

export const orbitModeLabel = {
  observe: "Observar",
  conservative: "Conservador",
  balanced: "Equilibrado",
  maximum: "Máximo",
} as const;

export const orbitStages = [
  { key: "O", name: "Observar", summary: "Mede uso real, custos, latência, repetição e perfil de trabalho." },
  { key: "R", name: "Reduzir", summary: "Contexto seletivo, logs estruturados, compressão segura, deduplicação e cache." },
  { key: "B", name: "Balancear", summary: "Escolhe estratégia, modelo e modalidade conforme custo, prazo e exigência de qualidade." },
  { key: "I", name: "Inteligência adaptativa", summary: "Aprende por projeto o que economiza sem regressão; políticas e rollback." },
  { key: "T", name: "Testar", summary: "Valida critérios de aceite e custo líquido; bloqueia otimizações ruins." },
] as const;

/** Format micros of a currency in pt-BR. */
export function formatMoney(micros: number, currency = "USD"): string {
  const value = micros / 1_000_000;
  const digits = Math.abs(value) < 1 && value !== 0 ? 4 : 2;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
}
export function formatTokens(n: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: n >= 100_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
