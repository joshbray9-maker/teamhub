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

// Josh's BCS gym rotation (2026-11-02), day of week (1 = Monday) → team → start time:
// Monday basketball / U18 / U16; Tuesday and Wednesday U16 / U18 / basketball. Other days have
// no set rotation. Any day can still be changed by hand on the master schedule.
const BCS_TUE = { u16: '15:30', u18: '16:45', basketball: '18:00' };
export const ORG_ROTATION = {
  bcs: { 1: { basketball: '15:30', u18: '16:45', u16: '18:00' }, 2: BCS_TUE, 3: BCS_TUE },
};

const orgKey = (org, table) => {
  if (!org) return null;
  const names = [org.slug, slugify(org.name)].filter(Boolean);
  return Object.keys(table).find((x) => names.some((n) => n === x || n.split('-').includes(x))) || null;
};
/** The organization's slots ([[start, end], ...] as HH:MM), or null when it has none set. */
export function orgSlots(org) { const k = orgKey(org, ORG_SLOTS); return k ? ORG_SLOTS[k] : null; }

/** Rotation key for a team: 'basketball' for any basketball team, else its age group ('u16'). */
export function teamKey(t) {
  if (!t) return null;
  if (t.sport === 'basketball') return 'basketball';
  const m = /\bu\s?-?(\d{2})\b/i.exec(t.name || ''); return m ? 'u' + m[1] : null;
}
/** The rotation's gym start time for this team on this date, or '' when there isn't one. */
export function rotationTime(org, team, date) {
  const k = orgKey(org, ORG_ROTATION); if (!k) return '';
  const [y, m, d] = date.split('-').map(Number), day = ORG_ROTATION[k][new Date(y, m - 1, d).getDay()];
  return (day && day[teamKey(team)]) || '';
}

/** Row for a start time: a slot index, 'other' (outside every slot) or 'none' (no time set). */
export function slotOf(time, slots) {
  if (!time) return 'none';
  const t = String(time).slice(0, 5);
  const i = (slots || []).findIndex(([a, b]) => t >= a && t < b);
  return i >= 0 ? i : 'other';
}

/** One week (Monday mk) of items for every team: games, events/practices and gym days. A gym
 * day without its own time takes the rotation's time; in a week the team has an S&C plan, a
 * rotation day with nothing planned still shows as "Gym" (a day off or game day removes it). */
export function weekItems(teams, data, mk, colorOf, org) {
  const end = addDays(mk, 6), out = [];
  const inWeek = (d) => d && d >= mk && d <= end;
  teams.forEach((t) => {
    const d = data[t.id] || {}, color = colorOf(t);
    (d.games || []).forEach((g) => {
      const home = isUsT(g.home, t); if (!inWeek(g.date) || (!home && !isUsT(g.away, t))) return;
      out.push({ key: 'g' + g.id, tid: t.id, team: t.name, color, kind: 'game', date: g.date, time: g.time || '', title: `${home ? 'vs' : '@'} ${home ? g.away : g.home}`, venue: g.venue || '' });
    });
    (d.events || []).forEach((e) => { if (!inWeek(e.date)) return; out.push({ key: 'e' + e.id, tid: t.id, team: t.name, color, kind: e.kind === 'practice' ? 'practice' : 'event', date: e.date, time: e.time || '', title: e.title, venue: e.location || '', ev: e }); });
    const sc = d.sc || {}, planned = Object.keys(sc).some(inWeek);
    for (let i = 0; i < 7; i++) {
      const date = addDays(mk, i), x = sc[date], rot = rotationTime(org, t, date);
      // a game day or a day off isn't a gym session (the game itself is listed)
      if (x ? x.intensity === 'off' || x.intensity === 'game' || !(x.theme || x.intensity || x.time) : !(rot && planned)) continue;
      out.push({ key: 's' + t.id + date, tid: t.id, team: t.name, color, kind: 'gym', date, time: (x && x.time) || rot, title: (x && x.theme) || 'Gym', intensity: (x && x.intensity) || '', sc: x || null, rot });
    }
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

/** S&C day writes ([[date, value or null]]) for a hand edit of a gym item on the master
 * schedule. `change` = { date, time, theme } to move / retime it, or null to remove it.
 * Removing (or moving away from) a rotation day marks it "off" so the rotation doesn't put it
 * back; a planned day keeps its theme and is marked off rather than deleted. */
export function gymWrites(item, change, org, team) {
  const base = item.sc || {};
  const vacate = (date, x) => (rotationTime(org, team, date) || (x && x.theme && x.theme !== 'Gym') ? { ...(x || {}), intensity: 'off', time: '' } : null);
  if (!change) return [[item.date, vacate(item.date, item.sc)]];
  const val = { ...base, theme: change.theme.trim(), intensity: base.intensity === 'off' ? '' : base.intensity || '', time: change.time || '' };
  if (change.date === item.date) return [[item.date, val]];
  return [[change.date, val], [item.date, vacate(item.date, item.sc)]];
}
