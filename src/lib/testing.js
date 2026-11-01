// S&C testing: metrics, the two batteries, gym-group allocation and team trends. Pure functions.
import { fieldFor, nameKey } from './rosterImport.js';
//
// Gym groups (Josh's model, 2026-10-31). Each athlete's latest FULL testing is compared with
// the targets Josh sets per metric (no built-in targets: a metric without a target is ignored):
//   force quality      = IMTP peak force, relative peak force (N/kg)
//   expression quality = CMJ jump height, SJ jump height, RSImod
// Each result becomes a ratio to its target (1 = on target; for the 10 m fly, lower is better,
// so the ratio is target / time). The quality's index is the mean of its ratios.
//   force index < 1                                → Force deficient     (GPP, get stronger and bigger)
//   force ≥ 1, expression ≥ 1 and RSImod ≥ target  → Expression efficient (preserve, keep getting stronger and more explosive)
//   force ≥ 1, otherwise                           → Expression deficient (improve expression and rate of force development)
// A coach can move any player to another group by hand.

export const METRICS = {
  cmj_jh: { label: 'CMJ JH', unit: 'cm', long: 'CMJ jump height', dp: 1 },
  rsimod: { label: 'RSImod', unit: '', long: 'RSImod', dp: 2 },
  sj_jh: { label: 'SJ JH', unit: 'cm', long: 'SJ jump height', dp: 1 },
  imtp_pf: { label: 'IMTP PF', unit: 'N', long: 'IMTP peak force', dp: 0 },
  rel_pf: { label: 'Rel. PF', unit: 'N/kg', long: 'Relative peak force (BW/kg)', dp: 1 },
  fly10: { label: '10 m fly', unit: 's', long: '10 m fly time', dp: 2, lower: true },
  cooper: { label: 'Cooper', unit: 'm', long: 'Cooper test distance', dp: 0 },
  // basketball battery (Josh's sheet headings, 2026-11-01). bw and eur are recorded and charted but
  // never ranked or counted as "better/worse" (neutral); the timed drills rank fastest first.
  bw: { label: 'BW', unit: 'lb', long: 'Bodyweight', dp: 1, neutral: true },   // pounds, as on Josh's sheet; a heading saying kg is converted
  abalakov: { label: 'Abalakov', unit: 'cm', long: 'Abalakov jump height', dp: 1 },
  eur: { label: 'EUR', unit: '', long: 'Eccentric utilization ratio (CMJ / SJ)', dp: 2, neutral: true },
  t505: { label: '5-0-5', unit: 's', long: '5-0-5 drill', dp: 2, lower: true },
  cassivi: { label: 'Cassivi', unit: 's', long: 'Cassivi shuttle (3 pt, ½, full ×4)', dp: 2, lower: true },
  sprint20: { label: '20 m', unit: 's', long: '20 m sprint', dp: 2, lower: true },
};
export const BATTERIES = {
  readiness: { label: 'Weekly readiness', metrics: ['cmj_jh', 'rsimod', 'fly10'] },
  full: { label: 'Full team testing', metrics: ['cmj_jh', 'rsimod', 'sj_jh', 'imtp_pf', 'rel_pf', 'fly10', 'cooper'] },
};
// sports with their own test columns (in the order of the coach's sheet); others use BATTERIES
const SPORT_BATTERIES = {
  basketball: { readiness: ['cmj_jh', 'rsimod'], full: ['bw', 'cmj_jh', 'rsimod', 'abalakov', 'sj_jh', 'eur', 't505', 'cassivi', 'sprint20'] },
};
/** The test columns of a battery for a team's sport. */
export const batteryCols = (battery, sport) => (SPORT_BATTERIES[sport] && SPORT_BATTERIES[sport][battery]) || BATTERIES[battery].metrics;
export const FORCE = ['imtp_pf', 'rel_pf'], EXPRESSION = ['cmj_jh', 'sj_jh', 'rsimod'];
export const GROUPS = {
  efficient: { label: 'Expression efficient', focus: 'Preserve qualities and keep getting stronger and more explosive.', color: 'green' },
  expression: { label: 'Expression deficient', focus: 'Improve expression and rate of force development.', color: 'yellow' },
  force: { label: 'Force deficient', focus: 'GPP: focus on getting stronger and bigger.', color: 'red' },
};

export const num = (v) => { if (v === null || v === undefined || v === '') return null; const x = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(',', '.')); return Number.isFinite(x) ? x : null; };
export const fmt = (k, v) => (v === null || v === undefined ? '' : Number(v).toFixed(METRICS[k].dp));

/** Ratio of a result to its target (1 = on target, higher = better); null when either is missing. */
export function ratio(k, value, target) {
  const v = num(value), t = num(target); if (v === null || t === null || v <= 0 || t <= 0) return null;
  return METRICS[k].lower ? t / v : v / t;
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** → { group, auto, force, expression, rsi, reason } or { group: null, reason } when it can't be placed. */
export function gymGroup(values, targets, override) {
  const r = (k) => ratio(k, values && values[k], targets && targets[k]);
  const fr = FORCE.map(r).filter((x) => x !== null), er = EXPRESSION.map(r).filter((x) => x !== null);
  const force = mean(fr), expression = mean(er), rsi = r('rsimod');
  let auto = null, reason;
  if (force === null || expression === null) reason = 'Needs a force result (IMTP or relative PF) and an expression result (CMJ, SJ or RSImod) with targets set';
  else if (force < 1) { auto = 'force'; reason = `Force below target (${pct(force)})`; }
  else if (expression >= 1 && (rsi === null || rsi >= 1)) { auto = 'efficient'; reason = `Force ${pct(force)} and expression ${pct(expression)} of target`; }
  else { auto = 'expression'; reason = rsi !== null && rsi < 1 ? `Force on target (${pct(force)}) but RSImod below (${pct(rsi)})` : `Force on target (${pct(force)}) but expression below (${pct(expression)})`; }
  const group = override && GROUPS[override] ? override : auto;
  return { group, auto, force, expression, rsi, reason: override && GROUPS[override] && override !== auto ? `Moved by a coach (formula: ${auto ? GROUPS[auto].label : 'not placed'})` : reason };
}
const pct = (x) => `${Math.round(x * 100)}%`;

/* ---------- trends ---------- */
export function quantile(sorted, q) { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
/** sessions: [{id, tested_on, battery}], results: [{session_id, values}] →
 *  per metric: [{date, median, q1, q3, n}] in date order (sessions without that metric skipped) */
export function metricSeries(sessions, results) {
  const bySession = {}; results.forEach((r) => { (bySession[r.session_id] = bySession[r.session_id] || []).push(r.values || {}); });
  const out = {};
  for (const k of Object.keys(METRICS)) {
    out[k] = [...sessions].sort((a, b) => a.tested_on.localeCompare(b.tested_on)).map((s) => {
      const v = (bySession[s.id] || []).map((x) => num(x[k])).filter((x) => x !== null).sort((a, b) => a - b);
      return v.length ? { date: s.tested_on, session: s.id, median: quantile(v, 0.5), q1: quantile(v, 0.25), q3: quantile(v, 0.75), n: v.length } : null;
    }).filter(Boolean);
  }
  return out;
}
/** Median % change vs the first session for each metric (positive = better; the 10 m fly is inverted). */
export function changeSeries(series) {
  const out = {};
  for (const [k, pts] of Object.entries(series)) {
    if (!pts.length) continue; const base = pts[0].median; if (!base) continue;
    out[k] = pts.map((p) => ({ date: p.date, change: METRICS[k].lower ? (base - p.median) / base : (p.median - base) / base }));
  }
  return out;
}

/* ---------- import ---------- */
const hkey = (h) => String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const SYN = [ // checked in order; a heading matches when it equals or starts with an entry
  ['rsimod', ['rsimod', 'rsimodified', 'rsim', 'rsi']], ['rel_pf', ['relpf', 'relativepeakforce', 'relativeforce', 'relativepower', 'bwkg', 'nkg', 'pfbw', 'pfkg', 'imtprel', 'relimtp']],
  ['imtp_pf', ['imtp', 'peakforce', 'pf', 'isometricmidthigh']], ['cmj_jh', ['cmj', 'countermovement']], ['sj_jh', ['sj', 'squatjump']],
  ['fly10', ['10mfly', 'fly10', '10fly', 'flying10', 'fly']], ['cooper', ['cooper', '12min']],
  ['abalakov', ['abalakov', 'abal', 'aba']], ['eur', ['eur', 'eccentricutil']], ['t505', ['505', 'fivezerofive']], ['cassivi', ['cassivi', 'cassici', 'cassivy']],
  ['sprint20', ['20msprint', '20m', 'sprint20', '20sprint']], ['bw', ['bodyweight', 'bw', 'bodymass', 'weight', 'mass', 'poids']],
];
export function metricField(h) { const k = hkey(h); if (!k) return null; for (const [m, l] of SYN) if (l.some((s) => k === s || k.startsWith(s))) return m; return null; }
/** rows[0] = headings (a Name or # column plus metric columns). Matches players to the roster by
 *  name or number. → { values: {player_id: {metric: number}}, metrics: [found], unmatched: [names] } */
export function rowsToTests(rows, roster) {
  const head = rows[0] || [];
  const who = head.map((h) => { const f = fieldFor(h); return f === 'name' || f === 'num' || f === 'first' || f === 'last' ? f : null; });
  const met = head.map((h, i) => (who[i] ? null : metricField(h)));
  const scale = head.map((h, i) => (met[i] === 'bw' && /\bkgs?\b|kilo/i.test(String(h)) ? 2.20462 : 1)); // bodyweight is kept in pounds
  if (!who.some(Boolean)) throw new Error('No Name or # column found. The first row should be headings like Name, CMJ JH, RSImod.');
  if (!met.some(Boolean)) throw new Error('No test columns recognised. Use headings like CMJ JH, RSImod, SJ JH, IMTP, Rel PF, 10m fly, Cooper.');
  const byName = new Map(roster.map((p) => [nameKey(p.name), p])), byNum = new Map(roster.filter((p) => p.num).map((p) => [p.num, p]));
  const values = {}, unmatched = [];
  for (const r of rows.slice(1)) {
    const g = (f) => { const i = who.indexOf(f); return i >= 0 ? String(r[i] || '').trim() : ''; };
    let name = g('name') || [g('first'), g('last')].filter(Boolean).join(' '); const m = name.match(/^([^,]+),\s*([^,]+)$/); if (m) name = `${m[2]} ${m[1]}`;
    const n = g('num').replace(/^#/, '');
    const p = (name && byName.get(nameKey(name))) || (n && byNum.get(n)) || (/^#?\d+$/.test(name) && byNum.get(name.replace(/^#/, '')));
    const v = {}; met.forEach((k, i) => { if (k) { const x = num(r[i]); if (x !== null) v[k] = scale[i] === 1 ? x : Math.round(x * scale[i] * 10) / 10; } });
    if (!Object.keys(v).length) continue;
    if (!p) { unmatched.push(name || '#' + n); continue; }
    values[p.id] = { ...(values[p.id] || {}), ...v };
  }
  return { values, metrics: [...new Set(met.filter(Boolean))], unmatched };
}

/** A test date from a sheet cell: 2026-09-15, 9/15/2026, 15/9/2026 (day first when the first
 *  number can't be a month), 9/15/26, or "Sep 15 2026". '' when it isn't a date. */
export function testDate(v) {
  const s = String(v || '').trim(); let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) { m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/); if (m) { let [a, b] = [+m[1], +m[2]]; if (a > 12) [a, b] = [b, a]; m = [0, m[3].length === 2 ? '20' + m[3] : m[3], a, b]; } }
  if (m) { const [y, mo, d] = [+m[1], +m[2], +m[3]]; return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : ''; }
  if (!/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(s) || !/\d/.test(s)) return '';
  const d = new Date(s); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Bulk import: one sheet with a Date column, a Name (or #) column and test columns, one row per
 *  player per testing day (a blank date repeats the one above). Rows are grouped by date; a day
 *  with any test outside weekly readiness counts as full team testing.
 *  → { days: [{date, battery, values: {player_id: {metric: number}}}], metrics, unmatched, badDates } */
export function rowsToTestDays(rows, roster, sport) {
  const READINESS = new Set(batteryCols('readiness', sport));
  const head = rows[0] || [];
  const di = head.findIndex((h) => ['date', 'testdate', 'dateoftest', 'testedon', 'day', 'session', 'sessiondate'].includes(hkey(h)));
  if (di < 0) throw new Error('No Date column found. The first row should be headings like Date, Name, CMJ JH, RSImod.');
  const byDate = new Map(), badDates = []; let cur = '';
  for (const r of rows.slice(1)) {
    const raw = String(r[di] || '').trim();
    if (raw) { cur = testDate(raw); if (!cur && !badDates.includes(raw)) badDates.push(raw); }
    if (!cur || !r.some((x, i) => i !== di && String(x || '').trim())) continue;
    if (!byDate.has(cur)) byDate.set(cur, []); byDate.get(cur).push(r);
  }
  const h2 = head.map((h, i) => (i === di ? '' : h)), unmatched = new Set(), metrics = new Set(); const days = [];
  for (const [date, list] of [...byDate].sort((a, b) => a[0].localeCompare(b[0]))) {
    const t = rowsToTests([h2, ...list], roster);
    t.unmatched.forEach((n) => unmatched.add(n));
    if (!Object.keys(t.values).length) continue;
    const used = new Set(Object.values(t.values).flatMap(Object.keys)); used.forEach((k) => metrics.add(k));
    days.push({ date, battery: [...used].some((k) => !READINESS.has(k)) ? 'full' : 'readiness', values: t.values });
  }
  return { days, metrics: [...metrics], unmatched: [...unmatched], badDates };
}

/* ---------- leaderboard ---------- */
// rows: [{player_id, name, num, metric, value, tested_on}], each player's best per test.
// Per test: ranked best first (ties share a rank). Overall: each player's average "standing" across
// the tests they've done, where standing on a test = share of teammates they beat (best = 100,
// last = 0). Only players with at least MIN_TESTS tests (or every test, if fewer exist) count.
export const MIN_TESTS = 3;
export function leaderboards(rows) {
  const byMetric = {};
  for (const r of rows) { const v = num(r.value); if (v === null || !METRICS[r.metric]) continue; (byMetric[r.metric] = byMetric[r.metric] || []).push({ ...r, value: v }); }
  const standing = {};
  for (const [k, list] of Object.entries(byMetric)) {
    if (METRICS[k].neutral) { delete byMetric[k]; continue; }
    list.sort((a, b) => (METRICS[k].lower ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name));
    list.forEach((r, i) => { r.rank = i && list[i - 1].value === r.value ? list[i - 1].rank : i + 1; });
    if (list.length < 2) continue;
    list.forEach((r) => { const beat = list.filter((x) => (METRICS[k].lower ? x.value > r.value : x.value < r.value)).length;
      (standing[r.player_id] = standing[r.player_id] || { player_id: r.player_id, name: r.name, num: r.num, parts: {} }).parts[k] = (beat / (list.length - 1)) * 100; });
  }
  const tests = Object.values(byMetric).filter((l) => l.length >= 2).length, need = Math.min(MIN_TESTS, tests);
  const overall = Object.values(standing).map((s) => { const v = Object.values(s.parts); return { ...s, tests: v.length, score: v.reduce((a, b) => a + b, 0) / v.length }; })
    .filter((s) => s.tests >= need && need > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  overall.forEach((s, i) => { s.rank = i && Math.abs(overall[i - 1].score - s.score) < 1e-9 ? overall[i - 1].rank : i + 1; });
  return { byMetric, overall, need };
}
