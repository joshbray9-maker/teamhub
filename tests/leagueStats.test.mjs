// League stats paste: CSSHL / HockeyTech player table → season totals and roster changes.
// Synthetic names only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLeagueStats, planLeagueStats, mergeSeason } from '../src/lib/leagueStats.js';

const page = ['Scores', 'Thu, Nov 5',
  '\tJersey #\tFLAGS\tName\tPos\tTeam\tGP\tG\tA\tPTS\tPt/G\tPPG\tPPA\tSHG\tSHA\tGWG\tSOG\tSOA\tSOGW\tSO%\tPIM\tPIMPG',
  '1\t23\t\tAthlete HV01\tF\tBCS\t5\t2\t5\t7\t1.40\t0\t0\t0\t0\t0\t3\t4\t0\t0.0\t8\t1.60',
  '2\t5\t\tAthlete HV02\tD\tBCS\t5\t1\t2\t3\t0.60\t0\t1\t0\t0\t0\t1\t1\t1\t100.0\t0\t0.00',
  '3\t41\t\tAthlete HV03\tG\tBCS\t1\t0\t0\t0\t0.00\t0\t0\t0\t0\t0\t0\t0\t0\t0.0\t0\t0.00', 'Legend'].join('\n');

test('reads the CSSHL player table, ignoring shootout columns', () => {
  const rows = parseLeagueStats(page);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { num: '23', name: 'Athlete HV01', position: 'F', gp: 5, stats: { g: 2, a: 5, pim: 8 } });
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
