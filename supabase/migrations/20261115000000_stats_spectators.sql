-- Game stats per player, and spectator links.
--
-- game_stats: one row per player per game; stats = {"g": 1, "a": 2, ...} (keys per sport in
-- src/lib/stats.js). Everyone on the team reads them; coaches and admins enter them.
create table public.game_stats (
  game_id uuid not null references public.games on delete cascade,
  player_id uuid not null references public.players on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  stats jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
create index on public.game_stats (team_id);
alter table public.game_stats enable row level security;
create policy game_stats_select on public.game_stats for select to authenticated using (can_read_team(team_id));
create policy game_stats_write on public.game_stats for all to authenticated using (can_edit_team(team_id))
  with check (can_edit_team(team_id)
    and exists (select 1 from public.games g where g.id = game_id and g.team_id = game_stats.team_id)
    and exists (select 1 from public.players p where p.id = player_id and p.team_id = game_stats.team_id));

-- Spectator links: a hard-to-guess address an org admin shares with parents / fans. It shows
-- the chosen teams (or every team in the organization): calendar, next game, results and
-- standings, plus player game stats only when show_stats is ticked. Admins manage them; the
-- public reads them only through spectator_view(), and a revoked link shows nothing.
create table public.spectator_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),  -- 64 random hex characters
  label text not null default '',
  team_ids uuid[],                         -- null = every team in the organization
  show_stats boolean not null default false,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.spectator_links enable row level security;
create policy spectator_links_admin on public.spectator_links for all to authenticated
  using (org_role(org_id) = 'admin') with check (org_role(org_id) = 'admin');

create or replace function public.spectator_view(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  with l as (select * from spectator_links where token = p_token and not revoked),
  o as (select o.* from organizations o join l on l.org_id = o.id),
  t as (select t.* from teams t join l on t.org_id = l.org_id where l.team_ids is null or t.id = any (l.team_ids))
  select case when not exists (select 1 from l) then null else jsonb_build_object(
    'label', (select label from l),
    'org', (select jsonb_build_object('name', name, 'slug', slug, 'logo_url', logo_url) from o),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'school', t.school, 'sport', t.sport, 'color', t.color,
        'logo_url', coalesce(t.logo_url, (select logo_url from o)), 'sort_order', t.sort_order) order by t.sort_order, t.created_at) from t), '[]'),
    'games', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'team_id', g.team_id, 'date', g.date, 'time', g.time, 'home', g.home, 'away', g.away,
        'home_score', g.home_score, 'away_score', g.away_score, 'venue', g.venue, 'round', g.round)) from games g join t on t.id = g.team_id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'team_id', e.team_id, 'date', e.date, 'time', e.time, 'title', e.title, 'kind', e.kind, 'location', e.location))
        from events e join t on t.id = e.team_id), '[]'),
    'standings', coalesce((select jsonb_agg(jsonb_build_object('team_id', s.team_id, 'groups', s.groups, 'updated_at', s.updated_at)) from standings s join t on t.id = s.team_id), '[]'),
    'stats', case when (select show_stats from l) then coalesce((select jsonb_agg(jsonb_build_object('team_id', gs.team_id, 'game_id', gs.game_id, 'player_id', p.id,
        'name', p.name, 'num', p.num, 'position', p.position, 'stats', gs.stats))
        from game_stats gs join t on t.id = gs.team_id join players p on p.id = gs.player_id and p.active), '[]') else null end
  ) end
$$;
revoke execute on function public.spectator_view(text) from public;
grant execute on function public.spectator_view(text) to anon, authenticated;
