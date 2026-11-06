// League / calendar parsing shared by the browser app (paste + .ics import) and the
// league-sync Edge Function. Pure JavaScript, no DOM or Node/Deno APIs, so both runtimes
// import this same file. Ported from the original TeamHub artifact.

export function pad(n) { return String(n).padStart(2, '0'); }
export function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''); }
export const hasWord = (s) => /[A-Za-zÀ-ÿ]{2,}/.test(s);

/* ---------- "is this our team?" ---------- */
// A team row/game name matches when it equals, or contains / is contained in, the team's
// league name ("Name in league tables") or its display name.
export function isUsName(name, team) {
  const a = norm(name), b = norm(team && (team.school || team.name)), c = norm(team && team.name);
  if (!a) return false;
  return [b, c].some((x) => x && (a === x || (x.length > 3 && a.includes(x)) || (a.length > 3 && x.includes(a))));
}

/* ---------- standings ---------- */
const STAT_KEYS = new Set(['GP','MP','P','PL','PLD','G','W','L','T','D','N','OTL','OT','OTW','SOL','SOW','PF','PA','GF','GA','BF','BC','DIFF','+/-','PD','GD','DIF','PTS','PT','BP','TB','LB','BON','PCT','WIN%','W%','STRK','STREAK','L10','HOME','AWAY','CONF','DIV','RS','RA','TRIES','TF','TA','GB','V','DEF','NUL','PJ','MJ','BP+','BP-','POINTS','WINS','LOSSES','TIES','PLAYED','DRAWS','PCT.','PP','PC','BONIS','BONI','PTS TOT','DP','DIFF.']);
function splitCells(line) { return line.includes('\t') ? line.split('\t').map((s) => s.trim()).filter((s, i, a) => s !== '' || i < a.length - 1) : line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean); }
const isNumCell = (s) => /^[-+]?\d+(\.\d+)?%?$|^\.\d+$|^[WLTD]\d+$|^\d+-\d+(-\d+)?$/.test(s);
function headerOf(line) {
  let cells = splitCells(line); if (cells.length < 3) cells = line.trim().split(/\s+/);
  const stats = cells.filter((c) => STAT_KEYS.has(c.toUpperCase()));
  if (stats.length < 3) return null;
  const at = cells.findIndex((c) => STAT_KEYS.has(c.toUpperCase()));
  // a division name in the header row's first cells (CSSHL: "CCM  GP  W  L …")
  return { cells, stats: cells.slice(at), name: cells.slice(0, at).filter((c) => hasWord(c) && !/^(teams?|[ée]quipes?|club|name|nom|rank|pos(ition)?|rang|school|[ée]cole)$/i.test(c)).join(' ') };
}
function rowOf(line, nStats) {
  let cells = splitCells(line);
  if (cells.length < 3) { // single-space separated: leading words = team
    const toks = line.trim().split(/\s+/); const firstNum = toks.findIndex((t, i) => i > 0 && isNumCell(t) && toks.slice(i).every(isNumCell));
    if (firstNum < 1) return null; cells = [toks.slice(0, firstNum).join(' '), ...toks.slice(firstNum)];
  }
  let rank = null;
  if (/^\d{1,2}\.?$/.test(cells[0]) && cells.length > 2) { rank = parseInt(cells[0]); cells = cells.slice(1); }
  const ti = cells.findIndex(hasWord); if (ti < 0) return null;
  const team = cells[ti].replace(/^\d{1,2}[.)]\s+/, '').replace(/\s*[xyz*]$|\s*\((x|y|z|c)\)$/i, '').trim();
  const vals = cells.slice(ti + 1);
  const nums = vals.filter(isNumCell); if (nums.length < Math.min(3, nStats)) return null;
  return { rank, team, vals };
}

/* ---------- dates & times ---------- */
function monthNum(w) { w = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); if (/^(jul|juil)/.test(w)) return 7; if (/^(jun|juin)/.test(w)) return 6; return { jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, avr: 4, may: 5, mai: 5, aug: 8, aou: 8, sep: 9, oct: 10, nov: 11, dec: 12 }[w.slice(0, 3)]; }
const MON_RE = '(jan(?:uary|v(?:ier)?)?|feb(?:ruary)?|f[eé]v(?:rier)?|mar(?:ch|s)?|apr(?:il)?|avr(?:il)?|may|mai|june?|juin|july?|juil(?:let)?|aug(?:ust)?|ao[uû]t?|sept?(?:ember|embre)?|oct(?:ober|obre)?|nov(?:ember|embre)?|d[eé]c(?:ember|embre)?)\\.?(?![a-zà-ÿ])';
export function inferYear(mo, da, now = new Date()) { let y = now.getFullYear(); const c = new Date(y, mo - 1, da); const diff = (c - now) / 86400000; if (diff > 200) y--; else if (diff < -200) y++; return y; }
export function parseDateIn(s) {
  let m;
  if ((m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) return { d: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, raw: m[0] };
  if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) { const a = +m[1], b = +m[2]; let mo = a, da = b; if (a > 12) { mo = b; da = a; } if (mo > 12 || da > 31) return null; const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : inferYear(mo, da); return { d: `${y}-${pad(mo)}-${pad(da)}`, raw: m[0] }; }
  if ((m = s.match(new RegExp('\\b' + MON_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?', 'i')))) { const mo = monthNum(m[1]); const da = +m[2]; if (!mo || da > 31) return null; const y = m[3] ? +m[3] : inferYear(mo, da); return { d: `${y}-${pad(mo)}-${pad(da)}`, raw: m[0] }; }
  if ((m = s.match(new RegExp('\\b(\\d{1,2})(?:er)?\\s+' + MON_RE + '(?:\\s+(\\d{4}))?', 'i')))) { const mo = monthNum(m[2]); const da = +m[1]; if (!mo || da > 31) return null; const y = m[3] ? +m[3] : inferYear(mo, da); return { d: `${y}-${pad(mo)}-${pad(da)}`, raw: m[0] }; }
  return null;
}
export function parseTimeIn(s) { const m = s.match(/\b(\d{1,2})[:h](\d{2})\s*(a\.?m\.?|p\.?m\.?)?/i); if (!m) return null; let H = +m[1]; const ap = (m[3] || '').toLowerCase()[0]; if (ap === 'p' && H < 12) H += 12; if (ap === 'a' && H === 12) H = 0; if (H > 23) return null; return { t: `${pad(H)}:${m[2]}`, raw: m[0] }; }
export function cleanTeam(s) { return s.replace(/\s*\((?:u\d{2}[^)]*|biosteel|ccm|prep|varsity[^)]*|jv)\)\s*$/i, '').replace(/\b(final|ft|f\/ot|f\/so|box score|recap|boxscore|stats|résumé|sommaire)\b/gi, '').replace(/\((ot|so|f)\)/gi, '').replace(/^[\s\-–|·,:]+|[\s\-–|·,:]+$/g, '').replace(/\s{2,}/g, ' ').trim(); }

/* ---------- games in free text ---------- */
function parseGameLine(line, ctxDate) {
  let s = line; const tm = parseTimeIn(s); if (tm) s = s.replace(tm.raw, ' ');
  const dt = parseDateIn(s); if (dt) s = s.replace(dt.raw, ' ');
  s = s.replace(/^\s*(mon|tue|wed|thu|fri|sat|sun|lun|mar|mer|jeu|ven|sam|dim)[a-z]*\.?,?\s/i, ' ').replace(/\s+(mon|tue|wed|thu|fri|sat|sun)(day)?\.?,?\s/ig, ' ');
  const date = dt ? dt.d : ctxDate; let g = null;
  if (s.includes('\t')) {
    const cells = s.split('\t').map((c) => c.trim()).filter(Boolean);
    const si = cells.findIndex((c) => /^\d{1,3}\s*[-–:]\s*\d{1,3}$/.test(c));
    if (si > 0 && si < cells.length - 1 && hasWord(cells[si - 1]) && hasWord(cells[si + 1])) { const [a, b] = cells[si].split(/\s*[-–:]\s*/); g = { home: cells[si - 1], away: cells[si + 1], hs: +a, as: +b }; }
    else {
      const ni = cells.findIndex((c, i) => /^\d{1,3}$/.test(c) && /^\d{1,3}$/.test(cells[i + 1] || ''));
      if (ni > 0 && hasWord(cells[ni - 1]) && hasWord(cells[ni + 2] || '')) g = { home: cells[ni - 1], away: cells[ni + 2], hs: +cells[ni], as: +cells[ni + 1] };
      else {
        const vi = cells.findIndex((c) => /^(vs\.?|v\.?|@|at|à|contre)$/i.test(c));
        if (vi > 0 && hasWord(cells[vi - 1]) && hasWord(cells[vi + 1] || '')) { const at = /^(@|at|à)$/i.test(cells[vi]); g = at ? { home: cells[vi + 1], away: cells[vi - 1] } : { home: cells[vi - 1], away: cells[vi + 1] }; }
      }
    }
    if (!g) s = s.replace(/\t/g, '  ');
  }
  let m;
  if (!g && (m = s.match(/^(.*?[A-Za-zÀ-ÿ].*?)\s+(\d{1,3})\s*[-–:,]\s*(\d{1,3})\s+(.*[A-Za-zÀ-ÿ].*)$/))) g = { home: m[1], away: m[4], hs: +m[2], as: +m[3] };
  if (!g && (m = s.match(/^(.*?[A-Za-zÀ-ÿ].*?)\s+(\d{1,3}),?\s+(.*?[A-Za-zÀ-ÿ].*?)\s+(\d{1,3})\s*$/))) g = { home: m[1], away: m[3], hs: +m[2], as: +m[4] };
  if (!g && (m = s.match(/^(.*?[A-Za-zÀ-ÿ].*?)\s+(?:vs\.?|v\.?|versus|contre)\s+(.*[A-Za-zÀ-ÿ].*)$/i))) g = { home: m[1], away: m[2] };
  if (!g && (m = s.match(/^(.*?[A-Za-zÀ-ÿ].*?)\s+(?:@|at|à)\s+(.*[A-Za-zÀ-ÿ].*)$/i))) g = { home: m[2], away: m[1] };
  if (!g || !date) return null;
  g.home = cleanTeam(g.home); g.away = cleanTeam(g.away);
  if (!hasWord(g.home) || !hasWord(g.away) || g.home.length > 60 || g.away.length > 60) return null;
  return { date, time: tm ? tm.t : '', home: g.home, away: g.away, hs: g.hs ?? null, as: g.as ?? null };
}
// Schedule tables with titled columns (e.g. RSEQ: "Date  Heure  Visiteur  Résultat  Receveur  Endroit").
const COL_RE = { date: /^(date|jour|day)$/i, time: /^(heure|time|start|début)$/i, away: /^(visiteurs?|visitors?|away|visiting|road|ext[ée]rieur)$/i, home: /^(receveurs?|home|domicile|local|h[ôo]te|host)$/i, score: /^(r[ée]sultats?|result|score|pointage|final)$/i, venue: /^(endroit|lieu|venue|location|ar[ée]na|arena|site|terrain|stade|gym(nase)?)$/i };
const PLACEHOLDER = /gagnant|perdant|winner|loser|d[ée]terminer|\btb[ad]\b|\bbye\b/i;
function schedHeaderOf(line) {
  if (!line.includes('\t')) return null;
  const cells = line.split('\t').map((c) => c.trim()); const idx = {};
  cells.forEach((c, i) => { for (const k in COL_RE) if (idx[k] === undefined && COL_RE[k].test(c)) idx[k] = i; });
  return (idx.date !== undefined && idx.away !== undefined && idx.home !== undefined) ? idx : null;
}
function schedRowOf(line, ix, ctxRound) {
  if (!line.includes('\t')) return null;
  const c = line.split('\t').map((x) => x.trim());
  const dt = parseDateIn(c[ix.date] || ''); if (!dt) return null;
  const away = c[ix.away] || '', home = c[ix.home] || '';
  if (!hasWord(away) || !hasWord(home) || PLACEHOLDER.test(away) || PLACEHOLDER.test(home)) return null;
  const tm = ix.time !== undefined ? parseTimeIn(c[ix.time] || '') : null;
  let hs = null, as = null;
  const sc = (ix.score !== undefined ? c[ix.score] : '').match(/^(\d{1,3})\s*[-–:]\s*(\d{1,3})/);
  if (sc) { // the score reads in the same order as the team columns
    const first = +sc[1], second = +sc[2];
    if (ix.away < ix.home) { as = first; hs = second; } else { hs = first; as = second; }
  } else { // separate goals column right after each team (e.g. CSSHL "Visiting | GF | Home | GF")
    const ga = c[ix.away + 1], gh = c[ix.home + 1];
    if (/^\d{1,3}$/.test(ga || '') && /^\d{1,3}$/.test(gh || '')) { as = +ga; hs = +gh; }
  }
  let venue = ''; if (ix.venue !== undefined) venue = c.slice(ix.venue).find(Boolean) || '';
  const lead = c[0]; const round = (lead && /[A-Za-zÀ-ÿ]{4,}/.test(lead) && !COL_RE.date.test(lead)) ? lead : ctxRound;
  return { date: dt.d, time: tm ? tm.t : '', home: cleanTeam(home), away: cleanTeam(away), hs, as, venue: venue.replace(/\.\.\.$/, '…'), round: round || '' };
}

/** Parse pasted league-page text (standings tables and/or schedules). */
export function parseLeague(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\u00a0/g, ' ').trimEnd()).filter((l) => l.trim());
  const groups = []; let cur = null, sched = null, schedRound = '', lastText = '', ctxDate = null; const games = [];
  for (const raw of lines) {
    const line = raw.trim();
    const sh = schedHeaderOf(raw);
    if (sh) { sched = sh; cur = null; schedRound = /[ée]liminatoire|playoff|s[ée]ries|post-?season/i.test(lastText) ? 'Playoffs' : ''; continue; }
    if (sched) {
      const g = schedRowOf(raw, sched, schedRound);
      if (g) { games.push(g); continue; }
      if (raw.includes('\t') && parseDateIn(raw)) continue; // placeholder row (e.g. "Gagnant D-F")
      sched = null;
    }
    const hd = headerOf(raw);
    if (hd) { cur = { name: hd.name || lastText, cols: hd.stats.map((c) => c.replace(/\.$/, '')), rows: [] }; groups.push(cur); continue; }
    if (cur) {
      const r = rowOf(raw, cur.cols.length);
      if (r && r.vals.length >= Math.min(3, cur.cols.length)) {
        const n = cur.cols.length, vals = r.vals.length >= n ? (r.vals.length === n ? r.vals : r.vals.slice(r.vals.length - n)) : r.vals;
        const v = {}; cur.cols.forEach((c, i) => { if (vals[i] !== undefined) v[c] = vals[i]; });
        cur.rows.push({ rank: r.rank, team: r.team, v }); continue;
      } else if (cur.rows.length) cur = null;
    }
    const g = parseGameLine(raw, ctxDate);
    if (g) { games.push(g); ctxDate = g.date; continue; }
    const dt = parseDateIn(line); if (dt && line.replace(dt.raw, '').replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length < 14) { ctxDate = dt.d; continue; }
    const first = line.split('\t')[0].trim(); if (hasWord(first) && first.length < 90) lastText = first;
  }
  return { groups: groups.filter((g) => g.rows.length >= 2), games };
}
export function gameKey(g) { return `${g.date}|${norm(g.home)}|${norm(g.away)}`; }

/** Flatten an HTML Document to tab-separated lines (tables keep their cells). Works with
 *  the browser's DOMParser and with deno-dom. */
export function docToText(doc) {
  const out = []; let line = '';
  const BLOCK = /^(P|DIV|LI|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|UL|OL|TABLE|TBODY|THEAD|TFOOT|BR|DT|DD|CAPTION)$/;
  const flush = () => { const s = line.replace(/[\u00a0 ]+/g, ' ').trim(); if (s) out.push(s); line = ''; };
  (function walk(n) {
    if (n.nodeType === 3) { line += n.nodeValue.replace(/\s+/g, ' '); return; }
    if (n.nodeType !== 1) return; const t = n.tagName;
    if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT') return;
    if (t === 'TR') { flush(); out.push([...n.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH').map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join('\t')); return; }
    if (BLOCK.test(t)) flush(); for (const c of n.childNodes) walk(c); if (BLOCK.test(t)) flush();
  })(doc.body);
  flush(); return out.join('\n');
}

/* ---------- .ics calendar files ---------- */
// UTC ("Z") event times become wall-clock times in `timeZone` (default: this runtime's own
// zone, i.e. the viewer's in the browser; the Edge Function runs in UTC, so it passes one).
function zoned(d, timeZone) {
  if (!timeZone) return { date: iso(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export function parseIcs(text, { timeZone } = {}) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let ev = null;
  const unesc = (v) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (l === 'END:VEVENT') { if (ev && ev.DTSTART) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = l.indexOf(':'); if (i < 0) continue;
    const [name, ...params] = l.slice(0, i).split(';'); const key = name.toUpperCase();
    if (['DTSTART', 'SUMMARY', 'LOCATION', 'UID', 'DESCRIPTION', 'STATUS'].includes(key)) ev[key] = { v: l.slice(i + 1), p: params.join(';') };
  }
  return out.filter((e) => !e.STATUS || !/CANCELLED/i.test(e.STATUS.v)).map((e) => {
    const raw = e.DTSTART.v.trim(); let date = '', time = '';
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{0,2}(Z)?)?$/);
    if (!m) return null;
    if (m[4] && m[6]) ({ date, time } = zoned(new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])), timeZone));
    else { date = `${m[1]}-${m[2]}-${m[3]}`; if (m[4]) time = `${m[4]}:${m[5]}`; }
    return { uid: e.UID ? unesc(e.UID.v) : '', date, time, title: e.SUMMARY ? unesc(e.SUMMARY.v) : '(No title)', location: e.LOCATION ? unesc(e.LOCATION.v) : '' };
  }).filter(Boolean);
}
function icsToGame(x, us) {
  let t = x.title.replace(/^\s*(game|match|partie)\s*[:\-–]\s*/i, '').trim(); let m;
  // some schedule apps prefix the summary with the venue ("Arena de Bromont Team A @ Team B")
  if (x.location && t.toLowerCase().startsWith(x.location.toLowerCase())) t = t.slice(x.location.length).replace(/^[\s:\-–|]+/, '');
  if ((m = t.match(/^(?:vs\.?|v\.?|versus|contre)\s+(.+)$/i))) return { home: us, away: m[1] };
  if ((m = t.match(/^(?:@|at|à)\s+(.+)$/i))) return { home: m[1], away: us };
  if ((m = t.match(/^(.+?)\s+(?:vs\.?|v\.?|versus|contre)\s+(.+)$/i))) return { home: m[1], away: m[2] };
  if ((m = t.match(/^(.+?)\s+(?:@|at|à)\s+(.+)$/i))) return { home: m[2], away: m[1] };
  return null;
}
export function icsId(uid, x) { let h = 0; const s = uid || (x.date + x.time + x.title); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'ics' + (h >>> 0).toString(36); }
/** Split parsed .ics items into games ("vs", "@") and other events. `us` = the team's league name. */
export function planIcs(items, us) {
  const games = [], events = [];
  items.forEach((x) => {
    const g = icsToGame(x, us);
    if (g && hasWord(g.home) && hasWord(g.away)) games.push({ ext_id: icsId(x.uid, x), date: x.date, time: x.time, home: cleanTeam(g.home), away: cleanTeam(g.away), hs: null, as: null, venue: x.location, round: '', source: 'ics' });
    else events.push({ ext_id: icsId(x.uid, x), title: x.title, date: x.date, time: x.time, location: x.location, kind: /practice|pratique|entra[iî]nement|skate|ice time|glace/i.test(x.title) ? 'practice' : 'event' });
  });
  return { games, events };
}

/* ---------- sync matching (league-sync) ---------- */
function daysBetween(a, b) { return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000); }
function opponentOf(g, team) { return isUsName(g.home, team) ? g.away : g.home; }
function sameOpp(a, b) { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y))); }

/** The game already on the calendar that a league game of ours is (pasted pages spell teams
 *  differently: "Selwyn House" / "Selwyn House School", "OHA U17", home and away swapped).
 *  Same date and a matching opponent; else, when that date has exactly one game of ours on the
 *  calendar and one in the paste, that one. `used`: ids already matched in this paste. */
export function findSameGame(existing, g, team, incoming = [], used = new Set()) {
  if (!isUsName(g.home, team) && !isUsName(g.away, team)) return null;
  const ours = existing.filter((e) => !used.has(e.id) && e.date === g.date && (isUsName(e.home, team) || isUsName(e.away, team)));
  const opp = opponentOf(g, team);
  const byOpp = ours.find((e) => sameOpp(opponentOf(e, team), opp));
  if (byOpp) return byOpp;
  const sameDay = incoming.filter((x) => x.date === g.date && (isUsName(x.home, team) || isUsName(x.away, team)));
  return ours.length === 1 && sameDay.length === 1 ? ours[0] : null;
}

/**
 * Compare league games against the games already on a team's calendar.
 * Only updates games that are already there; anything else comes back as `fresh` so a
 * coach can review it. Never adds games itself (a game is only on a team's calendar when
 * the S&C sheet has it, so the league site is not the source of truth for *which* games).
 * Returns { updates:[{id, patch, changes}], fresh:[game] }.
 */
export function planSync(existing, incoming, team, { windowDays = 3 } = {}) {
  const ours = incoming.filter((g) => isUsName(g.home, team) || isUsName(g.away, team));
  const used = new Set(); const updates = [], fresh = [];
  const pick = (g, pred) => existing.find((e) => !used.has(e.id) && pred(e, g));
  for (const g of ours) {
    const opp = opponentOf(g, team);
    const e = pick(g, (e) => e.ext_id && g.ext_id && e.ext_id === g.ext_id)
      || pick(g, (e) => e.date === g.date && sameOpp(opponentOf(e, team), opp))
      || pick(g, (e) => Math.abs(daysBetween(e.date, g.date)) <= windowDays && sameOpp(opponentOf(e, team), opp));
    if (!e) { fresh.push(g); continue; }
    used.add(e.id);
    const patch = {}, changes = [];
    const set = (k, label, v) => { if (v !== undefined && v !== null && v !== '' && String(e[k] ?? '') !== String(v)) { patch[k] = v; changes.push({ field: label, from: e[k] ?? null, to: v }); } };
    set('date', 'date', g.date);
    set('time', 'time', g.time);
    set('venue', 'venue', g.venue);
    if (g.hs !== null && g.hs !== undefined && g.as !== null && g.as !== undefined) {
      // keep the existing home/away orientation
      const flipped = isUsName(e.home, team) !== isUsName(g.home, team);
      set('hs', 'home score', flipped ? g.as : g.hs);
      set('as', 'away score', flipped ? g.hs : g.as);
    }
    if (g.ext_id && e.ext_id !== g.ext_id) patch.ext_id = g.ext_id;
    if (changes.length || patch.ext_id) updates.push({ id: e.id, patch, changes });
  }
  return { updates, fresh };
}

/* ---------- RSEQ diffusion JSON ---------- */
// diffusion.rseq.ca pages load their data from a public JSON endpoint. Only game fields are
// read; the payload's player statistics are ignored and never stored.
export function rseqLeagueId(url) { const m = String(url || '').match(/LeagueId=([0-9a-f-]{36})/i); return m ? m[1] : null; }
export function rseqGames(json) {
  const lists = [['RegularSeasonGames', ''], ['PreSeasonGames', 'Pre-season'], ['PostSeasonGames', 'Playoffs'], ['ChampionshipGames', 'Championship'], ['ConferenceChampionshipGames', 'Championship']];
  const out = [];
  for (const [k, round] of lists) for (const g of json[k] || []) {
    if (g.IsByeWeek || g.IsDeleted || g.IsCancelledAfterTeamWithdraw) continue;
    const home = g.HomeTeamName || g.FakeHomeTeamName, away = g.VisitingTeamName || g.FakeVisitingTeamName;
    if (!home || !away || PLACEHOLDER.test(home) || PLACEHOLDER.test(away)) continue;
    const sc = (v) => (typeof v === 'number' && v >= 0 ? v : null);
    out.push({ ext_id: 'rseq:' + g.GameId, date: String(g.GameDateText || g.GameDate || '').slice(0, 10), time: g.GameTimeFormatted || '', home: cleanTeam(home), away: cleanTeam(away), hs: sc(g.HomeTeamScore), as: sc(g.VisitingTeamScore), venue: g.GameLocationFormatted || '', round });
  }
  return out.filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date));
}
