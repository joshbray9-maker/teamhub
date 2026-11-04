// IPP (admins + coaches): an individual performance pathway per athlete, laid out like Josh's
// BCS IPP template (lib/ipp.js). The team's BASE IPP holds the values every new IPP starts from
// (coach, province, the template's defaults); each athlete's IPP starts from it, with their name,
// position and team filled in. Every box that has a note in the template shows it on hover (or
// keyboard focus), marked with the same corner triangle as a spreadsheet comment.
import { useEffect, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate } from '../lib/util.js';
import { TITLE, HEADER, SCALES, LEGENDS, PILLARS, PILLAR_HEAD, BASKETBALL, OPEN, BALANCED, COMMENTS, MONTHS, baseIpp, startIpp, ippProgress } from '../lib/ipp.js';
import { useRoster } from './Injury.jsx';
import PageHead from '../components/PageHead.jsx';
import Avatar from '../components/Avatar.jsx';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';

const PERSONAL = new Set(['athlete', 'position', 'team', 'age', 'evalDate']);

export default function Ipp() {
  const H = useHub(); const t = H.team;
  const { roster, photos } = useRoster();
  const [ipps, setIpps] = useState(null), [sel, setSel] = useState(null), [q, setQ] = useState('');
  const load = () => H.api.listIpps(t.id).then(setIpps).catch((e) => { setIpps({ base: null, players: {} }); H.toast('Could not load IPPs: ' + e.message); });
  useEffect(() => { if (H.isCoach) load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!H.isCoach) return <><PageHead title="IPP" /><section className="card"><p className="muted" style={{ margin: 0 }}>IPPs are only visible to coaches and admins.</p></section></>;
  if (!roster || !ipps) return <><PageHead title="IPP" /><div className="loading">Loading…</div></>;

  const save = async (pid, data) => { try { await H.api.saveIpp(t.id, pid, data); H.toast('IPP saved'); await load(); return true; } catch (e) { H.toast(/permission|row-level|policy/i.test(e.message || '') ? 'Only coaches and admins can save IPPs.' : 'Could not save. ' + e.message); return false; } };
  if (sel === 'base') return <IppEditor key="base" mode="base" initial={baseIpp(ipps.base)} name="Base IPP" save={(d) => save(null, d)} back={() => setSel(null)} />;
  const p = sel && roster.find((x) => x.id === sel);
  if (p) {
    const mine = ipps.players[p.id];
    return <IppEditor key={p.id} mode="athlete" player={p} photo={photos[p.photo]} initial={mine ? mine.data : startIpp(ipps.base, p, t)} isNew={!mine} name={p.name}
      save={(d) => save(p.id, d)} reset={() => startIpp(ipps.base, p, t)} back={() => setSel(null)} />;
  }
  const list = roster.filter((x) => !q.trim() || `${x.num} ${x.name} ${x.position}`.toLowerCase().includes(q.trim().toLowerCase()));
  return <>
    <PageHead title="IPP" />
    <section className="card ipp-basecard">
      <div><h2>Base IPP</h2><p className="muted small" style={{ margin: 0 }}>Built from the BCS IPP template. Every athlete's IPP starts from it: set the coach, province and any starting values once here.{ipps.baseAt ? ` Last changed ${fmtDate(ipps.baseAt.slice(0, 10))}.` : ' Not changed yet: it matches the template.'}</p></div>
      <button className="btn primary" onClick={() => setSel('base')}><Icon n="edit" /> Open base IPP</button>
    </section>
    <section className="card">
      <div className="card-head"><div><h2>Athletes</h2><span className="muted small">Each athlete has their own IPP. Open one to fill it in; a new one starts from the base IPP.</span></div>
        <input className="input ar-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, # or position" aria-label="Search athletes" /></div>
      {!roster.length ? <p className="muted small" style={{ margin: 0 }}>Add players in the Roster tab first.</p>
        : <ul className="ar-list">{list.map((x) => { const m = ipps.players[x.id], pr = m ? ippProgress(m.data) : null; return <li key={x.id}><button className="ar-item" onClick={() => setSel(x.id)}>
          <Avatar p={x} url={photos[x.photo]} size={40} />
          <span className="ar-who"><b>{x.num ? `#${x.num} ` : ''}{x.name}</b><span className="muted small">{m ? `${pr.done} of ${pr.total} rated · updated ${fmtDate(m.updated_at.slice(0, 10))}${m.data.evalDate ? ' · evaluated ' + fmtDate(m.data.evalDate) : ''}` : 'Not started · starts from the base IPP'}</span></span>
          {m && <span className="ipp-bar" aria-hidden="true"><i style={{ width: `${Math.round((pr.done / pr.total) * 100)}%` }} /></span>}
          <Icon n="chev" /></button></li>; })}</ul>}
    </section>
  </>;
}

/* ---------- one IPP, laid out like the template ---------- */
function IppEditor({ mode, player, photo, initial, isNew, name, save, reset, back }) {
  const H = useHub(); const t = H.team, base = mode === 'base';
  // fresh = a new IPP not saved yet: Save stays on, but leaving it untouched needs no warning
  const [data, setData] = useState(initial), [saved, setSaved] = useState(initial), [fresh, setFresh] = useState(!!isNew), [busy, setBusy] = useState(false);
  const [tip, setTip] = useState(null);
  const dirty = JSON.stringify(data) !== JSON.stringify(saved);
  const v = (k) => (data[k] ?? '');
  const set = (k) => (e) => setData((d) => ({ ...d, [k]: e && e.target ? e.target.value : e }));
  const doSave = async () => { setBusy(true); const clean = Object.fromEntries(Object.entries(data).filter(([, x]) => x !== '' && x !== null && x !== undefined)); if (await save(clean)) { setData(clean); setSaved(clean); setFresh(false); } setBusy(false); };
  const leave = async () => { if (dirty && !(await H.confirm('Leave without saving?', 'Your changes to this IPP haven\'t been saved.', 'Leave'))) return; back(); };
  const doReset = async () => { if (!(await H.confirm('Start over from the base IPP?', `Every box in ${name}'s IPP goes back to the base IPP. Nothing is saved until you press Save.`, 'Start over'))) return; setData(reset()); };
  // render helpers (plain functions, not components, so inputs keep focus while typing).
  // box: a box with a template note gets the corner marker and shows the note on hover / focus
  const box = (note, className, children) => {
    if (!note) return <div className={`ipp-box ${className}`}>{children}</div>;
    const show = (e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ note, r }); };
    return <div className={`ipp-box has-note ${className}`} onMouseEnter={show} onMouseLeave={() => setTip(null)} onFocus={show} onBlur={() => setTip(null)}>{children}</div>;
  };
  const rate = (id, note, scale = 'pillar', ph = '–') => box(note, `ipp-rate v${v(id)}`,
    <select className="select" value={v(id)} onChange={set(id)} aria-label={ph === '–' ? 'Rating' : ph}><option value="">{ph}</option>{SCALES[scale].map((s) => <option key={s.v} value={s.v}>{s.v} · {s.label}</option>)}</select>);
  const obs = (id) => <div className="ipp-box ipp-obs"><textarea className="input" rows="1" value={v(id)} onChange={set(id)} aria-label="Observations" /></div>;
  const pick = (id, note, opts, ph) => box(note, 'ipp-pick', <select className="select" value={v(id)} onChange={set(id)} aria-label={ph}><option value="">{ph}</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>);

  return <>
    <PageHead title={base ? 'Base IPP' : 'IPP'} actions={<><button className="btn" onClick={leave}>← All athletes</button>
      {!base && <button className="btn" onClick={doReset}><Icon n="refresh" /> Start from base</button>}
      <button className="btn" onClick={() => window.print()}><Icon n="clipboard" /> Print / PDF</button>
      <button className="btn primary" disabled={busy || (!dirty && !fresh)} onClick={doSave}>{busy ? 'Saving…' : dirty || fresh ? 'Save' : 'Saved'}</button></>} />
    {base && <div className="hint no-print">This is the starting point for every athlete's IPP on {t.name}. Athlete details (name, position, team, age, evaluation date) are filled per athlete. Changing the base doesn't change IPPs already saved.</div>}
    {fresh && !base && <div className="hint no-print">New IPP for {name}, started from the base IPP. Press Save to keep it.</div>}

    <article className="card ipp">
      <header className="ipp-title"><Logo t={t} cls="gp-logo" /><h2>{TITLE}</h2>{player && <Avatar p={player} url={photo} size={52} />}</header>
      <div className="ipp-head">{HEADER.map((h) => <label key={h.id} className="ipp-hf"><span>{h.label}</span>
        {box(h.note, '', base && PERSONAL.has(h.id) ? <input className="input" disabled placeholder="Filled per athlete" />
          : <input className="input" type={h.type === 'date' ? 'date' : 'text'} value={v(h.id)} onChange={set(h.id)} />)}</label>)}</div>

      <div className="ipp-legends">{LEGENDS.map((l) => <section key={l.title} className="ipp-legend"><h3>{l.title}</h3>
        <ul>{SCALES[l.scale].map((s) => <li key={s.v}><span>{s.label}</span>{box(s.note, `ipp-chip v${s.v}`, s.v)}</li>)}</ul></section>)}</div>

      <div className="ipp-tblhead"><span>{PILLAR_HEAD.pillars}</span><span>{PILLAR_HEAD.scale}</span><span>{PILLAR_HEAD.obs}</span></div>
      {PILLARS.map((p) => <section key={p.id} className={`ipp-pillar ipp-${p.id}`}>
        <h3 className="ipp-band">{p.title}{p.sub && <small> {p.sub}</small>}</h3>
        {p.groups.map((g) => <div key={g.id} className="ipp-group">
          <h4>{g.title}{g.measures && <span className="ipp-colnote">{PILLAR_HEAD.comments}</span>}</h4>
          {(g.measures || []).map((m) => <div key={m.id} className="ipp-row">
            <span className="ipp-lbl">{m.label}</span>
            {box(m.note, 'ipp-meas', m.choices ? <select className="select" value={v(m.id)} onChange={set(m.id)}><option value="">–</option>{m.choices.map((c) => <option key={c}>{c}</option>)}</select>
              : <><input className="input" inputMode={m.text ? 'text' : 'decimal'} value={v(m.id)} onChange={set(m.id)} />{m.unit && <span className="muted small">{m.unit}</span>}</>)}
            {obs(`${m.id}.obs`)}</div>)}
          {(g.rows || []).map((r) => <div key={r.id} className="ipp-row"><span className="ipp-lbl">{r.label}</span>{rate(r.id, r.note)}{obs(`${r.id}.obs`)}</div>)}
        </div>)}
      </section>)}

      <section className="ipp-pillar ipp-bball">
        <h3 className="ipp-band">{BASKETBALL.title}</h3>
        {BASKETBALL.groups.map((g) => <div key={g.id} className="ipp-group">
          <h4>{g.title}</h4>
          <div className={`ipp-row ipp-colrow ${g.scoring ? 'score' : ''}`}><span /><span>{BASKETBALL.head.range}</span>{g.scoring && <><span>{BASKETBALL.head.open}</span><span>{BASKETBALL.head.bal}</span></>}<span>{BASKETBALL.head.comments}</span></div>
          {g.rows.map((r) => <div key={r.id} className={`ipp-row ${g.scoring ? 'score' : ''}`}><span className="ipp-lbl">{r.label}</span>
            {rate(r.id, r.note, 'skill', BASKETBALL.head.range)}
            {g.scoring && (r.open ? pick(`${r.id}.open`, r.open.note, OPEN, BASKETBALL.head.open) : <span className="ipp-na" />)}
            {g.scoring && (r.bal ? pick(`${r.id}.bal`, r.bal.note, BALANCED, BASKETBALL.head.bal) : <span className="ipp-na" />)}
            {obs(`${r.id}.obs`)}</div>)}
        </div>)}
      </section>

      <section className="ipp-pillar"><h3 className="ipp-band">{COMMENTS.label}</h3>
        <textarea className="input ipp-big" rows="8" value={v(COMMENTS.id)} onChange={set(COMMENTS.id)} aria-label={COMMENTS.label} /></section>
      <section className="ipp-months">{MONTHS.map((m) => <label key={m.id} className="ipp-month"><span>{m.label}</span><textarea className="input" rows="4" value={v(m.id)} onChange={set(m.id)} /></label>)}</section>
    </article>
    {tip && <Tip {...tip} />}
  </>;
}

/* The note for the box under the pointer: below it, or above when there's no room. */
function Tip({ note, r }) {
  const ref = useRef(null); const [pos, setPos] = useState({ left: r.left, top: r.bottom + 6, hidden: true });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    const top = r.bottom + 6 + h <= vh - 8 ? r.bottom + 6 : Math.max(8, r.top - 6 - h);
    setPos({ left, top, hidden: false });
  }, [note, r]);
  return <div ref={ref} className="ipp-tip" role="tooltip" style={{ left: pos.left, top: pos.top, visibility: pos.hidden ? 'hidden' : 'visible' }}>{note}</div>;
}
