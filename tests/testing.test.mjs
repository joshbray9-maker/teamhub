// Gym-group formula, trends and test imports, on made-up numbers and targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gymGroup, ratio, metricSeries, changeSeries, metricField, rowsToTests } from '../src/lib/testing.js';
import { parseTsv } from '../src/lib/imports.js';

const T = { cmj_jh: 40, sj_jh: 36, rsimod: 0.5, imtp_pf: 3000, rel_pf: 40 };

test('gym groups follow force, then expression and RSImod, against the targets', () => {
  assert.equal(gymGroup({ cmj_jh: 44, sj_jh: 40, rsimod: 0.55, imtp_pf: 3300, rel_pf: 42 }, T).group, 'efficient');
  const slow = gymGroup({ cmj_jh: 42, sj_jh: 38, rsimod: 0.42, imtp_pf: 3200, rel_pf: 41 }, T);
  assert.equal(slow.group, 'expression'); assert.match(slow.reason, /RSImod below/);
  assert.equal(gymGroup({ cmj_jh: 35, sj_jh: 33, rsimod: 0.45, imtp_pf: 3100, rel_pf: 40 }, T).group, 'expression');
  assert.equal(gymGroup({ cmj_jh: 45, rsimod: 0.6, imtp_pf: 2500, rel_pf: 33 }, T).group, 'force');
  assert.equal(gymGroup({ cmj_jh: 30, rsimod: 0.3, imtp_pf: 2400 }, T).group, 'force');
  // no targets / missing results: not placed; a coach's move wins and says so
  assert.equal(gymGroup({ cmj_jh: 44, imtp_pf: 3300 }, {}).group, null);
  assert.equal(gymGroup({ cmj_jh: 44 }, T).group, null);
  const moved = gymGroup({ cmj_jh: 30, rsimod: 0.3, imtp_pf: 2400 }, T, 'efficient');
  assert.equal(moved.group, 'efficient'); assert.equal(moved.auto, 'force'); assert.match(moved.reason, /Moved by a coach/);
  // the 10 m fly: lower is better
  assert.ok(ratio('fly10', 1.0, 1.1) > 1); assert.ok(ratio('fly10', 1.2, 1.1) < 1);
});

test('team medians and % change per metric, the 10 m fly inverted', () => {
  const sessions = [{ id: 'b', tested_on: '2026-11-08', battery: 'readiness' }, { id: 'a', tested_on: '2026-11-01', battery: 'full' }];
  const results = [
    { session_id: 'a', values: { cmj_jh: 40, fly10: 1.20 } }, { session_id: 'a', values: { cmj_jh: 44, fly10: 1.10 } }, { session_id: 'a', values: { cmj_jh: 36, imtp_pf: 3000 } },
    { session_id: 'b', values: { cmj_jh: 42, fly10: 1.00 } }, { session_id: 'b', values: { cmj_jh: 44, fly10: 1.10 } },
  ];
  const s = metricSeries(sessions, results);
  assert.deepEqual(s.cmj_jh.map((p) => [p.date, p.median, p.n]), [['2026-11-01', 40, 3], ['2026-11-08', 43, 2]]);
  assert.equal(s.imtp_pf.length, 1);
  const c = changeSeries(s);
  assert.equal(c.cmj_jh[1].change.toFixed(3), '0.075');
  assert.ok(c.fly10[1].change > 0); // faster = improvement
});

test('test sheets: headings with units, names or numbers, pasted cells', () => {
  ['CMJ JH (cm)', 'RSImod', 'SJ jump height', 'IMTP Peak force (N)', 'Relative power (BW/KG)', 'Rel PF N/kg', '10m fly (s)', 'Cooper test (m)']
    .forEach((h, i) => assert.equal(metricField(h), ['cmj_jh', 'rsimod', 'sj_jh', 'imtp_pf', 'rel_pf', 'rel_pf', 'fly10', 'cooper'][i], h));
  const roster = [{ id: 'a', num: '9', name: 'Test One' }, { id: 'b', num: '4', name: 'Test Two' }];
  const r = rowsToTests(parseTsv('Name\t#\tCMJ JH (cm)\tRSImod\t10m fly\nTest One\t\t41,5\t0.52\t1.10\n\t4\t38\t\t\nNobody\t\t30\t\t\nTest Two\t\t\t\t'), roster);
  assert.deepEqual(r.values, { a: { cmj_jh: 41.5, rsimod: 0.52, fly10: 1.1 }, b: { cmj_jh: 38 } });
  assert.deepEqual(r.unmatched, ['Nobody']);
  assert.throws(() => rowsToTests([['Name', 'Height'], ['x', '1']], roster), /No test columns/);
});
