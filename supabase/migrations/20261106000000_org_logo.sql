-- Organization logos (used for every team in the organization that has no logo of its own,
-- and on printouts and the public schedule), BCS's logo, and an editable opponent name on
-- game-day lines.
alter table public.organizations add column logo_url text;
update public.organizations set logo_url = '/logos/bcs.png' where slug = 'bcs';

alter table public.lineups add column opponent text not null default '';

-- public schedule: include the organization logo, and use it for teams without their own
create or replace function public.public_schedule(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when o.id is null then null else jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'slug', o.slug, 'logo_url', o.logo_url),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'school', t.school, 'color', t.color, 'logo_url', coalesce(t.logo_url, o.logo_url), 'sort_order', t.sort_order) order by t.sort_order, t.created_at) from teams t where t.org_id = o.id), '[]'),
    'games', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'team_id', g.team_id, 'date', g.date, 'time', g.time, 'home', g.home, 'away', g.away, 'home_score', g.home_score, 'away_score', g.away_score, 'venue', g.venue, 'round', g.round)) from games g join teams t on t.id = g.team_id where t.org_id = o.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'team_id', e.team_id, 'date', e.date, 'time', e.time, 'title', e.title, 'kind', e.kind, 'location', e.location)) from events e join teams t on t.id = e.team_id where t.org_id = o.id), '[]')
  ) end
  from (select 1) _ left join organizations o on o.slug = lower(p_slug) and o.public_schedule
$$;
