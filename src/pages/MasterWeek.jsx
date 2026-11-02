// Master schedule (team view): every team in this team's organization on one week, with the
// organization's time slots as rows (lib/slots.js) and games, practices, events and gym days in
// them. Gym days land in a slot once a coach sets their time in S&C; anything without a time sits
// in "Time not set". The month calendar for the whole organization is the org's own page.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtTime, fromISO, todayISO, MON, DOW, ORG_PAL, store } from '../lib/util.js';
import { mondayOf, addDays } from '../lib/sc.js';
import { orgSlots, weekItems, weekGrid } from '../lib/slots.js';
import PageHead from '../components/PageHead.jsx';
import Icon from '../components/Icon.jsx';

const KINDS = [['game', 'Games'], ['practice', 'Practices'], ['gym', 'Gym'], ['event', 'Events']];
const short = (d) => `${MON[fromISO(d).getMonth()]} ${fromISO(d).getDate()}`;

export default function MasterWeek() {
  const H = useHub(); const org = H.orgOf(H.team), teams = H.orgTeams(H.team.org_id), today = todayISO();
  const [data, setData] = useState(null), [mk, setMk] = useState(() => mondayOf(today));
  const [off, setOff] = useState(() => { try { return new Set(JSON.parse(store.get('masterOff:' + H.team.org_id) || '[]')); } catch { return new Set(); } });
  useEffect(() => { H.api.loadOrgData(teams.map((t) => t.id)).then(setData).catch((e) => { setData({}); H.toast('Could not load the schedule: ' + e.message); }); }, [H.team.org_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const flip = (k) => { const s = new Set(off); s.has(k) ? s.delete(k) : s.add(k); store.set('masterOff:' + H.team.org_id, JSON.stringify([...s])); setOff(s); };
  // cells show "U16 Hockey" rather than "BCS U16 Hockey": the org is already in the heading
  const strip = (n) => { const o = org ? org.name.trim() : ''; return o && n.toLowerCase().startsWith(o.toLowerCase() + ' ') ? n.slice(o.length + 1) : n; };
  const slots = orgSlots(org), colorOf = (t) => ORG_PAL[teams.findIndex((x) => x.id === t.id) % ORG_PAL.length];
  const items = data ? weekItems(teams, data, mk, colorOf).filter((x) => !off.has(x.tid) && !off.has(x.kind)) : [];
  const g = weekGrid(items, slots, mk);
  const label = (r) => r.slot ? `${fmtTime(r.slot[0])} – ${fmtTime(r.slot[1])}` : r.key === 'other' ? 'Other times' : 'Time not set';
  return <>
    <PageHead title="Master schedule" actions={<button className="btn" onClick={() => window.print()}><Icon n="clipboard" /> Print</button>} />
    <div className="mw-bar no-print">
      <div className="tchips" role="group" aria-label="Show teams">{teams.map((t) => <button key={t.id} className={`tchip ${off.has(t.id) ? 'off' : ''}`} onClick={() => flip(t.id)} aria-pressed={!off.has(t.id)}><i style={{ background: colorOf(t) }} /><span>{t.name}</span></button>)}</div>
      <div className="tchips" role="group" aria-label="Show">{KINDS.map(([k, l]) => <button key={k} className={`tchip ${off.has(k) ? 'off' : ''}`} onClick={() => flip(k)} aria-pressed={!off.has(k)}><span className={`mw-kind ${k}`} /><span>{l}</span></button>)}</div>
    </div>
    <section className="card">
      <div className="card-head"><div><h2>Week of {short(mk)} – {short(addDays(mk, 6))}</h2>
        <span className="muted small">{org ? org.name : ''}{slots ? '' : ' · no time slots set for this organization, so everything is listed by time'}</span></div>
        <div className="cal-nav no-print"><button className="icon-btn" onClick={() => setMk(addDays(mk, -7))} aria-label="Previous week"><Icon n="chevl" /></button>
          <button className="btn sm ghost" onClick={() => setMk(mondayOf(today))}>This week</button>
          <button className="icon-btn" onClick={() => setMk(addDays(mk, 7))} aria-label="Next week"><Icon n="chev" /></button></div></div>
      {!data ? <div className="loading">Loading…</div> : <div className="tbl-wrap"><table className="mw-grid">
        <thead><tr><th className="mw-slot">Time</th>{g.days.map((d) => <th key={d} className={d === today ? 'today' : ''}>{DOW[fromISO(d).getDay()]} <b>{fromISO(d).getDate()}</b></th>)}</tr></thead>
        <tbody>{(g.rows.length ? g.rows : [{ key: 'empty', cells: g.days.map(() => []) }]).map((r) => <tr key={r.key} className={typeof r.key === 'string' ? 'mw-extra' : ''}>
          <th className="mw-slot" scope="row">{r.key === 'empty' ? '—' : label(r)}</th>
          {r.cells.map((c, i) => <td key={i} className={g.days[i] === today ? 'today' : ''}>{c.map((x) => <div key={x.key} className={`mw-item ${x.kind} ${x.tid === H.team.id ? 'me' : ''}`} style={{ borderLeftColor: x.color }}
            title={[x.team, x.title, x.time && fmtTime(x.time), x.venue].filter(Boolean).join(' · ')}>
            <span className="mw-team" style={{ color: x.color }}>{strip(x.team)}</span>
            <span className="mw-title"><span className={`mw-kind ${x.kind}`} />{x.title}</span>
            {x.time && (!r.slot || x.time.slice(0, 5) !== r.slot[0]) && <span className="muted small">{fmtTime(x.time)}</span>}
          </div>)}</td>)}</tr>)}</tbody></table></div>}
      {data && !items.length && <p className="muted small" style={{ margin: '10px 0 0' }}>Nothing scheduled this week for the teams shown.</p>}
      <p className="muted small mw-foot">Gym days come from each team's S&C calendar; set a day's gym time there to place it in a slot.</p>
    </section>
  </>;
}
