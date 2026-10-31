// Data Center: tables uploaded from CSV / PDF files (testing results, team or league stats).
// TeamHub keeps each table exactly as uploaded and doesn't calculate anything from it.
// Admins and coaches upload and see every table; viewers only see tables marked "shared".
// Player names in a table are linked to the roster, so injury flags show beside them.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, todayISO } from '../lib/util.js';
import { anyHeading, tidyTable } from '../lib/imports.js';
import { fieldFor, nameKey } from '../lib/rosterImport.js';
import ImportSource from '../components/ImportSource.jsx';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';
import InjuryFlag from '../components/InjuryFlag.jsx';

const KINDS = { testing: 'Testing', stats: 'Stats', other: 'Other' };

export default function DataCenter() {
  const H = useHub(); const t = H.team;
  const [list, setList] = useState(null), [open, setOpen] = useState(null), [roster, setRoster] = useState([]);
  const load = () => H.api.listDatasets(t.id).then((l) => { setList(l); setOpen((o) => (o && l.some((d) => d.id === o) ? o : l[0] ? l[0].id : null)); })
    .catch((e) => { setList([]); H.toast('Could not load the Data Center: ' + e.message); });
  useEffect(() => { load(); H.api.listPlayers(t.id).then(setRoster).catch(() => {}); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (d, msg) => {
    let saved = null;
    try { saved = await H.api.saveDataset(t.id, d); if (msg) H.toast(msg); } catch (e) { H.toast('Could not save. ' + e.message); }
    await load(); if (saved && saved.id) setOpen(saved.id); // show the table just saved
  };
  const del = async (d) => { if (!(await H.confirm('Delete table?', `"${d.title}" is removed from the Data Center.`))) return; try { await H.api.deleteDataset(d.id); } catch (e) { H.toast(e.message); } load(); };
  const cur = list && list.find((d) => d.id === open);
  return <>
    <PageHead title="Data Center" actions={H.isCoach && <button className="btn primary" onClick={() => H.openDialog((c) => <Upload close={c} onSave={save} />)}><Icon n="plus" /> Upload: file or paste</button>} />
    {!list ? <div className="loading">Loading…</div> : !list.length ? <section className="card"><div className="empty-state"><b>No tables yet</b>
      <span className="muted small">{H.isCoach ? 'Upload a CSV or PDF table: testing results, team or league stats. Each upload is kept as its own table, and player names are linked to the roster.' : 'Nothing has been shared with you here yet.'}</span></div></section>
      : <div className="dc-grid">
        <section className="card dc-list">
          <div className="card-head"><h2>Tables</h2><span className="muted small">{list.length}</span></div>
          <ul>{list.map((d) => <li key={d.id} className={d.id === open ? 'on' : ''} onClick={() => setOpen(d.id)}>
            <b>{d.title}</b>
            <span className="muted small">{KINDS[d.kind]}{d.recorded_on ? ` · ${fmtDate(d.recorded_on)}` : ''} · {d.rows.length} rows{H.isCoach && d.shared ? ' · shared' : ''}</span>
          </li>)}</ul>
        </section>
        {cur && <section className="card dc-view">
          <div className="card-head"><div><h2>{cur.title}</h2><span className="muted small">{KINDS[cur.kind]}{cur.recorded_on ? ` · ${fmtDate(cur.recorded_on, true)}` : ''}{cur.source ? ` · from ${cur.source}` : ''}</span></div>
            {H.isCoach && <div className="acts">
              <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="Shared tables are visible to everyone in the organization, including viewers"><input type="checkbox" className="cb" checked={!!cur.shared} onChange={(e) => save({ ...cur, shared: e.target.checked }, e.target.checked ? 'Shared with the organization' : 'Now coaches and admins only')} /> Shared</label>
              <button className="btn sm" onClick={() => H.openDialog((c) => <Details d={cur} close={c} onSave={(x) => save(x, 'Saved')} />)}><Icon n="edit" /> Edit</button>
              <button className="btn sm danger" onClick={() => del(cur)}><Icon n="trash" /> Delete</button></div>}</div>
          <DataTable d={cur} roster={roster} />
        </section>}
      </div>}
  </>;
}

/** The uploaded table, sortable by any column; a name column links to the roster. */
function DataTable({ d, roster }) {
  const [sort, setSort] = useState(null); // {i, dir}
  useEffect(() => setSort(null), [d.id]);
  const nameCol = d.columns.findIndex((c) => fieldFor(c) === 'name');
  const byName = new Map(roster.map((p) => [nameKey(p.name), p]));
  const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; };
  let rows = d.rows;
  if (sort) rows = [...rows].sort((a, b) => { const x = num(a[sort.i]), y = num(b[sort.i]); const c = x !== null && y !== null ? x - y : String(a[sort.i] || '').localeCompare(String(b[sort.i] || '')); return sort.dir * c; });
  return <div className="tbl-wrap dc-tbl"><table className="tbl">
    <thead><tr>{d.columns.map((c, i) => <th key={i} className="click" onClick={() => setSort((s) => (s && s.i === i ? { i, dir: -s.dir } : { i, dir: 1 }))}>{c}{sort && sort.i === i ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
    <tbody>{rows.map((r, k) => <tr key={k}>{d.columns.map((_, i) => { const v = r[i] || ''; const p = i === nameCol && byName.get(nameKey(v));
      return <td key={i} className={num(v) !== null ? 'num tnum' : ''}>{v}{p && <> <InjuryFlag p={p} /></>}</td>; })}</tr>)}</tbody>
  </table></div>;
}

function Fields({ f, set }) {
  return <>
    <label className="field"><span>Title</span><input className="input" maxLength={120} value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} /></label>
    <div className="row3">
      <label className="field"><span>Type</span><select className="select" value={f.kind} onChange={(e) => set({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="field"><span>Date</span><input className="input" type="date" value={f.recorded_on || ''} onChange={(e) => set({ ...f, recorded_on: e.target.value })} /></label>
      <label className="field" style={{ justifyContent: 'flex-end' }}><span>Who sees it</span><label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 36 }}><input type="checkbox" className="cb" checked={!!f.shared} onChange={(e) => set({ ...f, shared: e.target.checked })} /> Share with viewers</label></label>
    </div>
    <span className="muted small">Unshared tables are visible to admins and coaches only. Keep athlete testing results unshared unless they're meant for players and parents.</span>
  </>;
}

function Details({ d, close, onSave }) {
  const H = useHub(); const [f, setF] = useState(d);
  return <Modal title="Edit table" onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { if (!f.title.trim()) { H.toast('Give it a title.'); return; } close(); onSave({ ...f, title: f.title.trim() }); }}>Save</button></>}>
    <Fields f={f} set={setF} />
  </Modal>;
}

function Upload({ close, onSave }) {
  const H = useHub();
  const [tbl, setTbl] = useState(null);
  const [f, setF] = useState({ title: '', kind: 'testing', recorded_on: todayISO(), shared: false });
  const take = (raw, label) => {
    const rows = tidyTable(raw);
    if (rows.length < 2) throw new Error('It needs a heading row and at least one row of data.');
    const file = label !== 'Pasted data';
    setTbl({ columns: rows[0].map((c, i) => c || `Column ${i + 1}`), rows: rows.slice(1), source: file ? label : '' });
    setF((x) => ({ ...x, title: x.title || (file ? label.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120) : '') }));
  };
  return <Modal title="Upload to the Data Center" wide onClose={close}
    actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!tbl} onClick={() => { if (!f.title.trim()) { H.toast('Give it a title.'); return; } close(); onSave({ ...f, title: f.title.trim(), ...tbl }, 'Uploaded'); }}>Save table</button></>}>
    <p className="muted small" style={{ margin: 0 }}>Any table: a CSV export, a PDF with selectable text whose first row is column headings, or cells pasted from a spreadsheet (include the heading row). It's read in your browser and kept as uploaded (up to 2,000 rows × 60 columns); TeamHub doesn't calculate anything from it.</p>
    <ImportSource onRows={take} isHeading={anyHeading} />
    {tbl && <>
      <Fields f={f} set={setF} />
      <div className="small"><b>{tbl.source || 'Pasted data'}</b>: {tbl.rows.length} rows, {tbl.columns.length} columns. First rows:</div>
      <div className="tbl-wrap" style={{ maxHeight: 260, overflow: 'auto' }}><table className="tbl">
        <thead><tr>{tbl.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>{tbl.rows.slice(0, 25).map((r, k) => <tr key={k}>{tbl.columns.map((_, i) => <td key={i}>{r[i] || ''}</td>)}</tr>)}</tbody>
      </table></div>
    </>}
  </Modal>;
}
