// Individual player profile (admins + coaches), one printable page: roster details and photo,
// current status with the body diagram, limitations and return timeline, testing (latest and
// best per test, team median, rank on the team, trend), gym group, and injury history.
// Opened from the Roster and the Injury report; Print / PDF prints just this page.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, todayISO } from '../lib/util.js';
import { STATUS, isActive, currentInjury, nextStep, inDays, daysFrom } from '../lib/injury.js';
import { METRICS, metricOrder, GROUPS, num, fmt, gymGroup, quantile } from '../lib/testing.js';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import Avatar from '../components/Avatar.jsx';
import Anatomy from '../components/Anatomy.jsx';
import { StatusPill, where } from './Injury.jsx';

export function openPlayerReport(H, p, photo) { H.openDialog((c) => <PlayerReport p={p} photo={photo} close={c} />); }

function PlayerReport({ p, photo, close }) {
  const H = useHub(); const t = H.team; const today = todayISO();
  const [d, setD] = useState(null);
  useEffect(() => {
    Promise.all([H.api.listTests(t.id), H.api.getGymConfig(t.id), H.api.listPlayers(t.id)])
      .then(([tests, gym, players]) => setD({ ...tests, gym, active: new Set(players.filter((x) => x.active !== false).map((x) => x.id)) }))
      .catch((e) => { setD({ sessions: [], results: [], gym: { targets: {}, overrides: {} }, active: new Set() }); H.toast('Could not load testing: ' + e.message); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const inj = (H.tdata.injuries || []).filter((i) => i.player_id === p.id);
  const active = inj.filter(isActive), past = inj.filter((i) => !isActive(i));
  const cur = currentInjury(p.id, inj);

  // testing: this player's results over time, and where they stand on the team
  let tests = [], group = null;
  if (d) {
    const date = Object.fromEntries(d.sessions.map((s) => [s.id, s.tested_on]));
    const mine = d.results.filter((r) => r.player_id === p.id).map((r) => ({ date: date[r.session_id], v: r.values || {} })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
    tests = metricOrder(t.sport).map((k) => {
      const pts = mine.map((r) => ({ date: r.date, value: num(r.v[k]) })).filter((x) => x.value !== null);
      if (!pts.length) return null;
      const last = pts[pts.length - 1], best = pts.reduce((b, x) => (METRICS[k].lower ? (x.value < b.value ? x : b) : (x.value > b.value ? x : b)));
      // the team on the session of this player's latest result: median and rank (active players)
      const sid = d.sessions.find((s) => s.tested_on === last.date && d.results.some((r) => r.session_id === s.id && r.player_id === p.id && num((r.values || {})[k]) !== null));
      const team = sid ? d.results.filter((r) => r.session_id === sid.id && d.active.has(r.player_id)).map((r) => num((r.values || {})[k])).filter((x) => x !== null).sort((a, b) => a - b) : [];
      const rank = 1 + team.filter((x) => (METRICS[k].lower ? x < last.value : x > last.value)).length;
      return { k, pts, last, best, median: quantile(team, 0.5), rank, n: team.length };
    }).filter(Boolean);
    const full = d.sessions.filter((s) => s.battery === 'full').sort((a, b) => b.tested_on.localeCompare(a.tested_on));
    for (const s of full) { const r = d.results.find((x) => x.session_id === s.id && x.player_id === p.id); if (r) { group = gymGroup(r.values || {}, d.gym.targets || {}, (d.gym.overrides || {})[p.id]); break; } }
  }
  const details = [['Position', p.position], ['Shoots', p.shoots === 'L' ? 'Left' : p.shoots === 'R' ? 'Right' : ''], ['Year', p.year], ['Height', p.height], ['Weight', p.weight && (/\d$/.test(p.weight) ? p.weight + ' lb' : p.weight)], ['Hometown', p.hometown]].filter(([, v]) => v);
  const Spark = ({ k, pts }) => { if (pts.length < 2) return <span className="muted small">—</span>;
    const W = 90, Hh = 24, v = pts.map((x) => x.value), lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
    const xy = pts.map((x, i) => `${(i / (pts.length - 1)) * (W - 4) + 2},${Hh - 3 - ((x.value - lo) / r) * (Hh - 6)}`);
    return <svg width={W} height={Hh} className="pr-spark" aria-hidden="true"><polyline points={xy.join(' ')} fill="none" stroke="var(--team)" strokeWidth="1.8" /><circle cx={xy[xy.length - 1].split(',')[0]} cy={xy[xy.length - 1].split(',')[1]} r="2.5" fill="var(--team)" /></svg>; };

  return <Modal title="Player profile" wide onClose={close} actions={<><span className="muted small">Coaches and admins only</span><span className="spacer" /><button className="btn" onClick={close}>Close</button><button className="btn primary" onClick={() => window.print()}><Icon n="clipboard" /> Print / PDF</button></>}>
    <div className="pr printable">
      <header className="gp-head pr-head"><Logo t={t} cls="gp-logo" /><div className="gp-title"><div className="gp-team">{t.name}</div><div className="gp-meta">Player profile · {fmtDate(today, true)}</div></div><div className="gp-tag">Player profile</div></header>
      <section className="pr-top">
        <Avatar p={p} url={photo} size={112} />
        <div className="pr-id">
          <h2 className="pr-name">{p.num && <span className="tnum">#{p.num} </span>}{p.name}</h2>
          <StatusPill i={cur} long />
          <dl className="pr-dl">{details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
        {group && group.group && <div className={`pr-group ${GROUPS[group.group].color}`}><div className="pr-k">Gym group</div><b>{GROUPS[group.group].label}</b><span>{GROUPS[group.group].focus}</span></div>}
      </section>

      <section className="pr-sec">
        <h3>Availability</h3>
        {!active.length ? <p className="muted" style={{ margin: 0 }}>No active injuries: available to practise and play.</p>
          : <div className="pr-inj"><div className="pr-body"><Anatomy injuries={active} /></div>
            <div className="pr-boxes">{active.map((i) => { const n = nextStep(i, today); return <div key={i.id} className={`prof-box ${STATUS[i.status].color}`}>
              <div className="prof-box-h"><b>{i.injury || where(i)}</b><StatusPill i={i} /></div>
              {i.injury && where(i) && <div className="muted small">{where(i)}</div>}
              <div className="prof-k">Limitations</div><div className="prof-v">{i.limitations || <span className="muted">None noted</span>}</div>
              <div className="prof-k">Timeline</div>
              <ul className="prof-tl">
                <li><span>Injured</span><b>{i.injured_on ? fmtDate(i.injured_on) : '—'}</b>{i.injured_on && <em>{inDays(daysFrom(today, i.injured_on))}</em>}</li>
                <li><span>Return to practice</span><b>{i.return_practice ? fmtDate(i.return_practice) : '—'}</b>{i.return_practice && <em>{inDays(daysFrom(today, i.return_practice))}</em>}</li>
                <li><span>Return to play</span><b>{i.return_play ? fmtDate(i.return_play) : '—'}</b>{i.return_play && <em>{inDays(daysFrom(today, i.return_play))}</em>}</li>
              </ul>
              {n && n.overdue && <div className="inj-overdue small">The return date has passed.</div>}
            </div>; })}</div></div>}
      </section>

      <section className="pr-sec">
        <h3>Testing</h3>
        {!d ? <p className="muted small" style={{ margin: 0 }}>Loading…</p> : !tests.length ? <p className="muted" style={{ margin: 0 }}>No test results yet.</p>
          : <table className="tbl pr-tests"><thead><tr><th>Test</th><th className="num">Latest</th><th className="num">Best</th><th className="num">Team median</th><th className="num">Rank</th><th>Trend</th></tr></thead>
            <tbody>{tests.map(({ k, pts, last, best, median, rank, n }) => <tr key={k}>
              <td><b>{METRICS[k].long}</b>{METRICS[k].lower && <span className="muted small"> (lower is better)</span>}</td>
              <td className="num tnum"><b>{fmt(k, last.value)}</b> {METRICS[k].unit}<div className="muted small">{fmtDate(last.date)}</div></td>
              <td className="num tnum">{METRICS[k].neutral ? '—' : <>{fmt(k, best.value)}<div className="muted small">{fmtDate(best.date)}</div></>}</td>
              <td className="num tnum">{median === null ? '—' : fmt(k, median)}</td>
              <td className="num tnum">{n > 1 && !METRICS[k].neutral ? `${rank} of ${n}` : '—'}</td>
              <td><Spark k={k} pts={pts} /></td>
            </tr>)}</tbody></table>}
        {group && <div className="muted small">{group.group ? `Gym group: ${group.reason}.` : `Gym group: ${group.reason}.`}</div>}
      </section>

      {past.length > 0 && <section className="pr-sec"><h3>Injury history</h3>
        <ul className="pr-hist">{past.map((i) => <li key={i.id}><b>{i.injury || where(i)}</b><span className="muted">{[where(i) !== i.injury && where(i), i.injured_on && fmtDate(i.injured_on), i.cleared_on && `cleared ${fmtDate(i.cleared_on)}`].filter(Boolean).join(' · ')}</span></li>)}</ul></section>}
    </div>
  </Modal>;
}
