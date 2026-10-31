// Game stats per sport: which columns are entered per game, which are worked out, and season
// totals per player. Pure functions. Edit the columns here.
export const STAT_COLS = {
  hockey: [['g', 'G', 'Goals'], ['a', 'A', 'Assists'], ['pim', 'PIM', 'Penalty minutes'], ['pm', '+/-', 'Plus / minus'], ['sog', 'SOG', 'Shots on goal'],
    ['sa', 'SA', 'Shots against (goalies)'], ['ga', 'GA', 'Goals against (goalies)']],
  basketball: [['pts', 'PTS', 'Points'], ['reb', 'REB', 'Rebounds'], ['ast', 'AST', 'Assists'], ['stl', 'STL', 'Steals'], ['blk', 'BLK', 'Blocks'], ['tpm', '3PM', 'Three-pointers made'], ['to', 'TO', 'Turnovers']],
  rugby: [['t', 'T', 'Tries'], ['c', 'C', 'Conversions'], ['pg', 'PG', 'Penalty goals'], ['dg', 'DG', 'Drop goals'], ['yc', 'YC', 'Yellow cards'], ['rc', 'RC', 'Red cards']],
  default: [['g', 'G', 'Goals'], ['a', 'A', 'Assists']],
};
export const colsFor = (sport) => STAT_COLS[sport] || STAT_COLS.default;
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
/** Columns worked out from the season totals (shown after the entered ones). */
export const DERIVED = {
  hockey: [['pts', 'PTS', (s) => n(s.g) + n(s.a)], ['svp', 'SV%', (s) => (n(s.sa) ? ((n(s.sa) - n(s.ga)) / n(s.sa)).toFixed(3).replace(/^0/, '') : '')]],
  rugby: [['pts', 'PTS', (s) => 5 * n(s.t) + 2 * n(s.c) + 3 * n(s.pg) + 3 * n(s.dg)]],
  default: [['pts', 'PTS', (s) => n(s.g) + n(s.a)]],
};
export const derivedFor = (sport) => (sport === 'basketball' ? [] : DERIVED[sport] || DERIVED.default);
/** The column a leaderboard sorts by first. */
export const leadCol = (sport) => (sport === 'basketball' ? 'pts' : 'pts');

/** rows: [{player_id, name, num, position, game_id, stats}] → per player: games played, totals, derived. */
export function seasonTotals(rows, sport) {
  const cols = colsFor(sport).map(([k]) => k), by = {};
  for (const r of rows) {
    const p = (by[r.player_id] = by[r.player_id] || { player_id: r.player_id, name: r.name, num: r.num, position: r.position, gp: 0, tot: {} });
    if (Object.values(r.stats || {}).some((v) => v !== null && v !== '')) p.gp++;
    for (const k of cols) if (r.stats && r.stats[k] !== undefined && r.stats[k] !== '') p.tot[k] = n(p.tot[k]) + n(r.stats[k]);
  }
  const der = derivedFor(sport);
  return Object.values(by).map((p) => ({ ...p, der: Object.fromEntries(der.map(([k, , f]) => [k, f(p.tot)])) }));
}
/** Value of column k for a player (entered total or derived). */
export const statOf = (p, k) => (p.der && p.der[k] !== undefined ? p.der[k] : p.tot[k]);
