// League season stats: a league's player stats table (CSSHL / HockeyTech "Players"), pasted as a
// page, a screenshot or straight into the import table, becomes season totals per player. Rows
// are matched to the roster by name so the import can also update jersey numbers and positions.
// Pure functions; the Stats page saves the result (team setting 'league_stats').
import { parseTsv } from './imports.js';
import { nameKey } from './rosterImport.js';
import { derivedFor } from './stats.js';

/** The import table's columns, in CSSHL's order. text: kept as typed; the rest are numbers.
 *  CSSHL's SOG / SOA / SOGW / SO% are shootouts (goals, attempts, game-winners, %), not shots. */
export const LEAGUE_COLS = [
  ['num', 'Jersey #', 'Jersey number', 'text'], ['flags', 'FLAGS', 'Flags', 'text'], ['name', 'Name', 'Name', 'text'], ['position', 'Pos', 'Position', 'text'], ['team', 'Team', 'Team', 'text'],
  ['gp', 'GP', 'Games played'], ['g', 'G', 'Goals'], ['a', 'A', 'Assists'], ['pts', 'PTS', 'Points'], ['ptg', 'Pt/G', 'Points per game'],
  ['ppg', 'PPG', 'Power-play goals'], ['ppa', 'PPA', 'Power-play assists'], ['shg', 'SHG', 'Short-handed goals'], ['sha', 'SHA', 'Short-handed assists'],
  ['gwg', 'GWG', 'Game-winning goals'], ['so_g', 'SOG', 'Shootout goals'], ['so_a', 'SOA', 'Shootout attempts'], ['so_gw', 'SOGW', 'Shootout game-winners'],
  ['so_pct', 'SO%', 'Shootout %'], ['pim', 'PIM', 'Penalty minutes'], ['pimpg', 'PIMPG', 'Penalty minutes per game'], ['sh_pct', 'SH%', 'Shooting %'],
];
const TEXT = new Set(LEAGUE_COLS.filter((c) => c[3]).map((c) => c[0]));
const NUM_COLS = LEAGUE_COLS.filter((c) => !c[3]).map((c) => c[0]).filter((x) => x !== 'gp');
/** Every number kept per player: the table's columns plus goalie numbers from a goalies table. */
export const STAT_KEYS = [...NUM_COLS, 'pm', 'ga', 'sa'];

const k = (h) => String(h || '').toLowerCase().replace(/#/g, 'no').replace(/[^a-z0-9+/-]/g, '');
// header → field (k() drops "%": SO% → "so", SH% → "sh")
const HEAD = {
  num: ['jerseyno', 'no', 'num', 'number', 'jersey'], flags: ['flags'], name: ['name', 'player', 'playername'], position: ['pos', 'position'], team: ['team'],
  gp: ['gp'], g: ['g', 'goals'], a: ['a', 'assists'], pts: ['pts', 'points'], ptg: ['pt/g', 'ptg', 'p/gp'], ppg: ['ppg'], ppa: ['ppa'], shg: ['shg'], sha: ['sha'],
  gwg: ['gwg'], so_g: ['sog'], so_a: ['soa'], so_gw: ['sogw'], so_pct: ['so'], pim: ['pim'], pimpg: ['pimpg'], sh_pct: ['sh'],
  pm: ['+/-', 'plusminus'], ga: ['ga'], sa: ['sa', 'shotsagainst', 'shots'], sv: ['sv', 'saves'],
};
export const fieldOf = (h) => { const x = k(h); for (const [f, l] of Object.entries(HEAD)) if (l.includes(x)) return f; return null; };
const POS = { f: 'F', fwd: 'F', forward: 'F', c: 'C', lw: 'LW', rw: 'RW', d: 'D', def: 'D', defence: 'D', defense: 'D', g: 'G', goalie: 'G', goaltender: 'G' };
const numOf = (v) => { const s = String(v ?? '').trim().replace(/%$/, ''); const x = Number(s); return s !== '' && Number.isFinite(x) ? x : undefined; };

/** One row's cells by field → {num, name, position, gp, stats} or null without a name and GP. */
function rowOf(v) {
  const name = String(v.name || '').replace(/\s+/g, ' ').trim(), gp = numOf(v.gp);
  if (!name || !/[a-zà-ÿ]/i.test(name) || gp === undefined) return null;
  const stats = {};
  for (const s of STAT_KEYS) { const x = numOf(v[s]); if (x !== undefined) stats[s] = x; }
  if (stats.sa === undefined && numOf(v.sv) !== undefined && stats.ga !== undefined) stats.sa = numOf(v.sv) + stats.ga;
  // per-game and shootout % from the totals when the table didn't give them
  const r2 = (x) => Math.round(x * 100) / 100;
  if (stats.ptg === undefined && gp > 0 && stats.pts !== undefined) stats.ptg = r2(stats.pts / gp);
  if (stats.pimpg === undefined && gp > 0 && stats.pim !== undefined) stats.pimpg = r2(stats.pim / gp);
  if (stats.so_pct === undefined && stats.so_a > 0 && stats.so_g !== undefined) stats.so_pct = Math.round((stats.so_g / stats.so_a) * 1000) / 10;
  const num = String(v.num || '').trim().replace(/^#/, '');
  return { num: /^\d{1,3}$/.test(num) ? num : '', name, position: POS[k(v.position)] || String(v.position || '').trim().slice(0, 4), gp, stats };
}

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
    const row = rowOf(v);
    if (!row) { if (r.filter(Boolean).length < 3) map = null; continue; }
    const key = nameKey(row.name), prev = out.get(key);
    // the same player in the skaters and goalies tables: keep both sets of numbers
    out.set(key, prev ? { ...row, num: row.num || prev.num, position: row.position || prev.position, gp: Math.max(row.gp, prev.gp), stats: { ...prev.stats, ...row.stats } } : row);
  }
  return [...out.values()];
}

/* ---------- the import table ---------- */
let seq = 0;
const blankCells = () => Object.fromEntries(LEAGUE_COLS.map(([c]) => [c, '']));
export const blankRow = () => ({ key: 'r' + ++seq, ...blankCells(), extra: {} });
/** Parsed rows → table rows (strings), keeping numbers that have no column (goalie GA / SA). */
export function toGrid(rows) {
  return rows.map((r) => {
    const row = { ...blankRow(), num: r.num || '', name: r.name, position: r.position || '', gp: String(r.gp ?? ''), check: r.check || undefined };
    for (const [s, v] of Object.entries(r.stats || {})) { if (s in row) row[s] = String(v); else row.extra[s] = v; }
    return row;
  });
}
/** Table rows → [{num, name, position, gp, stats, check}] (rows without a name and GP are left out). */
export function fromGrid(grid) {
  return grid.map((g) => { const r = rowOf(g); if (!r) return null; return { ...r, stats: { ...g.extra, ...r.stats }, ...(g.check ? { check: true } : {}) }; }).filter(Boolean);
}
/** Is a table cell's value wrong for its column? (numbers only; blank is fine) */
export const badCell = (c, v) => !TEXT.has(c) && String(v || '').trim() !== '' && numOf(v) === undefined;

/** Pastes a block of cells into the table at row r, column c (an index into LEAGUE_COLS). A block
 *  with its heading row is matched by column name (rows go to the player of the same name, or to
 *  new rows); without one it fills from the clicked cell. A leading line-number column, as in a
 *  row copied from the CSSHL table, is dropped. */
export function pasteBlock(grid, block, r, c) {
  block = block.map((b) => b.map((x) => String(x ?? '').trim())).filter((b) => b.some(Boolean));
  if (!block.length) return grid;
  const n = grid.map((g) => ({ ...g, extra: { ...g.extra } }));
  const hi = block.findIndex((b) => { const m = b.map(fieldOf); return m.includes('name') && m.includes('gp'); });
  if (hi >= 0) {
    const map = block[hi].map(fieldOf);
    for (const b of block.slice(hi + 1)) {
      const v = {}; map.forEach((f, i) => { if (f && v[f] === undefined) v[f] = b[i]; });
      if (!String(v.name || '').trim()) continue;
      let row = n.find((x) => nameKey(x.name) === nameKey(v.name)) || n.find((x) => !LEAGUE_COLS.some(([col]) => String(x[col]).trim()));
      if (!row) { row = blankRow(); n.push(row); }
      for (const [f, val] of Object.entries(v)) { if (f in row) row[f] = val; else if (numOf(val) !== undefined) row.extra[f] = numOf(val); }
    }
    return n;
  }
  const width = LEAGUE_COLS.length - c;
  block.forEach((b, i) => {
    if (c === 0 && b.length === width + 1 && /^\d{1,3}$/.test(b[0])) b = b.slice(1);
    while (n.length <= r + i) n.push(blankRow());
    const row = n[r + i];
    b.forEach((val, j) => { const col = LEAGUE_COLS[c + j]; if (col) row[col[0]] = val; });
  });
  return n;
}

/** Matches league rows to the roster. updates: roster players whose number or position changes.
 *  Each roster player is matched once: exact names first, then a near miss (a misread letter, a
 *  nickname: same last name, and the only such player still unmatched). A name that appears
 *  twice in the table counts once (the first row). */
export function planLeagueStats(players, rows) {
  const byName = new Map(players.map((p) => [nameKey(p.name), p]));
  const last = (n) => nameKey(String(n).trim().split(/\s+/).pop());
  const seen = new Set(), list = rows.filter((r) => { const k2 = nameKey(r.name); if (seen.has(k2)) return false; seen.add(k2); return true; });
  const used = new Set(), pick = new Map();
  for (const r of list) { const p = byName.get(nameKey(r.name)); if (p && !used.has(p.id)) { used.add(p.id); pick.set(r, p); } }
  for (const r of list) {
    if (pick.has(r)) continue;
    const l = players.filter((p) => !used.has(p.id) && last(p.name) === last(r.name));
    if (l.length === 1 && list.filter((x) => !pick.has(x) && last(x.name) === last(r.name)).length === 1) { used.add(l[0].id); pick.set(r, l[0]); }
  }
  const matched = [], missing = [], updates = [];
  for (const r of list) {
    const p = pick.get(r);
    if (!p) { missing.push(r); continue; }
    matched.push({ player: p, row: r });
    const patch = {}; if (r.num && r.num !== p.num) patch.num = r.num; if (r.position && r.position !== p.position) patch.position = r.position;
    if (Object.keys(patch).length || p.active === false) updates.push({ ...p, ...patch, active: true, was: { num: p.num, position: p.position } });
  }
  return { matched, missing, updates, repeated: rows.length - list.length };
}

/** Decimal places the league shows for its per-game and % columns. */
export const DECIMALS = { ptg: 2, pimpg: 2, so_pct: 1, sh_pct: 1 };
/** Leaderboard columns when league totals are saved: the table's number columns after GP. */
export const LEADER_COLS = LEAGUE_COLS.filter((c) => !c[3] && c[0] !== 'gp').map(([c, l, long]) => [c, l, long]);

/** Season rows for the leaderboard: league totals where saved, game-by-game sums for everyone else. */
export function mergeSeason(gameRows, league, players, sport) {
  if (!league || !league.rows || !league.rows.length) return gameRows;
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const from = league.rows.filter((r) => byId[r.player_id] && byId[r.player_id].active !== false)
    .map((r) => { const p = byId[r.player_id]; return { player_id: r.player_id, name: p.name, num: p.num, position: p.position, gp: r.gp, tot: { ...r.stats }, league: true, der: Object.fromEntries(derivedFor(sport).filter(([dk]) => r.stats[dk] === undefined).map(([dk, , f]) => [dk, f(r.stats)])) }; });
  const has = new Set(from.map((r) => r.player_id));
  return [...from, ...gameRows.filter((r) => !has.has(r.player_id))];
}
