-- Team chat: one group thread per team, plain text.
-- Who: every member of the team's organization (admin, coach, viewer) can read and post.
-- Messages can't be edited; the sender or an org admin can delete one. The public schedule
-- page never sees chat.

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid references auth.users on delete set null,
  author text not null default '',      -- sender's email when sent (set by the trigger below)
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.chat_messages (team_id, created_at desc);

-- The sender, their name and the time always come from the session, never the client.
create or replace function public.chat_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.author := coalesce((select email from profiles where id = auth.uid()), '');
  new.created_at := now();
  new.body := btrim(new.body);
  return new;
end $$;
create trigger chat_stamp before insert on public.chat_messages for each row execute function public.chat_stamp();

alter table public.chat_messages enable row level security;
create policy chat_select on public.chat_messages for select to authenticated using (can_read_team(team_id));
create policy chat_insert on public.chat_messages for insert to authenticated with check (can_read_team(team_id));
create policy chat_delete on public.chat_messages for delete to authenticated
  using (user_id = auth.uid() or team_role(team_id) = 'admin');

-- Live updates: Supabase Realtime sends new rows to each subscriber that may read them.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
