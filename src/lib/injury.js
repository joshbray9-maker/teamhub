// Injury report logic: statuses, a player's current status, return-to-play countdowns, body
// regions for the diagram, and reading injury rows from a CSV/PDF. Pure functions.
// Colours are Josh's scheme (not a medical scale): red = out, yellow = hurt but can practise
// and play, green = go. Statuses never change on their own: a passed return date only shows a
// reminder; sports med clears the injury.
import { fieldFor as rosterField, nameKey } from './rosterImport.js';

export const STATUS = {
  out: { label: 'Out', long: 'Out: not practising or playing', color: 'red', rank: 2 },
  limited: { label: 'Limited', long: 'Hurt, can practise and play', color: 'yellow', rank: 1 },
  cleared: { label: 'Cleared', long: 'Available', color: 'green', rank: 0 },
};
export const GO = { label: 'Available', long: 'Available', color: 'green', rank: 0 };

// Body diagram regions. `pair` regions exist on both sides (L/R = the athlete's left/right).
export const REGIONS = {
  head: { label: 'Head / concussion' }, neck: { label: 'Neck' },
  shoulder: { label: 'Shoulder', pair: true }, upper_arm: { label: 'Upper arm', pair: true }, elbow: { label: 'Elbow', pair: true },
  forearm: { label: 'Forearm', pair: true }, hand: { label: 'Wrist / hand', pair: true },
  chest: { label: 'Chest / ribs' }, abdomen: { label: 'Abdomen / core' }, upper_back: { label: 'Upper back' }, lower_back: { label: 'Lower back' },
  hip: { label: 'Hip', pair: true }, groin: { label: 'Groin' }, glute: { label: 'Glute', pair: true },
  quad: { label: 'Thigh (front)', pair: true }, hamstring: { label: 'Hamstring', pair: true }, knee: { label: 'Knee', pair: true },
  shin: { label: 'Shin', pair: true }, calf: { label: 'Calf / Achilles', pair: true }, ankle: { label: 'Ankle', pair: true }, foot: { label: 'Foot', pair: true },
};
const WORDS = [ // free text → region (first match wins)
  [/concuss|head|skull|face|jaw|eye|nose|dental/, 'head'], [/neck|cervical|whiplash/, 'neck'],
  [/achilles|calf|gastroc|soleus/, 'calf'], [/hamstring|\bhammy/, 'hamstring'], [/groin|adductor|sports hernia/, 'groin'],
  [/glute|buttock/, 'glute'], [/hip|hip flexor/, 'hip'], [/quad|thigh|femur/, 'quad'], [/knee|acl|mcl|mcl|pcl|menisc|patell/, 'knee'],
  [/shin|tibia|fibula/, 'shin'], [/ankle|syndesmo/, 'ankle'], [/foot|toe|heel|plantar|metatars/, 'foot'],
  [/shoulder|ac joint|rotator|clavic|collarbone|labrum/, 'shoulder'], [/elbow/, 'elbow'], [/forearm/, 'forearm'],
  [/wrist|hand|finger|thumb/, 'hand'], [/bicep|tricep|humer|upper arm/, 'upper_arm'], [/rib|chest|pec|sternum/, 'chest'],
  [/abdom|oblique|core|stomach/, 'abdomen'], [/lower back|lumbar/, 'lower_back'], [/upper back|thoracic|scapula|back/, 'upper_back'],
];
export function regionFromText(s) {
  const t = String(s || '').toLowerCase(); if (REGIONS[t]) return t;
  for (const [re, r] of WORDS) if (re.test(t)) return r;
  return '';
}
export function sideFromText(s) {
  const t = String(s || '').trim().toLowerCase();
  if (/^(both|bilat|b)$|bilateral/.test(t)) return 'both';
  if (/^(l|left|g|gauche)$|\bleft\b|\bgauche\b/.test(t)) return 'L';
  if (/^(r|right|d|droit|droite)$|\bright\b|\bdroite?\b/.test(t)) return 'R';
  return '';
}
export function statusFromText(s) {
  const t = String(s || '').trim().toLowerCase();
  if (/^(out|red|no|injured|ir|dnp|absent)$|\bout\b|rouge/.test(t)) return 'out';
  if (/limit|yellow|modif|restrict|day.to.day|dtd|questionable|probable|jaune|partial/.test(t)) return 'limited';
  if (/clear|green|full|avail|healthy|vert|\bgo\b|return/.test(t)) return 'cleared';
  return '';
}

export const isActive = (i) => i && i.status !== 'cleared';
/** The player's worst active injury, or null when they're available. */
export function currentInjury(playerId, injuries) {
  let best = null;
  for (const i of injuries || []) if (i.player_id === playerId && isActive(i) && (!best || STATUS[i.status].rank > STATUS[best.status].rank)) best = i;
  return best;
}
/** {level, label, injury} for a flag, or null when the player is available. */
export function injuryStatus(player, injuries) {
  const i = player && currentInjury(player.id, injuries);
  return i ? { level: i.status, label: `${STATUS[i.status].label}${i.injury ? ': ' + i.injury : ''}`, injury: i } : null;
}

const day = (d) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
export function daysFrom(today, date) { return date ? Math.round((day(date) - day(today)) / 86400000) : null; }
/** "in 5 days", "today", "2 days ago" */
export function inDays(n) { return n === null ? '' : n === 0 ? 'today' : n > 0 ? `in ${n} day${n === 1 ? '' : 's'}` : `${-n} day${n === -1 ? '' : 's'} ago`; }
/** What's next for an active injury: the return to practice, then play. `overdue` when the date passed. */
export function nextStep(i, today) {
  if (!i || !isActive(i)) return null;
  const p = daysFrom(today, i.return_practice), g = daysFrom(today, i.return_play);
  if (i.status === 'out' && p !== null && p > 0) return { what: 'Practice', days: p };
  if (g !== null) return { what: 'Play', days: g, overdue: g < 0 };
  if (p !== null) return { what: 'Practice', days: p, overdue: p < 0 };
  return { what: 'Return', days: null };
}

/* ---------- import ---------- */
const SYN = {
  player: ['player', 'name', 'athlete', 'playername', 'fullname', 'nom', 'joueur'], num: ['no', 'num', 'number', 'jersey', 'numero'],
  injury: ['injury', 'diagnosis', 'blessure', 'condition', 'injurytype', 'type'],
  body_area: ['area', 'bodypart', 'bodyarea', 'location', 'region', 'site', 'partieducorps'], side: ['side', 'cote', 'laterality'],
  status: ['status', 'availability', 'statut', 'state'], injured_on: ['date', 'injurydate', 'dateofinjury', 'injured', 'onset', 'datedeblessure'],
  return_practice: ['returntopractice', 'rtpractice', 'practice', 'practicereturn', 'retourentrainement', 'rtt'],
  return_play: ['returntoplay', 'rtp', 'play', 'expectedreturn', 'returndate', 'return', 'eta', 'retouraujeu'],
  limitations: ['limitations', 'restrictions', 'limits', 'modified', 'contraintes'], details: ['details', 'notes', 'comments', 'description', 'note', 'commentaires'],
};
const hkey = (h) => String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/#/g, 'no').replace(/[^a-z0-9]/g, '');
export function injuryField(h) { const k = hkey(h); for (const [f, l] of Object.entries(SYN)) if (l.includes(k)) return f; if (/return.*pract/.test(k)) return 'return_practice'; if (/return.*play/.test(k)) return 'return_play'; const r = rosterField(h); return r === 'name' ? 'player' : r === 'num' ? 'num' : null; }
/** Any date the sheet uses → 'YYYY-MM-DD' ('' when unreadable). Accepts 2026-11-04, 2026/11/04, 11/04/2026 (month first), Nov 4 2026. */
export function toISO(s) {
  s = String(s || '').trim(); if (!s) return '';
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(s + (/\d{4}/.test(s) ? '' : ' ' + new Date().getFullYear())); return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
/** rows[0] = headings. Matches each row to a roster player by number or name.
 *  Returns { injuries: [{...fields, player_id}], unmatched: [names] } */
export function rowsToInjuries(rows, roster) {
  if (!rows.length) return { injuries: [], unmatched: [] };
  const map = rows[0].map(injuryField);
  if (!map.includes('player') && !map.includes('num')) throw new Error('No player column found. The first row should be headings like Player, Injury, Status, Return to play.');
  const byName = new Map(roster.map((p) => [nameKey(p.name), p])), byNum = new Map(roster.filter((p) => p.num).map((p) => [p.num, p]));
  const injuries = [], unmatched = [];
  for (const r of rows.slice(1)) {
    const x = {}; map.forEach((f, i) => { if (f && !x[f]) x[f] = String(r[i] || '').trim(); });
    let name = x.player || ''; const m = name.match(/^([^,]+),\s*([^,]+)$/); if (m) name = `${m[2]} ${m[1]}`;
    const p = (name && byName.get(nameKey(name))) || (x.num && byNum.get(x.num.replace(/^#/, '')));
    if (!p) { if (name || x.num) unmatched.push(name || '#' + x.num); continue; }
    const text = [x.body_area, x.injury].filter(Boolean).join(' ');
    injuries.push({
      player_id: p.id, status: statusFromText(x.status) || 'out', injury: (x.injury || '').slice(0, 80),
      body_area: regionFromText(x.body_area) || regionFromText(text), side: sideFromText(x.side) || sideFromText(text),
      details: (x.details || '').slice(0, 2000), limitations: (x.limitations || '').slice(0, 2000),
      injured_on: toISO(x.injured_on) || null, return_practice: toISO(x.return_practice) || null, return_play: toISO(x.return_play) || null,
    });
  }
  return { injuries, unmatched };
}
