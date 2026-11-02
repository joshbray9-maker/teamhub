-- Gym days get an optional start time (HH:MM) so they sit in the right time slot on the
-- master week schedule. Existing days keep no time ("Time not set" row) until a coach picks one.
alter table public.sc_days add column if not exists time text
  check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
