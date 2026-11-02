// Master week schedule: every team in the organization (games, practices, events, gym days) on
// one week grid, with the organization's own time slots as the rows. Slot times are Josh's:
// Universel teams run 7:30 am–12 pm (shown in 30-minute rows), BCS teams use three slots.
import { slugify, isUsT } from './util.js';
import { addDays } from './sc.js';

const halfHours = (from, to) => { const out = []; const m = (t) => +t.slice(0, 2) * 60 + +t.slice(3); const hm = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; for (let n = m(from); n < m(to); n += 30) out.push([hm(n), hm(n + 30)]); return out; };
export const ORG_SLOTS = {
  bcs: [['15:30', '16:30'], ['16:45', '17:45'], ['18:00', '19:00']],
  universel: halfHours('07:30', '12:00'),
};

/** The organization's slots ([[start, end], ...] as HH:MM), or null when it has none set. */
export function orgSlots(org) {
  if (!org) return null;
  const names = [org.slug, slugify(org.name)].filter(Boolean);
  const k = Object.keys(ORG_SLOTS).find((x) => names.some((n) => n === x || n.split('-').includes(x)));
  return k ? ORG_SLOTS[k] : null;
}

/** Row for a start time: a slot index, 'other' (outside every slot) or 'none' (no time set). */
export function slotOf(time, slots) {
  if (!time) return 'none';
  const t = String(time).slice(0, 5);
  const i = (slots || []).findIndex(([a, b]) => t >= a && t < b);
  return i >= 0 ? i : 'other';
}

/** One week (Monday mk) of items for every team: games, events/practices and gym days. */
export function weekItems(teams, data, mk, colorOf) {
  const end = addDays(mk, 6), out = [];
  const inWeek = (d) => d && d >= mk && d <= end;
  teams.forEach((t) => {
    const d = data[t.id] || {}, color = colorOf(t);
    (d.games || []).forEach((g) => {
      const home = isUsT(g.home, t); if (!inWeek(g.date) || (!home && !isUsT(g.away, t))) return;
      out.push({ key: 'g' + g.id, tid: t.id, team: t.name, color, kind: 'game', date: g.date, time: g.time || '', title: `${home ? 'vs' : '@'} ${home ? g.away : g.home}`, venue: g.venue || '' });
    });
    (d.events || []).forEach((e) => { if (!inWeek(e.date)) return; out.push({ key: 'e' + e.id, tid: t.id, team: t.name, color, kind: e.kind === 'practice' ? 'practice' : 'event', date: e.date, time: e.time || '', title: e.title, venue: e.location || '' }); });
    Object.entries(d.sc || {}).forEach(([date, x]) => {
      // a game day or a day off isn't a gym session (the game itself is listed)
      if (!inWeek(date) || !x || x.intensity === 'off' || x.intensity === 'game' || !(x.theme || x.intensity)) return;
      out.push({ key: 's' + t.id + date, tid: t.id, team: t.name, color, kind: 'gym', date, time: x.time || '', title: x.theme || 'Gym', intensity: x.intensity || '' });
    });
  });
  return out.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')) || a.team.localeCompare(b.team));
}

/** Grid rows for a week: the slots, plus 'Other times' / 'Time not set' only when used. */
export function weekGrid(items, slots, mk) {
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mk, i));
  const rows = (slots || []).map((s, i) => ({ key: i, slot: s, cells: days.map(() => []) }));
  const other = { key: 'other', cells: days.map(() => []) }, none = { key: 'none', cells: days.map(() => []) };
  items.forEach((x) => { const r = slotOf(x.time, slots), di = days.indexOf(x.date); if (di < 0) return; (r === 'none' ? none : r === 'other' ? other : rows[r]).cells[di].push(x); });
  const used = (r) => r.cells.some((c) => c.length);
  return { days, rows: [...rows, ...(used(other) ? [other] : []), ...(used(none) ? [none] : [])] };
}
