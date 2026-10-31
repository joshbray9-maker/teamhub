-- S&C leaderboard. Test results stay staff-only; this function hands out ONLY each active
-- player's best result per test (with its date) for one team, so players and parents in the
-- organization can see a leaderboard. A coach can switch it off (gym_config.leaderboard);
-- coaches and admins always see it. Best = highest, except the 10 m fly (lowest time).
alter table public.gym_config add column leaderboard boolean not null default true;

create or replace function public.leaderboard(p_team uuid)
returns table (player_id uuid, name text, num text, metric text, value numeric, tested_on date)
language sql stable security definer set search_path = public as $$
  select distinct on (p.id, kv.key) p.id, p.name, p.num, kv.key, kv.value::numeric, s.tested_on
  from test_results r
  join test_sessions s on s.id = r.session_id and s.team_id = p_team
  join players p on p.id = r.player_id and p.team_id = p_team and p.active
  cross join lateral jsonb_each_text(r.values) as kv(key, value)
  where r.team_id = p_team
    and kv.key in ('cmj_jh', 'rsimod', 'sj_jh', 'imtp_pf', 'rel_pf', 'fly10', 'cooper')
    and kv.value ~ '^-?[0-9]+(\.[0-9]+)?$'
    and (can_edit_team(p_team)
         or (can_read_team(p_team) and coalesce((select g.leaderboard from gym_config g where g.team_id = p_team), true)))
  order by p.id, kv.key,
    case when kv.key = 'fly10' then kv.value::numeric else -kv.value::numeric end, s.tested_on
$$;
revoke execute on function public.leaderboard(uuid) from public, anon;
grant execute on function public.leaderboard(uuid) to authenticated;
