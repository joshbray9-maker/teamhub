// Game-by-game player self-assessment (Josh, 2026-11-05). Each player answers through their own
// link (/a/<token>) after every game; first name, last name and jersey number come from the
// roster, so the player doesn't type them. Changing a question's wording is an edit here; a new
// question also needs its id added to assess_submit() in the self-assessments migration, which
// keeps only the ids it knows.
import { todayISO, isUsT } from './util.js';

// `scale`: 1–5 buttons; `choices`: one of the listed answers; otherwise free text.
// fun = Yes/No and compete = 1–5 were picked when building; Josh can change them.
export const QUESTIONS = [
  { id: 'rating', label: 'Overall how do you like your game today?', short: 'Overall (1–5)', scale: true, low: 'Not at all', high: 'Loved it' },
  { id: 'well', label: 'What habits did you feel you did well in this game?', short: 'Habits done well' },
  { id: 'notWell', label: 'What habits did not do well in this game?', short: 'Habits not done well' },
  { id: 'fun', label: 'Did you have fun?', short: 'Fun', choices: ['Yes', 'No'] },
  { id: 'compete', label: 'How hard did you feel you competed today?', short: 'Compete (1–5)', scale: true, low: 'Not hard', high: 'All out' },
  { id: 'improve', label: 'What do you want to improve on for your next game?', short: 'Improve next game' },
];

/** "Josh Bray" → { first: 'Josh', last: 'Bray' } (everything after the first word is the last name). */
export function splitName(name) {
  const w = String(name || '').trim().split(/\s+/);
  return { first: w[0] || '', last: w.slice(1).join(' ') };
}

/** Answers kept the way the database keeps them (assess_submit): unknown ids and bad values dropped. */
export function cleanAnswers(a) {
  const out = {};
  QUESTIONS.forEach((q) => {
    const v = String((a || {})[q.id] ?? '').trim();
    if (q.scale ? /^[1-5]$/.test(v) : q.choices ? q.choices.includes(v) : v) out[q.id] = q.scale || q.choices ? v : v.slice(0, 1000);
  });
  return out;
}

const localNow = () => { const d = new Date(); return { date: todayISO(), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }; };
const minus = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

/** Games open for answers (the same rule as assess_open_games): started, from the last 30 days,
 *  and no game on a later date has started yet. */
export function openGames(games, now = localNow()) {
  const started = (games || []).filter((g) => g.date < now.date || (g.date === now.date && (!g.time || g.time <= now.time)));
  const last = started.reduce((m, g) => (g.date > m ? g.date : m), '');
  return started.filter((g) => g.date === last && g.date >= minus(now.date, 30)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

/** The other side of a game for a team. */
export function opponentOf(g, t) { return isUsT(g.home, t) ? g.away : g.home; }
