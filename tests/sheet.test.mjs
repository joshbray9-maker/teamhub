import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  template, blank, colName, rangeOf, merge, unmerge, insertRows, deleteRows, insertCols, deleteCols,
  parseTSV, toTSV, paste, cellsOf, fillDown, toggle, setText, hiddenCells, usedSize, fitZoom, PAGE,
} from '../src/lib/sheet.js';

test('column names run like Excel', () => {
  assert.deepEqual([0, 8, 25, 26, 27, 51, 52].map(colName), ['A', 'I', 'Z', 'AA', 'AB', 'AZ', 'BA']);
});

test('the template has the program layout: title block, header row, sections, recovery box', () => {
  const sh = template();
  assert.equal(sh.widths.length, 9);
  assert.equal(sh.rows[2][0].v, 'EXERCISE(S)');
  assert.ok(sh.merges.some((m) => m.r === 0 && m.c === 1 && m.rs === 2 && m.cs === 6));
  assert.ok(sh.rows.some((r) => r[0] && r[0].v === 'Strength work'));
  assert.equal(sh.rows.at(-1)[7].v, 'All rights reserved ETX Training inc.');
  const used = usedSize(sh); assert.equal(used.nr, sh.rows.length); assert.equal(used.nc, 9);
});

test('selection grows to cover any merged cell it touches', () => {
  let sh = blank(6, 6); sh = merge(sh, { r0: 1, r1: 2, c0: 1, c1: 3 });
  assert.deepEqual(rangeOf({ r: 0, c: 2 }, { r: 1, c: 2 }, sh), { r0: 0, r1: 2, c0: 1, c1: 3 });
});

test('merging keeps the first text, unmerging leaves it in the top-left cell', () => {
  let sh = blank(4, 4); sh = setText(sh, 0, 1, 'Day 1'); sh = setText(sh, 1, 2, 'gone');
  sh = merge(sh, { r0: 0, r1: 1, c0: 0, c1: 2 });
  assert.equal(sh.rows[0][0].v, 'Day 1'); assert.equal(sh.rows[1][2], null);
  assert.deepEqual([...hiddenCells(sh)].sort(), ['0,1', '0,2', '1,0', '1,1', '1,2']);
  sh = unmerge(sh, { r0: 1, r1: 1, c0: 1, c1: 1 });
  assert.equal(sh.merges.length, 0); assert.equal(sh.rows[0][0].v, 'Day 1');
});

test('inserting and deleting rows and columns moves, grows and shrinks merges', () => {
  let sh = merge(blank(8, 6), { r0: 2, r1: 4, c0: 0, c1: 2 });
  assert.deepEqual(insertRows(sh, 0, 2).merges, [{ r: 4, c: 0, rs: 3, cs: 3 }]);   // above: moves
  assert.deepEqual(insertRows(sh, 3).merges, [{ r: 2, c: 0, rs: 4, cs: 3 }]);      // inside: grows
  assert.deepEqual(insertRows(sh, 5).merges, [{ r: 2, c: 0, rs: 3, cs: 3 }]);      // below: same
  assert.deepEqual(deleteRows(sh, 0, 0).merges, [{ r: 1, c: 0, rs: 3, cs: 3 }]);
  assert.deepEqual(deleteRows(sh, 3, 6).merges, [{ r: 2, c: 0, rs: 1, cs: 3 }]);   // overlap: shrinks
  assert.deepEqual(deleteRows(sh, 1, 5).merges, []);                                // covered: gone
  assert.deepEqual(insertCols(sh, 1).merges, [{ r: 2, c: 0, rs: 3, cs: 4 }]);
  assert.deepEqual(deleteCols(sh, 0, 1).merges, [{ r: 2, c: 0, rs: 3, cs: 1 }]);
  assert.equal(deleteCols(sh, 0, 1).widths.length, 4);
  assert.equal(deleteCols(blank(2, 2), 0, 1).widths.length, 2);                     // never the last column
  // a one-cell merge left after deleting isn't kept
  assert.deepEqual(deleteRows(deleteCols(sh, 0, 1), 3, 4).merges, []);
});

test('pasting from Excel: tabs, new lines and quoted cells; the grid grows to fit', () => {
  assert.deepEqual(parseTSV('A\tB\r\n1\t"two\nlines"\r\n'), [['A', 'B'], ['1', 'two\nlines']]);
  assert.deepEqual(parseTSV('say "hi"\t'), [['say "hi"', '']]);
  let sh = blank(2, 2); sh = toggle(sh, { r0: 1, r1: 1, c0: 1, c1: 1 }, 'b');
  sh = paste(sh, 1, 1, 'Front squat\t3x6\nRDL\t3x8');
  assert.equal(sh.rows.length, 3); assert.equal(sh.widths.length, 3);
  assert.equal(sh.rows[1][1].v, 'Front squat'); assert.equal(sh.rows[1][1].b, true);   // keeps the target's bold
  assert.equal(sh.rows[2][2].v, '3x8');
  assert.equal(toTSV(sh, { r0: 1, r1: 2, c0: 1, c1: 2 }), 'Front squat\t3x6\nRDL\t3x8');
});

test('copying inside Programs keeps styles; fill down copies the top row', () => {
  let sh = setText(blank(4, 2), 0, 0, 'Wall sit'); sh = toggle(sh, { r0: 0, r1: 0, c0: 0, c1: 0 }, 'b');
  const out = paste(sh, 2, 1, 'Wall sit', cellsOf(sh, { r0: 0, r1: 0, c0: 0, c1: 0 }));
  assert.deepEqual(out.rows[2][1], { v: 'Wall sit', b: true });
  const fd = fillDown(sh, { r0: 0, r1: 3, c0: 0, c1: 1 });
  assert.deepEqual(fd.rows[3][0], { v: 'Wall sit', b: true }); assert.equal(fd.rows[3][1], null);
});

test('bold toggles on for a mixed selection, off when all are bold', () => {
  let sh = setText(blank(2, 2), 0, 0, 'a'); const rg = { r0: 0, r1: 0, c0: 0, c1: 1 };
  sh = toggle(sh, { r0: 0, r1: 0, c0: 0, c1: 0 }, 'b');
  sh = toggle(sh, rg, 'b'); assert.ok(sh.rows[0][0].b && sh.rows[0][1].b);
  sh = toggle(sh, rg, 'b'); assert.equal(sh.rows[0][1], null); assert.deepEqual(sh.rows[0][0], { v: 'a', b: false });
});

test('print zoom fills the page width unless the sheet is too tall', () => {
  assert.equal(fitZoom(PAGE.landscape.w / 2, 100), 2);
  assert.equal(fitZoom(PAGE.landscape.w, PAGE.landscape.h * 2), 0.5);
  assert.equal(fitZoom(PAGE.portrait.w, 100, 'portrait'), 1);
});
