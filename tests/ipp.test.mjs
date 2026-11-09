import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEADER, PILLARS, BASKETBALL, SCALES, MONTHS, COMMENTS, TITLE, templateDefaults, baseIpp, startIpp, ippProgress } from '../src/lib/ipp.js';
import { CELL_NOTES } from '../src/lib/ippTemplate.js';

// every box with a note in the template, as the app lays them out
const boxes = () => [
  ...HEADER, ...SCALES.pillar, ...SCALES.skill,
  ...PILLARS.flatMap((p) => p.groups.flatMap((g) => [...(g.measures || []), ...(g.rows || [])])),
  ...BASKETBALL.groups.flatMap((g) => g.rows.flatMap((r) => [r, r.open, r.bal].filter(Boolean))),
];

test('every note in the template is on exactly one box, word for word', () => {
  const used = boxes().map((b) => b.note).filter(Boolean);
  assert.equal(Object.keys(CELL_NOTES).length, 86);
  assert.equal(used.length, 86);
  assert.deepEqual([...used].sort(), Object.values(CELL_NOTES).sort());
  // spot checks: the note sits on the right box
  const row = (id) => boxes().find((b) => b.id === id);
  assert.match(row('r24').note, /8-10 hours/);                 // Sleep
  assert.match(row('r60').note, /^Communicate with confidence/); // Communication
  assert.match(row('athlete').note, /First and Last/);
  assert.match(BASKETBALL.groups[0].rows[0].open.note, /open or contested shots at the rim/);
  assert.equal(BASKETBALL.groups[0].rows[6].open, null); // foul shots: no Open / Balanced boxes
});

test('template layout: title, sections, legends, comments and months', () => {
  assert.equal(TITLE, "Bishop's College School - IPP");
  assert.deepEqual(PILLARS.map((p) => p.title), ['Physical', 'MENTAL', 'SOCIAL/EMOTIONAL']);
  assert.equal(BASKETBALL.title, 'BASKETBALL FOUR FACTORS');
  assert.deepEqual(SCALES.pillar.map((s) => s.label), ['N/A or did not observe', 'Poor', 'Average', 'Good', 'Creative']);
  assert.deepEqual(SCALES.skill.map((s) => s.label), ['N/A', 'Initiation/Acquisition', 'Consolidation', 'Refinement', 'Creative']);
  assert.equal(COMMENTS.label, 'Comments');
  assert.deepEqual(MONTHS.map((m) => m.label), ['October', 'November', 'December', 'NOTE']);
  assert.equal(PILLARS[0].groups[0].measures[1].label, 'Height');
});

test('base IPP and new athlete IPPs start from the template', () => {
  const d = templateDefaults();
  assert.equal(d.coach, 'Steve Cassivi'); assert.equal(d.province, 'Qc'); assert.equal(d.r10, 'Right'); assert.equal(d.r64, '4');
  const base = baseIpp({ coach: 'Coach B', r24: '3', athlete: 'should not copy' });
  assert.equal(base.coach, 'Coach B'); assert.equal(base.r24, '3'); assert.equal(base.athlete, undefined); assert.equal(base.province, 'Qc');
  const ipp = startIpp({ coach: 'Coach B', evalDate: '2026-11-01' }, { name: 'Athlete A1', position: 'PG' }, { name: 'BCS Varsity Basketball' });
  assert.equal(ipp.athlete, 'Athlete A1'); assert.equal(ipp.position, 'PG'); assert.equal(ipp.team, 'BCS Varsity Basketball'); assert.equal(ipp.coach, 'Coach B');
  assert.equal(ipp.evalDate, undefined);
  const p = ippProgress({ r22: '4', r23: 'x', r78: '5' });
  assert.equal(p.done, 2); assert.equal(p.total, 59); // 33 pillar + 26 basketball rating boxes
});

test('hockey and rugby IPPs: their own skills, no basketball anywhere', async () => {
  const { skillsFor, legendsFor, headerFor, pillarsFor, ippTitle } = await import('../src/lib/ipp.js');
  for (const sport of ['hockey', 'rugby']) {
    const all = JSON.stringify([skillsFor(sport), legendsFor(sport), headerFor(sport), pillarsFor(sport)]);
    assert.doesNotMatch(all, /basketball|basket\b|the floor|\b1, 2, 3, 4, 5\b|foul shot|rebound the ball/i, sport);
    const ids = skillsFor(sport).groups.flatMap((g) => g.rows.map((r) => r.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => !/^r\d/.test(id))); // never collides with template boxes
  }
  assert.equal(skillsFor('hockey').title, 'HOCKEY SKILLS');
  assert.equal(skillsFor('rugby').title, 'RUGBY SKILLS');
  assert.equal(skillsFor('basketball'), BASKETBALL);
  assert.match(pillarsFor('hockey')[0].groups[1].rows[3].note, /breaks from hockey/);
  // basketball keeps the template word for word
  assert.deepEqual(pillarsFor('basketball'), PILLARS);
  assert.equal(ippTitle('BCS'), TITLE);
  assert.equal(ippTitle("Bishop's University"), "Bishop's University - IPP");
  assert.equal(ippTitle('Universel'), 'Universel - IPP');
  const p = ippProgress({ r22: '4', 'h.skate1': '3', r78: '5' }, 'hockey');
  assert.equal(p.done, 2); assert.equal(p.total, 33 + skillsFor('hockey').groups.flatMap((g) => g.rows).length);
});
