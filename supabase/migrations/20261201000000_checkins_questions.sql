-- Daily check-ins and team-specific self-assessment questions (Josh, 2026-11-27).
--
-- 1. Daily check-in: after practice and after the gym, each player gives an RPE (1–10) for each
--    session they had that day, plus one note for the day. Answered on the same personal link as
--    the game self-assessment (/a/<token>, or the athlete's Self-assessment page). The page lists
--    the sessions (practices and gym days on the team's schedule, the last 3 days); the database
--    only checks the date window and the values. Completion % and averages are worked out in the
--    app (src/lib/checkin.js) from the schedule.
-- 2. Game self-assessment questions per team: settings key 'assess_questions' holds the team's
--    list ([{id, label, short, type: 'scale'|'choices'|'text', low, high, choices, off}]).
--    A removed question stays in the list with off = true, so earlier answers keep their label.
--    With no setting, a team uses the default questions below (the ones in src/lib/selfAssess.js).

-- ---------- check-ins ----------
create table public.checkins (
  player_id uuid not null references public.players on delete cascade,
  date date not null,
  practice_rpe smallint check (practice_rpe between 1 and 10),
  gym_rpe smallint check (gym_rpe between 1 and 10),
  note text not null default '' check (length(note) <= 1000),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, date)
);
alter table public.checkins enable row level security;
create policy checkins_staff on public.checkins for all to authenticated
  using (exists (select 1 from public.players p where p.id = player_id and can_edit_team(p.team_id)))
  with check (exists (select 1 from public.players p where p.id = player_id and can_edit_team(p.team_id)));
create trigger checkins_touch before update on public.checkins for each row execute function public.touch_updated_at();

-- ---------- the team's questions ----------
create or replace function public.assess_default_questions() returns jsonb
language sql immutable set search_path = public as $$
  select '[
    {"id":"rating","label":"Overall how do you like your game today?","short":"Overall (1–5)","type":"scale","low":"Not at all","high":"Loved it"},
    {"id":"well","label":"What habits did you feel you did well in this game?","short":"Habits done well","type":"text"},
    {"id":"notWell","label":"What habits did not do well in this game?","short":"Habits not done well","type":"text"},
    {"id":"fun","label":"Did you have fun?","short":"Fun","type":"choices","choices":["Yes","No"]},
    {"id":"compete","label":"How hard did you feel you competed today?","short":"Compete (1–5)","type":"scale","low":"Not hard","high":"All out"},
    {"id":"improve","label":"What do you want to improve on for your next game?","short":"Improve next game","type":"text"}
  ]'::jsonb
$$;
create or replace function public.assess_questions(p_team uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from settings where team_id = p_team and key = 'assess_questions' and jsonb_typeof(value) = 'array'), assess_default_questions())
$$;
revoke execute on function public.assess_questions(uuid) from public, anon, authenticated;

-- ---------- the player's page (public, by link): now with the questions and check-ins ----------
create or replace function public.assess_view(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (select pl.* from self_assess_links l join players pl on pl.id = l.player_id where l.token = p_token and pl.active),
  t as (select t.* from teams t join p on p.team_id = t.id),
  o as (select o.* from organizations o join t on t.org_id = o.id),
  today as (select (now() at time zone 'America/Toronto')::date as d),
  g as (select * from assess_open_games((select id from t), (now() at time zone 'America/Toronto')::timestamp))
  select case when not exists (select 1 from p) then null else jsonb_build_object(
    'player', (select jsonb_build_object('name', name, 'num', num, 'position', position) from p),
    'team', (select jsonb_build_object('id', t.id, 'name', t.name, 'school', t.school, 'sport', t.sport, 'color', t.color, 'logo_url', coalesce(t.logo_url, (select logo_url from o))) from t),
    'org', (select jsonb_build_object('name', name, 'slug', slug, 'logo_url', logo_url) from o),
    'today', (select d from today),
    'questions', assess_questions((select id from t)),
    'open', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'date', g.date, 'time', g.time, 'home', g.home, 'away', g.away,
        'opponent', assess_opponent(g.home, g.away, t.name, t.school), 'answers', a.answers, 'submitted_at', a.submitted_at) order by g.date, g.time)
      from g cross join t left join self_assessments a on a.game_id = g.id and a.player_id = (select id from p)), '[]'),
    'past', coalesce((select jsonb_agg(jsonb_build_object('game_date', a.game_date, 'opponent', a.opponent, 'answers', a.answers, 'submitted_at', a.submitted_at)
        order by a.game_date desc, a.submitted_at desc)
      from self_assessments a where a.player_id = (select id from p) and not exists (select 1 from g where g.id = a.game_id)), '[]'),
    -- the schedule around today (practices and S&C days; a week back so a gym rotation week is known) and the player's check-ins
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'date', e.date, 'time', e.time, 'end_time', e.end_time, 'title', e.title, 'kind', e.kind) order by e.date, e.time)
      from events e where e.team_id = (select id from t) and e.date between (select d from today) - 9 and (select d from today) + 6), '[]'),
    'sc', coalesce((select jsonb_agg(jsonb_build_object('date', s.date, 'theme', s.theme, 'intensity', s.intensity, 'time', s.time, 'end', s.end_time) order by s.date)
      from sc_days s where s.team_id = (select id from t) and s.date between (select d from today) - 9 and (select d from today) + 6), '[]'),
    'checkins', coalesce((select jsonb_agg(jsonb_build_object('date', c.date, 'practice_rpe', c.practice_rpe, 'gym_rpe', c.gym_rpe, 'note', c.note, 'submitted_at', c.submitted_at) order by c.date desc)
      from checkins c where c.player_id = (select id from p) and c.date >= (select d from today) - 30), '[]')
  ) end
$$;
revoke execute on function public.assess_view(text) from public;
grant execute on function public.assess_view(text) to anon, authenticated;

-- Saves (or updates) the player's answers for an open game. Only the team's current questions
-- are kept, each checked: a scale '1'..'5', a choice from its list, text trimmed to 1000 characters.
create or replace function public.assess_submit(p_token text, p_game uuid, p_answers jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare pl players; tm teams; gm games; a jsonb := '{}'::jsonb; q jsonb; k text; v text; ts timestamptz;
begin
  select pl2.* into pl from self_assess_links l join players pl2 on pl2.id = l.player_id where l.token = p_token and pl2.active;
  if not found then raise exception 'This link is not valid'; end if;
  select * into tm from teams where id = pl.team_id;
  select * into gm from assess_open_games(pl.team_id, (now() at time zone 'America/Toronto')::timestamp) x where x.id = p_game;
  if not found then raise exception 'This game is closed for answers'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'Answers missing'; end if;
  for q in select x from jsonb_array_elements(assess_questions(pl.team_id)) x loop
    k := q->>'id'; continue when k is null or coalesce((q->>'off')::boolean, false);
    v := btrim(coalesce(p_answers->>k, ''));
    if q->>'type' = 'scale' then
      if v in ('1', '2', '3', '4', '5') then a := a || jsonb_build_object(k, v); end if;
    elsif q->>'type' = 'choices' then
      if v <> '' and jsonb_typeof(q->'choices') = 'array' and (q->'choices') ? v then a := a || jsonb_build_object(k, v); end if;
    elsif v <> '' then a := a || jsonb_build_object(k, left(v, 1000));
    end if;
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

-- Saves the player's check-in for a day (today or the 2 days before, Eastern time). Each RPE is
-- 1–10 or empty; the note is trimmed to 1000 characters. Clearing everything removes the day.
create or replace function public.checkin_submit(p_token text, p_date date, p_practice int, p_gym int, p_note text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare pl players; today date := (now() at time zone 'America/Toronto')::date; n text := left(btrim(coalesce(p_note, '')), 1000); ts timestamptz;
begin
  select pl2.* into pl from self_assess_links l join players pl2 on pl2.id = l.player_id where l.token = p_token and pl2.active;
  if not found then raise exception 'This link is not valid'; end if;
  if p_date is null or p_date > today or p_date < today - 2 then raise exception 'Check-ins are open for today and the 2 days before'; end if;
  if (p_practice is not null and p_practice not between 1 and 10) or (p_gym is not null and p_gym not between 1 and 10) then raise exception 'RPE is a number from 1 to 10'; end if;
  if p_practice is null and p_gym is null and n = '' then
    delete from checkins where player_id = pl.id and date = p_date; return null;
  end if;
  insert into checkins (player_id, date, practice_rpe, gym_rpe, note) values (pl.id, p_date, p_practice, p_gym, n)
    on conflict (player_id, date) do update set practice_rpe = excluded.practice_rpe, gym_rpe = excluded.gym_rpe, note = excluded.note
    returning submitted_at into ts;
  return ts;
end $$;
revoke execute on function public.checkin_submit(text, date, int, int, text) from public;
grant execute on function public.checkin_submit(text, date, int, int, text) to anon, authenticated;

-- ---------- merging duplicate profiles: check-ins move too ----------
create or replace function public.merge_players(p_keep uuid, p_drop uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k players; d players;
begin
  select * into k from players where id = p_keep;
  select * into d from players where id = p_drop;
  if k.id is null or d.id is null then raise exception 'Player not found'; end if;
  if k.id = d.id then return; end if;
  if k.team_id <> d.team_id then raise exception 'Both profiles have to be on the same team: move one first'; end if;
  if not can_edit_team(k.team_id) then raise exception 'You need coach or admin access to this team to merge players'; end if;

  update test_results r set values = x.values || r.values, updated_at = now()
    from test_results x where r.player_id = p_keep and x.player_id = p_drop and x.session_id = r.session_id;
  delete from test_results where player_id = p_drop and session_id in (select session_id from test_results where player_id = p_keep);
  update test_results set player_id = p_keep where player_id = p_drop;

  update game_stats s set stats = x.stats || s.stats, updated_at = now()
    from game_stats x where s.player_id = p_keep and x.player_id = p_drop and x.game_id = s.game_id;
  delete from game_stats where player_id = p_drop and game_id in (select game_id from game_stats where player_id = p_keep);
  update game_stats set player_id = p_keep where player_id = p_drop;

  delete from self_assessments where player_id = p_drop and game_id is not null
    and game_id in (select game_id from self_assessments where player_id = p_keep and game_id is not null);
  update self_assessments set player_id = p_keep where player_id = p_drop;
  delete from self_assess_links where player_id = p_drop;

  -- check-ins: one per day per player; the kept profile's day wins
  delete from checkins where player_id = p_drop and date in (select date from checkins where player_id = p_keep);
  update checkins set player_id = p_keep where player_id = p_drop;

  update ipps i set data = x.data || i.data, updated_at = now()
    from ipps x where i.player_id = p_keep and x.player_id = p_drop and x.team_id = i.team_id;
  delete from ipps where player_id = p_drop and team_id in (select team_id from ipps where player_id = p_keep);
  update ipps set player_id = p_keep where player_id = p_drop;

  update injuries set player_id = p_keep where player_id = p_drop;
  update scat_tests set player_id = p_keep where player_id = p_drop;
  update memberships set player_id = p_keep where player_id = p_drop;
  update invites set player_id = p_keep where player_id = p_drop;

  update lineups set slots = replace(slots::text, p_drop::text, p_keep::text)::jsonb
    where team_id = k.team_id and slots::text like '%' || p_drop::text || '%';
  update gym_config set overrides = (overrides - p_drop::text)
      || case when overrides ? p_keep::text then '{}'::jsonb else jsonb_build_object(p_keep::text, overrides -> p_drop::text) end
    where team_id = k.team_id and overrides ? p_drop::text;

  update settings s set value = jsonb_set(s.value, '{rows}', coalesce((
      select jsonb_agg(case when r->>'player_id' = p_drop::text then jsonb_set(r, '{player_id}', to_jsonb(p_keep::text)) else r end)
      from jsonb_array_elements(s.value->'rows') r
      where not (r->>'player_id' = p_drop::text and exists (select 1 from jsonb_array_elements(s.value->'rows') q where q->>'player_id' = p_keep::text))), '[]'::jsonb))
    where s.team_id = k.team_id and s.key = 'league_stats' and jsonb_typeof(s.value->'rows') = 'array' and s.value::text like '%' || p_drop::text || '%';

  update players set
    num = coalesce(nullif(k.num, ''), d.num), position = coalesce(nullif(k.position, ''), d.position),
    shoots = coalesce(nullif(k.shoots, ''), d.shoots), year = coalesce(nullif(k.year, ''), d.year),
    height = coalesce(nullif(k.height, ''), d.height), weight = coalesce(nullif(k.weight, ''), d.weight),
    hometown = coalesce(nullif(k.hometown, ''), d.hometown), photo = coalesce(nullif(k.photo, ''), d.photo),
    active = k.active or d.active
  where id = p_keep;
  delete from players where id = p_drop;
end $$;
revoke execute on function public.merge_players(uuid, uuid) from public, anon;
grant execute on function public.merge_players(uuid, uuid) to authenticated;
