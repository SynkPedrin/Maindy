-- OAuth providers (Google/GitHub) fill full_name/name instead of display_name.
create or replace function maindy.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = maindy, public, pg_catalog
as $$
begin
  insert into maindy.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1)
    ),
    case when new.raw_app_meta_data ->> 'role' = 'master' then 'master' else 'user' end
  )
  on conflict (id) do nothing;
  insert into maindy.agents (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into maindy.agent_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
