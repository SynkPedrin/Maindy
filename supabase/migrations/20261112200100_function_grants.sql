-- Functions used by generated columns / triggers on tables that `authenticated` writes to.
grant execute on function maindy.memory_fts(text, text, text[]) to authenticated;
grant execute on function maindy.touch_updated_at() to authenticated;
grant execute on function maindy.audit_logs_immutable() to authenticated;
