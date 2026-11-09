// Programs: the spreadsheet behind each program sheet (one training day), kept as plain data so the
// page, autosave and print all work from the same object. Every function returns a new sheet.
//   sheet = { id, name, orient: 'landscape' | 'portrait', widths: [px], rows: [[cell | null]], merges: [{ r, c, rs, cs }] }
//   cell  = { v: text, b: bold, i: italic, a: 'l' | 'c' | 'r', f: fill key, s: font size (pt), nb: no borders }
import { uid } from './util.js';

export const FILLS = { '': null, g: '#e9e9e9', d: '#3a3a3a', y: '#fff2b3', gr: '#d9f0d3', bl: '#d6e6f7', r: '#f8d7d3' };
export const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20];
export const BASE_SIZE = 10;
export const MIN_W = 28;
// US Letter, 0.4in margins, in CSS px (96 per inch)
export const PAGE = { landscape: { w: 10.2 * 96, h: 7.7 * 96 }, portrait: { w: 7.7 * 96, h: 10.2 * 96 } };

export function colName(i) { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

const row = (n) => Array.from({ length: n }, () => null);
export function blank(nr = 30, nc = 9, name = 'Day 1') {
  return { id: uid(), name, orient: 'landscape', widths: [240, ...row(nc - 1).map(() => 90)], rows: Array.from({ length: nr }, () => row(nc)), merges: [] };
}

/** The layout of Josh's in-season program sheets: title block, week/load columns, sections, recovery box. */
export function template(name = 'Day 1') {
  const sh = blank(0, 9, name);
  sh.widths = [250, 82, 82, 82, 82, 82, 92, 108, 100];
  const put = (cells) => sh.rows.push(row(9).map((_, c) => (cells[c] === undefined ? null : typeof cells[c] === 'string' ? { v: cells[c] } : cells[c])));
  const H = (v, a = 'c') => ({ v, b: true, s: 16, a, nb: true });
  const hd = (v) => ({ v, b: true, a: 'c', f: 'g' });
  put({ 0: H('PHASE\nWeeks'), 1: H('Day 1: Session (GD-)'), 7: H('Group\nTeam') }); put({});
  sh.merges.push({ r: 0, c: 0, rs: 2, cs: 1 }, { r: 0, c: 1, rs: 2, cs: 6 }, { r: 0, c: 7, rs: 2, cs: 2 });
  put(['EXERCISE(S)', 'W1', 'Load', 'W2', 'Load', 'W3', 'Load', 'Height / LBS', 'Rest'].map(hd));
  for (let i = 0; i < 7; i++) put({});
  const section = (v) => { put({ 0: hd(v) }); sh.merges.push({ r: sh.rows.length - 1, c: 0, rs: 1, cs: 9 }); };
  section('Strength work');
  for (let i = 0; i < 4; i++) put({ 0: { v: '', b: true } });
  section('Pre-hab work');
  for (let i = 0; i < 4; i++) put({});
  const lim = sh.rows.length;
  put({ 0: hd('Limited athletes (no squat / press)'), 4: hd('Recovery') });
  sh.merges.push({ r: lim, c: 0, rs: 1, cs: 4 }, { r: lim, c: 4, rs: 1, cs: 5 });
  for (let i = 0; i < 3; i++) put({ 4: { v: '', nb: true }, 5: { v: '', nb: true }, 6: { v: '', nb: true }, 7: { v: '', nb: true }, 8: { v: '', nb: true } });
  const last = sh.rows.length - 1;
  sh.rows[last][7] = { v: 'All rights reserved ETX Training inc.', s: 6, a: 'r', nb: true }; sh.rows[last][8] = { v: '', nb: true };
  sh.merges.push({ r: last, c: 7, rs: 1, cs: 2 });
  return sh;
}

export const ncols = (sh) => sh.widths.length;
export const cellAt = (sh, r, c) => (sh.rows[r] && sh.rows[r][c]) || null;
export const textAt = (sh, r, c) => { const x = cellAt(sh, r, c); return x ? x.v || '' : ''; };

/** The merge whose box holds (r, c), or null. */
export function mergeAt(sh, r, c) { return sh.merges.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs) || null; }
/** "r,c" of every cell hidden under another cell's merge. */
export function hiddenCells(sh) {
  const s = new Set();
  sh.merges.forEach((m) => { for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) s.add(r + ',' + c); });
  return s;
}

/** A range from two corners, grown until no merge sticks out of it. */
export function rangeOf(a, b, sh) {
  let r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r), c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c);
  for (let grew = true; grew && sh;) {
    grew = false;
    for (const m of sh.merges) {
      if (m.r > r1 || m.r + m.rs - 1 < r0 || m.c > c1 || m.c + m.cs - 1 < c0) continue;
      const n = [Math.min(r0, m.r), Math.max(r1, m.r + m.rs - 1), Math.min(c0, m.c), Math.max(c1, m.c + m.cs - 1)];
      if (n[0] !== r0 || n[1] !== r1 || n[2] !== c0 || n[3] !== c1) { [r0, r1, c0, c1] = n; grew = true; }
    }
  }
  return { r0, r1, c0, c1 };
}

const copy = (sh) => ({ ...sh, widths: [...sh.widths], rows: sh.rows.map((x) => [...x]), merges: sh.merges.map((m) => ({ ...m })) });
const isEmpty = (x) => !x || Object.keys(x).every((k) => (k === 'v' ? !x.v : !x[k]));

/** Grow the grid so (r, c) exists. */
export function ensure(sh, r, c) {
  const out = copy(sh);
  while (out.widths.length <= c) { out.widths.push(90); out.rows.forEach((x) => x.push(null)); }
  while (out.rows.length <= r) out.rows.push(row(out.widths.length));
  return out;
}

/** Change every cell in a range: fn(cell) returns the new cell (or null to empty it). */
export function updateRange(sh, rg, fn) {
  const out = copy(sh);
  for (let r = rg.r0; r <= rg.r1; r++) for (let c = rg.c0; c <= rg.c1; c++) {
    const n = fn({ ...(out.rows[r][c] || { v: '' }) }, r, c);
    out.rows[r][c] = isEmpty(n) ? null : n;
  }
  return out;
}
export const setText = (sh, r, c, v) => updateRange(sh, { r0: r, r1: r, c0: c, c1: c }, (x) => ({ ...x, v }));
export const clearText = (sh, rg) => updateRange(sh, rg, (x) => ({ ...x, v: '' }));
/** Turn a style on or off across a range: on when any cell in it doesn't have it yet. */
export function toggle(sh, rg, key) {
  let all = true;
  for (let r = rg.r0; r <= rg.r1; r++) for (let c = rg.c0; c <= rg.c1; c++) if (!(cellAt(sh, r, c) || {})[key]) all = false;
  return updateRange(sh, rg, (x) => ({ ...x, [key]: !all }));
}
export const setStyle = (sh, rg, key, val) => updateRange(sh, rg, (x) => ({ ...x, [key]: val }));

export function merge(sh, rg) {
  const out = copy(sh);
  out.merges = out.merges.filter((m) => m.r > rg.r1 || m.r + m.rs - 1 < rg.r0 || m.c > rg.c1 || m.c + m.cs - 1 < rg.c0);
  if (rg.r1 > rg.r0 || rg.c1 > rg.c0) {
    out.merges.push({ r: rg.r0, c: rg.c0, rs: rg.r1 - rg.r0 + 1, cs: rg.c1 - rg.c0 + 1 });
    // like Excel, only the top-left cell keeps its text
    let first = null;
    for (let r = rg.r0; r <= rg.r1 && first === null; r++) for (let c = rg.c0; c <= rg.c1; c++) if (textAt(out, r, c)) { first = textAt(out, r, c); break; }
    for (let r = rg.r0; r <= rg.r1; r++) for (let c = rg.c0; c <= rg.c1; c++) if (r !== rg.r0 || c !== rg.c0) out.rows[r][c] = null;
    out.rows[rg.r0][rg.c0] = { ...(out.rows[rg.r0][rg.c0] || {}), v: first || '' };
  }
  return out;
}
export function unmerge(sh, rg) {
  return { ...copy(sh), merges: sh.merges.filter((m) => m.r > rg.r1 || m.r + m.rs - 1 < rg.r0 || m.c > rg.c1 || m.c + m.cs - 1 < rg.c0).map((m) => ({ ...m })) };
}

// inserting or deleting lines moves merges with them: a merge across the edit grows or shrinks
function shiftMerges(merges, axis, at, n) {
  const [p, s] = axis === 'r' ? ['r', 'rs'] : ['c', 'cs'];
  return merges.map((m) => {
    const a = m[p], b = m[p] + m[s] - 1;
    if (n > 0) return at <= a ? { ...m, [p]: a + n } : at <= b ? { ...m, [s]: m[s] + n } : m;
    const d0 = at, d1 = at - n - 1;                       // deleted lines d0..d1
    if (d1 < a) return { ...m, [p]: a + n };
    if (d0 > b) return m;
    const keep = m[s] - (Math.min(b, d1) - Math.max(a, d0) + 1);
    return keep > 0 ? { ...m, [p]: Math.min(a, d0), [s]: keep } : null;
  }).filter((m) => m && m.rs * m.cs > 1);
}
export function insertRows(sh, at, n = 1) {
  const out = copy(sh); out.rows.splice(at, 0, ...Array.from({ length: n }, () => row(ncols(sh))));
  out.merges = shiftMerges(out.merges, 'r', at, n); return out;
}
export function deleteRows(sh, r0, r1) {
  const out = copy(sh); out.rows.splice(r0, r1 - r0 + 1);
  if (!out.rows.length) out.rows.push(row(ncols(sh)));
  out.merges = shiftMerges(out.merges, 'r', r0, -(r1 - r0 + 1)); return out;
}
export function insertCols(sh, at, n = 1) {
  const out = copy(sh); out.widths.splice(at, 0, ...Array.from({ length: n }, () => 90));
  out.rows.forEach((x) => x.splice(at, 0, ...row(n)));
  out.merges = shiftMerges(out.merges, 'c', at, n); return out;
}
export function deleteCols(sh, c0, c1) {
  if (c1 - c0 + 1 >= ncols(sh)) return sh;               // always keep one column
  const out = copy(sh); out.widths.splice(c0, c1 - c0 + 1);
  out.rows.forEach((x) => x.splice(c0, c1 - c0 + 1));
  out.merges = shiftMerges(out.merges, 'c', c0, -(c1 - c0 + 1)); return out;
}
export function setWidth(sh, c, w) { const out = copy(sh); out.widths[c] = Math.max(MIN_W, Math.round(w)); return out; }

/** Copy the top row of a range down through the rest of it (Ctrl/Cmd+D). */
export function fillDown(sh, rg) {
  return updateRange(sh, { ...rg, r0: rg.r0 + 1 }, (_, r, c) => (cellAt(sh, rg.r0, c) ? { ...cellAt(sh, rg.r0, c) } : null));
}

/* ---------- clipboard: tab-separated text, the format Excel and Google Sheets copy ---------- */
export function toTSV(sh, rg) {
  const q = (v) => (/[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const out = [];
  for (let r = rg.r0; r <= rg.r1; r++) { const l = []; for (let c = rg.c0; c <= rg.c1; c++) l.push(q(textAt(sh, r, c))); out.push(l.join('\t')); }
  return out.join('\n');
}
export function parseTSV(text) {
  const rows = [[]]; let cur = '', i = 0, quoted = false;
  const s = String(text || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i++; continue; }
      cur += ch; i++; continue;
    }
    if (ch === '"' && cur === '') { quoted = true; i++; continue; }
    if (ch === '\t') { rows[rows.length - 1].push(cur); cur = ''; i++; continue; }
    if (ch === '\n') { rows[rows.length - 1].push(cur); cur = ''; rows.push([]); i++; continue; }
    cur += ch; i++;
  }
  rows[rows.length - 1].push(cur);
  return rows;
}
/** Paste a block at (r, c). `cells` (from a copy inside Programs) keeps styles; text alone keeps the target's styles. */
export function paste(sh, r, c, text, cells) {
  const m = cells || parseTSV(text).map((l) => l.map((v) => ({ v })));
  const h = m.length, w = Math.max(...m.map((l) => l.length));
  let out = ensure(sh, r + h - 1, c + w - 1);
  out = unmerge(out, { r0: r, r1: r + h - 1, c0: c, c1: c + w - 1 });
  return updateRange(out, { r0: r, r1: r + h - 1, c0: c, c1: c + w - 1 }, (x, rr, cc) => {
    const src = (m[rr - r] || [])[cc - c];
    if (src === undefined) return x;
    return cells ? (src ? { ...src } : null) : { ...x, v: src.v };
  });
}
export function cellsOf(sh, rg) {
  const out = [];
  for (let r = rg.r0; r <= rg.r1; r++) { const l = []; for (let c = rg.c0; c <= rg.c1; c++) l.push(cellAt(sh, r, c) ? { ...cellAt(sh, r, c) } : null); out.push(l); }
  return out;
}

/** Drop empty trailing rows and columns before printing (styled cells count as used). */
export function usedSize(sh) {
  let nr = 0, nc = 0;
  sh.rows.forEach((x, r) => x.forEach((cell, c) => { if (cell) { nr = Math.max(nr, r + 1); nc = Math.max(nc, c + 1); } }));
  sh.merges.forEach((m) => { nr = Math.max(nr, m.r + m.rs); nc = Math.max(nc, m.c + m.cs); });
  return { nr: Math.max(nr, 1), nc: Math.max(nc, 1) };
}
/** The zoom that makes a w × h table fill the page width without running off the bottom. */
export function fitZoom(w, h, orient = 'landscape') {
  const p = PAGE[orient] || PAGE.landscape;
  return Math.min(p.w / w, p.h / h);
}

export function newProgram(name = 'Untitled program') { return { name, folder: '', data: { sheets: [template()] } }; }
