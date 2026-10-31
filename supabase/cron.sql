-- Daily league sync at 06:00 Eastern (10:00 UTC; 11:00 UTC in winter is fine too).
-- Run once in the Supabase SQL editor AFTER deploying the league-sync function.
-- Replace the two placeholders first:
--   YOUR-PROJECT-REF : from your project URL https://YOUR-PROJECT-REF.supabase.co
--   YOUR-CRON-SECRET : the same random string you set with `supabase secrets set CRON_SECRET=...`
-- The secret is kept in Supabase Vault, not in the cron job text.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('YOUR-CRON-SECRET', 'teamhub_cron_secret');

select cron.schedule(
  'teamhub-league-sync',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/league-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'teamhub_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Check it later:  select * from cron.job_run_details order by start_time desc limit 5;
--                  select * from public.sync_runs order by ran_at desc limit 20;
-- Remove it:       select cron.unschedule('teamhub-league-sync');
