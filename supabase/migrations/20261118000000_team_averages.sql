-- Team averages: which testing counts for the team.
-- individual: a testing day for a few athletes (make-ups, early testing). Its results stay in
--   those athletes' history (profile, gym group, leaderboard bests) but are left out of every team
--   median, trend and comparison.
-- team_from: the first date whose testing counts in team averages (null = all), e.g. this season.
alter table public.test_sessions add column individual boolean not null default false;
alter table public.gym_config add column team_from date;
