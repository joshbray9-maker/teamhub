-- Hockey playbooks: which surface a play is drawn on.
--   court     : basketball half court (feet, 50 x 47)
--   rink-half : hockey offensive-zone half rink (feet, x 100-200 of a 200 x 85 rink)
--   rink-full : hockey full rink (feet, 200 x 85)
alter table public.plays add column surface text not null default 'court'
  check (surface in ('court', 'rink-half', 'rink-full'));
