import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHub } from '../lib/hub.jsx';
import Icon from '../components/Icon.jsx';
import SheetGrid, { cellStyle } from '../components/SheetGrid.jsx';
import {
  FILLS, SIZES, BASE_SIZE, template, blank, rangeOf, cellAt, toggle, setStyle, merge, unmerge, mergeAt,
  insertRows, deleteRows, insertCols, deleteCols, hiddenCells, usedSize, fitZoom, newProgram,
} from '../lib/sheet.js';
import { uid, clone } from '../lib/util.js';

// Programs (owner only): Josh's spreadsheet-style program builder. A program is a workbook of
// sheets (one per training day); each sheet prints on one full page. Saves itself as you type.
const FILL_NAMES = { '': 'No fill', g: 'Grey', d: 'Dark', y: 'Yellow', gr: 'Green', bl: 'Blue', r: 'Red' };
const one = { a: { r: 0, c: 0 }, b: { r: 0, c: 0 } };

export default function Programs() {
  const H = useHub();
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [doc, setDoc] = useState(null);              // the open program: { id, name, folder, data: { sheets } }
  const [si, setSi] = useState(0);
  const [sel, setSel] = useState(one);
  const [status, setStatus] = useState('');
  const [printing, setPrinting] = useState(null);
  const [q, setQ] = useState('');
  const hist = useRef({ past: [], future: [] });
  const timer = useRef(null), pending = useRef(null), docRef = useRef(null);
  docRef.current = doc;

  useEffect(() => { H.api.listPrograms().then((l) => { setList(l); if (l.length) open(l[0], true); }).catch((e) => H.toast('Could not load programs: ' + e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current; if (!p) return; pending.current = null;
    setStatus('Saving…');
    try { const r = await H.api.saveProgram(p); setList((l) => (l || []).map((x) => (x.id === r.id ? r : x))); setStatus('Saved'); }
    catch (e) { setStatus('Not saved'); H.toast('Could not save: ' + e.message); }
  }, [H]);
  useEffect(() => () => { flush(); }, [flush]);
  useEffect(() => { const f = (e) => { if (pending.current) { flush(); e.preventDefault(); } }; window.addEventListener('beforeunload', f); return () => window.removeEventListener('beforeunload', f); }, [flush]);
  const queue = (d) => { pending.current = d; setStatus('Editing…'); clearTimeout(timer.current); timer.current = setTimeout(flush, 800); };

  function open(p, first) {
    if (!first) flush();
    setOpenId(p.id); setDoc(clone(p)); setSi(0); setSel(one); hist.current = { past: [], future: [] }; setStatus('');
  }
  /** Change the open program; `record` adds an undo step (from `prevData` when given). */
  const change = (fn, { record = true, prevData } = {}) => {
    const cur = docRef.current; if (!cur) return;
    const next = fn(cur);
    if (record) { hist.current.past.push(prevData || cur.data); if (hist.current.past.length > 200) hist.current.past.shift(); hist.current.future = []; }
    docRef.current = next; setDoc(next); queue(next);
  };
  const sheets = doc ? doc.data.sheets : [];
  const sheet = sheets[Math.min(si, sheets.length - 1)];
  const withSheet = (d, sh) => ({ ...d, data: { ...d.data, sheets: d.data.sheets.map((x, i) => (i === si ? sh : x)) } });
  const setSheet = (sh, opts = {}) => change((d) => withSheet(d, sh), { record: !opts.soft, prevData: opts.from ? withSheet(docRef.current, opts.from).data : undefined });
  const undo = () => { const h = hist.current; if (!h.past.length) return; h.future.push(doc.data); const data = h.past.pop(); change((d) => ({ ...d, data }), { record: false }); };
  const redo = () => { const h = hist.current; if (!h.future.length) return; h.past.push(doc.data); const data = h.future.pop(); change((d) => ({ ...d, data }), { record: false }); };

  const create = async () => {
    try { await flush(); const r = await H.api.saveProgram(newProgram()); setList((l) => [r, ...(l || [])]); open(r, true); }
    catch (e) { H.toast('Could not create: ' + e.message); }
  };
  const duplicate = async () => {
    try { await flush(); const r = await H.api.saveProgram({ ...doc, id: null, name: doc.name + ' (copy)', data: { sheets: doc.data.sheets.map((s) => ({ ...clone(s), id: uid() })) } }); setList((l) => [r, ...(l || [])]); open(r, true); H.toast('Copied'); }
    catch (e) { H.toast('Could not copy: ' + e.message); }
  };
  const remove = async () => {
    if (!(await H.confirm('Delete program?', `"${doc.name}" and all ${sheets.length} sheet${sheets.length === 1 ? '' : 's'} will be deleted for good.`, 'Delete program'))) return;
    clearTimeout(timer.current); pending.current = null;
    try { await H.api.deleteProgram(doc.id); const l = list.filter((x) => x.id !== doc.id); setList(l); if (l.length) open(l[0], true); else { setDoc(null); setOpenId(null); } }
    catch (e) { H.toast('Could not delete: ' + e.message); }
  };

  /* ---------- sheets (tabs) ---------- */
  const setSheets = (fn, nextIdx) => { change((d) => ({ ...d, data: { ...d.data, sheets: fn(d.data.sheets) } })); if (nextIdx !== undefined) { setSi(nextIdx); setSel(one); } };
  const addSheet = (kind) => {
    const n = sheets.length + 1, sh = kind === 'copy' ? { ...clone(sheet), id: uid(), name: sheet.name + ' (copy)' } : kind === 'blank' ? blank(30, 9, 'Day ' + n) : template('Day ' + n);
    setSheets((l) => [...l.slice(0, si + 1), sh, ...l.slice(si + 1)], si + 1);
  };
  const renameSheet = (i) => { const v = window.prompt('Sheet name', sheets[i].name); if (v && v.trim()) setSheets((l) => l.map((x, j) => (j === i ? { ...x, name: v.trim() } : x))); };
  const moveSheet = (d) => { const j = si + d; if (j < 0 || j >= sheets.length) return; setSheets((l) => { const a = [...l]; [a[si], a[j]] = [a[j], a[si]]; return a; }, j); };
  const dropSheet = async () => {
    if (sheets.length < 2) return;
    if (!(await H.confirm('Delete sheet?', `"${sheet.name}" will be removed from this program. You can undo it right after.`, 'Delete sheet'))) return;
    setSheets((l) => l.filter((_, j) => j !== si), Math.max(0, si - 1));
  };

  /* ---------- printing ---------- */
  const print = (all) => { flush(); setPrinting(all ? sheets : [sheet]); };

  if (!list) return <div className="loading">Loading programs…</div>;
  const shown = list.filter((p) => !q || (p.name + ' ' + p.folder).toLowerCase().includes(q.toLowerCase()));
  const folders = [...new Set(shown.map((p) => p.folder || ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));

  return <>
    <header className="page-head"><div><div className="eyebrow">Only you</div><h1>Programs</h1></div>
      <div className="head-actions"><button className="btn primary" onClick={create}><Icon n="plus" /> New program</button></div></header>
    <div className="pg">
      <aside className="pg-list card">
        <input className="input" placeholder="Search programs" value={q} onChange={(e) => setQ(e.target.value)} />
        {!list.length && <p className="muted small" style={{ margin: 0 }}>No programs yet. Start one with New program.</p>}
        {folders.map((f) => <div key={f || '_'}>
          {folders.length > 1 && <div className="pg-folder">{f || 'No folder'}</div>}
          {shown.filter((p) => (p.folder || '') === f).map((p) => <button key={p.id} className={`pg-item ${p.id === openId ? 'on' : ''}`} onClick={() => p.id !== openId && open(p)}>
            <span>{p.id === openId && doc ? doc.name : p.name}</span><small>{new Date(p.updated_at).toLocaleDateString()}</small></button>)}
        </div>)}
      </aside>
      {doc && sheet ? <section className="pg-main card">
        <div className="pg-meta">
          <input className="input pg-name" aria-label="Program name" value={doc.name} onChange={(e) => change((d) => ({ ...d, name: e.target.value }), { record: false })} />
          <input className="input pg-fold" aria-label="Folder" placeholder="Folder (e.g. BU Rugby)" value={doc.folder} onChange={(e) => change((d) => ({ ...d, folder: e.target.value }), { record: false })} />
          <span className="muted small pg-status">{status}</span>
          <span className="pg-sp" />
          <button className="btn sm" onClick={() => print(false)}>Print sheet</button>
          {sheets.length > 1 && <button className="btn sm" onClick={() => print(true)}>Print all ({sheets.length})</button>}
          <button className="btn sm ghost" onClick={duplicate}>Duplicate</button>
          <button className="btn sm ghost danger" onClick={remove}><Icon n="trash" /></button>
        </div>
        <Toolbar sheet={sheet} sel={sel} setSheet={setSheet} undo={undo} redo={redo} canUndo={hist.current.past.length > 0} canRedo={hist.current.future.length > 0} />
        <SheetGrid key={sheet.id} sheet={sheet} onChange={setSheet} undo={undo} redo={redo} sel={sel} setSel={setSel} />
        <div className="pg-tabs" role="tablist">
          {sheets.map((s, i) => <button key={s.id} role="tab" aria-selected={i === si} className={i === si ? 'on' : ''} onClick={() => { setSi(i); setSel(one); }} onDoubleClick={() => renameSheet(i)} title="Double-click to rename">{s.name}</button>)}
          <button className="pg-add" onClick={() => addSheet('template')} title="New sheet from the program template"><Icon n="plus" /></button>
          <span className="pg-sp" />
          <select className="select pg-tabact" value="" onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v === 'rename') renameSheet(si); else if (v === 'left') moveSheet(-1); else if (v === 'right') moveSheet(1); else if (v === 'delete') dropSheet(); else addSheet(v); }}>
            <option value="">Sheet…</option>
            <option value="copy">Duplicate this sheet</option>
            <option value="template">New sheet: template</option>
            <option value="blank">New sheet: blank</option>
            <option value="rename">Rename</option>
            <option value="left" disabled={si === 0}>Move left</option>
            <option value="right" disabled={si === sheets.length - 1}>Move right</option>
            <option value="delete" disabled={sheets.length < 2}>Delete sheet</option>
          </select>
        </div>
        <p className="muted small pg-help">Type to fill a cell · Enter or double-click to edit · Alt+Enter for a new line · paste straight from Excel · ⌘B bold · ⌘D fill down · ⌘Z undo · drag a column letter's edge to resize</p>
      </section> : <section className="pg-main card"><p className="muted" style={{ margin: 0 }}>Pick a program or start a new one.</p></section>}
    </div>
    {printing && <PrintPages sheets={printing} done={() => setPrinting(null)} />}
  </>;
}

function Toolbar({ sheet, sel, setSheet, undo, redo, canUndo, canRedo }) {
  const rg = rangeOf(sel.a, sel.b, sheet);
  const cur = cellAt(sheet, rg.r0, rg.c0) || {};
  const merged = !!mergeAt(sheet, rg.r0, rg.c0) && sheet.merges.some((m) => m.r >= rg.r0 && m.r <= rg.r1 && m.c >= rg.c0 && m.c <= rg.c1);
  const B = ({ on, title, onClick, children, dis }) => <button className={`pg-tb ${on ? 'on' : ''}`} title={title} aria-label={title} aria-pressed={on === undefined ? undefined : !!on} disabled={dis} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</button>;
  const nr = rg.r1 - rg.r0 + 1, nc = rg.c1 - rg.c0 + 1;
  return <div className="pg-bar">
    <B title="Undo (⌘Z)" dis={!canUndo} onClick={undo}>↶</B><B title="Redo (⇧⌘Z)" dis={!canRedo} onClick={redo}>↷</B>
    <i className="pg-div" />
    <B title="Bold (⌘B)" on={cur.b} onClick={() => setSheet(toggle(sheet, rg, 'b'))}><b>B</b></B>
    <B title="Italic (⌘I)" on={cur.i} onClick={() => setSheet(toggle(sheet, rg, 'i'))}><em>I</em></B>
    <select className="select pg-size" aria-label="Font size" value={cur.s || BASE_SIZE} onChange={(e) => setSheet(setStyle(sheet, rg, 's', Number(e.target.value) === BASE_SIZE ? undefined : Number(e.target.value)))}>
      {[...new Set([...SIZES, cur.s || BASE_SIZE])].sort((a, b) => a - b).map((s) => <option key={s} value={s}>{s} pt</option>)}</select>
    <i className="pg-div" />
    {[['l', 'Align left', '⇤'], ['c', 'Centre', '↔'], ['r', 'Align right', '⇥']].map(([a, t, g]) => <B key={a} title={t} on={(cur.a || 'l') === a} onClick={() => setSheet(setStyle(sheet, rg, 'a', a === 'l' ? undefined : a))}>{g}</B>)}
    <i className="pg-div" />
    <span className="pg-fills" role="group" aria-label="Fill">{Object.keys(FILLS).map((f) => <button key={f || 'none'} className={`pg-fill ${(cur.f || '') === f ? 'on' : ''}`} title={FILL_NAMES[f]} aria-label={FILL_NAMES[f]} style={{ background: FILLS[f] || '#fff' }} onMouseDown={(e) => e.preventDefault()} onClick={() => setSheet(setStyle(sheet, rg, 'f', f || undefined))}>{f ? '' : '∅'}</button>)}</span>
    <B title="Borders on / off" on={!cur.nb} onClick={() => setSheet(toggle(sheet, rg, 'nb'))}>▦</B>
    <i className="pg-div" />
    <B title={merged ? 'Unmerge cells' : 'Merge cells'} on={merged} dis={!merged && nr * nc < 2} onClick={() => setSheet(merged ? unmerge(sheet, rg) : merge(sheet, rg))}>{merged ? 'Unmerge' : 'Merge'}</B>
    <i className="pg-div" />
    <B title="Insert row above" onClick={() => setSheet(insertRows(sheet, rg.r0, nr))}>+ Row ↑</B>
    <B title="Insert row below" onClick={() => setSheet(insertRows(sheet, rg.r1 + 1, nr))}>+ Row ↓</B>
    <B title={`Delete ${nr} row${nr === 1 ? '' : 's'}`} onClick={() => setSheet(deleteRows(sheet, rg.r0, rg.r1))}>− Row</B>
    <B title="Insert column left" onClick={() => setSheet(insertCols(sheet, rg.c0, nc))}>+ Col ←</B>
    <B title="Insert column right" onClick={() => setSheet(insertCols(sheet, rg.c1 + 1, nc))}>+ Col →</B>
    <B title={`Delete ${nc} column${nc === 1 ? '' : 's'}`} dis={nc >= sheet.widths.length} onClick={() => setSheet(deleteCols(sheet, rg.c0, rg.c1))}>− Col</B>
    <i className="pg-div" />
    <select className="select pg-size" aria-label="Page orientation" value={sheet.orient} onChange={(e) => setSheet({ ...sheet, orient: e.target.value })}>
      <option value="landscape">Landscape</option><option value="portrait">Portrait</option></select>
  </div>;
}

/** The print pages: each sheet's used area, zoomed to fill the page width (and fit its height). */
function PrintPages({ sheets, done }) {
  const ref = useRef();
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    ref.current.querySelectorAll('.pp-page').forEach((pg, i) => {
      const t = pg.querySelector('table'); t.style.zoom = 1;
      t.style.zoom = String(fitZoom(t.offsetWidth, t.offsetHeight, sheets[i].orient));
    });
    setReady(true);
  }, [sheets]);
  useEffect(() => {
    if (!ready) return;
    const after = () => done();
    window.addEventListener('afterprint', after, { once: true });
    const t = setTimeout(() => window.print(), 50);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', after); };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const orient = sheets[0].orient || 'landscape';
  return createPortal(<div className="pp" ref={ref}>
    <style>{`@page{size:letter ${orient};margin:0.4in}@page pp-landscape{size:letter landscape;margin:0.4in}@page pp-portrait{size:letter portrait;margin:0.4in}`}</style>
    {sheets.map((sh) => <div key={sh.id} className={`pp-page pp-${sh.orient || 'landscape'}`}><PrintTable sh={sh} /></div>)}
  </div>, document.body);
}

function PrintTable({ sh }) {
  const { nr, nc } = usedSize(sh);
  const hidden = hiddenCells(sh);
  const w = sh.widths.slice(0, nc);
  return <table className="pp-t" style={{ width: w.reduce((a, b) => a + b, 0) }}>
    <colgroup>{w.map((x, c) => <col key={c} style={{ width: x }} />)}</colgroup>
    <tbody>{sh.rows.slice(0, nr).map((row, r) => <tr key={r}>{row.slice(0, nc).map((x, c) => {
      if (hidden.has(r + ',' + c)) return null;
      const m = mergeAt(sh, r, c);
      return <td key={c} rowSpan={m ? Math.min(m.rs, nr - r) : undefined} colSpan={m ? Math.min(m.cs, nc - c) : undefined} className={x && x.nb ? 'nb' : ''} style={cellStyle(x)}>{(x && x.v) || ''}</td>;
    })}</tr>)}</tbody>
  </table>;
}
