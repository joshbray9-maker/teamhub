// Coach's report (admins + coaches): one page with what a coach needs before practice or a
// game: player availability and limitations (live from the Injury report), the latest team
// testing results, and team readiness.
// Readiness uses only Josh's confirmed CMJ jump height and RSImod flag rules (lib/testing.js,
// FLAG_RULES): each athlete's latest result against their own recent tests. There is no
// overall readiness score: the description just counts and names the flags.
import { useEffect, useState } from 'react';
import { useHub, useMetrics } from '../lib/hub.jsx';
import WeeklySnapshot from './WeeklySnapshot.jsx';
import { fmtDate, fmtTime, todayISO, gameView, ourGames, hasScore, daysUntil } from '../lib/util.js';
import { METRICS, BATTERIES, BASELINE_TESTS, fmt, weeklyTesting, readiness, testProfile } from '../lib/testing.js';
import { STATUS, currentInjury, nextStep, inDays, isActive } from '../lib/injury.js';
import PageHead from '../components/PageHead.jsx';
import Avatar from '../components/Avatar.jsx';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { useRoster, StatusPill, where } from './Injury.jsx';

export default function CoachReport() {
  const M = useMetrics();
  const [view, setView] = useState('today');
  const H = useHub(); const t = H.team;
  const { roster, photos } = useRoster();
  const [tests, setTests] = useState(null);
  useEffect(() => { if (H.isCoach) H.api.listTests(t.id).then(setTests).catch(() => setTests({ sessions: [], results: [] })); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // latest team testing and readiness against each athlete's own recent tests
  const wk = tests && weeklyTesting(tests.sessions, tests.results, tests.teamFrom, testProfile(t, H.orgOf(t)));
  const ready = wk ? readiness(tests.sessions, tests.results, tests.teamFrom, wk.session).filter((x) => byId[x.player_id]) : [];
  const count = (f) => ready.filter((x) => f(x.flag)).length;
  const rd = { red: count((f) => f === 'red'), orange: count((f) => f === 'orange'), ok: count((f) => f === 'green' || f === 'none'), first: count((f) => f === null) };
  const age = wk ? -daysUntil(wk.session.tested_on) : null;
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
        <div className="tile-v tnum">{!tests ? '…' : !wk || rd.ok + rd.orange + rd.red === 0 ? '—' : `${rd.ok} / ${rd.ok + rd.orange + rd.red} on track`}</div>
        <div className="tile-s">{!wk ? 'No team testing yet' : <><span className="cr-dot yellow" />{rd.orange} orange · <span className="cr-dot red" />{rd.red} red · {fmtDate(wk.session.tested_on)}</>}</div>
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
        <Readiness wk={wk} ready={ready} rd={rd} age={age} tests={tests} person={(id) => person(byId[id])} />
      </div>
    </div>}
    {roster && roster.length > 0 && <WeeklyTesting wk={wk} tests={tests} />}
    </>}
  </>;
}

const pct = (c) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${Math.abs(c).toFixed(1)}%`;
const RULE = { cmj_jh: 'CMJ: a drop of 5–10% is orange, 10% or more red', rsimod: 'RSImod: a drop of more than 5% is orange, 13% or more red' };

/* Team readiness: a short description from the flags, then who is flagged and why. */
function Readiness({ wk, ready, rd, age, tests, person }) {
  const M = useMetrics();
  if (!tests) return <section className="card"><div className="card-head"><h2>Team readiness</h2></div><div className="muted small">Loading…</div></section>;
  const med = (k) => wk && wk.rows.find((r) => r.k === k);
  const line = (k) => { const r = med(k); if (!r) return null; return `team ${M[k].label} median ${fmt(k, r.median)}${M[k].unit ? ' ' + M[k].unit : ''}${r.change === null ? '' : ` (${pct(r.change * 100)} vs ${fmtDate(wk.prev.tested_on)})`}`; };
  const flagged = ['red', 'orange'].flatMap((f) => ready.filter((x) => x.flag === f));
  const why = (x) => Object.entries(x.tests).filter(([, v]) => v.flag === 'red' || v.flag === 'orange').map(([k, v]) => `${M[k].label} ${pct(v.change)}`).join(', ');
  const rated = rd.ok + rd.orange + rd.red;
  return <section className="card cr-ready-card">
    <div className="card-head"><h2>Team readiness</h2>{wk && <span className="pill">{fmtDate(wk.session.tested_on)}</span>}</div>
    {!wk ? <p className="muted small" style={{ margin: 0 }}>No team testing yet. Readiness comes from CMJ jump height and RSImod in the team's testing (S&amp;C → Tests).</p> : <>
      <p className="cr-rtext">
        {age > 7 && <><b>No team testing in the past week</b>: this is from {fmtDate(wk.session.tested_on, true)} ({age} days ago). </>}
        {rated === 0 ? <>The {fmtDate(wk.session.tested_on)} testing has no earlier CMJ or RSImod results to compare with yet, so nobody is flagged.</>
          : <>From the {fmtDate(wk.session.tested_on)} testing, <b>{rd.ok} of {rated}</b> athletes are on track against their own recent tests{[rd.orange && `${rd.orange} moderately down (orange)`, rd.red && `${rd.red} well down (red)`].filter(Boolean).map((x) => `, ${x}`).join('')}.</>}
        {rd.first > 0 && <> {rd.first} had no earlier test to compare with.</>}
        {[line('cmj_jh'), line('rsimod')].filter(Boolean).length > 0 && <> Overall: {[line('cmj_jh'), line('rsimod')].filter(Boolean).join('; ')}.</>}
      </p>
      {flagged.length > 0 && <ul className="cr-flags">{flagged.map((x) => <li key={x.player_id}><span className={`cr-dot ${x.flag === 'red' ? 'red' : 'yellow'}`} />{person(x.player_id)}<span className="muted small">{why(x)}</span></li>)}</ul>}
      <p className="muted small" style={{ margin: 0 }}>Each athlete's latest CMJ jump height and RSImod against the mean of their previous {BASELINE_TESTS} tests. {RULE.cmj_jh}; {RULE.rsimod}.</p>
    </>}
  </section>;
}

/* The latest team testing session: each test's team median and change since the previous one. */
function WeeklyTesting({ wk, tests }) {
  const M = useMetrics();
  return <section className="card">
    <div className="card-head"><h2>Weekly testing results</h2>{wk && <span className="muted small">{fmtDate(wk.session.tested_on, true)} · {BATTERIES[wk.session.battery].label} · {wk.n} athletes</span>}</div>
    {!tests ? <div className="muted small">Loading…</div> : !wk ? <p className="muted small" style={{ margin: 0 }}>No team testing yet. Enter it in S&amp;C → Tests.</p>
      : <table className="tbl ws-tests"><thead><tr><th>Test</th><th className="num">Team median</th><th className="num">{wk.prev ? `Previous (${fmtDate(wk.prev.tested_on)})` : 'Previous'}</th><th className="num">Change</th><th className="num">n</th></tr></thead>
        <tbody>{wk.rows.map(({ k, median, prev, change, n }) => <tr key={k}><td>{M[k].long}</td><td className="num tnum"><b>{fmt(k, median)}</b> {M[k].unit}</td><td className="num tnum muted">{prev === null ? '—' : fmt(k, prev)}</td>
          <td className={`num tnum ${change === null || M[k].neutral ? '' : change > 0.0005 ? 'ws-up' : change < -0.0005 ? 'ws-down' : ''}`}>{change === null ? '—' : `${change > 0 ? '▲' : change < 0 ? '▼' : ''} ${Math.abs(change * 100).toFixed(1)}%`}</td><td className="num tnum muted">{n}</td></tr>)}</tbody></table>}
    {wk && wk.rows.length > 0 && <div className="muted small">Team testing only (individual days and testing before the team-averages date are left out). Up is better; a faster time counts as up. Bodyweight and EUR changes aren't better or worse.</div>}
  </section>;
}
