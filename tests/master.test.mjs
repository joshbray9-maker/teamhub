import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayCell, sheetWeeks, sheetWeek } from '../src/lib/master.js';

const t = { id: 'a', name: 'BCS U18 Hockey' };
const d = {
  sc: { '2026-09-14': { theme: 'Brick 1', intensity: 'heavy' }, '2026-09-15': { theme: '', intensity: 'off' }, '2026-09-19': { theme: '', intensity: 'game' }, '2026-09-20': { theme: 'Away vs. UDM', intensity: 'game' } },
  weeks: { '2026-09-14': { phase: 'GPP week 1', week: '1' } },
  games: [{ id: 1, date: '2026-09-19', time: '13:00', home: 'Rivals', away: 'BCS U18 Hockey' }, { id: 2, date: '2026-09-19', home: 'X', away: 'Y' }],
  events: [{ id: 3, date: '2026-09-17', title: 'CADETS', kind: 'event' }, { id: 4, date: '2026-09-17', title: 'Practice', kind: 'practice' }],
};

test('dayCell: S&C session coloured by intensity, off, games instead of a bare game day, events but no practices', () => {
  assert.deepEqual(dayCell(t, d, '2026-09-14').map((x) => [x.text, x.cls]), [['Brick 1', 'i-heavy']]);
  assert.deepEqual(dayCell(t, d, '2026-09-15').map((x) => x.text), ['OFF']);
  assert.deepEqual(dayCell(t, d, '2026-09-19').map((x) => [x.kind, x.text]), [['game', 'Away vs. Rivals']]);
  assert.deepEqual(dayCell(t, d, '2026-09-20').map((x) => x.text), ['Away vs. UDM']); // theme kept when no game is listed
  assert.deepEqual(dayCell(t, d, '2026-09-17').map((x) => x.text), ['CADETS']);
  assert.deepEqual(dayCell(t, d, '2026-09-16'), []);
});

test('sheetWeeks / sheetWeek: weeks from the first S&C week, one row per team, shared periodization merged', () => {
  const u = { id: 'b', name: 'Universel U18' }, data = { a: d, b: { sc: { '2026-09-21': { theme: 'Regen', intensity: 'light' } }, weeks: { '2026-09-14': { phase: 'GPP week 1', week: '1' }, '2026-09-21': { phase: 'GPP week 2', week: '2' } } } };
  assert.deepEqual(sheetWeeks([t, u], data, '2026-09-23'), ['2026-09-14', '2026-09-21']);
  const w = sheetWeek([t, u], data, '2026-09-14');
  assert.equal(w.rows.length, 2); assert.equal(w.samePhase, true); assert.equal(w.sameWeek, true);
  assert.equal(w.rows[0].cells[0][0].text, 'Brick 1');
  assert.equal(sheetWeek([t, u], data, '2026-09-21').samePhase, false);
  assert.deepEqual(sheetWeeks([t], { a: {} }, '2026-11-04'), ['2026-11-02']);
});

test('sheetOrder: Universel, Bishop\'s, then BCS U16, U18, varsity, prep', async () => {
  const { sheetOrder } = await import('../src/lib/master.js');
  const names = ['BCS U18 Hockey', 'BCS U16 Hockey', 'BCS Varsity Basketball', 'BCS Basketball Prep', "Bishop's Men's Rugby", 'Universel U18', 'Universel USPHL', 'Universel NCDC Québec', 'Universel NCDC Vermont', 'Other'];
  assert.deepEqual(sheetOrder(names.map((name) => ({ name }))).map((t) => t.name),
    ['Universel U18', 'Universel USPHL', 'Universel NCDC Québec', 'Universel NCDC Vermont', "Bishop's Men's Rugby", 'BCS U16 Hockey', 'BCS U18 Hockey', 'BCS Varsity Basketball', 'BCS Basketball Prep', 'Other']);
});
