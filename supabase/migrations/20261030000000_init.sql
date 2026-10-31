-- TeamHub schema + row-level security.
-- Access model: every team belongs to one organization. A user sees an organization's teams
-- only through a membership row in that organization, with a role:
--   admin  : everything, incl. creating/deleting teams and managing members
--   coach  : read + edit schedules, S&C plan, league data, team settings, coach notes
--   viewer : read-only (no coach notes, no to-dos)
-- The public master-schedule page reads through public_schedule(), never the tables.


-- ============ tables ============
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
  name text not null,
  public_schedule boolean not null default false,  -- turns on /schedule/<slug>
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('admin','coach','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.memberships (user_id);

-- Pending access for people who haven't signed up yet; turned into memberships on sign-up.
create table public.invites (
  org_id uuid not null references public.organizations on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin','coach','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, email)
);

-- Email lookup for the Members dialog (auth.users isn't readable from the client).
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null
);
create index on public.profiles (email);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  legacy_id text unique,                -- id from the original TeamHub artifact (seed only)
  name text not null,
  school text not null default '',      -- "Name in league tables"
  sport text not null default 'hockey',
  level text not null default 'high-school',
  color text not null default '#1f5fbf',
  logo_url text,
  league_name text not null default '',
  league_url text not null default '',
  sync_url text not null default '',    -- optional machine-readable feed (.ics) for the daily sync
  sync_enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.teams (org_id);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  date date not null,
  time text not null default '',        -- 'HH:MM' local, '' = TBA
  home text not null,
  away text not null,
  home_score int,
  away_score int,
  venue text not null default '',
  round text not null default '',
  source text not null default 'manual',  -- manual | paste | ics | league | s&c
  ext_id text,                            -- league / calendar id once matched by the sync
  sync_flag text check (sync_flag in ('changed')),
  sync_changes jsonb,                     -- [{field, from, to}] from the last sync that changed it
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.games (team_id, date);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  date date not null,
  time text not null default '',
  title text not null,
  kind text not null default 'event' check (kind in ('event','practice')),
  location text not null default '',
  ext_id text,
  created_at timestamptz not null default now()
);
create index on public.events (team_id, date);
create unique index events_team_ext on public.events (team_id, ext_id) where ext_id is not null;

create table public.standings (
  team_id uuid primary key references public.teams on delete cascade,
  groups jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications (team_id, created_at desc);

-- Games the league site lists for a team that are NOT on its calendar. The sync never adds
-- them; a coach reviews each one (add or dismiss).
create table public.sync_candidates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  key text not null,                      -- ext_id or date|home|away, so reruns don't duplicate
  game jsonb not null,
  status text not null default 'open' check (status in ('open','added','dismissed')),
  found_at timestamptz not null default now(),
  unique (team_id, key)
);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams on delete cascade,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  message text not null
);
create index on public.sync_runs (team_id, ran_at desc);

create table public.sc_weeks (
  team_id uuid not null references public.teams on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),  -- Monday
  phase text not null default '',
  season_week text not null default '',
  primary key (team_id, week_start)
);

create table public.sc_days (
  team_id uuid not null references public.teams on delete cascade,
  date date not null,
  theme text not null default '',
  intensity text not null default '' check (intensity in ('','off','light','moderate','heavy','game')),
  note text not null default '',
  pdf_color text,                          -- colour seen in the S&C sheet when it isn't in the code (e.g. 'cyan')
  primary key (team_id, date)
);

-- Team-scoped settings, e.g. key 'sc_loads' {light:1,...} and 'sc_band' {lo,hi}.
create table public.settings (
  team_id uuid not null references public.teams on delete cascade,
  key text not null,
  value jsonb not null,
  primary key (team_id, key)
);

-- Per-user preferences: team order, sidebar menu order, hidden table columns.
create table public.user_settings (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  value jsonb not null default '{}'
);

-- Coach-only notes + to-dos per team. Never visible to viewers or the public page.
create table public.coach_notes (
  team_id uuid primary key references public.teams on delete cascade,
  notes text not null default '',
  todos jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- ============ access helpers ============
-- security definer so policies can read memberships without recursing through its own RLS.
create or replace function public.org_role(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from memberships where org_id = p_org and user_id = auth.uid()
$$;

create or replace function public.team_role(p_team uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from teams t join memberships m on m.org_id = t.org_id
  where t.id = p_team and m.user_id = auth.uid()
$$;

create or replace function public.can_read_team(p_team uuid) returns boolean
language sql stable as $$ select public.team_role(p_team) is not null $$;

create or replace function public.can_edit_team(p_team uuid) returns boolean
language sql stable as $$ select coalesce(public.team_role(p_team) in ('admin','coach'), false) $$;

-- ============ RLS ============
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.games enable row level security;
alter table public.events enable row level security;
alter table public.standings enable row level security;
alter table public.notifications enable row level security;
alter table public.sync_candidates enable row level security;
alter table public.sync_runs enable row level security;
alter table public.sc_weeks enable row level security;
alter table public.sc_days enable row level security;
alter table public.settings enable row level security;
alter table public.user_settings enable row level security;
alter table public.coach_notes enable row level security;

create policy org_select on public.organizations for select to authenticated using (org_role(id) is not null);
create policy org_update on public.organizations for update to authenticated using (org_role(id) = 'admin') with check (org_role(id) = 'admin');
create policy org_delete on public.organizations for delete to authenticated using (org_role(id) = 'admin');
-- organizations are created through create_org() only.

create policy mem_select on public.memberships for select to authenticated using (org_role(org_id) is not null);
create policy mem_insert on public.memberships for insert to authenticated with check (org_role(org_id) = 'admin');
create policy mem_update on public.memberships for update to authenticated using (org_role(org_id) = 'admin') with check (org_role(org_id) = 'admin');
create policy mem_delete on public.memberships for delete to authenticated using (org_role(org_id) = 'admin');

create policy inv_all on public.invites for all to authenticated using (org_role(org_id) = 'admin') with check (org_role(org_id) = 'admin');

create policy prof_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from memberships a join memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));

create policy team_select on public.teams for select to authenticated using (org_role(org_id) is not null);
create policy team_insert on public.teams for insert to authenticated with check (org_role(org_id) = 'admin');
create policy team_update on public.teams for update to authenticated using (org_role(org_id) in ('admin','coach')) with check (org_role(org_id) in ('admin','coach'));
create policy team_delete on public.teams for delete to authenticated using (org_role(org_id) = 'admin');

-- team-data tables: members read, admins + coaches write
do $$
declare t text;
begin
  foreach t in array array['games','events','standings','notifications','sync_candidates','sc_weeks','sc_days','settings'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (can_read_team(team_id))', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated using (can_edit_team(team_id)) with check (can_edit_team(team_id))', t);
  end loop;
end $$;

create policy sync_runs_select on public.sync_runs for select to authenticated using (can_read_team(team_id));

create policy coach_notes_all on public.coach_notes for all to authenticated using (can_edit_team(team_id)) with check (can_edit_team(team_id));

create policy user_settings_own on public.user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ functions ============
-- New sign-ups: record the email and turn any invites into memberships.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, lower(new.email)) on conflict (id) do update set email = excluded.email;
  insert into memberships (org_id, user_id, role)
    select org_id, new.id, role from invites where email = lower(new.email)
    on conflict (org_id, user_id) do nothing;
  delete from invites where email = lower(new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Admin adds someone by email: immediate membership if they already have an account,
-- otherwise an invite that applies when they sign up.
create or replace function public.invite_member(p_org uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; e text := lower(trim(p_email));
begin
  if org_role(p_org) is distinct from 'admin' then raise exception 'Only an organization admin can add members'; end if;
  if p_role not in ('admin','coach','viewer') then raise exception 'Unknown role %', p_role; end if;
  select id into uid from profiles where email = e;
  if uid is not null then
    insert into memberships (org_id, user_id, role) values (p_org, uid, p_role)
      on conflict (org_id, user_id) do update set role = excluded.role;
    return 'added';
  end if;
  insert into invites (org_id, email, role) values (p_org, e, p_role)
    on conflict (org_id, email) do update set role = excluded.role;
  return 'invited';
end $$;

-- Any signed-in user can create an organization; they become its admin.
create or replace function public.create_org(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into organizations (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into oid;
  insert into memberships (org_id, user_id, role) values (oid, auth.uid(), 'admin');
  return oid;
end $$;

-- Read-only master schedule for /schedule/<slug>. Exposes only what the public page shows:
-- team names/colours, games (teams, date, time, venue, score) and calendar events.
-- No coach notes, S&C plan, notifications or members. Off unless organizations.public_schedule.
create or replace function public.public_schedule(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when o.id is null then null else jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'slug', o.slug),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'school', t.school, 'color', t.color, 'logo_url', t.logo_url, 'sort_order', t.sort_order) order by t.sort_order, t.created_at) from teams t where t.org_id = o.id), '[]'),
    'games', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'team_id', g.team_id, 'date', g.date, 'time', g.time, 'home', g.home, 'away', g.away, 'home_score', g.home_score, 'away_score', g.away_score, 'venue', g.venue, 'round', g.round)) from games g join teams t on t.id = g.team_id where t.org_id = o.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'team_id', e.team_id, 'date', e.date, 'time', e.time, 'title', e.title, 'kind', e.kind, 'location', e.location)) from events e join teams t on t.id = e.team_id where t.org_id = o.id), '[]')
  ) end
  from (select 1) _ left join organizations o on o.slug = lower(p_slug) and o.public_schedule
$$;

revoke execute on function public.public_schedule(text) from public;
grant execute on function public.public_schedule(text) to anon, authenticated;
revoke execute on function public.invite_member(uuid, text, text) from public, anon;
grant execute on function public.invite_member(uuid, text, text) to authenticated;
revoke execute on function public.create_org(text, text) from public, anon;
grant execute on function public.create_org(text, text) to authenticated;

-- keep games.updated_at current
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger games_touch before update on public.games for each row execute function public.touch_updated_at();

-- ============ storage: team logos ============
-- Public-read bucket; files live at <team_id>/logo-<timestamp>.png and only that team's
-- admins/coaches can write them.
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;
create policy logos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.can_edit_team(((storage.foldername(name))[1])::uuid));
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.can_edit_team(((storage.foldername(name))[1])::uuid));
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.can_edit_team(((storage.foldername(name))[1])::uuid));
