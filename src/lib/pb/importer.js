// Program Builder PDF importer (Josh, 2026-11-15): ported unchanged from the prototype's
// importer.js (BCSImport.parsePages), only turned into an ES module. Pure logic over positioned
// text items, so it runs the same in the browser and in tests. Hockey layout only: the rugby
// layout (two days a page) isn't supported yet.
/* eslint-disable no-var */
/* Turns positioned text from a program PDF (exported from Excel / Google Sheets) into days.
   Input: pages = [{ items: [{ str, x0, x1, y }] }]  (y = baseline, measured from the top) */

var FIXES = [["Negtive", "Negative"], ["Diaganol", "Diagonal"], ["Paloff", "Pallof"], ["efffort", "effort"],
             ["Laying", "Lying"], ["Rythme", "Rhythm"], ["rasie", "raise"], ["negtive", "negative"], ["( per side)", "(per side)"]];
var CODE = /^(P[RL]\d+\s*[:.]|[A-Z]\d?\s*[.:)]|\d+[a-z]\s*[.:)])/;
var SECTION = /^(prep\b|prep\s*\+|main component|accessor|warm[- ]?up|plyos?\b|power\b|strength\b|conditioning|finisher|cool[- ]?down block)/i;

function clean(t) {
  t = String(t || "").replace(/\s+/g, " ").trim();
  t = t.replace(/^(\d[a-z]|[A-E]\d?)\.(?=\S)/, "$1. ");
  FIXES.forEach(function (f) { t = t.split(f[0]).join(f[1]); });
  return t;
}
function blankish(v) { return /^[\s\-–—]*$/.test(String(v || "")); }

function groupLines(items, tol) {
  var sorted = items.slice().sort(function (a, b) { return a.y - b.y || a.x0 - b.x0; });
  var lines = [];
  sorted.forEach(function (it) {
    var L = lines[lines.length - 1];
    if (L && Math.abs(it.y - L.y) <= tol) { L.items.push(it); L.y = (L.y * (L.items.length - 1) + it.y) / L.items.length; }
    else lines.push({ y: it.y, items: [it] });
  });
  lines.forEach(function (L) { L.items.sort(function (a, b) { return a.x0 - b.x0; }); L.text = L.items.map(function (i) { return i.str; }).join(" ").replace(/\s+/g, " ").trim(); });
  return lines;
}
function cx(it) { return (it.x0 + it.x1) / 2; }

function findHeader(lines) {
  for (var i = 0; i < lines.length; i++) {
    var ws = lines[i].items.filter(function (it) { return /^W\s*\d/i.test(it.str.trim()); });
    if (ws.length >= 2) return { idx: i, line: lines[i] };
  }
  return null;
}

function columns(hline, allLines) {
  var its = hline.items.slice();
  allLines.forEach(function (L) { if (Math.abs(L.y - hline.y) < 16 && L !== hline) L.items.forEach(function (it) { if (/^(tempo|rest)$/i.test(it.str.trim())) its.push(it); }); });
  var weeks = [], loads = [], tempo = null, rest = null;
  its.forEach(function (it) {
    var s = it.str.trim();
    if (/^W\s*\d/i.test(s)) weeks.push({ c: cx(it), label: s.replace(/\s*&\s*/, " & ").replace(/^W\s+/, "W") });
    else if (/^(L|load)$/i.test(s)) loads.push(cx(it));
    else if (/^tempo$/i.test(s)) tempo = cx(it);
    else if (/^rest$/i.test(s)) rest = cx(it);
  });
  weeks.sort(function (a, b) { return a.c - b.c; });
  // ordered list of column centers
  var cols = [];
  weeks.forEach(function (w, i) {
    cols.push({ kind: "rx", wk: i, c: w.c });
    var next = weeks[i + 1] ? weeks[i + 1].c : (tempo || rest || w.c + 60);
    var l = loads.filter(function (x) { return x > w.c && x < next; })[0];
    if (l != null) cols.push({ kind: "load", wk: i, c: l });
  });
  if (tempo != null) cols.push({ kind: "tempo", c: tempo });
  if (rest != null) cols.push({ kind: "rest", c: rest });
  cols.sort(function (a, b) { return a.c - b.c; });
  var span = cols.length > 1 ? cols[1].c - cols[0].c : 40;
  cols.forEach(function (col, i) {
    col.lo = i === 0 ? col.c - span : (cols[i - 1].c + col.c) / 2;
    col.hi = i === cols.length - 1 ? col.c + 80 : (col.c + cols[i + 1].c) / 2;
  });
  return { cols: cols, weeks: weeks.map(function (w) { return w.label; }), nameMax: cols[0].lo, tagMin: weeks.length ? weeks[weeks.length - 1].c - span * 0.6 : 1e9 };
}
function colOf(C, it) {
  if (it.x0 < C.nameMax - 2) return { kind: "name" };
  var c = cx(it);
  for (var i = 0; i < C.cols.length; i++) if (c >= C.cols[i].lo && c < C.cols[i].hi) return C.cols[i];
  return { kind: "other" };
}

export function parsePage(page, prevBlock) {
  var items = page.items.filter(function (i) { return i.str && i.str.trim(); });
  if (!items.length) return { error: "No text found on this page (is it a scanned image?)" };
  var lines = groupLines(items, 1.6);
  var H = findHeader(lines);
  if (!H) return { error: "No week columns (W1, W2…) found" };
  var C = columns(H.line, lines);
  var nw = C.weeks.length;

  // ---- title area: lines above the header
  var block = "", title = "", tag = "", sub = "";
  var titleItems = [];
  for (var i = 0; i < H.idx; i++) lines[i].items.forEach(function (it) {
    var s = it.str.trim();
    if (/^(sets x reps|exercise\(s\)|exercises?$|tempo$|rest$)/i.test(s) || SECTION.test(s)) return;
    titleItems.push(it);
  });
  var left = [], mid = [], right = [];
  titleItems.forEach(function (it) {
    if (it.x0 < C.nameMax - 2 && cx(it) < C.nameMax) left.push(it);
    else if (cx(it) >= C.tagMin) right.push(it);
    else mid.push(it);
  });
  var midText = clean(mid.map(function (i) { return i.str; }).join(" "));
  var leftText = clean(left.map(function (i) { return i.str; }).join(" "));
  var dm = (leftText + " " + midText).match(/^(.*?)\s*((?:Day|Session|Workout)\s*\d.*|Regen.*)$/i);
  if (dm) { block = clean(dm[1]); title = clean(dm[2]); }
  else { block = leftText; title = midText || leftText; if (!midText) block = ""; }
  right.sort(function (a, b) { return a.x0 - b.x0; });
  if (right.length) { tag = clean(right[0].str); sub = clean(right.slice(1).map(function (i) { return i.str; }).join(" ")); }
  if (!block) block = prevBlock || "";
  if (!tag && /regen|recover/i.test(title)) tag = "RECOVERY";

  // ---- body
  var sections = [], sec = null, notes = [], inWall = false, wallParts = [];
  var rows = [];          // all rows (with section ref)
  var valueLines = [];    // {y, cells}
  var tempoItems = [], restItems = [], nameCont = [];
  for (i = H.idx; i < lines.length; i++) {
    var L = lines[i];
    var nameItems = L.items.filter(function (it) { return colOf(C, it).kind === "name"; });
    var nameText = clean(nameItems.map(function (it) { return it.str; }).join(" "));
    var isHeaderLine = L.items.some(function (it) { return /^W\s*\d/i.test(it.str.trim()); });
    if (/^wall stretch/i.test(nameText)) { inWall = true; var rest = clean(nameText.replace(/^wall stretch\s*:?/i, "")); if (rest) wallParts.push(rest); continue; }
    if (/^(cool[- ]?down|alternatives?)\b/i.test(nameText) || /^(cool[- ]?down|alternatives?)$/i.test((L.items[0] || {}).str || "")) {
      var lab = (nameText.match(/^(cool[- ]?down|alternatives?)/i) || [L.text])[0];
      var restTxt = clean(L.text.slice(L.text.toLowerCase().indexOf(lab.toLowerCase()) + lab.length)).replace(/^:\s*/, "");
      var nice = /^alt/i.test(lab) ? "ALTERNATIVES" : "COOL-DOWN";
      notes.push(nice + ": " + restTxt.replace(/:\s+/g, " → ").replace(/ → /, function (m) { return m; }));
      inWall = false; continue;
    }
    if (inWall) { if (L.text) wallParts.push(clean(L.text)); continue; }
    if (nameText && SECTION.test(nameText) && !CODE.test(nameText)) {
      sec = { title: nameText.replace(/^prep \+ plyos$/i, "Prep + Plyos"), rest: "", rows: [], restOverride: "" };
      sections.push(sec); continue;
    }
    if (/^circuit\b/i.test(nameText) && sec) {
      sec.title += "  —  " + nameText;
      L.items.forEach(function (it) { if (colOf(C, it).kind === "rest") sec.restOverride = clean((sec.restOverride + " " + it.str)); });
      continue;
    }
    if (isHeaderLine || i === H.idx) continue;
    if (!sec) { sec = { title: "Exercises", rest: "", rows: [], restOverride: "" }; sections.push(sec); }
    // collect cells
    var cells = {}, hasVal = false;
    L.items.forEach(function (it) {
      var col = colOf(C, it);
      if (col.kind === "rx" || col.kind === "load") { var k = col.kind + col.wk; cells[k] = clean(((cells[k] || "") + " " + it.str)); hasVal = true; }
      else if (col.kind === "tempo") tempoItems.push({ y: L.y, str: it.str, sec: sec });
      else if (col.kind === "rest") restItems.push({ y: L.y, str: it.str, sec: sec });
    });
    if (nameText && (CODE.test(nameText) || hasVal && !rows.some(function (r) { return r.sec === sec && Math.abs(r.nameY - L.y) < 6; }))) {
      rows.push({ sec: sec, name: nameText, nameY: L.y, valY: hasVal ? L.y : null, cells: hasVal ? cells : null });
    } else if (nameText) {
      nameCont.push({ y: L.y, str: nameText, sec: sec });
      if (hasVal) valueLines.push({ y: L.y, cells: cells, sec: sec });
    } else if (hasVal) valueLines.push({ y: L.y, cells: cells, sec: sec });
  }
  // attach value lines to nearest row in same section without values
  valueLines.forEach(function (v) {
    var best = null, bd = 1e9;
    rows.forEach(function (r) { if (r.sec !== v.sec) return; var d = Math.abs(r.nameY - v.y); if (d < bd && (!r.cells || d < 2)) { bd = d; best = r; } });
    if (best && bd < 14) { if (!best.cells) { best.cells = v.cells; best.valY = v.y; } else for (var k in v.cells) best.cells[k] = clean(best.cells[k] + " " + v.cells[k]); }
  });
  // name continuation lines: append to the nearest row above
  nameCont.forEach(function (n) {
    var best = null;
    rows.forEach(function (r) { if (r.sec === n.sec && r.nameY < n.y && n.y - r.nameY < 16) if (!best || r.nameY > best.nameY) best = r; });
    if (best) best.name = clean(best.name + " " + n.str);
  });
  rows.forEach(function (r) { if (r.valY == null) r.valY = r.nameY; });

  // tempo / rest blocks (wrapped text joined), then aligned to a row or treated as a merged cell
  function blocks(arr) {
    arr.sort(function (a, b) { return a.y - b.y; });
    var out = [];
    arr.forEach(function (t) {
      var B = out[out.length - 1];
      if (B && B.sec === t.sec && t.y - B.last <= 8.6 && t.y - B.last > 1.6) { B.str += " " + t.str; B.last = t.y; B.ys.push(t.y); }
      else if (B && B.sec === t.sec && Math.abs(t.y - B.last) <= 1.6) { B.str += " " + t.str; }
      else out.push({ sec: t.sec, str: t.str, last: t.y, ys: [t.y] });
    });
    out.forEach(function (b) { b.y = (b.ys[0] + b.ys[b.ys.length - 1]) / 2; b.str = clean(b.str); });
    return out;
  }
  function place(arr, field) {
    blocks(arr).forEach(function (b) {
      var srows = rows.filter(function (r) { return r.sec === b.sec; });
      var best = null, bd = 1e9;
      srows.forEach(function (r) { var d = Math.abs(r.valY - b.y); if (d < bd) { bd = d; best = r; } });
      if (best && bd <= 3.2 && !best[field]) best[field] = b.str;
      else if (best) { // merged cell spanning rows
        if (field === "rest") b.sec.mergedRest = b.str;
        else srows.forEach(function (r) { if (!r.tempo) r.tempoMerged = b.str; });
      }
    });
  }
  place(tempoItems, "tempo"); place(restItems, "rest");

  var outSecs = sections.filter(function (s) { return rows.some(function (r) { return r.sec === s; }); }).map(function (s) {
    var srows = rows.filter(function (r) { return r.sec === s; });
    srows.forEach(function (r) { if (!r.tempo && r.tempoMerged) r.tempo = r.tempoMerged; });
    var rests = srows.map(function (r) { return blankish(r.rest) ? "" : r.rest; });
    var secRest = s.restOverride || s.mergedRest || "";
    var filled = rests.filter(Boolean);
    if (!secRest && srows.length > 1 && filled.length === 1 && !s.mergedRest) { secRest = filled[0]; rests = rests.map(function () { return ""; }); }
    if (secRest) rests = rests.map(function (x) { return x === secRest ? "" : x; });
    // two "1b." in a row at the top -> first is 1a.
    if (srows.length > 1 && /^1b\./.test(srows[0].name) && /^1b\./.test(srows[1].name)) srows[0].name = "1a." + srows[0].name.slice(3);
    return { title: s.title, rest: secRest, rows: srows.map(function (r, ri) {
      var cells = [];
      for (var w = 0; w < nw; w++) {
        var c = r.cells || {};
        cells.push({ rx: clean(c["rx" + w] || ""), load: blankish(c["load" + w]) ? "" : clean(c["load" + w]) });
      }
      return { name: r.name, tempo: blankish(r.tempo) ? "" : r.tempo, rest: rests[ri], cells: cells };
    }) };
  });
  if (/regen|recover/i.test(title)) outSecs.forEach(function (s) { if (/^prep \+ plyos$/i.test(s.title)) s.title = "Prep"; });
  // regen-style pages: "PL2/PL3" inside a prep section renumbered to PR
  outSecs.forEach(function (s) {
    if (!/^prep$/i.test(s.title)) return;
    s.rows.forEach(function (r, ri) { r.name = r.name.replace(/^P[RL]\d+:/, "PR" + (ri + 1) + ":"); });
  });

  if (!notes.length || wallParts.length || /day/i.test(title)) {
    if (wallParts.length || !notes.length) notes.unshift("WALL STRETCH" + (wallParts.length ? ":  " + wallParts.join("  ·  ") : ""));
  }
  if (!outSecs.length) return { error: "Found the week columns but no exercise rows" };
  return { day: { block: block, title: title || "Untitled day", tag: tag, sub: sub, weeks: C.weeks, sections: outSecs, notes: notes } };
}

export function parsePages(pages) {
  var days = [], problems = [], prevBlock = "";
  pages.forEach(function (p, i) {
    var r = parsePage(p, prevBlock);
    if (r.error) problems.push("Page " + (i + 1) + ": " + r.error);
    else { days.push(r.day); prevBlock = r.day.block || prevBlock; }
  });
  return { days: days, problems: problems };
}

