import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMPTOMS, totals, progress, baselineFor, badScore, daysSince } from '../src/lib/scat.js';

test('SCAT6 has 22 symptoms and adds up the form totals', () => {
  assert.equal(SYMPTOMS.length, 22);
  const t = totals({ symptoms: { headache: 3, neck: 0, fog: 2, sleep: 6 }, im1: 6, im2: 7, im3: 8, digits: 3, months: 1, bess_double: 0, bess_single: 4, bess_tandem: 2, gait1: 12.4, gait2: 11.9, gait3: '', recall: 7 });
  assert.deepEqual(t, { symptoms: 3, severity: 11, pct_normal: null, immediate: 21, concentration: 4, bess: 6, gait: 11.9, dual: null, recall: 7 });
});

test('parts not done stay blank instead of counting as zero', () => {
  const t = totals({ im1: 6, im2: '', digits: 2 });
  assert.equal(t.symptoms, null); assert.equal(t.severity, null);
  assert.equal(t.immediate, null); assert.equal(t.concentration, null); assert.equal(t.gait, null);
  // every symptom rated 0 is a real result: no symptoms
  assert.deepEqual([totals({ symptoms: { headache: 0 } }).symptoms, totals({ symptoms: { headache: 0 } }).severity], [0, 0]);
});

test('scores outside the form are flagged', () => {
  assert.equal(badScore('im1', '11'), 'Out of 10');
  assert.equal(badScore('months', '2'), 'Out of 1');
  assert.equal(badScore('recall', '4.5'), 'Whole number');
  assert.equal(badScore('gait1', '12.35'), '');
  assert.equal(badScore('recall', 'x'), 'Enter a number');
  assert.equal(badScore('recall', ''), '');
});

test('each post-injury test is compared with the latest baseline before it', () => {
  const tests = [
    { id: 'b1', kind: 'baseline', tested_on: '2025-08-20', data: { symptoms: { headache: 1 }, recall: 8 } },
    { id: 'b2', kind: 'baseline', tested_on: '2026-08-20', data: { symptoms: { headache: 0 }, recall: 9 } },
    { id: 'i2', kind: 'injury', tested_on: '2026-11-05', data: { symptoms: { headache: 2 }, recall: 9 } },
    { id: 'i1', kind: 'injury', tested_on: '2026-11-02', data: { symptoms: { headache: 5, fog: 4 }, recall: 5 } },
    { id: 'i0', kind: 'injury', tested_on: '2025-01-10', data: { recall: 6 } },
  ];
  assert.equal(baselineFor(tests[2], tests).id, 'b2');
  assert.equal(baselineFor(tests[4], tests).id, 'b1'); // before any baseline: the earliest one
  const rows = progress(tests);
  assert.deepEqual(rows.map((r) => r.test.id), ['i0', 'b1', 'b2', 'i1', 'i2']);
  assert.equal(rows[1].change, null);
  assert.deepEqual([rows[3].change.symptoms, rows[3].change.severity, rows[3].change.recall], [2, 9, -4]);
  assert.deepEqual([rows[4].change.severity, rows[4].change.recall, rows[4].change.bess], [2, 0, null]);
  assert.equal(progress([{ id: 'x', kind: 'injury', tested_on: '2026-11-02', data: {} }])[0].change, null);
});

test('days since injury', () => {
  assert.equal(daysSince('2026-11-01', '2026-11-05'), 4);
  assert.equal(daysSince(null, '2026-11-05'), null);
});
