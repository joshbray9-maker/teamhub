import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSync, rseqGames, parseLeague, parseIcs, planIcs } from '../supabase/functions/_shared/leagueParse.js';

const team = { name: "Bishop's Men's Rugby", school: "Bishop's" };

test('planSync only updates games already on the calendar and returns the rest as review items', () => {
  const existing = [
    { id: 'a', date: '2026-09-12', time: '', home: 'Montréal', away: "Bishop's", hs: null, as: null, venue: '' },
    { id: 'b', date: '2026-09-20', time: '13:00', home: "Bishop's", away: 'McGill', hs: null, as: null, venue: 'Coulter Field' },
  ];
  const incoming = [
    { ext_id: 'rseq:1', date: '2026-09-12', time: '15:15', home: 'Montréal', away: "Bishop's", hs: 55, as: 25, venue: "Terrain Vincent-d'Indy" },
    { ext_id: 'rseq:2', date: '2026-09-21', time: '13:00', home: "Bishop's", away: 'McGill', hs: null, as: null, venue: 'Coulter Field' }, // moved a day
    { ext_id: 'rseq:3', date: '2026-10-04', time: '14:00', home: 'Laval', away: "Bishop's", hs: null, as: null, venue: '' }, // not on calendar
    { ext_id: 'rseq:4', date: '2026-10-04', time: '14:00', home: 'Laval', away: 'ETS', hs: null, as: null, venue: '' }, // not our game
  ];
  const { updates, fresh } = planSync(existing, incoming, team);
  const a = updates.find((u) => u.id === 'a');
  assert.deepEqual({ ...a.patch, ext_id: undefined }, { time: '15:15', venue: "Terrain Vincent-d'Indy", hs: 55, as: 25, ext_id: undefined });
  const b = updates.find((u) => u.id === 'b');
  assert.deepEqual(b.changes.map((c) => c.field), ['date']);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].ext_id, 'rseq:3');
});

test('planSync keeps the calendar home/away orientation for scores', () => {
  const existing = [{ id: 'a', date: '2026-09-12', time: '', home: "Bishop's", away: 'Montréal', hs: null, as: null }];
  const incoming = [{ date: '2026-09-12', time: '', home: 'Montréal', away: "Bishop's", hs: 55, as: 25 }];
  const { updates } = planSync(existing, incoming, team);
  assert.equal(updates[0].patch.hs, 25);
  assert.equal(updates[0].patch.as, 55);
});

test('rseqGames reads games and skips unplayed scores', () => {
  const g = rseqGames({ RegularSeasonGames: [{ GameId: 'x', GameDateText: '2026-09-12', GameTimeFormatted: '15:15', HomeTeamName: 'Montréal', VisitingTeamName: "Bishop's", HomeTeamScore: -999, VisitingTeamScore: -999, GameLocationFormatted: 'CEPSUM' }], LeagueRugbyStats1: [{ FullName: 'ignored' }] });
  assert.deepEqual(g, [{ ext_id: 'rseq:x', date: '2026-09-12', time: '15:15', home: 'Montréal', away: "Bishop's", hs: null, as: null, venue: 'CEPSUM', round: '' }]);
});

test('parseLeague reads an RSEQ-style schedule table', () => {
  const txt = ['#\tDate\tHeure\tVisiteur\tRésultat\tReceveur\tEndroit', "1\t2026-09-12\t15h15\tBishop's\t25 - 55\tMontréal\tCEPSUM"].join('\n');
  const { games } = parseLeague(txt);
  assert.equal(games.length, 1);
  assert.deepEqual([games[0].home, games[0].away, games[0].hs, games[0].as, games[0].time], ['Montréal', "Bishop's", 55, 25, '15:15']);
});

test('parseIcs converts UTC times to the given zone', () => {
  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:1\nDTSTART:20261101T230000Z\nSUMMARY:Universel Sherbrooke vs Team B\nEND:VEVENT\nEND:VCALENDAR';
  const items = parseIcs(ics, { timeZone: 'America/Toronto' });
  assert.deepEqual([items[0].date, items[0].time], ['2026-11-01', '18:00']);
  assert.equal(planIcs(items, 'Universel Sherbrooke').games.length, 1);
});
