// League season stats: reads a league's player stats page (copied and pasted, e.g. CSSHL /
// HockeyTech "Players" or "Goalies") into season totals per player, and matches the rows to
// the roster by name so the import can also update jersey numbers and positions. Pure
// functions; the Stats page saves the result (team setting 'league_stats').
import { parseTsv } from './imports.js';
import { nameKey } from './rosterImport.js';
import { derivedFor } from './stats.js';

const k = (h) => String(h || '').toLowerCase().replace(/#/g, 'no').replace(/[^a-z0-9+/-]/g, '');
// header → field. CSSHL's SOG / SOA are shootout goals / attempts, not shots, so they're left out.
const HEAD = {
  num: ['jerseyno', 'no', 'num', 'number', 'jersey'], name: ['name', 'player', 'playername'], position: ['pos', 'position'],
  gp: ['gp'], g: ['g', 'goals'], a: ['a', 'assists'], pim: ['pim'], pm: ['+/-', 'plusminus'],
  ga: ['ga'], sa: ['sa', 'shotsagainst', 'shots'], sv: ['sv', 'saves'],
};
const fieldOf = (h) => { const x = k(h); for (const [f, l] of Object.entries(HEAD)) if (l.includes(x)) return f; return null; };
export const STAT_KEYS = ['g', 'a', 'pim', 'pm', 'ga', 'sa'];
const POS = { f: 'F', fwd: 'F', forward: 'F', c: 'C', lw: 'LW', rw: 'RW', d: 'D', def: 'D', defence: 'D', defense: 'D', g: 'G', goalie: 'G', goaltender: 'G' };

/** Text of a stats page (tab-separated, as pasted) → [{num, name, position, gp, stats}] */
export function parseLeagueStats(text) {
  const rows = parseTsv(text).map((r) => r.map((c) => String(c || '').trim()));
  const out = new Map();
  let map = null;
  for (const r of rows) {
    const m = r.map(fieldOf);
    if (m.includes('name') && m.includes('gp')) { map = m; continue; } // a header row (each table has one)
    if (!map) continue;
    const v = {}; map.forEach((f, i) => { if (f && v[f] === undefined) v[f] = r[i]; });
    const name = (v.name || '').replace(/\s+/g, ' ').trim(), gp = Number(v.gp);
    if (!name || !/[a-zà-ÿ]/i.test(name) || !Number.isFinite(gp) || v.gp === '') { if (r.filter(Boolean).length < 3) map = null; continue; }
    const stats = {};
    for (const s of STAT_KEYS) { const x = Number(v[s]); if (v[s] !== undefined && v[s] !== '' && Number.isFinite(x)) stats[s] = x; }
    if (stats.sa === undefined && Number.isFinite(Number(v.sv)) && stats.ga !== undefined && v.sv !== '') stats.sa = Number(v.sv) + stats.ga;
    const num = String(v.num || '').replace(/^#/, ''), pos = POS[k(v.position)] || '';
    const key = nameKey(name), prev = out.get(key);
    // the same player in the skaters and goalies tables: keep both sets of numbers
    out.set(key, { num: /^\d{1,3}$/.test(num) ? num : prev ? prev.num : '', name, position: pos || (prev ? prev.position : ''), gp: Math.max(gp, prev ? prev.gp : 0), stats: { ...(prev ? prev.stats : {}), ...stats } });
  }
  return [...out.values()];
}

/** Matches league rows to the roster. updates: roster players whose number or position changes. */
export function planLeagueStats(players, rows) {
  const byName = new Map(players.map((p) => [nameKey(p.name), p]));
  const matched = [], missing = [], updates = [];
  // a near miss (a misread letter, a nickname): same last name, and the only such player
  const last = (n) => nameKey(String(n).trim().split(/\s+/).pop());
  const byLast = (r) => { const l = players.filter((p) => last(p.name) === last(r.name)); return l.length === 1 ? l[0] : null; };
  for (const r of rows) {
    const p = byName.get(nameKey(r.name)) || byLast(r);
    if (!p) { missing.push(r); continue; }
    matched.push({ player: p, row: r });
    const patch = {}; if (r.num && r.num !== p.num) patch.num = r.num; if (r.position && r.position !== p.position) patch.position = r.position;
    if (Object.keys(patch).length || p.active === false) updates.push({ ...p, ...patch, active: true, was: { num: p.num, position: p.position } });
  }
  return { matched, missing, updates };
}

/** Season rows for the leaderboard: league totals where saved, game-by-game sums for everyone else. */
export function mergeSeason(gameRows, league, players, sport) {
  if (!league || !league.rows || !league.rows.length) return gameRows;
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const from = league.rows.filter((r) => byId[r.player_id] && byId[r.player_id].active !== false)
    .map((r) => { const p = byId[r.player_id]; return { player_id: r.player_id, name: p.name, num: p.num, position: p.position, gp: r.gp, tot: { ...r.stats }, league: true, der: Object.fromEntries(derivedFor(sport).map(([k, , f]) => [k, f(r.stats)])) }; });
  const has = new Set(from.map((r) => r.player_id));
  return [...from, ...gameRows.filter((r) => !has.has(r.player_id))];
}
