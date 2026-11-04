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

const ratingRows = () => [...PILLARS.flatMap((p) => p.groups.flatMap((g) => g.rows || [])), ...BASKETBALL.groups.flatMap((g) => g.rows)];

/** The template's own values (coach, province, handedness, the daily training environment 4s). */
export function templateDefaults() {
  const out = {};
  HEADER.forEach((h) => { if (h.def) out[h.id] = h.def; });
  PILLARS.forEach((p) => p.groups.forEach((g) => (g.measures || []).forEach((m) => { if (m.def) out[m.id] = m.def; })));
  ratingRows().forEach((r) => { if (r.def) out[r.id] = r.def; });
  return out;
}

// boxes that describe one athlete: never copied from the base IPP
const PERSONAL = new Set(['athlete', 'position', 'team', 'age', 'evalDate']);

/** The team's base IPP: the template's values with the coach's base edits on top. */
export function baseIpp(base) {
  const out = { ...templateDefaults(), ...(base || {}) };
  PERSONAL.forEach((k) => delete out[k]);
  return out;
}

/** A new athlete IPP: the base IPP, with the athlete's name, position and team from the roster. */
export function startIpp(base, player, team) {
  const src = { name: player.name || '', position: player.position || '', team: (team && team.name) || '' };
  const out = baseIpp(base);
  HEADER.forEach((h) => { if (h.from && src[h.from]) out[h.id] = src[h.from]; });
  return out;
}

/** How far along an IPP is: rating boxes filled out of all of them. */
export function ippProgress(data) {
  const rows = ratingRows();
  return { done: rows.filter((r) => /^[1-5]$/.test(String((data || {})[r.id] || ''))).length, total: rows.length };
}
