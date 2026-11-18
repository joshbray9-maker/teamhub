// Duplicate player profiles on one team: the same person entered twice under a short and a full
// name ("Dom Schnarr" / "Dominic Schnarr", "Grady" / "Grady Cohen", "Masa" / "Masanori").
// Finding pairs is a suggestion only; a coach picks which to keep and merges (api.mergePlayers).

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/[-']/g, '').trim().split(/\s+/).filter(Boolean);
// "Schnarr, Dominic" → Dominic Schnarr
const parts = (name) => { const s = String(name || ''); return norm(s.includes(',') ? s.split(',').slice(1).join(' ') + ' ' + s.split(',')[0] : s); };
const prefix = (a, b) => (a.length <= b.length ? b.startsWith(a) : a.startsWith(b)) && Math.min(a.length, b.length) >= 3;

/** Why two names look like one person, or '' when they don't. */
export function sameName(a, b) {
  const x = parts(a), y = parts(b); if (!x.length || !y.length) return '';
  if (x.join(' ') === y.join(' ')) return 'Same name';
  const [fx, lx] = [x[0], x.length > 1 ? x[x.length - 1] : ''], [fy, ly] = [y[0], y.length > 1 ? y[y.length - 1] : ''];
  if (lx && ly && lx !== ly) return '';
  if (!prefix(fx, fy) && fx !== fy) return '';
  if (fx !== fy) return 'Short first name';
  return lx && ly ? 'Same first and last name' : 'Missing last name';
}

/** Likely duplicate pairs among one team's players: [{ a, b, why, keep }] (keep = the fuller
 * name, else the one with a jersey number, else the older profile). A player is in at most one
 * pair per run; merge, then look again for the rest. Jersey numbers that differ rule a pair out. */
export function findDupes(players) {
  const ps = players.filter((p) => p && p.name), out = [], used = new Set();
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j]; if (used.has(a.id) || used.has(b.id)) continue;
    if (a.num && b.num && String(a.num) !== String(b.num)) continue;
    const why = sameName(a.name, b.name); if (!why) continue;
    used.add(a.id); used.add(b.id); out.push({ a, b, why, keep: pickKeep(a, b).id });
  }
  return out;
}

export function pickKeep(a, b) {
  const score = (p) => [parts(p.name).join(' ').length, p.num ? 1 : 0, p.active !== false ? 1 : 0];
  const sa = score(a), sb = score(b);
  for (let k = 0; k < sa.length; k++) if (sa[k] !== sb[k]) return sa[k] > sb[k] ? a : b;
  return String(a.created_at || '') <= String(b.created_at || '') ? a : b;
}

const FIELDS = ['num', 'position', 'shoots', 'year', 'height', 'weight', 'hometown', 'photo'];
/** The kept profile after a merge: its own details, blanks filled from the other one. */
export function mergedPlayer(keep, drop) {
  const p = { ...keep };
  FIELDS.forEach((f) => { if (!p[f] && drop[f]) p[f] = drop[f]; });
  p.active = keep.active !== false || drop.active !== false;
  return p;
}
