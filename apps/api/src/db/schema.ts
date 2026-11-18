/**
 * MAINDY control-plane schema (ARCHITECTURE §7).
 *
 * Tenancy rule: every domain table carries `organization_id` and every repository query filters by it.
 * Global (non-tenant) tables: users, email_tokens (user-scoped), plans, download_releases, billing_events
 * (organization_id nullable — a webhook may arrive before we can map it).
 * Money: bigint micros + currency + MeasurementSource (telemetry); plan/invoice amounts in cents of `currency`.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const micros = (name: string) => bigint(name, { mode: "number" });

/* ----------------------------- identity ----------------------------- */

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: ts("email_verified_at"),
    termsAcceptedAt: ts("terms_accepted_at").notNull(),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    passwordChangedAt: ts("password_changed_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("organizations_slug_uq").on(t.slug)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member", "viewer"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** sha256(token) hex — the raw token only ever lives in the cookie */
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipPrefix: text("ip_prefix"),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("sessions_token_hash_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const emailTokens = pgTable(
  "email_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["verify_email", "reset_password"] }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("email_tokens_hash_uq").on(t.tokenHash), index("email_tokens_user_idx").on(t.userId, t.purpose)],
);

/* ----------------------------- billing ----------------------------- */

export const plans = pgTable("plans", {
  code: text("code", { enum: ["starter", "pro", "master_economy"] }).primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  priceMonthlyCents: integer("price_monthly_cents"),
  priceYearlyCents: integer("price_yearly_cents"),
  /** true => UI must render "a partir de" */
  priceIsStartingAt: boolean("price_is_starting_at").notNull().default(false),
  currency: text("currency").notNull().default("BRL"),
  provisional: boolean("provisional").notNull().default(true),
  trialDays: integer("trial_days").notNull().default(0),
  limits: jsonb("limits")
    .$type<{ environments: number | null; projects: number | null; seats: number | null; devices: number | null }>()
    .notNull(),
  features: jsonb("features").$type<string[]>().notNull(),
  highlighted: boolean("highlighted").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  stripePriceMonthly: text("stripe_price_monthly"),
  stripePriceYearly: text("stripe_price_yearly"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    organizationId: orgId(),
    planCode: text("plan_code", { enum: ["starter", "pro", "master_economy"] })
      .notNull()
      .references(() => plans.code),
    status: text("status", { enum: ["trialing", "active", "past_due", "canceled", "incomplete"] }).notNull(),
    interval: text("interval", { enum: ["month", "year"] }).notNull(),
    provider: text("provider", { enum: ["stripe", "sandbox"] }).notNull(),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    trialEndsAt: ts("trial_ends_at"),
    canceledAt: ts("canceled_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    /** v0.1: one subscription row per organization, updated in place */
    uniqueIndex("subscriptions_org_uq").on(t.organizationId),
    uniqueIndex("subscriptions_provider_sub_uq").on(t.providerSubscriptionId),
  ],
);

/** Pending checkout record (sandbox or Stripe Checkout Session). */
export const billingCheckouts = pgTable(
  "billing_checkouts",
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    planCode: text("plan_code", { enum: ["starter", "pro", "master_economy"] })
      .notNull()
      .references(() => plans.code),
    interval: text("interval", { enum: ["month", "year"] }).notNull(),
    provider: text("provider", { enum: ["stripe", "sandbox"] }).notNull(),
    providerSessionId: text("provider_session_id"),
    status: text("status", { enum: ["pending", "completed", "expired"] }).notNull().default("pending"),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("billing_checkouts_org_idx").on(t.organizationId)],
);

export const billingEvents = pgTable(
  "billing_events",
  {
    id: id(),
    /** provider event id (Stripe evt_…, or sandbox:checkout:<id>) — idempotency key */
    eventId: text("event_id").notNull(),
    provider: text("provider", { enum: ["stripe", "sandbox"] }).notNull(),
    type: text("type").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    /** minimal, non-sensitive summary — never full card/customer PII */
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    processedAt: ts("processed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("billing_events_event_id_uq").on(t.eventId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    organizationId: orgId(),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    provider: text("provider", { enum: ["stripe", "sandbox"] }).notNull(),
    providerInvoiceId: text("provider_invoice_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    status: text("status", { enum: ["draft", "open", "paid", "uncollectible", "void", "failed"] }).notNull(),
    description: text("description"),
    periodStart: ts("period_start"),
    periodEnd: ts("period_end"),
    hostedUrl: text("hosted_url"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invoices_provider_invoice_uq").on(t.providerInvoiceId), index("invoices_org_idx").on(t.organizationId)],
);

/* ----------------------------- devices ----------------------------- */

export const devices = pgTable(
  "devices",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    platform: text("platform", { enum: ["macos", "windows", "linux"] }).notNull(),
    arch: text("arch", { enum: ["arm64", "x64"] }).notNull(),
    appVersion: text("app_version").notNull(),
    /** sha256(deviceToken) hex */
    tokenHash: text("token_hash").notNull(),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    lastIpPrefix: text("last_ip_prefix"),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("devices_token_hash_uq").on(t.tokenHash), index("devices_org_idx").on(t.organizationId)],
);

export const devicePairings = pgTable(
  "device_pairings",
  {
    id: id(),
    /** null until a web user of an org approves/denies */
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    deviceCodeHash: text("device_code_hash").notNull(),
    userCode: text("user_code").notNull(),
    deviceName: text("device_name").notNull(),
    platform: text("platform", { enum: ["macos", "windows", "linux"] }).notNull(),
    arch: text("arch", { enum: ["arm64", "x64"] }).notNull(),
    appVersion: text("app_version").notNull(),
    status: text("status", { enum: ["pending", "approved", "denied", "consumed"] }).notNull().default("pending"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    requestIpPrefix: text("request_ip_prefix"),
    expiresAt: ts("expires_at").notNull(),
    decidedAt: ts("decided_at"),
    lastPolledAt: ts("last_polled_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("device_pairings_device_code_uq").on(t.deviceCodeHash), index("device_pairings_user_code_idx").on(t.userCode)],
);

/* ----------------------------- connectors ----------------------------- */

export const connectors = pgTable(
  "connectors",
  {
    id: id(),
    organizationId: orgId(),
    kind: text("kind", {
      enum: ["openai_api", "anthropic_api", "openai_compatible", "local_agent_sdk", "claude_code", "codex", "chat_apps"],
    }).notNull(),
    status: text("status", {
      enum: ["not_connected", "connected_read_only", "optimization_active", "attention", "unavailable"],
    }).notNull(),
    credentialRef: text("credential_ref"),
    lastSyncAt: ts("last_sync_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("connectors_org_kind_uq").on(t.organizationId, t.kind)],
);

export const integrationCredentialRefs = pgTable(
  "integration_credential_refs",
  {
    id: id(),
    organizationId: orgId(),
    connectorKind: text("connector_kind").notNull(),
    /** where the secret lives ("keychain:maindy/openai") — NEVER the secret */
    ref: text("ref").notNull(),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("integration_credential_refs_org_kind_uq").on(t.organizationId, t.connectorKind)],
);

/* ----------------------------- projects / agents ----------------------------- */

export const projects = pgTable(
  "projects",
  {
    id: id(),
    organizationId: orgId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("projects_org_key_uq").on(t.organizationId, t.key)],
);

export const agents = pgTable(
  "agents",
  {
    id: id(),
    organizationId: orgId(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agents_org_key_uq").on(t.organizationId, t.key)],
);

/* ----------------------------- ORBIT ----------------------------- */

export type TechniqueStateRow = {
  name: string;
  enabled: boolean;
  rolledBack: boolean;
  rolledBackReason: string | null;
};

export const optimizationPolicies = pgTable(
  "optimization_policies",
  {
    id: id(),
    organizationId: orgId(),
    mode: text("mode", { enum: ["observe", "conservative", "balanced", "maximum"] }).notNull(),
    paused: boolean("paused").notNull().default(false),
    techniques: jsonb("techniques").$type<TechniqueStateRow[]>().notNull(),
    qualitySampleRate: doublePrecision("quality_sample_rate").notNull(),
    maxAddedLatencyMs: integer("max_added_latency_ms").notNull(),
    cacheTtlSeconds: integer("cache_ttl_seconds").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("optimization_policies_org_uq").on(t.organizationId)],
);

export const baselineExperiments = pgTable(
  "baseline_experiments",
  {
    id: id(),
    organizationId: orgId(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    method: text("method", { enum: ["cache_replay", "pre_optimization_tokens", "paired_sample"] }).notNull(),
    status: text("status", { enum: ["planned", "running", "completed", "aborted"] }).notNull(),
    sampleRate: doublePrecision("sample_rate"),
    startedAt: ts("started_at"),
    endedAt: ts("ended_at"),
    createdAt: createdAt(),
  },
  (t) => [index("baseline_experiments_org_idx").on(t.organizationId)],
);

/* ----------------------------- telemetry ----------------------------- */

export type TechniqueApplicationRow = {
  name: string;
  applied: boolean;
  tokensSaved: number;
  source: string;
  detail?: string;
};

export const requestUsage = pgTable(
  "request_usage",
  {
    id: id(),
    organizationId: orgId(),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    /** idempotency key from the edge (UUIDv4) */
    eventId: uuid("event_id").notNull(),
    occurredAt: ts("occurred_at").notNull(),
    connector: text("connector").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    endpoint: text("endpoint").notNull(),
    projectKey: text("project_key"),
    agentKey: text("agent_key"),
    sessionKey: text("session_key"),
    streaming: boolean("streaming").notNull(),
    status: text("status").notNull(),
    httpStatus: integer("http_status"),
    latencyMs: integer("latency_ms").notNull(),
    orbitMode: text("orbit_mode").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cachedInputTokens: integer("cached_input_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    usageSource: text("usage_source").notNull(),
    costMicros: micros("cost_micros").notNull(),
    costCurrency: text("cost_currency").notNull(),
    costSource: text("cost_source").notNull(),
    pricingVersion: text("pricing_version").notNull(),
    baselineCostMicros: micros("baseline_cost_micros"),
    baselineCurrency: text("baseline_currency"),
    baselineSource: text("baseline_source"),
    baselineMethod: text("baseline_method").notNull(),
    overheadMicros: micros("overhead_micros").notNull(),
    overheadCurrency: text("overhead_currency").notNull(),
    overheadSource: text("overhead_source").notNull(),
    techniques: jsonb("techniques").$type<TechniqueApplicationRow[]>().notNull(),
    tokensAvoided: integer("tokens_avoided").notNull(),
    cacheStatus: text("cache_status").notNull(),
    promptHash: text("prompt_hash").notNull(),
    fallbackOriginal: boolean("fallback_original").notNull(),
    errorCode: text("error_code"),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("request_usage_event_id_uq").on(t.eventId),
    index("request_usage_org_time_idx").on(t.organizationId, t.occurredAt.desc(), t.id.desc()),
  ],
);

export const qualityEvaluations = pgTable(
  "quality_evaluations",
  {
    id: id(),
    organizationId: orgId(),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    evaluationId: uuid("evaluation_id").notNull(),
    occurredAt: ts("occurred_at").notNull(),
    technique: text("technique").notNull(),
    method: text("method").notNull(),
    passed: boolean("passed").notNull(),
    score: doublePrecision("score"),
    projectKey: text("project_key"),
    detail: text("detail"),
    triggeredRollback: boolean("triggered_rollback").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("quality_evaluations_eval_id_uq").on(t.evaluationId),
    index("quality_evaluations_org_time_idx").on(t.organizationId, t.occurredAt.desc()),
  ],
);

/** Daily aggregate (UTC day) of request_usage — updated in the same transaction as the ingest. */
export const savingsLedger = pgTable(
  "savings_ledger",
  {
    organizationId: orgId(),
    day: date("day", { mode: "string" }).notNull(),
    currency: text("currency").notNull(),
    requests: integer("requests").notNull().default(0),
    requestsWithBaseline: integer("requests_with_baseline").notNull().default(0),
    costMicros: micros("cost_micros").notNull().default(0),
    costWithBaselineMicros: micros("cost_with_baseline_micros").notNull().default(0),
    overheadMicros: micros("overhead_micros").notNull().default(0),
    baselineMicros: micros("baseline_micros").notNull().default(0),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "number" }).notNull().default(0),
    tokensAvoided: bigint("tokens_avoided", { mode: "number" }).notNull().default(0),
    cacheHits: integer("cache_hits").notNull().default(0),
    cacheMisses: integer("cache_misses").notNull().default(0),
    methodVersion: text("method_version").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.day, t.currency] })],
);

export const providerQuotaSnapshots = pgTable(
  "provider_quota_snapshots",
  {
    id: id(),
    organizationId: orgId(),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    product: text("product").notNull(),
    window: text("window").notNull(),
    usedPercentage: doublePrecision("used_percentage").notNull(),
    resetsAt: ts("resets_at"),
    collectedVia: text("collected_via").notNull(),
    capturedAt: ts("captured_at").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [index("provider_quota_snapshots_latest_idx").on(t.organizationId, t.provider, t.product, t.window, t.capturedAt.desc())],
);

/* ----------------------------- releases / onboarding / audit ----------------------------- */

export const downloadReleases = pgTable("download_releases", {
  target: text("target", { enum: ["macos-arm64", "macos-x64", "windows-x64", "windows-arm64"] }).primaryKey(),
  version: text("version").notNull(),
  available: boolean("available").notNull().default(false),
  fileName: text("file_name"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  sha256: text("sha256"),
  signing: text("signing", { enum: ["unsigned", "adhoc", "developer_id", "notarized", "authenticode"] })
    .notNull()
    .default("unsigned"),
  minOsVersion: text("min_os_version").notNull(),
  releasedAt: ts("released_at"),
  changelog: jsonb("changelog").$type<string[]>().notNull().default([]),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const onboardingProgress = pgTable("onboarding_progress", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  completed: jsonb("completed").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  dismissed: boolean("dismissed").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    organizationId: orgId(),
    actorType: text("actor_type", { enum: ["user", "device", "system", "billing"] }).notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipPrefix: text("ip_prefix"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_org_time_idx").on(t.organizationId, t.createdAt.desc())],
);
