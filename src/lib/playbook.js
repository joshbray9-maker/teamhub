// Playbook helpers: categories, a starting formation, and building the next step of a play
// from the arrows of the current one. Pure functions.
import { uid } from './util.js';

export const CATEGORIES = [['sets', 'Sets'], ['quick', 'Quick hitters'], ['blob', 'Baseline out of bounds'], ['slob', 'Sideline out of bounds'],
  ['press', 'Press break'], ['zone', 'Zone offense'], ['defense', 'Defense'], ['other', 'Other']];
export const catLabel = (k) => (CATEGORIES.find(([c]) => c === k) || [0, 'Other'])[1];
export const LINE_KINDS = [['cut', 'Cut'], ['pass', 'Pass'], ['dribble', 'Dribble'], ['screen', 'Screen']];

/** 5-out spacing with the ball at the top. Coordinates in feet (basket at the top). */
export function startFrame() {
  const spots = [[25, 31], [43, 22], [7, 22], [46, 5], [4, 5]];
  const players = spots.map(([x, y], i) => ({ id: uid(), kind: 'o', label: String(i + 1), x, y }));
  return { players: [...players, { id: uid(), kind: 'ball', label: '', x: 26.6, y: 32.4 }], lines: [] };
}
/** Next free label for a new offense ('o') or defense ('x') player. */
export function nextLabel(frame, kind) {
  const used = new Set(frame.players.filter((p) => p.kind === kind).map((p) => p.label));
  for (let i = 1; i < 10; i++) if (!used.has(String(i))) return String(i);
  return '';
}
const near = (p, x, y, r = 2.2) => Math.hypot(p.x - x, p.y - y) <= r;
/** The next step starts where this one's arrows end: a player moves along a cut, dribble or
 *  screen that starts at them, the ball follows a pass or a dribble. Lines are cleared. */
export function nextFrame(frame) {
  const players = frame.players.map((p) => ({ ...p }));
  for (const l of frame.lines) {
    if (l.kind === 'pass') { const b = players.find((p) => p.kind === 'ball' && near(p, l.x1, l.y1, 3.5)); if (b) { b.x = l.x2 + 1.6; b.y = l.y2 + 1.4; } continue; }
    const p = players.find((q) => q.kind !== 'ball' && near(q, l.x1, l.y1));
    if (!p) continue;
    if (l.kind === 'dribble') { const b = players.find((q) => q.kind === 'ball' && near(q, p.x, p.y, 3.5)); if (b) { b.x = l.x2 + 1.6; b.y = l.y2 + 1.4; } }
    p.x = l.x2; p.y = l.y2;
  }
  return { players, lines: [] };
}
