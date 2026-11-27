import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionDays, openDays, checkinStats, gameStats, fmtPct } from '../src/lib/checkin.js';
import { questionsOf, activeQuestions, cleanAnswers, shownQuestions, newQuestionId, avgOf } from '../src/lib/selfAssess.js';
import { layoutDraft, layoutFrom, skillsFor, pillarsFor, ippProgress } from '../src/lib/ipp.js';

const team = { id: 't1', name: 'Test U18', sport: 'hockey' };
// Mon 2026-11-23 .. Sun 11-29: practice Mon + Wed, gym Tue (heavy) + Wed (light), Thu day off
const events = [{ id: 'e1', date: '2026-11-23', kind: 'practice', title: 'Practice' }, { id: 'e2', date: '2026-11-25', kind: 'practice', title: 'Practice' }, { id: 'e3', date: '2026-11-26', kind: 'event', title: 'Team dinner' }];
const sc = { '2026-11-24': { theme: 'Lower', intensity: 'heavy' }, '2026-11-25': { theme: 'Upper', intensity: 'light' }, '2026-11-26': { theme: '', intensity: 'off' }, '2026-11-28': { theme: 'Game', intensity: 'game' } };

test('sessionDays: practices and gym days from the schedule', () => {
  const s = sessionDays(team, null, events, sc, '2026-11-23', '2026-11-29');
  assert.deepEqual(s, { '2026-11-23': { practice: true, gym: false }, '2026-11-24': { practice: false, gym: true }, '2026-11-25': { practice: true, gym: true } });
  assert.deepEqual(Object.keys(sessionDays(team, null, events, sc, '2026-11-24', '2026-11-24')), ['2026-11-24']);
});

test('openDays: today and the 2 days before, newest first', () => {
  const s = sessionDays(team, null, events, sc, '2026-11-20', '2026-11-29');
  assert.deepEqual(openDays(s, '2026-11-26').map((d) => d.date), ['2026-11-25', '2026-11-24']);
  assert.deepEqual(openDays(s, '2026-11-25').map((d) => d.date), ['2026-11-25', '2026-11-24', '2026-11-23']);
});

test('checkinStats: averages and completion; today counts only once answered', () => {
  const s = sessionDays(team, null, events, sc, '2026-11-23', '2026-11-29');
  const rows = [{ date: '2026-11-23', practice_rpe: 6, gym_rpe: null, note: 'tired' }, { date: '2026-11-24', practice_rpe: null, gym_rpe: 8, note: '' }];
  const a = checkinStats(rows, s, { from: '2026-11-23', to: '2026-11-25', today: '2026-11-25' });
  assert.equal(a.practice.avg, 6); assert.equal(a.practice.due, 1); assert.equal(a.practice.done, 1);   // Wed practice not answered yet today
  assert.equal(a.gym.avg, 8); assert.equal(a.gym.due, 1); assert.equal(a.gym.pct, 1);
  const b = checkinStats(rows, s, { from: '2026-11-23', to: '2026-11-29', today: '2026-11-27' });
  assert.equal(b.practice.due, 2); assert.equal(b.practice.done, 1); assert.equal(fmtPct(b.practice.pct), '50%');
  assert.equal(b.gym.due, 2); assert.equal(b.notes, 1);
});

test('gameStats: played games answered', () => {
  const games = [{ id: 'g1', date: '2026-11-20', home: 'Test U18', away: 'Other' }, { id: 'g2', date: '2026-11-22', home: 'Other', away: 'Test U18' }, { id: 'g3', date: '2026-12-01', home: 'Test U18', away: 'X' }, { id: 'g4', date: '2026-11-21', home: 'A', away: 'B' }];
  const g = gameStats([{ game_id: 'g2' }], games, team, { today: '2026-11-27' });
  assert.deepEqual(g, { due: 2, done: 1, pct: 0.5 });
});

test('team questions: defaults, custom list, removed ones kept for old answers', () => {
  assert.equal(questionsOf(null).length, 6);
  assert.deepEqual(cleanAnswers({ rating: '4', compete: '7', fun: 'Maybe', well: '  ok  ', hack: 1 }), { rating: '4', well: 'ok' });
  const qs = [{ id: 'rating', label: 'Overall', type: 'scale' }, { id: 'q1', label: 'Effort?', type: 'choices', choices: ['Low', 'High'] }, { id: 'fun', label: 'Fun', type: 'choices', choices: ['Yes', 'No'], off: true }];
  assert.deepEqual(activeQuestions(qs).map((q) => q.id), ['rating', 'q1']);
  assert.deepEqual(cleanAnswers({ rating: '5', q1: 'High', fun: 'Yes' }, qs), { rating: '5', q1: 'High' });
  assert.deepEqual(shownQuestions(qs, [{ answers: { fun: 'Yes' } }]).map((q) => q.id), ['rating', 'q1', 'fun']);
  assert.equal(newQuestionId(qs), 'q2');
  assert.equal(avgOf([{ answers: { rating: '4' } }, { answers: { rating: '5' } }, { answers: {} }], 'rating'), 4.5);
});

test('IPP layout: reword, add, remove, add a group; round-trips; no change is null', () => {
  assert.equal(layoutFrom('hockey', layoutDraft('hockey', null)), null);
  const d = layoutDraft('hockey', null);
  d[0].groups[0].rows[0].label = 'Food';
  d[0].groups[0].rows.push({ id: 'c.x1', label: 'Screen time', note: '' });
  d[3].groups[0].rows[1].off = true;
  d[3].groups.push({ id: 'c.g1', title: 'Goalie', custom: true, rows: [{ id: 'c.g1.1', label: 'Rebound control', note: '' }] });
  const L = layoutFrom('hockey', d);
  assert.deepEqual(layoutFrom('hockey', layoutDraft('hockey', L)), L);
  assert.deepEqual(pillarsFor('hockey', L)[0].groups[1].rows.map((r) => r.label), ['Food', 'Hydration', 'Sleep', 'Recovery', 'Screen time']);
  const sk = skillsFor('hockey', L);
  assert.ok(!sk.groups[0].rows.some((r) => r.id === 'h.skate2'));
  assert.equal(sk.groups[sk.groups.length - 1].title, 'Goalie');
  assert.equal(ippProgress({}, 'hockey', L).total, ippProgress({}, 'hockey').total + 1);   // +1 pillar, −1 skate, +1 goalie
});
