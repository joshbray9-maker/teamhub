// Front and back body diagram that heat-maps injured regions (red = out, yellow = limited).
// Regions match REGIONS in lib/injury.js. In the front view the athlete's right side is on
// the viewer's left; in the back view it's on the viewer's right. With `onPick`, clicking a
// region picks it (used by the injury form).
import { REGIONS, STATUS, isActive } from '../lib/injury.js';

const COL = { out: '#dc2626', limited: '#eab308' };
const e = (cx, cy, rx, ry = rx) => ({ t: 'e', cx, cy, rx, ry });
const r = (x, y, w, h, rr = 4) => ({ t: 'r', x, y, w, h, rr });
const mirror = (s) => (s.t === 'e' ? { ...s, cx: 100 - s.cx } : { ...s, x: 100 - s.x - s.w });
// [region, shape on the viewer's left] — paired regions are mirrored to the right
const COMMON = [['shoulder', e(32, 40, 8, 6.5)], ['upper_arm', r(22, 45, 9, 25)], ['elbow', e(26.5, 73, 4.6)], ['forearm', r(21, 77, 9, 24)], ['hand', e(25.5, 107, 5, 7)], ['knee', e(43.2, 139, 6, 5)], ['ankle', e(43.2, 184, 5, 4)], ['foot', e(42, 192, 6.5, 4)]];
const VIEWS = {
  front: [['head', e(50, 16, 10, 12)], ['neck', r(45, 27, 10, 8, 2)], ['chest', r(36, 35, 28, 22, 7)], ['abdomen', r(38, 58, 24, 21, 5)], ['groin', e(50, 89, 4, 5.5)],
    ...COMMON, ['hip', e(40.5, 85, 6, 6.5)], ['quad', r(37.5, 96, 11.5, 38, 5.5)], ['shin', r(38.8, 145, 8.8, 35, 4)]],
  back: [['head', e(50, 16, 10, 12)], ['neck', r(45, 27, 10, 8, 2)], ['upper_back', r(36, 35, 28, 22, 7)], ['lower_back', r(38, 58, 24, 21, 5)],
    ...COMMON, ['glute', e(43, 87, 7, 7.5)], ['hamstring', r(37.5, 96, 11.5, 38, 5.5)], ['calf', r(38.8, 145, 8.8, 35, 4)]],
};
function parts(view) {
  const leftSide = view === 'front' ? 'R' : 'L', rightSide = view === 'front' ? 'L' : 'R';
  return VIEWS[view].flatMap(([id, s]) => (REGIONS[id].pair ? [{ id, side: leftSide, s }, { id, side: rightSide, s: mirror(s) }] : [{ id, side: '', s }]));
}
// centre and size of a shape, for the heat spot drawn around an injured region
const spot = (s) => (s.t === 'e' ? { x: s.cx, y: s.cy, r: Math.max(s.rx, s.ry) } : { x: s.x + s.w / 2, y: s.y + s.h / 2, r: Math.max(s.w, s.h) / 2 });
const Shape = ({ s, ...p }) => (s.t === 'e' ? <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...p} /> : <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rr} {...p} />);

/** worst active status per "region|side" ('' side on a paired region marks both sides) */
function heat(injuries) {
  const h = {};
  for (const i of injuries || []) {
    if (!isActive(i) || !i.body_area || !REGIONS[i.body_area]) continue;
    const sides = REGIONS[i.body_area].pair ? (i.side === 'L' || i.side === 'R' ? [i.side] : ['L', 'R']) : [''];
    for (const sd of sides) { const k = i.body_area + '|' + sd; if (!h[k] || STATUS[i.status].rank > STATUS[h[k]].rank) h[k] = i.status; }
  }
  return h;
}

export default function Anatomy({ injuries, onPick, picked }) {
  const h = heat(injuries);
  const view = (v, dx) => <g transform={`translate(${dx} 0)`}>
    <text className="an-cap" x="50" y="214">{v === 'front' ? 'Front' : 'Back'}</text>
    <text className="an-side" x="12" y="125">{v === 'front' ? 'R' : 'L'}</text><text className="an-side" x="88" y="125">{v === 'front' ? 'L' : 'R'}</text>
    {parts(v).map(({ id, side, s }) => { const st = h[id + '|' + side]; if (!st) return null; const c = spot(s); return <circle key={'g' + id + side} cx={c.x} cy={c.y} r={c.r + 7} fill={COL[st]} filter="url(#an-glow)" opacity=".6" />; })}
    {parts(v).map(({ id, side, s }) => {
      const st = h[id + '|' + side]; const on = picked && picked.area === id && (picked.side === side || !side || picked.side === 'both' || !picked.side);
      return <Shape key={id + side} s={s} className={`an-part ${st || ''} ${onPick ? 'pick' : ''} ${on ? 'on' : ''}`}
        onClick={onPick ? () => onPick(id, side) : undefined}><title>{`${REGIONS[id].label}${side ? (side === 'L' ? ' (left)' : ' (right)') : ''}${st ? ': ' + STATUS[st].label : ''}`}</title></Shape>;
    })}
  </g>;
  return <svg className="anatomy" viewBox="0 0 220 220" role="img" aria-label="Body diagram of injured areas">
    <defs><filter id="an-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4.5" /></filter></defs>
    {view('front', 0)}{view('back', 120)}
  </svg>;
}
