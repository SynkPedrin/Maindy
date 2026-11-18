import type { ConnectorCapabilities, ConnectorKind, ConnectorStatus } from "@maindy/contracts";

/**
 * Static, honest capability catalog per connector (sources: docs/research/*.md).
 * Status per org comes from the `connectors` table; capabilities never come from the client.
 */
export interface ConnectorDefinition {
  kind: ConnectorKind;
  name: string;
  description: string;
  capabilities: ConnectorCapabilities;
  limitations: string[];
  /** statuses a user may set for this connector */
  allowedStatuses: ConnectorStatus[];
}

const ALL_STATUSES: ConnectorStatus[] = ["not_connected", "connected_read_only", "optimization_active", "attention", "unavailable"];

export const CONNECTOR_CATALOG: readonly ConnectorDefinition[] = [
  {
    kind: "openai_api",
    name: "OpenAI API",
    description:
      "Sua chave da OpenAI (BYOK) usada pelo gateway local da maindy. As requisições passam pelo gateway na sua máquina, que mede tokens e custo e aplica o ORBIT conforme a política.",
    capabilities: {
      observeUsage: "supported",
      observeCost: "supported",
      officialQuota: "not_supported",
      cache: "supported",
      compression: "supported",
      routing: "supported",
      qualityGuard: "supported",
    },
    limitations: [
      "A chave fica no Keychain/Credential Manager da sua máquina; a maindy guarda apenas a referência.",
      "Custo calculado pela tabela de preços versionada; a fatura oficial da OpenAI é a fonte final.",
      "Se o stream for interrompido antes do chunk de uso, os tokens ficam como estimados ou indisponíveis.",
    ],
    allowedStatuses: ALL_STATUSES,
  },
  {
    kind: "anthropic_api",
    name: "Anthropic API",
    description:
      "Sua chave da Anthropic (BYOK) usada pelo gateway local em /v1/messages. Uso e custo medidos a partir do objeto usage da própria API.",
    capabilities: {
      observeUsage: "supported",
      observeCost: "supported",
      officialQuota: "not_supported",
      cache: "supported",
      compression: "supported",
      routing: "supported",
      qualityGuard: "supported",
    },
    limitations: [
      "Descontos de prompt caching nativos da Anthropic já entram no baseline e não contam como economia da maindy.",
      "A chave fica na sua máquina; a maindy guarda apenas a referência.",
    ],
    allowedStatuses: ALL_STATUSES,
  },
  {
    kind: "openai_compatible",
    name: "Endpoint compatível com OpenAI",
    description: "Qualquer endpoint compatível com a API da OpenAI (Ollama, vLLM, OpenRouter…) atrás do gateway local.",
    capabilities: {
      observeUsage: "supported",
      observeCost: "partial",
      officialQuota: "not_supported",
      cache: "supported",
      compression: "supported",
      routing: "supported",
      qualityGuard: "supported",
    },
    limitations: [
      "Custo só é calculado quando o modelo está na tabela de preços; modelos locais (ex.: Ollama) têm custo de API zero.",
      "Alguns servidores não retornam uso em streaming; nesses casos os tokens são contados localmente e rotulados.",
    ],
    allowedStatuses: ALL_STATUSES,
  },
  {
    kind: "local_agent_sdk",
    name: "Agentes e SDKs locais",
    description:
      "Agentes em TypeScript/Python (SDKs oficiais da OpenAI/Anthropic) apontando a base URL para o gateway local da maindy.",
    capabilities: {
      observeUsage: "supported",
      observeCost: "supported",
      officialQuota: "not_supported",
      cache: "supported",
      compression: "supported",
      routing: "supported",
      qualityGuard: "supported",
    },
    limitations: [
      "Exige alterar a base URL do SDK para o gateway local (127.0.0.1:8787).",
      "Atribuição por projeto/agente depende dos headers x-maindy-project / x-maindy-agent.",
    ],
    allowedStatuses: ALL_STATUSES,
  },
  {
    kind: "claude_code",
    name: "Claude Code",
    description:
      "Observação de uso e custo pelo OpenTelemetry oficial do Claude Code, limites pela status line e compressão de saídas de ferramentas por hook PostToolUse.",
    capabilities: {
      observeUsage: "supported",
      observeCost: "supported",
      officialQuota: "partial",
      cache: "not_supported",
      compression: "partial",
      routing: "not_supported",
      qualityGuard: "partial",
    },
    limitations: [
      "Custo vem do cost_usd do próprio Claude Code: estimativa a preço de lista, não é a fatura.",
      "Limites da assinatura só aparecem via status line (rate_limits), apenas em planos Pro/Max e somente enquanto o Claude Code está aberto.",
      "Não existe API pública de limites de assinatura; a maindy não usa endpoints internos.",
      "Compressão parcial: só saídas de ferramentas via hook PostToolUse, com fallback para o original.",
      "Em assinaturas (login claude.ai), a maindy não faz cache nem roteamento e não armazena o token da assinatura.",
    ],
    allowedStatuses: ALL_STATUSES,
  },
  {
    kind: "codex",
    name: "Codex CLI",
    description:
      "Observação pelo OpenTelemetry do Codex (desligado por padrão) e leitura opcional de limites pelo app-server. Roteamento pelo gateway somente com chave de API.",
    capabilities: {
      observeUsage: "partial",
      observeCost: "partial",
      officialQuota: "partial",
      cache: "not_supported",
      compression: "not_supported",
      routing: "partial",
      qualityGuard: "not_supported",
    },
    limitations: [
      "Nomes dos atributos de tokens no OTel do Codex ainda não estão confirmados na documentação; a leitura é tolerante e pode faltar dado.",
      "Limites via app-server (account/rateLimits/read) são leitura opcional e dependem da versão instalada.",
      "Roteamento pelo gateway só funciona com chave de API (wire_api = responses). Login com conta ChatGPT via proxy não é suportado.",
    ],
    allowedStatuses: ALL_STATUSES,
  },
  {
    kind: "chat_apps",
    name: "Apps de chat (Claude, ChatGPT)",
    description: "Os aplicativos de chat do Claude e do ChatGPT não oferecem API oficial para otimização por terceiros.",
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
      "Não há API oficial para otimizar os apps de chat do Claude ou do ChatGPT.",
      "A maindy nunca captura o histórico de conversas nem lê dados de outros aplicativos.",
      "Para economizar, use a API (BYOK) pelo gateway ou as integrações de Claude Code/Codex.",
    ],
    allowedStatuses: ["not_connected", "unavailable"],
  },
];

export const CATALOG_BY_KIND = new Map(CONNECTOR_CATALOG.map((c) => [c.kind, c]));

/** credentialRef must point to where the secret lives — never be the secret. */
export const CREDENTIAL_REF_PATTERN = /^(keychain|credman|env|file):[A-Za-z0-9_.:/@-]{1,200}$/;
const SECRET_LIKE = /(sk-[A-Za-z0-9]|sk_live|sk_test|xox[abp]-|ghp_|AKIA[0-9A-Z]{8}|-----BEGIN)/;

export function isValidCredentialRef(ref: string): boolean {
  return CREDENTIAL_REF_PATTERN.test(ref) && !SECRET_LIKE.test(ref);
}
