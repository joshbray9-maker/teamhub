// Practice plan (admins + coaches): build a practice block by block. Each block has minutes, a
// type, a title and notes; clock times run from the practice's start time. Blocks can be saved
// to the team's drill library and reused. Print / PDF and CSV export. Injured players are flagged
// at the top (InjuredCard).
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, fmtTime, todayISO, uid } from '../lib/util.js';
import { typesFor, typeColor, typeLabel, timeline, byType, practiceCsv } from '../lib/practice.js';
import { downloadCsv } from '../lib/imports.js';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import InjuredCard from '../components/InjuredCard.jsx';

const blank = (date) => ({ practice_on: date || todayISO(), start_time: '', location: '', focus: '', notes: '', blocks: [] });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function Practice() {
  const H = useHub(); const t = H.team;
  const [list, setList] = useState(null), [drills, setDrills] = useState([]);
  const [sel, setSel] = useState(null), [draft, setDraft] = useState(null), [busy, setBusy] = useState(false);
  const load = async (keep) => {
    try {
      const [p, d] = await Promise.all([H.api.listPractices(t.id), H.api.listDrills(t.id)]);
      setList(p); setDrills(d);
      // the practice just saved, else the next one coming up, else the most recent
      const pick = p.find((x) => x.id === keep) || [...p].reverse().find((x) => x.practice_on >= todayISO()) || p[0];
      if (pick) { setSel(pick.id); setDraft(JSON.parse(JSON.stringify(pick))); } else { setSel(null); setDraft(null); }
    } catch (e) { setList([]); H.toast('Could not load practices: ' + e.message); }
  };
  useEffect(() => { if (H.isCoach) load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!H.isCoach) return <><PageHead title="Practice plan" /><section className="card"><p className="muted" style={{ margin: 0 }}>Practice plans are only visible to coaches and admins.</p></section></>;
  const saved = list && list.find((x) => x.id === sel);
  const dirty = draft && (!saved || !same(draft, saved));
  const open = async (p) => { if (dirty && !(await H.confirm('Discard changes?', 'This practice has unsaved changes.', 'Discard'))) return; setSel(p.id); setDraft(JSON.parse(JSON.stringify(p))); };
  const save = async () => {
    if (!draft.practice_on) { H.toast('Pick a date.'); return; }
    setBusy(true);
    try { const r = await H.api.savePractice(t.id, draft); H.toast('Practice saved'); await load(r.id); } catch (e) { H.toast('Could not save. ' + e.message); }
    finally { setBusy(false); }
  };
  const create = async (base) => {
    if (dirty && !(await H.confirm('Discard changes?', 'This practice has unsaved changes.', 'Discard'))) return;
    H.openDialog((c) => <NewPractice list={list} base={base} close={c} onCreate={async (p) => {
      try { const r = await H.api.savePractice(t.id, p); await load(r.id); } catch (e) { H.toast('Could not create. ' + e.message); }
    }} />);
  };
  const del = async () => {
    if (!(await H.confirm('Delete practice?', `The practice on ${fmtDate(draft.practice_on, true)} is removed.`))) return;
    try { await H.api.deletePractice(draft.id); await load(); } catch (e) { H.toast(e.message); }
  };
  const acts = <>
    {draft && draft.id && <button className="btn" onClick={() => window.print()} disabled={dirty} title={dirty ? 'Save first' : ''}><Icon n="clipboard" /> Print / PDF</button>}
    {draft && draft.id && <button className="btn" disabled={dirty} onClick={() => downloadCsv(`practice-${draft.practice_on}.csv`, practiceCsv(draft, t.sport))}>CSV</button>}
    <button className="btn primary" onClick={() => create(null)}><Icon n="plus" /> New practice</button>
  </>;
  const today = todayISO();
  const upcoming = (list || []).filter((p) => p.practice_on >= today).reverse(), past = (list || []).filter((p) => p.practice_on < today);
  const item = (p) => { const tl = timeline(p.start_time, p.blocks); return <li key={p.id} className={p.id === sel ? 'on' : ''} onClick={() => open(p)}>
    <b>{fmtDate(p.practice_on)}{p.start_time ? ` · ${fmtTime(p.start_time)}` : ''}</b><span className="muted small">{[p.focus, `${tl.total} min`].filter(Boolean).join(' · ')}</span></li>; };
  return <>
    <PageHead title="Practice plan" actions={acts} />
    <div className="no-print"><InjuredCard /></div>
    {!list ? <div className="loading">Loading…</div> : !list.length ? <section className="card"><div className="empty-state"><b>No practices yet</b><span className="muted small">Start one with <b>New practice</b>, then add blocks: minutes, type, what you're running and coaching notes. The clock times fill in from the start time.</span></div></section>
      : <div className="pp-grid">
        <section className="card pp-list no-print">
          {upcoming.length > 0 && <><div className="pp-k">Upcoming</div><ul>{upcoming.map(item)}</ul></>}
          {past.length > 0 && <><div className="pp-k">Past</div><ul>{past.map(item)}</ul></>}
        </section>
        {draft && <Editor key={sel} draft={draft} setDraft={setDraft} drills={drills} dirty={dirty} busy={busy} onSave={save} onDelete={del} onDuplicate={() => create(draft)} reloadDrills={() => H.api.listDrills(t.id).then(setDrills)} />}
      </div>}
    {draft && draft.id && !dirty && <PrintPractice p={draft} />}
  </>;
}

function NewPractice({ list, base, close, onCreate }) {
  const last = list && list[0];
  const [date, setDate] = useState(todayISO()), [start, setStart] = useState(base ? base.start_time : (last && last.start_time) || '');
  const [copy, setCopy] = useState(base ? base.id : '');
  const go = () => {
    const src = copy && list.find((p) => p.id === copy);
    close(); onCreate({ ...blank(date), start_time: start, ...(src ? { location: src.location, focus: src.focus, notes: src.notes, blocks: src.blocks.map((b) => ({ ...b, id: uid() })) } : {}) });
  };
  return <Modal title={base ? 'Duplicate practice' : 'New practice'} onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!date} onClick={go}>Create</button></>}>
    <div className="row2">
      <label className="field"><span>Date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="field"><span>Start time</span><input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
    </div>
    {list && list.length > 0 && <label className="field"><span>Start from</span><select className="select" value={copy} onChange={(e) => setCopy(e.target.value)}>
      <option value="">A blank practice</option>{list.map((p) => <option key={p.id} value={p.id}>Copy of {fmtDate(p.practice_on)}{p.focus ? ` · ${p.focus}` : ''}</option>)}</select></label>}
  </Modal>;
}

function Editor({ draft, setDraft, drills, dirty, busy, onSave, onDelete, onDuplicate, reloadDrills }) {
  const H = useHub(); const sport = H.team.sport; const types = typesFor(sport);
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  const setBlock = (id, patch) => setDraft({ ...draft, blocks: draft.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const add = (b) => setDraft({ ...draft, blocks: [...draft.blocks, { id: uid(), title: '', minutes: 10, type: '', notes: '', ...b }] });
  const move = (i, d) => { const bl = [...draft.blocks]; const j = i + d; if (j < 0 || j >= bl.length) return; [bl[i], bl[j]] = [bl[j], bl[i]]; setDraft({ ...draft, blocks: bl }); };
  const remove = (id) => setDraft({ ...draft, blocks: draft.blocks.filter((b) => b.id !== id) });
  const toLibrary = async (b) => {
    if (!b.title.trim()) { H.toast('Give the block a title first.'); return; }
    try { await H.api.saveDrill(H.teamId, { title: b.title.trim(), type: b.type, minutes: Number(b.minutes) || 10, notes: b.notes || '' }); H.toast('Saved to the drill library'); reloadDrills(); } catch (e) { H.toast(e.message); }
  };
  const library = () => H.openDialog((c) => <Library drills={drills} sport={sport} close={c} onAdd={(d) => add({ title: d.title, type: d.type, minutes: d.minutes, notes: d.notes })} onChanged={reloadDrills} />);
  const tl = timeline(draft.start_time, draft.blocks), mix = byType(draft.blocks);
  return <section className="card pp-edit no-print">
    <div className="pp-head">
      <label className="field"><span>Date</span><input className="input" type="date" value={draft.practice_on} onChange={set('practice_on')} /></label>
      <label className="field"><span>Start</span><input className="input" type="time" value={draft.start_time} onChange={set('start_time')} /></label>
      <label className="field"><span>Location</span><input className="input" value={draft.location} onChange={set('location')} placeholder="Gym" maxLength={80} /></label>
      <label className="field pp-focus"><span>Focus</span><input className="input" value={draft.focus} onChange={set('focus')} placeholder="e.g. Transition defence" maxLength={120} /></label>
    </div>
    <div className="pp-sum">
      <div><b className="tnum">{tl.total} min</b>{tl.end && <span className="muted"> · ends {fmtTime(tl.end)}</span>}</div>
      {mix.length > 0 && <div className="pp-bar" aria-hidden="true">{mix.map(([k, m]) => <i key={k} style={{ flex: m, background: typeColor(sport, k) }} title={`${typeLabel(sport, k) || 'No type'}: ${m} min`} />)}</div>}
      <div className="pp-mix">{mix.map(([k, m]) => <span key={k}><i style={{ background: typeColor(sport, k) }} />{typeLabel(sport, k) || 'No type'} {m}′</span>)}</div>
    </div>
    <ol className="pp-blocks">{tl.rows.map((b, i) => <li key={b.id} style={{ '--c': typeColor(sport, b.type) }}>
      <div className="pp-time tnum">{b.from ? <>{fmtTime(b.from)}<span className="muted"> – {fmtTime(b.to)}</span></> : <span className="muted">#{i + 1}</span>}</div>
      <div className="pp-main">
        <div className="pp-row">
          <input className="input pp-title" value={b.title} placeholder="Block / drill" maxLength={120} onChange={(e) => setBlock(b.id, { title: e.target.value })} aria-label={`Block ${i + 1} title`} />
          <label className="pp-min"><input className="input tnum" type="number" min="1" max="240" value={b.minutes} onChange={(e) => setBlock(b.id, { minutes: e.target.value === '' ? '' : Math.max(0, Math.min(240, Math.round(+e.target.value))) })} aria-label={`Block ${i + 1} minutes`} /><span className="muted small">min</span></label>
          <select className="select pp-type" value={b.type} onChange={(e) => setBlock(b.id, { type: e.target.value })} aria-label={`Block ${i + 1} type`}><option value="">Type…</option>{types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <textarea className="input pp-notes" rows={1} value={b.notes} placeholder="Coaching points, groups, equipment…" maxLength={2000} onChange={(e) => setBlock(b.id, { notes: e.target.value })} aria-label={`Block ${i + 1} notes`} />
      </div>
      <div className="pp-acts">
        <button className="icon-btn" onClick={() => move(i, -1)} disabled={!i} aria-label="Move up"><Icon n="chev" /></button>
        <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === tl.rows.length - 1} aria-label="Move down"><Icon n="chev" /></button>
        <button className="icon-btn" onClick={() => toLibrary(b)} aria-label="Save to drill library" title="Save to drill library"><Icon n="book" /></button>
        <button className="icon-btn" onClick={() => remove(b.id)} aria-label="Remove block"><Icon n="trash" /></button>
      </div>
    </li>)}</ol>
    <div className="pp-add">
      <button className="btn" onClick={() => add({})}><Icon n="plus" /> Block</button>
      <button className="btn" onClick={library}><Icon n="book" /> From drill library{drills.length ? ` (${drills.length})` : ''}</button>
    </div>
    <label className="field"><span>Practice notes</span><textarea className="input" value={draft.notes} onChange={set('notes')} maxLength={4000} placeholder="Reminders, attendance notes, what to carry over" /></label>
    <div className="pp-foot">
      {draft.id && <button className="btn danger ghost" onClick={onDelete}><Icon n="trash" /> Delete</button>}
      {draft.id && <button className="btn ghost" onClick={onDuplicate}>Duplicate</button>}
      <span className="spacer" />
      <button className="btn primary" disabled={!dirty || busy} onClick={onSave}>{busy ? 'Saving…' : dirty ? 'Save practice' : 'Saved'}</button>
    </div>
  </section>;
}

function Library({ drills, sport, close, onAdd, onChanged }) {
  const H = useHub(); const [q, setQ] = useState(''); const [list, setList] = useState(drills);
  const del = async (d) => { if (!(await H.confirm('Delete drill?', `"${d.title}" is removed from the library. Practices that use it keep their copy.`))) return; try { await H.api.deleteDrill(d.id); setList(list.filter((x) => x.id !== d.id)); onChanged(); } catch (e) { H.toast(e.message); } };
  const shown = list.filter((d) => !q || (d.title + ' ' + d.notes).toLowerCase().includes(q.toLowerCase()));
  return <Modal title="Drill library" wide onClose={close} actions={<button className="btn primary" onClick={close}>Done</button>}>
    {!list.length ? <p className="muted small" style={{ margin: 0 }}>No drills yet. Save any block to the library with its book button.</p> : <>
      <input className="input" placeholder="Search drills" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search drills" />
      <ul className="pp-lib">{shown.map((d) => <li key={d.id}>
        <i style={{ background: typeColor(sport, d.type) }} />
        <div><b>{d.title}</b><span className="muted small">{[typeLabel(sport, d.type), `${d.minutes} min`].filter(Boolean).join(' · ')}</span>{d.notes && <span className="small pp-lib-n">{d.notes}</span>}</div>
        <button className="btn sm" onClick={() => { onAdd(d); H.toast(`Added "${d.title}"`); }}><Icon n="plus" /> Add</button>
        <button className="icon-btn" onClick={() => del(d)} aria-label={`Delete ${d.title}`}><Icon n="trash" /></button>
      </li>)}</ul></>}
  </Modal>;
}

/* Print / PDF only */
function PrintPractice({ p }) {
  const H = useHub(); const t = H.team; const sport = t.sport;
  const tl = timeline(p.start_time, p.blocks), mix = byType(p.blocks);
  return <div className="print-only pp-print">
    <header className="gp-head"><Logo t={t} cls="gp-logo" /><div className="gp-title"><div className="gp-team">{t.name}</div>
      <div className="gp-vs">{fmtDate(p.practice_on, true)}{p.start_time ? ` · ${fmtTime(p.start_time)}${tl.end ? '–' + fmtTime(tl.end) : ''}` : ''}</div>
      <div className="gp-meta">{[p.location, p.focus && `Focus: ${p.focus}`, `${tl.total} min`].filter(Boolean).join(' · ')}</div></div><div className="gp-tag">Practice plan</div></header>
    <table className="pp-pt"><thead><tr><th>Time</th><th>Min</th><th>Type</th><th>Block</th><th>Notes</th></tr></thead>
      <tbody>{tl.rows.map((b, i) => <tr key={b.id}><td className="tnum">{b.from ? `${fmtTime(b.from)}` : `#${i + 1}`}</td><td className="tnum">{b.minutes}</td>
        <td><span className="pp-tag" style={{ background: typeColor(sport, b.type) }}>{typeLabel(sport, b.type)}</span></td><td><b>{b.title}</b></td><td className="pp-pn">{b.notes}</td></tr>)}</tbody></table>
    <div className="pp-pmix">{mix.map(([k, m]) => <span key={k}><i style={{ background: typeColor(sport, k) }} />{typeLabel(sport, k) || 'No type'}: {m} min</span>)}</div>
    {p.notes && <div className="pp-pnotes"><b>Notes</b><div>{p.notes}</div></div>}
  </div>;
}
