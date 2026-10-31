// Basketball half court (feet: 50 wide, 47 deep, basket at the top; FIBA lines) and a play
// diagram drawn on it. Notation: offense = numbered circles, defense = X, cut = solid arrow,
// pass = dashed arrow, dribble = zigzag arrow, screen = line ending in a bar.
import { forwardRef } from 'react';

export const W = 50, D = 47, HOOP = { x: 25, y: 5.25 };
const R3 = 22.15, C3 = 3; // three-point radius and corner distance from the sideline (FIBA 6.75 m / 0.9 m)
const yc = HOOP.y + Math.sqrt(R3 * R3 - (25 - C3) * (25 - C3));

export const Court = forwardRef(function Court({ children, className = '', ...p }, ref) {
  return <svg ref={ref} className={`court ${className}`} viewBox={`-1 -1 ${W + 2} ${D + 2}`} {...p}>
    <defs>
      <marker id="pd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--pd-ink)" /></marker>
    </defs>
    <rect x="0" y="0" width={W} height={D} className="ct-floor" />
    <g className="ct-line">
      <rect x="0" y="0" width={W} height={D} fill="none" />
      <rect x="17" y="0" width="16" height="19" fill="none" />
      <circle cx="25" cy="19" r="6" fill="none" />
      <path d={`M${C3} 0 V${yc} A${R3} ${R3} 0 0 0 ${W - C3} ${yc} V0`} fill="none" />
      <path d={`M${25 - 4.1} ${HOOP.y} A4.1 4.1 0 0 0 ${25 + 4.1} ${HOOP.y}`} fill="none" />
      <path d={`M19 ${D} A6 6 0 0 1 31 ${D}`} fill="none" />
      <line x1="22" y1="4" x2="28" y2="4" className="ct-board" />
      <circle cx={HOOP.x} cy={HOOP.y} r="0.75" fill="none" className="ct-hoop" />
    </g>
    {children}
  </svg>;
});

/** SVG path for a line item; dribbles are drawn as a zigzag that straightens for the arrow. */
export function linePath(l) {
  const dx = l.x2 - l.x1, dy = l.y2 - l.y1, len = Math.hypot(dx, dy);
  if (l.kind !== 'dribble' || len < 3) return `M${l.x1} ${l.y1} L${l.x2} ${l.y2}`;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, step = 1.1, amp = 0.65, end = len - 1.6;
  let d = `M${l.x1} ${l.y1}`; let s = step, k = 1;
  for (; s < end; s += step, k = -k) d += ` L${l.x1 + ux * s + nx * amp * k} ${l.y1 + uy * s + ny * amp * k}`;
  return d + ` L${l.x2} ${l.y2}`;
}
function Line({ l, selected, ...p }) {
  const dx = l.x2 - l.x1, dy = l.y2 - l.y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  return <g className={`pd-line ${l.kind} ${selected ? 'sel' : ''}`} {...p}>
    <path d={linePath(l)} className="pd-hit" />
    <path d={linePath(l)} className="pd-stroke" markerEnd={l.kind === 'screen' ? undefined : 'url(#pd-arrow)'} />
    {l.kind === 'screen' && <line x1={l.x2 + nx * 1.2} y1={l.y2 + ny * 1.2} x2={l.x2 - nx * 1.2} y2={l.y2 - ny * 1.2} className="pd-stroke" />}
  </g>;
}
function Player({ p, selected, ...rest }) {
  // a CSS transform (in user units) so the viewer can animate players between steps
  return <g className={`pd-p ${p.kind} ${selected ? 'sel' : ''}`} style={{ transform: `translate(${p.x}px, ${p.y}px)` }} {...rest}>
    {p.kind === 'ball' ? <circle r="0.8" className="pd-ball" />
      : p.kind === 'x' ? <><circle r="1.7" className="pd-hitc" /><text className="pd-x" dy="0.85">{`X${p.label || ''}`}</text></>
        : <><circle r="1.6" className="pd-o" /><text className="pd-n" dy="0.75">{p.label}</text></>}
  </g>;
}

/** One step of a play. `on` (optional) gets pointer handlers for editing: onItemDown(e, kind, id). */
export const Diagram = forwardRef(function Diagram({ frame, sel, onItemDown, className = '', animate, ...p }, ref) {
  const f = frame || { players: [], lines: [] };
  return <Court ref={ref} className={`${className} ${animate ? 'anim' : ''}`} {...p}>
    {(f.lines || []).map((l) => <Line key={l.id} l={l} selected={sel === l.id} onPointerDown={onItemDown ? (e) => onItemDown(e, 'line', l.id) : undefined} />)}
    {(f.players || []).map((x) => <Player key={x.id} p={x} selected={sel === x.id} onPointerDown={onItemDown ? (e) => onItemDown(e, 'player', x.id) : undefined} />)}
  </Court>;
});
