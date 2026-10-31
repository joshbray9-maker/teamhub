-- Game day / Lines: one set of lines per team ('default') plus optional per-game lines that
-- override it. `slots` maps a position id to the player typed in, e.g.
--   {"F1LW": {"num": "12", "name": "A. Player"}, "D1L": {...}, "G1": {...}}
-- Position ids: F1-F4 + LW/C/RW (forward lines), D1-D3 + L/R (defence pairs), G1/G2 (goalies),
-- X1-X4 (extras). Players are free text until the Roster tab exists.
create table public.lineups (
  team_id uuid not null references public.teams on delete cascade,
  key text not null,                                   -- 'default' or the game's id
  game_id uuid references public.games on delete cascade,
  slots jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (team_id, key),
  check ((key = 'default' and game_id is null) or key = game_id::text)
);

alter table public.lineups enable row level security;
-- members read; admins + coaches write, and a game's lines must belong to that game's team
create policy lineups_select on public.lineups for select to authenticated using (can_read_team(team_id));
create policy lineups_write on public.lineups for all to authenticated
  using (can_edit_team(team_id))
  with check (can_edit_team(team_id) and (game_id is null or exists (
    select 1 from public.games g where g.id = game_id and g.team_id = lineups.team_id)));
