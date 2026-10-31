-- Playbook: diagrammed plays per team. Everyone on the team can see a play unless a coach locks
-- it (padlock), which makes it coaches/admins only. Only coaches and admins create or edit.
--   frames: [{"players": [{"id","kind":"o"|"x"|"ball","label","x","y"}], "lines": [{"id","kind":"cut"|"pass"|"dribble"|"screen","x1","y1","x2","y2"}]}]
-- Coordinates are in feet on a half court (50 wide, 47 deep, basket at the top).
create table public.plays (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  category text not null default 'sets',
  call text not null default '',            -- short signal / call word
  notes text not null default '',
  locked boolean not null default false,    -- padlock: coaches and admins only
  frames jsonb not null default '[]',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.plays (team_id, category, sort_order);

alter table public.plays enable row level security;
create policy plays_select on public.plays for select to authenticated
  using (can_edit_team(team_id) or (not locked and can_read_team(team_id)));
create policy plays_write on public.plays for all to authenticated using (can_edit_team(team_id)) with check (can_edit_team(team_id));
create trigger plays_touch before update on public.plays for each row execute function public.touch_updated_at();
