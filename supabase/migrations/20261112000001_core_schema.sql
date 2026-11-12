-- MAINDY core schema
-- All personal data lives in the private `maindy` schema, which is NOT exposed
-- through PostgREST. Only the MAINDY API talks to it, and every user request
-- runs with `SET LOCAL ROLE authenticated` + the caller's JWT claims, so Row
-- Level Security applies to the backend too (defence in depth).

create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists maindy;
grant usage on schema maindy to authenticated, service_role;

-- ───────────────────────── helpers ─────────────────────────

create or replace function maindy.immutable_unaccent(text)
returns text
language sql immutable parallel safe strict
set search_path = extensions, pg_catalog
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- array_to_string is only STABLE; this wrapper is safe because the 'portuguese'
-- config and unaccent dictionary are fixed for the lifetime of the database.
create or replace function maindy.memory_fts(p_title text, p_content text, p_tags text[])
returns tsvector
language sql immutable parallel safe
set search_path = extensions, pg_catalog
as $$
  select setweight(to_tsvector('portuguese'::regconfig, maindy.immutable_unaccent(coalesce(p_title, ''))), 'A') ||
         setweight(to_tsvector('portuguese'::regconfig, maindy.immutable_unaccent(coalesce(p_content, ''))), 'B') ||
         setweight(to_tsvector('portuguese'::regconfig, maindy.immutable_unaccent(coalesce(array_to_string(p_tags, ' '), ''))), 'C')
$$;

create or replace function maindy.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── enums ─────────────────────────

create type maindy.memory_type as enum (
  'personal', 'episodic', 'semantic', 'people', 'task', 'commitment', 'habit', 'contextual'
);
create type maindy.memory_source as enum ('voice', 'text', 'import', 'integration', 'agent', 'vault');
create type maindy.provenance as enum ('user_confirmed', 'ai_inferred', 'external', 'unverified');
create type maindy.focus_mode as enum ('off', 'work', 'study', 'rest', 'sleep', 'driving');
create type maindy.action_status as enum (
  'planned', 'awaiting_confirmation', 'executing', 'succeeded', 'failed', 'rejected', 'expired'
);
create type maindy.permission_mode as enum ('auto', 'confirm', 'deny');

-- ───────────────────────── profiles & agent ─────────────────────────

create table maindy.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  -- role is managed server-side only (copied from auth app_metadata); users cannot change it
  role text not null default 'user' check (role in ('user', 'master')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table maindy.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null default 'MAINDY',
  personality text not null default 'acolhedora',
  tone text not null default 'calmo',
  language text not null default 'pt-BR',
  response_style text not null default 'curto' check (response_style in ('curto', 'equilibrado', 'detalhado')),
  voice_provider text not null default 'voicestudio',
  voice_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table maindy.agent_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  auto_save_memories boolean not null default true,
  speech_rate real not null default 1.0 check (speech_rate between 0.5 and 2.0),
  speak_responses boolean not null default true,
  store_audio boolean not null default false,          -- audio is never stored unless opted in
  allow_model_training boolean not null default false,  -- vault contents never used for training by default
  forward_notification_contents boolean not null default false,
  voice_behavior jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table maindy.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,          -- e.g. 'terms', 'privacy', 'ai_processing', 'notification_contents'
  granted boolean not null,
  policy_version text not null,
  created_at timestamptz not null default now()
);
create index on maindy.consents (user_id, kind, created_at desc);

-- ───────────────────────── vaults ─────────────────────────

create table maindy.vaults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  kind text not null default 'managed' check (kind in ('managed', 'external')),
  -- relative to MAINDY_STORAGE_ROOT; never an absolute path supplied by a client
  storage_key text not null unique,
  status text not null default 'active' check (status in ('provisioning', 'active', 'error', 'deleted')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table maindy.vault_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vault_id uuid not null references maindy.vaults (id) on delete cascade,
  kind text not null default 'obsidian_plugin',
  device_label text,
  token_hash text not null,     -- sha256 of the connection token; the token itself is shown once
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────── people & memories ─────────────────────────

create table maindy.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  relation text,                -- e.g. 'mãe', 'chefe', 'amiga'
  aliases text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index people_user_name_uq on maindy.people (user_id, lower(name));

create table maindy.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type maindy.memory_type not null default 'episodic',
  category text not null default 'personal',
  title text not null,
  content text not null,
  source maindy.memory_source not null default 'text',
  provenance maindy.provenance not null default 'user_confirmed',
  confidence real not null default 1.0 check (confidence between 0 and 1),
  tags text[] not null default '{}',
  original_utterance text,      -- exact words the user said, kept for source attribution
  occurred_at timestamptz,
  version integer not null default 1,
  vault_path text,              -- relative path inside the user's vault
  vault_hash text,              -- sha256 of the last file content written/read
  fts tsvector generated always as (maindy.memory_fts(title, content, tags)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_user_created_idx on maindy.memories (user_id, created_at desc);
create index memories_fts_idx on maindy.memories using gin (fts);
create index memories_tags_idx on maindy.memories using gin (tags);

create table maindy.memory_people (
  memory_id uuid not null references maindy.memories (id) on delete cascade,
  person_id uuid not null references maindy.people (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (memory_id, person_id)
);
create index on maindy.memory_people (person_id);

create table maindy.memory_versions (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references maindy.memories (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null,
  title text not null,
  content text not null,
  changed_by text not null check (changed_by in ('user', 'agent', 'vault_sync')),
  created_at timestamptz not null default now(),
  unique (memory_id, version)
);

create table maindy.memory_embeddings (
  memory_id uuid primary key references maindy.memories (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now()
);
create index memory_embeddings_hnsw on maindy.memory_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);
create index on maindy.memory_embeddings (user_id);

-- ───────────────────────── tasks, reminders, calendar, routines, focus ─────────────────────────

create table maindy.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  priority smallint not null default 2 check (priority between 1 and 3), -- 1 alta, 2 média, 3 baixa
  due_at timestamptz,
  completed_at timestamptz,
  source_memory_id uuid references maindy.memories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on maindy.tasks (user_id, status, due_at);

create table maindy.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  remind_at timestamptz not null,
  timezone text not null default 'America/Sao_Paulo',
  recurrence_rule text,         -- RFC 5545 RRULE subset, e.g. FREQ=DAILY;INTERVAL=1
  status text not null default 'scheduled'
    check (status in ('scheduled', 'delivered', 'done', 'cancelled')),
  task_id uuid references maindy.tasks (id) on delete set null,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminders_due_idx on maindy.reminders (status, remind_at);
create index on maindy.reminders (user_id, remind_at);

create table maindy.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  recurrence_rule text,
  source text not null default 'maindy' check (source in ('maindy', 'google', 'device')),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index on maindy.calendar_events (user_id, starts_at);

create table maindy.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  recurrence_rule text,
  steps jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table maindy.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode maindy.focus_mode not null,
  started_at timestamptz not null default now(),
  planned_end_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index on maindy.focus_sessions (user_id, started_at desc);

create table maindy.notification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  focus_mode maindy.focus_mode not null,
  allow_packages text[] not null default '{}',
  mute_contents boolean not null default true,
  priority_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, focus_mode)
);

-- ───────────────────────── permissions, integrations, devices ─────────────────────────

create table maindy.permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  capability text not null,     -- e.g. 'memory.save', 'reminder.create', 'email.send'
  integration text,             -- e.g. 'gmail'; null = internal capability
  mode maindy.permission_mode not null,
  -- permissions are only ever granted from an authenticated user action in the app UI
  granted_via text not null default 'user_ui' check (granted_via = 'user_ui'),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on maindy.permissions (user_id, capability) where revoked_at is null;

create table maindy.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,       -- 'google_calendar', 'gmail', 'weather', ...
  status text not null default 'disconnected'
    check (status in ('disconnected', 'pending', 'connected', 'error', 'revoked')),
  scopes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- Encrypted (AES-256-GCM, app-level key) provider tokens. No client role can read this table.
create table maindy.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  integration_id uuid not null references maindy.integrations (id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  unique (integration_id)
);

create table maindy.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  name text,
  push_token text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index devices_user_token_uq on maindy.devices (user_id, push_token) where push_token is not null;

-- ───────────────────────── agent runtime ─────────────────────────

create table maindy.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on maindy.conversations (user_id, updated_at desc);

create table maindy.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references maindy.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  input_mode text check (input_mode in ('text', 'voice')),
  memory_refs uuid[] not null default '{}',
  action_refs uuid[] not null default '{}',
  provider text,
  created_at timestamptz not null default now()
);
create index on maindy.conversation_messages (conversation_id, created_at);

create table maindy.action_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references maindy.conversations (id) on delete set null,
  tool text not null,
  input jsonb not null,
  autonomy_level smallint not null check (autonomy_level between 0 and 4),
  status maindy.action_status not null default 'planned',
  requires_confirmation boolean not null default false,
  summary text not null,        -- human-readable description shown in the confirmation UI
  result jsonb,
  error text,
  idempotency_key text,
  expires_at timestamptz,
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index action_idem_uq on maindy.action_executions (user_id, idempotency_key)
  where idempotency_key is not null;
create index on maindy.action_executions (user_id, status, created_at desc);

create table maindy.idempotency_keys (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  route text not null,
  request_hash text not null,
  status_code integer not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table maindy.usage_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  model text not null,
  operation text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index on maindy.usage_records (user_id, created_at desc);

create table maindy.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  actor text not null check (actor in ('user', 'agent', 'system')),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on maindy.audit_logs (user_id, created_at desc);

-- audit logs are append-only, for everyone (including the API)
create or replace function maindy.audit_logs_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('maindy.allow_audit_purge', true) = 'on' then
    return old; -- only used by the account-deletion path (cascade)
  end if;
  raise exception 'audit_logs is append-only';
end $$;
create trigger audit_logs_no_update before update on maindy.audit_logs
  for each row execute function maindy.audit_logs_immutable();

-- ───────────────────────── updated_at triggers ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['profiles','agents','people','memories','tasks','reminders',
                           'calendar_events','routines','integrations','conversations']
  loop
    execute format('create trigger %I before update on maindy.%I
                    for each row execute function maindy.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ───────────────────────── new user bootstrap ─────────────────────────

create or replace function maindy.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = maindy, public, pg_catalog
as $$
begin
  insert into maindy.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    case when new.raw_app_meta_data ->> 'role' = 'master' then 'master' else 'user' end
  )
  on conflict (id) do nothing;
  insert into maindy.agents (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into maindy.agent_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function maindy.handle_new_user();

-- keep profiles.role in sync with the server-controlled app_metadata
create or replace function maindy.handle_user_role_change()
returns trigger
language plpgsql security definer
set search_path = maindy, public, pg_catalog
as $$
begin
  update maindy.profiles
     set role = case when new.raw_app_meta_data ->> 'role' = 'master' then 'master' else 'user' end
   where id = new.id;
  return new;
end $$;

create trigger on_auth_user_role_changed after update of raw_app_meta_data on auth.users
  for each row execute function maindy.handle_user_role_change();
