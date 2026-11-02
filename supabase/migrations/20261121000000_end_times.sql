-- Optional end times (HH:MM) for gym days and events, so the master schedules can hold any
-- interval set by hand (e.g. 3:30–5:15), not just the fixed time slots. No end = the slot's end.
alter table public.sc_days add column if not exists end_time text
  check (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.events add column if not exists end_time text
  check (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
