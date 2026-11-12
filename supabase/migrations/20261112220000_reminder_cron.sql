-- Serverless reminder dispatch: pg_cron calls the API every minute through pg_net.
-- The job is (re)registered after deploy with:
--   select maindy.schedule_reminder_dispatch('https://<api-host>/v1/internal/reminders/dispatch', '<CRON_SECRET>');
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function maindy.schedule_reminder_dispatch(p_url text, p_secret text)
returns bigint
language plpgsql security definer
set search_path = maindy, extensions, cron, pg_catalog
as $$
declare jid bigint;
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'maindy-reminders';
  select cron.schedule(
    'maindy-reminders',
    '* * * * *',
    format($cmd$select net.http_post(url := %L, headers := jsonb_build_object('x-cron-secret', %L, 'content-type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 20000)$cmd$, p_url, p_secret)
  ) into jid;
  return jid;
end $$;

revoke all on function maindy.schedule_reminder_dispatch(text, text) from public, anon, authenticated;
