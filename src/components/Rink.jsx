// Full hockey rink drawn to scale in feet (200 × 85): boards, goal lines, blue lines, centre
// line, faceoff circles and dots, goal creases, referee crease. Children are drawn on top
// in the same feet coordinates.
const W = 200, Hh = 85, R = 28, MID = Hh / 2;
const RED = '#d4202b', BLUE = '#2b6fc4';
const CIRCLES = [31, 169].flatMap((x) => [MID - 22, MID + 22].map((y) => [x, y]));
const NEUTRAL = [80, 120].flatMap((x) => [MID - 22, MID + 22].map((y) => [x, y]));

function Faceoff({ x, y }) {
  const hash = [-1, 1].flatMap((sy) => [-3, 3].map((dx) => `M${x + dx} ${y + sy * 15}v${sy * 2}`)).join('');
  const ls = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => `M${x + sx * 6} ${y + sy * 0.75}H${x + sx * 2}V${y + sy * 3.75}`)).join('');
  return <g stroke={RED} fill="none" strokeWidth="0.45">
    <circle cx={x} cy={y} r="15" /><path d={hash + ls} /><circle cx={x} cy={y} r="1" fill={RED} stroke="none" />
  </g>;
}

export default function Rink({ children, label = 'Hockey rink' }) {
  return <svg className="rink" viewBox={`-1 -1 ${W + 2} ${Hh + 2}`} role="img" aria-label={label}>
    <defs><clipPath id="rink-clip"><rect width={W} height={Hh} rx={R} /></clipPath></defs>
    <rect width={W} height={Hh} rx={R} fill="#fdfeff" />
    <g clipPath="url(#rink-clip)">
      <path d={`M11 0V${Hh}M${W - 11} 0V${Hh}`} stroke={RED} strokeWidth="0.45" />
      <path d={`M75 0V${Hh}M125 0V${Hh}`} stroke={BLUE} strokeWidth="1" />
      <path d={`M100 0V${Hh}`} stroke={RED} strokeWidth="0.6" />
      <circle cx="100" cy={MID} r="15" stroke={BLUE} strokeWidth="0.45" fill="none" />
      <circle cx="100" cy={MID} r="0.5" fill={BLUE} />
      {CIRCLES.map(([x, y]) => <Faceoff key={x + ':' + y} x={x} y={y} />)}
      {NEUTRAL.map(([x, y]) => <circle key={x + ':' + y} cx={x} cy={y} r="1" fill={RED} />)}
      <path d={`M11 ${MID - 6}A6 6 0 0 1 11 ${MID + 6}M${W - 11} ${MID - 6}A6 6 0 0 0 ${W - 11} ${MID + 6}M90 ${Hh}A10 10 0 0 1 110 ${Hh}`} stroke={RED} strokeWidth="0.45" fill="none" />
    </g>
    <rect width={W} height={Hh} rx={R} fill="none" stroke="#1b1f27" strokeWidth="0.7" />
    {children}
  </svg>;
}
