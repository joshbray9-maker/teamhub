-- BCS teams: the team overview (medians, trends, comparisons, weekly snapshot, Coach's report)
-- counts testing from Sept 1 2026, this season. Earlier results (from Sept 2025 on) stay in each
-- athlete's own history. Covers both BCS hockey teams and both BCS basketball teams. Safe to run
-- again.
with t as (
  select t.id from public.teams t join public.organizations o on o.id = t.org_id
  where o.slug = 'bcs' and t.sport in ('hockey', 'basketball')
), cfg as (
  insert into public.gym_config (team_id, team_from) select id, '2026-09-01' from t
  on conflict (team_id) do update set team_from = excluded.team_from
  returning team_id
)
select count(*) as teams_set from cfg;
