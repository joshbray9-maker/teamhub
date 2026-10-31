-- Data Center: tables uploaded from CSV / PDF files (testing results, team or league stats...).
-- TeamHub stores them as they were uploaded (headings + rows of text); it doesn't interpret
-- the numbers. Admins and coaches upload and see every table. A table is shown to the rest of
-- the organization (viewers) only when a coach marks it "shared"; athlete testing data should
-- normally stay unshared.
create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  kind text not null default 'other' check (kind in ('testing', 'stats', 'other')),
  recorded_on date,
  columns jsonb not null default '[]',      -- ["Player", "CMJ (cm)", ...]
  rows jsonb not null default '[]',         -- [["...", "..."], ...]
  shared boolean not null default false,    -- visible to viewers in the organization
  source text not null default '',          -- original file name
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (jsonb_array_length(columns) <= 60 and jsonb_array_length(rows) <= 2000)
);
create index on public.datasets (team_id, recorded_on desc);

alter table public.datasets enable row level security;
create policy datasets_select on public.datasets for select to authenticated
  using (can_edit_team(team_id) or (shared and can_read_team(team_id)));
create policy datasets_write on public.datasets for all to authenticated
  using (can_edit_team(team_id)) with check (can_edit_team(team_id));
