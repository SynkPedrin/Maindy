/**
 * @maindy/contracts — shared, validated contracts between control plane (apps/api),
 * data plane (apps/gateway), web (apps/web) and desktop (apps/desktop).
 *
 * Rule: anything that crosses a process boundary is defined here with zod.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Measurement provenance — the honesty backbone of the product        */
/* ------------------------------------------------------------------ */

/**
 * Where a number came from. Every money/token figure shown to a user carries one.
 * - provider_reported: returned by the provider (usage object, admin usage API, OTel from the vendor tool)
 * - locally_measured: measured by MAINDY SDK/gateway (e.g. token counts we computed, latency)
 * - experimentally_estimated: a counterfactual vs a validated baseline (savings)
 * - unavailable: no trustworthy source — UI must render "indisponível", never a number
 */
export const MeasurementSource = z.enum([
  "provider_reported",
  "locally_measured",
  "experimentally_estimated",
  "unavailable",
]);
export type MeasurementSource = z.infer<typeof MeasurementSource>;

/** A monetary amount always tagged with its provenance. Amounts in minor-precision decimal string-free micros. */
export const Money = z.object({
  /** micro-units of `currency` (1 USD = 1_000_000 micros). Integers avoid float drift. */
  micros: z.number().int(),
  currency: z.string().length(3).default("USD"),
  source: MeasurementSource,
});
export type Money = z.infer<typeof Money>;

/* ------------------------------------------------------------------ */
/* Plans, billing                                                      */
/* ------------------------------------------------------------------ */

export const PlanCode = z.enum(["starter", "pro", "master_economy"]);
export type PlanCode = z.infer<typeof PlanCode>;

export const BillingInterval = z.enum(["month", "year"]);
export type BillingInterval = z.infer<typeof BillingInterval>;

export const PlanDto = z.object({
  code: PlanCode,
  name: z.string(),
  tagline: z.string(),
  /** price in cents of `currency`; null = "sob consulta" */
  priceMonthlyCents: z.number().int().nullable(),
  priceYearlyCents: z.number().int().nullable(),
  currency: z.string().length(3),
  /** prices are provisional until confirmed commercially */
  provisional: z.boolean(),
  trialDays: z.number().int().min(0),
  limits: z.object({
    environments: z.number().int().nullable(), // null = unlimited/custom
    projects: z.number().int().nullable(),
    seats: z.number().int().nullable(),
    devices: z.number().int().nullable(),
  }),
  features: z.array(z.string()),
  highlighted: z.boolean(),
});
export type PlanDto = z.infer<typeof PlanDto>;

export const SubscriptionStatus = z.enum([
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const SubscriptionDto = z.object({
  id: z.string(),
  planCode: PlanCode,
  status: SubscriptionStatus,
  interval: BillingInterval,
  provider: z.enum(["stripe", "sandbox"]),
  currentPeriodEnd: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  trialEndsAt: z.string().datetime().nullable(),
});
export type SubscriptionDto = z.infer<typeof SubscriptionDto>;

/* ------------------------------------------------------------------ */
/* Identity, tenancy                                                   */
/* ------------------------------------------------------------------ */

export const Role = z.enum(["owner", "admin", "member", "viewer"]);
export type Role = z.infer<typeof Role>;

export const UserDto = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string().datetime(),
});
export type UserDto = z.infer<typeof UserDto>;

export const OrganizationDto = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});
export type OrganizationDto = z.infer<typeof OrganizationDto>;

export const OnboardingStep = z.enum([
  "plan_selected",
  "checkout_completed",
  "app_downloaded",
  "device_paired",
  "connector_added",
  "baseline_started",
  "orbit_activated",
  "first_report",
]);
export type OnboardingStep = z.infer<typeof OnboardingStep>;

export const OnboardingDto = z.object({
  completed: z.array(OnboardingStep),
  dismissed: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type OnboardingDto = z.infer<typeof OnboardingDto>;

export const MeDto = z.object({
  user: UserDto,
  organization: OrganizationDto,
  role: Role,
  subscription: SubscriptionDto.nullable(),
  onboarding: OnboardingDto,
});
export type MeDto = z.infer<typeof MeDto>;

/* ------------------------------------------------------------------ */
/* Auth DTOs                                                           */
/* ------------------------------------------------------------------ */

export const PasswordSchema = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .max(200);

export const SignupRequest = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: PasswordSchema,
  acceptTerms: z.literal(true),
  marketingOptIn: z.boolean().default(false),
  planCode: PlanCode.optional(),
});
export type SignupRequest = z.infer<typeof SignupRequest>;

export const LoginRequest = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const VerifyEmailRequest = z.object({ token: z.string().min(20).max(200) });
export const EmailOnlyRequest = z.object({ email: z.string().trim().toLowerCase().email() });
export const ResetPasswordRequest = z.object({
  token: z.string().min(20).max(200),
  password: PasswordSchema,
});

export const SessionDto = z.object({
  id: z.string(),
  current: z.boolean(),
  kind: z.enum(["web", "device"]),
  userAgent: z.string().nullable(),
  ipPrefix: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});
export type SessionDto = z.infer<typeof SessionDto>;

/** Standard error body for every non-2xx API response. `code` is stable; `message` is pt-BR for UI. */
export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

/* ------------------------------------------------------------------ */
/* Devices (desktop pairing — OAuth 2.0 device authorization style)    */
/* ------------------------------------------------------------------ */

export const DevicePlatform = z.enum(["macos", "windows", "linux"]);
export const DeviceArch = z.enum(["arm64", "x64"]);

export const PairStartRequest = z.object({
  deviceName: z.string().min(1).max(120),
  platform: DevicePlatform,
  arch: DeviceArch,
  appVersion: z.string().max(40),
});
export const PairStartResponse = z.object({
  deviceCode: z.string(),
  /** short human code, e.g. "KQ7M-2XWD" */
  userCode: z.string(),
  verificationUrl: z.string().url(),
  verificationUrlComplete: z.string().url(),
  expiresIn: z.number().int(),
  interval: z.number().int(),
});
export type PairStartResponse = z.infer<typeof PairStartResponse>;
export const PairPollRequest = z.object({ deviceCode: z.string() });
export const PairPollResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("denied") }),
  z.object({ status: z.literal("expired") }),
  z.object({
    status: z.literal("approved"),
    /** opaque bearer token, store in OS keychain only */
    deviceToken: z.string(),
    deviceId: z.string(),
    organizationId: z.string(),
  }),
]);
export type PairPollResponse = z.infer<typeof PairPollResponse>;

export const DeviceDto = z.object({
  id: z.string(),
  name: z.string(),
  platform: DevicePlatform,
  arch: DeviceArch,
  appVersion: z.string(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime().nullable(),
  revoked: z.boolean(),
});
export type DeviceDto = z.infer<typeof DeviceDto>;

/* ------------------------------------------------------------------ */
/* Releases / downloads                                                */
/* ------------------------------------------------------------------ */

export const ReleaseTarget = z.enum(["macos-arm64", "macos-x64", "windows-x64", "windows-arm64"]);
export type ReleaseTarget = z.infer<typeof ReleaseTarget>;

export const ReleaseDto = z.object({
  target: ReleaseTarget,
  version: z.string(),
  /** false => UI shows "Ainda não disponível" and no link */
  available: z.boolean(),
  url: z.string().url().nullable(),
  fileName: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  /** truthful signing state — never claim signed when not */
  signing: z.enum(["unsigned", "adhoc", "developer_id", "notarized", "authenticode"]),
  minOsVersion: z.string(),
  releasedAt: z.string().datetime().nullable(),
  changelog: z.array(z.string()),
});
export type ReleaseDto = z.infer<typeof ReleaseDto>;

/* ------------------------------------------------------------------ */
/* Connectors & capabilities                                           */
/* ------------------------------------------------------------------ */

export const ConnectorKind = z.enum([
  "openai_api", // BYOK OpenAI API through gateway
  "anthropic_api", // BYOK Anthropic API through gateway
  "openai_compatible", // any OpenAI-compatible endpoint (Ollama, vLLM, OpenRouter…)
  "local_agent_sdk", // TS/Python agents pointing to the local gateway
  "claude_code", // Claude Code via OTel + status line + hooks
  "codex", // Codex CLI via OTel / app-server status
  "chat_apps", // Claude/ChatGPT chat apps — partial / not supported
]);
export type ConnectorKind = z.infer<typeof ConnectorKind>;

export const ConnectorStatus = z.enum([
  "not_connected", // Não conectado
  "connected_read_only", // Conectado — somente leitura (observação)
  "optimization_active", // Otimização ativa
  "attention", // Atenção
  "unavailable", // Indisponível
]);
export type ConnectorStatus = z.infer<typeof ConnectorStatus>;

export const CapabilityLevel = z.enum(["supported", "partial", "planned", "not_supported"]);
export type CapabilityLevel = z.infer<typeof CapabilityLevel>;

export const ConnectorCapabilities = z.object({
  observeUsage: CapabilityLevel,
  observeCost: CapabilityLevel,
  officialQuota: CapabilityLevel,
  cache: CapabilityLevel,
  compression: CapabilityLevel,
  routing: CapabilityLevel,
  qualityGuard: CapabilityLevel,
});
export type ConnectorCapabilities = z.infer<typeof ConnectorCapabilities>;

export const ConnectorDto = z.object({
  kind: ConnectorKind,
  name: z.string(),
  description: z.string(),
  capabilities: ConnectorCapabilities,
  limitations: z.array(z.string()),
  status: ConnectorStatus,
  lastSyncAt: z.string().datetime().nullable(),
  /** where the secret lives — never the secret itself */
  credentialRef: z.string().nullable(),
});
export type ConnectorDto = z.infer<typeof ConnectorDto>;

/* ------------------------------------------------------------------ */
/* ORBIT policy                                                        */
/* ------------------------------------------------------------------ */

export const OrbitMode = z.enum(["observe", "conservative", "balanced", "maximum"]);
export type OrbitMode = z.infer<typeof OrbitMode>;

export const TechniqueName = z.enum([
  "exact_cache", // deterministic response cache
  "semantic_cache", // opt-in only; never for dynamic/sensitive data
  "tool_output_compression", // structured compression of logs/tool outputs
  "context_dedup", // dedupe repeated blocks in context
  "loop_guard", // detect repetitive identical calls / agent loops
  "retry_budget", // cap retries, prevent retry storms
  "output_budget", // concise output caps where the client didn't set one
  "model_routing", // policy-driven cheaper model for eligible tasks
  "prompt_cache_hints", // provider prompt-caching breakpoints when eligible
]);
export type TechniqueName = z.infer<typeof TechniqueName>;

export const TechniqueState = z.object({
  name: TechniqueName,
  enabled: z.boolean(),
  /** auto-disabled by Quality Guard after regression */
  rolledBack: z.boolean(),
  rolledBackReason: z.string().nullable(),
});

export const OrbitPolicyDto = z.object({
  mode: OrbitMode,
  paused: z.boolean(),
  techniques: z.array(TechniqueState),
  /** fraction of eligible requests also evaluated by Quality Guard (shadow sampling) */
  qualitySampleRate: z.number().min(0).max(1),
  /** max extra latency (ms) before fallback_original */
  maxAddedLatencyMs: z.number().int().min(0),
  cacheTtlSeconds: z.number().int().min(0),
  updatedAt: z.string().datetime(),
  version: z.number().int(),
});
export type OrbitPolicyDto = z.infer<typeof OrbitPolicyDto>;

/** Which techniques each mode enables by default. */
export const MODE_DEFAULT_TECHNIQUES: Record<OrbitMode, TechniqueName[]> = {
  observe: [],
  conservative: ["exact_cache", "loop_guard", "retry_budget"],
  balanced: ["exact_cache", "loop_guard", "retry_budget", "tool_output_compression", "context_dedup", "prompt_cache_hints"],
  maximum: [
    "exact_cache",
    "loop_guard",
    "retry_budget",
    "tool_output_compression",
    "context_dedup",
    "prompt_cache_hints",
    "output_budget",
    "model_routing",
  ],
};

/* ------------------------------------------------------------------ */
/* Telemetry: the request usage event (metadata only — NO prompt text) */
/* ------------------------------------------------------------------ */

export const UsageTokens = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cachedInputTokens: z.number().int().min(0).default(0),
  cacheWriteTokens: z.number().int().min(0).default(0),
  source: MeasurementSource,
});
export type UsageTokens = z.infer<typeof UsageTokens>;

export const TechniqueApplication = z.object({
  name: TechniqueName,
  applied: z.boolean(),
  /** tokens removed/avoided by this technique for this request */
  tokensSaved: z.number().int().min(0),
  source: MeasurementSource,
  detail: z.string().max(300).optional(),
});
export type TechniqueApplication = z.infer<typeof TechniqueApplication>;

export const RequestUsageEvent = z.object({
  /** idempotency key — UUIDv4 generated at the edge; re-sends must be no-ops */
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  connector: ConnectorKind,
  provider: z.string().max(60), // "openai" | "anthropic" | "ollama" | ...
  model: z.string().max(120),
  endpoint: z.string().max(120), // "/v1/chat/completions"
  projectKey: z.string().max(120).nullable(),
  agentKey: z.string().max(120).nullable(),
  sessionKey: z.string().max(200).nullable(),
  streaming: z.boolean(),
  status: z.enum(["ok", "error", "cache_hit", "blocked", "fallback"]),
  httpStatus: z.number().int().nullable(),
  latencyMs: z.number().int().min(0),
  orbitMode: OrbitMode,
  usage: UsageTokens,
  /** actual AI cost of this request (0 for cache hits) */
  cost: Money,
  pricingVersion: z.string().max(40),
  /** counterfactual cost without MAINDY for this request; null if no valid baseline */
  baselineCost: Money.nullable(),
  baselineMethod: z.enum(["cache_replay", "pre_optimization_tokens", "paired_sample", "none"]),
  /** incremental cost MAINDY added (quality checks, shadow samples, routing probes) */
  overheadCost: Money,
  techniques: z.array(TechniqueApplication),
  cache: z.object({
    status: z.enum(["hit", "miss", "store", "bypass", "disabled"]),
  }),
  /** sha256 of normalized request — lets us detect duplicates without storing text */
  promptHash: z.string().regex(/^[a-f0-9]{64}$/),
  fallbackOriginal: z.boolean(),
  errorCode: z.string().max(80).nullable(),
});
export type RequestUsageEvent = z.infer<typeof RequestUsageEvent>;

export const TelemetryBatch = z.object({
  events: z.array(RequestUsageEvent).min(1).max(500),
});
export type TelemetryBatch = z.infer<typeof TelemetryBatch>;

export const TelemetryIngestResponse = z.object({
  accepted: z.number().int(),
  duplicates: z.number().int(),
});

export const QualityEvaluationEvent = z.object({
  evaluationId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  technique: TechniqueName,
  /** what was compared */
  method: z.enum(["exact_match", "schema_valid", "test_suite", "reference_similarity", "human_review"]),
  passed: z.boolean(),
  score: z.number().min(0).max(1).nullable(),
  projectKey: z.string().nullable(),
  detail: z.string().max(500).nullable(),
  /** true when this evaluation triggered rollback of the technique */
  triggeredRollback: z.boolean(),
});
export type QualityEvaluationEvent = z.infer<typeof QualityEvaluationEvent>;

/** Official/legitimate quota snapshot (e.g. Claude Code status line rate_limits). */
export const QuotaSnapshot = z.object({
  provider: z.string(),
  product: z.string(), // "claude_code_subscription" | "codex" | ...
  window: z.string(), // "five_hour" | "seven_day" | ...
  usedPercentage: z.number().min(0).max(100),
  resetsAt: z.string().datetime().nullable(),
  /** e.g. "claude_code.statusline" — rendered next to the number */
  collectedVia: z.string(),
  capturedAt: z.string().datetime(),
});
export type QuotaSnapshot = z.infer<typeof QuotaSnapshot>;

/* ------------------------------------------------------------------ */
/* Stats & reports                                                     */
/* ------------------------------------------------------------------ */

export const SavingsSummary = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  currency: z.string().length(3),
  requests: z.number().int(),
  /** sum of actual AI cost */
  optimizedAiCost: Money,
  overheadCost: Money,
  /** only requests with a valid baseline contribute */
  baselineCost: Money,
  grossSavings: Money, // baseline - optimizedAi (over requests with baseline)
  netSavings: Money, // baseline - (optimizedAi + overhead)
  /** null when no comparable accepted baseline exists */
  efficiencyMultiplier: z.number().nullable(),
  tokens: z.object({
    input: z.number().int(),
    output: z.number().int(),
    cachedInput: z.number().int(),
    avoided: z.number().int(),
    avoidedSource: MeasurementSource,
  }),
  cache: z.object({ hits: z.number().int(), misses: z.number().int() }),
  quality: z.object({
    evaluations: z.number().int(),
    passed: z.number().int(),
    rollbacks: z.number().int(),
  }),
  /** fraction of requests whose baseline was valid — transparency */
  baselineCoverage: z.number().min(0).max(1),
  methodVersion: z.string(),
});
export type SavingsSummary = z.infer<typeof SavingsSummary>;

/* ------------------------------------------------------------------ */
/* Gateway local status (desktop <-> gateway)                          */
/* ------------------------------------------------------------------ */

export const GatewayStatus = z.object({
  version: z.string(),
  uptimeSeconds: z.number(),
  mode: OrbitMode,
  paused: z.boolean(),
  upstreams: z.array(
    z.object({ id: z.string(), kind: ConnectorKind, baseUrl: z.string(), hasCredential: z.boolean() }),
  ),
  counters: z.object({
    requests: z.number().int(),
    cacheHits: z.number().int(),
    errors: z.number().int(),
    tokensIn: z.number().int(),
    tokensOut: z.number().int(),
    tokensAvoided: z.number().int(),
    pendingTelemetry: z.number().int(),
  }),
  linkedToCloud: z.boolean(),
});
export type GatewayStatus = z.infer<typeof GatewayStatus>;

export const SAVINGS_METHOD_VERSION = "orbit-savings-v1";
