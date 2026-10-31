// S&C: day intensity codes and workload maths (one session per day, load = units for that
// day's colour). Ported from the TeamHub artifact.
import { fromISO, iso, todayISO } from './util.js';

export const INT = [
  { k: '', label: 'Unrated', short: '–' }, { k: 'off', label: 'Off', short: 'O' }, { k: 'light', label: 'Light', short: 'L' },
  { k: 'moderate', label: 'Moderate', short: 'M' }, { k: 'heavy', label: 'Heavy', short: 'H' }, { k: 'game', label: 'Game', short: 'G' }];
// Placeholder load units per session colour. Not a validated scale: edit them in Workload settings.
export const DEFAULT_LOADS = { off: 0, light: 1, moderate: 2, heavy: 3, game: 3 };
// Placeholder reference band for the acute:chronic ratio. Set your own in Workload settings.
export const DEFAULT_BAND = { lo: 0.8, hi: 1.3 };
export const RATED = ['light', 'moderate', 'heavy', 'game'];

export function mondayOf(dstr) { const d = fromISO(dstr); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
export function addDays(dstr, n) { const d = fromISO(dstr); d.setDate(d.getDate() + n); return iso(d); }
export function thisMonday() { return mondayOf(todayISO()); }

export function scWeeks(sc) {
  const set = new Set(Object.keys(sc.weeks || {}));
  Object.keys(sc.days || {}).forEach((d) => set.add(mondayOf(d)));
  const ws = [...set].sort(); if (!ws.length) return ws;
  const out = []; for (let m = ws[0]; m <= ws[ws.length - 1]; m = addDays(m, 7)) out.push(m); // keep empty weeks so load gaps show
  return out;
}

export function scSeries(sc) {
  const loads = { ...DEFAULT_LOADS, ...(sc.loads || {}) }, ws = scWeeks(sc);
  if (!ws.length) return { weeks: [], loads };
  const start = ws[0], end = addDays(ws[ws.length - 1], 6), daily = [];
  for (let d = start; d <= end; d = addDays(d, 1)) { const x = (sc.days || {})[d]; const k = x && x.intensity; daily.push({ d, k, load: k && loads[k] != null ? +loads[k] : 0 }); }
  const weeks = ws.map((mk) => {
    const i0 = daily.findIndex((x) => x.d === mk), days = daily.slice(i0, i0 + 7);
    const c = { light: 0, moderate: 0, heavy: 0, game: 0 }; days.forEach((x) => { if (c[x.k] != null) c[x.k]++; });
    const sessions = c.light + c.moderate + c.heavy + c.game, load = days.reduce((a, x) => a + x.load, 0);
    const endIdx = i0 + 6, acute = daily.slice(Math.max(0, endIdx - 6), endIdx + 1).reduce((a, x) => a + x.load, 0);
    const chronic = endIdx >= 27 ? daily.slice(endIdx - 27, endIdx + 1).reduce((a, x) => a + x.load, 0) / 4 : null;
    const unrated = days.filter((x) => { const t = (sc.days || {})[x.d]; return t && t.theme && !t.intensity; }).length;
    return { mk, phase: ((sc.weeks || {})[mk] || {}).phase || '', c, sessions, load, avg: sessions ? load / sessions : null, acute, chronic, acwr: chronic ? acute / chronic : null, unrated };
  });
  return { weeks, loads };
}

export function niceTicks(max, n = 4) { const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p, s = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; const t = []; for (let v = 0; v <= max + 1e-9; v += s) t.push(+v.toFixed(4)); return { ticks: t, max: t[t.length - 1] }; }
