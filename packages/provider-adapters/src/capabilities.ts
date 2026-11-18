/**
 * Capability matrix per connector — what MAINDY can honestly do through each integration path.
 * Sources: docs/research/claude-code-official-interfaces.md, docs/research/providers-codex-pricing.md.
 * Rendered by web/desktop; kept in sync with docs/INTEGRATIONS-MATRIX.md.
 */
import type { ConnectorCapabilities, ConnectorKind } from "@maindy/contracts";

export interface ConnectorCapabilityEntry {
  kind: ConnectorKind;
  capabilities: ConnectorCapabilities;
  /** pt-BR, shown in UI */
  limitations: string[];
}

export const CONNECTOR_CAPABILITIES: Record<ConnectorKind, ConnectorCapabilityEntry> = {
  openai_api: {
    kind: "openai_api",
    capabilities: {
      observeUsage: "supported",
      observeCost: "supported",
      officialQuota: "not_supported",
      cache: "supported",
      compression: "supported",
      routing: "partial",
      qualityGuard: "partial",
    },
    limitations: [
      "Custo calculado com a tabela de preços de lista versionada; descontos contratuais não aparecem.",
      "Streams interrompidos antes do chunk final de uso ficam com tokens estimados.",
      "Roteamento de modelo só com mapeamento explícito na política.",
    ],
  },
  anthropic_api: {
    kind: "anthropic_api",
    capabilities: {
      observeUsage: "supported",
      observeCost: "supported",
      officialQuota: "not_supported",
      cache: "supported",
      compression: "supported",
      routing: "partial",
      qualityGuard: "partial",
    },
    limitations: [
      "Custo calculado com a tabela de preços de lista versionada.",
      "Dicas de prompt caching só quando o cliente ainda não usa cache_control.",
      "Contagem local de tokens para Claude é estimativa (sem tokenizador oficial local).",
    ],
  },
  openai_compatible: {
    kind: "openai_compatible",
    capabilities: {
      observeUsage: "supported",
      observeCost: "partial",
      officialQuota: "not_supported",
      cache: "supported",
      compression: "supported",
      routing: "partial",
      qualityGuard: "partial",
    },
    limitations: [
      "Execução local (Ollama) tem custo de API zero; o custo de energia/hardware não é medido.",
      "Modelos fora da tabela de preços ficam com custo indisponível.",
    ],
  },
  local_agent_sdk: {
    kind: "local_agent_sdk",
    capabilities: {
      observeUsage: "supported",
      observeCost: "supported",
      officialQuota: "not_supported",
      cache: "supported",
      compression: "supported",
      routing: "partial",
      qualityGuard: "partial",
    },
    limitations: ["Requer apontar o base URL do SDK para o gateway local (http://127.0.0.1:8787)."],
  },
  claude_code: {
    kind: "claude_code",
    capabilities: {
      observeUsage: "supported",
      observeCost: "partial",
      officialQuota: "partial",
      cache: "not_supported",
      compression: "partial",
      routing: "not_supported",
      qualityGuard: "not_supported",
    },
    limitations: [
      "Observabilidade via OpenTelemetry oficial; cost_usd é estimativa a preço de lista do próprio Claude Code, não fatura.",
      "Limites 5h/7d só via status line, apenas Pro/Max e enquanto o Claude Code está aberto.",
      "Compressão apenas de saídas da ferramenta Bash via hook PostToolUse, com fallback para o original.",
      "Assinantes: maindy não intercepta nem reutiliza o login da assinatura (somente observabilidade).",
    ],
  },
  codex: {
    kind: "codex",
    capabilities: {
      observeUsage: "partial",
      observeCost: "partial",
      officialQuota: "planned",
      cache: "partial",
      compression: "not_supported",
      routing: "not_supported",
      qualityGuard: "not_supported",
    },
    limitations: [
      "Telemetria OTel do Codex com nomes de atributos não estáveis; parser tolerante.",
      "Otimização só com API key via model_providers (wire_api = responses); login ChatGPT não é suportado.",
      "Leitura de limites via app-server é experimental.",
    ],
  },
  chat_apps: {
    kind: "chat_apps",
    capabilities: {
      observeUsage: "not_supported",
      observeCost: "not_supported",
      officialQuota: "not_supported",
      cache: "not_supported",
      compression: "not_supported",
      routing: "not_supported",
      qualityGuard: "not_supported",
    },
    limitations: [
      "Apps de chat (Claude/ChatGPT) não expõem API oficial de uso ou interceptação; maindy não captura conversas nem cookies.",
    ],
  },
};
