-- Team-level access. A coach or viewer can be limited to chosen teams in their organization;
-- with no rows in member_teams they see every team (as before). Admins always see every team.
-- Everything team-scoped already checks team_role() (through can_read_team / can_edit_team),
-- so tightening team_role() limits schedules, rosters, injuries, tests, logos and the rest.
create table public.member_teams (
  org_id uuid not null,
  user_id uuid not null,
  team_id uuid not null references public.teams on delete cascade,
  primary key (user_id, team_id),
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade
);
create index on public.member_teams (org_id, user_id);
alter table public.invites add column team_ids uuid[];   -- null = every team

alter table public.member_teams enable row level security;
create policy member_teams_select on public.member_teams for select to authenticated using (org_role(org_id) = 'admin' or user_id = auth.uid());
create policy member_teams_admin on public.member_teams for all to authenticated using (org_role(org_id) = 'admin') with check (org_role(org_id) = 'admin');

create or replace function public.team_role(p_team uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from teams t join memberships m on m.org_id = t.org_id
  where t.id = p_team and m.user_id = auth.uid()
    and (m.role = 'admin'
         or not exists (select 1 from member_teams x where x.org_id = m.org_id and x.user_id = m.user_id)
         or exists (select 1 from member_teams x where x.user_id = m.user_id and x.team_id = t.id))
$$;

-- teams: visible / editable per team now, not per organization
drop policy team_select on public.teams;
drop policy team_update on public.teams;
create policy team_select on public.teams for select to authenticated using (can_read_team(id));
create policy team_update on public.teams for update to authenticated using (can_edit_team(id)) with check (org_role(org_id) in ('admin', 'coach'));

-- Sets which teams a member sees (null or empty = all). Admin only; teams must be in the org.
create or replace function public.set_member_teams(p_org uuid, p_user uuid, p_teams uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if org_role(p_org) is distinct from 'admin' then raise exception 'Only an organization admin can change team access'; end if;
  if exists (select 1 from unnest(coalesce(p_teams, '{}')) x where x not in (select id from teams where org_id = p_org)) then
    raise exception 'A chosen team is not in this organization';
  end if;
  delete from member_teams where org_id = p_org and user_id = p_user;
  if coalesce(array_length(p_teams, 1), 0) > 0 and (select role from memberships where org_id = p_org and user_id = p_user) <> 'admin' then
    insert into member_teams (org_id, user_id, team_id) select p_org, p_user, unnest(p_teams);
  end if;
end $$;

-- invite_member gains the team choice (null = all teams)
drop function public.invite_member(uuid, text, text);
create or replace function public.invite_member(p_org uuid, p_email text, p_role text, p_teams uuid[] default null) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; e text := lower(trim(p_email)); t uuid[] := nullif(p_teams, '{}');
begin
  if org_role(p_org) is distinct from 'admin' then raise exception 'Only an organization admin can add members'; end if;
  if p_role not in ('admin','coach','viewer') then raise exception 'Unknown role %', p_role; end if;
  if exists (select 1 from unnest(coalesce(t, '{}')) x where x not in (select id from teams where org_id = p_org)) then
    raise exception 'A chosen team is not in this organization';
  end if;
  select id into uid from profiles where email = e;
  if uid is not null then
    insert into memberships (org_id, user_id, role) values (p_org, uid, p_role)
      on conflict (org_id, user_id) do update set role = excluded.role;
    perform set_member_teams(p_org, uid, t);
    return 'added';
  end if;
  insert into invites (org_id, email, role, team_ids) values (p_org, e, p_role, t)
    on conflict (org_id, email) do update set role = excluded.role, team_ids = excluded.team_ids;
  return 'invited';
end $$;
revoke execute on function public.invite_member(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.invite_member(uuid, text, text, uuid[]) to authenticated;
revoke execute on function public.set_member_teams(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_member_teams(uuid, uuid, uuid[]) to authenticated;

-- sign-up: invites become memberships, with their team choice
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, lower(new.email)) on conflict (id) do update set email = excluded.email;
  insert into memberships (org_id, user_id, role)
    select org_id, new.id, role from invites where email = lower(new.email)
    on conflict (org_id, user_id) do nothing;
  -- only teams that still exist in that organization (a deleted team is skipped, never an error)
  insert into member_teams (org_id, user_id, team_id)
    select i.org_id, new.id, x from invites i cross join unnest(i.team_ids) as x
    join teams t on t.id = x and t.org_id = i.org_id
    where i.email = lower(new.email) and i.role <> 'admin'
    on conflict do nothing;
  delete from invites where email = lower(new.email);
  return new;
end $$;
