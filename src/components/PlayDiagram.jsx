// Play diagrams on a basketball half court or a hockey rink (half: offensive zone; full).
// Coordinates are feet on the surface: court 50 × 47 (basket at the top, FIBA lines); rink
// 200 × 85 (attacking right), the half rink showing x 100–200. Notation: offense = labelled
// circles, defense = X, cut / skate = solid arrow, pass = dashed, dribble / carry = zigzag,
// screen = bar end (basketball), shot = double line (hockey). `s` scales marks to the surface.
import { forwardRef } from 'react';
import { RinkMarkings } from './Rink.jsx';

export const HOOP = { x: 25, y: 5.25 };
const R3 = 22.15, C3 = 3; // three-point radius and corner distance from the sideline (FIBA 6.75 m / 0.9 m)
const yc = HOOP.y + Math.sqrt(R3 * R3 - (25 - C3) * (25 - C3));
export const SURFACES = {
  court: { x0: 0, y0: 0, w: 50, h: 47, s: 1, label: 'Half court' },
  'rink-half': { x0: 100, y0: 0, w: 100, h: 85, s: 2, label: 'Half rink (offensive zone)' },
  'rink-full': { x0: 0, y0: 0, w: 200, h: 85, s: 3, label: 'Full rink' },
};
export const surfaceOf = (k) => SURFACES[k] || SURFACES.court;
// kept for code that predates rinks
export const W = 50, D = 47;

function CourtLines() {
  return <>
    <rect x="0" y="0" width={50} height={47} className="ct-floor" />
    <g className="ct-line">
      <rect x="0" y="0" width={50} height={47} fill="none" />
      <rect x="17" y="0" width="16" height="19" fill="none" />
      <circle cx="25" cy="19" r="6" fill="none" />
      <path d={`M${C3} 0 V${yc} A${R3} ${R3} 0 0 0 ${50 - C3} ${yc} V0`} fill="none" />
      <path d={`M${25 - 4.1} ${HOOP.y} A4.1 4.1 0 0 0 ${25 + 4.1} ${HOOP.y}`} fill="none" />
      <path d="M19 47 A6 6 0 0 1 31 47" fill="none" />
      <line x1="22" y1="4" x2="28" y2="4" className="ct-board" />
      <circle cx={HOOP.x} cy={HOOP.y} r="0.75" fill="none" className="ct-hoop" />
    </g>
  </>;
}

export const Court = forwardRef(function Court({ children, surface = 'court', className = '', ...p }, ref) {
  const sf = surfaceOf(surface);
  return <svg ref={ref} className={`court ${surface} ${className}`} viewBox={`${sf.x0 - 1} ${sf.y0 - 1} ${sf.w + 2} ${sf.h + 2}`} style={{ '--pds': sf.s }} {...p}>
    <defs><marker id="pd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--pd-ink)" /></marker></defs>
    {surface === 'court' ? <CourtLines /> : <RinkMarkings clip={`pd-clip-${surface}`} />}
    {children}
  </svg>;
});

/** SVG path for a line item; dribbles / carries are a zigzag that straightens for the arrow. */
export function linePath(l, s = 1) {
  const dx = l.x2 - l.x1, dy = l.y2 - l.y1, len = Math.hypot(dx, dy);
  if (l.kind !== 'dribble' || len < 3 * s) return `M${l.x1} ${l.y1} L${l.x2} ${l.y2}`;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, step = 1.1 * s, amp = 0.65 * s, end = len - 1.6 * s;
  let d = `M${l.x1} ${l.y1}`; let t = step, k = 1;
  for (; t < end; t += step, k = -k) d += ` L${l.x1 + ux * t + nx * amp * k} ${l.y1 + uy * t + ny * amp * k}`;
  return d + ` L${l.x2} ${l.y2}`;
}
function Line({ l, s, selected, ...p }) {
  const dx = l.x2 - l.x1, dy = l.y2 - l.y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, o = 0.45 * s;
  const sw = { strokeWidth: 0.32 * s };
  return <g className={`pd-line ${l.kind} ${selected ? 'sel' : ''}`} {...p}>
    <path d={linePath(l, s)} className="pd-hit" style={{ strokeWidth: 2 * s }} />
    {l.kind === 'shot'
      ? <><path d={`M${l.x1 + nx * o} ${l.y1 + ny * o} L${l.x2 + nx * o} ${l.y2 + ny * o}`} className="pd-stroke" style={sw} />
        <path d={`M${l.x1 - nx * o} ${l.y1 - ny * o} L${l.x2 - nx * o} ${l.y2 - ny * o}`} className="pd-stroke" style={sw} />
        <path d={`M${l.x1} ${l.y1} L${l.x2} ${l.y2}`} className="pd-stroke pd-ghost" style={sw} markerEnd="url(#pd-arrow)" /></>
      : <path d={linePath(l, s)} className="pd-stroke" style={sw} markerEnd={l.kind === 'screen' ? undefined : 'url(#pd-arrow)'} />}
    {l.kind === 'screen' && <line x1={l.x2 + nx * 1.2 * s} y1={l.y2 + ny * 1.2 * s} x2={l.x2 - nx * 1.2 * s} y2={l.y2 - ny * 1.2 * s} className="pd-stroke" style={sw} />}
  </g>;
}
function Player({ p, s, puck, selected, ...rest }) {
  // a CSS transform (in user units) so the viewer can animate players between steps
  return <g className={`pd-p ${p.kind} ${selected ? 'sel' : ''}`} style={{ transform: `translate(${p.x}px, ${p.y}px) scale(${s})` }} {...rest}>
    {p.kind === 'ball' ? (puck ? <ellipse rx="0.9" ry="0.6" className="pd-puck" /> : <circle r="0.8" className="pd-ball" />)
      : p.kind === 'x' ? <><circle r="1.7" className="pd-hitc" /><text className="pd-x" dy="0.85">{`X${p.label || ''}`}</text></>
        : <><circle r="1.6" className="pd-o" /><text className={`pd-n ${String(p.label).length > 1 ? 'two' : ''}`} dy="0.75">{p.label}</text></>}
  </g>;
}

/** One step of a play. With onItemDown, items report presses for editing: onItemDown(e, kind, id). */
export const Diagram = forwardRef(function Diagram({ frame, surface = 'court', sel, onItemDown, className = '', animate, ...p }, ref) {
  const f = frame || { players: [], lines: [] }; const s = surfaceOf(surface).s, puck = surface !== 'court';
  return <Court ref={ref} surface={surface} className={`${className} ${animate ? 'anim' : ''}`} {...p}>
    {(f.lines || []).map((l) => <Line key={l.id} l={l} s={s} selected={sel === l.id} onPointerDown={onItemDown ? (e) => onItemDown(e, 'line', l.id) : undefined} />)}
    {(f.players || []).map((x) => <Player key={x.id} p={x} s={s} puck={puck} selected={sel === x.id} onPointerDown={onItemDown ? (e) => onItemDown(e, 'player', x.id) : undefined} />)}
  </Court>;
});
