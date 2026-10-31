// Front and back muscle diagram (line art) that heat-maps injured regions: red = out,
// yellow = limited. Drawn for TeamHub (styled after a muscle-chart reference, not traced).
// Each figure is 100 × 216 units; shapes are drawn for the viewer's left half and mirrored.
// In the front view the athlete's right side is on the viewer's left; in the back view it's
// on the viewer's right. Region ids match REGIONS in lib/injury.js. With `onPick`, clicking
// a muscle picks it (used by the injury form).
import { REGIONS, STATUS, isActive } from '../lib/injury.js';

const COL = { out: '#dc2626', limited: '#eab308' };

// left half of the body outline, from the top of the head down to the crotch
const OUT = 'M50,4 C42,4 38,10 38,17 C38,24 41,29 44,31 L44,36 C38,38 30,39 25,42 C19,45 16,52 15,60 C13,70 13,80 12,88 C10,98 8,110 8.5,120 C7,126 5.5,132 6,139 C7,145 12,146 14,141 C15,136 16,130 17,124 C19,114 20,104 21,96 C22,90 23,84 24,78 C25,70 26,64 27,60 C28,72 30,82 31,90 C31,96 30,100 30,104 C29,116 30,130 33,148 C34,156 34,162 34,168 C33,180 34,192 36,200 C36,204 34,208 35,211 L47,212 C47,208 46,204 46,200 C47,188 47,174 46,164 C47,156 48,150 48,140 C49,128 49,118 50,113';
const BASE = OUT + ' L50,4 Z';

// { id, d: path on the viewer's left, c: [cx, cy, r] glow spot, m: also draw mirrored }
const SHARED = [
  { id: 'shoulder', d: 'M25,42 C19,45 16,52 15,60 C18,62 22,60 25,57 C27,52 28,46 25,42 Z', c: [21, 51, 8], m: true },
  { id: 'forearm', d: 'M12.5,92 C10.5,102 9.5,112 9.5,119 L16.5,121 C18,112 19.5,102 21,94 C18,91 15,91 12.5,92 Z', c: [15, 106, 9], m: true },
  { id: 'hand', d: 'M9.5,121 C7.5,128 6.5,134 7,139.5 C8.5,144.5 12.5,143.5 14,139.5 C15,134 16,128 16.5,123 Z', c: [11.5, 132, 7], m: true },
  { id: 'elbow', d: 'M13,86 C16,88 20,88 23,85 L22,93 C18,90 15,90 12.5,92 Z', c: [17.5, 89, 5], m: true },
  { id: 'knee', d: 'M34,150 C37,152 42,152 46,150 C46,156 46,160 46,164 C42,166 37,166 34,165 C34,160 34,155 34,150 Z', c: [40, 157.5, 7], m: true },
  { id: 'ankle', d: 'M36,197 C39,198 43,198 46,197 L46,203 C43,204 39,204 36,203 Z', c: [41, 200, 5], m: true },
  { id: 'foot', d: 'M36,203 C39,204 43,204 46,203 L47,212 L35,211 C34.5,208 35.5,205 36,203 Z', c: [41, 208, 5], m: true },
  { id: 'head', d: 'M50,4 C42,4 38,10 38,17 C38,24 41,29 44,31 C46,32.5 54,32.5 56,31 C59,29 62,24 62,17 C62,10 58,4 50,4 Z', c: [50, 17, 13] },
];
const VIEWS = {
  front: [
    ...SHARED,
    { id: 'neck', d: 'M44,31 C46,32.5 54,32.5 56,31 L56,37 C53,40 47,40 44,37 Z', c: [50, 35, 6] },
    { id: 'chest', d: 'M28,44 C35,41.5 44,42.5 49.5,45 L49.5,58 C44,62 35,62 29,58 C27,53 27,48 28,44 Z', c: [39, 51, 11], m: true },
    { id: 'upper_arm', d: 'M16,62 C14,70 14,78 14.5,85 C18,87 21,86 23,84 C24,76 24.5,68 25,59 C22,62 19,63 16,62 Z', c: [19.5, 73, 8], m: true },
    { id: 'abdomen', d: 'M42,63 L49.5,63 L49.5,100 C47,104 44,104 43,100 C42,88 41,74 42,63 Z', c: [46, 82, 10], m: true },
    { id: 'abdomen', d: 'M31,62 C35,64 39,64 41,64 C40,76 41,90 42,100 C38,98 34,96 31.5,92 C31,82 30.5,72 31,62 Z', c: [36, 80, 8], m: true },
    { id: 'hip', d: 'M30.5,97 C34,98 38,101 40,106 C36,107 33,106 30,105 C30,102 30.5,99 30.5,97 Z', c: [34, 102, 6], m: true },
    { id: 'groin', d: 'M40,107 C44,109 47,111 49.5,113.5 C47.5,126 45.5,136 44,143 C41.5,130 40.5,118 40,107 Z', c: [46, 120, 7], m: true },
    { id: 'quad', d: 'M30,106 C34,106 37,107 39.5,108 C40.5,122 42.5,136 44,147 C40,150 36.5,150 33,148 C31,134 29.5,120 30,106 Z', c: [36.5, 127, 9], m: true },
    { id: 'shin', d: 'M34.5,166 C37,166 41,166 44,165.5 C44,178 43,189 42,197 C39.5,197.5 37.5,197.5 36,197 C35,187 34,176 34.5,166 Z', c: [39, 181, 8], m: true },
  ],
  back: [
    ...SHARED,
    { id: 'neck', d: 'M44,31 C46,32.5 54,32.5 56,31 L56,36 L50,39 L44,36 Z', c: [50, 34.5, 6] },
    { id: 'upper_back', d: 'M50,33 C46,36 38,39 28,43 C34,46 42,52 47,62 L50,70 L53,62 C58,52 66,46 72,43 C62,39 54,36 50,33 Z', c: [50, 48, 12] },
    { id: 'upper_back', d: 'M28.5,47 C34,54 42,62 47,70 L48,84 C42,86 36,86 32,84 C30,72 28,60 28.5,47 Z', c: [38, 68, 10], m: true },
    { id: 'upper_arm', d: 'M16,62 C14,70 14,78 14.5,85 C18,87 21,86 23,84 C24,76 24.5,68 25,59 C22,62 19,63 16,62 Z', c: [19.5, 73, 8], m: true },
    { id: 'lower_back', d: 'M32,85 C38,87 44,86.5 48,85 L50,86 L50,100 C46,102 39,102 31,99 C31,94 31.5,89 32,85 Z', c: [41, 93, 8], m: true },
    { id: 'glute', d: 'M30.5,100 C37,102 44,102.5 49.5,102 L49.5,118 C44,122 36,121.5 31,116.5 C30,111 30,105 30.5,100 Z', c: [40, 110, 9], m: true },
    { id: 'hamstring', d: 'M31.5,119 C37,122 43,122.5 48,120.5 C47,134 45.5,143 44.5,149 C40.5,151 36.5,151 33.5,149 C32,139 31,129 31.5,119 Z', c: [39.5, 134, 9], m: true },
    { id: 'calf', d: 'M34.5,166 C38,163 43,163 45.5,165.5 C46.5,175 45.5,185 43.5,195 C40.5,197 37.5,197 36,195 C34.5,186 34,175 34.5,166 Z', c: [40, 179, 9], m: true },
  ],
};
// decorative lines (abs, sternum, spine) that aren't regions
const LINES = {
  front: 'M49.5,45 L49.5,100 M42.5,72 L49.5,72 M42,81 L49.5,81 M42.5,90 L49.5,90 M38,152 C40,150 42,150 44,152',
  back: 'M50,39 L50,102 M42,152 C40,155 40,159 42,162',
};

function shapes(view) {
  const ls = view === 'front' ? 'R' : 'L', rs = view === 'front' ? 'L' : 'R';
  return VIEWS[view].flatMap((p, k) => {
    const pair = REGIONS[p.id] && REGIONS[p.id].pair;
    const a = { ...p, key: `${p.id}${k}a`, side: pair ? ls : '', mir: false };
    return p.m ? [a, { ...p, key: `${p.id}${k}b`, side: pair ? rs : '', mir: true }] : [a];
  });
}

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
const MIRROR = 'translate(100 0) scale(-1 1)';

export default function Anatomy({ injuries, onPick, picked }) {
  const h = heat(injuries);
  const figure = (v, dx) => {
    const list = shapes(v);
    return <g transform={`translate(${dx} 0)`}>
      <path d={BASE} className="an-base" /><path d={BASE} className="an-base" transform={MIRROR} />
      {list.map((s) => { const st = h[s.id + '|' + s.side]; if (!st) return null; const [cx, cy, r] = s.c;
        return <circle key={'g' + s.key} cx={s.mir ? 100 - cx : cx} cy={cy} r={r + 6} fill={COL[st]} filter="url(#an-glow)" opacity=".55" />; })}
      {list.map((s) => {
        const st = h[s.id + '|' + s.side];
        const on = picked && picked.area === s.id && (!s.side || !picked.side || picked.side === 'both' || picked.side === s.side);
        return <path key={s.key} d={s.d} transform={s.mir ? MIRROR : undefined} className={`an-part ${st || ''} ${onPick ? 'pick' : ''} ${on ? 'on' : ''}`}
          onClick={onPick ? () => onPick(s.id, s.side) : undefined}>
          <title>{`${REGIONS[s.id].label}${s.side ? (s.side === 'L' ? ' (left)' : ' (right)') : ''}${st ? ': ' + STATUS[st].label : ''}`}</title></path>;
      })}
      <path d={LINES[v]} className="an-line" /><path d={LINES[v]} className="an-line" transform={MIRROR} />
      <path d={OUT} className="an-out" /><path d={OUT} className="an-out" transform={MIRROR} />
      <text className="an-cap" x="50" y="224">{v === 'front' ? 'Front' : 'Back'}</text>
      <text className="an-side" x="2" y="112">{v === 'front' ? 'R' : 'L'}</text><text className="an-side" x="98" y="112">{v === 'front' ? 'L' : 'R'}</text>
    </g>;
  };
  return <svg className="anatomy" viewBox="0 0 214 228" role="img" aria-label="Muscle diagram of injured areas">
    <defs><filter id="an-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" /></filter></defs>
    {figure('front', 0)}{figure('back', 114)}
  </svg>;
}
