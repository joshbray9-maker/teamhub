-- Individual performance pathways (IPP), built from Josh's BCS IPP template (2026-11-04).
-- One row per team for the BASE IPP (player_id null: the team's starting values, e.g. coach
-- name, province) and one per athlete. `data` holds the boxes' values keyed by the template's
-- field ids (src/lib/ipp.js); the layout and the box notes live in the app, not here.
-- IPPs are coach evaluations of minors: ONLY the organization's admins and coaches can read or
-- write them (same rule as injuries). Viewers and the public pages never see them.

create table public.ipps (
  team_id uuid not null references public.teams on delete cascade,
  player_id uuid references public.players on delete cascade,      -- null = the team's base IPP
  player_key text generated always as (coalesce(player_id::text, 'base')) stored,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_by uuid references auth.users on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (team_id, player_key)
);
create index on public.ipps (player_id);

alter table public.ipps enable row level security;
create policy ipps_staff on public.ipps for all to authenticated
  using (can_edit_team(team_id))
  with check (can_edit_team(team_id) and (player_id is null or exists (
    select 1 from public.players p where p.id = player_id and p.team_id = ipps.team_id)));
create trigger ipps_touch before update on public.ipps for each row execute function public.touch_updated_at();

-- An athlete's IPP moves with them to another team (same as their injuries).
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
  delete from ipps where team_id = p_team and player_id = p_player;
  update ipps set team_id = p_team where player_id = p_player;
  update lineups set slots = coalesce((select jsonb_object_agg(k, v) from jsonb_each(slots) as e(k, v) where v->>'pid' is distinct from p_player::text), '{}')
    where team_id = old_team and slots::text like '%' || p_player::text || '%';
  update gym_config set overrides = overrides - p_player::text where team_id = old_team;
end $$;
revoke execute on function public.move_player(uuid, uuid) from public, anon;
grant execute on function public.move_player(uuid, uuid) to authenticated;
