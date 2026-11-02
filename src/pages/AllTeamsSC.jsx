// All teams · S&C (Josh only): every team's S&C sessions, games and events on one sheet, laid
// out like the S&C spreadsheet (lib/master.js). Current week first, then the weeks ahead; earlier
// weeks on request. Read-only: change things in each team's S&C tab or master schedule.
import { Fragment, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtTime, fromISO, todayISO, MON, onColor } from '../lib/util.js';
import { mondayOf } from '../lib/sc.js';
import { sheetWeeks, sheetWeek, sheetOrder } from '../lib/master.js';
import Icon from '../components/Icon.jsx';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ord = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const monday = (mk) => `${MON[fromISO(mk).getMonth()]} ${ord(fromISO(mk).getDate())}`;

export default function AllTeamsSC() {
  const H = useHub(); const teams = sheetOrder(H.orgTeams('all')), data = H.orgData, today = todayISO(), thisMon = mondayOf(today);
  const [earlier, setEarlier] = useState(false);
  const loaded = teams.every((t) => data[t.id]);
  const weeks = loaded ? sheetWeeks(teams, data, today) : [];
  const ahead = weeks.filter((m) => m >= thisMon), past = weeks.filter((m) => m < thisMon).reverse();
  const shown = [...ahead, ...(earlier ? past : [])].map((mk) => sheetWeek(teams, data, mk));
  const head = <tr className="ms-head"><th>Date (Monday)</th><th>Team</th><th>Periodization</th><th>Week</th>{DAYS.map((d) => <th key={d}>{d.toUpperCase()}</th>)}</tr>;
  return <>
    <header className="page-head"><div><div className="eyebrow">Master schedule · only you can see this</div><h1>All teams · S&C</h1></div>
      <div className="head-actions"><button className="btn" onClick={() => window.print()}><Icon n="clipboard" /> Print</button></div></header>
    <section className="card">
      <div className="card-head"><div><h2>S&C, games and events</h2><span className="muted small">{teams.length} teams · practices not shown · colours are each day's intensity from the team's S&C tab</span></div></div>
      {!loaded ? <div className="loading">Loading…</div> : <div className="tbl-wrap"><table className="ms-sheet">
        <tbody>{shown.map((w, wi) => <Fragment key={w.mk}>
          {(wi === 0 || w.mk === past[0]) && <>{w.mk === past[0] && wi > 0 && <tr className="ms-sep"><td colSpan={11}>Earlier weeks</td></tr>}{head}</>}
          {w.rows.map((r, ri) => <tr key={r.team.id} className={`${ri === 0 ? 'ms-first' : ''} ${w.mk === thisMon ? 'ms-now' : ''}`}>
            {ri === 0 && <th rowSpan={w.rows.length} className="ms-date" scope="rowgroup">{monday(w.mk)}{w.mk === thisMon && <span className="pill new">This week</span>}</th>}
            <th scope="row" className="ms-team" style={{ background: r.team.color, color: onColor(r.team.color || '#1f5fbf') }}>{r.team.name}</th>
            {(!w.samePhase || ri === 0) && <td rowSpan={w.samePhase ? w.rows.length : 1} className="ms-meta">{r.phase || (w.samePhase ? '' : '–')}</td>}
            {(!w.sameWeek || ri === 0) && <td rowSpan={w.sameWeek ? w.rows.length : 1} className="ms-meta ms-wk">{r.week}</td>}
            {r.cells.map((c, i) => <td key={i} className={`ms-day ${c.length === 1 ? c[0].cls : ''} ${w.days[i] === today ? 'today' : ''}`}>
              {c.map((x, j) => <div key={j} className={`ms-it ${x.cls}`} title={x.time ? fmtTime(x.time) : undefined}>{x.text}{x.time && x.kind !== 'sc' ? <span className="ms-time"> · {fmtTime(x.time)}</span> : null}</div>)}
            </td>)}
          </tr>)}
        </Fragment>)}</tbody></table></div>}
      {loaded && past.length > 0 && <div className="no-print" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => setEarlier(!earlier)}>{earlier ? 'Hide earlier weeks' : `Show earlier weeks (${past.length})`}</button></div>}
    </section>
  </>;
}
