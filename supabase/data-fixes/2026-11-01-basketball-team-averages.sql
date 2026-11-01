-- BCS Varsity Basketball: Oct 6 2025, Dec 8 2025 and Jul 10 2026 were individual testing days
-- (they stay in those athletes' profiles but leave every team average), and team averages count
-- testing from Jan 1 2026 on. Needs migration 20261118000000_team_averages.sql (run in the same
-- paste, just above). Safe to run again.
with t as (select id from public.teams where legacy_id = 't_basketball'),
ind as (
  update public.test_sessions s set individual = true from t
  where s.team_id = t.id and s.tested_on in ('2025-10-06', '2025-12-08', '2026-07-10') and not s.individual
  returning s.id
), cfg as (
  insert into public.gym_config (team_id, team_from) select id, '2026-01-01' from t
  on conflict (team_id) do update set team_from = excluded.team_from
  returning team_id
)
select (select count(*) from ind) as sessions_marked_individual, (select count(*) from cfg) as team_start_date_set;
