// Program Builder (owner only, Josh 2026-11-15): Josh's training programs, rebuilt from his
// standalone prototype (program-builder-handoff/). Team tabs → folders of programs → one sheet
// per training day, laid out like the printout and edited in place. Exports a one-page-per-day
// PDF and imports program PDFs exported from Excel / Sheets. Private to Josh: rows live in the
// owner-only `programs` table (see lib/pb/model.js for how they're stored).
//
// Editing model (as in the prototype): the state is one mutable object in a ref. Typing changes
// it in place (inputs are uncontrolled), so a keystroke doesn't redraw every sheet; anything
// structural (add / move / delete, undo, import) goes through `act`, which records an undo step
// and remounts the inputs. Every change keeps a draft in this browser and saves itself shortly after.
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { store } from '../lib/util.js';
import {
  META_NAME, MAX_WEEKS, PALETTES, paletteOf, clone, setPlan, isBlocked, blankRow, trainingDay, regenDay, addWeek, removeWeek, move, uniqueFolder,
  countExercises, fileName, guessName, fromRows, fingerprint, changes, metaData, newTeam, newProgram, moveProgram, moveToTeam,
  mergeBackup, toBackup,
} from '../lib/pb/model.js';
import { parsePages } from '../lib/pb/importer.js';
import { exportPdf } from '../lib/pb/pdf.js';
import { pdfPages } from '../lib/pdfText.js';

const DRAFT = 'pb-draft', SEL = 'pb-sel', FOLDS = 'pb-folds';
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

export default function ProgramBuilder() {
  const H = useHub();
  const S = useRef(null);                       // { teams }
  const saved = useRef({ meta: null, progs: {}, ids: {} });
  const metaId = useRef(null);
  const hist = useRef([]);
  const [, redraw] = useReducer((x) => x + 1, 0);
  const [sv, setSv] = useState(0);              // bumps on structural changes: remounts the inputs
  const [sel, setSel] = useState({ t: 0, p: 0 });
  const [status, setStatus] = useState('loading');
  const [draft, setDraft] = useState(null);
  const [imp, setImp] = useState(null);         // the PDF import review
  const [veil, setVeil] = useState(false);
  const [folds, setFolds] = useState(() => lsGet(FOLDS) || {});
  const timer = useRef(null), saving = useRef(false), again = useRef(false);

  const teams = S.current ? S.current.teams : [];
  const t = Math.min(sel.t, Math.max(teams.length - 1, 0)), T = teams[t] || null;
  const p = T ? Math.min(sel.p, Math.max(T.programs.length - 1, 0)) : 0, P = T ? T.programs[p] || null : null;
  const pick = (tt, pp) => { setSel({ t: tt, p: pp }); lsSet(SEL, { t: tt, p: pp }); };

  /* ---------- load ---------- */
  useEffect(() => {
    H.api.listPrograms().then((rows) => {
      const st = fromRows(rows); metaId.current = st.metaId;
      S.current = { teams: st.teams };
      saved.current = { ...fingerprint(S.current), ids: idsOf(S.current) };
      const s0 = lsGet(SEL); if (s0) setSel(s0);
      const dr = lsGet(DRAFT); if (dr && dr.data && dr.data !== JSON.stringify(S.current)) setDraft(dr);
      setStatus('saved'); setSv((x) => x + 1);
    }).catch((e) => { setStatus('error'); H.toast('Could not load programs: ' + e.message); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- save ---------- */
  const idsOf = (st) => Object.fromEntries(st.teams.flatMap((x) => x.programs.filter((q) => q.id).map((q) => [q.key, q.id])));
  async function save() {
    clearTimeout(timer.current);
    if (!S.current) return;
    if (saving.current) { again.current = true; return; }
    saving.current = true; setStatus('saving');
    try {
      const c = changes(S.current, saved.current);
      for (const u of c.ups) { const r = await H.api.saveProgram(u.row); u.p.id = r.id; }
      for (const id of c.dels) await H.api.deleteProgram(id);
      if (c.meta || !metaId.current) { const r = await H.api.saveProgram({ id: metaId.current || undefined, name: META_NAME, folder: '', data: metaData(S.current) }); metaId.current = r.id; }
      saved.current = { ...c.fp, ids: idsOf(S.current) };
      lsSet(DRAFT, null);
      setStatus(again.current ? 'dirty' : 'saved');
    } catch (e) { setStatus('error'); H.toast('Could not save programs: ' + e.message); }
    saving.current = false;
    if (again.current) { again.current = false; save(); }
  }
  const dirty = () => {
    setStatus('dirty');
    lsSet(DRAFT, { at: new Date().toISOString(), data: JSON.stringify(S.current) });
    clearTimeout(timer.current); timer.current = setTimeout(save, 1500);
  };
  useEffect(() => {
    const f = (e) => { if (status === 'dirty' || status === 'saving') { save(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', f); return () => window.removeEventListener('beforeunload', f);
  });
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); save(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- changes ---------- */
  /** A structural change: records an undo step, applies `fn`, remounts the sheets. */
  const act = (fn) => {
    hist.current.push(JSON.stringify({ s: S.current, sel: { t, p } })); if (hist.current.length > 40) hist.current.shift();
    const next = fn(); dirty(); setSv((x) => x + 1);
    if (next) pick(next.t ?? t, next.p ?? p);
  };
  /** A typed change: applied in place; only things outside the sheet (chips, tabs) redraw. */
  const typed = (fn, light) => { fn(); dirty(); if (light) redraw(); };
  const undo = () => {
    const h = hist.current.pop(); if (!h) return;
    const x = JSON.parse(h); S.current = x.s; dirty(); setSv((v) => v + 1); pick(x.sel.t, x.sel.p);
  };
  const restore = (yes) => {
    if (yes && draft) { act(() => { S.current = JSON.parse(draft.data); }); } else lsSet(DRAFT, null);
    setDraft(null);
  };

  /* ---------- teams, folders, programs ---------- */
  const confirmDel = (title, body, label) => H.confirm(title, body, label);
  const addTeam = () => act(() => { S.current.teams.push(newTeam('New team')); return { t: S.current.teams.length - 1, p: 0 }; });
  const delTeam = async () => {
    if (!(await confirmDel('Delete team?', `"${T.name || 'Untitled team'}" and its ${T.programs.length} program${T.programs.length === 1 ? '' : 's'} will be deleted. Undo brings them back until you leave the page.`, 'Delete team'))) return;
    act(() => { S.current.teams.splice(t, 1); return { t: Math.max(0, t - 1), p: 0 }; });
  };
  const addProgram = (folder = '') => act(() => {
    const q = newProgram('New program', folder, [trainingDay(1)]); T.programs.push(q);
    if (folder) openFold(folder);
    return { p: T.programs.length - 1 };
  });
  const dupProgram = () => act(() => { const c = clone(P); delete c.id; T.programs.splice(p + 1, 0, newProgram(P.name + ' (copy)', P.folder, c.days)); return { p: p + 1 }; });
  const delProgram = async () => {
    if (!(await confirmDel('Delete program?', `"${P.name}" and its ${P.days.length} day${P.days.length === 1 ? '' : 's'} will be deleted. Undo brings it back until you leave the page.`, 'Delete program'))) return;
    act(() => { T.programs.splice(p, 1); return { p: Math.max(0, p - 1) }; });
  };
  const toTeam = (to) => act(() => ({ t: to, p: moveToTeam(S.current, t, p, to) }));
  const setFolder = (v) => act(() => {
    if (v === '__new') { const nm = uniqueFolder(T, 'New folder'); T.folders.push(nm); P.folder = nm; return null; }
    P.folder = v === '' ? '' : T.folders[+v]; return null;
  });
  const foldKey = (f) => `${T ? T.key : ''}|${f}`;
  const openFold = (f) => setFolds((o) => { const n = { ...o }; delete n[foldKey(f)]; lsSet(FOLDS, n); return n; });
  const toggleFold = (f) => setFolds((o) => { const n = { ...o }; if (n[foldKey(f)]) delete n[foldKey(f)]; else n[foldKey(f)] = 1; lsSet(FOLDS, n); return n; });
  const renameFolder = (fi, v) => typed(() => { const old = T.folders[fi]; T.programs.forEach((q) => { if (q.folder === old) q.folder = v; }); T.folders[fi] = v; }, true);
  const delFolder = async (fi) => {
    const f = T.folders[fi], n = T.programs.filter((q) => q.folder === f).length;
    if (!(await confirmDel('Delete folder?', `"${f || 'Untitled folder'}" is removed.${n ? ` Its ${n} program${n === 1 ? '' : 's'} move to "Not in a folder".` : ''}`, 'Delete folder'))) return;
    act(() => { T.folders.splice(fi, 1); T.programs.forEach((q) => { if (q.folder === f) q.folder = ''; }); return null; });
  };

  /* ---------- drag program chips (pointer events: mouse and touch) ---------- */
  const drag = useRef(null), justDragged = useRef(false);
  useEffect(() => {
    const clear = () => document.querySelectorAll('.pb-ins-before,.pb-ins-after,.pb-zone-over').forEach((x) => x.classList.remove('pb-ins-before', 'pb-ins-after', 'pb-zone-over'));
    const mv = (e) => {
      const d = drag.current; if (!d) return;
      if (!d.active) {
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 7) return;
        d.active = true; d.ghost = d.chip.cloneNode(true); d.ghost.className = 'pb-chip on pb-ghost'; document.body.appendChild(d.ghost);
        d.chip.classList.add('pb-dragging'); document.body.classList.add('pb-is-dragging');
      }
      e.preventDefault();
      d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
      clear(); d.target = null;
      const el = document.elementFromPoint(e.clientX, e.clientY); if (!el) return;
      const tchip = el.closest('.pb-chip[data-p]'), zone = el.closest('[data-zone]');
      if (tchip && tchip !== d.chip) {
        const r = tchip.getBoundingClientRect(), before = e.clientX < r.left + r.width / 2;
        tchip.classList.add(before ? 'pb-ins-before' : 'pb-ins-after'); d.target = { type: 'chip', p: +tchip.dataset.p, before };
      } else if (zone && !tchip) { zone.classList.add('pb-zone-over'); d.target = { type: 'zone', zone: zone.dataset.zone }; }
    };
    const end = (apply) => () => {
      const d = drag.current; drag.current = null; if (!d || !d.active) return;
      clear(); if (d.ghost) d.ghost.remove(); d.chip.classList.remove('pb-dragging'); document.body.classList.remove('pb-is-dragging');
      justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 50);
      if (apply && d.target) d.drop(d.target);
    };
    const up = end(true), cancel = end(false), esc = (e) => { if (e.key === 'Escape' && drag.current) cancel(); };
    document.addEventListener('pointermove', mv, { passive: false }); document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', esc); };
  }, []);
  const chipDown = (i) => (e) => {
    if (e.button !== 0) return;
    drag.current = { p: i, chip: e.currentTarget, x: e.clientX, y: e.clientY, active: false, target: null,
      drop: (tg) => {
        const curKey = P && P.key, snap = JSON.stringify({ s: S.current, sel: { t, p } });
        if (!moveProgram(T, i, tg)) return;
        hist.current.push(snap); if (tg.type === 'zone' && tg.zone !== '') openFold(T.folders[+tg.zone]);
        dirty(); setSv((x) => x + 1); pick(t, Math.max(0, T.programs.findIndex((q) => q.key === curKey)));
      } };
  };

  /* ---------- PDF import (button, drop anywhere, paste) ---------- */
  const fileIn = useRef(null), backupIn = useRef(null);
  async function readPdf(file) {
    if (!file) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name || '')) { setImp({ error: 'That file isn’t a PDF. In Excel or Sheets, use File › Download (or Save As) › PDF, then import that file.' }); return; }
    setImp({ loading: true, fileName: file.name || 'pasted.pdf' });
    try {
      const pages = await pdfPages(file);
      const r = parsePages(pages);
      setImp({ fileName: file.name || 'pasted.pdf', days: r.days, problems: r.problems, pageCount: pages.length, name: guessName(file.name), team: t });
    } catch { setImp({ error: 'This PDF couldn’t be read. If it is password-protected or a scan, export it again from Excel or Sheets.' }); }
  }
  useEffect(() => {
    let depth = 0;
    const has = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e) => { if (has(e)) { depth++; setVeil(true); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setVeil(false); };
    const over = (e) => { if (has(e)) e.preventDefault(); };
    const drop = (e) => { if (!has(e)) return; e.preventDefault(); depth = 0; setVeil(false); if (e.dataTransfer.files[0]) readPdf(e.dataTransfer.files[0]); };
    const paste = (e) => { const f = [...((e.clipboardData && e.clipboardData.files) || [])].find((x) => /pdf/i.test(x.type) || /\.pdf$/i.test(x.name)); if (f) { e.preventDefault(); readPdf(f); } };
    document.addEventListener('dragenter', enter); document.addEventListener('dragleave', leave); document.addEventListener('dragover', over);
    document.addEventListener('drop', drop); document.addEventListener('paste', paste);
    return () => { document.removeEventListener('dragenter', enter); document.removeEventListener('dragleave', leave); document.removeEventListener('dragover', over); document.removeEventListener('drop', drop); document.removeEventListener('paste', paste); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const applyImport = (append) => {
    const I = imp; if (!I || !I.days || !I.days.length) return;
    act(() => {
      if (append && P) { I.days.forEach((d) => P.days.push(clone(d))); return null; }
      const ti = Math.min(I.team, S.current.teams.length - 1), TT = S.current.teams[ti];
      TT.programs.push(newProgram(I.name.trim() || guessName(I.fileName), '', clone(I.days)));
      return { t: ti, p: TT.programs.length - 1 };
    });
    setImp(null); H.toast(append ? 'Days added. Undo reverses the import.' : 'Program added. Undo reverses the import.');
  };

  /* ---------- backup file (Josh's program-builder-data.json) ---------- */
  async function loadBackup(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      let r; act(() => { r = mergeBackup(S.current, data); return null; });
      await save();
      H.toast(`Loaded ${r.added.length} program${r.added.length === 1 ? '' : 's'}${r.skipped.length ? ` (${r.skipped.length} already here, skipped)` : ''}.`);
    } catch (e) { H.toast(e instanceof SyntaxError ? 'That file isn’t a Program Builder backup.' : e.message); }
  }
  const downloadBackup = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(toBackup(S.current), null, 2)], { type: 'application/json' }));
    a.download = `program-builder-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /* ---------- PDF export ---------- */
  const pdfAll = () => P && exportPdf(P.days, fileName(T.name + ' - ' + P.name), paletteOf(T)).catch((e) => H.toast('Could not make the PDF: ' + e.message));
  const pdfDay = (d, di) => exportPdf([d], fileName(T.name + ' - ' + P.name + ' - ' + (d.title || 'Page ' + (di + 1)).replace(/:.*/, '')), paletteOf(T)).catch((e) => H.toast('Could not make the PDF: ' + e.message));

  /* ---------- render ---------- */
  if (status === 'loading') return <div className="loading">Loading…</div>;
  const statusText = { saved: 'All changes saved', dirty: 'Unsaved changes', saving: 'Saving…', error: 'Not saved: retrying on your next change' }[status];
  const exCount = P ? countExercises(P.days) : 0;
  return <div className="pb">
    <header className="page-head pb-head">
      <div><div className="eyebrow">Only you · Program Builder</div><h1>{P ? P.name || 'Untitled program' : 'Program Builder'}</h1>
        {P && <div className="muted small">{T.name} · {P.days.length} day{P.days.length === 1 ? '' : 's'} · {exCount} exercises</div>}</div>
      <div className="head-actions">
        <span className={`pb-status ${status}`} role="status">{statusText}</span>
        <button className="btn" onClick={undo} disabled={!hist.current.length}>Undo</button>
        <button className="btn" onClick={() => fileIn.current.click()}>Import PDF</button>
        <button className="btn" onClick={save} disabled={status === 'saved' || status === 'saving'}>Save</button>
        <button className="btn primary" onClick={pdfAll} disabled={!P || !P.days.length}>Export PDF</button>
        <input ref={fileIn} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { readPdf(e.target.files[0]); e.target.value = ''; }} />
        <input ref={backupIn} type="file" accept="application/json,.json" hidden onChange={(e) => { loadBackup(e.target.files[0]); e.target.value = ''; }} />
      </div>
    </header>

    {draft && <div className="hint pb-note"><span>You have edits in this browser from {new Date(draft.at).toLocaleString()} that were never saved.</span>
      <button className="btn sm primary" onClick={() => restore(true)}>Restore them</button><button className="btn sm" onClick={() => restore(false)}>Discard</button></div>}
    {imp && <ImportPanel imp={imp} setImp={setImp} teams={teams} current={P} apply={applyImport} />}

    <nav className="pb-tabs" aria-label="Teams">
      {teams.map((x, i) => <button key={x.key} className={i === t ? 'on' : ''} aria-current={i === t ? 'page' : undefined} onClick={() => pick(i, 0)}>
        <span>{x.name || 'Untitled team'}</span><small>{x.programs.length}</small></button>)}
      <button className="pb-tab-add" onClick={addTeam}>+ New team</button>
    </nav>

    {!T ? <section className="card pb-empty"><h2>No programs yet</h2>
      <p className="muted" style={{ margin: 0 }}>Load your backup file (program-builder-data.json) to bring in your teams and programs, or start a new team.</p>
      <div className="pb-row"><button className="btn primary" onClick={() => backupIn.current.click()}>Load backup file</button><button className="btn" onClick={addTeam}>+ New team</button></div></section>
      : <>
        <section className="card pb-ctl" key={'c' + sv + t}>
          <div className="pb-ctlrow"><label className="pb-lbl" htmlFor="pb-team">Team</label>
            <input id="pb-team" className="input pb-fld" defaultValue={T.name} placeholder="Team name" onChange={(e) => typed(() => { T.name = e.target.value; }, true)} />
            <button className="btn sm" onClick={delTeam}>Delete team</button></div>
          <div className="pb-ctlrow"><span className="pb-lbl">Colours</span>
            <div className="seg pb-pal" role="radiogroup" aria-label="Sheet and PDF colours">{Object.entries(PALETTES).map(([k, x]) => <button key={k} role="radio" aria-checked={paletteOf(T) === k} className={paletteOf(T) === k ? 'on' : ''}
              onClick={() => paletteOf(T) !== k && act(() => { T.palette = k; return null; })}><i style={{ background: x.bar }} /><i style={{ background: x.tag }} />{x.label}</button>)}</div>
            <span className="muted small">For this team's sheets and PDFs</span></div>
          <div className="pb-ctlrow top"><span className="pb-lbl">Programs</span>
            <Groups T={T} cur={p} folds={folds} foldKey={foldKey} chipDown={chipDown} open={(i) => { if (!justDragged.current) pick(t, i); }}
              toggle={toggleFold} rename={renameFolder} up={(fi) => act(() => { move(T.folders, fi, -1); })} down={(fi) => act(() => { move(T.folders, fi, 1); })}
              del={delFolder} addProgram={addProgram} addFolder={() => act(() => { T.folders.push(uniqueFolder(T, 'New folder')); })} /></div>
          {P && <div className="pb-ctlrow"><label className="pb-lbl" htmlFor="pb-prog">Program</label>
            <input id="pb-prog" className="input pb-fld" defaultValue={P.name} placeholder="Program name" onChange={(e) => typed(() => { P.name = e.target.value; }, true)} />
            <select className="select pb-sm" aria-label="Folder for this program" value={P.folder && T.folders.indexOf(P.folder) >= 0 ? String(T.folders.indexOf(P.folder)) : ''} onChange={(e) => setFolder(e.target.value)}>
              <option value="">No folder</option>{T.folders.map((f, i) => <option key={i} value={i}>{f || 'Untitled folder'}</option>)}<option value="__new">New folder…</option></select>
            <button className="btn sm" onClick={dupProgram}>Duplicate</button>
            {teams.length > 1 && <select className="select pb-sm" aria-label="Move program to another team" value="" onChange={(e) => e.target.value !== '' && toTeam(+e.target.value)}>
              <option value="">Move to team…</option>{teams.map((x, i) => i !== t && <option key={x.key} value={i}>{x.name || 'Untitled team'}</option>)}</select>}
            <button className="btn sm" onClick={delProgram}>Delete program</button></div>}
          <div className="pb-ctlrow pb-backup"><span className="pb-lbl">Backup</span>
            <button className="btn sm ghost" onClick={() => backupIn.current.click()}>Load backup file</button>
            <button className="btn sm ghost" onClick={downloadBackup}>Download a backup</button></div>
        </section>

        {P ? <>
          <p className="hint pb-hint">Drag program chips to reorder them or drop them into a folder. Click any text on a sheet to edit it. Set boxes follow the prescription: <b>3x8</b> gives 3 boxes, <b>12,10,8</b> one box per target, <b>—</b> shades the week out. Import PDF converts a program exported from Excel or Sheets; you can also drop or paste the PDF anywhere on this page.</p>
          <div key={'d' + sv + t + '-' + p} className="pb-days" style={sheetVars(PALETTES[paletteOf(T)])}>
            {P.days.map((d, di) => <Day key={di} d={d} di={di} nd={P.days.length} typed={typed} act={act} pdf={() => pdfDay(d, di)}
              del={async () => { if (await confirmDel('Delete day?', `"${d.title || 'Page ' + (di + 1)}" will be deleted. Undo brings it back.`, 'Delete day')) act(() => { P.days.splice(di, 1); }); }}
              days={P.days} />)}
          </div>
          <div className="pb-row"><button className="btn" onClick={() => act(() => { P.days.push(trainingDay(P.days.length + 1, P.days[0] && P.days[0].block)); })}>+ Add training day</button>
            <button className="btn" onClick={() => act(() => { P.days.push(regenDay(P.days[0] && P.days[0].block)); })}>+ Add regen day</button></div>
        </> : <section className="card pb-empty"><h2>No programs in {T.name || 'this team'} yet</h2>
          <p className="muted" style={{ margin: 0 }}>Start a blank one, or import a program PDF exported from Excel or Google Sheets.</p>
          <div className="pb-row"><button className="btn primary" onClick={() => addProgram()}>+ New program</button><button className="btn" onClick={() => fileIn.current.click()}>Import PDF</button></div></section>}
      </>}
    {veil && <div className="pb-veil"><div>Drop the PDF to convert it</div></div>}
  </div>;
}

// the sheet's paper colours as CSS variables (see .pb-sheet in styles.css)
const sheetVars = (x) => ({ '--p-title': x.title, '--p-bar': x.bar, '--p-purple': x.line, '--p-lav': x.lav, '--p-sec': x.sec, '--p-alt': x.alt, '--p-grid': x.grid,
  '--p-box': x.box, '--p-gray': x.gray, '--p-setn': x.setn, '--p-hdrsub': x.hdrsub, '--p-block': x.block, '--p-yel': x.tag, '--p-tagfg': x.tagFg, '--p-tagsub': x.tagSub });

/* ---------- program chips grouped by folder ---------- */
function Groups({ T, cur, folds, foldKey, chipDown, open, toggle, rename, up, down, del, addProgram, addFolder }) {
  const inFolder = (q) => q.folder && T.folders.indexOf(q.folder) >= 0;
  const chip = (q, i) => <button key={q.key} className={`pb-chip ${i === cur ? 'on' : ''}`} data-p={i} onPointerDown={chipDown(i)} onClick={() => open(i)} title="Click to open · drag to reorder or move into a folder">{q.name || 'Untitled'}</button>;
  const loose = T.programs.map((q, i) => [q, i]).filter(([q]) => !inFolder(q));
  return <div className="pb-groups">
    <div className="pb-group loose" data-zone="">
      {T.folders.length > 0 && <div className="pb-ghead">Not in a folder</div>}
      <div className="pb-chips">{loose.map(([q, i]) => chip(q, i))}{!loose.length && T.folders.length > 0 && <span className="pb-dropnote">Drag a program here to take it out of its folder</span>}</div>
    </div>
    {T.folders.map((f, fi) => {
      const ids = T.programs.map((q, i) => [q, i]).filter(([q]) => q.folder === f), shut = !!folds[foldKey(f)];
      return <div key={fi} className={`pb-group folder ${shut ? 'shut' : ''}`} data-zone={fi}>
        <div className="pb-fhead">
          <button className="pb-fold" onClick={() => toggle(f)} aria-expanded={!shut} aria-label={shut ? 'Expand folder' : 'Collapse folder'}>{shut ? '▸' : '▾'}</button>
          <svg className="pb-ficon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h4.2l1.5 1.6h7.3v7.4h-13z" /></svg>
          <input className="pb-fname" defaultValue={f} placeholder="Folder name" aria-label="Folder name" onChange={(e) => rename(fi, e.target.value)} />
          <span className="pb-fcount">{ids.length}</span>{shut && ids.some(([, i]) => i === cur) && <span className="pb-fcur">open program inside</span>}
          <span className="pb-facts"><button className="btn sm ghost" onClick={() => addProgram(f)}>+ Program</button>
            <button className="btn sm ghost" onClick={() => up(fi)} disabled={fi === 0} aria-label="Move folder up">↑</button>
            <button className="btn sm ghost" onClick={() => down(fi)} disabled={fi === T.folders.length - 1} aria-label="Move folder down">↓</button>
            <button className="btn sm ghost" onClick={() => del(fi)}>Delete</button></span>
        </div>
        {!shut && <div className="pb-chips">{ids.map(([q, i]) => chip(q, i))}{!ids.length && <span className="pb-dropnote">Empty. Drag programs here</span>}</div>}
      </div>;
    })}
    <div className="pb-chips"><button className="pb-chip add" onClick={() => addProgram()}>+ New program</button><button className="pb-chip add" onClick={addFolder}>+ New folder</button></div>
  </div>;
}

/* ---------- one training day as a sheet of paper ---------- */
// A sheet text box: one line that wraps onto more lines when the words don't fit, growing the
// cell (and its row) to show them all. Enter leaves the box instead of adding a line break.
const fitHeight = (el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
let resizer = null; // one observer for every box: refit when a column's width changes
const watch = (el) => {
  if (!resizer && typeof ResizeObserver !== 'undefined') resizer = new ResizeObserver((es) => es.forEach((e) => { if (e.target.dataset.w !== String(e.contentRect.width)) { e.target.dataset.w = e.contentRect.width; fitHeight(e.target); } }));
  if (resizer) resizer.observe(el);
  return () => resizer && resizer.unobserve(el);
};
function In({ v, set, cls = '', ph }) {
  const ref = useRef(null);
  useLayoutEffect(() => { fitHeight(ref.current); return watch(ref.current); }, []);
  return <textarea ref={ref} rows={1} className={cls} defaultValue={v} placeholder={ph || ''} aria-label={ph}
    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
    onChange={(e) => { const x = e.target.value.replace(/\r?\n/g, ' '); if (x !== e.target.value) e.target.value = x; fitHeight(e.target); set(x); }} />;
}
function Day({ d, di, nd, typed, act, pdf, del, days }) {
  const nw = d.weeks.length, ed = (fn) => (v) => typed(() => fn(v));
  const ab = (label, title, fn, dis) => <button className="pb-ab" title={title} aria-label={title} disabled={dis} onClick={fn}>{label}</button>;
  return <section className="pb-day">
    <div className="pb-daybar"><span className="pb-dname">Page {di + 1}</span>
      <button className="btn sm" disabled={di === 0} onClick={() => act(() => { move(days, di, -1); })}>Move up</button>
      <button className="btn sm" disabled={di === nd - 1} onClick={() => act(() => { move(days, di, 1); })}>Move down</button><span className="pb-sep" />
      <button className="btn sm" onClick={() => act(() => { d.sections.push({ title: 'New section', rest: '', rows: [blankRow(nw)] }); })}>+ Section</button>
      <button className="btn sm" onClick={() => act(() => { d.notes.push(''); })}>+ Note line</button>
      <button className="btn sm" disabled={nw >= MAX_WEEKS} onClick={() => act(() => { addWeek(d); })}>+ Week</button>
      <button className="btn sm" disabled={nw <= 1} onClick={() => act(() => { removeWeek(d); })}>− Week</button><span className="pb-sep" />
      <button className="btn sm" onClick={() => act(() => { days.splice(di + 1, 0, clone(d)); })}>Duplicate</button>
      <button className="btn sm" onClick={pdf}>Export page</button>
      <button className="btn sm" disabled={nd <= 1} onClick={del}>Delete day</button></div>
    <div className="pb-scroll"><table className="pb-sheet"><colgroup><col style={{ width: '26%' }} />{d.weeks.map((_, i) => <col key={i} />)}</colgroup><tbody>
      <tr className="t-row"><td><In cls="blk" v={d.block} ph="Block name" set={ed((v) => { d.block = v; })} /></td>
        <td colSpan={Math.max(nw - 1, 1)}><In cls="ttl" v={d.title} ph="Day title" set={ed((v) => { d.title = v; })} /></td>
        {nw > 1 && <td className="tag"><div className="tagbox"><In cls="tg" v={d.tag} ph="TAG" set={ed((v) => { d.tag = v; })} /><i>·</i><In cls="sb" v={d.sub} ph="group" set={ed((v) => { d.sub = v; })} /></div></td>}</tr>
      <tr className="h-row"><td className="exh">Exercise<small>tempo · rest</small></td>
        {d.weeks.map((w, wi) => <td key={wi} className="wk"><In cls="wkl" v={w} ph="Week" set={ed((v) => { d.weeks[wi] = v; })} /><span className="wks">set boxes: load or tick</span></td>)}</tr>
      {d.sections.map((s, si) => [
        <tr key={'s' + si} className="s-row"><td colSpan={nw + 1}><div className="s-in"><In cls="stl" v={s.title} ph="Section name" set={ed((v) => { s.title = v; })} />
          <span className="rl">Rest:</span><In cls="srest" v={s.rest} ph="per exercise" set={ed((v) => { s.rest = v; })} />
          <div className="acts">{ab('+ Exercise', 'Add an exercise at the end of this section', () => act(() => { s.rows.push(blankRow(nw)); }))}
            <select className="pb-ab pb-n" value="" title="Add several exercises at the end of this section" aria-label="Add several exercises"
              onChange={(e) => { const n = +e.target.value; if (n) act(() => { for (let i = 0; i < n; i++) s.rows.push(blankRow(nw)); }); }}>
              <option value="">+ more…</option>{[2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>+ {n} exercises</option>)}</select>
            {ab('↑', 'Move section up', () => act(() => { move(d.sections, si, -1); }), si === 0)}{ab('↓', 'Move section down', () => act(() => { move(d.sections, si, 1); }), si === d.sections.length - 1)}
            {ab('✕', 'Delete section', () => act(() => { d.sections.splice(si, 1); }))}</div></div></td></tr>,
        ...s.rows.map((r, ri) => <tr key={si + '-' + ri} className={`e-row ${ri % 2 ? 'alt' : ''}`}>
          <td className="nmc"><div className="nm"><In cls="nmi" v={r.name} ph="Exercise name" set={ed((v) => { r.name = v; })} />
            <div className="meta"><In v={r.tempo} ph="tempo" set={ed((v) => { r.tempo = v; })} /><span>·</span><In v={r.rest} ph="rest" set={ed((v) => { r.rest = v; })} /></div></div>
            <div className="acts ra">{ab('↑', 'Move up', () => act(() => { move(s.rows, ri, -1); }), ri === 0)}{ab('↓', 'Move down', () => act(() => { move(s.rows, ri, 1); }), ri === s.rows.length - 1)}
              {ab('+', 'Insert a blank exercise below', () => act(() => { s.rows.splice(ri + 1, 0, blankRow(nw)); }))}
              {ab('⧉', 'Duplicate row', () => act(() => { s.rows.splice(ri + 1, 0, clone(r)); }))}{ab('✕', 'Delete row', () => act(() => { s.rows.splice(ri, 1); }))}</div></td>
          {d.weeks.map((_, w) => <td key={w} className="wk"><Week c={r.cells[w] || (r.cells[w] = { rx: '', load: '' })} wide={nw <= 4} typed={typed} /></td>)}
        </tr>),
      ])}
      {d.notes.map((n, ni) => <tr key={'n' + ni} className="n-row"><td colSpan={nw + 1}><div className="n-in"><In v={n} ph="LABEL: details (e.g. WALL STRETCH: Pigeon x90sec/side)" set={ed((v) => { d.notes[ni] = v; })} />
        <div className="acts">{ab('✕', 'Delete note line', () => act(() => { d.notes.splice(ni, 1); }))}</div></div></td></tr>)}
      <tr className="l-row first"><td className="ll">SESSION LOG</td>{d.weeks.map((_, k) => <td key={k} className="lc wk">Date ________ &nbsp;RPE ___/10</td>)}</tr>
      <tr className="l-row notes"><td className="ll">NOTES / HOW I FELT</td>{d.weeks.map((_, k) => <td key={k} className="wk" />)}</tr>
    </tbody></table></div>
  </section>;
}

/* one week cell: prescription + load, with the set boxes redrawn as the prescription changes */
function Week({ c, wide, typed }) {
  const [rx, setRx] = useState(c.rx), plan = setPlan(rx), blocked = isBlocked(rx);
  return <div className={`wc ${wide ? 'wide' : ''} ${blocked ? 'blocked' : ''}`}>
    <div className="lab"><In cls="rx" v={c.rx} ph="3x8" set={(v) => { typed(() => { c.rx = v; }); setRx(v); }} />
      <In cls="ld" v={c.load} ph="load" set={(v) => typed(() => { c.load = v; })} /></div>
    {blocked ? <div className="bx blocked" title="Not done this week" /> : <div className="bx">{plan.boxes.map((b, i) => <span key={i} className={plan.target ? 'tgt' : ''}>{b}</span>)}</div>}
  </div>;
}

/* ---------- the import review ---------- */
function ImportPanel({ imp, setImp, teams, current, apply }) {
  const I = imp;
  if (I.loading) return <section className="card pb-imp" aria-live="polite"><b>Reading {I.fileName}…</b></section>;
  if (I.error) return <section className="card pb-imp" aria-live="polite"><div className="pb-imphead"><b>Import didn’t work</b><button className="btn sm" onClick={() => setImp(null)}>Close</button></div><p style={{ margin: 0 }}>{I.error}</p></section>;
  const nEx = countExercises(I.days);
  return <section className="card pb-imp" aria-live="polite">
    <div className="pb-imphead"><b>Import {I.fileName}</b><span className="muted small">{I.days.length} of {I.pageCount} page{I.pageCount === 1 ? '' : 's'} converted · {nEx} exercises</span></div>
    {I.days.length > 0 && <ol className="pb-impdays">{I.days.map((d, i) => <li key={i}><b>{d.title}</b>{d.tag && <span className="pb-pill">{d.tag}{d.sub ? ' · ' + d.sub : ''}</span>}
      <span className="muted small">{d.sections.length} sections · {countExercises([d])} exercises · {d.weeks.length} weeks</span></li>)}</ol>}
    {I.problems.length > 0 && <ul className="pb-impwarn">{I.problems.map((x) => <li key={x}>{x}</li>)}</ul>}
    {I.days.length > 0 ? <>
      <div className="pb-row"><label className="pb-lbl" htmlFor="pb-impname">Program name</label>
        <input id="pb-impname" className="input pb-fld" value={I.name} onChange={(e) => setImp({ ...I, name: e.target.value })} />
        <label className="pb-lbl" htmlFor="pb-impteam">Team</label>
        <select id="pb-impteam" className="select pb-sm" value={I.team} onChange={(e) => setImp({ ...I, team: +e.target.value })}>{teams.map((x, i) => <option key={x.key} value={i}>{x.name || 'Untitled team'}</option>)}</select></div>
      <div className="pb-row"><button className="btn primary" onClick={() => apply(false)} disabled={!teams.length}>Add as new program</button>
        {current && <button className="btn" onClick={() => apply(true)}>Add these days to {current.name}</button>}
        <button className="btn" onClick={() => setImp(null)}>Cancel</button></div>
      <p className="muted small" style={{ margin: 0 }}>Check the converted sheets after adding. Everything stays editable, and Undo reverses the import.</p>
    </> : <div className="pb-row"><button className="btn" onClick={() => setImp(null)}>Close</button></div>}
  </section>;
}
