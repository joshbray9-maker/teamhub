import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { inviteRows, buildInvitePdf } from '../src/lib/invitePdf.js';

const team = { id: 't1', name: 'U18 Hockey' };
const players = [{ id: 'p1', num: '12', name: 'Athlete HV12' }, { id: 'p2', num: '3', name: 'Athlete HV03' }, { id: 'p3', num: '', name: 'Athlete HV99' }, { id: 'p4', num: '5', name: 'Athlete Gone', active: false }];
const members = [
  { user_id: 'u1', email: 'hv03@example.com', role: 'athlete', player_id: 'p2' },
  { id: 'i1', pending: true, role: 'athlete', player_id: 'p1', token: 'tok1', label: 'Athlete HV12' },
  { id: 'i2', pending: true, role: 'coach', token: 'tok2', label: 'Coach A', teams: ['t1'] },
  { id: 'i3', pending: true, role: 'coach', token: 'tok3', label: 'Coach Other', teams: ['t2'] },
  { user_id: 'u2', email: 'admin@example.com', role: 'admin', teams: null },
];
const url = (t) => 'https://x.test/join/' + t;

test('inviteRows: roster by number, joined / link / none, staff that open this team', () => {
  const r = inviteRows(team, players, members, url);
  assert.deepEqual(r.players.map((p) => [p.name, p.status]), [['Athlete HV03', 'joined'], ['Athlete HV12', 'link'], ['Athlete HV99', 'none']]);
  assert.equal(r.players[1].url, 'https://x.test/join/tok1');
  assert.equal(r.players[0].who, 'hv03@example.com');
  assert.deepEqual(r.staff.map((s) => [s.name, s.role, s.status]), [['Coach A', 'Coach', 'link'], ['admin@example.com', 'Admin', 'joined']]);
});

test('buildInvitePdf: names and links are in the PDF, links clickable, long rosters page', () => {
  const r = inviteRows(team, players, members, url);
  const out = buildInvitePdf(jsPDF, { orgName: 'BCS', teamName: team.name, rows: r, date: 'Wed, Nov 18, 2026' }).output();
  ['Athlete HV12', 'Athlete HV03', 'Coach A', 'https://x.test/join/tok1', 'No link yet', 'Joined'].forEach((s) => assert.ok(out.includes(s), s));
  assert.ok(out.includes('/URI (https://x.test/join/tok1)'));
  const many = Array.from({ length: 60 }, (_, i) => ({ id: 'q' + i, num: String(i + 1), name: 'Athlete ' + i }));
  const big = buildInvitePdf(jsPDF, { orgName: 'BCS', teamName: 'T', rows: inviteRows(team, many, many.map((p, i) => ({ id: 'k' + i, pending: true, role: 'athlete', player_id: p.id, token: 'tok-long-' + i })), url) });
  assert.ok(big.getNumberOfPages() >= 2);
});
