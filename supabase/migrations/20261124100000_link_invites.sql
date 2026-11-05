-- Invite links without an email (Josh, 2026-11-05): an admin picks the access level and the
-- teams, gives the link a name (e.g. "Coach Martin"), copies it and sends it. Whoever opens it
-- joins with that access (accept_invite). Invites by email keep working as before.
alter table public.invites drop constraint invites_pkey;
alter table public.invites add column id uuid not null default gen_random_uuid() primary key;
alter table public.invites alter column email drop not null;
alter table public.invites add column label text not null default '' check (length(label) <= 80);
-- one invite per email per organization; link-only invites (no email) never clash
create unique index invites_org_email_key on public.invites (org_id, email);

-- The join page also shows the link's name and which teams it opens (null = every team).
drop function public.invite_info(uuid);
create function public.invite_info(p_token uuid) returns table (org_name text, role text, email text, label text, teams text[])
language sql stable security definer set search_path = public as $$
  select o.name, i.role, i.email, i.label,
    case when i.role = 'admin' or i.team_ids is null then null
      else array(select t.name from teams t where t.org_id = i.org_id and t.id = any (i.team_ids) order by t.sort_order, t.name) end
  from invites i join organizations o on o.id = i.org_id where i.token = p_token
$$;
revoke execute on function public.invite_info(uuid) from public;
grant execute on function public.invite_info(uuid) to anon, authenticated;

-- Same as before, but the used invite is removed by its id (a link-only invite has no email).
create or replace function public.accept_invite(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invites; n int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into i from invites where token = p_token;
  if not found then return null; end if;
  insert into memberships (org_id, user_id, role) values (i.org_id, auth.uid(), i.role) on conflict (org_id, user_id) do nothing;
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
