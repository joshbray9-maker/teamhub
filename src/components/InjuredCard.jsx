// "Injured players" card for pages without a player list (S&C, Practice plan): every player
// with an active injury, flagged red (out) or yellow (limited). Admins and coaches only;
// hidden when nobody is hurt.
import { useHub } from '../lib/hub.jsx';
import { currentInjury, nextStep, inDays } from '../lib/injury.js';
import { todayISO } from '../lib/util.js';
import { useRoster, where } from '../pages/Injury.jsx';
import InjuryFlag from './InjuryFlag.jsx';

export default function InjuredCard() {
  const H = useHub();
  const { roster } = useRoster();
  if (!H.isCoach || !roster) return null;
  const today = todayISO();
  const hurt = roster.map((p) => ({ p, i: currentInjury(p.id, H.tdata.injuries) })).filter((x) => x.i)
    .sort((a, b) => (a.i.status === b.i.status ? 0 : a.i.status === 'out' ? -1 : 1));
  if (!hurt.length) return null;
  return <section className="card inj-card">
    <div className="card-head"><h2>Injured players</h2><a href="#" className="small" onClick={(e) => { e.preventDefault(); H.go('injury'); }}>Injury report</a></div>
    <ul className="inj-list">{hurt.map(({ p, i }) => { const n = nextStep(i, today); return <li key={p.id}>
      <InjuryFlag p={p} label /><b>{p.num ? `#${p.num} ` : ''}{p.name}</b>
      <span className="muted small">{[i.injury || where(i), i.limitations, n && n.days !== null ? `${n.what.toLowerCase()} ${inDays(n.days)}` : ''].filter(Boolean).join(' · ')}</span>
    </li>; })}</ul>
  </section>;
}
