// File imports for S&C plans, game-day lines and Data Center tables, plus blank CSV templates.
// Pure functions over rows of cells (rows[0] = headings), shared by the CSV and PDF paths.
// Nothing here talks to the backend; every import is shown for review before it's saved.
import { nameKey } from './rosterImport.js';
import { mondayOf } from './sc.js';
import { toISO } from './injury.js';

const hkey = (h) => String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/#/g, 'no').replace(/[^a-z0-9]/g, '');
const pick = (syn) => (h) => { const k = hkey(h); for (const [f, l] of Object.entries(syn)) if (l.includes(k)) return f; return null; };

/** Blank CSV with just the headings (and optional skeleton rows), downloaded by the browser. */
export function downloadCsv(filename, rows) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Text copied from Excel, Numbers or Google Sheets: tab-separated rows; a cell that holds a
 *  line break or tab comes wrapped in quotes. */
export function parseTsv(text) {
  text = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const rows = []; let row = [], cell = '', q = false, start = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && start) { q = true; start = false; continue; }
    start = false;
    if (c === '\t') { row.push(cell); cell = ''; start = true; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; start = true; }
    else cell += c;
  }
  row.push(cell); rows.push(row);
  return rows;
}
export const ROSTER_TEMPLATE = [['Number', 'Name', 'Position', 'Shoots', 'Year', 'Height', 'Weight', 'Hometown']];
export const INJURY_TEMPLATE = [['Player', 'Number', 'Injury', 'Area', 'Side', 'Status', 'Injury date', 'Return to practice', 'Return to play', 'Limitations', 'Notes']];

/* ---------- S&C plan ---------- */
const SC_SYN = {
  date: ['date', 'day', 'jour', 'sessiondate'], theme: ['theme', 'session', 'workout', 'focus', 'activity', 'seance', 'training', 'plan'],
  intensity: ['intensity', 'level', 'load', 'colour', 'color', 'intensite', 'charge'], note: ['note', 'notes', 'comment', 'comments', 'remarque'],
  phase: ['phase', 'block', 'cycle', 'periodization', 'periodisation', 'mesocycle'], week: ['week', 'seasonweek', 'wk', 'semaine', 'weekno'],
};
export const scField = pick(SC_SYN);
export const SC_TEMPLATE = [['Date', 'Theme', 'Intensity', 'Note', 'Phase', 'Week']];
export function intensityFromText(s) {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return '';
  if (/^(off|rest|repos|o|none|0)$/.test(t)) return 'off';
  if (/^(l|light|low|easy|green|leger|faible|1)$/.test(t)) return 'light';
  if (/^(m|mod|moderate|medium|med|orange|modere|moyen|2)$/.test(t)) return 'moderate';
  if (/^(h|heavy|high|hard|red|eleve|lourd|intense|3)$/.test(t)) return 'heavy';
  if (/^(g|game|match|gameday|yellow|partie)$/.test(t)) return 'game';
  return null; // unknown: kept unrated and reported
}
/** → { days: {date: {theme, intensity, note}}, weeks: {monday: {phase, week}}, unknown: [values], skipped } */
export function rowsToSc(rows) {
  const map = (rows[0] || []).map(scField);
  if (!map.includes('date')) throw new Error('No Date column found. The first row should be headings like Date, Theme, Intensity.');
  const days = {}, weeks = {}, unknown = new Set(); let skipped = 0;
  for (const r of rows.slice(1)) {
    const x = {}; map.forEach((f, i) => { if (f && x[f] === undefined) x[f] = String(r[i] || '').trim(); });
    const date = toISO(x.date); if (!date) { if (Object.values(x).some(Boolean)) skipped++; continue; }
    let k = intensityFromText(x.intensity); if (k === null) { unknown.add(x.intensity); k = ''; }
    if (x.theme || k || x.note) days[date] = { theme: (x.theme || '').slice(0, 120), intensity: k, ...(x.note ? { note: x.note.slice(0, 500) } : {}) };
    if (x.phase || x.week) { const mk = mondayOf(date); weeks[mk] = { phase: (x.phase || (weeks[mk] || {}).phase || '').slice(0, 80), week: (x.week || (weeks[mk] || {}).week || '').slice(0, 20) }; }
  }
  return { days, weeks, unknown: [...unknown], skipped };
}

/* ---------- game-day lines (hockey) ---------- */
// Two layouts are read:
//   long : Line, Position, Number, Player    e.g. F1, LW, 12, A. Player
//   grid : Line, LW, C, RW (or LD, RD / G1, G2 / PP positions) with the player in each cell
const LINE_SYN = { line: ['line', 'unit', 'trio', 'pair', 'group', 'ligne'], position: ['position', 'pos', 'spot', 'role'], num: ['no', 'num', 'number', 'jersey', 'numero'], player: ['player', 'name', 'playername', 'joueur', 'athlete'] };
export const lineField = (h) => pick(LINE_SYN)(h) || (posKey(h) ? 'pos:' + posKey(h) : null);
function posKey(h) {
  const k = hkey(h);
  return ({ lw: 'LW', leftwing: 'LW', c: 'C', center: 'C', centre: 'C', rw: 'RW', rightwing: 'RW', ld: 'LD', l: 'LD', leftd: 'LD', leftdefence: 'LD', leftdefense: 'LD', rd: 'RD', r: 'RD', rightd: 'RD', rightdefence: 'RD', rightdefense: 'RD',
    g: 'G', goalie: 'G', g1: 'G1', starter: 'G1', starting: 'G1', g2: 'G2', backup: 'G2', f: 'F', f1: 'F1', f2: 'F2', forward: 'F' })[k] || null;
}
/** "F1", "Line 2", "D pair 3", "PP1", "PK 2", "G", "Extras" → unit code ('F1'..'F4', 'D1'..'D3', 'PP1', 'PP2', 'PK1', 'PK2', 'G', 'X') */
export function unitKey(s, pos) {
  const t = String(s || '').toLowerCase().replace(/\s+/g, ''); const n = (t.match(/\d/) || [])[0];
  if (/^pp|powerplay|avantage/.test(t)) return n && +n <= 2 ? 'PP' + n : null;
  if (/^pk|penaltykill|desavantage|infer/.test(t)) return n && +n <= 2 ? 'PK' + n : null;
  if (/^(g|goal|goalie|goalies|gardien)/.test(t)) return 'G';
  if (/^(x|extra|scratch|spare|res)/.test(t)) return 'X';
  if (/^d|pair|def/.test(t)) return n && +n <= 3 ? 'D' + n : null;
  if (/^(f|l|line|fwd|forward|trio)/.test(t) || (n && /^(LW|C|RW)$/.test(pos || ''))) return n && +n <= 4 ? 'F' + n : null;
  if (n && /^(LD|RD)$/.test(pos || '')) return +n <= 3 ? 'D' + n : null;
  return null;
}
/** Slot id for a unit + position, e.g. ('F1','LW') → 'F1LW', ('D2','LD') → 'D2L', ('G','G2') → 'G2'. `next` numbers repeat spots (PK forwards, extras). */
function slotFor(unit, pos, next) {
  if (!unit) return null;
  if (unit === 'G') return pos === 'G2' ? 'G2' : pos === 'G1' ? 'G1' : next('G');
  if (unit === 'X') return next('X');
  if (/^F\d$/.test(unit)) return /^(LW|C|RW)$/.test(pos) ? unit + pos : null;
  if (/^D\d$/.test(unit)) return pos === 'LD' ? unit + 'L' : pos === 'RD' ? unit + 'R' : null;
  if (/^PP\d$/.test(unit)) return /^(LW|C|RW|LD|RD)$/.test(pos) ? unit + pos : null;
  if (/^PK\d$/.test(unit)) return /^(LD|RD)$/.test(pos) ? unit + pos : /^(F|F1|F2|LW|C|RW)$/.test(pos) ? next(unit + 'F') : null;
  return null;
}
const LIMIT = { G: 2, X: 4 };
/** → { slots, filled, unmatched: [names typed but not on the roster], skipped } */
export function rowsToSlots(rows, roster) {
  const head = rows[0] || []; const map = head.map(lineField);
  const byName = new Map(roster.map((p) => [nameKey(p.name), p])), byNum = new Map(roster.filter((p) => p.num).map((p) => [p.num, p]));
  const used = {}; const next = (prefix) => { const max = /^PK\dF$/.test(prefix) ? 2 : LIMIT[prefix] || 1; for (let i = 1; i <= max; i++) { const id = prefix + i; if (!used[id]) return id; } return null; };
  const slots = {}, unmatched = []; let skipped = 0;
  const who = (cell, numCell) => {
    let s = String(cell || '').trim(), num = String(numCell || '').trim().replace(/^#/, '');
    const m = s.match(/^#?(\d{1,3})\s+(.+)$/); if (m && !num) { num = m[1]; s = m[2]; }
    if (/^#?\d{1,3}$/.test(s) && !num) { num = s.replace('#', ''); s = ''; }
    if (!s && !num) return null;
    const p = (s && byName.get(nameKey(s))) || (num && byNum.get(num));
    if (p) return { pid: p.id, num: p.num, name: p.name };
    if (s) unmatched.push(s);
    return s ? { num, name: s.slice(0, 40) } : null;
  };
  const put = (id, p) => { if (!id || !p) { skipped++; return; } used[id] = true; slots[id] = p; };
  const iLine = map.indexOf('line'), iPos = map.indexOf('position');
  if (iLine < 0) throw new Error('No Line column found. Use headings like Line, Position, Number, Player, or Line, LW, C, RW.');
  if (iPos >= 0) { // long layout
    for (const r of rows.slice(1)) {
      const pos = posKey(r[iPos]) || ''; const unit = unitKey(r[iLine], pos);
      const p = who(r[map.indexOf('player')], r[map.indexOf('num')]); if (!p) continue;
      put(slotFor(unit, pos, next), p);
    }
  } else { // grid layout: each position column holds a player
    for (const r of rows.slice(1)) {
      map.forEach((f, i) => {
        if (!f || !f.startsWith('pos:')) return;
        const pos = f.slice(4); const unit = unitKey(r[iLine], pos); const p = who(r[i]); if (!p) return;
        put(slotFor(unit, pos, next), p);
      });
    }
  }
  return { slots, filled: Object.keys(slots).length, unmatched: [...new Set(unmatched)], skipped };
}
export const LINES_TEMPLATE = [['Line', 'Position', 'Number', 'Player'],
  ...[1, 2, 3, 4].flatMap((n) => ['LW', 'C', 'RW'].map((p) => [`F${n}`, p, '', ''])),
  ...[1, 2, 3].flatMap((n) => ['LD', 'RD'].map((p) => [`D${n}`, p, '', ''])),
  ['G', 'G1', '', ''], ['G', 'G2', '', ''], ...[1, 2, 3, 4].map(() => ['Extra', '', '', '']),
  ...[1, 2].flatMap((n) => ['LW', 'C', 'RW', 'LD', 'RD'].map((p) => [`PP${n}`, p, '', ''])),
  ...[1, 2].flatMap((n) => ['F', 'F', 'LD', 'RD'].map((p) => [`PK${n}`, p, '', '']))];

/* ---------- Data Center tables ---------- */
/** A heading cell: short text with a letter (numbers and long sentences aren't headings). */
export const anyHeading = (s) => { const t = String(s || '').trim(); return t.length > 0 && t.length <= 40 && /[A-Za-zÀ-ÿ]/.test(t) && !/^\d+([.,]\d+)?$/.test(t); };
/** Trims a table to its useful size: no empty rows/columns, at most 2000 rows × 60 columns. */
export function tidyTable(rows) {
  const r = rows.filter((x) => x.some((c) => String(c || '').trim())).slice(0, 2001).map((x) => x.slice(0, 60).map((c) => String(c ?? '').trim().slice(0, 200)));
  const width = Math.max(0, ...r.map((x) => x.length));
  const keep = [...Array(width).keys()].filter((i) => r.some((x) => x[i]));
  return r.map((x) => keep.map((i) => x[i] || ''));
}
