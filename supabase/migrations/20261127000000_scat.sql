-- SCAT6 concussion assessments (Josh, 2026-11-06): the Injury report's SCAT tab. Each row is
-- one completed SCAT6 for one player, a baseline or a post-injury test, with the scores copied
-- off the form in `data` (symptom ratings, memory, concentration, balance, gait, recall; see
-- src/lib/scat.js). They stay in the player's injury history.
-- Health information, like injuries: only admins, coaches and sports med of the player's
-- current team read or write them. The row belongs to the player, not the team, so it follows
-- a player who moves teams and is deleted with the player.
create table public.scat_tests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players on delete cascade,
  tested_on date not null,
  kind text not null default 'injury' check (kind in ('baseline', 'injury')),
  injury_id uuid references public.injuries on delete set null,  -- the injury a post-injury test follows
  examiner text not null default '',
  data jsonb not null default '{}',
  notes text not null default '',
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.scat_tests (player_id, tested_on);

alter table public.scat_tests enable row level security;
create policy scat_tests_med on public.scat_tests for all to authenticated
  using (can_med_team((select p.team_id from public.players p where p.id = player_id)))
  with check (can_med_team((select p.team_id from public.players p where p.id = player_id))
    and (injury_id is null or exists (select 1 from public.injuries i where i.id = injury_id and i.player_id = scat_tests.player_id)));
create trigger scat_tests_touch before update on public.scat_tests for each row execute function public.touch_updated_at();
