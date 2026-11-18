import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repeatDates, laterLike, usedThemes, MAX_REPEATS } from '../src/lib/repeat.js';
import { gymWrites } from '../src/lib/slots.js';

test('repeatDates: no repeat, daily, weekdays', () => {
  assert.deepEqual(repeatDates('2026-11-16'), ['2026-11-16']);
  assert.deepEqual(repeatDates('2026-11-16', { freq: 'daily', until: '2026-11-18' }), ['2026-11-16', '2026-11-17', '2026-11-18']);
  assert.deepEqual(repeatDates('2026-11-20', { freq: 'weekdays', until: '2026-11-24' }), ['2026-11-20', '2026-11-23', '2026-11-24']);
  assert.deepEqual(repeatDates('2026-11-16', { freq: 'daily', until: '2026-11-10' }), ['2026-11-16']);
});

test('repeatDates: weekly on chosen days, every 2 weeks, cap', () => {
  // Mon 16 Nov, Mon + Wed until Mon 30 Nov
  assert.deepEqual(repeatDates('2026-11-16', { freq: 'weekly', days: [1, 3], until: '2026-11-30' }), ['2026-11-16', '2026-11-18', '2026-11-23', '2026-11-25', '2026-11-30']);
  assert.deepEqual(repeatDates('2026-11-16', { freq: 'weekly', until: '2026-12-01' }), ['2026-11-16', '2026-11-23', '2026-11-30']);
  // Wed start, every 2 weeks on Mon + Wed: the start week's Monday is already past
  assert.deepEqual(repeatDates('2026-11-18', { freq: 'biweekly', days: [1, 3], until: '2026-12-16' }), ['2026-11-18', '2026-11-30', '2026-12-02', '2026-12-14', '2026-12-16']);
  assert.equal(repeatDates('2026-01-01', { freq: 'daily', until: '2027-12-31' }).length, MAX_REPEATS);
});

test('laterLike: events with the same title and time from that date on, not synced ones', () => {
  const ev = (id, date, o = {}) => ({ id, date, time: '15:30', end_time: '16:30', title: 'Lift', kind: 'event', ...o });
  const d = { events: [ev(1, '2026-11-10'), ev(2, '2026-11-16'), ev(3, '2026-11-23'), ev(4, '2026-11-30', { time: '16:00' }), ev(5, '2026-12-07', { title: 'Meeting' }), ev(6, '2026-12-14', { ext_id: 'x' })] };
  const x = { kind: 'event', date: '2026-11-16', time: '15:30', end: '16:30', ev: d.events[1] };
  assert.deepEqual(laterLike(x, d).map((e) => e.id), [2, 3]);
});

test('laterLike: gym days with the same theme and time; days off and game days skipped', () => {
  const sc = { '2026-11-16': { theme: 'Brick 1', time: '15:30', end: '16:30' }, '2026-11-18': { theme: 'Brick 1', time: '15:30', end: '16:30' }, '2026-11-20': { theme: 'Brick 1', intensity: 'off' }, '2026-11-23': { theme: 'Brick 2', time: '15:30', end: '16:30' } };
  const x = { kind: 'gym', date: '2026-11-16', time: '15:30', end: '16:30', sc: sc['2026-11-16'] };
  assert.deepEqual(laterLike(x, { sc }).map(([d]) => d), ['2026-11-16', '2026-11-18']);
  assert.deepEqual(laterLike({ kind: 'gym', date: '2026-11-17', sc: null }, { sc }), [['2026-11-17', null]]);
});

test('usedThemes: most used first, "Gym" left out', () => {
  const data = { a: { sc: { d1: { theme: 'Regen' }, d2: { theme: 'Brick 1' }, d3: { theme: 'Brick 1' } } }, b: { sc: { d1: { theme: 'Gym' }, d2: { theme: 'Regen' }, d3: { theme: 'Regen' } } } };
  assert.deepEqual(usedThemes([{ id: 'a' }, { id: 'b' }], data), ['Regen', 'Brick 1']);
});

test('gymWrites: an intensity in the change is saved, and a vacated day stays off', () => {
  const item = { date: '2026-11-16', sc: { theme: 'Brick 1', intensity: 'light', time: '15:30' } };
  assert.equal(gymWrites(item, { date: '2026-11-16', time: '15:30', end: '', theme: 'Brick 1', intensity: 'heavy' })[0][1].intensity, 'heavy');
  assert.equal(gymWrites(item, { date: '2026-11-16', time: '15:30', end: '', theme: 'Brick 1' })[0][1].intensity, 'light');
  const mv = gymWrites(item, { date: '2026-11-17', time: '15:30', end: '', theme: 'Brick 1', intensity: 'heavy' });
  assert.equal(mv[0][1].intensity, 'heavy'); assert.equal(mv[1][1].intensity, 'off');
});
