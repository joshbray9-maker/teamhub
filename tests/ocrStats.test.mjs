// Screenshot reading: rebuilding the stats table from word positions, merging two readings.
// Made-up players and positions; the OCR itself runs only in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wordsToStatRows, mergeReads, skippedLines } from '../src/lib/ocrStats.js';

const W = (text, x, y, w = 10) => ({ text, x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + 14 });
const head = [W('Jersey', 110, 10, 40), W('#', 140, 10), W('Name', 250, 10, 30), W('Pos', 488, 10, 24), W('Team', 555, 10, 30),
  W('GP', 610, 10), W('G', 641, 10), W('A', 667, 10), W('PTS', 700, 10, 24), W('PPG', 790, 10, 24), W('PIM', 1231, 10, 24)];
const row = (y, rank, num, name, pos, gp, g, a, pts, ppg, pim) => [W(rank, 60, y), W(num, 117, y), ...name.split(' ').map((t, i) => W(t, 290 + i * 60, y, 50)),
  W(pos, 488, y), W('BCS', 555, y, 30), W(gp, 610, y), W(g, 641, y), W(a, 667, y), W(pts, 700, y), W(ppg, 790, y), W(pim, 1231, y)];

test('rebuilds rows from word positions; unkept columns (PPG) are ignored', () => {
  const rows = wordsToStatRows([...head, ...row(60, '1', '23', 'Athlete Zed Hannon', 'F', '5', '2', '5', '7', '1', '8'), ...row(113, '2', '41', 'Athlete Max Stoll', 'G', '1', 'O', '0', '0', '0', '©')]);
  assert.deepEqual(rows[0], { num: '23', name: 'Athlete Zed Hannon', position: 'F', gp: 5, stats: { g: 2, a: 5, pim: 8 }, pts: 7, rank: 1 });
  assert.deepEqual(rows[1].stats, { g: 0, a: 0, pim: 0 });
});

test('no heading row: nothing read', () => {
  assert.deepEqual(wordsToStatRows(row(60, '1', '23', 'Athlete Zed Hannon', 'F', '5', '2', '5', '7', '1', '8')), []);
});

test('merge: the reading that adds up wins, gaps are filled, disagreements are flagged', () => {
  const a = [{ num: '1', name: 'Athlete Hal Crane', position: 'G', gp: 5, stats: { g: 833 }, pts: 6, rank: 1 }];
  const b = [{ num: '11', name: 'Athlete HaI Crane', position: '', gp: undefined, stats: { g: 3, a: 3, pim: 2 }, pts: 6 }];
  const [m] = mergeReads(a, b);
  assert.deepEqual(m.stats, { g: 3, a: 3, pim: 2 });
  assert.equal(m.gp, 5); assert.equal(m.position, 'G'); assert.equal(m.num, '11'); assert.equal(m.check, true);
  assert.equal(mergeReads([], [{ name: 'Athlete No Gp', stats: {} }]).length, 0);
});

test('skipped lines only when rows are actually missing', () => {
  assert.deepEqual(skippedLines([{ rank: 1 }, { rank: 2 }, { rank: 4 }]), [3]);
  assert.deepEqual(skippedLines([{ rank: 1 }, { rank: 1 }, { rank: 3 }]), []);
});
