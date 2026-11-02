// Master schedule (team view): every team in this team's organization on one week, with the
// organization's time slots as rows (lib/slots.js) and games, practices, events and gym days in
// them. Gym days take their time from S&C, else the organization's rotation (BCS); anything
// without a time sits in "Time not set". Coaches can change it by hand: click an item to move,
// retime or remove it, or click an empty spot to add gym, a practice or an event there.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, fmtTime, fromISO, todayISO, MON, DOW, ORG_PAL, store } from '../lib/util.js';
import { mondayOf, addDays } from '../lib/sc.js';
import { orgSlots, weekItems, weekGrid, gymWrites } from '../lib/slots.js';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';

const KINDS = [['game', 'Games'], ['practice', 'Practices'], ['gym', 'Gym'], ['event', 'Events']];
const short = (d) => `${MON[fromISO(d).getMonth()]} ${fromISO(d).getDate()}`;

export default function MasterWeek() {
  const H = useHub(); const org = H.orgOf(H.team), teams = H.orgTeams(H.team.org_id), today = todayISO();
  const [data, setData] = useState(null), [mk, setMk] = useState(() => mondayOf(today));
  const [off, setOff] = useState(() => { try { return new Set(JSON.parse(store.get('masterOff:' + H.team.org_id) || '[]')); } catch { return new Set(); } });
  const load = () => H.api.loadOrgData(teams.map((t) => t.id)).then(setData).catch((e) => { setData((d) => d || {}); H.toast('Could not load the schedule: ' + e.message); });
  useEffect(() => { load(); }, [H.team.org_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const flip = (k) => { const s = new Set(off); s.has(k) ? s.delete(k) : s.add(k); store.set('masterOff:' + H.team.org_id, JSON.stringify([...s])); setOff(s); };
  // cells show "U16 Hockey" rather than "BCS U16 Hockey": the org is already in the heading
  const strip = (n) => { const o = org ? org.name.trim() : ''; return o && n.toLowerCase().startsWith(o.toLowerCase() + ' ') ? n.slice(o.length + 1) : n; };
  const slots = orgSlots(org), colorOf = (t) => ORG_PAL[teams.findIndex((x) => x.id === t.id) % ORG_PAL.length];
  const items = data ? weekItems(teams, data, mk, colorOf, org).filter((x) => !off.has(x.tid) && !off.has(x.kind)) : [];
  const g = weekGrid(items, slots, mk);
  const label = (r) => r.slot ? `${fmtTime(r.slot[0])} – ${fmtTime(r.slot[1])}` : r.key === 'other' ? 'Other times' : 'Time not set';
  const ctx = { teams, org, slots, data, strip, colorOf, done: async (tid) => { await load(); if (tid === H.team.id) H.reloadTeam().catch(() => {}); } };
  const openItem = (x) => H.openDialog((c) => <ItemDialog x={x} ctx={ctx} close={c} />);
  const addAt = (date, time) => H.isCoach && H.openDialog((c) => <AddDialog date={date} time={time} ctx={ctx} close={c} />);
  return <>
    <PageHead title="Master schedule" actions={<button className="btn" onClick={() => window.print()}><Icon n="clipboard" /> Print</button>} />
    <div className="mw-bar no-print">
      <div className="tchips" role="group" aria-label="Show teams">{teams.map((t) => <button key={t.id} className={`tchip ${off.has(t.id) ? 'off' : ''}`} onClick={() => flip(t.id)} aria-pressed={!off.has(t.id)}><i style={{ background: colorOf(t) }} /><span>{t.name}</span></button>)}</div>
      <div className="tchips" role="group" aria-label="Show">{KINDS.map(([k, l]) => <button key={k} className={`tchip ${off.has(k) ? 'off' : ''}`} onClick={() => flip(k)} aria-pressed={!off.has(k)}><span className={`mw-kind ${k}`} /><span>{l}</span></button>)}</div>
    </div>
    <section className="card">
      <div className="card-head"><div><h2>Week of {short(mk)} – {short(addDays(mk, 6))}</h2>
        <span className="muted small">{org ? org.name : ''}{slots ? '' : ' · no time slots set for this organization, so everything is listed by time'}{H.isCoach ? ' · click an item to change it, or an empty spot to add one' : ''}</span></div>
        <div className="cal-nav no-print"><button className="icon-btn" onClick={() => setMk(addDays(mk, -7))} aria-label="Previous week"><Icon n="chevl" /></button>
          <button className="btn sm ghost" onClick={() => setMk(mondayOf(today))}>This week</button>
          <button className="icon-btn" onClick={() => setMk(addDays(mk, 7))} aria-label="Next week"><Icon n="chev" /></button></div></div>
      {!data ? <div className="loading">Loading…</div> : <div className="tbl-wrap"><table className="mw-grid">
        <thead><tr><th className="mw-slot">Time</th>{g.days.map((d) => <th key={d} className={d === today ? 'today' : ''}>{DOW[fromISO(d).getDay()]} <b>{fromISO(d).getDate()}</b></th>)}</tr></thead>
        <tbody>{(g.rows.length ? g.rows : [{ key: 'empty', cells: g.days.map(() => []) }]).map((r) => <tr key={r.key} className={typeof r.key === 'string' ? 'mw-extra' : ''}>
          <th className="mw-slot" scope="row">{r.key === 'empty' ? '—' : label(r)}</th>
          {r.cells.map((c, i) => <td key={i} className={`${g.days[i] === today ? 'today' : ''} ${H.isCoach ? 'mw-edit' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) addAt(g.days[i], r.slot ? r.slot[0] : ''); }}>
            {c.map((x) => <button type="button" key={x.key} className={`mw-item ${x.kind} ${x.tid === H.team.id ? 'me' : ''}`} style={{ borderLeftColor: x.color }} onClick={() => openItem(x)}
              title={[x.team, x.title, x.time && fmtTime(x.time), x.venue].filter(Boolean).join(' · ')}>
              <span className="mw-team" style={{ color: x.color }}>{strip(x.team)}</span>
              <span className="mw-title"><span className={`mw-kind ${x.kind}`} />{x.title}</span>
              {x.time && (!r.slot || x.time.slice(0, 5) !== r.slot[0]) && <span className="muted small">{fmtTime(x.time)}</span>}
            </button>)}
            {H.isCoach && <button type="button" className="mw-add no-print" onClick={() => addAt(g.days[i], r.slot ? r.slot[0] : '')} aria-label={`Add on ${fmtDate(g.days[i])}${r.slot ? ' at ' + fmtTime(r.slot[0]) : ''}`}><Icon n="plus" /></button>}
          </td>)}</tr>)}</tbody></table></div>}
      {data && !items.length && <p className="muted small" style={{ margin: '10px 0 0' }}>Nothing scheduled this week for the teams shown.</p>}
      <p className="muted small mw-foot">Gym days come from each team's S&C calendar; a gym day without its own time uses the organization's rotation{org && /bcs/i.test(org.slug || org.name) ? ' (Mon: basketball 3:30, U18 4:45, U16 6:00 · Tue & Wed: U16 3:30, U18 4:45, basketball 6:00)' : ''}. Changes made here save to that team's S&C calendar or schedule.</p>
    </section>
  </>;
}

/* Time: the slots, or another time. */
export function TimePick({ time, setTime, slots }) {
  const [custom, setCustom] = useState(!!time && !(slots || []).some(([a]) => a === time));
  return <div className="sc-time">
    <select className="select" value={custom ? 'custom' : time} onChange={(e) => { const v = e.target.value; setCustom(v === 'custom'); if (v !== 'custom') setTime(v); }} aria-label="Time slot">
      <option value="">No set time</option>{(slots || []).map(([a, b]) => <option key={a} value={a}>{fmtTime(a)} – {fmtTime(b)}</option>)}<option value="custom">Other time…</option></select>
    {custom && <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Start time" />}</div>;
}

function ItemDialog({ x, ctx, close }) {
  const H = useHub(); const team = ctx.teams.find((t) => t.id === x.tid);
  const [date, setDate] = useState(x.date), [time, setTime] = useState((x.time || '').slice(0, 5)), [title, setTitle] = useState(x.kind === 'gym' && !x.sc ? '' : x.title);
  const run = async (fn) => { close(); try { await fn(); H.toast('Schedule updated'); } catch (e) { H.toast(/permission|row-level|policy/i.test(e.message || '') ? 'You have view-only access for that team.' : 'Could not save. ' + e.message); } await ctx.done(x.tid); };
  const gym = (change) => run(async () => { for (const [d, v] of gymWrites(x, change, ctx.org, team)) await H.api.saveScDay(x.tid, d, v); });
  const ev = (del) => run(() => (del ? H.api.deleteEvent(x.ev.id) : H.api.saveEvents(x.tid, [{ ...x.ev, date, time, title: title.trim() || x.ev.title }])));
  const head = <div className="tchips"><span className="tchip"><i style={{ background: x.color }} /><span>{x.team}</span></span></div>;
  if (x.kind === 'game' || !H.isCoach) return <Modal title={x.kind === 'game' ? 'Game' : x.kind === 'gym' ? 'Gym' : x.kind === 'practice' ? 'Practice' : 'Event'} onClose={close} actions={<button className="btn" onClick={close}>Close</button>}>
    {head}<dl className="kv"><dt>What</dt><dd>{x.title}</dd><dt>Date</dt><dd>{fmtDate(x.date, true)}</dd><dt>Time</dt><dd>{x.time ? fmtTime(x.time) : 'Not set'}</dd>{x.venue && <><dt>Where</dt><dd>{x.venue}</dd></>}</dl>
    {x.kind === 'game' && H.isCoach && <p className="muted small">Games come from the team's schedule and league sync; change them on that team's Home page.</p>}
  </Modal>;
  const isGym = x.kind === 'gym';
  return <Modal title={isGym ? 'Gym' : x.kind === 'practice' ? 'Practice' : 'Event'} onClose={close}
    actions={<><button className="btn danger" onClick={() => (isGym ? gym(null) : ev(true))}><Icon n="trash" /> Remove</button><span className="spacer" /><button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" onClick={() => (isGym ? gym({ date, time, theme: title }) : ev(false))}>Save</button></>}>
    {head}
    <label className="field"><span>{isGym ? 'Day theme (optional)' : 'Title'}</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isGym ? 'e.g. Brick 1' : ''} /></label>
    <div className="row2"><label className="field"><span>Date</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || x.date)} /></label>
      <div className="field"><span>Time</span><TimePick time={time} setTime={setTime} slots={ctx.slots} /></div></div>
    {isGym && x.rot && !(x.sc && x.sc.time) && <p className="muted small">Placed by the rotation ({fmtTime(x.rot)} on {DOW[fromISO(x.date).getDay()]}). Saving keeps this day's time even if the rotation changes.</p>}
    {isGym && <p className="muted small">Saves to {x.team}'s S&C calendar. Remove marks the day off there.</p>}
  </Modal>;
}

function AddDialog({ date: d0, time: t0, ctx, close }) {
  const H = useHub();
  const [tid, setTid] = useState(H.team.id), [kind, setKind] = useState('gym'), [date, setDate] = useState(d0), [time, setTime] = useState(t0), [title, setTitle] = useState('');
  const save = async () => {
    if (kind !== 'gym' && !title.trim()) { H.toast('Add a title.'); return; }
    close();
    try {
      if (kind === 'gym') { const x = ((ctx.data[tid] || {}).sc || {})[date] || {}; await H.api.saveScDay(tid, date, { ...x, theme: title.trim() || x.theme || 'Gym', intensity: x.intensity === 'off' || x.intensity === 'game' ? '' : x.intensity || '', time }); }
      else await H.api.saveEvents(tid, [{ date, time, title: title.trim(), kind, location: '' }]);
      H.toast('Added to the schedule');
    } catch (e) { H.toast(/permission|row-level|policy/i.test(e.message || '') ? 'You have view-only access for that team.' : 'Could not save. ' + e.message); }
    await ctx.done(tid);
  };
  return <Modal title="Add to the schedule" onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>Add</button></>}>
    <div className="row2"><label className="field"><span>Team</span><select className="select" value={tid} onChange={(e) => setTid(e.target.value)}>{ctx.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="field"><span>What</span><select className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="gym">Gym</option><option value="practice">Practice</option><option value="event">Event</option></select></label></div>
    <label className="field"><span>{kind === 'gym' ? 'Day theme (optional)' : 'Title'}</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'gym' ? 'e.g. Brick 1' : kind === 'practice' ? 'e.g. Practice' : 'e.g. Team meeting'} /></label>
    <div className="row2"><label className="field"><span>Date</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || d0)} /></label>
      <div className="field"><span>Time</span><TimePick time={time} setTime={setTime} slots={ctx.slots} /></div></div>
    {kind === 'gym' && <p className="muted small">Saves to that team's S&C calendar for the day.</p>}
  </Modal>;
}
