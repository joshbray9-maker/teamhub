-- One-off data fix (Josh, 2026-11-01): remove the "(S&C sheet)" labels the original artifact put
-- on calendar events, and the "From S&C sheet" round on games. Safe to run more than once.
update public.events
  set title = btrim(regexp_replace(title, '\s*\(S&C sheet\)', '', 'gi'))
  where title ~* '\(S&C sheet\)';
update public.games
  set round = ''
  where round ~* '^\s*From S&C sheet\s*$';
-- should show 0 and 0
select (select count(*) from public.events where title ~* 'S&C sheet') as events_left,
       (select count(*) from public.games where round ~* 'S&C sheet') as games_left;
