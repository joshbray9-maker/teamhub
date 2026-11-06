-- Who's on TeamHub (Josh, 2026-11-05). While someone has the app open, it calls touch_seen()
-- about once a minute; the Members dialog shows "Online now" (seen in the last ~2 minutes) or
-- when they were last active. Only the time is stored: no pages, teams or IP addresses.
-- Only admins of an organization the person belongs to can read it; nobody writes it directly.
create table public.user_activity (
  user_id uuid primary key references auth.users on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.user_activity enable row level security;
create policy user_activity_admin_read on public.user_activity for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from memberships m where m.user_id = user_activity.user_id and org_role(m.org_id) = 'admin'));
revoke insert, update, delete on public.user_activity from anon, authenticated;

create or replace function public.touch_seen() returns void
language sql security definer set search_path = public as $$
  insert into user_activity (user_id, seen_at) select auth.uid(), now() where auth.uid() is not null
  on conflict (user_id) do update set seen_at = excluded.seen_at
$$;
revoke execute on function public.touch_seen() from public, anon;
grant execute on function public.touch_seen() to authenticated;
