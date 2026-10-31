-- Coaching-staff board: a second, private thread in each team's chat.
-- 'team'  : everyone in the team's organization (unchanged)
-- 'staff' : the organization's admins and coaches only; viewers can't read or post
alter table public.chat_messages
  add column channel text not null default 'team' check (channel in ('team','staff'));
drop index if exists public.chat_messages_team_id_created_at_idx;
create index on public.chat_messages (team_id, channel, created_at desc);

drop policy chat_select on public.chat_messages;
drop policy chat_insert on public.chat_messages;
create policy chat_select on public.chat_messages for select to authenticated
  using (case channel when 'staff' then can_edit_team(team_id) else can_read_team(team_id) end);
create policy chat_insert on public.chat_messages for insert to authenticated
  with check (case channel when 'staff' then can_edit_team(team_id) else can_read_team(team_id) end);
-- chat_delete is unchanged: your own messages, or any as an org admin.
