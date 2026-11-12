-- apps/web (landing page + login/cadastro)
-- 1. public.waitlist: pré-cadastro anônimo. Escrita apenas pelo servidor da LP (service_role).
-- 2. RPCs de consentimento LGPD para o usuário autenticado, gravando em maindy.consents
--    sem expor o schema maindy no PostgREST.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 254),
  platform text not null check (platform in ('iphone', 'android', 'ambas')),
  main_expectation text check (char_length(main_expectation) <= 500),
  consent boolean not null check (consent = true),
  policy_version text not null,
  source text,
  created_at timestamptz not null default now()
);

create unique index if not exists waitlist_email_unique on public.waitlist (lower(email));

alter table public.waitlist enable row level security;
-- nenhuma policy: anon e authenticated não leem nem escrevem; só service_role (bypass RLS).
revoke all on public.waitlist from anon, authenticated;
grant select, insert on public.waitlist to service_role;

-- Registra os consentimentos do usuário logado (kinds: terms, privacy, ai_processing).
create or replace function public.record_web_consent(p_kinds text[], p_policy_version text)
returns void
language plpgsql
security definer
set search_path = maindy, public, pg_catalog
as $$
declare
  k text;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_policy_version is null or char_length(p_policy_version) > 32 then
    raise exception 'invalid policy version' using errcode = '22023';
  end if;
  foreach k in array p_kinds loop
    if k not in ('terms', 'privacy', 'ai_processing') then
      raise exception 'invalid consent kind: %', k using errcode = '22023';
    end if;
    insert into maindy.consents (user_id, kind, granted, policy_version)
    values (uid, k, true, p_policy_version);
  end loop;
end $$;

-- true se o usuário logado tem consentimento vigente de termos e privacidade na versão informada.
create or replace function public.has_web_consent(p_policy_version text)
returns boolean
language sql
stable
security definer
set search_path = maindy, public, pg_catalog
as $$
  select count(distinct c.kind) = 2
    from (
      select distinct on (kind) kind, granted
        from maindy.consents
       where user_id = auth.uid()
         and kind in ('terms', 'privacy')
         and policy_version = p_policy_version
       order by kind, created_at desc
    ) c
   where c.granted;
$$;

revoke all on function public.record_web_consent(text[], text) from public, anon;
revoke all on function public.has_web_consent(text) from public, anon;
grant execute on function public.record_web_consent(text[], text) to authenticated;
grant execute on function public.has_web_consent(text) to authenticated;
