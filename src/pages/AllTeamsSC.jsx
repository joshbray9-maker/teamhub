// All teams · S&C (Josh only): every team's S&C sessions, games and events on one sheet, laid
// out like the S&C spreadsheet (lib/master.js). Current week first, then the weeks ahead; earlier
// weeks on request. Fully editable: click a day for that team's S&C session, games and events
// that day; click Periodization / Week to change the week (one team or all of them). Changes
// save to each team's own S&C tab and schedule.
import { Fragment, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, fromISO, todayISO, MON, onColor, isUsT, schoolName } from '../lib/util.js';
import { mondayOf, INT } from '../lib/sc.js';
import { orgSlots } from '../lib/slots.js';
import { TimePick, spanError } from './MasterWeek.jsx';
import { fmtSpan } from '../lib/slots.js';
import Modal from '../components/Modal.jsx';
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
  const shown = [...ahead, ...(earlier ? past : [])].map((mk) => sheetWeek(teams, data, mk, H.orgOf));
  const done = async (tids) => { await H.reloadOrg(); if (tids.includes(H.teamId)) H.reloadTeam().catch(() => {}); };
  const editDay = (team, date) => H.openDialog((c) => <DayDialog team={team} date={date} d={data[team.id] || {}} done={done} close={c} />);
  const editWeek = (w, r) => H.openDialog((c) => <WeekDialog w={w} r={r} teams={teams} done={done} close={c} />);
  const head = <tr className="ms-head"><th>Date (Monday)</th><th>Team</th><th>Periodization</th><th>Week</th>{DAYS.map((d) => <th key={d}>{d.toUpperCase()}</th>)}</tr>;
  return <>
    <header className="page-head"><div><div className="eyebrow">Master schedule · only you can see this</div><h1>All teams · S&C</h1></div>
      <div className="head-actions"><button className="btn" onClick={() => window.print()}><Icon n="clipboard" /> Print</button></div></header>
    <section className="card">
      <div className="card-head"><div><h2>S&C, games and events</h2><span className="muted small">{teams.length} teams · practices not shown · colours are each day's intensity · click any day or the periodization to change it</span></div></div>
      {!loaded ? <div className="loading">Loading…</div> : <div className="tbl-wrap"><table className="ms-sheet">
        <tbody>{shown.map((w, wi) => <Fragment key={w.mk}>
          {(wi === 0 || w.mk === past[0]) && <>{w.mk === past[0] && wi > 0 && <tr className="ms-sep"><td colSpan={11}>Earlier weeks</td></tr>}{head}</>}
          {w.rows.map((r, ri) => <tr key={r.team.id} className={`${ri === 0 ? 'ms-first' : ''} ${w.mk === thisMon ? 'ms-now' : ''}`}>
            {ri === 0 && <th rowSpan={w.rows.length} className="ms-date" scope="rowgroup">{monday(w.mk)}{w.mk === thisMon && <span className="pill new">This week</span>}</th>}
            <th scope="row" className="ms-team" style={{ background: r.team.color, color: onColor(r.team.color || '#1f5fbf') }}>{r.team.name}</th>
            {(!w.samePhase || ri === 0) && <td rowSpan={w.samePhase ? w.rows.length : 1} className="ms-meta ms-click" onClick={() => editWeek(w, r)} title="Change periodization / week">{r.phase || (w.samePhase ? '' : '–')}</td>}
            {(!w.sameWeek || ri === 0) && <td rowSpan={w.sameWeek ? w.rows.length : 1} className="ms-meta ms-wk ms-click" onClick={() => editWeek(w, r)} title="Change periodization / week">{r.week}</td>}
            {r.cells.map((c, i) => <td key={i} className={`ms-day ms-click ${c.length === 1 ? c[0].cls : ''} ${w.days[i] === today ? 'today' : ''}`} onClick={() => editDay(r.team, w.days[i])} title={`${r.team.name} · ${fmtDate(w.days[i])}: click to change`}>
              {c.map((x, j) => <div key={j} className={`ms-it ${x.cls}`} title={x.time ? fmtSpan(x.time, x.end) : undefined}>{x.text}{x.time ? <span className="ms-time"> · {fmtSpan(x.time, x.end)}</span> : null}</div>)}
            </td>)}
          </tr>)}
        </Fragment>)}</tbody></table></div>}
      {loaded && past.length > 0 && <div className="no-print" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => setEarlier(!earlier)}>{earlier ? 'Hide earlier weeks' : `Show earlier weeks (${past.length})`}</button></div>}
    </section>
  </>;
}

const errMsg = (e) => (/permission|row-level|policy/i.test(e.message || '') ? 'You have view-only access for that team.' : 'Could not save. ' + (e.message || 'Try again.'));

/* One team, one day: the S&C session, the games and the events (practices aren't on this sheet). */
function DayDialog({ team, date, d, done, close }) {
  const H = useHub(); const slots = orgSlots(H.orgOf(team)) || [], us = schoolName(team);
  const x0 = (d.sc || {})[date] || {};
  const [sc, setSc] = useState({ theme: x0.theme || '', intensity: x0.intensity || '', time: (x0.time || '').slice(0, 5), end: x0.end || '', note: x0.note || '' });
  const [games, setGames] = useState(() => (d.games || []).filter((g) => g.date === date && (isUsT(g.home, team) || isUsT(g.away, team)))
    .map((g) => { const home = isUsT(g.home, team); return { g, opp: home ? g.away : g.home, ha: home ? 'h' : 'a', date: g.date, time: (g.time || '').slice(0, 5), venue: g.venue || '' }; }));
  const [events, setEvents] = useState(() => (d.events || []).filter((e) => e.date === date && e.kind !== 'practice').map((e) => ({ e, title: e.title, date: e.date, time: (e.time || '').slice(0, 5), end: e.end_time || '' })));
  const [gone, setGone] = useState({ games: [], events: [] });
  const upd = (list, set, i, k) => (ev) => set(list.map((r, j) => (j === i ? { ...r, [k]: ev.target.value } : r)));
  const drop = (list, set, i, k) => { const r = list[i]; if (r.g || r.e) setGone({ ...gone, [k]: [...gone[k], r.g ? r.g.id : r.e.id] }); set(list.filter((_, j) => j !== i)); };
  const save = async () => {
    if (games.some((r) => !r.opp.trim()) || events.some((r) => !r.title.trim())) { H.toast('Give every game an opponent and every event a title.'); return; }
    const bad = [sc, ...events].map((r) => spanError(r.time, r.end)).find(Boolean); if (bad) { H.toast(bad); return; }
    close();
    try {
      const theme = sc.theme.trim(), note = sc.note.trim();
      const val = theme || sc.intensity || sc.time || note ? { ...x0, theme, intensity: sc.intensity, time: sc.time, end: sc.time ? sc.end : '', note } : null;
      if (JSON.stringify(val) !== JSON.stringify(x0.theme || x0.intensity || x0.time || x0.note ? x0 : null)) await H.api.saveScDay(team.id, date, val);
      for (const id of gone.games) await H.api.deleteGame(id);
      for (const id of gone.events) await H.api.deleteEvent(id);
      const gs = games.map((r) => {
        const g = r.g || {}, Hm = r.ha === 'h', opp = r.opp.trim(), same = r.g && opp === (isUsT(g.home, team) ? g.away : g.home) && Hm === isUsT(g.home, team);
        const pair = same ? { home: g.home, away: g.away, hs: g.hs, as: g.as } : { home: Hm ? us : opp, away: Hm ? opp : us, hs: Hm === isUsT(g.home, team) ? g.hs : g.as, as: Hm === isUsT(g.home, team) ? g.as : g.hs };
        return { ...g, ...pair, id: g.id, date: r.date || date, time: r.time, venue: r.venue.trim(), round: g.round || '', source: g.source || 'manual', ext_id: g.ext_id || null };
      });
      if (gs.length) await H.api.saveGames(team.id, gs);
      const es = events.map((r) => ({ ...(r.e || { kind: 'event', location: '' }), id: r.e ? r.e.id : undefined, title: r.title.trim(), date: r.date || date, time: r.time, end_time: r.end }));
      if (es.length) await H.api.saveEvents(team.id, es);
      H.toast('Saved');
    } catch (e) { H.toast(errMsg(e)); }
    await done([team.id]);
  };
  return <Modal title={`${team.name} · ${fmtDate(date, true)}`} onClose={close}
    actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
    <h3 className="ms-dh">S&C session</h3>
    <label className="field"><span>Day theme</span><input className="input" value={sc.theme} onChange={(e) => setSc({ ...sc, theme: e.target.value })} placeholder="e.g. Brick 1, Supercharge, Regen" /></label>
    <div className="field"><span>Intensity</span><div className="iseg">{INT.map((i) => <button type="button" key={i.k} className={sc.intensity === i.k ? 'on' : ''} aria-pressed={sc.intensity === i.k} onClick={() => setSc({ ...sc, intensity: i.k })}><span className={`ibadge i-${i.k || 'none'}`}>{i.short}</span>{i.label}</button>)}</div></div>
    <div className="row2"><div className="field"><span>Gym time</span><TimePick time={sc.time} end={sc.end} set={(t, e) => setSc({ ...sc, time: t, end: e })} slots={slots} /></div>
      <label className="field"><span>Notes</span><input className="input" value={sc.note} onChange={(e) => setSc({ ...sc, note: e.target.value })} /></label></div>
    {(sc.theme || sc.intensity) && <button type="button" className="btn sm ghost" onClick={() => setSc({ theme: '', intensity: '', time: '', end: '', note: '' })}><Icon n="trash" /> Clear S&C session</button>}

    <h3 className="ms-dh">Games</h3>
    {games.map((r, i) => <div key={i} className="ms-row">
      <input className="input" value={r.opp} onChange={upd(games, setGames, i, 'opp')} placeholder="Opponent" aria-label="Opponent" />
      <select className="select" value={r.ha} onChange={upd(games, setGames, i, 'ha')} aria-label="Home or away"><option value="h">Home</option><option value="a">Away</option></select>
      <input type="date" className="input" value={r.date} onChange={upd(games, setGames, i, 'date')} aria-label="Date" />
      <input type="time" className="input" value={r.time} onChange={upd(games, setGames, i, 'time')} aria-label="Time" />
      <input className="input" value={r.venue} onChange={upd(games, setGames, i, 'venue')} placeholder="Venue" aria-label="Venue" />
      <button type="button" className="icon-btn" onClick={() => drop(games, setGames, i, 'games')} aria-label="Remove game"><Icon n="trash" /></button></div>)}
    <button type="button" className="btn sm" onClick={() => setGames([...games, { g: null, opp: '', ha: 'h', date, time: '', venue: '' }])}><Icon n="plus" /> Add game</button>

    <h3 className="ms-dh">Events</h3>
    {events.map((r, i) => <div key={i} className="ms-row ev">
      <input className="input" value={r.title} onChange={upd(events, setEvents, i, 'title')} placeholder="e.g. CADETS, tournament" aria-label="Event" />
      <input type="date" className="input" value={r.date} onChange={upd(events, setEvents, i, 'date')} aria-label="Date" />
      <input type="time" className="input" value={r.time} onChange={upd(events, setEvents, i, 'time')} aria-label="Start time" />
      <input type="time" className="input" value={r.end} onChange={upd(events, setEvents, i, 'end')} aria-label="End time" />
      <button type="button" className="icon-btn" onClick={() => drop(events, setEvents, i, 'events')} aria-label="Remove event"><Icon n="trash" /></button></div>)}
    <button type="button" className="btn sm" onClick={() => setEvents([...events, { e: null, title: '', date, time: '', end: '' }])}><Icon n="plus" /> Add event</button>
    <p className="muted small">Saves to {team.name}'s S&C tab and schedule. Changing a date moves the game or event.</p>
  </Modal>;
}

/* Periodization and season week for one week: this team, or every team. */
function WeekDialog({ w, r, teams, done, close }) {
  const H = useHub();
  const [phase, setPhase] = useState(r.phase), [week, setWeek] = useState(r.week), [all, setAll] = useState(w.samePhase && w.sameWeek);
  const save = async () => {
    close(); const ts = all ? teams : [r.team];
    try { for (const t of ts) await H.api.saveScWeek(t.id, w.mk, { phase: phase.trim(), week: week.trim() }); H.toast('Saved'); } catch (e) { H.toast(errMsg(e)); }
    await done(ts.map((t) => t.id));
  };
  return <Modal title={`Week of ${fmtDate(w.mk)}`} onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
    <div className="row2"><label className="field"><span>Periodization</span><input className="input" value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="e.g. GPP week 1" /></label>
      <label className="field"><span>Week</span><input className="input" value={week} onChange={(e) => setWeek(e.target.value)} placeholder="e.g. 1" /></label></div>
    <label className="small ts-ind"><input type="checkbox" className="cb" checked={all} onChange={(e) => setAll(e.target.checked)} /> Apply to all {teams.length} teams this week (otherwise only {r.team.name})</label>
  </Modal>;
}
