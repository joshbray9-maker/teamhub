// Playbook helpers: categories and drawing tools per sport, a starting formation per surface,
// and building the next step of a play from the arrows of the current one. Pure functions.
import { uid } from './util.js';

const CATS = {
  basketball: [['sets', 'Sets'], ['quick', 'Quick hitters'], ['blob', 'Baseline out of bounds'], ['slob', 'Sideline out of bounds'], ['press', 'Press break'], ['zone', 'Zone offense'], ['defense', 'Defense'], ['other', 'Other']],
  hockey: [['breakout', 'Breakouts'], ['neutral', 'Neutral zone'], ['ozone', 'Offensive zone'], ['pp', 'Power play'], ['pk', 'Penalty kill'], ['faceoff', 'Faceoffs'], ['forecheck', 'Forecheck'], ['dzone', 'Defensive zone'], ['other', 'Other']],
};
export const categoriesFor = (sport) => CATS[sport] || CATS.basketball;
export const CATEGORIES = CATS.basketball;
export const catLabel = (k, sport) => (categoriesFor(sport).find(([c]) => c === k) || [0, 'Other'])[1];
const LINES = {
  basketball: [['cut', 'Cut'], ['pass', 'Pass'], ['dribble', 'Dribble'], ['screen', 'Screen']],
  hockey: [['cut', 'Skate'], ['pass', 'Pass'], ['dribble', 'Carry'], ['shot', 'Shot']],
};
export const lineKindsFor = (sport) => LINES[sport] || LINES.basketball;
export const LINE_KINDS = LINES.basketball;
export const surfacesFor = (sport) => (sport === 'hockey' ? ['rink-half', 'rink-full'] : ['court']);

/** Starting formation. Basketball: 5-out with the ball up top. Hockey: C, wingers and D in the
 *  offensive zone with the puck on the C's stick. Coordinates in feet. */
export function startFrame(surface = 'court') {
  if (surface === 'court') {
    const spots = [[25, 31], [43, 22], [7, 22], [46, 5], [4, 5]];
    return { players: [...spots.map(([x, y], i) => ({ id: uid(), kind: 'o', label: String(i + 1), x, y })), { id: uid(), kind: 'ball', label: '', x: 26.6, y: 32.4 }], lines: [] };
  }
  const spots = [['C', 158, 42.5], ['LW', 165, 14], ['RW', 165, 71], ['LD', 131, 20], ['RD', 131, 65]];
  return { players: [...spots.map(([label, x, y]) => ({ id: uid(), kind: 'o', label, x, y })), { id: uid(), kind: 'ball', label: '', x: 162, y: 45 }], lines: [] };
}
/** Next free label for a new offense ('o') or defense ('x') player. */
export function nextLabel(frame, kind) {
  const used = new Set(frame.players.filter((p) => p.kind === kind).map((p) => p.label));
  for (let i = 1; i < 10; i++) if (!used.has(String(i))) return String(i);
  return '';
}
const near = (p, x, y, r) => Math.hypot(p.x - x, p.y - y) <= r;
/** The next step starts where this one's arrows end: a player moves along a cut / skate, dribble /
 *  carry or screen that starts at them; the ball / puck follows a pass, shot, dribble or carry.
 *  `s` is the surface scale (1 court, 2 half rink, 3 full rink). Lines are cleared. */
export function nextFrame(frame, s = 1) {
  const players = frame.players.map((p) => ({ ...p }));
  const moveBall = (x0, y0, x2, y2) => { const b = players.find((p) => p.kind === 'ball' && near(p, x0, y0, 3.5 * s)); if (b) { b.x = x2 + 1.6 * s; b.y = y2 + 1.4 * s; } };
  for (const l of frame.lines) {
    if (l.kind === 'pass' || l.kind === 'shot') { moveBall(l.x1, l.y1, l.x2, l.y2); continue; }
    const p = players.find((q) => q.kind !== 'ball' && near(q, l.x1, l.y1, 2.2 * s));
    if (!p) continue;
    if (l.kind === 'dribble') moveBall(p.x, p.y, l.x2, l.y2);
    p.x = l.x2; p.y = l.y2;
  }
  return { players, lines: [] };
}
