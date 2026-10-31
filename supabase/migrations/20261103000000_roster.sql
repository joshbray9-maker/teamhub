-- Team rosters. Members of the team's organization read them (the same details league and
-- school sites publish); admins + coaches add, edit, import and remove players.
-- Deliberately no medical, contact or date-of-birth fields: injury status will come from the
-- coach-only Injury report tab once it exists, not from this table.
create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  num text not null default '',            -- jersey number as typed ('', '9', '00')
  name text not null check (length(btrim(name)) between 1 and 80),
  position text not null default '',       -- free text per sport: F/D/G, PG/SG, Prop/Hooker...
  shoots text not null default '' check (shoots in ('', 'L', 'R')),  -- shoots / catches (hockey)
  year text not null default '',           -- birth year or class/grade, as the source gives it
  height text not null default '',
  weight text not null default '',
  hometown text not null default '',
  active boolean not null default true,    -- false = no longer on the team (kept for history)
  source text not null default 'manual',   -- manual | csv | pdf | web
  created_at timestamptz not null default now()
);
create index on public.players (team_id);

alter table public.players enable row level security;
create policy players_select on public.players for select to authenticated using (can_read_team(team_id));
create policy players_write on public.players for all to authenticated using (can_edit_team(team_id)) with check (can_edit_team(team_id));
