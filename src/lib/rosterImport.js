// Roster import: turns a CSV file or the text of a PDF roster into player rows the coach
// reviews before saving. Pure functions; nothing here talks to the backend.
// Only the roster fields TeamHub keeps are read. A date of birth is reduced to its year, and
// unrecognised columns (phone, email, medical notes...) are dropped, never stored.

const SYN = {
  num: ['no', 'num', 'number', 'jersey', 'jerseyno', 'jerseynumber', 'numero', 'nº', 'n'],
  name: ['name', 'player', 'playername', 'fullname', 'nom', 'joueur', 'athlete', 'athletename', 'athletes', 'nomathlete'],
  first: ['first', 'firstname', 'givenname', 'prenom'],
  last: ['last', 'lastname', 'surname', 'familyname', 'nomdefamille'],
  position: ['pos', 'position', 'positions', 'poste'],
  shoots: ['shoots', 'shot', 'catches', 'sc', 'shootscatches', 'handedness', 'hand', 'lance', 'tir'],
  year: ['year', 'yr', 'birthyear', 'yob', 'born', 'dob', 'birthdate', 'dateofbirth', 'class', 'grade', 'eligibility', 'annee', 'naissance', 'academicyear', 'yearinschool', 'cl', 'anneeacademique'],
  height: ['height', 'ht', 'taille'],
  weight: ['weight', 'wt', 'poids'],
  hometown: ['hometown', 'hometownpreviousschool', 'city', 'from', 'birthplace', 'ville', 'home'],
};
export const FIELDS = ['num', 'name', 'position', 'shoots', 'year', 'height', 'weight', 'hometown'];
const key = (h) => String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/#/g, 'no').replace(/[^a-z0-9º]/g, '');
export function fieldFor(header) {
  const k = key(header); if (!k) return null;
  for (const [f, list] of Object.entries(SYN)) if (list.includes(k)) return f;
  if (/^(jersey|number)/.test(k)) return 'num';
  if (/^hometown/.test(k)) return 'hometown';
  return null;
}

/* ---------- CSV ---------- */
export function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** rows[0] is the header. Returns { players, columns: {header: field|null}, skipped } */
export function rowsToPlayers(rows, source = 'csv') {
  if (!rows.length) return { players: [], columns: {}, skipped: 0 };
  const head = rows[0]; const map = head.map(fieldFor);
  const columns = Object.fromEntries(head.map((h, i) => [h, map[i]]));
  if (!map.some((f) => f === 'name' || f === 'last' || f === 'first')) throw new Error('No name column found. The first row should be headings like Number, Name, Position.');
  const players = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    const raw = {}; map.forEach((f, i) => { if (f && raw[f] === undefined) raw[f] = (r[i] || '').trim(); });
    const p = clean(raw, source); if (p) players.push(p); else skipped++;
  }
  return { players, columns, skipped };
}

/** Normalise one player's raw fields; null when there's no usable name. */
export function clean(raw, source) {
  let name = raw.name || [raw.first, raw.last].filter(Boolean).join(' ');
  name = String(name || '').replace(/[+*†‡]/g, ' '); // league markers after a name ("Smith +")
  name = String(name || '').replace(/\s+/g, ' ').trim();
  const m = name.match(/^([^,]+),\s*([^,]+)$/); if (m) name = `${m[2]} ${m[1]}`; // "Last, First"
  if (!name || name.length > 80 || !/[a-zA-Zà-ÿÀ-ß]/.test(name)) return null;
  const num = String(raw.num || '').replace(/^#/, '').trim();
  const sh = String(raw.shoots || '').trim().toUpperCase();
  const year = String(raw.year || '').trim();
  const yy = year.match(/\b(19|20)\d{2}\b/);
  return {
    num: /^\d{1,3}$/.test(num) ? num : '',
    name,
    position: String(raw.position || '').trim().slice(0, 30),
    shoots: sh.startsWith('L') || sh.startsWith('G') ? 'L' : sh.startsWith('R') || sh.startsWith('D') ? 'R' : '',
    // a full date only keeps its year; "Senior", "Gr. 11", "2008" are kept as typed
    year: (/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(year) && yy ? yy[0] : year).slice(0, 20),
    height: String(raw.height || '').trim().slice(0, 12),
    weight: String(raw.weight || '').trim().slice(0, 12),
    // "Hometown / High School" columns: keep the town only
    hometown: String(raw.hometown || '').split(' / ')[0].trim().slice(0, 80),
    source,
  };
}

/* ---------- PDF ---------- */
/** items: [{str, x, y}] from one or more pages (y grows downward; pages offset).
 *  Groups text into rows, finds a heading row and splits the rest into its columns.
 *  Without headings, reads "number name position" lines. */
export function pdfItemsToPlayers(items) {
  const rows = [];
  for (const it of [...items].filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const r = rows.find((x) => Math.abs(x.y - it.y) < 3);
    if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
  const hi = rows.findIndex((r) => { const f = r.items.map((i) => fieldFor(i.str)); return f.some((x) => x === 'name' || x === 'last' || x === 'first') && f.filter(Boolean).length >= 2; });
  const players = []; let skipped = 0;
  if (hi >= 0) {
    const cols = rows[hi].items.map((i) => ({ x: i.x, f: fieldFor(i.str) }));
    for (const r of rows.slice(hi + 1)) {
      const raw = {};
      for (const it of r.items) {
        // the column whose heading starts closest to the left of this text (small slack for centred numbers)
        let c = null; for (const col of cols) if (col.x <= it.x + 12 && (!c || col.x > c.x)) c = col;
        if (!c) c = cols[0];
        if (c.f) raw[c.f] = raw[c.f] ? raw[c.f] + ' ' + it.str.trim() : it.str.trim();
      }
      if (fieldFor(r.items[0].str) && r.items.filter((i) => fieldFor(i.str)).length >= 2) continue; // repeated heading on a new page
      const p = clean(raw, 'pdf'); if (p) players.push(p); else skipped++;
    }
    return { players, skipped, headings: true };
  }
  for (const r of rows) {
    const line = r.items.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ');
    const m = line.match(/^#?(\d{1,3})\s+(.+?)(?:\s+(LW|RW|C|F|D|G|LD|RD|W|PG|SG|SF|PF))?$/);
    if (!m) { skipped++; continue; }
    const p = clean({ num: m[1], name: m[2], position: m[3] || '' }, 'pdf'); if (p) players.push(p); else skipped++;
  }
  return { players, skipped, headings: false };
}

/** Any PDF table: finds the first row where at least two cells are headings `fieldFn` knows,
 *  and returns [heading cells, ...row cells] with each text placed under its column.
 *  null when no heading row is found. */
export function pdfItemsToTable(items, fieldFn) {
  const rows = [];
  for (const it of [...items].filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const r = rows.find((x) => Math.abs(x.y - it.y) < 3);
    if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
  const isHead = (r) => r.items.filter((i) => fieldFn(i.str)).length >= 2;
  const hi = rows.findIndex(isHead); if (hi < 0) return null;
  const cols = rows[hi].items.map((i) => i.x);
  const out = [rows[hi].items.map((i) => i.str.trim())];
  for (const r of rows.slice(hi + 1)) {
    if (isHead(r)) continue; // repeated heading on a new page
    const cells = cols.map(() => '');
    for (const it of r.items) {
      let c = 0; cols.forEach((x, k) => { if (x <= it.x + 12) c = k; });
      cells[c] = cells[c] ? cells[c] + ' ' + it.str.trim() : it.str.trim();
    }
    out.push(cells);
  }
  return out;
}

/* ---------- web page tables ---------- */
/** tables: [[cells], ...] per table (from the roster-import function). Uses the table whose
 *  heading row (one of its first three rows) gives the most players. */
export function tablesToPlayers(tables) {
  let best = null;
  for (const rows of tables || []) {
    for (let h = 0; h < Math.min(3, rows.length); h++) {
      let r; try { r = rowsToPlayers(rows.slice(h), 'web'); } catch { continue; }
      if (r.players.length && (!best || r.players.length > best.players.length)) best = r;
      break;
    }
  }
  if (!best) throw new Error('No roster table found on that page (it needs a table with a Name column). If the site builds its roster with JavaScript or blocks automated reads, save the roster as a PDF and import that instead.');
  return best;
}

/** Matches imported players to the current roster by name (case/accents ignored). */
export const nameKey = (n) => key(n);

// a name's words, lowercased without accents or punctuation ("O'Neil-Smith" → ["oneil", "smith"])
const words = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[+*†‡]/g, '').split(/[\s-]+/).map((w) => w.replace(/[^a-z]/g, '')).filter(Boolean);
// edit distance (with swapped letters) up to 2; 3 means "more than 2"
function dist(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return Math.min(d[a.length][b.length], 3);
}
// the same word, allowing one typo in names of 5+ letters ("Bojnansky" = "Bojnanski")
const sameWord = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && dist(a, b) <= 1);
const sameFirst = (a, b) => sameWord(a, b) || (a.length === 1 && b[0] === a) || (b.length === 1 && a[0] === b);

/** Finds a sheet name on the roster: the full name first; then, as the coach asked, a profile
 *  containing the first or last name ("Bassuk" = "Henry Bassuk", allowing one typo in longer
 *  names: "Bojnansky" = "Adam Bojnanski"). A full name needs its last name to match and its
 *  first name to fit (same, typo or initial), so "Adam Smith" never matches "Adam Bojnanski".
 *  Only a single profile can match: two or more is `ambiguous`, and nothing is guessed.
 *  → (name) => { p, loose } | { ambiguous: [players] } | null */
export function nameMatcher(roster) {
  const exact = new Map(); roster.forEach((p) => { const k = key(p.name); exact.set(k, exact.has(k) ? null : p); });
  const people = roster.map((p) => ({ p, w: words(p.name) })).filter((x) => x.w.length);
  return (name) => {
    const k = key(name); if (!k) return null;
    if (exact.get(k)) return { p: exact.get(k), loose: false };
    const w = words(name); if (!w.length) return null;
    const fits = people.filter(({ w: r }) => {
      if (w.length === 1 || r.length === 1) { const one = w.length === 1 ? w[0] : r[0], many = w.length === 1 ? r : w; return many.some((x) => sameWord(x, one)); }
      return sameWord(w[w.length - 1], r[r.length - 1]) && sameFirst(w[0], r[0]);
    });
    if (fits.length === 1) return { p: fits[0].p, loose: true };
    return fits.length ? { ambiguous: fits.map((x) => x.p) } : null;
  };
}
export function planImport(current, incoming) {
  const byName = new Map(current.map((p) => [nameKey(p.name), p]));
  const seen = new Set(); const updates = [], adds = [];
  for (const p of incoming) {
    const k = nameKey(p.name); if (seen.has(k)) continue; seen.add(k);
    const cur = byName.get(k);
    if (cur) {
      const patch = {}; FIELDS.forEach((f) => { if (f !== 'name' && p[f] && p[f] !== cur[f]) patch[f] = p[f]; });
      if (Object.keys(patch).length || !cur.active) updates.push({ ...cur, ...patch, active: true });
    } else adds.push(p);
  }
  return { updates, adds, missing: current.filter((p) => p.active && !seen.has(nameKey(p.name))) };
}
