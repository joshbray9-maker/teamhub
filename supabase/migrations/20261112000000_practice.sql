-- Practice plans and a per-team drill library. Coaching staff only (admins + coaches), like the
-- Practice plan menu. A plan's blocks are kept in order as a list:
--   blocks: [{"id": "b1", "title": "Shell drill", "minutes": 12, "type": "defense", "notes": "..."}]
create table public.practice_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  practice_on date not null,
  start_time text not null default '',     -- 'HH:MM'
  location text not null default '',
  focus text not null default '',
  notes text not null default '',
  blocks jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.practice_plans (team_id, practice_on);

create table public.drills (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  type text not null default '',
  minutes int not null default 10 check (minutes between 1 and 240),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index on public.drills (team_id);

alter table public.practice_plans enable row level security;
alter table public.drills enable row level security;
create policy practice_plans_staff on public.practice_plans for all to authenticated using (can_edit_team(team_id)) with check (can_edit_team(team_id));
create policy drills_staff on public.drills for all to authenticated using (can_edit_team(team_id)) with check (can_edit_team(team_id));
create trigger practice_plans_touch before update on public.practice_plans for each row execute function public.touch_updated_at();
