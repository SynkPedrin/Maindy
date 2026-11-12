-- Recording where/how a memory was mirrored to the vault is bookkeeping, not a content change:
-- it must not bump updated_at (otherwise every mirrored file looks stale to the sync planner).
create or replace function maindy.memories_touch_updated_at()
returns trigger language plpgsql as $$
begin
  if (new.title, new.content, new.type, new.category, new.tags, new.provenance, new.confidence, new.version, new.occurred_at)
     is not distinct from
     (old.title, old.content, old.type, old.category, old.tags, old.provenance, old.confidence, old.version, old.occurred_at) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end $$;
grant execute on function maindy.memories_touch_updated_at() to authenticated;
drop trigger if exists memories_touch on maindy.memories;
create trigger memories_touch before update on maindy.memories
  for each row execute function maindy.memories_touch_updated_at();
