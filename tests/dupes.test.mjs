import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameName, findDupes, pickKeep, mergedPlayer } from '../src/lib/dupes.js';

test('sameName: short first names, missing last names, accents, "Last, First"', () => {
  assert.equal(sameName('Dan Placeholder', 'Daniel Placeholder'), 'Short first name');
  assert.equal(sameName('Kazu', 'Kazunori'), 'Short first name');
  assert.equal(sameName('Theo', 'Theo Example'), 'Missing last name');
  assert.equal(sameName('Sam Testeur', 'samuel testeur'), 'Short first name');
  assert.equal(sameName('Élie Sample', 'Elie Sample'), 'Same name');
  assert.equal(sameName('Sample, Elie', 'Elie Sample'), 'Same name');
  assert.equal(sameName('Dan Placeholder', 'Dan Other'), '');
  assert.equal(sameName('Al Placeholder', 'Alex Placeholder'), ''); // two letters is too short to call
  assert.equal(sameName('Sam Testeur', 'Max Testeur'), '');
});

test('findDupes: pairs on a roster, numbers that differ rule a pair out, keep the fuller name', () => {
  const ps = [
    { id: '1', name: 'Dan Placeholder', num: '' }, { id: '2', name: 'Daniel Placeholder', num: '14' },
    { id: '3', name: 'Theo', num: '7' }, { id: '4', name: 'Theo Example', num: '7' },
    { id: '5', name: 'Sam Testeur', num: '9' }, { id: '6', name: 'Samuel Testeur', num: '19' },
    { id: '7', name: 'Max Other', num: '' },
  ];
  const r = findDupes(ps);
  assert.deepEqual(r.map((x) => [x.a.id, x.b.id, x.keep]), [['1', '2', '2'], ['3', '4', '4']]);
});

test('pickKeep and mergedPlayer: blanks filled from the other profile', () => {
  const a = { id: 'a', name: 'Dan X', num: '', position: 'D', active: false }, b = { id: 'b', name: 'Daniel X', num: '4', position: '', year: '2009' };
  assert.equal(pickKeep(a, b).id, 'b');
  assert.deepEqual(mergedPlayer(b, a), { id: 'b', name: 'Daniel X', num: '4', position: 'D', year: '2009', active: true });
});
