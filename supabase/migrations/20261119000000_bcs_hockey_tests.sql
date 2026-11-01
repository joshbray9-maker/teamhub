-- BCS hockey tests (Josh's sheet): 10 m sprint, chin-ups, Cooper laps, estimated VO2max, on-ice
-- 5-10-5 best and peak power join the leaderboard. TTPF, the 5-10-5 standard deviation,
-- bodyweight and EUR are stored but never ranked; Archetype and Links are text and never ranked.
-- Best = highest, except the timed tests, where it's the lowest.
create or replace function public.leaderboard(p_team uuid)
returns table (player_id uuid, name text, num text, metric text, value numeric, tested_on date)
language sql stable security definer set search_path = public as $$
  select distinct on (p.id, kv.key) p.id, p.name, p.num, kv.key, kv.value::numeric, s.tested_on
  from test_results r
  join test_sessions s on s.id = r.session_id and s.team_id = p_team
  join players p on p.id = r.player_id and p.team_id = p_team and p.active
  cross join lateral jsonb_each_text(r.values) as kv(key, value)
  where r.team_id = p_team
    and kv.key in ('cmj_jh', 'rsimod', 'sj_jh', 'imtp_pf', 'rel_pf', 'fly10', 'cooper', 'abalakov', 't505', 'cassivi', 'sprint20',
                   'sprint10', 'chinup', 'cooper_laps', 'vo2max', 'ice5105', 'peak_power')
    and kv.value ~ '^-?[0-9]+(\.[0-9]+)?$'
    and (can_edit_team(p_team)
         or (can_read_team(p_team) and coalesce((select g.leaderboard from gym_config g where g.team_id = p_team), true)))
  order by p.id, kv.key,
    case when kv.key in ('fly10', 't505', 'cassivi', 'sprint20', 'sprint10', 'ice5105') then kv.value::numeric else -kv.value::numeric end, s.tested_on
$$;
revoke execute on function public.leaderboard(uuid) from public, anon;
grant execute on function public.leaderboard(uuid) to authenticated;
