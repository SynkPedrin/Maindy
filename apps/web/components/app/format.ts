import { formatMoney, formatTokens } from "@maindy/design-system";

export { formatMoney, formatTokens };

export function formatCents(cents: number | null | undefined, currency = "BRL"): string {
  if (cents == null) return "Sob consulta";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function formatPercent(v: number, digits = 0): string {
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: digits }).format(v);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v)} ${units[i]}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "nunca";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.round((t - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return formatDate(iso);
}

export function formatLatency(ms: number | undefined): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

export const techniqueLabel: Record<string, string> = {
  exact_cache: "Cache exato",
  semantic_cache: "Cache semântico",
  tool_output_compression: "Compressão de saídas de ferramentas",
  context_dedup: "Deduplicação de contexto",
  loop_guard: "Proteção contra loops",
  retry_budget: "Orçamento de retentativas",
  output_budget: "Orçamento de saída",
  model_routing: "Roteamento de modelo",
  prompt_cache_hints: "Dicas de prompt caching",
};

export const runStatusLabel: Record<string, string> = {
  ok: "Concluída",
  error: "Erro",
  cache_hit: "Cache",
  blocked: "Bloqueada",
  fallback: "Fallback original",
};

export const connectorKindLabel: Record<string, string> = {
  openai_api: "OpenAI API",
  anthropic_api: "Anthropic API",
  openai_compatible: "OpenAI-compatível",
  local_agent_sdk: "Agentes locais (SDK)",
  claude_code: "Claude Code",
  codex: "Codex",
  chat_apps: "Apps de chat",
};
