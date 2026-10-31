// S&C plan, game-day lines and Data Center imports, on made-up data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/lib/rosterImport.js';
import { rowsToSc, rowsToSlots, tidyTable, LINES_TEMPLATE } from '../src/lib/imports.js';

test('S&C: dates, intensities (words, letters, colours), notes and week labels', () => {
  const r = rowsToSc(parseCsv('Date,Session,Intensity,Notes,Phase,Week\n2026-11-02,Lift 1,H,,GPP,Wk 1\n11/03/2026,Skate,light,Easy,,\n2026-11-04,Recovery,Off,,,\n2026-11-05,Game,yellow,,,\nnot a date,Lift,M,,,\n2026-11-06,Speed,purple,,,'));
  assert.deepEqual(r.days['2026-11-02'], { theme: 'Lift 1', intensity: 'heavy' });
  assert.deepEqual(r.days['2026-11-03'], { theme: 'Skate', intensity: 'light', note: 'Easy' });
  assert.equal(r.days['2026-11-04'].intensity, 'off'); assert.equal(r.days['2026-11-05'].intensity, 'game');
  assert.equal(r.days['2026-11-06'].intensity, ''); assert.deepEqual(r.unknown, ['purple']);
  assert.deepEqual(r.weeks, { '2026-11-02': { phase: 'GPP', week: 'Wk 1' } });
  assert.equal(r.skipped, 1);
  assert.throws(() => rowsToSc([['Session'], ['x']]), /No Date column/);
});

const roster = [{ id: 'a', num: '9', name: 'Test One' }, { id: 'b', num: '4', name: 'Test Two' }, { id: 'c', num: '30', name: 'Test Goalie' }];

test('lines, one row per spot: roster matching, goalies, extras, PK forwards', () => {
  const rows = parseCsv('Line,Position,Number,Player\nF1,LW,9,\nLine 1,C,,Test Two\nD2,RD,,Someone New\nG,G1,30,\nExtra,,,#4\nPK1,F,9,\nPK1,F,4,\nPP3,C,9,\nF1,XX,9,');
  const r = rowsToSlots(rows, roster);
  assert.deepEqual(r.slots.F1LW, { pid: 'a', num: '9', name: 'Test One' });
  assert.equal(r.slots.F1C.pid, 'b');
  assert.deepEqual(r.slots.D2R, { num: '', name: 'Someone New' });
  assert.equal(r.slots.G1.pid, 'c'); assert.equal(r.slots.X1.pid, 'b');
  assert.equal(r.slots.PK1F1.pid, 'a'); assert.equal(r.slots.PK1F2.pid, 'b');
  assert.deepEqual(r.unmatched, ['Someone New']); assert.equal(r.skipped, 2);
});

test('lines, grid layout and the blank template', () => {
  const r = rowsToSlots(parseCsv('Line,LW,C,RW\nF1,9 Test One,#4,\nD1,,,\n'), roster);
  assert.deepEqual(Object.keys(r.slots).sort(), ['F1C', 'F1LW']);
  const t = rowsToSlots(LINES_TEMPLATE, roster);
  assert.equal(t.filled, 0);
  assert.equal(LINES_TEMPLATE.length - 1, 12 + 6 + 2 + 4 + 10 + 8);
});

test('Data Center tables are trimmed to their used rows and columns', () => {
  assert.deepEqual(tidyTable([['Name', '', 'CMJ'], ['', '', ''], ['A', '', '40'], ['B', '', '']]), [['Name', 'CMJ'], ['A', '40'], ['B', '']]);
});

test('pasted spreadsheet cells: tabs, quoted line breaks, and trimming empty rows/columns', async () => {
  const { parseTsv } = await import('../src/lib/imports.js');
  const { rowsToPlayers } = await import('../src/lib/rosterImport.js');
  const rows = parseTsv('Number\tName\tPosition\r\n9\tPaste One\tC\r\n\t"Paste\nTwo"\tD\r\n');
  assert.deepEqual(rows, [['Number', 'Name', 'Position'], ['9', 'Paste One', 'C'], ['', 'Paste\nTwo', 'D']]);
  assert.deepEqual(rowsToPlayers(rows).players.map((p) => p.name), ['Paste One', 'Paste Two']);
});

test('practice plans: running clock, totals, minutes per type, CSV', async () => {
  const { timeline, byType, practiceCsv } = await import('../src/lib/practice.js');
  const blocks = [{ title: 'Dynamic warm-up', minutes: 10, type: 'warmup' }, { title: 'Form shooting', minutes: 15, type: 'shooting' }, { title: 'Spot-up', minutes: '5', type: 'shooting' }];
  const t = timeline('17:50', blocks);
  assert.deepEqual(t.rows.map((r) => [r.from, r.to]), [['17:50', '18:00'], ['18:00', '18:15'], ['18:15', '18:20']]);
  assert.equal(t.total, 30); assert.equal(t.end, '18:20');
  assert.equal(timeline('', blocks).rows[0].from, '');
  assert.deepEqual(byType(blocks), [['shooting', 20], ['warmup', 10]]);
  const csv = practiceCsv({ practice_on: '2026-11-03', start_time: '17:50', blocks }, 'basketball');
  assert.deepEqual(csv[2], ['2026-11-03', '18:00', '18:15', 15, 'Shooting', 'Form shooting', '']);
  assert.deepEqual(csv[csv.length - 1], ['', '', '', 30, '', 'Total', '']);
});

test('playbook: the next step follows the arrows', async () => {
  const { startFrame, nextFrame, nextLabel } = await import('../src/lib/playbook.js');
  const f = startFrame();
  const one = f.players.find((p) => p.label === '1'), two = f.players.find((p) => p.label === '2'), ball = f.players.find((p) => p.kind === 'ball');
  f.lines = [{ id: 'a', kind: 'dribble', x1: one.x, y1: one.y, x2: 30, y2: 25 }, { id: 'b', kind: 'cut', x1: two.x, y1: two.y, x2: 33, y2: 10 }, { id: 'c', kind: 'cut', x1: 0, y1: 40, x2: 5, y2: 40 }];
  const n = nextFrame(f);
  assert.deepEqual([n.players.find((p) => p.label === '1').x, n.players.find((p) => p.label === '2').y], [30, 10]);
  assert.ok(Math.abs(n.players.find((p) => p.kind === 'ball').x - 31.6) < 1e-9 && ball.x === 26.6);
  assert.equal(n.lines.length, 0);
  assert.equal(nextLabel(f, 'o'), '6'); assert.equal(nextLabel(f, 'x'), '1');
});
