// Game-by-game player self-assessment (Josh, 2026-11-05). Each player answers through their own
// link (/a/<token>) after every game; first name, last name and jersey number come from the
// roster, so the player doesn't type them. Each team's coaches can change, add and remove the
// questions (Josh, 2026-11-27): the team's list is the setting 'assess_questions'; without one
// the team uses QUESTIONS below (the same list as assess_default_questions() in the database).
// A removed question stays in the list with `off: true`, so earlier answers keep their label.
import { todayISO, isUsT } from './util.js';

// type 'scale': 1–5 buttons; 'choices': one of the listed answers; 'text': free text.
export const QUESTIONS = [
  { id: 'rating', label: 'Overall how do you like your game today?', short: 'Overall (1–5)', type: 'scale', low: 'Not at all', high: 'Loved it' },
  { id: 'well', label: 'What habits did you feel you did well in this game?', short: 'Habits done well', type: 'text' },
  { id: 'notWell', label: 'What habits did not do well in this game?', short: 'Habits not done well', type: 'text' },
  { id: 'fun', label: 'Did you have fun?', short: 'Fun', type: 'choices', choices: ['Yes', 'No'] },
  { id: 'compete', label: 'How hard did you feel you competed today?', short: 'Compete (1–5)', type: 'scale', low: 'Not hard', high: 'All out' },
  { id: 'improve', label: 'What do you want to improve on for your next game?', short: 'Improve next game', type: 'text' },
];
export const Q_TYPES = [['scale', 'Rating 1–5'], ['choices', 'Pick one answer'], ['text', 'Written answer']];

/** A team's question list (from its setting, else the defaults), each with a type and a short label. */
export function questionsOf(setting) {
  const list = Array.isArray(setting) && setting.length ? setting : QUESTIONS;
  return list.filter((q) => q && q.id).map((q) => ({ ...q, type: q.type || (q.scale ? 'scale' : q.choices ? 'choices' : 'text'), short: q.short || q.label || q.id, label: q.label || q.short || q.id }));
}
/** The questions players answer now (removed ones left out). */
export const activeQuestions = (qs) => questionsOf(qs).filter((q) => !q.off);
/** Questions to show as columns for some answers: the active ones, then removed ones these answers used. */
export function shownQuestions(qs, rows) {
  const all = questionsOf(qs), used = new Set((rows || []).flatMap((a) => Object.keys(a.answers || {})));
  return all.filter((q) => !q.off || used.has(q.id));
}
/** A new question id, unique in the list. */
export function newQuestionId(qs) { let i = 1; const ids = new Set((qs || []).map((q) => q.id)); while (ids.has('q' + i)) i++; return 'q' + i; }

/** "Josh Bray" → { first: 'Josh', last: 'Bray' } (everything after the first word is the last name). */
export function splitName(name) {
  const w = String(name || '').trim().split(/\s+/);
  return { first: w[0] || '', last: w.slice(1).join(' ') };
}

/** Answers kept the way the database keeps them (assess_submit): unknown ids and bad values dropped. */
export function cleanAnswers(a, qs) {
  const out = {};
  activeQuestions(qs).forEach((q) => {
    const v = String((a || {})[q.id] ?? '').trim();
    if (q.type === 'scale' ? /^[1-5]$/.test(v) : q.type === 'choices' ? (q.choices || []).includes(v) : v) out[q.id] = q.type === 'text' ? v.slice(0, 1000) : v;
  });
  return out;
}

/** Average of a 1–5 question over some answers ('' when none). */
export function avgOf(rows, id) { const v = rows.map((a) => Number((a.answers || {})[id])).filter(Boolean); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : ''; }

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
