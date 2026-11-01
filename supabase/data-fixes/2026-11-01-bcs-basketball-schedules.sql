-- Basketball schedule import (2026-2027 Basketball Schedule.xlsx), built 2026-11-01.
-- VARSITY PREP 18U tab -> BCS Varsity Basketball; PREP 16u tab -> BCS Basketball Prep (created here if missing).
-- One statement (no temporary tables) for the Supabase SQL editor. It:
-- 1) creates the BCS Basketball Prep team in the BCS organization (same colour and league setup style as Varsity),
-- 2) removes Varsity's old S&C-sheet day markers from the seed (exact date + title),
-- 3) updates the game already on each date (keeps saved lines), adds missing games,
-- 4) removes this season's leftover Varsity games the sheet doesn't list (never ones with lines or stats),
-- 5) adds tournaments, league weekends, breaks, the team meeting, practice day 1 and the tryout as calendar events.
-- Sheet fixes: Varsity "0909/02/2026/" -> 2026-09-02; Varsity "2026-03-09" -> 2026-09-03; Varsity "2026-12-09" -> 2026-09-12; Varsity "2026-06-11" -> 2026-11-06; Varsity "2026-10-11" -> 2026-11-10; 2026-11-20 "Northfield Mount Herman" -> Hermon; 2026-11-21 "Northfield Mount Herman" -> Hermon; Varsity "11/272026" -> 2026-11-27; 2026-12-05 Deerfield PREP (MA) "11:30PM" -> 11:30 (check); Varsity "2027-08-01" -> 2027-01-08; Varsity "2027-09-01" -> 2027-01-09; Varsity "2027-10-01" -> 2027-01-10; Prep "2027-10-09" -> 2026-09-10; Prep "2026-07-11" -> 2026-11-07; Prep "2026-08-11" -> 2026-11-08; Prep "2026-05-12" -> 2026-12-05; Prep "2026-06-12" -> 2026-12-06; Prep "2027-08-01" -> 2027-01-08; Prep "2027-09-01" -> 2027-01-09; Prep "2027-10-01" -> 2027-01-10; CHECK PREP 16u: 2027-01-28 is listed as FRIDAY but is a THURSDAY (kept the date); CHECK PREP 16u: 2027-01-29 is listed as SATURDAY but is a FRIDAY (kept the date); CHECK PREP 16u: 2027-01-30 is listed as SUNDAY but is a SATURDAY (kept the date).
-- Safe to run again: a second run changes nothing.
with new_team as (
  insert into public.teams (org_id, legacy_id, name, school, sport, level, color, league_name, sort_order)
  select v.org_id, 't_bcs_bball_prep', 'BCS Basketball Prep', 'Bishop''s College School', 'basketball', 'high-school', v.color, 'NPH Showcase League', v.sort_order
  from public.teams v where v.legacy_id = 't_basketball'
    and not exists (select 1 from public.teams where legacy_id = 't_bcs_bball_prep')
  returning id, legacy_id
), tm as (
  select id, legacy_id from public.teams where legacy_id in ('t_basketball', 't_bcs_bball_prep')
  union all select id, legacy_id from new_team
), pg as (
  select team, date::date as date, time, home, away, venue, round from (values
    ('t_basketball', '2026-09-12', '13:00', 'Bishop''s College School', 'Cégep de Sherbrooke (D2)', 'BCS', 'Exhibition game'),
    ('t_basketball', '2026-09-18', '19:00', 'Bishop''s College School', 'Champlain College Lennoxville (D1)', 'BCS', 'Exhibition game'),
    ('t_basketball', '2026-09-19', '10:45', 'St. Lawrence College (D2)', 'Bishop''s College School', 'Quebec City', 'SSF Showcase'),
    ('t_basketball', '2026-09-25', '19:00', 'Sacred Heart', 'Bishop''s College School', 'Montreal, QC', 'Excellence Challenge'),
    ('t_basketball', '2026-10-23', '16:00', 'Bishop''s College School', 'SSF Elite', 'BCS', 'Excellence Challenge'),
    ('t_basketball', '2026-11-06', '19:00', 'Bishop''s College School', 'ASL', 'BCS', 'Excellence Challenge'),
    ('t_basketball', '2026-11-10', '16:00', 'Bishop''s College School', 'Sacred Heart', 'BCS', 'Excellence Challenge'),
    ('t_basketball', '2026-12-04', '17:30', 'St. Luke''s Prep (CT)', 'Bishop''s College School', 'Connecticut/Massachusetts', 'Rose Classic Super Jam - Berkshire'),
    ('t_basketball', '2026-12-05', '11:30', 'Deerfield Prep (MA)', 'Bishop''s College School', 'Connecticut/Massachusetts', 'Rose Classic Super Jam - Berkshire'),
    ('t_basketball', '2026-12-06', '17:30', 'Darrow School Prep (NY)', 'Bishop''s College School', 'Connecticut/Massachusetts', 'Rose Classic Super Jam - Berkshire'),
    ('t_basketball', '2026-12-12', '13:00', 'ASL', 'Bishop''s College School', 'Quebec City (Cégep de Sainte-Foy)', 'Excellence League'),
    ('t_basketball', '2027-01-24', '15:00', 'Hoosac', 'Bishop''s College School', 'Hoosick, NY', 'NEPSAC'),
    ('t_basketball', '2027-01-29', '14:00', 'SSF Elite', 'Bishop''s College School', 'Quebec City', 'Excellence Challenge'),
    ('t_bcs_bball_prep', '2026-11-07', '11:00', 'Bishop''s College School', 'LCC', 'BCS', 'Exhibition game'),
    ('t_bcs_bball_prep', '2026-11-08', '13:00', 'Bishop''s College School', 'Celtics - St-Hyacinthe (JVD2)', 'BCS', 'Exhibition game'),
    ('t_bcs_bball_prep', '2026-12-05', '16:00', 'Hoosac Prep', 'Bishop''s College School', 'Connecticut/Massachusetts', 'Rose Classic Super Jam - Berkshire'),
    ('t_bcs_bball_prep', '2026-12-06', '16:00', 'Springfield Commonwealth Prep (MA)', 'Bishop''s College School', 'Connecticut/Massachusetts', 'Rose Classic Super Jam - Berkshire'),
    ('t_bcs_bball_prep', '2026-12-12', '15:00', 'ASL', 'Bishop''s College School', 'Quebec City', 'Exhibition game')
  ) v(team, date, time, home, away, venue, round)
), pe as (
  select team, date::date as date, time, title, location from (values
    ('t_basketball', '2026-09-02', '15:30', 'Team Meeting / Concussion Baseline', 'BCS'),
    ('t_basketball', '2026-09-03', '16:00', 'Practice - Day 1', 'BCS'),
    ('t_basketball', '2026-10-03', '', 'Slam Fall Showdown', 'Montreal, QC'),
    ('t_basketball', '2026-10-04', '', 'Slam Fall Showdown', 'Montreal, QC'),
    ('t_basketball', '2026-10-09', '', 'Thanksgiving', ''),
    ('t_basketball', '2026-10-10', '', 'Thanksgiving', ''),
    ('t_basketball', '2026-10-11', '', 'Thanksgiving', ''),
    ('t_basketball', '2026-10-12', '', 'Thanksgiving: students return 18:30 - 20:00', ''),
    ('t_basketball', '2026-10-16', '', 'WNPA (1)', 'Toronto, Ontario'),
    ('t_basketball', '2026-10-17', '', 'WNPA (1)', 'Toronto, Ontario'),
    ('t_basketball', '2026-10-18', '', 'WNPA (1)', 'Toronto, Ontario'),
    ('t_basketball', '2026-10-30', '', 'The Great North Championship', 'Portland/Saco, Maine'),
    ('t_basketball', '2026-10-31', '', 'The Great North Championship', 'Portland/Saco, Maine'),
    ('t_basketball', '2026-11-01', '', 'The Great North Championship', 'Portland/Saco, Maine'),
    ('t_basketball', '2026-11-11', '', 'November break: students depart 13:30', ''),
    ('t_basketball', '2026-11-12', '', 'November break', ''),
    ('t_basketball', '2026-11-13', '', 'November break', ''),
    ('t_basketball', '2026-11-14', '', 'November break', ''),
    ('t_basketball', '2026-11-15', '', 'November break', ''),
    ('t_basketball', '2026-11-16', '', 'November break: students return 18:30 - 21:00', ''),
    ('t_basketball', '2026-11-20', '', 'NEPSAC @ Northfield Mount Hermon School', 'Gill, Massachusetts'),
    ('t_basketball', '2026-11-21', '', 'NEPSAC @ Northfield Mount Hermon School', 'Gill, Massachusetts'),
    ('t_basketball', '2026-11-27', '', 'WNPA (2)', 'Toronto, Ontario'),
    ('t_basketball', '2026-11-28', '', 'WNPA (2)', 'Toronto, Ontario'),
    ('t_basketball', '2026-11-29', '', 'WNPA (2)', 'Toronto, Ontario'),
    ('t_basketball', '2026-12-17', '', 'Christmas break: students depart at 13:30', ''),
    ('t_basketball', '2026-12-18', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-19', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-20', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-21', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-22', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-23', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-24', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-25', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-26', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-27', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-28', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-29', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-30', '', 'Christmas break', ''),
    ('t_basketball', '2026-12-31', '', 'Christmas break', ''),
    ('t_basketball', '2027-01-01', '', 'Christmas break', ''),
    ('t_basketball', '2027-01-02', '', 'Christmas break', ''),
    ('t_basketball', '2027-01-03', '', 'Christmas break', ''),
    ('t_basketball', '2027-01-04', '', 'Christmas break', ''),
    ('t_basketball', '2027-01-05', '', 'Christmas break: students return 21:00', ''),
    ('t_basketball', '2027-01-08', '', 'Snowball Challenge', 'Montreal, QC'),
    ('t_basketball', '2027-01-09', '', 'Snowball Challenge', 'Montreal, QC'),
    ('t_basketball', '2027-01-10', '', 'Snowball Challenge', 'Montreal, QC'),
    ('t_basketball', '2027-01-15', '', 'Rose Classic', 'Brooklyn, New York'),
    ('t_basketball', '2027-01-16', '', 'Rose Classic', 'Brooklyn, New York'),
    ('t_basketball', '2027-01-17', '', 'Rose Classic', 'Brooklyn, New York'),
    ('t_basketball', '2027-02-04', '', 'Feb break: students depart 13:30', ''),
    ('t_basketball', '2027-02-05', '', 'Feb break', ''),
    ('t_basketball', '2027-02-06', '', 'Feb break', ''),
    ('t_basketball', '2027-02-07', '', 'Feb break', ''),
    ('t_basketball', '2027-02-08', '', 'Feb break: students return 18:30 - 21:00', ''),
    ('t_basketball', '2027-02-12', '', 'WNPA (3)', 'Toronto, Ontario'),
    ('t_basketball', '2027-02-13', '', 'WNPA (3)', 'Toronto, Ontario'),
    ('t_basketball', '2027-02-14', '', 'WNPA (3)', 'Toronto, Ontario'),
    ('t_basketball', '2027-02-19', '', 'Final 4', 'Quebec City'),
    ('t_basketball', '2027-02-20', '', 'Final 4', 'Quebec City'),
    ('t_basketball', '2027-02-21', '', 'Final 4', 'Quebec City'),
    ('t_basketball', '2027-03-05', '', 'WNPA Nationals 2027', 'Toronto, Ontario'),
    ('t_basketball', '2027-03-06', '', 'WNPA Nationals 2027', 'Toronto, Ontario'),
    ('t_basketball', '2027-03-07', '', 'WNPA Nationals 2027', 'Toronto, Ontario'),
    ('t_basketball', '2027-03-22', '', 'March break', ''),
    ('t_basketball', '2027-03-23', '', 'March break', ''),
    ('t_basketball', '2027-03-24', '', 'March break', ''),
    ('t_basketball', '2027-03-25', '', 'March break', ''),
    ('t_basketball', '2027-03-26', '', 'March break', ''),
    ('t_basketball', '2027-03-27', '', 'March break', ''),
    ('t_basketball', '2027-03-28', '', 'March break', ''),
    ('t_basketball', '2027-03-29', '', 'March break', ''),
    ('t_basketball', '2027-03-30', '', 'March break', ''),
    ('t_bcs_bball_prep', '2026-09-10', '16:45', 'Open Tryout', 'BCS'),
    ('t_bcs_bball_prep', '2026-10-09', '', 'Thanksgiving', ''),
    ('t_bcs_bball_prep', '2026-10-10', '', 'Thanksgiving', ''),
    ('t_bcs_bball_prep', '2026-10-11', '', 'Thanksgiving', ''),
    ('t_bcs_bball_prep', '2026-10-12', '', 'Thanksgiving: students return 18:30 - 20:00', ''),
    ('t_bcs_bball_prep', '2026-10-19', '', 'Practice Day 1', ''),
    ('t_bcs_bball_prep', '2026-10-30', '', 'The Great North Championship', 'Portland/Saco, Maine'),
    ('t_bcs_bball_prep', '2026-10-31', '', 'The Great North Championship', 'Portland/Saco, Maine'),
    ('t_bcs_bball_prep', '2026-11-01', '', 'The Great North Championship', 'Portland/Saco, Maine'),
    ('t_bcs_bball_prep', '2026-11-11', '', 'November break: students depart 13:30', ''),
    ('t_bcs_bball_prep', '2026-11-12', '', 'November break', ''),
    ('t_bcs_bball_prep', '2026-11-13', '', 'November break', ''),
    ('t_bcs_bball_prep', '2026-11-14', '', 'November break', ''),
    ('t_bcs_bball_prep', '2026-11-15', '', 'November break', ''),
    ('t_bcs_bball_prep', '2026-11-16', '', 'November break: students return 18:30 - 21:00', ''),
    ('t_bcs_bball_prep', '2026-11-18', '', 'CAIS', 'Montreal, QC'),
    ('t_bcs_bball_prep', '2026-11-19', '', 'CAIS', 'Montreal, QC'),
    ('t_bcs_bball_prep', '2026-11-20', '', 'CAIS', 'Montreal, QC'),
    ('t_bcs_bball_prep', '2026-11-21', '', 'CAIS', 'Montreal, QC'),
    ('t_bcs_bball_prep', '2026-11-27', '', 'NPH Showcase League (1)', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2026-11-28', '', 'NPH Showcase League (1)', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2026-11-29', '', 'NPH Showcase League (1)', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2026-12-17', '', 'Christmas break: students depart at 13:30', ''),
    ('t_bcs_bball_prep', '2026-12-18', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-19', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-20', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-21', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-22', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-23', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-24', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-25', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-26', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-27', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-28', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-29', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-30', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2026-12-31', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2027-01-01', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2027-01-02', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2027-01-03', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2027-01-04', '', 'Christmas break', ''),
    ('t_bcs_bball_prep', '2027-01-05', '', 'Christmas break: students return 21:00', ''),
    ('t_bcs_bball_prep', '2027-01-08', '', 'Snowball Challenge', 'Montreal, QC'),
    ('t_bcs_bball_prep', '2027-01-09', '', 'Snowball Challenge', 'Montreal, QC'),
    ('t_bcs_bball_prep', '2027-01-10', '', 'Snowball Challenge', 'Montreal, QC'),
    ('t_bcs_bball_prep', '2027-01-15', '', 'Montreal Independent School', 'Montreal, QC'),
    ('t_bcs_bball_prep', '2027-01-16', '', 'Montreal Independent School', 'Montreal, QC'),
    ('t_bcs_bball_prep', '2027-01-22', '', 'NPH Showcase League (2)', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2027-01-23', '', 'NPH Showcase League (2)', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2027-01-24', '', 'NPH Showcase League (2)', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2027-01-28', '', 'BCS Tournament', 'BCS'),
    ('t_bcs_bball_prep', '2027-01-29', '', 'BCS Tournament', 'BCS'),
    ('t_bcs_bball_prep', '2027-01-30', '', 'BCS Tournament', 'BCS'),
    ('t_bcs_bball_prep', '2027-02-04', '', 'Feb break: students depart 13:30', ''),
    ('t_bcs_bball_prep', '2027-02-05', '', 'Feb break', ''),
    ('t_bcs_bball_prep', '2027-02-06', '', 'Feb break', ''),
    ('t_bcs_bball_prep', '2027-02-07', '', 'Feb break', ''),
    ('t_bcs_bball_prep', '2027-02-08', '', 'Feb break: students return 18:30 - 21:00', ''),
    ('t_bcs_bball_prep', '2027-02-13', '', 'Exhibition game (opponent TBD)', ''),
    ('t_bcs_bball_prep', '2027-02-19', '', 'NPH Showcase League (3)', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2027-02-20', '', 'NPH Showcase League (3)', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2027-02-21', '', 'NPH Showcase League (3)', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2027-02-26', '', 'Showcase League - Championship', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2027-02-27', '', 'Showcase League - Championship', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2027-02-28', '', 'Showcase League - Championship', 'Toronto, Ontario'),
    ('t_bcs_bball_prep', '2027-03-22', '', 'March break', ''),
    ('t_bcs_bball_prep', '2027-03-23', '', 'March break', ''),
    ('t_bcs_bball_prep', '2027-03-24', '', 'March break', ''),
    ('t_bcs_bball_prep', '2027-03-25', '', 'March break', ''),
    ('t_bcs_bball_prep', '2027-03-26', '', 'March break', ''),
    ('t_bcs_bball_prep', '2027-03-27', '', 'March break', ''),
    ('t_bcs_bball_prep', '2027-03-28', '', 'March break', ''),
    ('t_bcs_bball_prep', '2027-03-29', '', 'March break', ''),
    ('t_bcs_bball_prep', '2027-03-30', '', 'March break', '')
  ) v(team, date, time, title, location)
), om as (
  select team, date::date as date, title from (values
    ('t_basketball', '2026-09-19', '@ SSF Showcase'),
    ('t_basketball', '2026-10-03', 'Slam Fall showdown (MTL) (day 1 of 2)'),
    ('t_basketball', '2026-10-04', 'Slam Fall showdown (MTL) (day 2 of 2)'),
    ('t_basketball', '2026-10-15', 'WNPA 1 (Toronto) (day 1 of 4)'),
    ('t_basketball', '2026-10-16', 'WNPA 1 (Toronto) (day 2 of 4)'),
    ('t_basketball', '2026-10-17', 'WNPA 1 (Toronto) (day 3 of 4)'),
    ('t_basketball', '2026-10-18', 'WNPA 1 (Toronto) (day 4 of 4)'),
    ('t_basketball', '2026-10-23', 'SSF Elite'),
    ('t_basketball', '2026-10-30', 'Chris Smalling Tournament (Oshawa, ON) (day 1 of 3)'),
    ('t_basketball', '2026-10-31', 'Chris Smalling Tournament (Oshawa, ON) (day 2 of 3)'),
    ('t_basketball', '2026-11-01', 'Chris Smalling Tournament (Oshawa, ON) (day 3 of 3)'),
    ('t_basketball', '2026-11-06', 'ASL'),
    ('t_basketball', '2026-11-10', 'Sacred heart'),
    ('t_basketball', '2026-11-20', 'Northfield, Mass (day 1 of 3)'),
    ('t_basketball', '2026-11-21', 'Northfield, Mass (day 2 of 3)'),
    ('t_basketball', '2026-11-22', 'Northfield, Mass (day 3 of 3)'),
    ('t_basketball', '2026-11-26', 'WNPA 2 (Toronto) (day 1 of 4)'),
    ('t_basketball', '2026-11-27', 'WNPA 2 (Toronto) (day 2 of 4)'),
    ('t_basketball', '2026-11-28', 'WNPA 2 (Toronto) (day 3 of 4)'),
    ('t_basketball', '2026-11-29', 'WNPA 2 (Toronto) (day 4 of 4)'),
    ('t_basketball', '2026-12-04', 'Rose classic Super Jam (Massuchusetts) (day 1 of 3)'),
    ('t_basketball', '2026-12-05', 'Rose classic Super Jam (Massuchusetts) (day 2 of 3)'),
    ('t_basketball', '2026-12-06', 'Rose classic Super Jam (Massuchusetts) (day 3 of 3)'),
    ('t_basketball', '2026-12-12', 'ASL'),
    ('t_basketball', '2027-01-08', 'Game – details TBC (day 1 of 3)'),
    ('t_basketball', '2027-01-09', 'Game – details TBC (day 2 of 3)'),
    ('t_basketball', '2027-01-10', 'Game – details TBC (day 3 of 3)'),
    ('t_basketball', '2027-01-15', 'Rose classic - New York (day 1 of 3)'),
    ('t_basketball', '2027-01-16', 'Rose classic - New York (day 2 of 3)'),
    ('t_basketball', '2027-01-17', 'Rose classic - New York (day 3 of 3)'),
    ('t_basketball', '2027-01-22', 'More than a Game - New Jersey (day 1 of 3)'),
    ('t_basketball', '2027-01-23', 'More than a Game - New Jersey (day 2 of 3)'),
    ('t_basketball', '2027-01-24', 'More than a Game - New Jersey (day 3 of 3)'),
    ('t_basketball', '2027-01-29', 'SSF Elite'),
    ('t_basketball', '2027-02-11', 'WNPA 3 (Toronto) (day 1 of 4)'),
    ('t_basketball', '2027-02-12', 'WNPA 3 (Toronto) (day 2 of 4)'),
    ('t_basketball', '2027-02-13', 'WNPA 3 (Toronto) (day 3 of 4)'),
    ('t_basketball', '2027-02-14', 'WNPA 3 (Toronto) (day 4 of 4)'),
    ('t_basketball', '2027-02-19', 'Final 4 (Qc) (day 1 of 3)'),
    ('t_basketball', '2027-02-20', 'Final 4 (Qc) (day 2 of 3)'),
    ('t_basketball', '2027-02-21', 'Final 4 (Qc) (day 3 of 3)'),
    ('t_basketball', '2027-03-03', 'WNPA Nationals (Toronto) (day 1 of 5)'),
    ('t_basketball', '2027-03-04', 'WNPA Nationals (Toronto) (day 2 of 5)'),
    ('t_basketball', '2027-03-05', 'WNPA Nationals (Toronto) (day 3 of 5)'),
    ('t_basketball', '2027-03-06', 'WNPA Nationals (Toronto) (day 4 of 5)'),
    ('t_basketball', '2027-03-07', 'WNPA Nationals (Toronto) (day 5 of 5)')
  ) v(team, date, title)
), del_markers as (
  delete from public.events e using tm t, om
  where e.team_id = t.id and t.legacy_id = om.team and e.date = om.date and e.title = om.title
  returning e.id
), upd as (
  update public.games g set time = p.time, home = p.home, away = p.away, venue = p.venue, round = p.round,
      source = 'import', sync_flag = null, sync_changes = null
  from pg p join tm t on t.legacy_id = p.team
  where g.team_id = t.id and g.date = p.date
  returning g.id
), ins as (
  insert into public.games (team_id, date, time, home, away, venue, round, source)
  select t.id, p.date, p.time, p.home, p.away, p.venue, p.round, 'import'
  from pg p join tm t on t.legacy_id = p.team
  where not exists (select 1 from public.games g where g.team_id = t.id and g.date = p.date)
  returning id
), del_games as (
  delete from public.games g using tm t
  where g.team_id = t.id and g.date between '2026-09-01' and '2027-04-30'
    and not exists (select 1 from pg p where p.team = t.legacy_id and p.date = g.date)
    and not exists (select 1 from public.lineups l where l.game_id = g.id)
    and not exists (select 1 from public.game_stats s where s.game_id = g.id)
  returning g.id
), ins_events as (
  insert into public.events (team_id, date, time, title, kind, location)
  select t.id, p.date, p.time, p.title, 'event', p.location
  from pe p join tm t on t.legacy_id = p.team
  where not exists (select 1 from public.events e where e.team_id = t.id and e.date = p.date and e.title = p.title)
  returning id
)
select (select count(*) from new_team) as team_created, (select count(*) from del_markers) as old_markers_removed,
       (select count(*) from upd) as games_updated, (select count(*) from ins) as games_added,
       (select count(*) from del_games) as old_games_removed, (select count(*) from ins_events) as events_added;
