// Daily check-in (Josh, 2026-11-27): after practice and after the gym, each player gives an RPE
// (1–10) for each session they had that day and one note for the day, on their self-assessment
// link. Sessions come from the team's schedule the same way the master schedule lists them
// (slots.js weekItems): a practice event is a practice; an S&C day that isn't a day off or game
// day, or a rotation gym day in a week with an S&C plan, is a gym session. A day can be answered
// on the day and the 2 days after (checkin_submit in the database checks the same window).
// Completion % = sessions answered / sessions held; today's sessions only count once answered.
import { weekItems } from './slots.js';
import { addDays, mondayOf } from './sc.js';
import { isUsT } from './util.js';

export const RPE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const OPEN_DAYS = 3;   // today and the 2 days before
export const KINDS = [['practice', 'Practice'], ['gym', 'Gym']];

/** { [date]: { practice, gym } } for the days from..to that had a practice or a gym session.
 *  events: the team's events; sc: { [date]: S&C day }; org for the gym rotation. */
export function sessionDays(team, org, events, sc, from, to) {
  const out = {};
  if (!team || !from || !to || from > to) return out;
  const data = { [team.id]: { games: [], events: events || [], sc: sc || {} } };
  for (let mk = mondayOf(from); mk <= to; mk = addDays(mk, 7)) {
    weekItems([team], data, mk, () => '', org).forEach((x) => {
      if (x.date < from || x.date > to || (x.kind !== 'practice' && x.kind !== 'gym')) return;
      (out[x.date] = out[x.date] || { practice: false, gym: false })[x.kind] = true;
    });
  }
  return out;
}

/** Days a player can answer now, newest first: [{ date, practice, gym }]. */
export function openDays(sessions, today) {
  const out = [];
  for (let i = 0; i < OPEN_DAYS; i++) { const d = addDays(today, -i); if (sessions[d]) out.push({ date: d, ...sessions[d] }); }
  return out;
}

const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

/** One player's check-ins over a range: per kind the average RPE, sessions held and answered,
 *  and completion %. rows: the player's check-ins; sessions: sessionDays over at least the range. */
export function checkinStats(rows, sessions, { from = '', to = '', today }) {
  const mine = (rows || []).filter((r) => inRange(r.date, from, to) && r.date <= today);
  const by = Object.fromEntries(mine.map((r) => [r.date, r]));
  const out = { days: mine.length, notes: mine.filter((r) => r.note).length };
  KINDS.forEach(([k]) => {
    const key = k + '_rpe';
    let due = 0, done = 0;
    Object.entries(sessions || {}).forEach(([d, s]) => {
      if (!s[k] || !inRange(d, from, to) || d > today) return;
      const answered = by[d] && by[d][key] != null;
      if (d === today && !answered) return;
      due++; if (answered) done++;
    });
    const avg = mean(mine.map((r) => r[key]).filter((v) => v != null).map(Number));
    out[k] = { avg, n: mine.filter((r) => r[key] != null).length, due, done, pct: due ? done / due : null };
  });
  return out;
}

/** Game self-assessments over a range: games played (on or before today) and how many the
 *  player answered. games: the league games; rows: the player's self-assessments. */
export function gameStats(rows, games, team, { from = '', to = '', today }) {
  const played = (games || []).filter((g) => (isUsT(g.home, team) || isUsT(g.away, team)) && g.date <= today && inRange(g.date, from, to));
  const answered = new Set((rows || []).filter((a) => a.game_id).map((a) => a.game_id));
  const due = played.filter((g) => g.date < today || answered.has(g.id)), done = due.filter((g) => answered.has(g.id)).length;
  return { due: due.length, done, pct: due.length ? done / due.length : null };
}

export const fmtAvg = (v) => (v == null || v === '' ? '—' : Number(v).toFixed(1));
export const fmtPct = (p) => (p == null ? '—' : `${Math.round(p * 100)}%`);
