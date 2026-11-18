CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_prefix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baseline_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"method" text NOT NULL,
	"status" text NOT NULL,
	"sample_rate" double precision,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"plan_code" text NOT NULL,
	"interval" text NOT NULL,
	"provider" text NOT NULL,
	"provider_session_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"organization_id" uuid,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"credential_ref" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"device_code_hash" text NOT NULL,
	"user_code" text NOT NULL,
	"device_name" text NOT NULL,
	"platform" text NOT NULL,
	"arch" text NOT NULL,
	"app_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" uuid,
	"device_id" uuid,
	"request_ip_prefix" text,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"arch" text NOT NULL,
	"app_version" text NOT NULL,
	"token_hash" text NOT NULL,
	"approved_by_user_id" uuid,
	"last_ip_prefix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "download_releases" (
	"target" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"available" boolean DEFAULT false NOT NULL,
	"file_name" text,
	"size_bytes" bigint,
	"sha256" text,
	"signing" text DEFAULT 'unsigned' NOT NULL,
	"min_os_version" text NOT NULL,
	"released_at" timestamp with time zone,
	"changelog" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_credential_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connector_kind" text NOT NULL,
	"ref" text NOT NULL,
	"device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid,
	"provider" text NOT NULL,
	"provider_invoice_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"description" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"hosted_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"completed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"techniques" jsonb NOT NULL,
	"quality_sample_rate" double precision NOT NULL,
	"max_added_latency_ms" integer NOT NULL,
	"cache_ttl_seconds" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tagline" text NOT NULL,
	"price_monthly_cents" integer,
	"price_yearly_cents" integer,
	"price_is_starting_at" boolean DEFAULT false NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"provisional" boolean DEFAULT true NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"limits" jsonb NOT NULL,
	"features" jsonb NOT NULL,
	"highlighted" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"stripe_price_monthly" text,
	"stripe_price_yearly" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_quota_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid,
	"provider" text NOT NULL,
	"product" text NOT NULL,
	"window" text NOT NULL,
	"used_percentage" double precision NOT NULL,
	"resets_at" timestamp with time zone,
	"collected_via" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid,
	"evaluation_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"technique" text NOT NULL,
	"method" text NOT NULL,
	"passed" boolean NOT NULL,
	"score" double precision,
	"project_key" text,
	"detail" text,
	"triggered_rollback" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid,
	"event_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"connector" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"endpoint" text NOT NULL,
	"project_key" text,
	"agent_key" text,
	"session_key" text,
	"streaming" boolean NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"latency_ms" integer NOT NULL,
	"orbit_mode" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cached_input_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"usage_source" text NOT NULL,
	"cost_micros" bigint NOT NULL,
	"cost_currency" text NOT NULL,
	"cost_source" text NOT NULL,
	"pricing_version" text NOT NULL,
	"baseline_cost_micros" bigint,
	"baseline_currency" text,
	"baseline_source" text,
	"baseline_method" text NOT NULL,
	"overhead_micros" bigint NOT NULL,
	"overhead_currency" text NOT NULL,
	"overhead_source" text NOT NULL,
	"techniques" jsonb NOT NULL,
	"tokens_avoided" integer NOT NULL,
	"cache_status" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"fallback_original" boolean NOT NULL,
	"error_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "savings_ledger" (
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"currency" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"requests_with_baseline" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"cost_with_baseline_micros" bigint DEFAULT 0 NOT NULL,
	"overhead_micros" bigint DEFAULT 0 NOT NULL,
	"baseline_micros" bigint DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cached_input_tokens" bigint DEFAULT 0 NOT NULL,
	"tokens_avoided" bigint DEFAULT 0 NOT NULL,
	"cache_hits" integer DEFAULT 0 NOT NULL,
	"cache_misses" integer DEFAULT 0 NOT NULL,
	"method_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_ledger_organization_id_day_currency_pk" PRIMARY KEY("organization_id","day","currency")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip_prefix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"status" text NOT NULL,
	"interval" text NOT NULL,
	"provider" text NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_experiments" ADD CONSTRAINT "baseline_experiments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_experiments" ADD CONSTRAINT "baseline_experiments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credential_refs" ADD CONSTRAINT "integration_credential_refs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credential_refs" ADD CONSTRAINT "integration_credential_refs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_policies" ADD CONSTRAINT "optimization_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_quota_snapshots" ADD CONSTRAINT "provider_quota_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_quota_snapshots" ADD CONSTRAINT "provider_quota_snapshots_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_evaluations" ADD CONSTRAINT "quality_evaluations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_evaluations" ADD CONSTRAINT "quality_evaluations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_usage" ADD CONSTRAINT "request_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_usage" ADD CONSTRAINT "request_usage_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_ledger" ADD CONSTRAINT "savings_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_key_uq" ON "agents" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "audit_events_org_time_idx" ON "audit_events" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "baseline_experiments_org_idx" ON "baseline_experiments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_checkouts_org_idx" ON "billing_checkouts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_event_id_uq" ON "billing_events" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connectors_org_kind_uq" ON "connectors" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "device_pairings_device_code_uq" ON "device_pairings" USING btree ("device_code_hash");--> statement-breakpoint
CREATE INDEX "device_pairings_user_code_idx" ON "device_pairings" USING btree ("user_code");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_hash_uq" ON "devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "devices_org_idx" ON "devices" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_tokens_hash_uq" ON "email_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_tokens_user_idx" ON "email_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_credential_refs_org_kind_uq" ON "integration_credential_refs" USING btree ("organization_id","connector_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_provider_invoice_uq" ON "invoices" USING btree ("provider_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_uq" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "optimization_policies_org_uq" ON "optimization_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_key_uq" ON "projects" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "provider_quota_snapshots_latest_idx" ON "provider_quota_snapshots" USING btree ("organization_id","provider","product","window","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "quality_evaluations_eval_id_uq" ON "quality_evaluations" USING btree ("evaluation_id");--> statement-breakpoint
CREATE INDEX "quality_evaluations_org_time_idx" ON "quality_evaluations" USING btree ("organization_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "request_usage_event_id_uq" ON "request_usage" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "request_usage_org_time_idx" ON "request_usage" USING btree ("organization_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_org_uq" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_sub_uq" ON "subscriptions" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");