import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, DOW_MON } from '../src/lib/util.js';

test('month calendars start on Monday and end on Sunday', () => {
  assert.equal(DOW_MON[0], 'Mon'); assert.equal(DOW_MON[6], 'Sun');
  for (let m = 0; m < 24; m++) {
    const y = 2026 + Math.floor(m / 12), { start, weeks } = monthGrid(y, m % 12);
    const end = new Date(start); end.setDate(start.getDate() + weeks * 7 - 1);
    assert.equal(start.getDay(), 1); assert.equal(end.getDay(), 0);
    assert.ok(start <= new Date(y, m % 12, 1) && end >= new Date(y, m % 12 + 1, 0));
    assert.ok(new Date(start.getTime() + 6 * 864e5).getMonth() === m % 12 || weeks === 0, 'no empty first week');
  }
  // Nov 2026 starts on a Sunday: Mon Oct 26 begins the grid, six weeks
  const n = monthGrid(2026, 10); assert.equal(n.start.getDate(), 26); assert.equal(n.weeks, 6);
});
