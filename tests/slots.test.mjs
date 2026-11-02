import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orgSlots, slotOf, weekItems, weekGrid } from '../src/lib/slots.js';

test('organization time slots: BCS three slots, Universel 7:30–12 in half hours, others none', () => {
  assert.deepEqual(orgSlots({ slug: 'bcs', name: 'BCS' }), [['15:30', '16:30'], ['16:45', '17:45'], ['18:00', '19:00']]);
  const u = orgSlots({ slug: 'universel-sherbrooke', name: 'Universel Sherbrooke' });
  assert.equal(u[0][0], '07:30'); assert.equal(u[u.length - 1][1], '12:00'); assert.equal(u.length, 9);
  assert.equal(orgSlots({ slug: 'other', name: 'Other club' }), null);
  assert.equal(orgSlots({ slug: 'abcs', name: 'ABCs' }), null);
});

test('slotOf: inside a slot, between slots, no time', () => {
  const s = orgSlots({ slug: 'bcs' });
  assert.equal(slotOf('15:30', s), 0); assert.equal(slotOf('17:00:00', s), 1); assert.equal(slotOf('18:59', s), 2);
  assert.equal(slotOf('16:35', s), 'other'); assert.equal(slotOf('19:00', s), 'other'); assert.equal(slotOf('', s), 'none');
});

test('weekItems + weekGrid: games, practices and gym days of every team in the week', () => {
  const teams = [{ id: 'a', name: 'Varsity' }, { id: 'b', name: 'Prep' }];
  const data = {
    a: { games: [{ id: 1, date: '2026-11-04', time: '18:00', home: 'Varsity', away: 'Rivals' }, { id: 9, date: '2026-11-04', time: '18:00', home: 'X', away: 'Y' }],
      events: [{ id: 2, kind: 'practice', date: '2026-11-03', time: '15:30', title: 'Practice' }, { id: 3, date: '2026-11-12', time: '15:30', title: 'Next week' }],
      sc: { '2026-11-02': { theme: 'Brick 1', intensity: 'heavy', time: '16:45' }, '2026-11-05': { theme: '', intensity: 'off' }, '2026-11-06': { theme: 'Regen', intensity: 'light' } } },
    b: { games: [], events: [{ id: 4, kind: 'event', date: '2026-11-08', time: '10:00', title: 'Tournament' }], sc: {} },
  };
  const items = weekItems(teams, data, '2026-11-02', () => '#000');
  assert.deepEqual(items.map((x) => `${x.kind}:${x.date}`), ['gym:2026-11-02', 'practice:2026-11-03', 'game:2026-11-04', 'gym:2026-11-06', 'event:2026-11-08']);
  assert.equal(items[2].title, 'vs Rivals');
  const g = weekGrid(items, orgSlots({ slug: 'bcs' }), '2026-11-02');
  assert.deepEqual(g.rows.map((r) => r.key), [0, 1, 2, 'other', 'none']);
  assert.equal(g.rows[1].cells[0][0].title, 'Brick 1'); // Mon gym at 4:45
  assert.equal(g.rows[0].cells[1][0].kind, 'practice'); // Tue 3:30
  assert.equal(g.rows[2].cells[2][0].kind, 'game'); // Wed 6 pm
  assert.equal(g.rows[3].cells[6][0].title, 'Tournament'); // Sun 10 am, outside the slots
  assert.equal(g.rows[4].cells[4][0].title, 'Regen'); // Fri, no gym time set
  assert.deepEqual(weekGrid([], orgSlots({ slug: 'bcs' }), '2026-11-02').rows.map((r) => r.key), [0, 1, 2]);
});
