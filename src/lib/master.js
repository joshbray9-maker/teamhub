// All-teams S&C master schedule (Josh only), laid out like his S&C sheet: one block per week,
// one row per team, with the week's periodization and season week, then Monday to Sunday.
// Strictly S&C sessions, games and events: practices are left out.
import { isUsT } from './util.js';
import { INT, addDays, mondayOf } from './sc.js';

// Team order of Josh's S&C sheet: Universel (U18, USPHL, NCDC Québec, NCDC Vermont), Bishop's,
// then BCS (U16, U18, varsity basketball, prep basketball). Teams matching none go last.
const SHEET_ORDER = [/universel.*u18/i, /usphl/i, /ncdc.*(qu|qc)/i, /ncdc.*(vt|vermont)/i, /bishop|\bbu\b/i, /u16/i, /u18/i, /varsity/i, /prep/i];
export function sheetOrder(teams) {
  const rank = (t) => { const i = SHEET_ORDER.findIndex((re) => re.test(t.name || '')); return i < 0 ? SHEET_ORDER.length : i; };
  return teams.map((t, i) => [t, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([t]) => t);
}

/** One team's cell for a day: S&C session, games and (non-practice) events, in that order. */
export function dayCell(team, d, date) {
  const x = (d.sc || {})[date], out = [];
  const games = (d.games || []).filter((g) => g.date === date && (isUsT(g.home, team) || isUsT(g.away, team)));
  if (x && x.intensity === 'off') out.push({ kind: 'off', text: x.theme || 'OFF', cls: 'i-off' });
  // on a game day the game itself is the entry; a theme on it (e.g. "Away vs. UDM") is kept if there's no game
  else if (x && (x.theme || x.intensity) && !(x.intensity === 'game' && games.length)) {
    out.push({ kind: 'sc', text: x.theme || (INT.find((i) => i.k === x.intensity) || {}).label || '', cls: 'i-' + (x.intensity || 'none'), time: x.time || '' });
  }
  games.forEach((g) => { const home = isUsT(g.home, team); out.push({ kind: 'game', text: `${home ? 'vs' : 'Away vs.'} ${home ? g.away : g.home}`, cls: 'i-game', time: g.time || '' }); });
  (d.events || []).filter((e) => e.date === date && e.kind !== 'practice').forEach((e) => out.push({ kind: 'event', text: e.title, cls: 'ev', time: e.time || '' }));
  return out;
}

/** Every week (Monday) from the first S&C week of any team to the last thing scheduled. */
export function sheetWeeks(teams, data, today) {
  const dates = [];
  teams.forEach((t) => { const d = data[t.id] || {}; dates.push(...Object.keys(d.sc || {}), ...Object.keys(d.weeks || {})); });
  if (!dates.length) return [mondayOf(today)];
  const first = mondayOf(dates.sort()[0]);
  teams.forEach((t) => { const d = data[t.id] || {}; (d.games || []).concat(d.events || []).forEach((x) => x.date && x.date >= first && dates.push(x.date)); });
  const last = mondayOf([...dates, today].sort().pop());
  const out = []; for (let m = first; m <= last; m = addDays(m, 7)) out.push(m);
  return out;
}

/** One week block: a row per team, and whether periodization / week are the same for all. */
export function sheetWeek(teams, data, mk) {
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mk, i));
  const rows = teams.map((t) => { const d = data[t.id] || {}, w = (d.weeks || {})[mk] || {}; return { team: t, phase: w.phase || '', week: w.week || '', cells: days.map((date) => dayCell(t, d, date)) }; });
  const same = (k) => rows.every((r) => r[k] === rows[0][k]);
  return { mk, days, rows, samePhase: same('phase'), sameWeek: same('week'), empty: rows.every((r) => !r.phase && !r.week && r.cells.every((c) => !c.length)) };
}
