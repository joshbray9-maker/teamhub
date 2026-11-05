-- Sports med access level (Josh, 2026-11-05): sports medicine staff see the Injury report,
-- S&C, Athlete reports and the Master schedule for their teams, and nothing else in the app.
-- They read and edit injuries (like coaches); they read testing and gym groups but can't change
-- them; schedules, players and the S&C plan they read like a viewer. They never read coach notes,
-- practice plans, IPPs or self-assessments (those stay can_edit_team: admins and coaches).
alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check check (role in ('admin','coach','viewer','sportsmed'));
alter table public.invites drop constraint invites_role_check;
alter table public.invites add constraint invites_role_check check (role in ('admin','coach','viewer','sportsmed'));

create or replace function public.invite_member(p_org uuid, p_email text, p_role text, p_teams uuid[] default null) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; e text := lower(trim(p_email)); t uuid[] := nullif(p_teams, '{}');
begin
  if org_role(p_org) is distinct from 'admin' then raise exception 'Only an organization admin can add members'; end if;
  if p_role not in ('admin','coach','viewer','sportsmed') then raise exception 'Unknown role %', p_role; end if;
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

-- admins, coaches and sports med on this team
create or replace function public.can_med_team(p_team uuid) returns boolean
language sql stable as $$ select coalesce(public.team_role(p_team) in ('admin','coach','sportsmed'), false) $$;

-- injuries: sports med reads and edits them too
drop policy injuries_staff on public.injuries;
create policy injuries_staff on public.injuries for all to authenticated
  using (can_med_team(team_id))
  with check (can_med_team(team_id) and exists (
    select 1 from public.players p where p.id = player_id and p.team_id = injuries.team_id));

-- testing (Athlete reports, S&C Tests) and gym groups: sports med reads only
create policy test_sessions_med_read on public.test_sessions for select to authenticated using (team_role(team_id) = 'sportsmed');
create policy test_results_med_read on public.test_results for select to authenticated using (team_role(team_id) = 'sportsmed');
create policy gym_config_med_read on public.gym_config for select to authenticated using (team_role(team_id) = 'sportsmed');
