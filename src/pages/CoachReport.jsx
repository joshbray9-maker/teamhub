// Coach's report (admins + coaches): one page with what a coach needs before practice or a
// game: player availability and limitations (live from the Injury report) and the team
// readiness score.
// Readiness is a PLACEHOLDER: it will come from weekly testing metrics that aren't set up
// yet, and its scoring rules are Josh's to define. Nothing here estimates it.
import { useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import WeeklySnapshot from './WeeklySnapshot.jsx';
import { fmtDate, fmtTime, todayISO, gameView, ourGames, hasScore, daysUntil } from '../lib/util.js';
import { STATUS, currentInjury, nextStep, inDays, isActive } from '../lib/injury.js';
import PageHead from '../components/PageHead.jsx';
import Avatar from '../components/Avatar.jsx';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { useRoster, StatusPill, where } from './Injury.jsx';

export default function CoachReport() {
  const [view, setView] = useState('today');
  const H = useHub(); const t = H.team;
  const { roster, photos } = useRoster();
  if (!H.isCoach) return <><PageHead title="Coach's report" /><section className="card"><p className="muted" style={{ margin: 0 }}>The coach's report is only visible to coaches and admins.</p></section></>;
  const today = todayISO();
  const next = ourGames(H.tdata.league.games, t).find((g) => g.date >= today && !hasScore(g));
  const nv = next && gameView(next, t);
  const injuries = H.tdata.injuries || [];
  const rows = (roster || []).map((p) => ({ p, i: currentInjury(p.id, injuries) }));
  const out = rows.filter((r) => r.i && r.i.status === 'out'), lim = rows.filter((r) => r.i && r.i.status === 'limited'), ok = rows.filter((r) => !r.i);
  // every active injury with a limitation note, worst first
  const limits = injuries.filter((i) => isActive(i) && i.limitations.trim()).sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank);
  const byId = Object.fromEntries((roster || []).map((p) => [p.id, p]));
  const person = (p) => <span className="inj-who"><Avatar p={p} url={photos[p.photo]} size={26} /><b>{p.num ? `#${p.num} ` : ''}{p.name}</b>{p.position && <span className="muted small">{p.position}</span>}</span>;
  const group = (title, list, color) => list.length > 0 && <div className="cr-group">
    <div className={`cr-gh ${color}`}><i />{title} <span className="muted">{list.length}</span></div>
    <ul>{list.map(({ p, i }) => { const n = nextStep(i, today); return <li key={p.id} className="click" onClick={() => H.go('injury')}>
      {person(p)}{i && <span className="muted small">{i.injury || where(i)}{n && n.days !== null ? ` · ${n.what.toLowerCase()} ${inDays(n.days)}` : ''}</span>}</li>; })}</ul></div>;

  return <>
    <PageHead title="Coach's report" actions={<>{view === 'today' && <button className="btn" onClick={() => window.print()}><Icon n="clipboard" /> Print / PDF</button>}<div className="seg" role="tablist">{[['today', 'Today'], ['week', 'Weekly snapshot']].map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div></>} />
    {view === 'week' ? <WeeklySnapshot key={t.id} /> : <>
    <header className="print-only gp-head"><Logo t={t} cls="gp-logo" /><div className="gp-title"><div className="gp-team">{t.name}</div><div className="gp-meta">{fmtDate(today, true)}</div></div><div className="gp-tag">Coach's report</div></header>
    <section className="strip">
      <div className="tile">
        <div className="tile-k">Next game</div>
        <div className="tile-v">{next ? `${nv.home ? 'vs' : '@'} ${nv.opp}` : '—'}</div>
        <div className="tile-s">{next ? `${fmtDate(next.date)}${next.time ? ' · ' + fmtTime(next.time) : ''} · ${daysUntil(next.date) === 0 ? 'today' : inDays(daysUntil(next.date))}` : 'No game scheduled'}</div>
      </div>
      <div className="tile">
        <div className="tile-k">Availability</div>
        <div className="tile-v tnum">{roster ? `${ok.length + lim.length} / ${rows.length}` : '…'}</div>
        <div className="tile-s"><span className="cr-dot green" />{ok.length} available · <span className="cr-dot yellow" />{lim.length} limited · <span className="cr-dot red" />{out.length} out</div>
      </div>
      <div className="tile cr-ready">
        <div className="tile-k">Team readiness</div>
        <div className="tile-v">—</div>
        <div className="tile-s">Not set up yet: comes from weekly testing</div>
      </div>
    </section>
    {!roster ? <div className="loading">Loading…</div> : !roster.length ? <section className="card"><p className="muted" style={{ margin: 0 }}>Add players in the <a href="#" onClick={(e) => { e.preventDefault(); H.go('roster'); }}>Roster</a> tab to see availability here.</p></section> : <div className="cr-grid">
      <section className="card">
        <div className="card-head"><h2>Player availability</h2><a href="#" className="small cr-link" onClick={(e) => { e.preventDefault(); H.go('injury'); }}>Injury report</a></div>
        {group('Out', out, 'red')}{group('Limited: can practise and play', lim, 'yellow')}{group('Available', ok, 'green')}
      </section>
      <div className="cr-side">
        <section className="card">
          <div className="card-head"><h2>Player limitations</h2></div>
          {!limits.length ? <p className="muted small" style={{ margin: 0 }}>No limitations right now.</p>
            : <ul className="cr-limits">{limits.filter((i) => byId[i.player_id]).map((i) => { const p = byId[i.player_id]; return <li key={i.id}>
              <div className="cr-lh">{person(p)}<StatusPill i={i} /></div>
              <div className="muted small">{[i.injury, where(i)].filter(Boolean).join(' · ')}</div>
              <div className="cr-lt">{i.limitations}</div>
            </li>; })}</ul>}
        </section>
        <section className="card cr-ready-card">
          <div className="card-head"><h2>Team readiness</h2><span className="pill">Not set up yet</span></div>
          <p className="muted small" style={{ margin: 0 }}>This score will come from the team's weekly testing metrics once that testing is set up in TeamHub. Which tests count, how they're scored and what a good score is are still to be decided, so nothing is estimated here in the meantime.</p>
        </section>
      </div>
    </div>}
    </>}
  </>;
}
