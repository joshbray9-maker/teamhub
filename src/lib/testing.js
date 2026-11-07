// S&C testing: metrics, the two batteries, gym-group allocation and team trends. Pure functions.
import { fieldFor, nameMatcher } from './rosterImport.js';
//
// Gym groups (Josh's model, revised 2026-11-04). Each athlete's latest FULL testing is compared
// with the targets Josh sets per metric (no built-in targets). Each result becomes a ratio to
// its target (1 = on target). The two main factors are CMJ jump height AND RSImod:
//   CMJ and RSImod both at/above target → Expression efficient (preserve, keep getting stronger and more explosive)
//   one of them below target            → Expression deficient (improve expression and rate of force development)
//   both below target                   → Force deficient      (GPP, get stronger and bigger)
// IMTP is a bonus that can change the placement (IMTP index = mean of IMTP peak force and
// relative peak force ratios, whichever have a target; no IMTP result = no change):
//   IMTP at/above target moves Force deficient up to Expression deficient;
//   IMTP below target moves Expression deficient down to Force deficient;
//   Expression efficient never moves.
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
  bw: { label: 'Bodyweight', unit: 'lb', long: 'Bodyweight', dp: 1, neutral: true },   // pounds, as on Josh's sheet; a heading saying kg is converted
  abalakov: { label: 'Abalakov', unit: 'cm', long: 'Abalakov jump height', dp: 1 },
  eur: { label: 'EUR', unit: '', long: 'Eccentric utilization ratio (CMJ / SJ)', dp: 2, neutral: true },
  t505: { label: '5-0-5', unit: 's', long: '5-0-5 drill', dp: 2, lower: true },
  cassivi: { label: 'Cassivi', unit: 's', long: 'Cassivi shuttle (3 pt, ½, full ×4)', dp: 2, lower: true },
  sprint20: { label: '20 m', unit: 's', long: '20 m sprint', dp: 2, lower: true },
  // BCS hockey battery (Josh's sheet headings, 2026-11-01). TTPF and the 5-10-5 spread have no
  // confirmed better direction, so they're neutral; Archetype and Links are text, kept as typed.
  sprint10: { label: '10 m', unit: 's', long: '10 m sprint', dp: 2, lower: true },
  links: { label: 'Links', unit: '', long: 'Links', text: true },
  chinup: { label: 'Chin-up', unit: 'reps', long: 'Chin-ups', dp: 0 },
  cooper_laps: { label: 'Cooper laps', unit: 'laps', long: 'Cooper test laps', dp: 1 },
  archetype: { label: 'Archetype', unit: '', long: 'Archetype', text: true },
  ttpf: { label: 'TTPF', unit: '', long: 'Time to peak force', dp: 3, neutral: true },
  vo2max: { label: 'Est. VO2max', unit: 'ml/kg/min', long: 'Estimated VO2max', dp: 1 },
  ice5105: { label: '5-10-5 best', unit: 's', long: 'On-ice 5-10-5 best', dp: 2, lower: true },
  ice5105_sd: { label: '5-10-5 SD', unit: 's', long: 'On-ice 5-10-5 standard deviation', dp: 3, neutral: true },
  peak_power: { label: 'Peak power', unit: 'W', long: 'Peak power', dp: 0 },
};
// Bodyweight (pounds) is the first column of every battery (Josh, 2026-11-05).
export const BATTERIES = {
  readiness: { label: 'Weekly readiness', metrics: ['bw', 'cmj_jh', 'rsimod', 'fly10'] },
  full: { label: 'Full team testing', metrics: ['bw', 'cmj_jh', 'rsimod', 'sj_jh', 'imtp_pf', 'rel_pf', 'fly10', 'cooper'] },
};
// teams with their own test columns (in the order of the coach's sheet), by "<org slug>:<sport>"
// (one organization's teams of a sport) or by sport; everything else uses BATTERIES
const SPORT_BATTERIES = {
  basketball: { readiness: ['bw', 'cmj_jh', 'rsimod'], full: ['bw', 'cmj_jh', 'rsimod', 'abalakov', 'sj_jh', 'eur', 't505', 'cassivi', 'sprint20'] },
  'bcs:hockey': { readiness: ['bw', 'cmj_jh', 'rsimod', 'sprint10'],
    full: ['bw', 'cmj_jh', 'rsimod', 'sprint10', 'imtp_pf', 'rel_pf', 'links', 'sj_jh', 'chinup', 'cooper_laps', 'cooper', 'archetype', 'ttpf', 'vo2max', 'ice5105', 'ice5105_sd', 'peak_power'] },
};
/** Which test setup a team uses: "<org slug>:<sport>" when that organization has its own for the
 *  sport (BCS hockey), else the sport. Pass the result wherever a `sport` is asked for below. */
export const testProfile = (team, org) => { const k = org && org.slug && team ? `${org.slug}:${team.sport}` : null; return k && SPORT_BATTERIES[k] ? k : team && team.sport; };
/** The test columns of a battery for a team's sport. */
export const batteryCols = (battery, sport) => (SPORT_BATTERIES[sport] && SPORT_BATTERIES[sport][battery]) || BATTERIES[battery].metrics;
/** Every test, the sport's full battery first in its order: how lists of tests are shown. */
export const metricOrder = (sport) => [...new Set([...batteryCols('full', sport), ...Object.keys(METRICS)])];
// the heading row of the coach's season sheet, column for column (bulk import's paste grid)
const SPORT_SHEETS = {
  basketball: ['Name', 'Date', 'Team', 'Position', 'Type of Training', 'Bodyweight (pounds)', 'CMJ', 'RSImod', 'Abalakov jump', 'SJ', 'EUR', '5-0-5 drill', 'Cassivi shuttle', '20m sprint'],
  'bcs:hockey': ['Athlete Name', 'Date', 'Team', 'Bodyweight', 'CMJ', 'RSI Mod', '10m Sprint', 'IMTP', 'N/kg', 'Links', 'SJ', 'Chin-up', 'Cooper(laps)', 'Cooper(distance)', 'Archetype', 'TTPF', 'Est. VO2max', 'On Ice 5-10-5 best', 'On Ice 5-10-5 Stdv', 'Peak power'],
};
// the coach's own names for the tests, shown instead of the built-in labels
const LABELS = {
  'bcs:hockey': { bw: 'Bodyweight', cmj_jh: 'CMJ', rsimod: 'RSI Mod', sprint10: '10m Sprint', imtp_pf: 'IMTP', rel_pf: 'N/kg', links: 'Links', sj_jh: 'SJ', chinup: 'Chin-up',
    cooper_laps: 'Cooper(laps)', cooper: 'Cooper(distance)', archetype: 'Archetype', ttpf: 'TTPF', vo2max: 'Est. VO2max', ice5105: 'On Ice 5-10-5 best', ice5105_sd: 'On Ice 5-10-5 Stdv', peak_power: 'Peak power' },
};
/** METRICS with a team's own test names (label and long name) when it has them. */
export const metricsFor = (profile) => (LABELS[profile] ? Object.fromEntries(Object.entries(METRICS).map(([k, m]) => [k, LABELS[profile][k] ? { ...m, label: LABELS[profile][k], long: LABELS[profile][k] } : m])) : METRICS);
export const seasonSheet = (sport) => SPORT_SHEETS[sport] || ['Name', 'Date', ...batteryCols('full', sport).map((k) => `${METRICS[k].label}${METRICS[k].unit ? ` (${METRICS[k].unit})` : ''}`)];
// MAIN = the two deciding tests; FORCE = the IMTP bonus. (EXPRESSION kept as the old name for MAIN.)
export const MAIN = ['cmj_jh', 'rsimod'], FORCE = ['imtp_pf', 'rel_pf'], EXPRESSION = MAIN;
export const GROUPS = {
  efficient: { label: 'Expression efficient', focus: 'Preserve qualities and keep getting stronger and more explosive.', color: 'green' },
  expression: { label: 'Expression deficient', focus: 'Improve expression and rate of force development.', color: 'yellow' },
  force: { label: 'Force deficient', focus: 'GPP: focus on getting stronger and bigger.', color: 'red' },
};

export const num = (v) => { if (v === null || v === undefined || v === '') return null; const x = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(',', '.')); return Number.isFinite(x) ? x : null; };
export const fmt = (k, v) => (v === null || v === undefined ? '' : METRICS[k].text ? String(v) : Number(v).toFixed(METRICS[k].dp));
/** A cell's value for a test: a number, or for a text test (Archetype, Links) the trimmed text. */
export const cellValue = (k, v) => (METRICS[k] && METRICS[k].text ? (String(v ?? '').trim() || null) : num(v));

/** Ratio of a result to its target (1 = on target, higher = better); null when either is missing. */
export function ratio(k, value, target) {
  const v = num(value), t = num(target); if (v === null || t === null || v <= 0 || t <= 0) return null;
  return METRICS[k].lower ? t / v : v / t;
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** → { group, auto, main, cmj, rsi, force, reason } or { group: null, reason } when it can't be
 * placed. `main` is the CMJ + RSImod placement, `auto` after the IMTP bonus, `group` after a coach's move. */
export function gymGroup(values, targets, override) {
  const r = (k) => ratio(k, values && values[k], targets && targets[k]);
  const cmj = r('cmj_jh'), rsi = r('rsimod'), force = mean(FORCE.map(r).filter((x) => x !== null));
  let main = null, auto = null, reason;
  if (cmj === null || rsi === null) reason = 'Needs CMJ jump height and RSImod results, with a target set for both';
  else {
    const below = [cmj < 1 && 'CMJ', rsi < 1 && 'RSImod'].filter(Boolean);
    main = auto = below.length === 0 ? 'efficient' : below.length === 1 ? 'expression' : 'force';
    if (force !== null && main === 'force' && force >= 1) auto = 'expression';
    if (force !== null && main === 'expression' && force < 1) auto = 'force';
    const vals = `CMJ ${pct(cmj)}, RSImod ${pct(rsi)}`;
    reason = (below.length ? `${below.join(' and ')} below target (${vals})` : `CMJ and RSImod on target (${vals})`)
      + (auto !== main ? ` · IMTP ${pct(force)} ${force >= 1 ? 'on target: moved up' : 'below target: moved down'}` : force !== null ? ` · IMTP ${pct(force)}` : '');
  }
  const group = override && GROUPS[override] ? override : auto;
  return { group, auto, main, cmj, rsi, force, expression: main && mean([cmj, rsi]), reason: override && GROUPS[override] && override !== auto ? `Moved by a coach (formula: ${auto ? GROUPS[auto].label : 'not placed'})` : reason };
}
const pct = (x) => `${Math.round(x * 100)}%`;

/* ---------- trends ---------- */
/** The sessions that count for the team: not an individual testing day, and on or after the
 *  team's "team averages from" date. Individual days still count for the athletes who did them. */
export const teamSessions = (sessions, from) => sessions.filter((s) => !s.individual && (!from || s.tested_on >= from));
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

/* ---------- weekly testing and readiness (Coach's report) ---------- */
/** The latest team testing session and the one before it, with each test's team median and the
 *  change between them (positive = better; neutral tests have no direction).
 *  → null, or { session, prev, n, rows: [{k, median, prev, change, n}] } */
export function weeklyTesting(sessions, results, teamFrom, sport) {
  const team = teamSessions(sessions, teamFrom).filter((s) => results.some((r) => r.session_id === s.id)).sort((a, b) => a.tested_on.localeCompare(b.tested_on));
  const session = team[team.length - 1]; if (!session) return null;
  const prev = team[team.length - 2] || null;
  const vals = (s, k) => (s ? results.filter((r) => r.session_id === s.id).map((r) => num((r.values || {})[k])).filter((x) => x !== null).sort((a, b) => a - b) : []);
  const rows = metricOrder(sport).map((k) => {
    const v = vals(session, k); if (!v.length) return null;
    const median = quantile(v, 0.5), pv = vals(prev, k), pm = pv.length ? quantile(pv, 0.5) : null;
    const change = pm ? ((median - pm) / pm) * (METRICS[k].lower ? -1 : 1) : null;
    return { k, median, prev: pm, change, n: v.length };
  }).filter(Boolean);
  return { session, prev, n: results.filter((r) => r.session_id === session.id).length, rows };
}

// Josh's confirmed flag rules (2026-10-22): % change of the latest result vs the athlete's own
// baseline. CMJ jump height: any gain green, 0 to -5% no flag, -5% to -10% orange, -10% or worse
// red. RSImod: a gain or a drop of 5% or less green, more than 5% up to under 13% orange, 13% or
// more red. Baseline = mean of the athlete's previous BASELINE_TESTS results (testing that counts
// from the team-averages start date, individual days included: it's the athlete's own data).
export const FLAG_RULES = {
  cmj_jh: (c) => (c >= 0 ? 'green' : c > -5 ? 'none' : c > -10 ? 'orange' : 'red'),
  rsimod: (c) => (c >= -5 ? 'green' : c > -13 ? 'orange' : 'red'),
};
export const BASELINE_TESTS = 3;
const WORST = { red: 3, orange: 2, none: 1, green: 0 };
/** Readiness of the athletes in one testing session against their own baselines.
 *  → [{ player_id, flag, tests: {cmj_jh: {value, base, change, flag}, rsimod: {...}} }]; flag is
 *  the worst of the flagged tests, or null when the athlete has no earlier result to compare with. */
export function readiness(sessions, results, teamFrom, session) {
  const when = Object.fromEntries(sessions.filter((s) => !teamFrom || s.tested_on >= teamFrom).map((s) => [s.id, s.tested_on]));
  return results.filter((r) => r.session_id === session.id).map((r) => {
    const tests = {};
    for (const [k, rule] of Object.entries(FLAG_RULES)) {
      const value = num((r.values || {})[k]); if (value === null) continue;
      const earlier = results.filter((x) => x.player_id === r.player_id && when[x.session_id] && when[x.session_id] < session.tested_on && num((x.values || {})[k]) !== null)
        .sort((a, b) => when[b.session_id].localeCompare(when[a.session_id])).slice(0, BASELINE_TESTS).map((x) => num(x.values[k]));
      if (!earlier.length) { tests[k] = { value, base: null, change: null, flag: null }; continue; }
      const base = earlier.reduce((a, b) => a + b, 0) / earlier.length, change = ((value - base) / base) * 100;
      tests[k] = { value, base, change, flag: rule(change) };
    }
    const flags = Object.values(tests).map((x) => x.flag).filter(Boolean);
    return { player_id: r.player_id, tests, flag: flags.length ? flags.sort((a, b) => WORST[b] - WORST[a])[0] : null };
  }).filter((x) => Object.keys(x.tests).length);
}

/* ---------- athlete reports ---------- */
/** One athlete's testing between from and to (inclusive, '' = open), for the Athlete reports tab.
 *  Every session counts for the athlete (individual days too); the team median beside each test
 *  comes only from team sessions (teamSessions). Text tests are listed in `days` but not charted.
 *  → { days: [{date, individual, values}], tests: [{k, pts: [{date, value}], first, latest, best,
 *      change (latest vs first, positive = better, null for neutral), team: [{date, median}]}] } */
export function athleteHistory(sessions, results, teamFrom, playerId, from, to, profile) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const byId = Object.fromEntries(sessions.map((s) => [s.id, s]));
  const mine = results.filter((r) => r.player_id === playerId && byId[r.session_id] && inRange(byId[r.session_id].tested_on))
    .map((r) => ({ date: byId[r.session_id].tested_on, individual: !!byId[r.session_id].individual, values: r.values || {} })).sort((a, b) => a.date.localeCompare(b.date));
  const team = teamSessions(sessions, teamFrom).filter((s) => inRange(s.tested_on));
  const tests = metricOrder(profile).filter((k) => !METRICS[k].text).map((k) => {
    const pts = mine.map((r) => ({ date: r.date, value: num(r.values[k]) })).filter((x) => x.value !== null);
    if (!pts.length) return null;
    const first = pts[0], latest = pts[pts.length - 1], m = METRICS[k];
    const best = m.neutral ? null : pts.reduce((b, x) => (m.lower ? (x.value < b.value ? x : b) : (x.value > b.value ? x : b)));
    const change = m.neutral || pts.length < 2 || !first.value ? null : ((latest.value - first.value) / first.value) * (m.lower ? -1 : 1);
    const tm = team.map((s) => { const v = results.filter((r) => r.session_id === s.id).map((r) => num((r.values || {})[k])).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? { date: s.tested_on, median: quantile(v, 0.5) } : null; }).filter(Boolean);
    return { k, pts, first, latest, best, change, team: tm };
  }).filter(Boolean);
  return { days: mine, tests };
}
/** Date range presets for reports, as of `today`: this season (the team-averages date, or Sept 1 of
 *  the school year), the last 3 or 12 months, or everything. */
export function reportRange(preset, today, teamFrom) {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const back = (months) => { const d = new Date(Date.UTC(y, m - 1 - months, +today.slice(8, 10))); return d.toISOString().slice(0, 10); };
  if (preset === 'season') return { from: teamFrom || `${m >= 8 ? y : y - 1}-09-01`, to: today };
  if (preset === '3m') return { from: back(3), to: today };
  if (preset === '12m') return { from: back(12), to: today };
  return { from: '', to: '' };
}

/* ---------- import ---------- */
const hkey = (h) => String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const SYN = [ // checked in order; a heading matches when it equals or starts with an entry
  ['rsimod', ['rsimod', 'rsimodified', 'rsim', 'rsi']], ['rel_pf', ['relpf', 'relativepeakforce', 'relativeforce', 'relativepower', 'bwkg', 'nkg', 'pfbw', 'pfkg', 'imtprel', 'relimtp']],
  ['imtp_pf', ['imtp', 'peakforce', 'pf', 'isometricmidthigh']], ['cmj_jh', ['cmj', 'countermovement']], ['sj_jh', ['sj', 'squatjump']],
  ['fly10', ['10mfly', 'fly10', '10fly', 'flying10', 'fly']], ['sprint10', ['10msprint', 'sprint10', '10sprint', '10m']],
  ['cooper_laps', ['cooperlaps', 'cooperlap', 'laps']], ['cooper', ['cooper', '12min']],
  ['links', ['links', 'link', 'video']], ['chinup', ['chinup', 'chinups', 'pullup']], ['archetype', ['archetype']], ['ttpf', ['ttpf', 'timetopeakforce']],
  ['vo2max', ['estvo2max', 'vo2max', 'vo2', 'estimatedvo2']], ['ice5105_sd', ['onice5105stdv', 'onice5105std', 'onice5105sd', '5105stdv', '5105sd', '5105std']],
  ['ice5105', ['onice5105', '5105']], ['peak_power', ['peakpower']],
  ['abalakov', ['abalakov', 'abal', 'aba']], ['eur', ['eur', 'eccentricutil']], ['t505', ['505', 'fivezerofive']], ['cassivi', ['cassivi', 'cassici', 'cassivy']],
  ['sprint20', ['20msprint', '20m', 'sprint20', '20sprint']], ['bw', ['bodyweight', 'bw', 'bodymass', 'weight', 'mass', 'poids']],
];
export function metricField(h) { const k = hkey(h); if (!k) return null; for (const [m, l] of SYN) if (l.some((s) => k === s || k.startsWith(s))) return m; return null; }
/** rows[0] = headings (a Name or # column plus metric columns). Matches players to the roster by
 *  name (see nameMatcher: a first or last name alone matches a single profile containing it;
 *  those are listed in `loose` [{name, player_id}], and names fitting several profiles in
 *  `ambiguous` and skipped), or by number only on a row with no name (a name that isn't on the roster is skipped,
 *  never matched by jersey number: another team's player can wear the same number).
 *  A player listed twice keeps the first row's numbers: identical repeats are counted in `dupes`,
 *  different ones listed in `conflicts`.
 *  → { values: {player_id: {metric: number}}, metrics: [found], unmatched: [names], dupes, conflicts: [{player_id, metric, kept, dropped}] } */
export function rowsToTests(rows, roster) {
  const head = rows[0] || [];
  const who = head.map((h) => { const f = fieldFor(h); return f === 'name' || f === 'num' || f === 'first' || f === 'last' ? f : null; });
  const met = head.map((h, i) => (who[i] ? null : metricField(h)));
  const scale = head.map((h, i) => (met[i] === 'bw' && /\bkgs?\b|kilo/i.test(String(h)) ? 2.20462 : 1)); // bodyweight is kept in pounds
  if (!who.some(Boolean)) throw new Error('No Name or # column found. The first row should be headings like Name, CMJ JH, RSImod.');
  if (!met.some(Boolean)) throw new Error('No test columns recognised. Use headings like CMJ JH, RSImod, SJ JH, IMTP, Rel PF, 10m fly, Cooper.');
  const match = nameMatcher(roster), byNum = new Map(roster.filter((p) => p.num).map((p) => [p.num, p]));
  const values = {}, unmatched = [], conflicts = [], loose = [], ambiguous = []; let dupes = 0;
  for (const r of rows.slice(1)) {
    const g = (f) => { const i = who.indexOf(f); return i >= 0 ? String(r[i] || '').trim() : ''; };
    let name = g('name') || [g('first'), g('last')].filter(Boolean).join(' '); const m = name.match(/^([^,]+),\s*([^,]+)$/); if (m) name = `${m[2]} ${m[1]}`;
    const n = g('num').replace(/^#/, '');
    const hit = /^#?\d+$/.test(name) || !name ? null : match(name);
    const p = /^#?\d+$/.test(name) ? byNum.get(name.replace(/^#/, '')) : name ? hit && hit.p : n && byNum.get(n);
    const v = {}; met.forEach((k, i) => { if (k) { const x = cellValue(k, r[i]); if (x !== null) v[k] = scale[i] === 1 || typeof x !== 'number' ? x : Math.round(x * scale[i] * 10) / 10; } });
    if (!Object.keys(v).length) continue;
    if (!p) { if (hit && hit.ambiguous) ambiguous.push({ name, players: hit.ambiguous.map((x) => x.name) }); else unmatched.push(name || '#' + n); continue; }
    if (hit && hit.loose && !loose.some((x) => x.name === name)) loose.push({ name, player_id: p.id });
    const had = values[p.id] || {};
    for (const [k, x] of Object.entries(v)) {
      if (!(k in had)) had[k] = x; else if (String(had[k]) === String(x)) dupes++; else conflicts.push({ player_id: p.id, metric: k, kept: had[k], dropped: x });
    }
    values[p.id] = had;
  }
  return { values, metrics: [...new Set(met.filter(Boolean))], unmatched, dupes, conflicts, loose, ambiguous };
}

/** A test date from a sheet cell: 2026-09-15, "Sep 15 2026", or a/b/yyyy (or yy) read as
 *  day/month when order is 'dmy', month/day when 'mdy' (either way, a first number over 12 can
 *  only be a day). '' when it isn't a date. */
export function testDate(v, order = 'mdy') {
  const s = String(v || '').trim(); let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) { m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/); if (m) { let [a, b] = order === 'dmy' ? [+m[2], +m[1]] : [+m[1], +m[2]]; if (a > 12) [a, b] = [b, a]; m = [0, m[3].length === 2 ? '20' + m[3] : m[3], a, b]; } }
  if (m) { const [y, mo, d] = [+m[1], +m[2], +m[3]]; return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : ''; }
  if (!/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(s) || !/\d/.test(s)) return '';
  const d = new Date(s); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Bulk import: one sheet with a Date column, a Name (or #) column and test columns, one row per
 *  player per testing day (a blank date repeats the one above). Rows are grouped by date; a day
 *  with any test outside weekly readiness counts as full team testing.
 *  Words in a test column (e.g. a position under Bodyweight) mean the columns don't line up with
 *  the headings, and are reported in `textCols` so the coach can fix the paste before saving.
 *  → { days: [{date, battery, values: {player_id: {metric: number}}}], metrics, unmatched, badDates, textCols } */
/** How a sheet writes a/b/yyyy dates: 'dmy' when some first number is over 12 (23/09/2025),
 *  'mdy' when some second number is, null when every date could be read either way. */
export function dateOrder(cells) {
  const ab = cells.map((c) => String(c || '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}\b/)).filter(Boolean);
  if (ab.some((m) => +m[1] > 12)) return 'dmy'; if (ab.some((m) => +m[2] > 12)) return 'mdy'; return null;
}
/** opts: { order: 'dmy' | 'mdy' (default: from the sheet, else day/month), from, to: 'YYYY-MM-DD'
 *  (days outside are left out and listed in `outside`), teams: [values of the sheet's Team column
 *  to import] }. With a Team column, rows of the other teams are left out; by default a team is
 *  imported when most of its rows' names are on this roster (listed in `teams`, with `on`).
 *  Repeats (a player twice on one day) keep the first row: `dupes` counts identical ones, and
 *  `conflicts` lists [{date, player_id, metric, kept, dropped}]. */
export function rowsToTestDays(rows, roster, sport, opts = {}) {
  const READINESS = new Set(batteryCols('readiness', sport));
  const head = rows[0] || [];
  const di = head.findIndex((h) => ['date', 'testdate', 'dateoftest', 'testedon', 'day', 'session', 'sessiondate'].includes(hkey(h)));
  if (di < 0) throw new Error('No Date column found. The first row should be headings like Date, Name, CMJ JH, RSImod.');
  const detected = dateOrder(rows.slice(1).map((r) => r[di])), order = opts.order || detected || 'dmy';
  // the sheet's Team column: which teams' rows to import
  const ti = head.findIndex((h, i) => i !== di && ['team', 'teamname', 'equipe', 'squad', 'club'].includes(hkey(h)));
  let teams = [];
  if (ti >= 0) {
    const match = nameMatcher(roster), wi = head.findIndex((h) => fieldFor(h) === 'name'), by = new Map();
    rows.slice(1).forEach((r) => { const t = String(r[ti] || '').trim(); if (!t) return; const x = by.get(t) || { value: t, rows: 0, named: 0, matched: 0 }; x.rows++;
      const nm = wi >= 0 ? String(r[wi] || '').trim().replace(/^([^,]+),\s*([^,]+)$/, '$2 $1') : ''; if (nm) { x.named++; const h = match(nm); if (h && h.p) x.matched++; } by.set(t, x); });
    teams = [...by.values()].map((x) => ({ ...x, on: opts.teams ? opts.teams.includes(x.value) : x.named ? x.matched * 2 >= x.named : false }));
  }
  const skipTeam = new Set(teams.filter((t) => !t.on).map((t) => t.value)); let otherTeam = 0;
  const byDate = new Map(), badDates = []; let cur = '';
  for (const r of rows.slice(1)) {
    const raw = String(r[di] || '').trim();
    if (raw) { cur = testDate(raw, order); if (!cur && !badDates.includes(raw)) badDates.push(raw); }
    if (!cur || !r.some((x, i) => i !== di && String(x || '').trim())) continue;
    if (ti >= 0 && skipTeam.has(String(r[ti] || '').trim())) { otherTeam++; continue; }
    if (!byDate.has(cur)) byDate.set(cur, []); byDate.get(cur).push(r);
  }
  const h2 = head.map((h, i) => (i === di ? '' : h)), unmatched = new Set(), metrics = new Set(); const days = [], conflicts = [], loose = new Map(), ambiguous = new Map(); let dupes = 0;
  const textCols = head.map((h, i) => { if (i === di || !metricField(h) || METRICS[metricField(h)].text || ['name', 'num', 'first', 'last'].includes(fieldFor(h))) return null;
    const words = [...new Set([...byDate.values()].flat().map((r) => String(r[i] || '').trim()).filter((v) => v && num(v) === null))];
    return words.length ? { heading: String(h).trim(), examples: words.slice(0, 3) } : null; }).filter(Boolean);
  const outside = [];
  for (const [date, list] of [...byDate].sort((a, b) => a[0].localeCompare(b[0]))) {
    if ((opts.from && date < opts.from) || (opts.to && date > opts.to)) { outside.push(date); continue; }
    const t = rowsToTests([h2, ...list], roster);
    t.unmatched.forEach((n) => unmatched.add(n)); dupes += t.dupes; t.conflicts.forEach((c) => conflicts.push({ date, ...c }));
    t.loose.forEach((x) => loose.set(x.name, x)); t.ambiguous.forEach((x) => ambiguous.set(x.name, x));
    if (!Object.keys(t.values).length) continue;
    const used = new Set(Object.values(t.values).flatMap(Object.keys)); used.forEach((k) => metrics.add(k));
    days.push({ date, battery: [...used].some((k) => !READINESS.has(k)) ? 'full' : 'readiness', values: t.values });
  }
  // A Bodyweight heading without a unit: IMTP ÷ N/kg is bodyweight in kg, so the sheet's own
  // numbers say whether it was typed in kg (then it's converted: bodyweight is kept in pounds).
  const bwHead = head.find((h) => metricField(h) === 'bw'); let bwRead = null;
  if (bwHead && !/\b(kgs?|kilo\w*|lbs?|pounds?)\b/i.test(String(bwHead))) {
    const ratios = days.flatMap((d) => Object.values(d.values)).filter((v) => typeof v.bw === 'number' && v.imtp_pf > 0 && v.rel_pf > 0 && v.bw > 0).map((v) => v.imtp_pf / v.rel_pf / v.bw).sort((a, b) => a - b);
    const m = quantile(ratios, 0.5);
    if (m !== null && m > 0.85 && m < 1.15) { bwRead = 'kg'; days.forEach((d) => Object.values(d.values).forEach((v) => { if (typeof v.bw === 'number') v.bw = Math.round(v.bw * 2.20462 * 10) / 10; })); }
    else if (m !== null && m > 0.39 && m < 0.52) bwRead = 'lb';
  }
  return { days, metrics: [...metrics], unmatched: [...unmatched], badDates, textCols, bwRead, order, detected, outside, teams, otherTeam, dupes, conflicts, loose: [...loose.values()], ambiguous: [...ambiguous.values()] };
}

/** What a bulk import adds to what's saved: a result the player already has on that date (in any
 *  session that day) is a repeat and left out, unless `replace` is set and the sheet's number is
 *  different. → { days: [{...day, values: only what's new}], same: count, differ: [{date, player_id, metric, saved, sheet}] } */
export function bulkNew(days, sessions, results, replace = false) {
  const dateOf = Object.fromEntries(sessions.map((s) => [s.id, s.tested_on])), saved = {};
  results.forEach((r) => { const d = dateOf[r.session_id]; if (!d) return; const k = d + '|' + r.player_id; saved[k] = { ...(saved[k] || {}), ...(r.values || {}) }; });
  let same = 0; const differ = [];
  const out = days.map((day) => ({ ...day, values: Object.fromEntries(Object.entries(day.values).map(([pid, v]) => {
    const old = saved[day.date + '|' + pid] || {}, keep = {};
    for (const [k, x] of Object.entries(v)) {
      if (!(k in old) || old[k] === null || old[k] === '') keep[k] = x;
      else if (String(old[k]) === String(x)) same++;
      else { differ.push({ date: day.date, player_id: pid, metric: k, saved: old[k], sheet: x }); if (replace) keep[k] = x; }
    }
    return [pid, keep];
  }).filter(([, v]) => Object.keys(v).length)) })).filter((d) => Object.keys(d.values).length);
  return { days: out, same, differ };
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

/* ---------- one athlete's testing, edited in bulk (Athlete reports → Edit testing) ---------- */
/** A row per testing session the athlete has results in, oldest first. */
export function athleteRows(sessions, results, playerId) {
  const byId = Object.fromEntries(sessions.map((s) => [s.id, s]));
  return results.filter((r) => r.player_id === playerId && byId[r.session_id]).map((r) => { const s = byId[r.session_id];
    return { sid: s.id, date: s.tested_on, battery: s.battery, individual: !!s.individual, values: r.values || {} }; })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.battery === 'full') - (b.battery === 'full'));
}
const sameValues = (a, b) => { const ka = Object.keys(a || {}), kb = Object.keys(b || {}); return ka.length === kb.length && ka.every((k) => String(a[k]) === String((b || {})[k])); };
/** What saving the athlete editor writes. rows: [{sid (an existing row, or null for a new one),
 *  date: 'YYYY-MM-DD', values: {metric: value}}] with values already read (cellValue).
 *  - An existing row on its own date: its values replace the athlete's results in that session
 *    (no values left = the athlete's results there are removed; the session stays).
 *  - A row taken out, or moved to another date: removed from its session.
 *  - A new or moved row: goes into the session already on that date (the one this athlete is in
 *    first, then full team testing when it has tests outside weekly readiness, then any), merged
 *    with what the athlete already has there; with no session that day one is made: full team
 *    testing when it has a test outside weekly readiness, else weekly readiness. A readiness
 *    session that gets full-testing results becomes full team testing (as bulk import does).
 *  → { save: [{sid, values}], create: [{date, battery, values}], full: [sid], bad: [row index] } */
export function athleteSave(rows, sessions, results, playerId, sport) {
  const READY = new Set(batteryCols('readiness', sport));
  const isFull = (v) => Object.keys(v).some((k) => !READY.has(k));
  const cur = Object.fromEntries(results.filter((r) => r.player_id === playerId).map((r) => [r.session_id, r.values || {}]));
  const byId = Object.fromEntries(sessions.map((s) => [s.id, s]));
  const out = {}, create = {}, full = new Set(), bad = [];
  // rows still on their session's date keep it; every other session the athlete was in is cleared first
  rows.forEach((r) => { if (r.sid && byId[r.sid] && r.date === byId[r.sid].tested_on) out[r.sid] = { ...r.values }; });
  Object.keys(cur).forEach((sid) => { if (byId[sid] && !out[sid]) out[sid] = {}; });
  rows.forEach((r, i) => {
    if (r.sid && byId[r.sid] && r.date === byId[r.sid].tested_on) return;
    if (!Object.keys(r.values).length) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) { bad.push(i); return; }
    const day = sessions.filter((s) => s.tested_on === r.date);
    const s = day.find((x) => out[x.id] && Object.keys(out[x.id]).length) || (isFull(r.values) && day.find((x) => x.battery === 'full')) || day[0];
    if (s) { out[s.id] = { ...(out[s.id] || cur[s.id] || {}), ...r.values }; if (s.battery !== 'full' && isFull(out[s.id])) full.add(s.id); return; }
    const c = create[r.date] = create[r.date] || { date: r.date, values: {} };
    Object.assign(c.values, r.values);
  });
  return {
    save: Object.entries(out).filter(([sid, v]) => !sameValues(v, cur[sid] || {})).map(([sid, values]) => ({ sid, values })),
    create: Object.values(create).sort((a, b) => a.date.localeCompare(b.date)).map((c) => ({ ...c, battery: isFull(c.values) ? 'full' : 'readiness' })),
    full: [...full], bad,
  };
}
