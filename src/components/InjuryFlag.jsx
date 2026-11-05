// Injury flag next to a player's name, wherever players are listed. Admins and coaches only;
// it appears automatically while the player has an active injury in the Injury report
// (red = out, yellow = hurt but can practise and play) and disappears once it's cleared.
import { useHub } from '../lib/hub.jsx';
import { injuryStatus } from '../lib/injury.js';

export default function InjuryFlag({ p, label }) {
  const H = useHub();
  if (!H.seesMed) return null;
  const s = injuryStatus(p, H.tdata.injuries);
  if (!s) return null;
  return <span className={`inj-flag ${s.level}`} title={s.label} role="img" aria-label={s.label}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14.5V2" /><path d="M3.5 2.5h8.5l-2 3 2 3H3.5z" /></svg>
    {label && <span>{s.level === 'out' ? 'Out' : 'Limited'}</span>}
  </span>;
}
