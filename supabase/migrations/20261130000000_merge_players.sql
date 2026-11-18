-- Merge two profiles of the same player on one team (Josh, 2026-11-18: e.g. "Dom Schnarr" and
-- "Dominic Schnarr"). Everything recorded under p_drop moves to p_keep, then p_drop is deleted.
-- Where both have a row for the same thing (a test session, a game's stats, a self-assessment,
-- an IPP), the kept profile's values win and the other's only fill what it is missing.
-- Runs as definer so it can also repoint athlete accounts and invites, but only for someone who
-- can edit that team (checked first, explicitly).
create or replace function public.merge_players(p_keep uuid, p_drop uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k players; d players;
begin
  select * into k from players where id = p_keep;
  select * into d from players where id = p_drop;
  if k.id is null or d.id is null then raise exception 'Player not found'; end if;
  if k.id = d.id then return; end if;
  if k.team_id <> d.team_id then raise exception 'Both profiles have to be on the same team: move one first'; end if;
  if not can_edit_team(k.team_id) then raise exception 'You need coach or admin access to this team to merge players'; end if;

  -- test results: one row per session per player
  update test_results r set values = x.values || r.values, updated_at = now()
    from test_results x where r.player_id = p_keep and x.player_id = p_drop and x.session_id = r.session_id;
  delete from test_results where player_id = p_drop and session_id in (select session_id from test_results where player_id = p_keep);
  update test_results set player_id = p_keep where player_id = p_drop;

  -- game stats: one row per game per player
  update game_stats s set stats = x.stats || s.stats, updated_at = now()
    from game_stats x where s.player_id = p_keep and x.player_id = p_drop and x.game_id = s.game_id;
  delete from game_stats where player_id = p_drop and game_id in (select game_id from game_stats where player_id = p_keep);
  update game_stats set player_id = p_keep where player_id = p_drop;

  -- self-assessments: one per game per player
  delete from self_assessments where player_id = p_drop and game_id is not null
    and game_id in (select game_id from self_assessments where player_id = p_keep and game_id is not null);
  update self_assessments set player_id = p_keep where player_id = p_drop;
  delete from self_assess_links where player_id = p_drop;

  -- IPP: one per player per team
  update ipps i set data = x.data || i.data, updated_at = now()
    from ipps x where i.player_id = p_keep and x.player_id = p_drop and x.team_id = i.team_id;
  delete from ipps where player_id = p_drop and team_id in (select team_id from ipps where player_id = p_keep);
  update ipps set player_id = p_keep where player_id = p_drop;

  update injuries set player_id = p_keep where player_id = p_drop;
  update scat_tests set player_id = p_keep where player_id = p_drop;
  update memberships set player_id = p_keep where player_id = p_drop;
  update invites set player_id = p_keep where player_id = p_drop;

  -- game-day lines and gym-group moves keep the player id in JSON
  update lineups set slots = replace(slots::text, p_drop::text, p_keep::text)::jsonb
    where team_id = k.team_id and slots::text like '%' || p_drop::text || '%';
  update gym_config set overrides = (overrides - p_drop::text)
      || case when overrides ? p_keep::text then '{}'::jsonb else jsonb_build_object(p_keep::text, overrides -> p_drop::text) end
    where team_id = k.team_id and overrides ? p_drop::text;

  -- league stats (settings 'league_stats': rows [{player_id, gp, stats}]): the other profile's
  -- row moves over unless the kept one already has its own
  update settings s set value = jsonb_set(s.value, '{rows}', coalesce((
      select jsonb_agg(case when r->>'player_id' = p_drop::text then jsonb_set(r, '{player_id}', to_jsonb(p_keep::text)) else r end)
      from jsonb_array_elements(s.value->'rows') r
      where not (r->>'player_id' = p_drop::text and exists (select 1 from jsonb_array_elements(s.value->'rows') q where q->>'player_id' = p_keep::text))), '[]'::jsonb))
    where s.team_id = k.team_id and s.key = 'league_stats' and jsonb_typeof(s.value->'rows') = 'array' and s.value::text like '%' || p_drop::text || '%';

  -- the kept profile: its own details, blanks filled from the other one
  update players set
    num = coalesce(nullif(k.num, ''), d.num), position = coalesce(nullif(k.position, ''), d.position),
    shoots = coalesce(nullif(k.shoots, ''), d.shoots), year = coalesce(nullif(k.year, ''), d.year),
    height = coalesce(nullif(k.height, ''), d.height), weight = coalesce(nullif(k.weight, ''), d.weight),
    hometown = coalesce(nullif(k.hometown, ''), d.hometown), photo = coalesce(nullif(k.photo, ''), d.photo),
    active = k.active or d.active
  where id = p_keep;
  delete from players where id = p_drop;
end $$;
revoke execute on function public.merge_players(uuid, uuid) from public, anon;
grant execute on function public.merge_players(uuid, uuid) to authenticated;
