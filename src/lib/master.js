// All-teams S&C master schedule (Josh only), laid out like his S&C sheet: one block per week,
// one row per team, with the week's periodization and season week, then Monday to Sunday.
// Built from each team's own schedule (the same items as its Master schedule): S&C sessions
// with their gym times, games and events. Practices are left out.
import { INT, addDays, mondayOf } from './sc.js';
import { weekItems } from './slots.js';

// Team order of Josh's S&C sheet: Universel (U18, USPHL, NCDC Québec, NCDC Vermont), Bishop's,
// then BCS (U16, U18, varsity basketball, prep basketball). Teams matching none go last.
const SHEET_ORDER = [/universel.*u18/i, /usphl/i, /ncdc.*(qu|qc)/i, /ncdc.*(vt|vermont)/i, /bishop|\bbu\b/i, /u16/i, /u18/i, /varsity/i, /prep/i];
export function sheetOrder(teams) {
  const rank = (t) => { const i = SHEET_ORDER.findIndex((re) => re.test(t.name || '')); return i < 0 ? SHEET_ORDER.length : i; };
  return teams.map((t, i) => [t, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([t]) => t);
}

/** One team's cell for a day, from that team's schedule (lib/slots.js weekItems: S&C gym days
 * with their gym time or the organization's rotation, games, events). Practices are left out; a
 * day off shows OFF; a game day with no game listed keeps its S&C theme (e.g. "Away vs. UDM"). */
export function dayCell(team, d, date, items) {
  const x = (d.sc || {})[date], out = [], day = items.filter((i) => i.date === date && i.kind !== 'practice');
  if (x && x.intensity === 'off') out.push({ kind: 'off', text: 'OFF', cls: 'i-off' });
  if (x && x.intensity === 'game' && x.theme && !day.some((i) => i.kind === 'game')) out.push({ kind: 'sc', text: x.theme, cls: 'i-game', time: x.time || '' });
  day.forEach((i) => {
    if (i.kind === 'gym') out.push({ kind: 'sc', text: (i.sc && i.sc.theme) || (INT.find((k) => k.k === i.intensity && k.k) || {}).label || 'Gym', cls: 'i-' + (i.intensity || 'none'), time: i.time || '' });
    else if (i.kind === 'game') out.push({ kind: 'game', text: i.title.replace(/^@ /, 'Away vs. '), cls: 'i-game', time: i.time || '' });
    else out.push({ kind: 'event', text: i.title, cls: 'ev', time: i.time || '' });
  });
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
export function sheetWeek(teams, data, mk, orgOf = () => null) {
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mk, i));
  const rows = teams.map((t) => {
    const d = data[t.id] || {}, w = (d.weeks || {})[mk] || {}, items = weekItems([t], data, mk, () => '', orgOf(t));
    return { team: t, phase: w.phase || '', week: w.week || '', cells: days.map((date) => dayCell(t, d, date, items)) };
  });
  const same = (k) => rows.every((r) => r[k] === rows[0][k]);
  return { mk, days, rows, samePhase: same('phase'), sameWeek: same('week'), empty: rows.every((r) => !r.phase && !r.week && r.cells.every((c) => !c.length)) };
}
