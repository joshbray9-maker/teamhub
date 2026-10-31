// Roster import: CSV and PDF-text parsing and name matching, on made-up players.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, rowsToPlayers, pdfItemsToPlayers, planImport } from '../src/lib/rosterImport.js';

test('CSV: maps common headings, keeps only roster fields, reduces a birth date to its year', () => {
  const csv = '﻿#;Last Name;First Name;Pos;S/C;DOB;Ht;Wt;Hometown;Phone\n9;Sample;Alex;C;L;2008-03-14;"5\'11""";175;"Sherbrooke, QC";555-0100\n;Test;Sam;D;Droite;;6\'1";;;\n;;;;;;;;;';
  const { players, columns } = rowsToPlayers(parseCsv(csv));
  assert.equal(columns.Phone, null);
  assert.equal(players.length, 2);
  assert.deepEqual(players[0], { num: '9', name: 'Alex Sample', position: 'C', shoots: 'L', year: '2008', height: `5'11"`, weight: '175', hometown: 'Sherbrooke, QC', source: 'csv' });
  assert.equal(players[1].shoots, 'R');
  assert.ok(!JSON.stringify(players).includes('555'));
});

test('CSV: "Last, First" names and a missing name column', () => {
  const { players } = rowsToPlayers(parseCsv('No,Player,Class\n12,"Doe, Jamie",Senior\n'));
  assert.equal(players[0].name, 'Jamie Doe'); assert.equal(players[0].year, 'Senior');
  assert.throws(() => rowsToPlayers(parseCsv('a,b\n1,2')), /No name column/);
});

test('PDF text: splits rows into the heading columns, skips repeated headings', () => {
  const at = (str, x, y) => ({ str, x, y });
  const items = [
    at('No.', 40, 100), at('Name', 80, 100), at('Pos', 250, 100), at('Hometown', 320, 100),
    at('4', 44, 120), at('Player', 80, 120), at('One', 118, 120), at('D', 252, 120), at('Magog, QC', 320, 120),
    at('No.', 40, 900), at('Name', 80, 900), at('Pos', 250, 900),
    at('31', 42, 920), at('Player Two', 80, 920), at('G', 252, 920),
  ];
  const r = pdfItemsToPlayers(items);
  assert.ok(r.headings);
  assert.deepEqual(r.players.map((p) => [p.num, p.name, p.position, p.hometown]), [['4', 'Player One', 'D', 'Magog, QC'], ['31', 'Player Two', 'G', '']]);
});

test('PDF text without headings: "number name position" lines', () => {
  const r = pdfItemsToPlayers([{ str: '17 Player Three LW', x: 10, y: 10 }, { str: 'Team roster 2026', x: 10, y: 30 }]);
  assert.deepEqual(r.players.map((p) => [p.num, p.name, p.position]), [['17', 'Player Three', 'LW']]);
});

test('planImport matches by name (accents/case ignored) and lists missing players', () => {
  const cur = [{ id: 'a', name: 'Éli Test', num: '5', position: 'C', active: true }, { id: 'b', name: 'Gone Player', num: '6', active: true }];
  const plan = planImport(cur, [{ name: 'eli test', num: '7', position: 'C' }, { name: 'New One', num: '8' }]);
  assert.deepEqual(plan.updates.map((p) => [p.id, p.num]), [['a', '7']]);
  assert.deepEqual(plan.adds.map((p) => p.name), ['New One']);
  assert.deepEqual(plan.missing.map((p) => p.id), ['b']);
});

test('web page tables: picks the roster table, splits "Hometown / High School"', async () => {
  const { parseHTML } = await import('linkedom');
  const { tablesFromDoc } = await import('../supabase/functions/_shared/htmlTables.js');
  const { tablesToPlayers } = await import('../src/lib/rosterImport.js');
  const { document } = parseHTML(`<table><tr><th>Statistic</th><th>Value</th></tr><tr><td>a</td><td>1</td></tr><tr><td>b</td><td>2</td></tr><tr><td>c</td><td>3</td></tr></table>
    <table><thead><tr><th>#</th><th>Full Name</th><th>Pos</th><th>Ht.</th><th>Academic Year</th><th>Hometown / High School</th></tr></thead>
    <tbody><tr><td></td><td><a>Web Player One</a></td><td></td><td>6'0"</td><td>2nd</td><td>Sample, QC / Sample High</td></tr>
    <tr><td>8</td><td>Web Player Two</td><td>Lock</td><td>6'4"</td><td>1st</td><td>Town, ON / Other School</td></tr>
    <tr><td>9</td><td>Web Player Three</td><td>Wing</td><td></td><td>3rd</td><td>City, QC</td></tr></tbody></table>`);
  const r = tablesToPlayers(tablesFromDoc(document));
  assert.deepEqual(r.players.map((p) => [p.num, p.name, p.position, p.year, p.hometown, p.source]), [
    ['', 'Web Player One', '', '2nd', 'Sample, QC', 'web'], ['8', 'Web Player Two', 'Lock', '1st', 'Town, ON', 'web'], ['9', 'Web Player Three', 'Wing', '3rd', 'City, QC', 'web']]);
  assert.throws(() => tablesToPlayers([[['Statistic', 'Value'], ['a', '1'], ['b', '2']]]), /No roster table/);
});
