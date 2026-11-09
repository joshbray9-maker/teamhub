// Individual performance pathway (IPP): the layout of Josh's BCS IPP template, box by box.
// Every label, default and note comes from the template (ippTemplate.js, keyed by spreadsheet
// cell), so each note stays attached to the same box as in the workbook. Field ids follow the
// spreadsheet row: r22 = Nutrition's rating box (G22), r22.obs = its observation box (K22:O22),
// r78.open / r78.bal = the Open / Balanced boxes (J78, L78). Values are stored per athlete in
// the ipps table; the team's base IPP holds the values every new IPP starts from.
import { CELL_TEXT as T, CELL_NOTES as N } from './ippTemplate.js';

const L = (c) => (T[c] || '').replace(/^o\s+/, '').replace(/\s+/g, ' ').trim();
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** The two 1–5 scales: the pillars' legend (with its notes) and the basketball legend. */
export const SCALES = {
  pillar: range(1, 5).map((v) => ({ v: String(v), label: L(`C${15 + v}`), note: N[`G${15 + v}`] || '' })),
  skill: range(1, 5).map((v) => ({ v: String(v), label: L(`C${69 + v}`), note: N[`G${69 + v}`] || '' })),
};
export const LEGENDS = [{ title: L('B16'), scale: 'pillar' }, { title: L('B70'), scale: 'skill' }];

export const TITLE = T.B1;
/** Header boxes. `from` fills a new IPP from the roster; `def` is the template's own value. */
export const HEADER = [
  { id: 'athlete', label: L('B3'), note: N.C3, from: 'name' },
  { id: 'coach', label: L('G3'), note: N.H3, def: T.H3 },
  { id: 'position', label: L('B4'), note: N.C4, from: 'position' },
  { id: 'evalDate', label: L('G4'), note: N.H4, type: 'date' },
  { id: 'team', label: L('B5'), note: N.C5, from: 'team' },
  { id: 'province', label: L('G5'), note: N.H5, def: T.H5 },
  { id: 'age', label: L('B6'), note: N.C6 },
];

// a 1–5 rating row: label in column C, rating box in G (its note and any template value)
const rating = (r) => ({ id: `r${r}`, label: L(`C${r}`), note: N[`G${r}`] || '', def: /^[1-5]$/.test(T[`G${r}`] || '') ? T[`G${r}`] : '' });

/** The four pillars' sections (columns: Scale, Observations), in the template's order. */
export const PILLARS = [
  { id: 'physical', title: L('B9'), groups: [
    { id: 'anthro', title: L('C10'), measures: [
      { id: 'r10', label: L('E10'), note: N.D10, choices: ['Right', 'Left'], def: T.D10 },
      { id: 'r11', label: L('C11'), note: N.D11, unit: L('E11') },
      { id: 'r12', label: L('C12'), note: N.D12, unit: L('E12') },
      { id: 'r13', label: L('C13'), note: N.D13 || '', unit: L('E13') },
      { id: 'r14', label: L('C14'), note: '', text: true },
    ] },
    { id: 'health', title: L('G9'), rows: range(22, 25).map(rating) },
    { id: 'fmc', title: L('C27'), rows: range(28, 31).map(rating) },
    { id: 'pwc', title: L('G33'), tag: L('B33'), rows: range(34, 38).map(rating) },
  ] },
  { id: 'mental', title: L('B40'), groups: [
    { id: 'perspective', title: L('G40'), rows: range(41, 44).map(rating) },
    { id: 'imagery', title: L('G45'), rows: [rating(46)] },
    { id: 'focus', title: L('G47'), rows: range(48, 49).map(rating) },
    { id: 'energy', title: L('G50'), rows: range(51, 52).map(rating) },
  ] },
  { id: 'social', title: L('B54'), sub: L('C54'), groups: [
    { id: 'leadership', title: L('G54'), rows: range(55, 58).map(rating) },
    { id: 'relationships', title: L('G59'), rows: [rating(60)] },
    { id: 'passion', title: L('G61'), rows: [rating(62)] },
    { id: 'dte', title: L('G63'), rows: range(64, 68).map(rating) },
  ] },
];
export const PILLAR_HEAD = { pillars: L('B7'), scale: L('G8'), obs: L('K9'), comments: L('K10') };

// a basketball row: skill stage in G (Range), and for scoring Open (J) / Balanced (L) boxes
const skill = (r) => ({ ...rating(r), open: N[`J${r}`] ? { note: N[`J${r}`] } : null, bal: N[`L${r}`] ? { note: N[`L${r}`] } : null });
export const OPEN = ['Open', 'Contested'], BALANCED = ['Balanced', 'Off balance'];

/** Basketball four factors. Scoring has Range / Open / Balanced columns; the others a stage. */
export const BASKETBALL = {
  title: L('B76'),
  head: { range: L('G77'), open: L('J77'), bal: L('L77'), comments: L('N77') },
  groups: [
    { id: 'score', title: L('J76'), scoring: true, rows: range(78, 84).map(skill) },
    { id: 'control', title: L('G85'), rows: range(86, 92).map(skill) },
    { id: 'rebound', title: L('G93'), rows: range(94, 95).map(skill) },
    { id: 'fouls', title: L('G96'), rows: range(97, 98).map(skill) },
    { id: 'defence', title: L('G99'), rows: range(100, 107).map(skill) },
  ],
};

export const COMMENTS = { id: 'comments', label: L('B109') };
/** The monthly notes at the bottom of the template (October, November, December, NOTE). */
export const MONTHS = ['B146', 'B156', 'B166', 'B173'].map((c) => ({ id: 'm.' + L(c).toLowerCase(), label: L(c) }));

/* ---------- other sports (Josh, 2026-11-09) ----------
   The template is a basketball IPP. Hockey teams (BCS, Universel) and rugby get the same header,
   pillars, legend scale, comments and months, with the few basketball-specific notes reworded and
   their own skills section in place of the basketball four factors. Each skill box asks the
   template's own question ("At what stage of skill development…") on the 1–5 skill scale. */
const stage = (what) => `At what stage of skill development is the athlete's ability to ${what}?`;
const SHOT_OPEN = 'Decide if the athlete has the knowledge, understanding and application in regards to shooting when open or contested.\n\nAn open shot is one where the player has:\n- time and space to pick a spot\n- a clear lane to the net\n\nA contested shot would be:\n- shooting through a defender’s stick or body\n- shooting while being checked or under a tight gap\n\nThis is a subjective rating by the coach. If it is a concern it is better to identify it so that the athlete can address the situation';
const SHOT_BAL = 'Does the player stay in balance when shooting: weight transferred through the shot, edges under control, able to shoot in stride as well as stationary?\n\nIf the player tends to fall away, lose their edges or shoot off the wrong foot they would be considered off balance.\n\nThis is a subjective rating by the coach. If it is a tendency that needs to be corrected it should be noted';
const sk = (prefix, gid, rows, extra) => rows.map(([label, what], i) => ({ id: `${prefix}.${gid}${i + 1}`, label, note: stage(what), def: '', ...(extra ? { open: { note: SHOT_OPEN }, bal: { note: SHOT_BAL } } : { open: null, bal: null }) }));
const head = { range: L('G77'), open: L('J77'), bal: L('L77'), comments: L('N77') };
const group = (prefix, id, title, rows, scoring) => ({ id, title, scoring: !!scoring, rows: sk(prefix, id, rows, scoring) });

const HOCKEY = {
  title: 'HOCKEY SKILLS', legend: 'Hockey Legend', head,
  groups: [
    group('h', 'skate', 'Skating', [
      ['Forward stride', 'skate forward with a full, efficient stride'],
      ['Backward skating', 'skate backward with speed and control'],
      ['Crossovers and edges', 'use inside and outside edges and crossovers to turn and build speed'],
      ['Starts and stops', 'start explosively and stop on both sides'],
      ['Pivots and transitions', 'pivot between forward and backward skating without losing speed'],
    ]),
    group('h', 'shoot', 'Shoot the puck', [
      ['Wrist shot', 'release an accurate wrist shot'],
      ['Snap shot', 'release a quick snap shot'],
      ['Slap shot / one-timer', 'shoot a slap shot or one-timer off a pass'],
      ['Backhand', 'shoot on the backhand'],
      ['Around the net', 'score around the net: tips, deflections and rebounds'],
      ['Breakaways and shootouts', 'finish on a breakaway or in a shootout'],
    ], true),
    group('h', 'puck', 'Control the puck', [
      ['Stickhandling in open ice', 'handle the puck at speed in open ice'],
      ['Puck protection', 'protect the puck in traffic and along the boards'],
      ['Forehand pass', 'pass the puck on the forehand'],
      ['Backhand pass', 'pass the puck on the backhand'],
      ['Receiving passes', 'receive passes on the forehand and backhand, in stride'],
    ]),
    group('h', 'battle', 'Battles', [
      ['Puck retrieval', 'win races and retrieve loose pucks'],
      ['Board battles', 'compete for and win pucks along the boards'],
      ['Net-front presence', 'establish and hold position in front of the net'],
      ['Body contact', 'give and take body contact safely and effectively'],
    ]),
    group('h', 'off', 'Offence', [
      ['Support and spacing', 'support the puck carrier and find open ice in relation to teammates, defenders and the puck'],
      ['Moving without the puck', 'move without the puck to get open'],
      ['Zone entries and exits', 'carry, pass or chip the puck in and out of zones'],
    ]),
    group('h', 'def', 'Defence', [
      ['Gap control', 'keep the right gap on the puck carrier'],
      ['Angling', 'angle the puck carrier to the boards and take away time and space'],
      ['Defensive-zone positioning', 'read the play and hold position in the defensive zone'],
      ['Stick detail', 'take away passing lanes with the stick and block shots'],
      ['Backchecking', 'track back hard and pick up a check in transition'],
      ['Penalties', 'play with discipline and use penalties wisely'],
    ]),
  ],
};

const RUGBY = {
  title: 'RUGBY SKILLS', legend: 'Rugby Legend', head,
  groups: [
    group('rg', 'hand', 'Handling', [
      ['Catch and pass left', 'catch and pass to the left'],
      ['Catch and pass right', 'catch and pass to the right'],
      ['Passing under pressure', 'pass accurately under pressure and in contact'],
      ['Offloading', 'offload in or out of the tackle'],
    ]),
    group('rg', 'carry', 'Ball carrying', [
      ['Running lines', 'pick running lines and attack space'],
      ['Footwork and evasion', 'beat a defender with footwork, a step or a swerve'],
      ['Contact and leg drive', 'carry into contact with good body height and leg drive'],
      ['Ball presentation', 'go to ground and present the ball to support players'],
    ]),
    group('rg', 'ruck', 'Breakdown', [
      ['Clean-out', 'clear out rucks with good body position'],
      ['Contesting the ball', 'compete for the ball on the ground and win turnovers'],
      ['Support play', 'arrive quickly in support of the ball carrier'],
    ]),
    group('rg', 'def', 'Defence', [
      ['Tackle technique', 'tackle safely and effectively on both shoulders'],
      ['Line speed', 'get off the line together and close space'],
      ['Line connection', 'stay connected and communicate in the defensive line'],
      ['Tackle completion', 'complete tackles and get back to their feet'],
    ]),
    group('rg', 'kick', 'Kicking and catching', [
      ['Kicking', 'kick out of hand and from the ground (punt, grubber, box, place kick)'],
      ['High ball', 'catch the high ball under pressure'],
      ['Kick chase', 'chase kicks and put pressure on the receiver'],
    ]),
    group('rg', 'set', 'Set piece and restarts', [
      ['Lineout', 'perform their role in the lineout (throwing, lifting or jumping)'],
      ['Scrum', 'perform their role in the scrum'],
      ['Restarts', 'kick or receive restarts'],
    ]),
    group('rg', 'game', 'Game understanding', [
      ['Decision making', 'read the game and choose the right option'],
      ['Discipline', 'play within the laws and avoid penalties'],
    ]),
  ],
};
BASKETBALL.legend = L('B70');
const SKILLS = { basketball: BASKETBALL, hockey: HOCKEY, rugby: RUGBY };
/** The sport skills section for a team's sport (the template's basketball one for any other sport). */
export const skillsFor = (sport) => SKILLS[sport] || BASKETBALL;
/** The legends for a sport: the pillars' scale and the sport's skill scale. */
export const legendsFor = (sport) => [LEGENDS[0], { title: skillsFor(sport).legend, scale: 'skill' }];

// the template notes that only make sense for basketball, reworded per sport
const NOTE_FIX = {
  hockey: { position: 'What position does the athlete play? C, LW, RW, D or G', team: 'Team or age group (e.g. U18)', r36: 'How quickly can the athlete skate the length of the ice? See the tab Physical for help with this area' },
  rugby: { position: 'What position does the athlete play? e.g. prop, hooker, lock, back row, scrum-half, fly-half, centre, wing, fullback', team: 'Team or age group (e.g. U18)', r36: 'How quickly can the athlete cover the ground in open play? See the tab Physical for help with this area' },
};
const fixNote = (sport, x) => {
  const f = NOTE_FIX[sport]; if (!f) return x;
  let note = f[x.id] || x.note;
  if (x.id === 'r25') note = note.replace('basketball vacations/breaks', `breaks from ${sport}`);
  return note === x.note ? x : { ...x, note };
};
/** The header boxes for a sport. */
export const headerFor = (sport) => HEADER.map((h) => fixNote(sport, h));
/** The four pillars for a sport. */
export const pillarsFor = (sport) => PILLARS.map((p) => ({ ...p, groups: p.groups.map((g) => ({ ...g, ...(g.rows ? { rows: g.rows.map((r) => fixNote(sport, r)) } : {}) })) }));
/** The IPP title: the template's for BCS (Bishop's College School), the organization's own name otherwise. */
export const ippTitle = (orgName) => (!orgName || /^bcs$|college school/i.test(orgName) ? TITLE : `${orgName} - IPP`);

const ratingRows = (sport) => [...PILLARS.flatMap((p) => p.groups.flatMap((g) => g.rows || [])), ...skillsFor(sport).groups.flatMap((g) => g.rows)];

/** The template's own values (coach, province, handedness, the daily training environment 4s). */
export function templateDefaults(sport) {
  const out = {};
  HEADER.forEach((h) => { if (h.def) out[h.id] = h.def; });
  PILLARS.forEach((p) => p.groups.forEach((g) => (g.measures || []).forEach((m) => { if (m.def) out[m.id] = m.def; })));
  ratingRows(sport).forEach((r) => { if (r.def) out[r.id] = r.def; });
  return out;
}

// boxes that describe one athlete: never copied from the base IPP
const PERSONAL = new Set(['athlete', 'position', 'team', 'age', 'evalDate']);

/** The team's base IPP: the template's values with the coach's base edits on top. */
export function baseIpp(base, sport) {
  const out = { ...templateDefaults(sport), ...(base || {}) };
  PERSONAL.forEach((k) => delete out[k]);
  return out;
}

/** A new athlete IPP: the base IPP, with the athlete's name, position and team from the roster. */
export function startIpp(base, player, team) {
  const src = { name: player.name || '', position: player.position || '', team: (team && team.name) || '' };
  const out = baseIpp(base, team && team.sport);
  HEADER.forEach((h) => { if (h.from && src[h.from]) out[h.id] = src[h.from]; });
  return out;
}

/** How far along an IPP is: rating boxes filled out of all of them. */
export function ippProgress(data, sport) {
  const rows = ratingRows(sport);
  return { done: rows.filter((r) => /^[1-5]$/.test(String((data || {})[r.id] || ''))).length, total: rows.length };
}
