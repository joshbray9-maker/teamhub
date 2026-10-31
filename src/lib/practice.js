// Practice plans: block types per sport, running clock times and the CSV export. Pure functions.
// Block types are just labels for organising a practice and seeing its balance; edit them here.
export const BLOCK_TYPES = {
  basketball: [['warmup', 'Warm-up'], ['handling', 'Ball handling'], ['shooting', 'Shooting'], ['offense', 'Offense'], ['defense', 'Defense'], ['transition', 'Transition'], ['scrimmage', 'Scrimmage'], ['conditioning', 'Conditioning'], ['cooldown', 'Cool-down'], ['talk', 'Film / talk']],
  hockey: [['warmup', 'Warm-up'], ['skating', 'Skating'], ['skills', 'Puck skills'], ['games', 'Small-area games'], ['systems', 'Systems'], ['special', 'Special teams'], ['battle', 'Battle drills'], ['conditioning', 'Conditioning'], ['cooldown', 'Cool-down'], ['talk', 'Film / talk']],
  default: [['warmup', 'Warm-up'], ['skills', 'Skills'], ['tactics', 'Tactics'], ['games', 'Games'], ['scrimmage', 'Scrimmage'], ['conditioning', 'Conditioning'], ['cooldown', 'Cool-down'], ['talk', 'Film / talk']],
};
export const typesFor = (sport) => BLOCK_TYPES[sport] || BLOCK_TYPES.default;
const PAL = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#65a30d', '#64748b', '#a16207'];
export const typeColor = (sport, k) => { const i = typesFor(sport).findIndex(([x]) => x === k); return i < 0 ? '#94a3b8' : PAL[i % PAL.length]; };
export const typeLabel = (sport, k) => (typesFor(sport).find(([x]) => x === k) || [0, ''])[1];

const toMin = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** Each block with its start/end clock time ('' when the practice has no start time) and the total. */
export function timeline(start, blocks) {
  let t = toMin(start), total = 0;
  const rows = (blocks || []).map((b) => { const m = Math.max(0, Number(b.minutes) || 0); const r = { ...b, from: t === null ? '' : hhmm(t + total), to: t === null ? '' : hhmm(t + total + m) }; total += m; return r; });
  return { rows, total, end: t === null ? '' : hhmm(t + total) };
}
/** Minutes per block type, largest first. */
export function byType(blocks) {
  const m = {}; (blocks || []).forEach((b) => { m[b.type || ''] = (m[b.type || ''] || 0) + (Number(b.minutes) || 0); });
  return Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}
/** Rows for the CSV export (rows[0] = headings). */
export function practiceCsv(p, sport) {
  const { rows, total } = timeline(p.start_time, p.blocks);
  return [['Date', 'Start', 'End', 'Minutes', 'Type', 'Block', 'Notes'],
    ...rows.map((b) => [p.practice_on, b.from, b.to, b.minutes, typeLabel(sport, b.type), b.title, b.notes || '']),
    ['', '', '', total, '', 'Total', '']];
}
