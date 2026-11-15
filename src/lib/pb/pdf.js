// Program Builder PDF export: vector, US Letter landscape (792×612 pt), one day per page.
// drawDay / drawCell are ported from the prototype (program-builder-handoff/reference/app.js)
// with the same geometry and colours, so every day fills exactly one page like the printout.
// `doc` is a jsPDF document; the page loads jsPDF on demand (exportPdf below).
import { setPlan, isBlocked, PALETTES } from './model.js';

// the colours in use while a document is drawn (set by buildPdf from the team's palette)
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const colours = (P) => ({ title: rgb(P.title), bar: rgb(P.bar), purple: rgb(P.line), lav: rgb(P.lav), sec: rgb(P.sec), alt: rgb(P.alt), yel: rgb(P.tag), tagFg: rgb(P.tagFg), tagSub: rgb(P.tagSub),
  grid: rgb(P.grid), block: rgb(P.block), box: rgb(P.box), gray: rgb(P.gray), setn: rgb(P.setn), hdrsub: rgb(P.hdrsub), white: [255, 255, 255], black: [0, 0, 0] });
let C = colours(PALETTES.bcs);
// Helvetica in jsPDF only has Latin-1: swap the few characters programs use for ones it can print
function pt(s) {
  return String(s == null ? '' : s).replace(/→/g, '»').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/–/g, '-').replace(/−/g, '-')
    .replace(/[^\x00-\xff—•]/g, ''); // eslint-disable-line no-control-regex
}

function fit(doc, s, maxW, maxH, size, minSize, lf) {
  lf = lf || 1.12;
  let lines;
  for (let sz = size; sz >= minSize; sz -= 0.25) {
    doc.setFontSize(sz); lines = doc.splitTextToSize(s, maxW);
    const wOk = lines.every((l) => doc.getTextWidth(l) <= maxW + 0.5);
    if (lines.length * sz * lf <= maxH && wOk) return { lines, size: sz, h: lines.length * sz * lf };
  }
  doc.setFontSize(minSize); lines = doc.splitTextToSize(s, maxW);
  return { lines, size: minSize, h: lines.length * minSize * lf };
}
function drawLines(doc, f, x, top, lf, align) {
  lf = lf || 1.12; doc.setFontSize(f.size);
  f.lines.forEach((l, i) => { doc.text(l, x, top + f.size * 0.8 + i * f.size * lf, align ? { align } : undefined); });
}
function fillR(doc, x, y, w, h, c) { doc.setFillColor(c[0], c[1], c[2]); doc.rect(x, y, w, h, 'F'); }
function lineC(doc, x1, y1, x2, y2, c, lw) { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(lw); doc.line(x1, y1, x2, y2); }
function font(doc, style, c) { doc.setFont('helvetica', style); doc.setTextColor(c[0], c[1], c[2]); }

function labelFor(rx, narrow) {
  const p = setPlan(rx); let t = p.label;
  if (!p.target && narrow && t.indexOf(' ') < 0) {
    if (t.length >= 7 && t.indexOf('+') > 0) t = t.replace('+', ' +');
    else if (t.length >= 9) t = t.replace(/^(\d*x)/, '$1 ');
  }
  return { plan: p, text: t };
}

export function drawDay(doc, d) {
  const PW = 792, PH = 612, M = 25.2, W = PW - 2 * M;
  const nw = Math.max(d.weeks.length, 1), nameW = 205.2, wkW = (W - nameW) / nw;
  const colX = [M]; for (let i = 0; i <= nw; i++) colX.push(M + nameW + i * wkW);
  const H = { title: 30.24, hdr: 21.6, sec: 15.12, note: 15.12, log1: 23.04, log2: 30.24 };
  let nEx = 0; d.sections.forEach((s) => { nEx += s.rows.length; });
  const avail = PH - 2 * M - 4;
  const fixed = H.title + H.hdr + H.sec * d.sections.length + H.note * d.notes.length + H.log1 + H.log2;
  const bodyH = nEx ? Math.min((avail - fixed) / nEx, 60) : 0;
  H.log2 += Math.max(0, avail - fixed - bodyH * nEx);
  let y = M, f; const rowsY = [];

  // title row
  fillR(doc, M, y, W, H.title, C.title);
  if (nw > 1) fillR(doc, colX[nw], y, wkW, H.title, C.yel);
  font(doc, 'bold', C.white);
  f = fit(doc, pt(d.block), nameW - 8, H.title - 4, 12, 7); drawLines(doc, f, M + 4, y + (H.title - f.h) / 2);
  const tEnd = nw > 1 ? colX[nw] : colX[nw + 1];
  f = fit(doc, pt(d.title), tEnd - colX[1] - 8, H.title - 4, 15, 8); drawLines(doc, f, (colX[1] + tEnd) / 2, y + (H.title - f.h) / 2, 1.12, 'center');
  if (nw > 1) {
    const tag = pt(d.tag || ''), sub = pt(d.sub || ''); let sz = 11;
    doc.setFont('helvetica', 'bold');
    const tw = () => { doc.setFontSize(sz); return doc.getTextWidth(tag) + (sub ? doc.getTextWidth(' · ' + sub) : 0); };
    while (sz > 6 && tw() > wkW - 8) sz -= 0.25;
    const total = tw(), sx = colX[nw] + (wkW - total) / 2, by = y + H.title / 2 + sz * 0.35;
    doc.setTextColor(C.tagFg[0], C.tagFg[1], C.tagFg[2]); doc.text(tag, sx, by);
    if (sub) { doc.setTextColor(C.tagSub[0], C.tagSub[1], C.tagSub[2]); doc.text(' · ' + sub, sx + doc.getTextWidth(tag), by); }
  }
  rowsY.push({ y, h: H.title, type: 'title' }); y += H.title;

  // header
  fillR(doc, M, y, W, H.hdr, C.lav);
  font(doc, 'bold', C.black); doc.setFontSize(9.5); doc.text('Exercise', M + 4, y + H.hdr / 2 + 3.3);
  const exw = doc.getTextWidth('Exercise '); font(doc, 'normal', C.hdrsub); doc.setFontSize(6.5); doc.text('tempo · rest', M + 4 + exw, y + H.hdr / 2 + 3.3);
  for (let i = 0; i < nw; i++) {
    const cx = colX[i + 1] + wkW / 2;
    font(doc, 'bold', C.black); f = fit(doc, pt(d.weeks[i]), wkW - 6, 11, 9.5, 6); doc.setFontSize(f.size); doc.text(f.lines[0] || '', cx, y + 10, { align: 'center' });
    font(doc, 'normal', C.hdrsub); doc.setFontSize(6); doc.text('set boxes: load or tick', cx, y + 17.5, { align: 'center' });
  }
  rowsY.push({ y, h: H.hdr, type: 'grid' }); y += H.hdr;

  d.sections.forEach((s) => {
    fillR(doc, M, y, W, H.sec, C.bar);
    font(doc, 'bold', C.white); doc.setFontSize(9.2);
    const st = pt(s.title).toUpperCase(); doc.text(st, M + 4, y + H.sec / 2 + 3.2);
    if (s.rest) { const sw = doc.getTextWidth(st); doc.setFontSize(7.5); doc.text('   Rest: ' + pt(s.rest).toLowerCase(), M + 4 + sw, y + H.sec / 2 + 3.2); }
    rowsY.push({ y, h: H.sec, type: 'span' }); y += H.sec;
    s.rows.forEach((r, ri) => {
      if (ri % 2 === 1) fillR(doc, M, y, W, bodyH, C.alt);
      const meta = [r.tempo, r.rest].filter(Boolean).map(pt).join(' · ');
      const metaSz = Math.min(6.5, bodyH * 0.22);
      const nameSz = Math.min(8.8, bodyH * 0.36);
      font(doc, 'normal', C.black);
      const fn = fit(doc, pt(r.name), nameW - 8, bodyH - (meta ? metaSz * 1.2 : 0) - 3, nameSz, 5.5, 1.1);
      const blockH = fn.h + (meta ? metaSz * 1.25 : 0);
      const ty = y + (bodyH - blockH) / 2;
      drawLines(doc, fn, M + 4, ty, 1.1);
      if (meta) { font(doc, 'normal', C.gray); const fm = fit(doc, meta, nameW - 8, metaSz * 1.3, metaSz, 4.5); drawLines(doc, fm, M + 4, ty + fn.h + 0.6); }
      for (let w = 0; w < nw; w++) drawCell(doc, r.cells[w] || { rx: '', load: '' }, colX[w + 1], y, wkW, bodyH);
      rowsY.push({ y, h: bodyH, type: 'grid' }); y += bodyH;
    });
  });

  d.notes.forEach((n) => {
    fillR(doc, M, y, W, H.note, C.sec);
    const txt = pt(n), ix = txt.indexOf(':'), a = ix >= 0 ? txt.slice(0, ix + 1) : txt, b = ix >= 0 ? txt.slice(ix + 1) : '';
    let sz = 9; doc.setFont('helvetica', 'bold');
    const meas = () => { doc.setFontSize(sz); doc.setFont('helvetica', 'bold'); const aw = doc.getTextWidth(a); doc.setFont('helvetica', 'normal'); return aw + doc.getTextWidth(b); };
    while (sz > 5.5 && meas() > W - 8) sz -= 0.25;
    doc.setFontSize(sz); font(doc, 'bold', C.black); doc.text(a, M + 4, y + H.note / 2 + sz * 0.35);
    const aw = doc.getTextWidth(a); font(doc, 'normal', C.black); doc.text(b, M + 4 + aw, y + H.note / 2 + sz * 0.35);
    rowsY.push({ y, h: H.note, type: 'span' }); y += H.note;
  });

  const logTop = y;
  fillR(doc, M, y, nameW, H.log1 + H.log2, C.lav);
  font(doc, 'bold', C.black); doc.setFontSize(9); doc.text('SESSION LOG', M + 4, y + H.log1 / 2 + 3.1);
  for (let i = 0; i < nw; i++) { font(doc, 'normal', C.gray); f = fit(doc, 'Date ________  RPE ___/10', wkW - 8, 9, 7, 5); doc.setFontSize(f.size); doc.text(f.lines[0], colX[i + 1] + 4, y + H.log1 / 2 + 2.4); }
  rowsY.push({ y, h: H.log1, type: 'grid' }); y += H.log1;
  font(doc, 'bold', C.black); doc.setFontSize(9); doc.text('NOTES / HOW I FELT', M + 4, y + H.log2 / 2 + 3.1);
  rowsY.push({ y, h: H.log2, type: 'grid' }); y += H.log2;

  // grid lines
  rowsY.forEach((r, idx) => {
    if (idx > 0) lineC(doc, M, r.y, M + W, r.y, C.grid, 0.5);
    if (r.type === 'title') { lineC(doc, colX[1], r.y, colX[1], r.y + r.h, C.grid, 0.5); if (nw > 1) lineC(doc, colX[nw], r.y, colX[nw], r.y + r.h, C.grid, 0.5); }
    if (r.type === 'grid') for (let k = 1; k <= nw; k++) lineC(doc, colX[k], r.y, colX[k], r.y + r.h, C.purple, 1.1);
  });
  lineC(doc, M, logTop, M + W, logTop, C.purple, 1.4);
  doc.setDrawColor(C.purple[0], C.purple[1], C.purple[2]); doc.setLineWidth(1.2); doc.rect(M, M, W, y - M, 'S');
}

export function drawCell(doc, c, x, y, w, h) {
  if (isBlocked(c.rx)) { fillR(doc, x + 0.6, y + 0.3, w - 1.2, h - 0.6, C.block); return; }
  const narrow = w < 129.6;
  const lab = labelFor(c.rx, narrow), p = lab.plan, n = p.boxes.length;
  const labW = narrow ? 33.1 : 53.3, top = y + 2.5, bh = h - 5;
  const bx = x + 2 + labW, bw = (w - 4 - labW) / n;
  const L = lab.text.length;
  let fs = narrow ? (L < 8 ? 8.3 : L < 10 ? 7.3 : 6.4) : (L < 11 ? 8.3 : 7.3);
  fs = Math.min(fs, h * 0.34);
  font(doc, 'bold', C.black);
  const fl = fit(doc, pt(lab.text), labW - 2.5, bh - (c.load ? 7 : 0), fs, 4.5, 1.08);
  let fld = null;
  if (c.load) { font(doc, 'italic', C.gray); fld = fit(doc, pt(c.load), labW - 2.5, 8, Math.min(6.3, h * 0.25), 4.2, 1.05); }
  const tot = fl.h + (fld ? fld.h + 0.5 : 0), ty = y + (h - tot) / 2;
  font(doc, 'bold', C.black); drawLines(doc, fl, x + 3.5, ty, 1.08);
  if (fld) { font(doc, 'italic', C.gray); drawLines(doc, fld, x + 3.5, ty + fl.h + 0.5, 1.05); }
  fillR(doc, bx, top, w - 4 - labW, bh, C.white);
  doc.setDrawColor(C.box[0], C.box[1], C.box[2]); doc.setLineWidth(0.6);
  for (let i = 0; i < n; i++) {
    doc.rect(bx + i * bw, top, bw, bh, 'S');
    const b = p.boxes[i]; if (!b) continue;
    if (p.target) { font(doc, 'bold', C.box); doc.setFontSize(b.length > 3 ? 5 : 6.3); }
    else { font(doc, 'normal', C.setn); doc.setFontSize(5); }
    doc.text(pt(b), bx + i * bw + 1.5, top + (p.target ? 5.6 : 4.6));
  }
}

/** A PDF of these days (one page each) in a palette ('bcs' or 'universel'). `JsPDF` is the jsPDF class, passed in so tests can use the node build. */
export function buildPdf(JsPDF, days, title, palette = 'bcs') {
  C = colours(PALETTES[palette] || PALETTES.bcs);
  const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  doc.setProperties({ title, creator: 'TeamHub Program Builder' });
  days.forEach((d, i) => { if (i) doc.addPage('letter', 'landscape'); drawDay(doc, d); });
  return doc;
}
/** Builds and downloads the PDF in the browser (jsPDF loaded on first use). */
export async function exportPdf(days, filename, palette) {
  if (!days.length) return;
  const { jsPDF } = await import('jspdf');
  buildPdf(jsPDF, days, filename.replace(/\.pdf$/, ''), palette).save(filename);
}
