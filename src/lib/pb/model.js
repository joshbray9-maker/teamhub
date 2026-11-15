// Program Builder (Josh, 2026-11-15): the data model, set-box rules and templates, ported from
// the standalone prototype (program-builder-handoff/reference/app.js). Pure functions only; the
// page (pages/ProgramBuilder.jsx) holds the state and the PDF renderer (pb/pdf.js) draws it.
//
// State:   { teams: [Team] }
// Team     { key, name, folders: string[], programs: Program[] }   folders in display order
// Program  { key, id?, name, folder, days: Day[] }                  folder '' = not in a folder
// Day      { block, title, tag, sub, weeks: string[], sections: Section[], notes: string[] }
// Section  { title, rest, rows: Row[] }
// Row      { name, tempo, rest, cells: Cell[] }                      cells.length === day.weeks.length
// Cell     { rx, load }
//
// Storage: the private `programs` table (owner-only RLS). One row per program
// (data = { pb: 1, key, team, days }) plus one meta row (data = { pb: 'meta', teams }) holding the
// team tabs, their folders and each team's program order. Rows without `pb` belong to the old
// spreadsheet Programs page and are left alone.

export const META_NAME = '__program_builder__';

/* ---------- colour palettes for the sheets and the PDF (Josh, 2026-11-15) ----------
   BCS purple is the prototype's printout; Universel green uses the Universel logo's green
   (#229244) and black (#231F20). title = title bar, bar = section bars, line = thick week
   dividers + outer border, tag = the top-right tag box. Each team tab keeps its own choice;
   a team without one starts on Universel green if its name says Universel, else BCS purple. */
export const PALETTES = {
  bcs: { label: 'BCS purple', title: '#2E1250', bar: '#2E1250', line: '#2E1250', lav: '#BFAED9', sec: '#E4DCF0', alt: '#F6F2FB', grid: '#9A88B8',
    box: '#7D6A9E', gray: '#6B5A8A', setn: '#A898C4', hdrsub: '#4B3B6B', block: '#3A2E4A', tag: '#FFE500', tagFg: '#000000', tagSub: '#2E1250' },
  universel: { label: 'Universel green', title: '#231F20', bar: '#229244', line: '#231F20', lav: '#BFE0C8', sec: '#DFF1E5', alt: '#F3FAF5', grid: '#8DBB9A',
    box: '#4C8A5E', gray: '#4F6B58', setn: '#9CC4A8', hdrsub: '#2E5A3B', block: '#2F3A32', tag: '#229244', tagFg: '#FFFFFF', tagSub: '#FFFFFF' },
};
export const paletteOf = (T) => (T && PALETTES[T.palette] ? T.palette : T && /universel/i.test(T.name || '') ? 'universel' : 'bcs');
const key = () => 'k' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- prescription helpers (shared by screen + PDF), copied from the prototype ---------- */
export function shortRx(r) {
  let t = String(r || '');
  t = t.replace(/sec\/side/g, 's/side').replace(/sec\/mvmt/g, 's/mvmt').replace(/sec/g, 's');
  t = t.replace(/x ?hallway/g, 'x hall');
  t = t.replace(/(\d)\s*steps/g, '$1 steps');
  t = t.replace(/\s*attempts?/g, ' att.').replace(/ att\.\./g, ' att.');
  t = t.replace(/x\s*amrap/gi, 'x AMRAP');
  return t;
}
export function isBlocked(rx) { return /^(-|–|—|x|n\/a)$/i.test(String(rx || '').trim()); }
/** The set boxes a prescription asks for: 3x8 → 3 numbered boxes, 12,10,8 → one per target, — → blocked. */
export function setPlan(rx) {
  const r = String(rx || '').trim(); let m, n, boxes = [];
  if (isBlocked(r)) return { label: '', boxes: [], target: false, blocked: true };
  if (r.indexOf(',') >= 0) {
    r.split(',').forEach((p) => {
      p = p.trim(); if (!p) return;
      const mm = p.match(/^(\d+)\s*x\s*(.+)$/i);
      if (mm) { for (let k = 0; k < +mm[1]; k++) boxes.push(mm[2].replace(/amrap/i, 'AMRAP')); }
      else boxes.push(p.replace(/amrap/i, 'AMRAP'));
    });
    boxes = boxes.slice(0, 6);
    return { label: boxes.length + ' sets', boxes, target: true };
  }
  m = r.match(/^x?\s*(\d+)\s*attempts?/i);
  if (m) { n = Math.min(+m[1], 6); for (let i = 0; i < n; i++) boxes.push(String(i + 1)); return { label: shortRx(r), boxes, target: false }; }
  m = r.match(/^\s*(\d+)\s*x/i);
  n = m ? Math.min(+m[1], 6) : 1;
  if (n > 1) for (let i = 0; i < n; i++) boxes.push(String(i + 1)); else boxes.push('');
  return { label: shortRx(r), boxes, target: false };
}

/* ---------- templates ---------- */
export function blankRow(nw) { const c = []; for (let i = 0; i < nw; i++) c.push({ rx: '', load: '' }); return { name: '', tempo: '', rest: '', cells: c }; }
export function trainingDay(n, block) {
  return { block: block || 'IN-SEASON BLOCK', title: 'Day ' + n + ': ', tag: '', sub: '',
    weeks: ['W1', 'W2', 'W3', 'W4', 'W5'], notes: ['WALL STRETCH'],
    sections: [{ title: 'Prep + Plyos', rest: 'As needed', rows: [blankRow(5)] },
      { title: 'Main Component', rest: '', rows: [blankRow(5)] },
      { title: 'Accessories', rest: 'As needed', rows: [blankRow(5)] }] };
}
export function regenDay(block) {
  return { block: block || 'IN-SEASON BLOCK', title: 'Regen', tag: 'RECOVERY', sub: '',
    weeks: ['W1 & 2', 'W3', 'W4', 'W5'], notes: ['COOL-DOWN: ', 'ALTERNATIVES: '],
    sections: [{ title: 'Prep', rest: '', rows: [blankRow(4)] }, { title: 'Main Component', rest: '', rows: [blankRow(4)] }] };
}
export const MAX_WEEKS = 8;
export function addWeek(d) { d.weeks.push('W' + (d.weeks.length + 1)); d.sections.forEach((s) => s.rows.forEach((r) => r.cells.push({ rx: '', load: '' }))); }
export function removeWeek(d) { d.weeks.pop(); d.sections.forEach((s) => s.rows.forEach((r) => r.cells.pop())); }
export function move(arr, i, dir) { const j = i + dir; if (j < 0 || j >= arr.length) return false; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; return true; }
export function uniqueFolder(T, base) { let n = base, k = 2; while (T.folders.indexOf(n) >= 0) n = base + ' ' + k++; return n; }
export const countExercises = (days) => days.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.rows.length, 0), 0);

/* ---------- file names ---------- */
export function fileName(n) { return String(n).replace(/\s*·\s*/g, ' - ').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf'; }
export function guessName(fn) {
  let n = String(fn || '').replace(/\.pdf$/i, '').replace(/^[0-9a-f]{8}-/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = n.split(/\s-\s/); n = parts[parts.length - 1].trim();
  return n || 'Imported program';
}

/* ---------- shape: fill in anything missing so the editor can trust it ---------- */
function fixDay(d) {
  const weeks = Array.isArray(d.weeks) && d.weeks.length ? d.weeks.map(String) : ['W1'];
  return { block: d.block || '', title: d.title || '', tag: d.tag || '', sub: d.sub || '', weeks,
    notes: (d.notes || []).map(String),
    sections: (d.sections || []).map((s) => ({ title: s.title || '', rest: s.rest || '',
      rows: (s.rows || []).map((r) => ({ name: r.name || '', tempo: r.tempo || '', rest: r.rest || '',
        cells: weeks.map((_, i) => ({ rx: ((r.cells || [])[i] || {}).rx || '', load: ((r.cells || [])[i] || {}).load || '' })) })) })) };
}
export function fixProgram(p) { return { key: p.key || key(), id: p.id || null, name: p.name || 'Untitled program', folder: p.folder || '', days: (p.days || []).map(fixDay) }; }
export function newTeam(name) { return { key: key(), name, folders: [], programs: [] }; }
export function newProgram(name, folder, days) { return fixProgram({ name, folder, days }); }

/* ---------- storage rows <-> state ---------- */
export const isPbRow = (r) => !!(r && r.data && r.data.pb);
/** Builds the state from the programs table's rows. Empty when there's nothing saved yet. */
export function fromRows(rows) {
  const pb = (rows || []).filter(isPbRow);
  const meta = pb.find((r) => r.data.pb === 'meta');
  const progs = pb.filter((r) => r.data.pb !== 'meta').map((r) => ({ ...fixProgram({ ...r.data, id: r.id, name: r.name, folder: r.folder }), team: r.data.team }));
  const teams = ((meta && meta.data.teams) || []).map((t) => ({ key: t.key, name: t.name || '', ...(t.palette ? { palette: t.palette } : {}), folders: [...(t.folders || [])], order: t.order || [], programs: [] }));
  progs.forEach((p) => {
    let T = teams.find((t) => t.key === p.team);
    if (!T) { T = teams.find((t) => t.key === 'unsorted'); if (!T) teams.push(T = { key: 'unsorted', name: 'Unsorted', folders: [], order: [], programs: [] }); }
    const { team, ...prog } = p; T.programs.push(prog); // eslint-disable-line no-unused-vars
  });
  teams.forEach((T) => {
    const at = (p) => { const i = T.order.indexOf(p.key); return i < 0 ? 1e9 : i; };
    T.programs.sort((a, b) => at(a) - at(b));
    delete T.order;
  });
  return { teams, metaId: meta ? meta.id : null };
}
const progData = (T, p) => ({ pb: 1, key: p.key, team: T.key, days: p.days });
export const metaData = (state) => ({ pb: 'meta', teams: state.teams.map((T) => ({ key: T.key, name: T.name, ...(T.palette ? { palette: T.palette } : {}), folders: T.folders, order: T.programs.map((p) => p.key) })) });
/** Fingerprints of what's saved, so a save only sends what changed. */
export function fingerprint(state) {
  const out = { meta: JSON.stringify(metaData(state)), progs: {} };
  state.teams.forEach((T) => T.programs.forEach((p) => { out.progs[p.key] = JSON.stringify([p.name, p.folder, progData(T, p)]); }));
  return out;
}
/** What a save has to write: changed or new programs, programs deleted since, and the meta row. */
export function changes(state, saved) {
  const now = fingerprint(state), ups = [];
  state.teams.forEach((T) => T.programs.forEach((p) => { if (now.progs[p.key] !== (saved.progs || {})[p.key]) ups.push({ p, row: { id: p.id || undefined, name: p.name || 'Untitled program', folder: p.folder || '', data: progData(T, p) } }); }));
  const live = new Set(Object.keys(now.progs));
  const dels = Object.keys(saved.ids || {}).filter((k) => !live.has(k)).map((k) => saved.ids[k]);
  return { ups, dels, meta: now.meta !== saved.meta, fp: now };
}

/* ---------- moving programs (drag and drop), copied from the prototype ---------- */
const folderOf = (T, q) => (q.folder && T.folders.indexOf(q.folder) >= 0 ? q.folder : '');
/** Moves program `src` before/after another program, or to the end of a folder ('' = loose). Returns false if nothing changed. */
export function moveProgram(T, src, t) {
  const progs = T.programs, item = progs[src]; if (!item) return false;
  const before = JSON.stringify(progs.map((q) => [q.key, q.folder || '']));
  if (t.type === 'chip') {
    const tgt = progs[t.p]; if (!tgt || tgt === item) return false;
    progs.splice(src, 1);
    const ti = progs.indexOf(tgt); progs.splice(t.before ? ti : ti + 1, 0, item);
    item.folder = folderOf(T, tgt);
  } else {
    const folder = t.zone === '' ? '' : T.folders[+t.zone];
    progs.splice(src, 1);
    let last = -1; progs.forEach((q, i) => { if (folderOf(T, q) === folder) last = i; });
    progs.splice(last >= 0 ? last + 1 : progs.length, 0, item);
    item.folder = folder;
  }
  return JSON.stringify(progs.map((q) => [q.key, q.folder || ''])) !== before;
}
/** Moves a program to another team, keeping its folder (created there if missing). */
export function moveToTeam(state, from, i, to) {
  const p = state.teams[from].programs.splice(i, 1)[0], T = state.teams[to];
  if (p.folder && T.folders.indexOf(p.folder) < 0) T.folders.push(p.folder);
  T.programs.push(p); return T.programs.length - 1;
}

/* ---------- loading Josh's backup file (program-builder-data.json) ----------
   Teams are grouped the way Josh asked (2026-11-15): BCS Hockey 26-27 (U16 + U18), BCS
   Basketball (prep + varsity), Universel Hockey (U18, Prem, NCDC Québec, NCDC Vermont: the
   prototype's "Universel Hockey NCDC" and "Universel U18/PREM" tabs together) and Bishop's Men's
   Rugby (the prototype's "BU Men's Rugby"). Safe to run twice: a program already in that team
   under the same name is skipped. */
export const TEAM_MAP = { 'Universel Hockey NCDC': 'Universel Hockey', 'Universel U18/PREM': 'Universel Hockey', "BU Men's Rugby": "Bishop's Men's Rugby" };
export function mergeBackup(state, backup) {
  const src = backup && Array.isArray(backup.teams) ? backup.teams : null;
  if (!src) throw new Error('That file isn’t a Program Builder backup (no teams in it).');
  const added = [], skipped = [];
  src.forEach((bt) => {
    const name = TEAM_MAP[bt.name] || bt.name;
    let T = state.teams.find((t) => t.name === name);
    if (!T) state.teams.push(T = newTeam(name));
    (bt.folders || []).forEach((f) => { if (T.folders.indexOf(f) < 0) T.folders.push(f); });
    (bt.programs || []).forEach((p) => {
      if (T.programs.some((q) => q.name === p.name)) { skipped.push(`${name} → ${p.name}`); return; }
      const folder = p.folder && T.folders.indexOf(p.folder) < 0 ? (T.folders.push(p.folder), p.folder) : p.folder || '';
      T.programs.push(newProgram(p.name, folder, clone(p.days || []))); added.push(`${name} → ${p.name}`);
    });
  });
  return { added, skipped };
}
/** A plain copy of the state in the backup file's shape (for a download or a check). */
export const toBackup = (state) => ({ teams: state.teams.map((T) => ({ name: T.name, folders: [...T.folders], programs: T.programs.map((p) => ({ name: p.name, ...(p.folder ? { folder: p.folder } : {}), days: clone(p.days) })) })) });
