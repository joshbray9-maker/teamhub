// Shared constants and small helpers (ported from the TeamHub artifact).
import { pad, iso, norm, isUsName } from '../../supabase/functions/_shared/leagueParse.js';
export { pad, iso, norm };

export const SPORTS = { rugby: 'Rugby', soccer: 'Soccer', football: 'Football', hockey: 'Hockey', basketball: 'Basketball' };
export const LEVELS = { 'high-school': 'High school', junior: 'Junior', college: 'College', university: 'University' };
export const SWATCHES = ['#1f5fbf', '#0e7a5a', '#b3261e', '#6b3fa0', '#c25e00', '#a8861b', '#1b1f27', '#0a7c8c', '#8a1538', '#2f6b2f'];
export const MENUS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'master', label: 'Master schedule', icon: 'cal' },
  { id: 'coach', label: "Coach's report", icon: 'report', coach: true },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'league', label: 'League', icon: 'trophy' },
  { id: 'opponents', label: 'Opponents', icon: 'target', coach: true },
  { id: 'practice', label: 'Practice plan', icon: 'clipboard', coach: true },
  { id: 'gameday', label: 'Game day', icon: 'pitch', sports: ['soccer', 'rugby', 'hockey'] },
  { id: 'playbook', label: 'Playbook', icon: 'book', sports: ['football', 'basketball', 'hockey'] },
  { id: 'roster', label: 'Roster', icon: 'users' },
  { id: 'stats', label: 'Stats', icon: 'chart' },
  { id: 'data', label: 'Data Center', icon: 'chart' },
  { id: 'injury', label: 'Injury report', icon: 'cross', coach: true },
  { id: 'sc', label: 'S&C', icon: 'dumbbell' },
  { id: 'athletes', label: 'Athlete reports', icon: 'report', coach: true },
  { id: 'ipp', label: 'IPP', icon: 'target', coach: true },
  { id: 'selfassess', label: 'Self-assessments', icon: 'clipboard', coach: true },
  { id: 'recruit', label: 'Recruitment', icon: 'search', coach: true },
  { id: 'spectators', label: 'Spectators', icon: 'ext', admin: true },
  { id: 'profile', label: 'My Profile', icon: 'user' },
];
/** The only pages a sports med member sees (Josh, 2026-11-05). */
export const MED_PAGES = ['master', 'injury', 'sc', 'athletes', 'profile'];
export const SISTER = { gameday: 'playbook', playbook: 'gameday' };
// per-team colours inside a master schedule (teams in one org often share a brand colour)
export const ORG_PAL = ['#1f5fbf', '#c2410c', '#0e8a62', '#7c3aed', '#be123c', '#0a7c8c', '#a16207', '#c026d3'];
export const PAGE_INFO = {
  chat: ['Team chat and group threads', 'Coach-only threads hidden from players'],
  league: ['Standings, schedule and results', 'Playoff bracket ordered by round', 'League stats from pasted pages'],
  opponents: ['Scouting notes per opponent', 'Head-to-head results'],
  practice: ['Build practices block by block', 'Download as PDF, Excel or CSV'],
  gameday: ['Lineup on the pitch', 'Drag players into positions'],
  playbook: ['Plays and formations', 'Playcalling sheet', 'Lock with a padlock'],
  roster: ['Player list: photo, number, positions, year, size, weight', 'Depth chart', 'Player profile with season stats and radar chart'],
  data: ['Team stats and league stats', 'Drag boxes to swap, click to open full screen'],
  injury: ['Current injuries and return dates', 'Coach-only'],
  sc: ['Gym groups', 'Tests'],
  recruit: ['Recruiting list with contacts and social media', 'Graduating list: interested / committed, likely to play', 'Download with chosen columns: PDF, Excel or CSV'],
  master: ['Every team in the organization on one week, by time slot'],
  profile: ['Your name, photo and contact', 'Coaching staff role'],
};

export function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
export function todayISO() { return iso(new Date()); }
export function fromISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function fmtDate(s, long) { if (!s) return ''; const d = fromISO(s); return long ? `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`; }
export function fmtTime(t) { if (!t) return ''; const [H, M] = t.split(':').map(Number); const ap = H >= 12 ? 'pm' : 'am'; return `${((H + 11) % 12) + 1}:${pad(M)} ${ap}`; }
export function ago(ts) { const s = (Date.now() - ts) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : d + ' days ago'; }
export function daysUntil(s) { return Math.round((fromISO(s) - fromISO(todayISO())) / 86400000); }
export function initials(n) { const w = String(n || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase(); }
export function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
export function clone(o) { return JSON.parse(JSON.stringify(o ?? null)); }
export const store = { get(k) { try { return localStorage.getItem('teamhub:' + k); } catch { return null; } }, set(k, v) { try { localStorage.setItem('teamhub:' + k, v); } catch { /* private mode */ } } };

export function schoolName(t) { return (t && (t.school || t.name)) || ''; }
export const isUsT = (name, t) => !!t && isUsName(name, t);
export function hasScore(g) { return g.hs !== null && g.hs !== undefined && g.hs !== '' && g.as !== null && g.as !== undefined && g.as !== ''; }
export function gameView(g, t) {
  const home = isUsT(g.home, t); const opp = home ? g.away : g.home;
  let res = null, us = null, them = null;
  if (hasScore(g)) { us = Number(home ? g.hs : g.as); them = Number(home ? g.as : g.hs); res = us > them ? 'w' : us < them ? 'l' : 't'; }
  return { home, opp, res, us, them };
}
export function ourGames(games, t) { return (games || []).filter((g) => isUsT(g.home, t) || isUsT(g.away, t)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); }
/** The league's standings page when it can be worked out from the team's league link (CSSHL). */
export function standingsUrl(t) { const u = t && t.leagueUrl; if (hostOf(u) !== 'csshl.ca') return ''; const lg = (u.match(/[?&]league=(\d+)/) || [])[1]; return lg ? `https://www.csshl.ca/stats/standings?league=${lg}` : ''; }
export function leagueLabel(t) { return (t && (t.leagueName || hostOf(t.leagueUrl))) || 'league website'; }
export function slugify(s) { return String(s || '').replace(/['’]/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }

/* ---------- colour ---------- */
function rgb(hx) { hx = (hx || '#1f5fbf').replace('#', ''); if (hx.length === 3) hx = hx.split('').map((c) => c + c).join(''); const n = parseInt(hx, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toHex(c) { return '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
function lum(c) { const a = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
/** Readable text colour (white or near-black) on a background colour. */
export function onColor(color) { const c = rgb(color); return contrast(c, [255, 255, 255]) >= contrast(c, [17, 19, 23]) ? '#ffffff' : '#111317'; }
export function applyTheme(color) {
  const c = rgb(color), white = [255, 255, 255], ink = [17, 19, 23];
  const onAccent = contrast(c, white) >= contrast(c, ink) ? '#ffffff' : '#111317';
  let tl = c; for (let i = 0; i < 20 && contrast(tl, white) < 4.6; i++) tl = mix(tl, [0, 0, 0], 0.08);
  let td = c; const dbg = [21, 24, 30]; for (let i = 0; i < 20 && contrast(td, dbg) < 4.6; i++) td = mix(td, white, 0.1);
  const st = document.documentElement.style;
  st.setProperty('--team', toHex(c)); st.setProperty('--on-accent', onAccent);
  st.setProperty('--accent-text-l', toHex(tl)); st.setProperty('--accent-text-d', toHex(td));
}
