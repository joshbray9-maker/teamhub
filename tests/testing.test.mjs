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

test('leaderboard: per-test ranks (ties, fly lowest wins) and overall standing', async () => {
  const { leaderboards } = await import('../src/lib/testing.js');
  const row = (p, metric, value) => ({ player_id: p, name: 'Player ' + p, num: '', metric, value: String(value), tested_on: '2026-11-01' });
  const rows = [row('a', 'cmj_jh', 45), row('b', 'cmj_jh', 40), row('c', 'cmj_jh', 40), row('a', 'fly10', 1.20), row('b', 'fly10', 1.05), row('c', 'fly10', 1.10),
    row('a', 'rsimod', 0.6), row('b', 'rsimod', 0.5), row('c', 'rsimod', 0.4), row('d', 'cmj_jh', 30)];
  const L = leaderboards(rows);
  assert.deepEqual(L.byMetric.cmj_jh.map((r) => [r.player_id, r.rank]), [['a', 1], ['b', 2], ['c', 2], ['d', 4]]);
  assert.deepEqual(L.byMetric.fly10.map((r) => r.player_id), ['b', 'c', 'a']);
  // a: cmj 100, fly 0, rsi 100 → 66.7; b: cmj 1/3*100=33.3, fly 100, rsi 50 → 61.1; d has 1 test → left out
  assert.deepEqual(L.overall.map((s) => [s.player_id, Math.round(s.score)]), [['a', 67], ['b', 61], ['c', 28]]);
  assert.equal(L.need, 3);
});

test('bulk import: a season sheet in the basketball heading order', async () => {
  const { rowsToTestDays, testDate, batteryCols, leaderboards } = await import('../src/lib/testing.js');
  const { parseTsv } = await import('../src/lib/imports.js');
  assert.equal(testDate('15/9/2026'), '2026-09-15'); assert.equal(testDate('9/15/26'), '2026-09-15'); assert.equal(testDate('soon'), '');
  const roster = [{ id: 'a', name: 'Athlete HV01', num: '4' }, { id: 'b', name: 'Athlete HV02', num: '7' }];
  const head = 'Athlete Name\tDate\tTeam\tPosition\tType of Training\tBodyweight\tCMJ\tRSImod\tAbal.\tSJ\tEUR\t5-0-5 Drill\t"Cassivi Shuttle\n(3pt,1/2,Fullx4)"\t20m Sprint';
  const rows = parseTsv([head,
    'Athlete HV01\t9/15/2026\tPrep\tG\tTesting\t78.2\t45.1\t0.52\t52.3\t41.0\t1.10\t2.41\t31.8\t3.12',
    'Athlete HV02\t\tPrep\tF\tTesting\t84,5\t40\t0.47\t47\t38.5\t1.04\t2.55\t33.2\t3.25',
    '#4\t10/1/2026\tPrep\tG\tReadiness\t\t46.0\t0.55\t\t\t\t\t\t',
    'Nobody Here\t10/1/2026\tPrep\tG\tReadiness\t\t30\t0.3\t\t\t\t\t\t'].join('\n'));
  const r = rowsToTestDays(rows, roster, 'basketball');
  assert.deepEqual(r.days.map((d) => [d.date, d.battery, Object.keys(d.values).length]), [['2026-09-15', 'full', 2], ['2026-10-01', 'readiness', 1]]);
  assert.deepEqual(r.days[0].values.a, { bw: 78.2, cmj_jh: 45.1, rsimod: 0.52, abalakov: 52.3, sj_jh: 41, eur: 1.1, t505: 2.41, cassivi: 31.8, sprint20: 3.12 });
  assert.equal(r.days[0].values.b.bw, 84.5); assert.deepEqual(r.unmatched, ['Nobody Here']);
  assert.deepEqual(batteryCols('full', 'basketball'), ['bw', 'cmj_jh', 'rsimod', 'abalakov', 'sj_jh', 'eur', 't505', 'cassivi', 'sprint20']);
  assert.deepEqual(batteryCols('full', 'hockey'), ['cmj_jh', 'rsimod', 'sj_jh', 'imtp_pf', 'rel_pf', 'fly10', 'cooper']);
  // timed drills rank fastest first; bodyweight and EUR are never ranked
  const L = leaderboards([{ player_id: 'a', name: 'A', metric: 't505', value: 2.41 }, { player_id: 'b', name: 'B', metric: 't505', value: 2.55 }, { player_id: 'a', name: 'A', metric: 'bw', value: 78 }, { player_id: 'b', name: 'B', metric: 'bw', value: 84 }]);
  assert.equal(L.byMetric.t505[0].player_id, 'a'); assert.equal(L.byMetric.bw, undefined);
});

test('bulk import: full team testing headings (bodyweight in pounds, "Cassici shuffle")', async () => {
  const { rowsToTestDays } = await import('../src/lib/testing.js');
  const roster = [{ id: 'a', name: 'Athlete HV01', num: '4' }];
  const r = rowsToTestDays([['Name', 'Date', 'team', 'Bodyweight (pounds)', 'CMJ', 'RSImod', 'Abalakov jump', 'SJ', 'EUR', '5-0-5 drill', 'Cassici shuffle', '20m sprint'],
    ['Athlete HV01', '2026-09-15', 'Prep', '172.4', '45.1', '0.52', '52.3', '41', '1.1', '2.41', '31.8', '3.12']], roster, 'basketball');
  assert.deepEqual(r.days[0].values.a, { bw: 172.4, cmj_jh: 45.1, rsimod: 0.52, abalakov: 52.3, sj_jh: 41, eur: 1.1, t505: 2.41, cassivi: 31.8, sprint20: 3.12 });
  assert.equal(r.days[0].battery, 'full');
  // a sheet that gives bodyweight in kg is converted to pounds
  const k = rowsToTestDays([['Name', 'Date', 'Bodyweight (kg)', 'CMJ'], ['Athlete HV01', '2026-09-15', '80', '40']], roster, 'basketball');
  assert.equal(k.days[0].values.a.bw, 176.4);
});

test('basketball lists tests and the season sheet in the coach\'s order', async () => {
  const { metricOrder, seasonSheet, rowsToTestDays } = await import('../src/lib/testing.js');
  assert.deepEqual(metricOrder('basketball').slice(0, 9), ['bw', 'cmj_jh', 'rsimod', 'abalakov', 'sj_jh', 'eur', 't505', 'cassivi', 'sprint20']);
  const head = seasonSheet('basketball');
  assert.deepEqual(head, ['Name', 'Date', 'Team', 'Position', 'Type of Training', 'Bodyweight (pounds)', 'CMJ', 'RSImod', 'Abalakov jump', 'SJ', 'EUR', '5-0-5 drill', 'Cassivi shuttle', '20m sprint']);
  // data rows pasted under the pre-filled headings land in the right tests
  const r = rowsToTestDays([head, ['Athlete HV01', '9/15/2026', 'Prep', 'G', 'Testing', '172', '45', '0.5', '52', '41', '1.1', '2.4', '31.8', '3.1']], [{ id: 'a', name: 'Athlete HV01' }], 'basketball');
  assert.deepEqual(r.days[0].values.a, { bw: 172, cmj_jh: 45, rsimod: 0.5, abalakov: 52, sj_jh: 41, eur: 1.1, t505: 2.4, cassivi: 31.8, sprint20: 3.1 });
});

test('bulk import warns when the pasted columns are shifted off the headings', async () => {
  const { rowsToTestDays, seasonSheet } = await import('../src/lib/testing.js');
  const roster = [{ id: 'a', name: 'Athlete HV01' }];
  const head = seasonSheet('basketball');
  assert.equal(head.length, 14); assert.deepEqual(head.slice(3, 6), ['Position', 'Type of Training', 'Bodyweight (pounds)']);
  // a 14-column sheet pasted under 12 headings (the old grid): words land under Bodyweight and CMJ
  const old = ['Name', 'Date', 'Team', 'Bodyweight (pounds)', 'CMJ', 'RSImod', 'Abalakov jump', 'SJ', 'EUR', '5-0-5 drill', 'Cassivi shuttle', '20m sprint'];
  const r = rowsToTestDays([old, ['Athlete HV01', '9/15/2026', 'Prep', 'G', 'Testing', '172.4', '45.1', '0.52', '52.3', '41', '1.1', '2.41', '31.8', '3.12']], roster, 'basketball');
  assert.deepEqual(r.textCols.map((c) => [c.heading, c.examples]), [['Bodyweight (pounds)', ['G']], ['CMJ', ['Testing']]]);
  // the same row under the right headings: no warning, every test in place
  const ok = rowsToTestDays([head, ['Athlete HV01', '9/15/2026', 'Prep', 'G', 'Testing', '172.4', '45.1', '0.52', '52.3', '41', '1.1', '2.41', '31.8', '3.12']], roster, 'basketball');
  assert.deepEqual(ok.textCols, []);
  assert.deepEqual(ok.days[0].values.a, { bw: 172.4, cmj_jh: 45.1, rsimod: 0.52, abalakov: 52.3, sj_jh: 41, eur: 1.1, t505: 2.41, cassivi: 31.8, sprint20: 3.12 });
});
