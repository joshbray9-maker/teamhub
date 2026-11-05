-- Invite links. Adding someone in the Members dialog never sent an email: the invite only waited
-- for a sign-up with that email. Each invite now has its own secret link (/join/<token>) that an
-- admin copies and sends. Opening it shows the organization and role; after creating an account
-- (or signing in) the link grants that access to the signed-in account, whatever its email, and is
-- used up. Signing up with the invited email still works too (handle_new_user, unchanged).
alter table public.invites add column token uuid not null default gen_random_uuid();
create unique index invites_token_key on public.invites (token);

-- What a link is for, shown on the join page before signing in. Only whoever holds the link.
create or replace function public.invite_info(p_token uuid) returns table (org_name text, role text, email text)
language sql stable security definer set search_path = public as $$
  select o.name, i.role, i.email from invites i join organizations o on o.id = i.org_id where i.token = p_token
$$;
revoke execute on function public.invite_info(uuid) from public;
grant execute on function public.invite_info(uuid) to anon, authenticated;

-- Accepts a link for the signed-in account: membership with the invite's role and team choice,
-- then the invite is deleted. An existing membership is kept as it is (never downgraded).
-- Returns the organization id, or null when the link was already used or removed.
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
  delete from invites where org_id = i.org_id and email = i.email;
  return i.org_id;
end $$;
revoke execute on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;
