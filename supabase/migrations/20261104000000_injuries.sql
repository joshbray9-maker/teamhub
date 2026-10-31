-- Injury report + player photos.
-- Injuries are health information: ONLY the organization's admins and coaches can read or
-- write them (sports-med staff get the coach role). Viewers and the public page never see
-- injuries, and the app only shows injury flags to admins/coaches.
-- Statuses are Josh's colour scheme, not a medical scale:
--   out     = red    : not practising or playing
--   limited = yellow : hurt but can practise and play
--   cleared = green  : back to full; the row stays as history

create table public.injuries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  player_id uuid not null references public.players on delete cascade,
  status text not null default 'out' check (status in ('out', 'limited', 'cleared')),
  injury text not null default '',          -- short description, e.g. "Ankle sprain"
  body_area text not null default '',       -- region id on the body diagram (see src/lib/injury.js)
  side text not null default '' check (side in ('', 'L', 'R', 'both')),
  details text not null default '',
  limitations text not null default '',
  injured_on date,
  return_practice date,                     -- expected return to practice
  return_play date,                         -- expected return to play
  cleared_on date,
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.injuries (team_id, status);
create index on public.injuries (player_id);

alter table public.injuries enable row level security;
create policy injuries_staff on public.injuries for all to authenticated
  using (can_edit_team(team_id))
  with check (can_edit_team(team_id) and exists (
    select 1 from public.players p where p.id = player_id and p.team_id = injuries.team_id));
create trigger injuries_touch before update on public.injuries for each row execute function public.touch_updated_at();

-- Player photos: a path in the private 'player-photos' bucket (<team_id>/<file>), shown through
-- short-lived signed links to members who can read the team.
alter table public.players add column photo text;

insert into storage.buckets (id, name, public) values ('player-photos', 'player-photos', false) on conflict (id) do nothing;
create policy player_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and public.can_read_team(((storage.foldername(name))[1])::uuid));
create policy player_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and public.can_edit_team(((storage.foldername(name))[1])::uuid));
create policy player_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and public.can_edit_team(((storage.foldername(name))[1])::uuid));
create policy player_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and public.can_edit_team(((storage.foldername(name))[1])::uuid));
