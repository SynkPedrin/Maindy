import type {
  ConnectorKind,
  QualityEvaluationEvent,
  TechniqueName,
  ConnectorDto,
  GatewayStatus,
  MeDto,
  MeasurementSource,
  Money,
  OrbitPolicyDto,
  QuotaSnapshot,
  RequestUsageEvent,
  SavingsSummary,
} from "@maindy/contracts";

export type {
  ConnectorKind,
  QualityEvaluationEvent,
  TechniqueName,
  ConnectorDto,
  GatewayStatus,
  MeDto,
  MeasurementSource,
  Money,
  OrbitPolicyDto,
  QuotaSnapshot,
  RequestUsageEvent,
  SavingsSummary,
};

export type View = "main" | "notch" | "quick" | "pill" | "snapshot";

export type Settings = {
  apiUrl: string;
  webUrl: string;
  gatewayLocal: boolean;
  notchLauncher: boolean;
  silentMode: boolean;
  demoMode: boolean;
  pillAlwaysOnTop: boolean;
  deviceId: string | null;
  organizationId: string | null;
  /** upstream ids whose key is in the Keychain (ids only) */
  providerKeys: string[];
  upstreamBaseUrls: Record<string, string>;
};

export type SettingsPatch = Partial<
  Pick<Settings, "apiUrl" | "webUrl" | "notchLauncher" | "silentMode" | "demoMode" | "pillAlwaysOnTop">
>;

export type GatewayPhase = "not_installed" | "disabled" | "starting" | "running" | "external" | "crashed";

export type GatewayView = {
  phase: GatewayPhase;
  installed: boolean;
  enabled: boolean;
  healthy: boolean;
  pid: number | null;
  restarts: number;
  lastError: string | null;
  nextRetryInSecs: number | null;
  status: GatewayStatus | null;
  binary: string | null;
};

export type NotchState = "collapsed" | "hover" | "expanded" | "alert" | "active" | "silent";

export type NotchView = {
  available: boolean;
  state: NotchState;
  base: NotchState;
  notchW: number;
  notchH: number;
  frameW: number;
  frameH: number;
  screenName: string | null;
  reduceMotion: boolean;
};

export type LauncherInfo = {
  kind: "notch" | "menubar" | "pill" | "tray";
  notch: NotchView | null;
};

export type Bootstrap = {
  platform: "macos" | "windows" | "linux";
  arch: "arm64" | "x64";
  version: string;
  reduceMotion: boolean;
  settings: Settings;
  paired: boolean;
  sessionRevoked: boolean;
  keychainError: string | null;
  deviceId: string | null;
  organizationId: string | null;
  pairedApiUrl: string | null;
  gateway: GatewayView;
  autostart: boolean;
  launcher: LauncherInfo;
  maindyHome: string;
  gatewayUrl: string;
};

export type PairStartView = {
  userCode: string;
  verificationUrl: string;
  verificationUrlComplete: string;
  expiresIn: number;
  interval: number;
};

export type PairPollView = { status: "pending" | "approved" | "denied" | "expired"; interval: number };

export type PauseResult = { gateway: "ok" | "error" | "skipped"; api: "ok" | "error" | "skipped"; messages: string[]; paused: boolean };

export type CmdError = { code: string; message: string; status: number | null };

export type PillView = { expanded: boolean; alwaysOnTop: boolean };

export type Period = "24h" | "7d" | "30d";

export type Section =
  | "overview"
  | "savings"
  | "integrations"
  | "projects"
  | "limits"
  | "orbit"
  | "quality"
  | "reports"
  | "billing"
  | "settings";

/* ------------------------------ gateway: upstreams & integrations ------------------------------ */

export type UpstreamKind = "openai" | "anthropic" | "openai_compatible";

export type GatewayUpstream = {
  id: string;
  /** gateway may answer with the upstream kind ("openai") or the connector kind ("openai_api") */
  kind: string;
  baseUrl: string;
  hasCredential: boolean;
  credentialSource: "memory" | "env" | "none";
};

export type UpstreamTest = {
  ok: boolean;
  latencyMs: number | null;
  models: string[];
  error: { code: string; message: string } | null;
};

export type UpstreamTestView = { result: UpstreamTest; connector: ConnectorDto | null; connectorError: string | null };

export type ProviderKeyView = { id: string; stored: boolean; pushed: boolean; pushError: string | null; credentialRef: string };

export type StepState = "ok" | "skipped" | "error";
export type StepsView = { keychain: StepState; gateway: StepState; api: StepState; messages: string[] };

export type PushReport = { pushed: string[]; errors: string[] };

export type ProbeView = {
  upstreamId: string;
  upstreamKind: UpstreamKind;
  model: string;
  endpoint: string;
  httpStatus: number;
  latencyMs: number;
  requestId: string | null;
  cache: string | null;
  responseUsage: Record<string, number> | null;
  event: RequestUsageEvent | null;
  error: string | null;
};

export type ClaudeCodeIntegration = {
  detected: boolean;
  installed: boolean;
  settingsPath: string | null;
  otel: boolean;
  statusLine: boolean;
  hook: boolean;
  lastEventAt: string | null;
};

export type CodexIntegration = {
  detected: boolean;
  installed: boolean;
  configPath: string | null;
  otel: boolean;
  lastEventAt: string | null;
};

export type ToolIntegrations = { claudeCode: ClaudeCodeIntegration; codex: CodexIntegration };

export type IntegrationTool = "claude-code" | "codex";

export type IntegrationApplyResult = { ok: boolean; changed: string[]; backupPath: string | null; preview?: unknown };

/** Where the prompt can be opened pre-filled (detected on this machine by the Rust core). */
export type AgentTargets = { vscode: boolean; terminal: boolean; claudeApp: boolean };
export type AgentTarget = "vscode" | "terminal" | "claude_app";

/** "Configurar com o Claude Code": prompt for the user's own AI agent (paths only, never secrets). */
export type AgentSetup = {
  tool: IntegrationTool;
  gatewayCommand: string | null;
  prompt: string | null;
  promptChars: number;
  shellCommand: string | null;
  targets: AgentTargets;
  cwd: string;
};

/** `maindy://` route forwarded by the Rust core (already validated against allowlists). */
export type Route = { section: Section; connector: ConnectorKind | null; pair: boolean };

/* ------------------------------ reports ------------------------------ */

export type ReportEvent = {
  eventId: string;
  occurredAt: string;
  connector: string;
  provider: string;
  model: string;
  status: string;
  projectKey: string | null;
  pricingVersion: string;
  baselineMethod: string;
  validBaseline: boolean;
  currency: string;
  costMicros: number;
  costSource: MeasurementSource;
  baselineCostMicros: number | null;
  baselineSource: MeasurementSource | null;
  netSavingsMicros: number | null;
  inputTokens: number;
  outputTokens: number;
  usageSource: MeasurementSource;
  techniquesApplied: string[];
};

export type ReportPreview = {
  reportVersion: string;
  methodVersion: string;
  generatedAt: string;
  organization: { id: string; name: string; slug: string };
  period: { from: string; to: string };
  currency: string;
  estimatesNotice: string;
  summary: SavingsSummary;
  daily: Array<{ day: string; requests: number; requestsWithBaseline: number; costMicros: number; baselineMicros: number; overheadMicros: number; netSavingsMicros: number }>;
  events: ReportEvent[];
  eventsTotal: number;
  eventsTruncated: boolean;
};

export type ExportView = { cancelled: boolean; path: string | null; fileName: string | null; bytes: number };

/* ------------------------------ projects & agents ------------------------------ */

export type ProjectDto = { id: string; key: string; name: string; description: string | null; createdAt: string; updatedAt: string };
export type AgentDto = ProjectDto & { projectId: string | null };
export type Entity = "projects" | "agents";
export type EntityBody = { key?: string; name?: string; description?: string | null; projectId?: string | null };
