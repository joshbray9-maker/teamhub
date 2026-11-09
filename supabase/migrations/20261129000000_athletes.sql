-- Athlete access level (Josh, 2026-11-09): a player's own TeamHub account. An athlete invite link
-- is made for ONE rostered player; whoever opens it joins that player's team only, as that player.
-- In the app they see the Master schedule, Chat (team thread, never the coaching staff board),
-- Playbook, Stats, S&C (calendar and leaderboard) and their own Self-assessment. For data they
-- read like a viewer (can_read_team), minus shared Data Center tables, and they never see other
-- athletes' emails or profiles. Coach-only data (notes, injuries, testing, IPPs, everyone's
-- self-assessments) stays can_edit_team / can_med_team, which athletes don't pass.
alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check check (role in ('admin','coach','viewer','sportsmed','athlete'));
alter table public.invites drop constraint invites_role_check;
alter table public.invites add constraint invites_role_check check (role in ('admin','coach','viewer','sportsmed','athlete'));

-- which rostered player an athlete account (or athlete invite) is
alter table public.memberships add column player_id uuid references public.players on delete set null;
alter table public.invites add column player_id uuid references public.players on delete cascade;
-- an athlete invite always names a player; nothing else does
alter table public.invites add constraint invites_athlete_player check ((role = 'athlete') = (player_id is not null));

-- An athlete invite opens only its player's team, set from the player (never chosen by hand).
create or replace function public.invites_athlete_team() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if new.role = 'athlete' then
    select p.team_id into t from players p join teams tm on tm.id = p.team_id
      where p.id = new.player_id and tm.org_id = new.org_id;
    if t is null then raise exception 'That player is not on a team in this organization'; end if;
    new.team_ids := array[t];
    new.email := null;  -- link only
  end if;
  return new;
end $$;
revoke execute on function public.invites_athlete_team() from public, anon, authenticated;
create trigger invites_athlete_team before insert or update on public.invites for each row execute function public.invites_athlete_team();

-- The join page also names the player the link is for.
drop function public.invite_info(uuid);
create function public.invite_info(p_token uuid) returns table (org_name text, role text, email text, label text, teams text[], player text)
language sql stable security definer set search_path = public as $$
  select o.name, i.role, i.email, i.label,
    case when i.role = 'admin' or i.team_ids is null then null
      else array(select t.name from teams t where t.org_id = i.org_id and t.id = any (i.team_ids) order by t.sort_order, t.name) end,
    (select p.name from players p where p.id = i.player_id)
  from invites i join organizations o on o.id = i.org_id where i.token = p_token
$$;
revoke execute on function public.invite_info(uuid) from public;
grant execute on function public.invite_info(uuid) to anon, authenticated;

-- Same as before, plus the athlete's player.
create or replace function public.accept_invite(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invites; n int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into i from invites where token = p_token;
  if not found then return null; end if;
  insert into memberships (org_id, user_id, role, player_id) values (i.org_id, auth.uid(), i.role, i.player_id) on conflict (org_id, user_id) do nothing;
  get diagnostics n = row_count;
  if n > 0 and i.role <> 'admin' then
    insert into member_teams (org_id, user_id, team_id)
      select i.org_id, auth.uid(), x from unnest(i.team_ids) as x join teams t on t.id = x and t.org_id = i.org_id
      on conflict do nothing;
  end if;
  delete from invites where id = i.id;
  return i.org_id;
end $$;
revoke execute on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;

-- Athletes see the staff and themselves in the member list and profiles, never other athletes.
drop policy mem_select on public.memberships;
create policy mem_select on public.memberships for select to authenticated using (
  org_role(org_id) is not null and (org_role(org_id) <> 'athlete' or user_id = auth.uid() or role <> 'athlete'));
drop policy prof_select on public.profiles;
create policy prof_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from memberships a join memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.id and (a.role <> 'athlete' or b.role <> 'athlete')));

-- Shared Data Center tables are for staff and viewers, not athletes.
drop policy datasets_select on public.datasets;
create policy datasets_select on public.datasets for select to authenticated
  using (can_edit_team(team_id) or (shared and can_read_team(team_id) and team_role(team_id) <> 'athlete'));

-- In chat an athlete shows as their roster name, not their email.
create or replace function public.chat_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.author := coalesce(
    (select p.name from teams t join memberships m on m.org_id = t.org_id and m.user_id = auth.uid() and m.role = 'athlete'
       join players p on p.id = m.player_id where t.id = new.team_id),
    (select coalesce(nullif(btrim(display_name), ''), email) from profiles where id = auth.uid()), '');
  new.created_at := now();
  new.body := btrim(new.body);
  return new;
end $$;

-- The signed-in athlete's own self-assessment link (assess_view / assess_submit take it), for
-- the team they're looking at. Null for anyone who isn't that team's athlete.
create or replace function public.my_assess_token(p_team uuid) returns text
language sql stable security definer set search_path = public as $$
  select l.token from memberships m
    join players p on p.id = m.player_id and p.team_id = p_team
    join teams t on t.id = p.team_id and t.org_id = m.org_id
    join self_assess_links l on l.player_id = p.id
  where m.user_id = auth.uid() and m.role = 'athlete' and team_role(p_team) = 'athlete'
$$;
revoke execute on function public.my_assess_token(uuid) from public, anon;
grant execute on function public.my_assess_token(uuid) to authenticated;
