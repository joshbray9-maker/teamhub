-- Game-by-game player self-assessments (Josh, 2026-11-05).
-- Players have no TeamHub accounts: each rostered player gets ONE permanent personal link
-- (/a/<token>) that a coach sends once. After every game on the team's schedule, that game's
-- questionnaire opens on the link by itself. Answers are kept per player per game, building a
-- season-long file. Only the organization's admins and coaches read them (same rule as IPPs and
-- injuries); a player only ever sees their own, through their link.
-- Questions and answer choices live in the app (src/lib/selfAssess.js); `answers` holds them by id.

-- ---------- personal links ----------
create table public.self_assess_links (
  player_id uuid primary key references public.players on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),  -- 64 random hex characters
  created_at timestamptz not null default now()
);
alter table public.self_assess_links enable row level security;
create policy self_assess_links_staff on public.self_assess_links for all to authenticated
  using (exists (select 1 from public.players p where p.id = player_id and can_edit_team(p.team_id)))
  with check (exists (select 1 from public.players p where p.id = player_id and can_edit_team(p.team_id)));

-- every player has a link: the ones already on rosters, and each one added from now on
insert into public.self_assess_links (player_id) select id from public.players on conflict do nothing;
create or replace function public.players_add_assess_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into self_assess_links (player_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke execute on function public.players_add_assess_link() from public, anon, authenticated;
create trigger players_assess_link after insert on public.players for each row execute function public.players_add_assess_link();

-- ---------- answers ----------
-- game_date / opponent are a snapshot, so removing a game from the schedule keeps the answers
-- (game_id becomes null). The player's team is read through players, so a player moved to
-- another team keeps their file.
create table public.self_assessments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players on delete cascade,
  game_id uuid references public.games on delete set null,
  game_date date not null,
  opponent text not null default '',
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, game_id)
);
create index on public.self_assessments (game_id);
alter table public.self_assessments enable row level security;
create policy self_assessments_staff on public.self_assessments for all to authenticated
  using (exists (select 1 from public.players p where p.id = player_id and can_edit_team(p.team_id)))
  with check (exists (select 1 from public.players p where p.id = player_id and can_edit_team(p.team_id)));
create trigger self_assessments_touch before update on public.self_assessments for each row execute function public.touch_updated_at();

-- ---------- which games are open ----------
-- A game opens once it has started (Eastern time; a game with no time opens on its day) and stays
-- open until a game on a LATER date starts, so two games on one day are answered separately.
-- Nothing older than 30 days opens (e.g. a link first used after a break).
create or replace function public.assess_open_games(p_team uuid, p_now timestamp) returns setof public.games
language sql stable security definer set search_path = public as $$
  with started as (
    select * from games where team_id = p_team
      and (date < p_now::date or (date = p_now::date and (time = '' or time <= to_char(p_now, 'HH24:MI'))))
  )
  select s.* from started s
  where s.date >= p_now::date - 30 and not exists (select 1 from started l where l.date > s.date)
$$;
revoke execute on function public.assess_open_games(uuid, timestamp) from public, anon, authenticated;

-- the other side of a game: the side that isn't the team (as isUsName in leagueParse.js, simplified)
create or replace function public.assess_opponent(p_home text, p_away text, p_team text, p_school text) returns text
language sql immutable set search_path = public as $$
  select case when position(lower(coalesce(nullif(p_school, ''), p_team)) in lower(p_home)) > 0
               or position(lower(p_team) in lower(p_home)) > 0 then p_away else p_home end
$$;
revoke execute on function public.assess_opponent(text, text, text, text) from public, anon, authenticated;

-- ---------- the player's page (public, by link) ----------
create or replace function public.assess_view(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (select pl.* from self_assess_links l join players pl on pl.id = l.player_id where l.token = p_token and pl.active),
  t as (select t.* from teams t join p on p.team_id = t.id),
  o as (select o.* from organizations o join t on t.org_id = o.id),
  g as (select * from assess_open_games((select id from t), (now() at time zone 'America/Toronto')::timestamp))
  select case when not exists (select 1 from p) then null else jsonb_build_object(
    'player', (select jsonb_build_object('name', name, 'num', num, 'position', position) from p),
    'team', (select jsonb_build_object('name', t.name, 'sport', t.sport, 'color', t.color, 'logo_url', coalesce(t.logo_url, (select logo_url from o))) from t),
    'org', (select jsonb_build_object('name', name, 'logo_url', logo_url) from o),
    'open', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'date', g.date, 'time', g.time, 'home', g.home, 'away', g.away,
        'opponent', assess_opponent(g.home, g.away, t.name, t.school), 'answers', a.answers, 'submitted_at', a.submitted_at) order by g.date, g.time)
      from g cross join t left join self_assessments a on a.game_id = g.id and a.player_id = (select id from p)), '[]'),
    'past', coalesce((select jsonb_agg(jsonb_build_object('game_date', a.game_date, 'opponent', a.opponent, 'answers', a.answers, 'submitted_at', a.submitted_at)
        order by a.game_date desc, a.submitted_at desc)
      from self_assessments a where a.player_id = (select id from p) and not exists (select 1 from g where g.id = a.game_id)), '[]')
  ) end
$$;
revoke execute on function public.assess_view(text) from public;
grant execute on function public.assess_view(text) to anon, authenticated;

-- Saves (or updates) the player's answers for an open game. Only the known questions are kept,
-- each checked: ratings '1'..'5', fun 'Yes'/'No', text answers trimmed to 1000 characters.
create or replace function public.assess_submit(p_token text, p_game uuid, p_answers jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare pl players; tm teams; gm games; a jsonb := '{}'::jsonb; k text; v text; ts timestamptz;
begin
  select pl2.* into pl from self_assess_links l join players pl2 on pl2.id = l.player_id where l.token = p_token and pl2.active;
  if not found then raise exception 'This link is not valid'; end if;
  select * into tm from teams where id = pl.team_id;
  select * into gm from assess_open_games(pl.team_id, (now() at time zone 'America/Toronto')::timestamp) x where x.id = p_game;
  if not found then raise exception 'This game is closed for answers'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'Answers missing'; end if;
  foreach k in array array['rating', 'compete'] loop
    v := p_answers->>k; if v in ('1', '2', '3', '4', '5') then a := a || jsonb_build_object(k, v); end if;
  end loop;
  v := p_answers->>'fun'; if v in ('Yes', 'No') then a := a || jsonb_build_object('fun', v); end if;
  foreach k in array array['well', 'notWell', 'improve'] loop
    v := left(btrim(coalesce(p_answers->>k, '')), 1000); if v <> '' then a := a || jsonb_build_object(k, v); end if;
  end loop;
  if a = '{}'::jsonb then raise exception 'Answer at least one question'; end if;
  insert into self_assessments (player_id, game_id, game_date, opponent, answers)
    values (pl.id, gm.id, gm.date, assess_opponent(gm.home, gm.away, tm.name, tm.school), a)
    on conflict (player_id, game_id) do update set answers = excluded.answers, game_date = excluded.game_date, opponent = excluded.opponent
    returning submitted_at into ts;
  return ts;
end $$;
revoke execute on function public.assess_submit(text, uuid, jsonb) from public;
grant execute on function public.assess_submit(text, uuid, jsonb) to anon, authenticated;
