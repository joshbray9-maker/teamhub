-- Move a player to another team in one step. Runs as the signed-in user (security invoker), so
-- the normal access rules apply: they must be able to edit both the old and the new team.
--   - the player row moves
--   - their injuries (active and history) move with them
--   - they're taken out of the old team's game-day lines and manual gym-group moves
--   - test results stay with the old team: they belong to that team's testing sessions
create or replace function public.move_player(p_player uuid, p_team uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare old_team uuid;
begin
  select team_id into old_team from players where id = p_player;
  if old_team is null then raise exception 'Player not found'; end if;
  if old_team = p_team then return; end if;
  if not can_edit_team(old_team) or not can_edit_team(p_team) then
    raise exception 'You need coach or admin access to both teams to move a player';
  end if;
  update players set team_id = p_team where id = p_player;
  update injuries set team_id = p_team where player_id = p_player;
  update lineups set slots = coalesce((select jsonb_object_agg(k, v) from jsonb_each(slots) as e(k, v) where v->>'pid' is distinct from p_player::text), '{}')
    where team_id = old_team and slots::text like '%' || p_player::text || '%';
  update gym_config set overrides = overrides - p_player::text where team_id = old_team;
end $$;
revoke execute on function public.move_player(uuid, uuid) from public, anon;
grant execute on function public.move_player(uuid, uuid) to authenticated;
