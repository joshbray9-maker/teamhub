// League stats paste: CSSHL / HockeyTech player table → season totals and roster changes.
// Synthetic names only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLeagueStats, planLeagueStats, mergeSeason, pasteBlock, toGrid, fromGrid, blankRow, LEAGUE_COLS } from '../src/lib/leagueStats.js';

const page = ['Scores', 'Thu, Nov 5',
  '\tJersey #\tFLAGS\tName\tPos\tTeam\tGP\tG\tA\tPTS\tPt/G\tPPG\tPPA\tSHG\tSHA\tGWG\tSOG\tSOA\tSOGW\tSO%\tPIM\tPIMPG',
  '1\t23\t\tAthlete HV01\tF\tBCS\t5\t2\t5\t7\t1.40\t0\t0\t0\t0\t0\t3\t4\t0\t0.0\t8\t1.60',
  '2\t5\t\tAthlete HV02\tD\tBCS\t5\t1\t2\t3\t0.60\t0\t1\t0\t0\t0\t1\t1\t1\t100.0\t0\t0.00',
  '3\t41\t\tAthlete HV03\tG\tBCS\t1\t0\t0\t0\t0.00\t0\t0\t0\t0\t0\t0\t0\t0\t0.0\t0\t0.00', 'Legend'].join('\n');

test('reads the CSSHL player table; SOG / SOA are shootout columns', () => {
  const rows = parseLeagueStats(page);
  assert.equal(rows.length, 3);
  const { stats, ...rest } = rows[0];
  assert.deepEqual(rest, { num: '23', name: 'Athlete HV01', position: 'F', gp: 5 });
  assert.deepEqual({ g: stats.g, a: stats.a, pts: stats.pts, ptg: stats.ptg, so_g: stats.so_g, so_a: stats.so_a, pim: stats.pim, pimpg: stats.pimpg }, { g: 2, a: 5, pts: 7, ptg: 1.4, so_g: 3, so_a: 4, pim: 8, pimpg: 1.6 });
  assert.equal(stats.sog, undefined); // shootout goals never land in shots on goal
  assert.equal(rows[2].position, 'G');
});

test('matches the roster by name and lists number / position changes', () => {
  const plan = planLeagueStats([{ id: 'p1', name: 'athlete hv01', num: '9', position: 'C' }, { id: 'p2', name: 'Athlete HV02', num: '5', position: 'D' }], parseLeagueStats(page));
  assert.equal(plan.matched.length, 2);
  assert.deepEqual(plan.missing.map((r) => r.name), ['Athlete HV03']);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].num, '23'); assert.equal(plan.updates[0].position, 'F');
});

test('league totals win over game sums for the same player', () => {
  const players = [{ id: 'p1', name: 'A', num: '1' }, { id: 'p2', name: 'B', num: '2' }];
  const out = mergeSeason([{ player_id: 'p1', gp: 9, tot: { g: 9 } }, { player_id: 'p2', gp: 1, tot: { g: 1 } }], { rows: [{ player_id: 'p1', gp: 5, stats: { g: 2, a: 5 } }] }, players, 'hockey');
  const p1 = out.find((r) => r.player_id === 'p1');
  assert.equal(p1.gp, 5); assert.equal(p1.der.pts, 7);
  assert.equal(out.find((r) => r.player_id === 'p2').gp, 1);
});

test('table paste: a CSSHL row copied with its line number fills from Jersey #', () => {
  const row = ['7', '23', '', 'Athlete HV09', 'F', 'BCS', '5', '2', '5', '7', '1.40', '0', '0', '0', '0', '0', '0', '0', '0', '0.0', '8', '1.60', '12.5'];
  assert.equal(row.length, LEAGUE_COLS.length + 1);
  const g = pasteBlock([blankRow()], [row], 0, 0);
  assert.equal(g[0].num, '23'); assert.equal(g[0].name, 'Athlete HV09'); assert.equal(g[0].sh_pct, '12.5');
  const [r] = fromGrid(g);
  assert.equal(r.gp, 5); assert.equal(r.stats.pts, 7); assert.equal(r.stats.sh_pct, 12.5);
});

test('table paste: with a heading row, columns are matched by name and rows by player', () => {
  const start = toGrid([{ num: '9', name: 'Athlete HV01', position: 'C', gp: 1, stats: { g: 0 } }]);
  const g = pasteBlock(start, [['Name', 'GP', 'G', 'A'], ['Athlete HV01', '5', '2', '5'], ['Athlete HV02', '4', '1', '0']], 0, 3);
  assert.equal(g.length, 2);
  assert.equal(g[0].num, '9'); assert.equal(g[0].gp, '5'); assert.equal(g[0].a, '5');
  assert.equal(g[1].name, 'Athlete HV02');
});

test('table paste: a block without headings fills from the clicked cell', () => {
  const g = pasteBlock([blankRow(), blankRow()], [['5', '2'], ['4', '1']], 1, LEAGUE_COLS.findIndex(([c]) => c === 'gp'));
  assert.equal(g[1].gp, '5'); assert.equal(g[1].g, '2'); assert.equal(g[2].gp, '4');
});

test('each roster player is matched once (repeated rows, shared last names)', () => {
  const players = [{ id: 'p1', name: 'Athlete Bo Smith', num: '4', position: 'D' }];
  const rows = [{ name: 'Athlete Al Smith', num: '7', position: 'F', gp: 5, stats: {} }, { name: 'Athlete Bo Smith', num: '4', position: 'D', gp: 5, stats: {} },
    { name: 'Athlete Bo Smith', num: '4', position: 'D', gp: 5, stats: {} }];
  const plan = planLeagueStats(players, rows);
  assert.deepEqual(plan.matched.map((m) => m.row.name), ['Athlete Bo Smith']);
  assert.deepEqual(plan.missing.map((r) => r.name), ['Athlete Al Smith']);
  assert.equal(plan.repeated, 1);
  assert.equal(new Set(plan.updates.map((u) => u.id)).size, plan.updates.length);
});

test('CSSHL rows as they really copy: line number, doubled headings, two Name cells', () => {
  const head = ['', 'Jersey # Jersey #', 'FLAGS FLAGS', 'Name Name', 'Name Name', 'Pos Pos', 'Team Team', 'GP GP', 'G G', 'A A', 'PTS PTS', 'Pt/G Pt/G', 'PPG PPG', 'PPA PPA', 'SHG SHG', 'SHA SHA', 'GWG GWG', 'SOG SOG', 'SOA SOA', 'SOGW SOGW', 'SO% SO%', 'PIM PIM', 'PIMPG PIMPG', 'SH% SH%'];
  const row = ['1', '23', '', 'Athlete HV01', 'A. HV01', 'F', 'BCS', '5', '2', '5', '7', '1.40', '0', '0', '0', '0', '0', '0', '0', '0', '0.0', '8', '1.60', '10.0'];
  // without the heading row, pasted at Jersey #
  const g1 = pasteBlock([blankRow()], [row], 0, 0);
  assert.deepEqual([g1[0].num, g1[0].name, g1[0].position, g1[0].team, g1[0].gp, g1[0].g, g1[0].pim, g1[0].sh_pct], ['23', 'Athlete HV01', 'F', 'BCS', '5', '2', '8', '10.0']);
  // with it
  const g2 = pasteBlock([blankRow()], [head, row], 0, 0);
  assert.deepEqual([g2[0].num, g2[0].name, g2[0].position, g2[0].gp, g2[0].a, g2[0].pim], ['23', 'Athlete HV01', 'F', '5', '5', '8']);
  // the whole page pasted in the box
  const rows = parseLeagueStats([head.join('\t'), row.join('\t')].join('\n'));
  assert.equal(rows[0].name, 'Athlete HV01'); assert.equal(rows[0].num, '23'); assert.equal(rows[0].position, 'F');
});

test('a one-letter or code "name" is never saved', () => {
  const g = pasteBlock([blankRow()], [['23', '', 'F', 'BCS', '5', '2', '5']], 0, 0);
  assert.equal(fromGrid(g).length, 0);
});

test('headings doubled without a space (copied as HTML) are read too', () => {
  const head = ['', 'Jersey #Jersey #', 'FLAGSFLAGS', 'NameName', 'NameName', 'PosPos', 'TeamTeam', 'GPGP', 'GG', 'AA'];
  const g = pasteBlock([blankRow()], [head, ['1', '23', '', 'Athlete HV01', 'A. HV01', 'F', 'BCS', '5', '2', '5']], 0, 0);
  assert.equal(g.filter((x) => x.name).length, 1);
  assert.deepEqual([g[0].num, g[0].name, g[0].gp, g[0].a], ['23', 'Athlete HV01', '5', '5']);
});

test('"+" after a name is ignored; a last-name-only roster entry is matched and gets the full name', () => {
  const players = [{ id: 'p1', name: 'Hannon', num: '', position: 'Forward' }, { id: 'p2', name: 'Pelt', num: '21', position: 'F' }, { id: 'p3', name: 'Jake Ulm', num: '8', position: 'D' }];
  const g = pasteBlock([blankRow()], [['1', '23', '', 'Zed Hannon +', 'Z. Hannon +', 'F', 'BCS', '5', '2'], ['2', '21', '', 'Ray Pelt', 'R. Pelt', 'F', 'BCS', '4', '1'], ['3', '9', '', 'John Ulm +', 'J. Ulm', 'D', 'BCS', '3', '0']], 0, 0);
  assert.equal(g[0].name, 'Zed Hannon');
  const plan = planLeagueStats(players, fromGrid(g));
  const u1 = plan.updates.find((u) => u.id === 'p1');
  assert.deepEqual([u1.name, u1.num, u1.position], ['Zed Hannon', '23', 'F']);
  assert.equal(plan.updates.find((u) => u.id === 'p2').name, 'Ray Pelt');
  // a different first name is a different player
  assert.deepEqual(plan.missing.map((r) => r.name), ['John Ulm']);
});
