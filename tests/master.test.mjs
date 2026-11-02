import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetWeeks, sheetWeek } from '../src/lib/master.js';

const t = { id: 'a', name: 'BCS U18 Hockey' };
const d = {
  sc: { '2026-09-14': { theme: 'Brick 1', intensity: 'heavy' }, '2026-09-15': { theme: 'Brick 2', intensity: 'off' }, '2026-09-19': { theme: '', intensity: 'game' }, '2026-09-20': { theme: 'Away vs. UDM', intensity: 'game' } },
  weeks: { '2026-09-14': { phase: 'GPP week 1', week: '1' } },
  games: [{ id: 1, date: '2026-09-19', time: '13:00', home: 'Rivals', away: 'BCS U18 Hockey' }, { id: 2, date: '2026-09-19', home: 'X', away: 'Y' }],
  events: [{ id: 3, date: '2026-09-17', title: 'CADETS', kind: 'event' }, { id: 4, date: '2026-09-17', title: 'Practice', kind: 'practice' }],
};

test('cells from the team schedule: S&C by intensity, off, games instead of a bare game day, events but no practices', () => {
  const cells = sheetWeek([t], { a: d }, '2026-09-14').rows[0].cells.map((c) => c.map((x) => `${x.text}|${x.cls}`));
  assert.deepEqual(cells, [['Brick 1|i-heavy'], ['OFF|i-off'], [], ['CADETS|ev'], [], ['Away vs. Rivals|i-game'], ['Away vs. UDM|i-game']]);
});

test('BCS: gym days take their gym time, or the rotation, like the team master schedule', () => {
  const bcs = { slug: 'bcs', name: 'BCS' }, u16 = { id: 'u', name: 'BCS U16 Hockey', sport: 'hockey' };
  const data = { u: { sc: { '2026-11-02': { theme: 'Brick 1', intensity: 'heavy' }, '2026-11-03': { theme: 'MTW', intensity: 'moderate', time: '16:45' }, '2026-11-06': { theme: 'Supercharge', intensity: 'light' } } } };
  const c = sheetWeek([u16], data, '2026-11-02', () => bcs).rows[0].cells.map((x) => x.map((y) => `${y.text}@${y.time}`));
  assert.deepEqual(c, [['Brick 1@18:00'], ['MTW@16:45'], ['Gym@15:30'], [], ['Supercharge@'], [], []]);
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
