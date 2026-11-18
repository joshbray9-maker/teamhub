// Repeating items on the master schedule. A repeat is saved as one ordinary event / S&C day per
// date (no series table), so "later ones like this" are found by matching team, kind, title and
// time from that date on.
import { fromISO, iso } from './util.js';
import { addDays } from './sc.js';

export const MAX_REPEATS = 200;
export const FREQS = [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekdays', 'Every weekday (Mon–Fri)'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks']];

/** Dates from `start` to `until` (inclusive) for a repeat rule. `days` = weekdays (0 = Sunday)
 * for weekly / every-2-weeks; empty means the start date's weekday. Capped at MAX_REPEATS. */
export function repeatDates(start, { freq = 'none', days = [], until = '' } = {}) {
  if (freq === 'none' || !until || until < start) return [start];
  const dow = (d) => fromISO(d).getDay(), wd = days.length ? days : [dow(start)];
  const mon = (d) => { const x = fromISO(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
  const m0 = mon(start), out = [];
  for (let d = start; d <= until && out.length < MAX_REPEATS; d = addDays(d, 1)) {
    const w = dow(d);
    if (freq === 'daily' || (freq === 'weekdays' && w >= 1 && w <= 5)) out.push(d);
    else if ((freq === 'weekly' || freq === 'biweekly') && wd.includes(w)) {
      const weeks = Math.round((fromISO(mon(d)) - fromISO(m0)) / (7 * 864e5));
      if (freq === 'weekly' || weeks % 2 === 0) out.push(d);
    }
  }
  return out;
}

/** Later items like `x` in that team's data (x itself included): events with the same kind,
 * title and time, or S&C gym days with the same theme and time, from x's date on. Returns
 * events ([{...event}]) or S&C dates ([[date, day]]). */
export function laterLike(x, d) {
  const t = (x.time || '').slice(0, 5), e = x.end || '';
  if (x.kind === 'gym') {
    if (!x.sc) return [[x.date, null]];
    const th = x.sc.theme || '';
    return Object.entries(d.sc || {}).filter(([date, s]) => date >= x.date && s && s.intensity !== 'off' && s.intensity !== 'game' && (s.theme || '') === th && (s.time || '').slice(0, 5) === t && (s.end || '') === e).sort(([a], [b]) => a.localeCompare(b));
  }
  if (!x.ev) return [];
  const k = x.ev.kind === 'practice' ? 'practice' : 'event';
  return (d.events || []).filter((v) => v.date >= x.date && !v.ext_id && (v.kind === 'practice' ? 'practice' : 'event') === k && v.title === x.ev.title && (v.time || '').slice(0, 5) === t && ((v.time && v.end_time) || '') === e).sort((a, b) => a.date.localeCompare(b.date));
}

/** Themes already used on any of these teams' S&C calendars, most used first. */
export function usedThemes(teams, data) {
  const n = {};
  teams.forEach((t) => Object.values((data[t.id] || {}).sc || {}).forEach((s) => { const th = s && (s.theme || '').trim(); if (th && th !== 'Gym') n[th] = (n[th] || 0) + 1; }));
  return Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b));
}
