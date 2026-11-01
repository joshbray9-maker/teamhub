// Weekly team snapshot (admins + coaches): one clean page per week (Monday to Sunday) for the
// coaching staff, with print / PDF. Games and results, the S&C week and its load, availability
// and injury changes, and any testing that week compared with the session before. Everything
// comes from data already in TeamHub; nothing is estimated.
import { useEffect, useState } from 'react';
import { useHub, useMetrics } from '../lib/hub.jsx';
import { fmtDate, fmtTime, todayISO, gameView, ourGames, hasScore } from '../lib/util.js';
import { INT, DEFAULT_LOADS, mondayOf, addDays } from '../lib/sc.js';
import { STATUS, currentInjury, isActive } from '../lib/injury.js';
import { METRICS, BATTERIES, metricOrder, metricSeries, teamSessions, fmt, testProfile } from '../lib/testing.js';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { useRoster, where, StatusPill } from './Injury.jsx';
import { IBadge } from './SC.jsx';

const inWeek = (d, mon) => !!d && d >= mon && d <= addDays(mon, 6);
const span = (mon) => { const sun = addDays(mon, 6); return `${fmtDate(mon).replace(/^\w+ /, '')} – ${fmtDate(sun).replace(/^\w+ /, '')}`; };

export default function WeeklySnapshot() {
  const M = useMetrics();
  const H = useHub(); const t = H.team;
  const [mon, setMon] = useState(mondayOf(todayISO()));
  const { roster } = useRoster();
  const [tests, setTests] = useState(null);
  useEffect(() => { H.api.listTests(t.id).then(setTests).catch(() => setTests({ sessions: [], results: [] })); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sun = addDays(mon, 6);
  const games = ourGames(H.tdata.league.games, t);
  const week = games.filter((g) => inWeek(g.date, mon)), next = games.filter((g) => inWeek(g.date, addDays(mon, 7)));
  let W = 0, L = 0, T = 0; week.forEach((g) => { const v = gameView(g, t); if (v.res === 'w') W++; else if (v.res === 'l') L++; else if (v.res === 't') T++; });
  const events = (H.tdata.events || []).filter((e) => inWeek(e.date, mon)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  // S&C week
  const sc = H.tdata.sc || {}, days = [...Array(7).keys()].map((i) => addDays(mon, i)), loads = { ...DEFAULT_LOADS, ...(sc.loads || {}) };
  const wk = (sc.weeks || {})[mon] || {};
  const load = days.reduce((s, d) => s + (loads[((sc.days || {})[d] || {}).intensity] || 0), 0);
  const prevLoad = [...Array(7).keys()].map((i) => addDays(mon, i - 7)).reduce((s, d) => s + (loads[((sc.days || {})[d] || {}).intensity] || 0), 0);
  // availability + injury changes
  const inj = H.tdata.injuries || [];
  const byId = Object.fromEntries((roster || []).map((p) => [p.id, p]));
  const now = (roster || []).map((p) => ({ p, i: currentInjury(p.id, inj) }));
  const out = now.filter((x) => x.i && x.i.status === 'out'), lim = now.filter((x) => x.i && x.i.status === 'limited');
  const newInj = inj.filter((i) => inWeek(i.injured_on, mon) && byId[i.player_id]);
  const back = inj.filter((i) => byId[i.player_id] && ((i.status === 'cleared' && inWeek(i.cleared_on, mon)) || (isActive(i) && inWeek(i.return_play, mon))));
  // testing this week vs the previous session of each test
  const series = tests ? metricSeries(teamSessions(tests.sessions, tests.teamFrom), tests.results) : {}; // team testing only
  const wkSessions = tests ? tests.sessions.filter((s) => inWeek(s.tested_on, mon)) : [];
  const testRows = metricOrder(testProfile(t, H.orgOf(t))).map((k) => { const pts = series[k] || []; const i = pts.findIndex((p) => inWeek(p.date, mon)); if (i < 0) return null;
    const p = pts[i], q = pts[i - 1]; const ch = q ? ((p.median - q.median) / q.median) * (M[k].lower ? -1 : 1) : null; return { k, p, q, ch }; }).filter(Boolean);
  const name = (pid) => (byId[pid] ? `${byId[pid].num ? '#' + byId[pid].num + ' ' : ''}${byId[pid].name}` : 'Removed player');

  const gameLine = (g) => { const v = gameView(g, t); return <li key={g.id}><span className="ws-d">{fmtDate(g.date)}{g.time ? ' · ' + fmtTime(g.time) : ''}</span>
    <b>{v.home ? 'vs' : '@'} {v.opp}</b>{hasScore(g) ? <span className={`pill ${v.res}`}>{v.res.toUpperCase()} {v.us}–{v.them}</span> : g.venue && <span className="muted">{g.venue}</span>}</li>; };
  return <div className="ws">
    <div className="ws-bar no-print">
      <button className="icon-btn" onClick={() => setMon(addDays(mon, -7))} aria-label="Previous week"><Icon n="chevl" /></button>
      <b>Week of {span(mon)}</b>
      <button className="icon-btn" onClick={() => setMon(addDays(mon, 7))} aria-label="Next week"><Icon n="chev" /></button>
      {mon !== mondayOf(todayISO()) && <button className="btn sm ghost" onClick={() => setMon(mondayOf(todayISO()))}>This week</button>}
      <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => window.print()}><Icon n="clipboard" /> Print / PDF</button>
    </div>
    <header className="print-only gp-head"><Logo t={t} cls="gp-logo" /><div className="gp-title"><div className="gp-team">{t.name}</div><div className="gp-vs">Week of {span(mon)}</div><div className="gp-meta">{fmtDate(mon, true)} to {fmtDate(sun, true)}</div></div><div className="gp-tag">Weekly snapshot</div></header>

    <section className="strip">
      <div className="tile"><div className="tile-k">Games this week</div><div className="tile-v tnum">{week.length ? (W + L + T ? `${W}–${L}${T ? '–' + T : ''}` : week.length) : '—'}</div><div className="tile-s">{week.length ? (W + L + T ? `${week.length} game${week.length === 1 ? '' : 's'} · W–L${T ? '–T' : ''}` : `${week.length} scheduled`) : 'No games'}</div></div>
      <div className="tile"><div className="tile-k">Availability now</div><div className="tile-v tnum">{roster ? `${now.length - out.length} / ${now.length}` : '…'}</div><div className="tile-s"><span className="cr-dot yellow" />{lim.length} limited · <span className="cr-dot red" />{out.length} out</div></div>
      <div className="tile"><div className="tile-k">S&C load</div><div className="tile-v tnum">{load}</div><div className="tile-s">{prevLoad ? `${load - prevLoad >= 0 ? '+' : ''}${load - prevLoad} vs last week` : 'Load units from the S&C plan'}{wk.phase ? ` · ${wk.phase}` : ''}</div></div>
    </section>

    <div className="ws-grid">
      <section className="card"><div className="card-head"><h2>Games</h2></div>
        {week.length ? <ul className="ws-list">{week.map(gameLine)}</ul> : <p className="muted small" style={{ margin: 0 }}>No games this week.</p>}
        {next.length > 0 && <><div className="ws-k">Next week</div><ul className="ws-list">{next.map(gameLine)}</ul></>}
        {events.length > 0 && <><div className="ws-k">Team events</div><ul className="ws-list">{events.map((e) => <li key={e.id}><span className="ws-d">{fmtDate(e.date)}{e.time ? ' · ' + fmtTime(e.time) : ''}</span><b>{e.title}</b>{e.location && <span className="muted">{e.location}</span>}</li>)}</ul></>}
      </section>

      <section className="card"><div className="card-head"><h2>S&C week</h2>{(wk.phase || wk.week) && <span className="muted small">{[wk.phase, wk.week && `Week ${wk.week}`].filter(Boolean).join(' · ')}</span>}</div>
        <ul className="ws-days">{days.map((d) => { const x = (sc.days || {})[d] || {}; return <li key={d}><span className="ws-d">{fmtDate(d)}</span><IBadge k={x.intensity} /><span>{x.theme || <span className="muted">—</span>}</span></li>; })}</ul>
        <div className="muted small">Load {load} ({Object.entries(loads).map(([k, v]) => `${(INT.find((i) => i.k === k) || {}).short}=${v}`).join(', ')}). Load units are your Workload settings, not a validated scale.</div>
      </section>

      <section className="card"><div className="card-head"><h2>Availability & injuries</h2></div>
        {!out.length && !lim.length ? <p className="muted small" style={{ margin: 0 }}>Everyone is available.</p>
          : <ul className="ws-list">{[...out, ...lim].map(({ p, i }) => <li key={p.id}><StatusPill i={i} /><b>{name(p.id)}</b><span className="muted">{[i.injury || where(i), i.return_play && `play ${fmtDate(i.return_play)}`].filter(Boolean).join(' · ')}</span></li>)}</ul>}
        {newInj.length > 0 && <><div className="ws-k">New this week</div><ul className="ws-list">{newInj.map((i) => <li key={i.id}><span className="ws-d">{fmtDate(i.injured_on)}</span><b>{name(i.player_id)}</b><span className="muted">{i.injury || where(i)} · {STATUS[i.status].label}</span></li>)}</ul></>}
        {back.length > 0 && <><div className="ws-k">Returning this week</div><ul className="ws-list">{back.map((i) => <li key={i.id}><span className="ws-d">{fmtDate(i.status === 'cleared' ? i.cleared_on : i.return_play)}</span><b>{name(i.player_id)}</b><span className="muted">{i.status === 'cleared' ? 'Cleared' : 'Expected back to play'}</span></li>)}</ul></>}
      </section>

      <section className="card"><div className="card-head"><h2>Testing</h2>{wkSessions.length > 0 && <span className="muted small">{wkSessions.map((s) => BATTERIES[s.battery].label).join(', ')}</span>}</div>
        {!testRows.length ? <p className="muted small" style={{ margin: 0 }}>No testing this week.</p>
          : <table className="tbl ws-tests"><thead><tr><th>Test</th><th className="num">Team median</th><th className="num">Previous</th><th className="num">Change</th><th className="num">n</th></tr></thead>
            <tbody>{testRows.map(({ k, p, q, ch }) => <tr key={k}><td>{M[k].long}</td><td className="num tnum"><b>{fmt(k, p.median)}</b> {M[k].unit}</td><td className="num tnum muted">{q ? fmt(k, q.median) : '—'}</td>
              <td className={`num tnum ${ch === null || M[k].neutral ? '' : ch > 0.0005 ? 'ws-up' : ch < -0.0005 ? 'ws-down' : ''}`}>{ch === null ? '—' : `${ch > 0 ? '▲' : ch < 0 ? '▼' : ''} ${Math.abs(ch * 100).toFixed(1)}%`}</td><td className="num tnum muted">{p.n}</td></tr>)}</tbody></table>}
        {testRows.length > 0 && <div className="muted small">Change: up is better (a faster time counts as up). Bodyweight and EUR changes aren't better or worse.</div>}
      </section>
    </div>
  </div>;
}
