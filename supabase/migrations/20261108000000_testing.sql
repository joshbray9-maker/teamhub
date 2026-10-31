-- S&C testing: sessions (a date + a battery), each player's results, and the gym-group setup.
-- Athlete performance data: ONLY the organization's admins and coaches can read or write it,
-- like the Injury report. Viewers and the public page never see it.
create table public.test_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  tested_on date not null,
  battery text not null check (battery in ('readiness', 'full')),  -- weekly readiness | full team testing
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index on public.test_sessions (team_id, tested_on);

-- values: {"cmj_jh": 41.2, "rsimod": 0.52, "sj_jh": 38.0, "imtp_pf": 2900, "rel_pf": 38.5, "fly10": 1.12, "cooper": 2850}
create table public.test_results (
  session_id uuid not null references public.test_sessions on delete cascade,
  player_id uuid not null references public.players on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  values jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id)
);
create index on public.test_results (team_id);

-- Gym groups: Josh's targets per metric, and any player moved to a group by hand.
create table public.gym_config (
  team_id uuid primary key references public.teams on delete cascade,
  targets jsonb not null default '{}',     -- {"cmj_jh": 40, "imtp_pf": 3000, ...}; a metric without a target isn't used
  overrides jsonb not null default '{}',   -- {"<player_id>": "efficient" | "expression" | "force"}
  updated_at timestamptz not null default now()
);

alter table public.test_sessions enable row level security;
alter table public.test_results enable row level security;
alter table public.gym_config enable row level security;
create policy test_sessions_staff on public.test_sessions for all to authenticated
  using (can_edit_team(team_id)) with check (can_edit_team(team_id));
create policy test_results_staff on public.test_results for all to authenticated
  using (can_edit_team(team_id))
  with check (can_edit_team(team_id)
    and exists (select 1 from public.test_sessions s where s.id = session_id and s.team_id = test_results.team_id)
    and exists (select 1 from public.players p where p.id = player_id and p.team_id = test_results.team_id));
create policy gym_config_staff on public.gym_config for all to authenticated
  using (can_edit_team(team_id)) with check (can_edit_team(team_id));
