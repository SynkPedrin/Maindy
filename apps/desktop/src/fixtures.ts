/**
 * Demonstration fixtures — client-side only, never sent to any tenant.
 * Every screen that renders these shows "Demonstração — dados simulados".
 */
import type { FullBridge, Ops } from "./bridge";
import type {
  AgentDto,
  AgentSetup,
  AgentTargets,
  IntegrationTool,
  Bootstrap,
  CmdError,
  GatewayUpstream,
  ProjectDto,
  QualityEvaluationEvent,
  ReportPreview,
  ToolIntegrations,
  ConnectorDto,
  GatewayView,
  MeDto,
  NotchView,
  OrbitPolicyDto,
  QuotaSnapshot,
  RequestUsageEvent,
  SavingsSummary,
  Settings,
} from "./types";

export const DEMO_LABEL = "Demonstração — dados simulados";

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const usd = (v: number, source: SavingsSummary["netSavings"]["source"]) => ({
  micros: Math.round(v * 1_000_000),
  currency: "USD",
  source,
});

export function demoMe(): MeDto {
  return {
    user: { id: "demo-user", email: "demo@maindy.invalid", name: "Visitante", emailVerified: true, createdAt: iso(86400e3 * 20) },
    organization: { id: "demo-org", name: "Organização de demonstração", slug: "demo" },
    role: "owner",
    subscription: {
      id: "demo-sub",
      planCode: "pro",
      status: "trialing",
      interval: "month",
      provider: "sandbox",
      currentPeriodEnd: iso(-86400e3 * 9),
      cancelAtPeriodEnd: false,
      trialEndsAt: iso(-86400e3 * 9),
    },
    onboarding: { completed: ["plan_selected", "device_paired"], dismissed: false, updatedAt: iso(3600e3) },
  };
}

export function demoSummary(period: string): SavingsSummary {
  const f = period === "24h" ? 1 / 7 : period === "30d" ? 4.2 : 1;
  const opt = 38.42 * f;
  const over = 0.61 * f;
  const base = 52.1 * f;
  return {
    from: iso(period === "24h" ? 86400e3 : period === "30d" ? 30 * 86400e3 : 7 * 86400e3),
    to: iso(0),
    currency: "USD",
    requests: Math.round(1842 * f),
    optimizedAiCost: usd(opt, "provider_reported"),
    overheadCost: usd(over, "locally_measured"),
    baselineCost: usd(base, "experimentally_estimated"),
    grossSavings: usd(base - opt, "experimentally_estimated"),
    netSavings: usd(base - opt - over, "experimentally_estimated"),
    efficiencyMultiplier: Math.round((base / (opt + over)) * 100) / 100,
    tokens: {
      input: Math.round(9_420_000 * f),
      output: Math.round(1_180_000 * f),
      cachedInput: Math.round(2_100_000 * f),
      avoided: Math.round(2_960_000 * f),
      avoidedSource: "experimentally_estimated",
    },
    cache: { hits: Math.round(412 * f), misses: Math.round(1430 * f) },
    quality: { evaluations: Math.round(186 * f), passed: Math.round(183 * f), rollbacks: 1 },
    baselineCoverage: 0.71,
    methodVersion: "orbit-savings-v1",
  };
}

function ev(i: number, p: Partial<RequestUsageEvent>): RequestUsageEvent {
  return {
    eventId: `${(0x1a2b3c4d + i * 0x9e3779b).toString(16).slice(-8).padStart(8, "0")}-0000-4000-8000-${String(i).padStart(12, "0")}`,
    occurredAt: iso(i * 7 * 60e3),
    connector: "claude_code",
    provider: "anthropic",
    model: "claude-sonnet",
    endpoint: "/v1/messages",
    projectKey: "api-checkout",
    agentKey: "refactor-bot",
    sessionKey: "sess-a1",
    streaming: true,
    status: "ok",
    httpStatus: 200,
    latencyMs: 1840,
    orbitMode: "balanced",
    usage: { inputTokens: 18_400, outputTokens: 1_250, cachedInputTokens: 6_000, cacheWriteTokens: 0, source: "provider_reported" },
    cost: usd(0.071, "provider_reported"),
    pricingVersion: "2026-11",
    baselineCost: usd(0.094, "experimentally_estimated"),
    baselineMethod: "pre_optimization_tokens",
    overheadCost: usd(0.0008, "locally_measured"),
    techniques: [{ name: "tool_output_compression", applied: true, tokensSaved: 5_900, source: "locally_measured" }],
    cache: { status: "miss" },
    promptHash: "a".repeat(64),
    fallbackOriginal: false,
    errorCode: null,
    ...p,
  };
}

export function demoRuns(): RequestUsageEvent[] {
  return [
    ev(0, {}),
    ev(1, { status: "cache_hit", cache: { status: "hit" }, cost: usd(0, "provider_reported"), baselineMethod: "cache_replay", latencyMs: 12, techniques: [{ name: "exact_cache", applied: true, tokensSaved: 21_000, source: "locally_measured" }] }),
    ev(2, { connector: "codex", provider: "openai", model: "gpt-5-codex", endpoint: "/v1/responses", projectKey: "mobile-app", agentKey: "codex-cli", sessionKey: "sess-b7", usage: { inputTokens: 42_000, outputTokens: 3_100, cachedInputTokens: 20_000, cacheWriteTokens: 0, source: "provider_reported" }, cost: usd(0.118, "provider_reported") }),
    ev(3, { connector: "openai_compatible", provider: "ollama", model: "qwen3.5:4b", endpoint: "/v1/chat/completions", projectKey: "docs-site", agentKey: "summarizer", sessionKey: "sess-c2", cost: usd(0, "locally_measured"), baselineCost: null, baselineMethod: "none", techniques: [], usage: { inputTokens: 3_200, outputTokens: 410, cachedInputTokens: 0, cacheWriteTokens: 0, source: "locally_measured" } }),
    ev(4, { status: "fallback", fallbackOriginal: true, techniques: [], baselineCost: null, baselineMethod: "none" }),
    ev(5, { techniques: [{ name: "loop_guard", applied: true, tokensSaved: 12_000, source: "locally_measured", detail: "3 chamadas idênticas" }], status: "blocked", cost: usd(0, "provider_reported") }),
    ev(6, { sessionKey: "sess-b7", connector: "codex", provider: "openai", model: "gpt-5-codex", projectKey: "mobile-app", agentKey: "codex-cli" }),
  ];
}

export function demoConnectors(): ConnectorDto[] {
  const st = demoState();
  const caps = (o: Partial<ConnectorDto["capabilities"]> = {}): ConnectorDto["capabilities"] => ({
    observeUsage: "supported",
    observeCost: "supported",
    officialQuota: "not_supported",
    cache: "supported",
    compression: "supported",
    routing: "partial",
    qualityGuard: "supported",
    ...o,
  });
  return [
    { kind: "openai_api", name: "OpenAI API", description: "Sua chave da OpenAI (BYOK) usada pelo gateway local. Tokens e custo medidos a partir do objeto usage da própria API.", capabilities: caps(), limitations: ["Custo calculado pela tabela de preços versionada; a fatura oficial da OpenAI é a fonte final."], status: st.keys.has("openai") ? "optimization_active" : "not_connected", lastSyncAt: st.keys.has("openai") ? iso(9 * 60e3) : null, credentialRef: st.keys.has("openai") ? "keychain:maindy/provider:openai" : null },
    { kind: "anthropic_api", name: "Anthropic API", description: "Sua chave da Anthropic (BYOK) usada pelo gateway local em /v1/messages.", capabilities: caps(), limitations: ["Descontos de prompt caching nativos já entram no baseline e não contam como economia da maindy."], status: st.connected.has("anthropic_api") ? "connected_read_only" : "not_connected", lastSyncAt: st.connected.has("anthropic_api") ? iso(0) : null, credentialRef: st.keys.has("anthropic") ? "keychain:maindy/provider:anthropic" : null },
    { kind: "openai_compatible", name: "Endpoint compatível com OpenAI", description: "Ollama, vLLM, LM Studio, OpenRouter… atrás do gateway local.", capabilities: caps({ observeCost: "partial" }), limitations: ["Modelos locais (ex.: Ollama) têm custo de API zero; energia e hardware não são medidos."], status: "connected_read_only", lastSyncAt: iso(60e3), credentialRef: null },
    { kind: "local_agent_sdk", name: "Agentes e SDKs locais", description: "Agentes em TypeScript/Python apontando a base URL para o gateway local.", capabilities: caps(), limitations: ["Atribuição por projeto/agente depende dos headers x-maindy-project / x-maindy-agent."], status: st.probed ? "optimization_active" : "not_connected", lastSyncAt: st.probed ? iso(0) : null, credentialRef: null },
    { kind: "claude_code", name: "Claude Code", description: "Uso e custo pelo OpenTelemetry oficial, limites pela status line e compressão de saídas por hook PostToolUse.", capabilities: caps({ officialQuota: "partial", cache: "not_supported", compression: "partial", routing: "not_supported", qualityGuard: "partial" }), limitations: ["Limites da assinatura só aparecem via status line, apenas em planos Pro/Max e somente enquanto o Claude Code está aberto."], status: st.integrations.claudeCode.installed ? "connected_read_only" : "not_connected", lastSyncAt: st.integrations.claudeCode.lastEventAt, credentialRef: null },
    { kind: "codex", name: "Codex CLI", description: "Observação pelo OpenTelemetry do Codex. Roteamento pelo gateway somente com chave de API.", capabilities: caps({ observeUsage: "partial", observeCost: "partial", officialQuota: "partial", cache: "not_supported", compression: "not_supported", qualityGuard: "not_supported" }), limitations: ["Roteamento pelo gateway só funciona com chave de API (wire_api = responses)."], status: st.integrations.codex.installed ? "connected_read_only" : "not_connected", lastSyncAt: st.integrations.codex.lastEventAt, credentialRef: null },
    { kind: "chat_apps", name: "Apps de chat (Claude, ChatGPT)", description: "Os aplicativos de chat do Claude e do ChatGPT não oferecem API oficial para otimização por terceiros.", capabilities: caps({ observeUsage: "not_supported", observeCost: "not_supported", cache: "not_supported", compression: "not_supported", routing: "not_supported", qualityGuard: "not_supported" }), limitations: ["Não há API oficial para otimizar os apps de chat do Claude ou do ChatGPT.", "A maindy nunca captura o histórico de conversas nem lê dados de outros aplicativos.", "Para economizar, use a API (BYOK) pelo gateway ou as integrações de Claude Code/Codex."], status: "unavailable", lastSyncAt: null, credentialRef: null },
  ];
}

export function demoPolicy(paused = false): OrbitPolicyDto {
  const st = demoState();
  if (st.policy) return { ...st.policy, paused };
  const on = ["exact_cache", "loop_guard", "retry_budget", "tool_output_compression", "context_dedup", "prompt_cache_hints"];
  const all = ["exact_cache", "semantic_cache", "tool_output_compression", "context_dedup", "loop_guard", "retry_budget", "output_budget", "model_routing", "prompt_cache_hints"] as const;
  return {
    mode: "balanced",
    paused,
    techniques: all.map((name) => ({
      name,
      enabled: on.includes(name) && name !== "context_dedup",
      rolledBack: name === "context_dedup",
      rolledBackReason: name === "context_dedup" ? "Regressão em 1 avaliação de testes (api-checkout)." : null,
    })),
    qualitySampleRate: 0.1,
    maxAddedLatencyMs: 150,
    cacheTtlSeconds: 86400,
    updatedAt: iso(2 * 3600e3),
    version: 7,
  };
}

export function demoLimits(): QuotaSnapshot[] {
  return [
    { provider: "anthropic", product: "claude_code_subscription", window: "five_hour", usedPercentage: 42, resetsAt: iso(-2.2 * 3600e3), collectedVia: "claude_code.statusline", capturedAt: iso(3 * 60e3) },
    { provider: "anthropic", product: "claude_code_subscription", window: "seven_day", usedPercentage: 18, resetsAt: iso(-4 * 86400e3), collectedVia: "claude_code.statusline", capturedAt: iso(3 * 60e3) },
  ];
}

export function demoGateway(): GatewayView {
  return {
    phase: "running",
    installed: true,
    enabled: true,
    healthy: true,
    pid: 4242,
    restarts: 0,
    lastError: null,
    nextRetryInSecs: null,
    binary: null,
    status: {
      version: "0.1.0",
      uptimeSeconds: 5 * 3600,
      mode: "balanced",
      paused: false,
      upstreams: [],
      counters: { requests: 264, cacheHits: 59, errors: 1, tokensIn: 1_340_000, tokensOut: 168_000, tokensAvoided: 423_000, pendingTelemetry: 0 },
      linkedToCloud: true,
    },
  };
}

/** Same paths as the real API, answered from fixtures (used by demo mode and browser snapshots). */
export function demoApi(path: string, query?: Record<string, string>, paused = false): unknown {
  switch (path) {
    case "/v1/me":
      return demoMe();
    case "/v1/stats/summary": {
      const span = query?.from ? now - Date.parse(query.from) : 7 * 86400e3;
      return demoSummary(span <= 86400e3 + 1e3 ? "24h" : span > 8 * 86400e3 ? "30d" : "7d");
    }
    case "/v1/runs":
      return { items: demoRuns(), nextCursor: null };
    case "/v1/connectors":
      return demoConnectors();
    case "/v1/orbit/policy":
      return demoPolicy(paused);
    case "/v1/limits":
      return demoLimits();
    case "/v1/quality/evaluations":
      return demoEvaluations();
    case "/v1/projects":
      return demoState().projects;
    case "/v1/agents":
      return demoState().agents;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Demo operations (stateful, client-side only — nothing leaves this window)                 */
/* ------------------------------------------------------------------------------------------ */

type DemoState = {
  keys: Set<string>;
  connected: Set<string>;
  probed: boolean;
  baseUrls: Record<string, string>;
  integrations: ToolIntegrations;
  projects: ProjectDto[];
  agents: AgentDto[];
  policy: OrbitPolicyDto | null;
  offline: boolean;
};

let state: DemoState | null = null;

function demoState(): DemoState {
  if (!state) {
    state = {
      keys: new Set(["openai"]),
      connected: new Set(),
      probed: false,
      baseUrls: {},
      integrations: {
        claudeCode: { detected: true, installed: false, settingsPath: "~/.claude/settings.json", otel: false, statusLine: false, hook: false, lastEventAt: null },
        codex: { detected: true, installed: true, configPath: "~/.codex/config.toml", otel: true, lastEventAt: iso(26 * 60e3) },
      },
      projects: [
        { id: "8d1c2f00-0000-4000-8000-000000000001", key: "api-checkout", name: "API de checkout", description: "Refactors e testes do serviço de pagamentos", createdAt: iso(12 * 86400e3), updatedAt: iso(2 * 86400e3) },
        { id: "8d1c2f00-0000-4000-8000-000000000002", key: "mobile-app", name: "App mobile", description: null, createdAt: iso(9 * 86400e3), updatedAt: iso(9 * 86400e3) },
        { id: "8d1c2f00-0000-4000-8000-000000000003", key: "docs-site", name: "Site de documentação", description: "Resumos com modelo local", createdAt: iso(3 * 86400e3), updatedAt: iso(3 * 86400e3) },
      ],
      agents: [
        { id: "9e2d3a00-0000-4000-8000-000000000001", key: "refactor-bot", name: "Refactor bot", description: null, projectId: "8d1c2f00-0000-4000-8000-000000000001", createdAt: iso(12 * 86400e3), updatedAt: iso(12 * 86400e3) },
        { id: "9e2d3a00-0000-4000-8000-000000000002", key: "codex-cli", name: "Codex CLI", description: null, projectId: "8d1c2f00-0000-4000-8000-000000000002", createdAt: iso(9 * 86400e3), updatedAt: iso(9 * 86400e3) },
        { id: "9e2d3a00-0000-4000-8000-000000000003", key: "summarizer", name: "Resumidor", description: null, projectId: "8d1c2f00-0000-4000-8000-000000000003", createdAt: iso(3 * 86400e3), updatedAt: iso(3 * 86400e3) },
      ],
      policy: null,
      offline: false,
    };
  }
  return state;
}

export function demoEvaluations(): QualityEvaluationEvent[] {
  const rows: Array<[number, QualityEvaluationEvent["technique"], QualityEvaluationEvent["method"], boolean, number | null, string | null, string | null, boolean]> = [
    [6, "tool_output_compression", "test_suite", true, 1, "api-checkout", "pnpm test: 214/214 aprovados com saída comprimida", false],
    [19, "exact_cache", "exact_match", true, 1, "api-checkout", null, false],
    [41, "context_dedup", "test_suite", false, 0.82, "api-checkout", "2 testes de integração falharam com contexto deduplicado", true],
    [55, "tool_output_compression", "reference_similarity", true, 0.97, "mobile-app", "similaridade com a resposta de referência", false],
    [80, "loop_guard", "schema_valid", true, 1, "mobile-app", null, false],
    [130, "exact_cache", "exact_match", true, 1, "docs-site", null, false],
    [190, "prompt_cache_hints", "reference_similarity", true, 0.99, "docs-site", null, false],
  ];
  return rows.map(([m, technique, method, passed, score, projectKey, detail, triggeredRollback], i) => ({
    evaluationId: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`,
    occurredAt: iso(m * 60e3),
    technique,
    method,
    passed,
    score,
    projectKey,
    detail,
    triggeredRollback,
  }));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const offlineErr = (): CmdError => ({ code: "gateway_offline", message: "O gateway local não está respondendo. Ative-o em Configurações → Gateway local.", status: null });

function demoUpstreams(): GatewayUpstream[] {
  const st = demoState();
  const src = (id: string): GatewayUpstream["credentialSource"] => (st.keys.has(id) ? "memory" : "none");
  return [
    { id: "openai", kind: "openai", baseUrl: "https://api.openai.com", hasCredential: st.keys.has("openai"), credentialSource: src("openai") },
    { id: "anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com", hasCredential: st.keys.has("anthropic"), credentialSource: src("anthropic") },
    { id: "ollama", kind: "openai_compatible", baseUrl: st.baseUrls.ollama ?? "http://127.0.0.1:11434", hasCredential: st.keys.has("ollama"), credentialSource: src("ollama") },
  ];
}

const DEMO_MODELS: Record<string, string[]> = {
  openai: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5-mini", "gpt-5-codex", "o3", "o4-mini", "text-embedding-3-small", "text-embedding-3-large", "whisper-1", "tts-1"],
  anthropic: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
  ollama: ["qwen3.5:4b", "nomic-embed-text:latest"],
};

const CLAUDE_PREVIEW = `--- ~/.claude/settings.json
+++ ~/.claude/settings.json (maindy.)
@@ env @@
+  "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
+  "OTEL_LOGS_EXPORTER": "otlp",
+  "OTEL_METRICS_EXPORTER": "otlp",
+  "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
+  "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:8787",
@@ statusLine @@
+  "statusLine": { "type": "command", "command": "~/.maindy/bin/maindy-statusline", "padding": 0 }
@@ hooks.PostToolUse @@
+  { "matcher": "Bash", "hooks": [{ "type": "command", "command": "~/.maindy/bin/maindy-compress-hook" }] }`;

const CODEX_PREVIEW = `--- ~/.codex/config.toml
+++ ~/.codex/config.toml (maindy.)
+[otel]
+exporter = { otlp-http = { endpoint = "http://127.0.0.1:8787/v1/logs", protocol = "json" } }
+log_user_prompt = false`;

const DEMO_GW = `"/Applications/maindy.app/Contents/MacOS/maindy-gateway"`;

/** Same text as src-tauri/src/agent.rs `build_prompt` (the real one is generated by the Rust core). */
export function demoAgentPrompt(tool: IntegrationTool, gw = DEMO_GW): string {
  const cmd = `${gw} integrations ${tool}`;
  return tool === "claude-code"
    ? "Configure a integração da maindy. com o Claude Code nesta máquina, usando só o CLI do gateway local da maindy.:\n" +
        `1. Rode \`${cmd} install --dry-run\` e me mostre as mudanças propostas.\n` +
        "2. Pergunte se eu concordo. Só depois do meu sim, rode o mesmo comando sem --dry-run.\n" +
        `3. Rode \`${cmd} status\` e confirme que OpenTelemetry, status line e hook estão ativos.\n` +
        "4. Explique que preciso reiniciar o Claude Code para a telemetria valer e que os limites da assinatura só aparecem pela status line.\n" +
        "Não edite nenhum outro arquivo nem rode outros comandos."
    : "Configure a integração da maindy. com o Codex CLI nesta máquina, usando só o CLI do gateway local da maindy.:\n" +
        `1. Rode \`${cmd} install --dry-run\` e me mostre as mudanças propostas.\n` +
        "2. Pergunte se eu concordo. Só depois do meu sim, rode o mesmo comando sem --dry-run.\n" +
        `3. Rode \`${cmd} status\` e confirme que a telemetria aponta para o gateway.\n` +
        "4. Explique que preciso reiniciar o Codex para a telemetria valer.\n" +
        "Não edite nenhum outro arquivo nem rode outros comandos.";
}

function demoTargets(): AgentTargets {
  const t = typeof location !== "undefined" ? new URLSearchParams(location.search).get("targets") : null;
  if (t === "none") return { vscode: false, terminal: false, claudeApp: false };
  if (t === "vscode") return { vscode: true, terminal: false, claudeApp: false };
  return { vscode: true, terminal: true, claudeApp: true };
}

/** Stateful fake of every Ops call (demo mode and browser snapshots). */
export function createDemoOps(scenario = "demo"): Ops {
  const st = demoState();
  if (scenario !== "demo") st.offline = true;
  const gw = async <T,>(ms: number, f: () => T): Promise<T> => {
    await wait(ms);
    if (st.offline) throw offlineErr();
    return f();
  };
  const conn = (kind: string) => demoConnectors().find((c) => c.kind === kind) ?? null;
  return {
    providerKeySave: (id, apiKey) =>
      gw(350, () => {
        if (apiKey.trim().length < 8) throw { code: "invalid_key", message: "A chave parece curta demais. Cole a chave completa.", status: null } satisfies CmdError;
        st.keys.add(id);
        return { id, stored: true, pushed: true, pushError: null, credentialRef: `keychain:maindy/provider:${id}` };
      }),
    providerKeyDelete: (id, connector) =>
      gw(300, () => {
        st.keys.delete(id);
        if (connector) st.connected.delete(connector);
        return { keychain: "ok", gateway: "ok", api: connector ? "ok" : "skipped", messages: [] };
      }),
    gatewayResync: () => gw(200, () => ({ pushed: [...st.keys], errors: [] })),
    gatewayUpstreams: () => gw(120, () => ({ upstreams: demoUpstreams() })),
    gatewayUpstreamSetUrl: (id, baseUrl) =>
      gw(250, () => {
        if (!/^https?:\/\/[^/?#]+/.test(baseUrl.trim())) throw { code: "invalid_url", message: "URL inválida.", status: null } satisfies CmdError;
        st.baseUrls[id] = baseUrl.trim().replace(/\/+$/, "");
        return demoUpstreams().find((u) => u.id === id);
      }),
    gatewayUpstreamTest: (id, connector) =>
      gw(700, () => {
        const has = st.keys.has(id) || id === "ollama";
        if (!has)
          return { result: { ok: false, latencyMs: null, models: [], error: { code: "missing_credential", message: "Nenhuma chave configurada para este provedor." } }, connector: null, connectorError: null };
        if (connector) st.connected.add(connector);
        const latency = id === "ollama" ? 38 : id === "anthropic" ? 512 : 384;
        return { result: { ok: true, latencyMs: latency, models: DEMO_MODELS[id] ?? [], error: null }, connector: connector ? conn(connector) : null, connectorError: null };
      }),
    gatewayProbe: () =>
      gw(900, () => {
        st.probed = true;
        return {
          upstreamId: "openai",
          upstreamKind: "openai",
          model: "gpt-4.1-nano",
          endpoint: "/v1/chat/completions",
          httpStatus: 200,
          latencyMs: 412,
          requestId: "5b0f6c1e-7a2d-4c8e-9f10-2a3b4c5d6e7f",
          cache: "bypass",
          responseUsage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 },
          event: { ...demoRuns()[0]!, eventId: "5b0f6c1e-7a2d-4c8e-9f10-2a3b4c5d6e7f", occurredAt: iso(0), connector: "local_agent_sdk", provider: "openai", model: "gpt-4.1-nano", endpoint: "/v1/chat/completions", projectKey: "maindy-desktop", agentKey: "teste-de-conexao", streaming: false, latencyMs: 412, usage: { inputTokens: 8, outputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, source: "provider_reported" }, cost: usd(0.0000012, "provider_reported"), baselineCost: null, baselineMethod: "none", techniques: [], cache: { status: "bypass" } },
          error: null,
        };
      }),
    integrationsGet: () => gw(150, () => structuredClone(st.integrations)),
    integrationApply: (tool, action, dryRun, _force) =>
      gw(dryRun ? 400 : 650, () => {
        const isCC = tool === "claude-code";
        const path = isCC ? "~/.claude/settings.json" : "~/.codex/config.toml";
        const backupPath = `${path}.maindy-backup-20261118-1432`;
        if (!dryRun) {
          const install = action === "install";
          if (isCC) Object.assign(st.integrations.claudeCode, { installed: install, otel: install, statusLine: install, hook: install });
          else Object.assign(st.integrations.codex, { installed: install, otel: install });
        }
        return { ok: true, changed: [path], backupPath, preview: dryRun ? (action === "install" ? (isCC ? CLAUDE_PREVIEW : CODEX_PREVIEW) : `--- ${path}\n- (remove apenas as chaves adicionadas pela maindy.)`) : undefined };
      }),
    agentSetup: async (tool): Promise<AgentSetup> => {
      await wait(60);
      const prompt = demoAgentPrompt(tool);
      return {
        tool,
        gatewayCommand: DEMO_GW,
        prompt,
        promptChars: [...prompt].length,
        shellCommand: tool === "claude-code" ? `claude '${prompt.replace(/'/g, "'\\''")}'` : null,
        targets: tool === "claude-code" ? demoTargets() : { vscode: false, terminal: false, claudeApp: false },
        cwd: "~",
      };
    },
    // demonstration: nothing is opened; the "agent" finishes the install a few seconds later
    agentOpen: async (tool) => {
      await wait(120);
      window.setTimeout(() => {
        if (tool === "claude-code") Object.assign(st.integrations.claudeCode, { installed: true, otel: true, statusLine: true, hook: true });
        else Object.assign(st.integrations.codex, { installed: true, otel: true });
      }, 4500);
    },
    reportPreview: async (from, to) => {
      await wait(450);
      return demoReport(from, to);
    },
    reportExport: async (from, to, format) => {
      await wait(600);
      const name = `maindy-economia-${from.slice(0, 10)}_${to.slice(0, 10)}.${format}`;
      // demonstration: nothing is written; the path is illustrative and labeled as such in the UI
      return { cancelled: false, path: `~/Downloads/${name}`, fileName: name, bytes: format === "pdf" ? 48_213 : 12_877 };
    },
    revealPath: async () => {},
    entityCreate: async (entity, body) => {
      await wait(300);
      const list = entity === "projects" ? st.projects : st.agents;
      if (list.some((x) => x.key === body.key)) throw { code: "key_taken", message: entity === "projects" ? "Já existe um projeto com esta chave." : "Já existe um agente com esta chave.", status: 409 } satisfies CmdError;
      const row = { id: crypto.randomUUID(), key: body.key ?? "", name: body.name ?? "", description: body.description ?? null, createdAt: iso(0), updatedAt: iso(0), projectId: body.projectId ?? null };
      list.push(row as AgentDto);
      return row;
    },
    entityUpdate: async (entity, id, body) => {
      await wait(250);
      const list: ProjectDto[] = entity === "projects" ? st.projects : st.agents;
      const row = list.find((x) => x.id === id);
      if (row) Object.assign(row, body, { updatedAt: iso(0) });
      return row;
    },
    entityDelete: async (entity, id) => {
      await wait(250);
      if (entity === "projects") st.projects = st.projects.filter((x) => x.id !== id);
      else st.agents = st.agents.filter((x) => x.id !== id);
      return { ok: true };
    },
    orbitPolicyPatch: async (patch) => {
      await wait(300);
      const cur = demoPolicy();
      const p = patch as { mode?: OrbitPolicyDto["mode"]; techniques?: Array<{ name: string; enabled: boolean }> };
      let next: OrbitPolicyDto = { ...cur, version: cur.version + 1, updatedAt: iso(0) };
      if (p.mode && p.mode !== cur.mode) {
        const on = new Set(MODE_ON[p.mode]);
        next = { ...next, mode: p.mode, techniques: cur.techniques.map((t) => ({ ...t, enabled: on.has(t.name) && !t.rolledBack })) };
      }
      for (const t of p.techniques ?? []) {
        next.techniques = next.techniques.map((x) => (x.name === t.name ? (t.enabled ? { ...x, enabled: true, rolledBack: false, rolledBackReason: null } : { ...x, enabled: false }) : x));
      }
      st.policy = next;
      return next;
    },
    orbitRollback: async (technique, reason) => {
      await wait(300);
      const cur = demoPolicy();
      st.policy = { ...cur, version: cur.version + 1, techniques: cur.techniques.map((t) => (t.name === technique ? { ...t, enabled: false, rolledBack: true, rolledBackReason: reason } : t)) };
      return st.policy;
    },
    orbitReactivate: async (technique) => {
      await wait(300);
      const cur = demoPolicy();
      st.policy = { ...cur, version: cur.version + 1, techniques: cur.techniques.map((t) => (t.name === technique ? { ...t, enabled: true, rolledBack: false, rolledBackReason: null } : t)) };
      return st.policy;
    },
  };
}

const MODE_ON: Record<OrbitPolicyDto["mode"], string[]> = {
  observe: [],
  conservative: ["exact_cache", "loop_guard", "retry_budget"],
  balanced: ["exact_cache", "loop_guard", "retry_budget", "tool_output_compression", "context_dedup", "prompt_cache_hints"],
  maximum: ["exact_cache", "loop_guard", "retry_budget", "tool_output_compression", "context_dedup", "prompt_cache_hints", "output_budget", "model_routing"],
};

export function demoReport(from: string, to: string): ReportPreview {
  const span = Date.parse(to) - Date.parse(from);
  const summary = demoSummary(span <= 86400e3 + 1e3 ? "24h" : span > 8 * 86400e3 ? "30d" : "7d");
  const runs = demoRuns();
  return {
    reportVersion: "maindy-savings-report-v1",
    methodVersion: "orbit-savings-v1",
    generatedAt: iso(0),
    organization: { id: "demo-org", name: "Organização de demonstração", slug: "demo" },
    period: { from, to },
    currency: "USD",
    estimatesNotice: "Valores de baseline e economia são ESTIMATIVAS rotuladas (experimentally_estimated). Requisições sem baseline válido não entram na economia.",
    summary,
    daily: [],
    events: runs.map((r) => ({
      eventId: r.eventId,
      occurredAt: r.occurredAt,
      connector: r.connector,
      provider: r.provider,
      model: r.model,
      status: r.status,
      projectKey: r.projectKey,
      pricingVersion: r.pricingVersion,
      baselineMethod: r.baselineMethod,
      validBaseline: r.baselineCost !== null && r.baselineMethod !== "none",
      currency: "USD",
      costMicros: r.cost.micros,
      costSource: r.cost.source,
      baselineCostMicros: r.baselineCost?.micros ?? null,
      baselineSource: r.baselineCost?.source ?? null,
      netSavingsMicros: r.baselineCost ? r.baselineCost.micros - r.cost.micros - r.overheadCost.micros : null,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      usageSource: r.usage.source,
      techniquesApplied: r.techniques.filter((t) => t.applied).map((t) => t.name),
    })),
    eventsTotal: summary.requests,
    eventsTruncated: false,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Browser-only fixture bridge (Vite preview → Playwright snapshots)                          */
/* ------------------------------------------------------------------------------------------ */

function emptyApi(path: string): unknown {
  switch (path) {
    case "/v1/me":
      return { ...demoMe(), subscription: null };
    case "/v1/stats/summary":
      return null;
    case "/v1/runs":
      return { items: [], nextCursor: null };
    case "/v1/connectors":
      return demoConnectors().map((c) => ({ ...c, status: c.kind === "chat_apps" ? "unavailable" : "not_connected", lastSyncAt: null, credentialRef: null }));
    case "/v1/orbit/policy":
      return { ...demoPolicy(false), mode: "observe", techniques: demoPolicy().techniques.map((t) => ({ ...t, enabled: false, rolledBack: false, rolledBackReason: null })) };
    case "/v1/limits":
    case "/v1/quality/evaluations":
    case "/v1/projects":
    case "/v1/agents":
      return [];
    default:
      return null;
  }
}

export function fixtureBridge(params: URLSearchParams): FullBridge {
  const scenario = params.get("scenario") ?? "demo";
  const platform = (params.get("platform") as Bootstrap["platform"]) ?? "macos";
  let paused = params.get("paused") === "1";
  const notchState = (params.get("notch") as NotchView["state"]) ?? "collapsed";
  const settings: Settings = {
    apiUrl: "http://localhost:4100",
    webUrl: "http://localhost:3100",
    gatewayLocal: scenario === "demo",
    notchLauncher: true,
    silentMode: notchState === "silent",
    demoMode: scenario === "demo",
    pillAlwaysOnTop: true,
    deviceId: scenario === "unpaired" ? null : "demo-device",
    organizationId: scenario === "unpaired" ? null : "demo-org",
    providerKeys: scenario === "demo" ? ["openai"] : [],
    upstreamBaseUrls: {},
  };
  const notch: NotchView = {
    available: platform === "macos",
    state: notchState,
    base: notchState === "hover" || notchState === "expanded" ? "active" : notchState,
    notchW: 185,
    notchH: 32,
    frameW: 0,
    frameH: 0,
    screenName: "Tela integrada (simulação)",
    reduceMotion: false,
  };
  const gw: GatewayView =
    scenario === "demo"
      ? demoGateway()
      : { phase: "not_installed", installed: false, enabled: false, healthy: false, pid: null, restarts: 0, lastError: null, nextRetryInSecs: null, status: null, binary: null };
  const noop = async () => {};
  return {
    isTauri: false,
    label: params.get("view") ?? "snapshot",
    bootstrap: async () => ({
      platform,
      arch: "arm64",
      version: "0.1.0",
      reduceMotion: false,
      settings,
      paired: scenario !== "unpaired",
      sessionRevoked: false,
      keychainError: null,
      deviceId: settings.deviceId,
      organizationId: settings.organizationId,
      pairedApiUrl: scenario === "unpaired" ? null : settings.apiUrl,
      gateway: gw,
      autostart: false,
      launcher: { kind: platform === "macos" ? "notch" : "pill", notch },
      maindyHome: "~/.maindy",
      gatewayUrl: "http://127.0.0.1:8787",
    }),
    pairStart: async () => ({
      userCode: "KQ7M-2XWD",
      verificationUrl: "http://localhost:3100/app/dispositivos",
      verificationUrlComplete: "http://localhost:3100/app/dispositivos?code=KQ7M-2XWD",
      expiresIn: 600,
      interval: 3,
    }),
    pairPoll: async () => ({ status: "pending", interval: 3 }),
    pairCancel: noop,
    signOut: noop,
    apiGet: async <T,>(path: string, query?: Record<string, string>) =>
      (scenario === "demo" ? demoApi(path, query, paused) : emptyApi(path)) as T,
    orbitUpdatePolicy: async <T,>(p: T) => p,
    orbitPause: async () => {
      paused = true;
      return { gateway: "ok", api: "ok", messages: [], paused: true };
    },
    orbitResume: async () => {
      paused = false;
      return { gateway: "ok", api: "ok", messages: [], paused: false };
    },
    gatewaySetEnabled: async () => gw,
    settingsUpdate: async (p) => Object.assign(settings, p),
    autostartSet: async (b) => b,
    openExternal: noop,
    openWeb: noop,
    openMain: noop,
    quit: noop,
    notchSetState: noop,
    notchSetBase: noop,
    quickHide: noop,
    pillSetExpanded: noop,
    startDragging: noop,
    routeTake: async () => null,
    on: async () => () => {},
    ...createDemoOps(scenario),
  };
}
