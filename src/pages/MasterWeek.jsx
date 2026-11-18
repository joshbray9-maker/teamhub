// Master schedule (team view): every team in this team's organization on one week, with the
// organization's time slots as rows (lib/slots.js) and games, practices, events and gym days in
// them. Gym days take their time from S&C, else the organization's rotation (BCS); anything
// without a time sits in "Time not set". Coaches can change it by hand: click an item to move,
// retime or remove it, or click an empty spot to add gym, a practice or an event there.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, fmtTime, fromISO, todayISO, MON, DOW, ORG_PAL, store } from '../lib/util.js';
import { mondayOf, addDays, INT } from '../lib/sc.js';
import { orgSlots, weekItems, weekGrid, gymWrites, fmtSpan } from '../lib/slots.js';
import { FREQS, MAX_REPEATS, repeatDates, laterLike, usedThemes } from '../lib/repeat.js';
import { IBadge } from './SC.jsx';
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
  const ctx = { teams, org, slots, data, themes: data ? usedThemes(teams, data) : [], strip, colorOf, done: async (tid) => { await load(); if (tid === H.team.id) H.reloadTeam().catch(() => {}); } };
  const openItem = (x) => H.openDialog((c) => <ItemDialog x={x} ctx={ctx} close={c} />);
  const addAt = (date, slot) => H.isCoach && H.openDialog((c) => <AddDialog date={date} time={slot ? slot[0] : ''} end={slot ? slot[1] : ''} ctx={ctx} close={c} />);
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
          {r.cells.map((c, i) => <td key={i} className={`${g.days[i] === today ? 'today' : ''} ${H.isCoach ? 'mw-edit' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) addAt(g.days[i], r.slot); }}>
            {c.map((x) => <button type="button" key={x.key} className={`mw-item ${x.kind} ${x.tid === H.team.id ? 'me' : ''}`} style={{ borderLeftColor: x.color }} onClick={() => openItem(x)}
              title={[x.team, x.title, fmtSpan(x.time, x.end), x.venue].filter(Boolean).join(' · ')}>
              <span className="mw-team" style={{ color: x.color }}>{strip(x.team)}</span>
              <span className="mw-title"><span className={`mw-kind ${x.kind}`} />{x.title}</span>
              {x.time && (!r.slot || x.time.slice(0, 5) !== r.slot[0] || (x.end && x.end !== r.slot[1])) && <span className="muted small">{fmtSpan(x.time, x.end)}</span>}
            </button>)}
            {H.isCoach && <button type="button" className="mw-add no-print" onClick={() => addAt(g.days[i], r.slot)} aria-label={`Add on ${fmtDate(g.days[i])}${r.slot ? ' at ' + fmtTime(r.slot[0]) : ''}`}><Icon n="plus" /></button>}
          </td>)}</tr>)}</tbody></table></div>}
      {data && !items.length && <p className="muted small" style={{ margin: '10px 0 0' }}>Nothing scheduled this week for the teams shown.</p>}
      <p className="muted small mw-foot">Gym days come from each team's S&C calendar; a gym day without its own time uses the organization's rotation{org && /bcs/i.test(org.slug || org.name) ? ' (Mon: basketball 3:30, U18 4:45, U16 6:00 · Tue & Wed: U16 3:30, U18 4:45, basketball 6:00)' : ''}. Changes made here save to that team's S&C calendar or schedule.</p>
    </section>
  </>;
}

/* Time: one of the slots (its start and end), or any interval set by hand (end optional). */
export function TimePick({ time, end = '', set, slots }) {
  const ss = slots || [], isSlot = (t, e) => ss.some(([a, b]) => a === t && (!e || e === b));
  const [custom, setCustom] = useState(!!time && !isSlot(time, end));
  return <div className="sc-time">
    <select className="select" value={custom ? 'custom' : time} onChange={(e) => { const v = e.target.value; if (v === 'custom') { setCustom(true); return; } setCustom(false); const s = ss.find(([a]) => a === v); set(v, s ? s[1] : ''); }} aria-label="Time slot">
      <option value="">No set time</option>{ss.map(([a, b]) => <option key={a} value={a}>{fmtTime(a)} – {fmtTime(b)}</option>)}<option value="custom">Custom time…</option></select>
    {custom && <span className="sc-span"><input type="time" className="input" value={time} onChange={(e) => set(e.target.value, end)} aria-label="Start time" />
      <span className="muted small">to</span><input type="time" className="input" value={end} onChange={(e) => set(time, e.target.value)} aria-label="End time" /></span>}</div>;
}
/** A toast message when an interval is backwards, else ''. */
export const spanError = (time, end) => (time && end && end <= time ? 'The end time has to be after the start time.' : '');

function ItemDialog({ x, ctx, close }) {
  const H = useHub(); const team = ctx.teams.find((t) => t.id === x.tid);
  const [date, setDate] = useState(x.date), [time, setTime] = useState((x.time || '').slice(0, 5)), [end, setEnd] = useState(x.end || ''), [title, setTitle] = useState(x.kind === 'gym' && !x.sc ? '' : x.title);
  const [k, setK] = useState(x.intensity || ''), [all, setAll] = useState(false);
  const later = H.isCoach && x.kind !== 'game' ? laterLike(x, ctx.data[x.tid] || {}) : [], many = later.length > 1;
  const setSpan = (t, e) => { setTime(t); setEnd(e); };
  const run = async (fn) => { if (spanError(time, end)) { H.toast(spanError(time, end)); return; } close(); try { await fn(); H.toast('Schedule updated'); } catch (e) { H.toast(/permission|row-level|policy/i.test(e.message || '') ? 'You have view-only access for that team.' : 'Could not save. ' + e.message); } await ctx.done(x.tid); };
  // with "later ones too", every match moves by the same number of days and takes the new title/time
  const shift = Math.round((fromISO(date) - fromISO(x.date)) / 864e5);
  const gym = (change) => run(async () => {
    const its = all && many ? later.map(([d, sc]) => ({ ...x, date: d, sc })) : [x];
    if (shift > 0) its.reverse(); // so a move never lands on a day that is about to be vacated
    for (const it of its) for (const [d, v] of gymWrites(it, change && { ...change, date: addDays(it.date, shift) }, ctx.org, team)) await H.api.saveScDay(x.tid, d, v);
  });
  const ev = (del) => run(async () => {
    const evs = all && many ? later : [x.ev];
    if (del) { for (const v of evs) await H.api.deleteEvent(v.id); return; }
    await H.api.saveEvents(x.tid, evs.map((v) => ({ ...v, date: addDays(v.date, shift), time, end_time: end, title: title.trim() || v.title })));
  });
  const head = <div className="tchips"><span className="tchip"><i style={{ background: x.color }} /><span>{x.team}</span></span></div>;
  if (x.kind === 'game' || !H.isCoach) return <Modal title={x.kind === 'game' ? 'Game' : x.kind === 'gym' ? 'Gym' : x.kind === 'practice' ? 'Practice' : 'Event'} onClose={close} actions={<button className="btn" onClick={close}>Close</button>}>
    {head}<dl className="kv"><dt>What</dt><dd>{x.title}</dd><dt>Date</dt><dd>{fmtDate(x.date, true)}</dd><dt>Time</dt><dd>{x.time ? fmtSpan(x.time, x.end) : 'Not set'}</dd>{x.venue && <><dt>Where</dt><dd>{x.venue}</dd></>}</dl>
    {x.kind === 'game' && H.isCoach && <p className="muted small">Games come from the team's schedule and league sync; change them on that team's Home page.</p>}
  </Modal>;
  const isGym = x.kind === 'gym';
  return <Modal title={isGym ? 'Gym' : x.kind === 'practice' ? 'Practice' : 'Event'} onClose={close}
    actions={<><button className="btn danger" onClick={() => (isGym ? gym(null) : ev(true))}><Icon n="trash" /> {all && many ? `Remove ${later.length}` : 'Remove'}</button><span className="spacer" /><button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" onClick={() => (isGym ? gym({ date, time, end, theme: title, intensity: k }) : ev(false))}>{all && many ? `Save ${later.length}` : 'Save'}</button></>}>
    {head}
    {isGym ? <ThemePick theme={title} setTheme={setTitle} k={k} setK={setK} themes={ctx.themes} /> : <label className="field"><span>Title</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>}
    <div className="row2"><label className="field"><span>Date</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || x.date)} /></label>
      <div className="field"><span>Time</span><TimePick time={time} end={end} set={setSpan} slots={ctx.slots} /></div></div>
    {many && <label className="mw-check"><input type="checkbox" className="cb" checked={all} onChange={(e) => setAll(e.target.checked)} /> <span>Also change or remove the {later.length - 1} later {later.length === 2 ? 'one' : 'ones'} like this (same {isGym ? 'theme' : 'title'} and time, through {fmtDate(isGym ? later[later.length - 1][0] : later[later.length - 1].date)})</span></label>}
    {isGym && x.rot && !(x.sc && x.sc.time) && <p className="muted small">Placed by the rotation ({fmtTime(x.rot)} on {DOW[fromISO(x.date).getDay()]}). Saving keeps this day's time even if the rotation changes.</p>}
    {isGym && <p className="muted small">Saves to {x.team}'s S&C calendar. Remove marks the day off there.</p>}
  </Modal>;
}

/* Day theme: free text with the themes already used across the organization one tap away, and
 * the S&C intensity colour. */
function ThemePick({ theme, setTheme, k, setK, themes }) {
  const q = theme.trim().toLowerCase(), shown = themes.filter((t) => t.toLowerCase() !== q && (!q || t.toLowerCase().includes(q))).slice(0, 10);
  return <>
    <label className="field"><span>Day theme (optional)</span><input className="input" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. Brick 1, Regen, Supercharge" /></label>
    {shown.length > 0 && <div className="mw-themes" role="group" aria-label="Themes already used">{shown.map((t) => <button type="button" key={t} className="tchip" onClick={() => setTheme(t)}>{t}</button>)}</div>}
    <div className="field"><span>Intensity</span><div className="iseg">{INT.filter((i) => i.k !== 'off' && i.k !== 'game').map((i) => <button type="button" key={i.k} className={k === i.k ? 'on' : ''} aria-pressed={k === i.k} onClick={() => setK(i.k)}><IBadge k={i.k} />{i.label}</button>)}</div></div>
  </>;
}

const DAYS_MON = [1, 2, 3, 4, 5, 6, 0];
/* Repeat rule: how often, which weekdays (weekly), and until when. */
function RepeatPick({ start, rule, set }) {
  const n = repeatDates(start, rule).length, wk = rule.freq === 'weekly' || rule.freq === 'biweekly';
  const days = rule.days.length ? rule.days : [fromISO(start).getDay()];
  const flip = (d) => { const s = new Set(days); s.has(d) ? s.size > 1 && s.delete(d) : s.add(d); set({ ...rule, days: [...s] }); };
  return <div className="mw-repeat">
    <div className="row2"><label className="field"><span>Repeat</span><select className="select" value={rule.freq} onChange={(e) => set({ ...rule, freq: e.target.value, until: rule.until || addDays(start, 27) })}>{FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {rule.freq !== 'none' && <label className="field"><span>Until</span><input type="date" className="input" value={rule.until} min={start} onChange={(e) => set({ ...rule, until: e.target.value })} /></label>}</div>
    {wk && <div className="field"><span>On</span><div className="mw-days" role="group" aria-label="Repeat on">{DAYS_MON.map((d) => <button type="button" key={d} className={days.includes(d) ? 'on' : ''} aria-pressed={days.includes(d)} onClick={() => flip(d)}>{DOW[d]}</button>)}</div></div>}
    {rule.freq !== 'none' && <p className="muted small" style={{ margin: 0 }}>{n} {n === 1 ? 'date' : 'dates'}{n >= MAX_REPEATS ? ` (the most at once is ${MAX_REPEATS})` : ''}{rule.until && rule.until < start ? ' · the end date is before the start' : ''}</p>}
  </div>;
}

function AddDialog({ date: d0, time: t0, end: e0, ctx, close }) {
  const H = useHub();
  const [tid, setTid] = useState(H.team.id), [kind, setKind] = useState('gym'), [date, setDate] = useState(d0), [time, setTime] = useState(t0), [end, setEnd] = useState(e0), [title, setTitle] = useState('');
  const [k, setK] = useState(''), [rule, setRule] = useState({ freq: 'none', days: [], until: '' });
  const dates = repeatDates(date, rule);
  const save = async () => {
    if (kind !== 'gym' && !title.trim()) { H.toast('Add a title.'); return; }
    if (spanError(time, end)) { H.toast(spanError(time, end)); return; }
    if (rule.freq !== 'none' && (!rule.until || rule.until < date)) { H.toast('Pick an end date for the repeat.'); return; }
    close();
    try {
      if (kind === 'gym') for (const d of dates) { const x = ((ctx.data[tid] || {}).sc || {})[d] || {}; await H.api.saveScDay(tid, d, { ...x, theme: title.trim() || x.theme || 'Gym', intensity: k || (x.intensity === 'off' || x.intensity === 'game' ? '' : x.intensity || ''), time, end }); }
      else await H.api.saveEvents(tid, dates.map((d) => ({ date: d, time, end_time: end, title: title.trim(), kind, location: '' })));
      H.toast(dates.length > 1 ? `Added ${dates.length} to the schedule` : 'Added to the schedule');
    } catch (e) { H.toast(/permission|row-level|policy/i.test(e.message || '') ? 'You have view-only access for that team.' : 'Could not save. ' + e.message); }
    await ctx.done(tid);
  };
  return <Modal title="Add to the schedule" onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>{dates.length > 1 ? `Add ${dates.length}` : 'Add'}</button></>}>
    <div className="row2"><label className="field"><span>Team</span><select className="select" value={tid} onChange={(e) => setTid(e.target.value)}>{ctx.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="field"><span>What</span><select className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="gym">Gym</option><option value="practice">Practice</option><option value="event">Event</option></select></label></div>
    {kind === 'gym' ? <ThemePick theme={title} setTheme={setTitle} k={k} setK={setK} themes={ctx.themes} />
      : <label className="field"><span>Title</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'practice' ? 'e.g. Practice' : 'e.g. Team meeting'} /></label>}
    <div className="row2"><label className="field"><span>{rule.freq === 'none' ? 'Date' : 'Starts'}</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || d0)} /></label>
      <div className="field"><span>Time</span><TimePick time={time} end={end} set={(t, e) => { setTime(t); setEnd(e); }} slots={ctx.slots} /></div></div>
    <RepeatPick start={date} rule={rule} set={setRule} />
    {kind === 'gym' && <p className="muted small">Saves to that team's S&C calendar{dates.length > 1 ? ' for each date' : ' for the day'}.</p>}
  </Modal>;
}
