-- Row Level Security for every personal table + hybrid memory search.

-- ───────────────────────── privileges ─────────────────────────

revoke all on all tables in schema maindy from public, anon, authenticated;
revoke all on all functions in schema maindy from public, anon;

grant select, update (display_name, locale, timezone, onboarding_completed_at)
  on maindy.profiles to authenticated;

grant select, insert, update, delete on
  maindy.agents, maindy.agent_settings, maindy.people, maindy.memories, maindy.memory_people,
  maindy.memory_embeddings, maindy.tasks, maindy.reminders, maindy.calendar_events,
  maindy.routines, maindy.focus_sessions, maindy.notification_rules, maindy.integrations,
  maindy.devices, maindy.conversations, maindy.conversation_messages, maindy.action_executions,
  maindy.vaults, maindy.vault_connections
  to authenticated;

grant select, insert on maindy.memory_versions, maindy.consents, maindy.audit_logs,
  maindy.usage_records, maindy.idempotency_keys to authenticated;

-- permissions: users may grant and revoke, never rewrite history
grant select, insert, update (revoked_at) on maindy.permissions to authenticated;

-- provider_credentials: no grants for any client role (server-side service context only)

grant execute on function maindy.immutable_unaccent(text) to authenticated;

-- ───────────────────────── policies ─────────────────────────

alter table maindy.profiles enable row level security;
create policy profiles_self_select on maindy.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_self_update on maindy.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array[
    'agents','agent_settings','consents','vaults','vault_connections','people','memories',
    'memory_versions','tasks','reminders','calendar_events','routines','focus_sessions',
    'notification_rules','permissions','integrations','provider_credentials','devices',
    'conversations','conversation_messages','action_executions','idempotency_keys',
    'usage_records','audit_logs','memory_people','memory_embeddings']
  loop
    execute format('alter table maindy.%I enable row level security', t);
    execute format('alter table maindy.%I force row level security', t);
  end loop;

  -- simple ownership policy for tables without cross references
  foreach t in array array[
    'agents','agent_settings','consents','vaults','people','memories','routines',
    'focus_sessions','notification_rules','permissions','integrations','devices',
    'conversations','idempotency_keys','usage_records','audit_logs']
  loop
    execute format(
      'create policy %I on maindy.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t || '_owner', t);
  end loop;
end $$;

-- tables that reference other personal rows must also prove ownership of the referenced row

create policy vault_connections_owner on maindy.vault_connections for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from maindy.vaults v where v.id = vault_id and v.user_id = (select auth.uid())));

create policy memory_versions_owner on maindy.memory_versions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from maindy.memories m where m.id = memory_id and m.user_id = (select auth.uid())));

create policy memory_people_owner on maindy.memory_people for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from maindy.memories m where m.id = memory_id and m.user_id = (select auth.uid()))
    and exists (select 1 from maindy.people p where p.id = person_id and p.user_id = (select auth.uid())));

create policy memory_embeddings_owner on maindy.memory_embeddings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from maindy.memories m where m.id = memory_id and m.user_id = (select auth.uid())));

create policy tasks_owner on maindy.tasks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (source_memory_id is null or exists (
    select 1 from maindy.memories m where m.id = source_memory_id and m.user_id = (select auth.uid()))));

create policy reminders_owner on maindy.reminders for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (task_id is null or exists (
    select 1 from maindy.tasks t where t.id = task_id and t.user_id = (select auth.uid()))));

create policy calendar_events_owner on maindy.calendar_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy conversation_messages_owner on maindy.conversation_messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from maindy.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

create policy action_executions_owner on maindy.action_executions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (conversation_id is null or exists (
    select 1 from maindy.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))));

-- provider_credentials: RLS on, no policy for authenticated => always denied for client roles.

-- ───────────────────────── hybrid search ─────────────────────────
-- SECURITY INVOKER: runs with the caller's role, so RLS restricts results to the caller's rows.

create or replace function maindy.build_or_tsquery(p_text text)
returns tsquery
language sql stable
set search_path = maindy, extensions, pg_catalog
as $$
  select case when count(*) = 0 then null
              else to_tsquery('portuguese', string_agg(quote_literal(lexeme) || ':*', ' | ')) end
  from unnest(to_tsvector('portuguese', maindy.immutable_unaccent(coalesce(p_text, ''))))
$$;

create or replace function maindy.search_memories(
  p_query text,
  p_embedding extensions.vector(384) default null,
  p_limit integer default 8,
  p_types maindy.memory_type[] default null,
  p_person_ids uuid[] default null
)
returns table (
  memory_id uuid,
  score real,
  text_rank real,
  vector_similarity real,
  person_match boolean
)
language sql stable security invoker
set search_path = maindy, extensions, pg_catalog
as $$
  with q as (select maindy.build_or_tsquery(p_query) as tsq),
  text_hits as (
    select m.id, ts_rank_cd(m.fts, q.tsq, 32)::real as rank
    from maindy.memories m, q
    where q.tsq is not null and m.fts @@ q.tsq
    order by rank desc
    limit 50
  ),
  vector_hits as (
    select e.memory_id as id, (1 - (e.embedding <=> p_embedding))::real as sim
    from maindy.memory_embeddings e
    where p_embedding is not null
    order by e.embedding <=> p_embedding
    limit 50
  ),
  person_hits as (
    select distinct mp.memory_id as id
    from maindy.memory_people mp
    where p_person_ids is not null and mp.person_id = any (p_person_ids)
  ),
  candidates as (
    select id from text_hits union select id from vector_hits union select id from person_hits
  )
  select
    m.id,
    (
      coalesce(t.rank, 0) * 2.0                                   -- lexical match
      + greatest(coalesce(v.sim, 0) - 0.25, 0) * 1.6              -- semantic match above noise floor
      + case when p.id is not null then 0.6 else 0 end            -- entity relationship
      + 0.15 * exp(-extract(epoch from (now() - m.created_at)) / (86400.0 * 60))  -- recency (60d decay)
      + 0.1 * m.confidence
      + case m.provenance when 'user_confirmed' then 0.1 when 'external' then 0.05 else 0 end
    )::real as score,
    coalesce(t.rank, 0)::real,
    coalesce(v.sim, 0)::real,
    p.id is not null
  from candidates c
  join maindy.memories m on m.id = c.id
  left join text_hits t on t.id = c.id
  left join vector_hits v on v.id = c.id
  left join person_hits p on p.id = c.id
  where (p_types is null or m.type = any (p_types))
    and (t.id is not null or p.id is not null or coalesce(v.sim, 0) >= 0.45)
  order by score desc
  limit greatest(1, least(p_limit, 50))
$$;

grant execute on function maindy.build_or_tsquery(text) to authenticated;
grant execute on function maindy.search_memories(text, extensions.vector, integer, maindy.memory_type[], uuid[]) to authenticated;
