// Athlete reports (admins + coaches): every rostered athlete; open one for their full testing
// history over a chosen time frame (this season, last 3 / 12 months, everything, or custom
// dates): a summary per test, a chart of each test against the team median, and every result by
// date. Print / PDF gives a one-athlete report to send out. Individual testing days count for the
// athlete; the team median only uses team testing (lib/testing.js athleteHistory). Edit testing
// opens the athlete's whole history as one grid to fix or add to in bulk (AthleteTesting.jsx).
// Below the testing, the athlete's game-by-game self-assessments (SelfAssess.jsx).
import { useEffect, useMemo, useState } from 'react';
import { useHub, useMetrics } from '../lib/hub.jsx';
import { fmtDate, todayISO } from '../lib/util.js';
import { athleteHistory, reportRange, testProfile, metricOrder, fmt } from '../lib/testing.js';
import { useRoster } from './Injury.jsx';
import PageHead from '../components/PageHead.jsx';
import Avatar from '../components/Avatar.jsx';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import AthleteTesting from './AthleteTesting.jsx';
import { PlayerFile } from './SelfAssess.jsx';

const PRESETS = [['season', 'This season'], ['3m', 'Last 3 months'], ['12m', 'Last 12 months'], ['all', 'All testing'], ['custom', 'Custom dates']];

export default function AthleteReports() {
  const H = useHub(); const t = H.team;
  const { roster, photos } = useRoster();
  const [tests, setTests] = useState(null), [pid, setPid] = useState(null), [q, setQ] = useState(''), [edit, setEdit] = useState(false), [assess, setAssess] = useState([]);
  const loadAssess = () => H.api.listSelfAssessments(t.id).then(setAssess).catch(() => setAssess([]));
  const load = () => H.api.listTests(t.id).then(setTests).catch((e) => { setTests((x) => x || { sessions: [], results: [] }); H.toast('Could not load testing: ' + e.message); });
  useEffect(() => { if (H.isCoach) { load(); loadAssess(); } }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!H.isCoach) return <><PageHead title="Athlete reports" /><section className="card"><p className="muted" style={{ margin: 0 }}>Athlete reports are only visible to coaches and admins.</p></section></>;
  if (!roster || !tests) return <><PageHead title="Athlete reports" /><div className="loading">Loading…</div></>;
  const p = pid && roster.find((x) => x.id === pid);
  if (p && edit) return <AthleteTesting key={p.id} p={p} tests={tests} prof={testProfile(t, H.orgOf(t))} back={() => setEdit(false)} onSaved={load} />;
  if (p) return <Report p={p} photo={photos[p.photo]} tests={tests} assess={assess} reloadAssess={loadAssess} back={() => setPid(null)} onEdit={() => setEdit(true)} />;
  const when = Object.fromEntries(tests.sessions.map((s) => [s.id, s.tested_on]));
  const stats = (id) => { const d = tests.results.filter((r) => r.player_id === id && when[r.session_id]).map((r) => when[r.session_id]).sort(); return { n: d.length, last: d[d.length - 1] }; };
  const list = roster.filter((x) => !q.trim() || `${x.num} ${x.name} ${x.position}`.toLowerCase().includes(q.trim().toLowerCase()));
  return <>
    <PageHead title="Athlete reports" />
    <section className="card">
      <div className="card-head"><div><h2>Athletes</h2><span className="muted small">Open an athlete for their testing history and a printable report.</span></div>
        <input className="input ar-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, # or position" aria-label="Search athletes" /></div>
      {!roster.length ? <p className="muted small" style={{ margin: 0 }}>Add players in the Roster tab first.</p>
        : <ul className="ar-list">{list.map((x) => { const s = stats(x.id); return <li key={x.id}><button className="ar-item" onClick={() => setPid(x.id)}>
          <Avatar p={x} url={photos[x.photo]} size={40} />
          <span className="ar-who"><b>{x.num ? `#${x.num} ` : ''}{x.name}</b><span className="muted small">{[x.position, s.n ? `${s.n} testing day${s.n === 1 ? '' : 's'} · last ${fmtDate(s.last, true)}` : 'No testing yet'].filter(Boolean).join(' · ')}</span></span>
          <Icon n="chev" /></button></li>; })}</ul>}
    </section>
  </>;
}

function Report({ p, photo, tests, assess, reloadAssess, back, onEdit }) {
  const H = useHub(); const M = useMetrics(); const t = H.team; const prof = testProfile(t, H.orgOf(t)); const today = todayISO();
  const [preset, setPreset] = useState('season');
  const [custom, setCustom] = useState(() => reportRange('season', today, tests.teamFrom));
  const range = preset === 'custom' ? custom : reportRange(preset, today, tests.teamFrom);
  const h = useMemo(() => athleteHistory(tests.sessions, tests.results, tests.teamFrom, p.id, range.from, range.to, prof), [tests, p.id, range.from, range.to, prof]);
  const cols = metricOrder(prof).filter((k) => h.days.some((d) => d.values[k] !== undefined && d.values[k] !== null && d.values[k] !== ''));
  const span = range.from || range.to ? `${range.from ? fmtDate(range.from, true) : 'First test'} to ${range.to ? fmtDate(range.to, true) : 'today'}` : 'All testing';
  const pct = (c) => `${c > 0 ? '▲' : c < 0 ? '▼' : ''} ${Math.abs(c * 100).toFixed(1)}%`;
  return <>
    <PageHead title="Athlete reports" actions={<><button className="btn" onClick={back}>← All athletes</button><button className="btn" onClick={onEdit}><Icon n="edit" /> Edit testing</button><button className="btn primary" onClick={() => window.print()}><Icon n="clipboard" /> Print / PDF</button></>} />
    <header className="print-only gp-head"><Logo t={t} cls="gp-logo" /><div className="gp-title"><div className="gp-team">{t.name}</div><div className="gp-meta">Athlete testing report · {span}</div></div><div className="gp-tag">Athlete report</div></header>
    <section className="card ar-head">
      <Avatar p={p} url={photo} size={72} />
      <div className="ar-id"><h2>{p.num ? `#${p.num} ` : ''}{p.name}</h2><span className="muted">{[p.position, t.name].filter(Boolean).join(' · ')}</span>
        <span className="small">{span} · {h.days.length} testing day{h.days.length === 1 ? '' : 's'}</span></div>
      <div className="ar-range no-print">
        <select className="select" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Time frame">{PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {preset === 'custom' && <><input type="date" className="input" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From" /><span className="muted small">to</span>
          <input type="date" className="input" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To" /></>}
      </div>
    </section>
    {!h.days.length ? <section className="card"><p className="muted" style={{ margin: 0 }}>No testing for {p.name} in this time frame. Try <b>All testing</b>, or add results with <b>Edit testing</b>.</p></section> : <>
      <section className="card ar-sec">
        <div className="card-head"><h2>Summary</h2><span className="muted small">Change: latest vs first in this time frame (up is better; a faster time counts as up)</span></div>
        <div className="tbl-wrap"><table className="tbl ar-sum"><thead><tr><th>Test</th><th className="num">First</th><th className="num">Latest</th><th className="num">Change</th><th className="num">Best</th><th className="num">Team median</th><th className="num">Tests</th></tr></thead>
          <tbody>{h.tests.map((x) => { const m = M[x.k], tm = x.team[x.team.length - 1]; return <tr key={x.k}>
            <td><b>{m.long}</b>{m.unit && <span className="muted small"> ({m.unit})</span>}</td>
            <td className="num tnum">{fmt(x.k, x.first.value)}<div className="muted small">{fmtDate(x.first.date)}</div></td>
            <td className="num tnum"><b>{fmt(x.k, x.latest.value)}</b><div className="muted small">{fmtDate(x.latest.date)}</div></td>
            <td className={`num tnum ${x.change === null ? '' : x.change > 0.0005 ? 'ws-up' : x.change < -0.0005 ? 'ws-down' : ''}`}>{x.change === null ? '—' : pct(x.change)}</td>
            <td className="num tnum">{x.best ? fmt(x.k, x.best.value) : '—'}</td>
            <td className="num tnum">{tm ? fmt(x.k, tm.median) : '—'}{tm && <div className="muted small">{fmtDate(tm.date)}</div>}</td>
            <td className="num tnum muted">{x.pts.length}</td></tr>; })}</tbody></table></div>
      </section>
      <div className="ar-charts">{h.tests.map((x) => <Chart key={x.k} x={x} m={M[x.k]} />)}</div>
      <section className="card ar-sec">
        <div className="card-head"><h2>All results</h2>{h.days.some((d) => d.individual) && <span className="muted small">* individual testing day</span>}</div>
        <div className="tbl-wrap"><table className="tbl ar-all"><thead><tr><th>Date</th>{cols.map((k) => <th key={k} className="num">{M[k].label}</th>)}</tr></thead>
          <tbody>{h.days.map((d, i) => <tr key={d.date + i}><td>{fmtDate(d.date, true)}{d.individual ? ' *' : ''}</td>{cols.map((k) => <td key={k} className={M[k].text ? '' : 'num tnum'}>{d.values[k] === undefined || d.values[k] === '' ? '–' : fmt(k, d.values[k])}</td>)}</tr>)}</tbody></table></div>
      </section>
      <p className="muted small ar-foot">Team median: team testing days only. Individual testing days count for the athlete. Results are the athlete's own; nothing here is estimated.</p>
    </>}
    <section className="card ar-sec">
      <div className="card-head"><h2>Self-assessments</h2><span className="muted small">{p.name}'s own answers after each game</span></div>
      <PlayerFile p={p} list={assess} reload={reloadAssess} />
    </section>
  </>;
}

/* One test over time: the athlete (solid) and the team median (dashed). */
function Chart({ x, m }) {
  const W = 300, Ht = 120, L = 34, R = 8, T = 10, B = 20;
  const dates = [...new Set([...x.pts.map((p) => p.date), ...x.team.map((p) => p.date)])].sort();
  const vals = [...x.pts.map((p) => p.value), ...x.team.map((p) => p.median)];
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1;
  const xp = (d) => (dates.length < 2 ? (L + W - R) / 2 : L + (dates.indexOf(d) / (dates.length - 1)) * (W - L - R));
  const yp = (v) => T + ((hi + pad - v) / (hi - lo + 2 * pad)) * (Ht - T - B);
  const line = (pts, key) => pts.map((p) => `${xp(p.date)},${yp(p[key])}`).join(' ');
  return <section className="card ar-chart">
    <div className="tr-h"><b>{m.long}</b><span className="muted small">{m.lower ? 'lower is better' : m.neutral ? '' : 'higher is better'}</span></div>
    <svg viewBox={`0 0 ${W} ${Ht}`} role="img" aria-label={`${m.long} over time`}>
      {[lo, hi].map((v, i) => <text key={i} x={L - 4} y={yp(v) + 3} className="ax" textAnchor="end">{fmt(x.k, v)}</text>)}
      {x.team.length > 1 && <polyline points={line(x.team, 'median')} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 3" />}
      {x.team.map((p) => <circle key={'t' + p.date} cx={xp(p.date)} cy={yp(p.median)} r="2.5" fill="var(--muted)"><title>{`Team median ${fmtDate(p.date)}: ${fmt(x.k, p.median)}`}</title></circle>)}
      {x.pts.length > 1 && <polyline points={line(x.pts, 'value')} fill="none" stroke="var(--team)" strokeWidth="2.2" />}
      {x.pts.map((p, i) => <circle key={i} cx={xp(p.date)} cy={yp(p.value)} r="3.5" fill="var(--team)"><title>{`${fmtDate(p.date)}: ${fmt(x.k, p.value)} ${m.unit}`}</title></circle>)}
      <text x={L} y={Ht - 5} className="ax">{fmtDate(dates[0]).replace(/^\w+ /, '')}</text>{dates.length > 1 && <text x={W - R} y={Ht - 5} className="ax" textAnchor="end">{fmtDate(dates[dates.length - 1]).replace(/^\w+ /, '')}</text>}
    </svg>
    <div className="muted small"><span className="ar-key me" /> athlete <span className="ar-key tm" /> team median</div>
  </section>;
}
