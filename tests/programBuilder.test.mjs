import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { parsePages } from '../src/lib/pb/importer.js';
import { setPlan, shortRx, isBlocked, trainingDay, regenDay, moveProgram, moveToTeam, mergeBackup, fromRows, changes, fingerprint, metaData, newTeam, newProgram, fileName, guessName, countExercises, toBackup, META_NAME } from '../src/lib/pb/model.js';
import { buildPdf } from '../src/lib/pb/pdf.js';

const SEED = new URL('../program-builder-handoff/data/program-builder-data.json', import.meta.url);

test('set boxes follow the prescription', () => {
  assert.deepEqual(setPlan('3x8'), { label: '3x8', boxes: ['1', '2', '3'], target: false });
  assert.deepEqual(setPlan('12,10,8'), { label: '3 sets', boxes: ['12', '10', '8'], target: true });
  assert.deepEqual(setPlan('2x10, 1xamrap').boxes, ['10', '10', 'AMRAP']);
  assert.deepEqual(setPlan('x3 attempts'), { label: 'x3 att.', boxes: ['1', '2', '3'], target: false });
  assert.deepEqual(setPlan('x40').boxes, ['']);
  assert.deepEqual(setPlan('OPEN').boxes, ['']);
  assert.equal(setPlan('9x2').boxes.length, 6); // never more than 6
  for (const b of ['—', '-', '–', 'x', 'n/a', ' X ']) { assert.ok(isBlocked(b), b); assert.equal(setPlan(b).blocked, true); }
  assert.equal(isBlocked('x8'), false);
  assert.equal(shortRx('x30sec'), 'x30s');
  assert.equal(shortRx('x hallway'), 'x hall');
  assert.equal(shortRx('2xamrap'), '2x AMRAP');
});

test('day templates', () => {
  const t = trainingDay(3, 'IN-SEASON BLOCK 4');
  assert.deepEqual(t.sections.map((s) => s.title), ['Prep + Plyos', 'Main Component', 'Accessories']);
  assert.equal(t.weeks.length, 5); assert.equal(t.title, 'Day 3: '); assert.deepEqual(t.notes, ['WALL STRETCH']);
  const r = regenDay();
  assert.deepEqual(r.weeks, ['W1 & 2', 'W3', 'W4', 'W5']); assert.equal(r.sections[0].rows[0].cells.length, 4);
  assert.deepEqual(r.notes, ['COOL-DOWN: ', 'ALTERNATIVES: ']);
});

test('file names and import names', () => {
  assert.equal(fileName('BCS Hockey 26-27 - Group A Var'), 'BCS Hockey 26-27 - Group A Var.pdf');
  assert.equal(fileName("BU Men's Rugby - Phase 1 · OFF-SZN A: Full/team"), "BU Men's Rugby - Phase 1 - OFF-SZN A- Full-team.pdf");
  assert.equal(guessName('1a2b3c4d-BCS Hockey - Group_A_Var.pdf'), 'Group A Var');
});

/* ---------- the importer, against text laid out like an Excel / Sheets export ---------- */
// One page in the hockey layout: name column on the left, then per week an rx column and an "L"
// (load) column, then Tempo and Rest. Positions are in points, y from the top, like pdf.js gives.
function page(day) {
  const items = [], it = (str, x0, y) => items.push({ str, x0, x1: x0 + str.length * 4, y });
  const at = (str, c, y) => it(str, c - str.length * 2, y); // centred on c
  const rxC = (w) => 220 + w * 90, ldC = (w) => 260 + w * 90, n = day.weeks.length, tempoC = rxC(n) + 10, restC = tempoC + 60;
  it(day.block, 20, 30); at(day.title, 400, 30); at(day.tag, rxC(n - 1), 30); it(day.sub, rxC(n - 1) + 30, 30);
  it('Exercise(s)', 20, 60); day.weeks.forEach((w, i) => { at(w, rxC(i), 60); at('L', ldC(i), 60); }); at('Tempo', tempoC, 60); at('Rest', restC, 60);
  let y = 80;
  day.sections.forEach((s) => {
    it(s.title, 20, y); y += 18;
    s.rows.forEach((r) => {
      it(r.name, 20, y);
      r.cells.forEach((c, i) => { if (c.rx) at(c.rx, rxC(i), y); if (c.load) at(c.load, ldC(i), y); });
      if (r.tempo) at(r.tempo, tempoC, y); if (r.rest) at(r.rest, restC, y);
      y += 18;
    });
  });
  day.notes.forEach((nt) => { it(nt, 20, y); y += 18; });
  return { items };
}
const DAY = {
  block: 'IN-SZN B', title: 'Day 1: Brick 1 (GD-5)', tag: 'BRAKE', sub: 'Elastic', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'],
  sections: [
    { title: 'Prep + Plyos', rest: '', rows: [
      { name: 'PR1: Split stance calf raise hold', tempo: 'Controlled', rest: '30sec', cells: ['2x20s', '2x30s', 'x45s', 'x60s', 'x30s'].map((rx) => ({ rx, load: '' })) },
      { name: 'PL1: SL drop landing', tempo: '', rest: '45sec', cells: ['x8/leg', 'x10/leg', 'x10/leg', 'x12/leg', '—'].map((rx, i) => ({ rx, load: i < 4 ? '24"' : '' })) },
    ] },
    { title: 'Main Component', rest: '', rows: [
      { name: 'A. Barbell box squat', tempo: 'Controlled', rest: '60-90sec', cells: ['3x6', '3x5', '3x4', '4x3', '4x2'].map((rx) => ({ rx, load: '' })) },
      { name: 'B. Weighted chin-up', tempo: '8 sec down', rest: '90sec', cells: ['12,10,8', 'x8', 'x8', 'x10', 'x6'].map((rx) => ({ rx, load: '>10lbs' })) },
    ] },
  ],
  notes: ['WALL STRETCH: Pigeon x90sec/side'],
};

test('importer: a hockey-layout page becomes the same day', () => {
  const { days, problems } = parsePages([page(DAY)]);
  assert.deepEqual(problems, []);
  assert.equal(days.length, 1);
  const d = days[0];
  assert.equal(d.block, 'IN-SZN B'); assert.equal(d.title, 'Day 1: Brick 1 (GD-5)');
  assert.equal(d.tag, 'BRAKE'); assert.equal(d.sub, 'Elastic');
  assert.deepEqual(d.weeks, DAY.weeks);
  assert.deepEqual(d.sections.map((s) => s.title), ['Prep + Plyos', 'Main Component']);
  d.sections.forEach((s, si) => s.rows.forEach((r, ri) => {
    const want = DAY.sections[si].rows[ri];
    assert.equal(r.name, want.name); assert.equal(r.tempo, want.tempo); assert.equal(r.rest, want.rest);
    assert.deepEqual(r.cells, want.cells);
  }));
  assert.deepEqual(d.notes, ['WALL STRETCH:  Pigeon x90sec/side']);
});

test('importer: blank or scanned pages are reported, not guessed', () => {
  const { days, problems } = parsePages([{ items: [] }, { items: [{ str: 'Just a heading', x0: 10, x1: 80, y: 20 }] }, page(DAY)]);
  assert.equal(days.length, 1);
  assert.deepEqual(problems, ['Page 1: No text found on this page (is it a scanned image?)', 'Page 2: No week columns (W1, W2…) found']);
});

/* ---------- folders, drag and drop, teams ---------- */
const team = (...names) => { const T = newTeam('T'); names.forEach(([n, f]) => T.programs.push(newProgram(n, f || '', []))); return T; };
const order = (T) => T.programs.map((p) => `${p.name}${p.folder ? '@' + p.folder : ''}`);

test('drag: reorder, drop into a folder, take out of a folder', () => {
  const T = team(['A'], ['B'], ['C', 'In']); T.folders = ['In'];
  assert.ok(moveProgram(T, 0, { type: 'chip', p: 1, before: false })); assert.deepEqual(order(T), ['B', 'A', 'C@In']);
  assert.ok(moveProgram(T, 0, { type: 'zone', zone: '0' })); assert.deepEqual(order(T), ['A', 'C@In', 'B@In']);
  assert.ok(moveProgram(T, 1, { type: 'chip', p: 0, before: true })); assert.deepEqual(order(T), ['C', 'A', 'B@In']); // dropped beside a loose chip: leaves the folder
  assert.equal(moveProgram(T, 1, { type: 'zone', zone: '' }), false); // already last in the loose group
  assert.equal(moveProgram(T, 0, { type: 'chip', p: 0, before: true }), false);
});

test('move to another team keeps the folder', () => {
  const s = { teams: [team(['A', 'Off-season']), team(['X'])] }; s.teams[0].folders = ['Off-season'];
  const i = moveToTeam(s, 0, 0, 1);
  assert.equal(i, 1); assert.deepEqual(s.teams[1].folders, ['Off-season']); assert.equal(s.teams[1].programs[1].folder, 'Off-season');
  assert.equal(s.teams[0].programs.length, 0);
});

/* ---------- saving: rows in the programs table ---------- */
test('save only sends what changed, and loads back the same', () => {
  const s = { teams: [team(['A'], ['B', 'F']), team(['C'])] }; s.teams[0].folders = ['F'];
  let saved = { meta: null, progs: {}, ids: {} };
  let c = changes(s, saved);
  assert.equal(c.ups.length, 3); assert.equal(c.meta, true); assert.deepEqual(c.dels, []);
  // pretend the database stored them
  const rows = c.ups.map(({ p, row }, i) => { p.id = 'id' + i; return { ...row, id: p.id }; });
  rows.push({ id: 'm', name: META_NAME, folder: '', data: metaData(s) }, { id: 'old', name: 'Old sheet', folder: '', data: { sheets: [] } });
  saved = { ...fingerprint(s), ids: Object.fromEntries(s.teams.flatMap((T) => T.programs.map((p) => [p.key, p.id]))) };
  assert.deepEqual(changes(s, saved).ups, []); assert.equal(changes(s, saved).meta, false);
  const back = fromRows(rows);
  assert.equal(back.metaId, 'm');
  assert.deepEqual(back.teams.map((T) => T.programs.map((p) => p.name)), [['A', 'B'], ['C']]);
  assert.equal(back.teams[0].programs[1].folder, 'F'); assert.deepEqual(back.teams[0].folders, ['F']);
  // one edit, one delete, one reorder
  s.teams[0].programs[0].name = 'A2'; s.teams[1].programs.pop(); s.teams[0].programs.reverse();
  c = changes(s, saved);
  assert.deepEqual(c.ups.map((u) => u.row.name), ['A2']); assert.deepEqual(c.dels, ['id2']); assert.equal(c.meta, true);
});

/* ---------- Josh's backup file ---------- */
test('backup: teams grouped the way Josh asked, safe to load twice', () => {
  const backup = { teams: [
    { name: 'BCS Hockey 26-27', folders: [], programs: [{ name: 'Group A Var', days: [DAY] }] },
    { name: 'Universel Hockey NCDC', folders: [], programs: [{ name: 'NCDC A', days: [] }] },
    { name: 'Universel U18/PREM', folders: ['Prem'], programs: [{ name: 'U18 A', folder: 'Prem', days: [] }] },
    { name: "BU Men's Rugby", folders: [], programs: [{ name: 'Phase 1', days: [] }] },
  ] };
  const s = { teams: [] };
  const r = mergeBackup(s, backup);
  assert.deepEqual(s.teams.map((T) => T.name), ['BCS Hockey 26-27', 'Universel Hockey', "Bishop's Men's Rugby"]);
  assert.deepEqual(s.teams[1].programs.map((p) => p.name), ['NCDC A', 'U18 A']); assert.deepEqual(s.teams[1].folders, ['Prem']);
  assert.equal(r.added.length, 4);
  const again = mergeBackup(s, backup);
  assert.equal(again.added.length, 0); assert.equal(again.skipped.length, 4);
  assert.throws(() => mergeBackup(s, { programs: [] }), /isn’t a Program Builder backup/);
});

test('backup: Josh’s real file loads with every program and exercise', { skip: !existsSync(SEED) && 'handoff data not in this checkout' }, () => {
  const data = JSON.parse(readFileSync(SEED, 'utf8'));
  const s = { teams: [] }; mergeBackup(s, data);
  const want = {}; data.teams.forEach((T) => { const n = { 'Universel Hockey NCDC': 'Universel Hockey', 'Universel U18/PREM': 'Universel Hockey', "BU Men's Rugby": "Bishop's Men's Rugby" }[T.name] || T.name; T.programs.forEach((p) => { want[`${n} → ${p.name}`] = countExercises(p.days); }); });
  const got = {}; s.teams.forEach((T) => T.programs.forEach((p) => { got[`${T.name} → ${p.name}`] = countExercises(p.days); }));
  assert.deepEqual(got, want);
  assert.equal(Object.keys(got).length, 13);
  assert.deepEqual(s.teams.map((T) => T.name), ['BCS Hockey 26-27', 'BCS Basketball', 'Universel Hockey', "Bishop's Men's Rugby"]);
  // nothing lost on the way: same days, field for field
  const canon = (x) => (Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x);
  const flat = (b) => b.teams.flatMap((T) => T.programs.map((p) => JSON.stringify(canon(p.days))));
  assert.deepEqual(flat(toBackup(s)).sort(), flat(data).sort());
});

/* ---------- PDF export ---------- */
test('export: one letter-landscape page per day', () => {
  const doc = buildPdf(jsPDF, [DAY, regenDay(), trainingDay(2)], 'T');
  assert.equal(doc.getNumberOfPages(), 3);
  const sz = doc.internal.pageSize; assert.equal(Math.round(sz.getWidth()), 792); assert.equal(Math.round(sz.getHeight()), 612);
});

test('export: Group A Var is 4 pages', { skip: !existsSync(SEED) && 'handoff data not in this checkout' }, () => {
  const data = JSON.parse(readFileSync(SEED, 'utf8'));
  const p = data.teams.find((T) => T.name === 'BCS Hockey 26-27').programs.find((x) => x.name === 'Group A Var');
  assert.equal(buildPdf(jsPDF, p.days, 'x').getNumberOfPages(), 4);
});
