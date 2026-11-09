-- Programs (Josh, 2026-11-08): Josh's own spreadsheet-style training programs, on their own page
-- outside any team. Each row is one program (a workbook); `data` holds its sheets (one per day:
-- cells, styles, merged cells, column widths; see src/lib/sheet.js).
-- Private to whoever wrote it: nobody else, not even another admin of the same organization,
-- reads or changes someone's programs. The page itself is only offered to the owner account.
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Untitled program',
  folder text not null default '',
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.programs (owner, updated_at desc);

alter table public.programs enable row level security;
create policy programs_own on public.programs for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create trigger programs_touch before update on public.programs for each row execute function public.touch_updated_at();
