// Playbook (basketball): diagrammed plays in steps. Everyone on the team sees unlocked plays;
// a padlock keeps a play to coaches and admins (RLS). Coaches draw plays: drag players, draw
// cuts / passes / dribbles / screens, add steps (each starts where the last one's arrows end).
// The playcalling sheet prints every play's name, call and first diagram, by category.
import { useEffect, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { uid } from '../lib/util.js';
import { CATEGORIES, catLabel, LINE_KINDS, startFrame, nextFrame, nextLabel } from '../lib/playbook.js';
import { Diagram, W, D } from '../components/PlayDiagram.jsx';
import PageHead from '../components/PageHead.jsx';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TOOLS = [['move', 'Move'], ['o', 'Offense'], ['x', 'Defense'], ['ball', 'Ball'], ...LINE_KINDS, ['erase', 'Erase']];

export default function Playbook() {
  const H = useHub(); const t = H.team; const edit = H.isCoach;
  const [plays, setPlays] = useState(null), [sel, setSel] = useState(null), [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false), [step, setStep] = useState(0), [q, setQ] = useState(''), [busy, setBusy] = useState(false);
  const load = async (keep) => {
    try { const l = await H.api.listPlays(t.id); setPlays(l); const p = l.find((x) => x.id === keep) || l[0]; setSel(p ? p.id : null); setDraft(p ? JSON.parse(JSON.stringify(p)) : null); setStep(0); }
    catch (e) { setPlays([]); H.toast('Could not load the playbook: ' + e.message); }
  };
  useEffect(() => { load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = plays && plays.find((p) => p.id === sel);
  const dirty = draft && (!saved || !same(draft, saved));
  const leave = async () => !dirty || H.confirm('Discard changes?', 'This play has unsaved changes.', 'Discard');
  const open = async (p) => { if (!(await leave())) return; setSel(p.id); setDraft(JSON.parse(JSON.stringify(p))); setStep(0); setEditing(false); };
  const create = async () => {
    if (!(await leave())) return;
    setSel(null); setDraft({ name: 'New play', category: 'sets', call: '', notes: '', locked: false, frames: [startFrame()] }); setStep(0); setEditing(true);
  };
  const save = async () => {
    if (!draft.name.trim()) { H.toast('Name the play.'); return; }
    setBusy(true);
    try { const r = await H.api.savePlay(t.id, { ...draft, name: draft.name.trim() }); H.toast('Play saved'); setEditing(false); await load(r.id); } catch (e) { H.toast('Could not save. ' + e.message); }
    finally { setBusy(false); }
  };
  const del = async () => { if (!(await H.confirm('Delete play?', `"${draft.name}" is removed from the playbook.`))) return; try { await H.api.deletePlay(draft.id); await load(); setEditing(false); } catch (e) { H.toast(e.message); } };
  const duplicate = () => { setSel(null); setDraft({ ...JSON.parse(JSON.stringify(draft)), id: undefined, name: draft.name + ' (copy)' }); setEditing(true); };
  const toggleLock = async () => {
    const next = { ...draft, locked: !draft.locked }; setDraft(next);
    if (draft.id && !dirty) { try { await H.api.savePlay(t.id, next); H.toast(next.locked ? 'Locked: coaches and admins only' : 'Unlocked: the whole team can see it'); await load(draft.id); } catch (e) { H.toast(e.message); } }
  };
  const acts = <>
    {plays && plays.length > 0 && <button className="btn" onClick={() => window.print()} disabled={editing}><Icon n="clipboard" /> Playcalling sheet</button>}
    {edit && <button className="btn primary" onClick={create}><Icon n="plus" /> New play</button>}
  </>;
  const shown = (plays || []).filter((p) => !q || (p.name + ' ' + p.call).toLowerCase().includes(q.toLowerCase()));
  return <>
    <PageHead title="Playbook" actions={acts} />
    {!plays ? <div className="loading">Loading…</div> : !plays.length && !draft ? <section className="card"><div className="empty-state"><b>No plays yet</b><span className="muted small">{edit ? 'Start with New play: drag the players into place, draw cuts, passes, dribbles and screens, and add a step for each phase of the play.' : 'Your coaches will add plays here.'}</span></div></section>
      : <div className="pb-grid no-print">
        <section className="card pb-list">
          <input className="input" placeholder="Search plays" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search plays" />
          {CATEGORIES.map(([c, label]) => { const l = shown.filter((p) => p.category === c); return l.length > 0 && <div key={c}>
            <div className="pp-k">{label}</div>
            <ul>{l.map((p) => <li key={p.id} className={p.id === sel ? 'on' : ''} onClick={() => open(p)}><b>{p.name}</b>{p.locked && <Icon n="lock" />}{p.call && <span className="muted small">{p.call}</span>}</li>)}</ul></div>; })}
        </section>
        {draft && (editing ? <Editor draft={draft} setDraft={setDraft} step={step} setStep={setStep} dirty={dirty} busy={busy} onSave={save} onCancel={() => { if (saved) { setDraft(JSON.parse(JSON.stringify(saved))); setEditing(false); setStep(0); } else load(); }} />
          : <Viewer play={draft} step={step} setStep={setStep} edit={edit} onEdit={() => setEditing(true)} onLock={toggleLock} onDuplicate={duplicate} onDelete={del} />)}
      </div>}
    {plays && plays.length > 0 && <CallSheet plays={plays} />}
  </>;
}

function Viewer({ play, step, setStep, edit, onEdit, onLock, onDuplicate, onDelete }) {
  const n = play.frames.length; const [auto, setAuto] = useState(false);
  useEffect(() => { if (!auto) return; if (step >= n - 1) { setAuto(false); return; } const id = setTimeout(() => setStep(step + 1), 1300); return () => clearTimeout(id); }, [auto, step, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="card pb-view">
    <div className="card-head"><div><h2>{play.name} {play.locked && <span className="pill" title="Coaches and admins only"><Icon n="lock" /> Locked</span>}</h2>
      <span className="muted small">{catLabel(play.category)}{play.call ? ` · Call: ${play.call}` : ''}</span></div>
      {edit && <div className="acts">
        <button className="btn sm" onClick={onLock} title={play.locked ? 'Only coaches and admins see it' : 'Everyone on the team sees it'}><Icon n="lock" /> {play.locked ? 'Unlock' : 'Lock'}</button>
        <button className="btn sm" onClick={onDuplicate}>Duplicate</button>
        {play.id && <button className="btn sm ghost danger" onClick={onDelete}><Icon n="trash" /></button>}
        <button className="btn sm primary" onClick={onEdit}><Icon n="edit" /> Edit</button></div>}</div>
    <Diagram frame={play.frames[step]} className="pb-court" animate role="img" aria-label={`${play.name}, step ${step + 1} of ${n}`} />
    {n > 1 && <div className="pb-steps">
      <button className="icon-btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={!step} aria-label="Previous step"><Icon n="chevl" /></button>
      {play.frames.map((_, i) => <button key={i} className={`pb-dot ${i === step ? 'on' : ''}`} onClick={() => setStep(i)}>{i + 1}</button>)}
      <button className="icon-btn" onClick={() => setStep(Math.min(n - 1, step + 1))} disabled={step === n - 1} aria-label="Next step"><Icon n="chev" /></button>
      <button className="btn sm" onClick={() => { setStep(0); setAuto(true); }}>▶ Play</button>
    </div>}
    {play.notes && <div className="pb-notes">{play.notes}</div>}
  </section>;
}

function Editor({ draft, setDraft, step, setStep, dirty, busy, onSave, onCancel }) {
  const [tool, setTool] = useState('move'), [sel, setSel] = useState(null), [ghost, setGhost] = useState(null);
  const svg = useRef(), drag = useRef(null);
  const frame = draft.frames[step];
  const setFrame = (f) => setDraft({ ...draft, frames: draft.frames.map((x, i) => (i === step ? f : x)) });
  const pt = (e) => { const p = svg.current.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const r = p.matrixTransform(svg.current.getScreenCTM().inverse()); return { x: clamp(r.x, 0.5, W - 0.5), y: clamp(r.y, 0.5, D - 0.5) }; };
  const down = (e) => {
    if (e.button > 0) return;
    const { x, y } = pt(e);
    if (['o', 'x', 'ball'].includes(tool)) { const label = tool === 'ball' ? '' : nextLabel(frame, tool); setFrame({ ...frame, players: [...frame.players, { id: uid(), kind: tool, label, x, y }] }); return; }
    if (LINE_KINDS.some(([k]) => k === tool)) { drag.current = { line: true, x1: x, y1: y }; setGhost({ id: 'ghost', kind: tool, x1: x, y1: y, x2: x, y2: y }); svg.current.setPointerCapture(e.pointerId); return; }
    setSel(null);
  };
  const itemDown = (e, kind, id) => {
    // adding and drawing tools act on the court (a line can start on a player)
    if (tool !== 'move' && tool !== 'erase') return;
    e.stopPropagation();
    if (tool === 'erase') { setFrame({ players: frame.players.filter((p) => p.id !== id), lines: frame.lines.filter((l) => l.id !== id) }); return; }
    setSel(id);
    if (kind === 'player') { const p = frame.players.find((x) => x.id === id); const s = pt(e); drag.current = { id, dx: s.x - p.x, dy: s.y - p.y }; svg.current.setPointerCapture(e.pointerId); }
  };
  const move = (e) => {
    const d = drag.current; if (!d) return; const { x, y } = pt(e);
    if (d.line) setGhost((g) => ({ ...g, x2: x, y2: y }));
    else setFrame({ ...frame, players: frame.players.map((p) => (p.id === d.id ? { ...p, x: clamp(x - d.dx, 0.5, W - 0.5), y: clamp(y - d.dy, 0.5, D - 0.5) } : p)) });
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (d && d.line && ghost && Math.hypot(ghost.x2 - ghost.x1, ghost.y2 - ghost.y1) > 1.2) setFrame({ ...frame, lines: [...frame.lines, { ...ghost, id: uid() }] });
    setGhost(null);
  };
  useEffect(() => {
    const k = (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !/input|textarea|select/i.test(e.target.tagName)) { setFrame({ players: frame.players.filter((p) => p.id !== sel), lines: frame.lines.filter((l) => l.id !== sel) }); setSel(null); } };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  });
  const addStep = () => { const f = nextFrame(frame); const fr = [...draft.frames]; fr.splice(step + 1, 0, f); setDraft({ ...draft, frames: fr }); setStep(step + 1); };
  const delStep = () => { if (draft.frames.length < 2) return; const fr = draft.frames.filter((_, i) => i !== step); setDraft({ ...draft, frames: fr }); setStep(Math.max(0, step - 1)); };
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  const shown = ghost ? { ...frame, lines: [...frame.lines, ghost] } : frame;
  return <section className="card pb-view pb-edit">
    <div className="pb-meta">
      <label className="field"><span>Name</span><input className="input" value={draft.name} maxLength={80} onChange={set('name')} /></label>
      <label className="field"><span>Category</span><select className="select" value={draft.category} onChange={set('category')}>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="field"><span>Call / signal</span><input className="input" value={draft.call} maxLength={40} onChange={set('call')} placeholder="e.g. Fist, 4 down" /></label>
      <label className="pb-lock"><input type="checkbox" className="cb" checked={!!draft.locked} onChange={(e) => setDraft({ ...draft, locked: e.target.checked })} /> <Icon n="lock" /> Coaches only</label>
    </div>
    <div className="pb-tools" role="toolbar" aria-label="Drawing tools">{TOOLS.map(([k, l]) => <button key={k} className={tool === k ? 'on' : ''} onClick={() => { setTool(k); setSel(null); }}>{l}</button>)}</div>
    <Diagram ref={svg} frame={shown} sel={sel} className={`pb-court edit t-${tool}`} onItemDown={itemDown} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="application" aria-label={`Step ${step + 1} editor`} />
    <div className="pb-steps">
      {draft.frames.map((_, i) => <button key={i} className={`pb-dot ${i === step ? 'on' : ''}`} onClick={() => { setStep(i); setSel(null); }}>{i + 1}</button>)}
      <button className="btn sm" onClick={addStep} title="The next step starts where this step's arrows end"><Icon n="plus" /> Step</button>
      {draft.frames.length > 1 && <button className="btn sm ghost" onClick={delStep}>Remove step {step + 1}</button>}
      {sel && <button className="btn sm ghost danger" onClick={() => { setFrame({ players: frame.players.filter((p) => p.id !== sel), lines: frame.lines.filter((l) => l.id !== sel) }); setSel(null); }}><Icon n="trash" /> Delete selected</button>}
    </div>
    <p className="muted small" style={{ margin: 0 }}><b>Move</b>: drag players. <b>Offense / Defense / Ball</b>: click the court to add. <b>Cut / Pass / Dribble / Screen</b>: drag from where it starts to where it ends. <b>Erase</b>: click an item. <b>+ Step</b> moves players along this step's arrows.</p>
    <label className="field"><span>Notes</span><textarea className="input" value={draft.notes} onChange={set('notes')} maxLength={4000} placeholder="Reads, options, who's the first look…" /></label>
    <div className="pp-foot"><button className="btn" onClick={onCancel}>Cancel</button><span className="spacer" /><button className="btn primary" disabled={!dirty || busy} onClick={onSave}>{busy ? 'Saving…' : 'Save play'}</button></div>
  </section>;
}

/* Playcalling sheet: print / PDF only */
function CallSheet({ plays }) {
  const H = useHub(); const t = H.team;
  return <div className="print-only pb-sheet">
    <header className="gp-head"><Logo t={t} cls="gp-logo" /><div className="gp-title"><div className="gp-team">{t.name}</div><div className="gp-meta">{plays.length} plays</div></div><div className="gp-tag">Playcalling sheet</div></header>
    {CATEGORIES.map(([c, label]) => { const l = plays.filter((p) => p.category === c); return l.length > 0 && <section key={c} className="pb-sc">
      <h3>{label}</h3>
      <div className="pb-cards">{l.map((p) => <div key={p.id} className="pb-card"><Diagram frame={p.frames.find((f) => f.lines.length) || p.frames[0]} className="pb-mini" />
        <div><b>{p.name}</b>{p.locked && ' 🔒'}{p.call && <div className="pb-call">{p.call}</div>}</div></div>)}</div>
    </section>; })}
  </div>;
}
