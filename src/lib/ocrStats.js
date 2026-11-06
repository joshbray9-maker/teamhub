// Screenshot of a league stats page → player rows (same shape as parseLeagueStats). The text is
// read in the browser by Tesseract (no upload; only the reading model is downloaded once), then
// wordsToStatRows rebuilds the table from where each word sits: the heading row gives each
// column's position, every player line is a row, and numbers go to the nearest column. The coach
// checks the preview before anything is saved, since a screenshot can be misread.
import { STAT_KEYS } from './leagueStats.js';

const k = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9+/-]/g, '');
const COL = { pts: ['pts'], gp: ['gp'], g: ['g'], a: ['a'], pim: ['pim'], pm: ['+/-', '+/', '+-'], ga: ['ga'], sa: ['sa'], sv: ['sv'] };
const colOf = (w) => { const x = k(w); for (const [f, l] of Object.entries(COL)) if (l.includes(x)) return f; return null; };
const POS = { f: 'F', c: 'C', lw: 'LW', rw: 'RW', d: 'D', g: 'G' };
const isNum = (s) => /^[-+]?\d+(\.\d+)?$/.test(s);
const mid = (w) => (w.x0 + w.x1) / 2;

/** Group words into lines by their vertical position. words: [{text, x0, x1, y0, y1}] */
export function toLines(words) {
  const ws = words.filter((w) => String(w.text || '').trim()).map((w) => ({ ...w, text: String(w.text).trim() })).sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const lines = [];
  for (const w of ws) {
    const cy = (w.y0 + w.y1) / 2, l = lines[lines.length - 1];
    if (l && Math.abs(cy - l.cy) < Math.max(6, (w.y1 - w.y0) * 0.6)) { l.words.push(w); l.cy = (l.cy * (l.words.length - 1) + cy) / l.words.length; }
    else lines.push({ cy, words: [w] });
  }
  lines.forEach((l) => l.words.sort((a, b) => a.x0 - b.x0));
  return lines;
}

/** Rebuild player rows from OCR words. Returns [] when no heading row (Name … GP) is found. */
export function wordsToStatRows(words) {
  const lines = toLines(words), out = [];
  let head = null;
  for (const l of lines) {
    const t = l.words.map((w) => k(w.text));
    if (t.includes('name') && t.includes('gp')) {
      const gw = l.words.find((w) => k(w.text) === 'gp'), gpX = mid(gw);
      // every heading from GP on, kept or not (PTS, PPG…), so each number lands under its own heading
      const cols = l.words.filter((w) => mid(w) >= gpX - 1).map((w) => ({ f: colOf(w.text), x: mid(w) }));
      const pos = l.words.find((w) => k(w.text) === 'pos'), jer = l.words.find((w) => /^jersey|^no$|^#$/.test(k(w.text) || w.text));
      // spacing between neighbouring columns: a number further than this from every heading is ignored
      const gap = Math.min(...cols.slice(1).map((c, i) => Math.abs(c.x - cols[i].x)).filter((d) => d > 0), 80);
      head = { cols, posX: pos ? mid(pos) : null, jerX: jer ? mid(jer) : null, gpX, gap };
      continue;
    }
    if (!head) continue;
    // the name ends before the Pos column (logos and photos there read as stray letters)
    const ws = l.words, end = head.posX !== null ? head.posX - 12 : head.gpX;
    const ni = ws.findIndex((w) => /[a-zà-ÿ]/.test(w.text) && /[A-ZÀ-Ý]/.test(w.text[0]) && w.x1 < end);
    if (ni < 0) continue;
    let nj = ni; while (nj + 1 < ws.length && /[a-zà-ÿ]/.test(ws[nj + 1].text) && ws[nj + 1].x1 < end) nj++;
    const name = ws.slice(ni, nj + 1).map((w) => w.text).join(' ').replace(/[^A-Za-zÀ-ÿ' .-]/g, '').replace(/\s+/g, ' ').trim();
    if (name.length < 3) continue;
    // jersey: the number nearest the "Jersey #" heading (else the last number before the name)
    const before = ws.slice(0, ni).filter((w) => /^\d{1,3}$/.test(w.text));
    const jw = head.jerX !== null && before.length ? before.reduce((b, w) => (Math.abs(mid(w) - head.jerX) < Math.abs(mid(b) - head.jerX) ? w : b)) : before[before.length - 1];
    const rk = before.find((w) => w !== jw && (!jw || w.x1 < jw.x0)); // the line number in the first column
    const after = ws.slice(nj + 1);
    const near = (w) => w.x1 < head.gpX && (head.posX === null || Math.abs(mid(w) - head.posX) < 60);
    const pw = after.find((w) => POS[k(w.text)] && near(w)) || after.find((w) => near(w) && /^[FDG][a-z]?$/.test(w.text));
    const v = {};
    for (const w of after) {
      const s = w.text.replace(/[Oo©]/g, '0').replace(/[lIi|!]/g, '1');
      if (!isNum(s)) continue;
      const c = head.cols.reduce((b, c2) => (Math.abs(c2.x - mid(w)) < Math.abs(b.x - mid(w)) ? c2 : b));
      if (c.f && Math.abs(c.x - mid(w)) <= head.gap * 0.7 && v[c.f] === undefined) v[c.f] = Number(s);
    }
    const stats = {}; STAT_KEYS.forEach((s) => { if (v[s] !== undefined) stats[s] = v[s]; });
    if (stats.sa === undefined && v.sv !== undefined && stats.ga !== undefined) stats.sa = v.sv + stats.ga;
    // pts is only a check: G + A should equal it
    // gp may be missing here: the other reading can fill it (readStatsImage drops rows still without it)
    out.push({ num: jw ? jw.text : '', name, position: pw ? POS[k(pw.text)] || pw.text[0] : '', gp: v.gp, stats, ...(v.pts !== undefined ? { pts: v.pts } : {}), ...(rk ? { rank: Number(rk.text) } : {}) });
  }
  return out;
}

// Bigger, grey, dark-on-light: rows on a dark background (the heading bar) are flipped so
// their white text reads like the rest.
async function prepare(image) {
  const bmp = await createImageBitmap(image), sc = bmp.width < 2000 ? 2 : 1;
  const c = document.createElement('canvas'); c.width = bmp.width * sc; c.height = bmp.height * sc;
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data, W = c.width;
  for (let y = 0; y < c.height; y++) {
    let sum = 0; const o = y * W * 4;
    for (let x = 0; x < W; x++) { const i = o + x * 4, l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = l; sum += l; }
    const inv = sum / W < 110;
    for (let x = 0; x < W; x++) { const i = o + x * 4, l0 = inv ? 255 - d[i] : d[i], l = l0 > 165 ? 255 : l0; d[i] = d[i + 1] = d[i + 2] = l; d[i + 3] = 255; } // pale shading → white
  }
  g.putImageData(im, 0, 0);
  return { canvas: c, sc };
}

// a "word" of digits that spans two columns ("2 5" read as "25") is split where its characters
// have a gap wider than about a character
function splitWord(w) {
  // stray strokes from cell shading or borders ("0/4", "3|6") are dropped first
  if (!/^[\d.©Oo/|![\]-]+$/.test(w.text) || !/\d/.test(w.text)) return [w];
  const sy = (w.symbols || []).filter((x) => x.text.trim() && !/[/|![\]]/.test(x.text));
  if (sy.length < 2) return sy.length === 1 && sy[0].text !== w.text ? [{ text: sy[0].text, bbox: { ...sy[0].bbox, y0: w.bbox.y0, y1: w.bbox.y1 } }] : [w];
  const h = w.bbox.y1 - w.bbox.y0, parts = [[sy[0]]];
  for (let i = 1; i < sy.length; i++) { if (sy[i].bbox.x0 - sy[i - 1].bbox.x1 > h * 0.9) parts.push([]); parts[parts.length - 1].push(sy[i]); }
  if (parts.length === 1) return [{ ...w, text: sy.map((x) => x.text).join('') }];
  return parts.map((p) => ({ text: p.map((x) => x.text).join(''), bbox: { x0: p[0].bbox.x0, x1: p[p.length - 1].bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1 } }));
}

/** The words in an image (Blob / File) with their positions, read in the browser. onProgress(0..1). */
export async function readImageWords(image, onProgress, psm = '11') {
  const T = await import('tesseract.js'); const createWorker = T.createWorker || T.default.createWorker;
  const { canvas, sc } = await prepare(image);
  const worker = await createWorker('eng', 1, { logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); } });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    return (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))).flatMap(splitWord)
      .map((w) => ({ text: w.text, x0: w.bbox.x0 / sc, x1: w.bbox.x1 / sc, y0: w.bbox.y0 / sc, y1: w.bbox.y1 / sc }));
  } finally { await worker.terminate(); }
}
const adds = (r) => (r.pts === undefined ? r.stats.g !== undefined && r.stats.a !== undefined : r.stats.g + r.stats.a === r.pts);
const sameKey = (n) => n.toLowerCase().replace(/[^a-zà-ÿ]/g, '').replace(/l/g, 'i'); // l / I look alike
/** Two readings of the same screenshot → one. Per player: the reading whose G + A = PTS wins,
 *  cells it missed come from the other. Marked check: true when it still doesn't add up or the
 *  readings disagree on the jersey number; rows with no GP are dropped. */
export function mergeReads(a, b) {
  const byB = new Map(b.map((r) => [sameKey(r.name), r])), out = [];
  const one = (r, o) => {
    const [p, q] = !o || adds(r) || !adds(o) ? [r, o || {}] : [o, r];
    const m = { ...p, gp: p.gp ?? q.gp, stats: { ...(q.stats || {}), ...p.stats }, position: p.position || q.position || '', rank: p.rank ?? q.rank };
    if (m.pts === undefined && q.pts !== undefined) m.pts = q.pts;
    // jersey: a digit is more often dropped than invented, so the longer reading wins
    const nums = [p.num, q.num].filter(Boolean); m.num = nums.sort((x, y) => y.length - x.length)[0] || '';
    m.check = !adds(m) || (nums.length === 2 && nums[0] !== nums[1]);
    if (m.rank === undefined) delete m.rank;
    return m;
  };
  for (const r of a) { const o = byB.get(sameKey(r.name)); byB.delete(sameKey(r.name)); out.push(one(r, o)); }
  for (const r of byB.values()) out.push(one(r));
  return out.filter((r) => r.gp !== undefined).map(({ check, ...r }) => (check ? { ...r, check } : r));
}
/** Line numbers (first column) missing between the first and last row read. */
export function skippedLines(rows) {
  const n = rows.map((r) => r.rank).filter((x) => Number.isInteger(x) && x > 0 && x < 200).sort((x, y) => x - y);
  // a misread line number ("1" for "11") is not a gap: only report when rows are actually missing
  if (n.length < 2 || rows.length >= n[n.length - 1] - n[0] + 1) return [];
  const have = new Set(n), out = [];
  for (let i = n[0]; i <= n[n.length - 1]; i++) if (!have.has(i)) out.push(i);
  return out;
}
/** Reads a stats screenshot twice (two layout modes; each misses different things) and merges. */
export async function readStatsImage(image, onProgress) {
  const one = wordsToStatRows(await readImageWords(image, (p) => onProgress && onProgress(p / 2), '6'));
  const two = wordsToStatRows(await readImageWords(image, (p) => onProgress && onProgress(0.5 + p / 2), '4'));
  return mergeReads(one, two);
}
