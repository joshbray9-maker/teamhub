-- Basketball test results were pasted 2 columns too far right (the sheet has Position and Type of
-- Training columns that the bulk-import grid's headings didn't), so every test sits 2 columns to
-- the right of where it belongs. This moves each value 2 columns left, in the sheet's order:
--   Bodyweight  CMJ  RSImod  Abalakov  SJ  EUR  5-0-5  Cassivi  20m sprint
-- The values now under Cassivi and 20 m are the real 5-0-5 and Cassivi times; the real 20 m times
-- were never saved, so 20 m ends up empty until the sheet is pasted again.
-- Only rows that still look shifted are changed (no bodyweight yet, "RSImod" over 10, which can
-- only be a bodyweight), so running this twice changes nothing the second time.
with fixed as (
  update public.test_results r
  set values = (r.values - array['bw', 'cmj_jh', 'rsimod', 'abalakov', 'sj_jh', 'eur', 't505', 'cassivi', 'sprint20'])
      || jsonb_strip_nulls(jsonb_build_object(
           'bw', r.values -> 'rsimod',  'cmj_jh', r.values -> 'abalakov', 'rsimod', r.values -> 'sj_jh',
           'abalakov', r.values -> 'eur', 'sj_jh', r.values -> 't505', 'eur', r.values -> 'cassivi',
           't505', r.values -> 'sprint20')),
      updated_at = now()
  from public.teams t
  where r.team_id = t.id and t.sport = 'basketball'
    and not (r.values ? 'bw') and (r.values ->> 'rsimod') ~ '^[0-9.]+$' and (r.values ->> 'rsimod')::numeric > 10
  returning r.session_id
)
select count(*) as results_shifted, count(distinct session_id) as sessions from fixed;
