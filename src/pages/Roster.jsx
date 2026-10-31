// Roster: the team's players. Everyone in the organization sees it; coaches add, edit and
// import (CSV or PDF, reviewed before saving). Injury markers come from lib/injury.js.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { parseCsv, rowsToPlayers, pdfItemsToPlayers, planImport } from '../lib/rosterImport.js';
import { injuryStatus } from '../lib/injury.js';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';

export const POSITIONS = {
  hockey: ['C', 'LW', 'RW', 'F', 'D', 'G'],
  basketball: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'],
  rugby: ['Prop', 'Hooker', 'Lock', 'Flanker', 'No. 8', 'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback'],
  soccer: ['GK', 'DF', 'MF', 'FW'],
  football: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K'],
};
export const byNumber = (a, b) => (a.num === '' ? 999 : +a.num) - (b.num === '' ? 999 : +b.num) || a.name.localeCompare(b.name);

export function InjuryMark({ p }) {
  const s = injuryStatus(p);
  return s ? <span className={`inj ${s.level}`} title={s.label}>{s.level === 'out' ? '+' : '!'}</span> : null;
}

export default function Roster() {
  const H = useHub(); const t = H.team;
  const [players, setPlayers] = useState(null);
  const [former, setFormer] = useState(false);
  const load = () => H.api.listPlayers(t.id).then(setPlayers).catch((e) => { setPlayers([]); H.toast('Could not load roster: ' + e.message); });
  useEffect(() => { load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const hockey = t.sport === 'hockey';
  const save = async (list, msg) => { try { await H.api.savePlayers(t.id, list); if (msg) H.toast(msg); } catch (e) { H.toast('Could not save. ' + e.message); } load(); };
  const edit = (p) => H.isCoach && H.openDialog((c) => <PlayerDialog p={p} sport={t.sport} close={c} onSave={(x) => save([x])}
    onDelete={async () => { try { await H.api.deletePlayer(p.id); } catch (e) { H.toast(e.message); } load(); }} />);
  const acts = H.isCoach && <>
    <button className="btn" onClick={() => H.openDialog((c) => <ImportDialog current={players || []} close={c} onSave={(list, msg) => save(list, msg)} />)}><Icon n="refresh" /> Import CSV / PDF</button>
    <button className="btn primary" onClick={() => edit(null)}><Icon n="plus" /> Player</button></>;

  const list = (players || []).filter((p) => p.active !== false).sort(byNumber);
  const gone = (players || []).filter((p) => p.active === false).sort(byNumber);
  const Rows = ({ ps }) => ps.map((p) => <tr key={p.id} className={H.isCoach ? 'click' : ''} onClick={() => edit(p)}>
    <td className="num tnum">{p.num}</td>
    <td><span className="ro-name">{p.name}</span>{H.isCoach && <InjuryMark p={p} />}</td>
    <td>{p.position}</td>{hockey && <td>{p.shoots}</td>}<td>{p.year}</td><td>{p.height}</td><td>{p.weight}</td><td>{p.hometown}</td>
  </tr>);
  return <>
    <PageHead title="Roster" actions={acts} />
    <section className="card">
      {!players ? <div className="muted small">Loading…</div> : !players.length ? <div className="empty-state">
        <b>No players yet</b>
        <span className="muted small">{H.isCoach ? 'Add players one by one, or import a CSV or PDF roster (a team sheet, a league roster saved as PDF, a spreadsheet export).' : 'Your coach will add the roster.'}</span>
      </div> : <>
        <div className="card-head"><h2>{list.length} player{list.length === 1 ? '' : 's'}</h2>
          {gone.length > 0 && <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" className="cb" checked={former} onChange={(e) => setFormer(e.target.checked)} /> Show former players ({gone.length})</label>}</div>
        <div className="tbl-wrap"><table className="tbl ro-tbl">
          <thead><tr><th className="num">#</th><th>Name</th><th>Pos</th>{hockey && <th>Shoots</th>}<th>Year</th><th>Ht</th><th>Wt</th><th>Hometown</th></tr></thead>
          <tbody><Rows ps={list} />{former && gone.length > 0 && <><tr className="ro-sep"><td colSpan={hockey ? 8 : 7}>Former players</td></tr><Rows ps={gone} /></>}</tbody>
        </table></div>
      </>}
    </section>
  </>;
}

function PlayerDialog({ p, sport, close, onSave, onDelete }) {
  const H = useHub();
  const [f, setF] = useState({ num: '', name: '', position: '', shoots: '', year: '', height: '', weight: '', hometown: '', active: true, ...(p || {}) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = () => {
    if (!f.name.trim()) { H.toast('Enter a name.'); return; }
    if (f.num && !/^\d{1,3}$/.test(f.num.trim())) { H.toast('The number should be 1 to 3 digits.'); return; }
    close(); onSave({ ...f, name: f.name.trim(), num: f.num.trim() });
  };
  const del = async () => { close(); if (await H.confirm('Delete player?', `${p.name} is removed from the roster. Lines that list them keep the name they were saved with.`)) onDelete(); };
  return <Modal title={p ? 'Edit player' : 'Add player'} onClose={close}
    actions={<>{p && <><button className="btn danger" onClick={del}><Icon n="trash" /> Delete</button><span className="spacer" /></>}<button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></>}>
    <form className="ro-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className="field"><span>Number</span><input className="input tnum" inputMode="numeric" maxLength={3} value={f.num} onChange={set('num')} /></label>
      <label className="field"><span>Name</span><input className="input" maxLength={80} value={f.name} onChange={set('name')} /></label>
      <label className="field"><span>Position</span><input className="input" list="ro-pos" maxLength={30} value={f.position} onChange={set('position')} />
        <datalist id="ro-pos">{(POSITIONS[sport] || []).map((x) => <option key={x} value={x} />)}</datalist></label>
      {sport === 'hockey' && <label className="field"><span>Shoots / catches</span><select className="select" value={f.shoots} onChange={set('shoots')}><option value="">—</option><option value="L">Left</option><option value="R">Right</option></select></label>}
      <label className="field"><span>Year</span><input className="input" maxLength={20} value={f.year} onChange={set('year')} placeholder="2008 or Gr. 11" /></label>
      <label className="field"><span>Height</span><input className="input" maxLength={12} value={f.height} onChange={set('height')} placeholder={`5'11"`} /></label>
      <label className="field"><span>Weight</span><input className="input" maxLength={12} value={f.weight} onChange={set('weight')} placeholder="175" /></label>
      <label className="field ro-wide"><span>Hometown</span><input className="input" maxLength={80} value={f.hometown} onChange={set('hometown')} /></label>
      {p && <label className="ro-wide" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" className="cb" checked={f.active === false} onChange={(e) => setF({ ...f, active: !e.target.checked })} /> No longer on the team (keeps them under former players)</label>}
      <button type="submit" hidden />
    </form>
  </Modal>;
}

async function readPdf(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const items = []; let offset = 0;
  for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
    const page = await doc.getPage(n); const h = page.getViewport({ scale: 1 }).height;
    for (const it of (await page.getTextContent()).items) if (it.str) items.push({ str: it.str, x: it.transform[4], y: offset + (h - it.transform[5]) });
    offset += h + 50;
  }
  return pdfItemsToPlayers(items);
}

function ImportDialog({ current, close, onSave }) {
  const H = useHub();
  const [res, setRes] = useState(null); // { players, skipped, plan, file }
  const [retire, setRetire] = useState(false);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true); setRes(null);
    try {
      const r = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? await readPdf(file) : rowsToPlayers(parseCsv(await file.text()));
      if (!r.players.length) throw new Error(/\.pdf$/i.test(file.name) ? 'No players found. The PDF needs selectable text (not a scanned image) with a number and a name on each line, or column headings like No., Name, Pos.' : 'No players found in the file.');
      setRes({ ...r, file: file.name, plan: planImport(current, r.players) });
    } catch (err) { H.toast(err.message); }
    finally { setBusy(false); e.target.value = ''; }
  };
  const go = () => {
    const { adds, updates, missing } = res.plan;
    const list = [...updates, ...adds, ...(retire ? missing.map((p) => ({ ...p, active: false })) : [])];
    close(); onSave(list, `Roster updated: ${adds.length} added, ${updates.length} updated${retire && missing.length ? `, ${missing.length} moved to former players` : ''}`);
  };
  const p = res && res.plan;
  return <Modal title="Import roster" wide onClose={close}
    actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!p || (!p.adds.length && !p.updates.length && !(retire && p.missing.length))} onClick={go}>Import</button></>}>
    <p className="muted small" style={{ margin: 0 }}>Choose a <b>CSV</b> (first row: headings like Number, Name, Position, Shoots, Year, Height, Weight, Hometown) or a <b>PDF</b> roster with selectable text. The file is read in your browser; only the columns above are kept, and a date of birth is reduced to its year. Players already on the roster are matched by name and updated.</p>
    <label className="btn" style={{ alignSelf: 'flex-start' }}><Icon n="plus" /> {busy ? 'Reading…' : res ? 'Choose another file' : 'Choose file'}<input type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" hidden onChange={pick} /></label>
    {p && <>
      <div className="small"><b>{res.file}</b>: {p.adds.length} new, {p.updates.length} updated{res.skipped ? `, ${res.skipped} line${res.skipped === 1 ? '' : 's'} skipped (no name)` : ''}. Check the list before importing.</div>
      <div className="tbl-wrap" style={{ maxHeight: 320, overflow: 'auto' }}><table className="tbl ro-tbl">
        <thead><tr><th /><th className="num">#</th><th>Name</th><th>Pos</th><th>Shoots</th><th>Year</th><th>Ht</th><th>Wt</th><th>Hometown</th></tr></thead>
        <tbody>{[...p.adds.map((x) => ['New', x]), ...p.updates.map((x) => ['Update', x])].map(([k, x], i) => <tr key={i}>
          <td><span className={`pill ${k === 'New' ? 'new' : ''}`}>{k}</span></td><td className="num tnum">{x.num}</td><td>{x.name}</td><td>{x.position}</td><td>{x.shoots}</td><td>{x.year}</td><td>{x.height}</td><td>{x.weight}</td><td>{x.hometown}</td></tr>)}</tbody>
      </table></div>
      {p.missing.length > 0 && <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" className="cb" checked={retire} onChange={(e) => setRetire(e.target.checked)} /> Move the {p.missing.length} player{p.missing.length === 1 ? '' : 's'} not in this file to former players</label>}
    </>}
  </Modal>;
}
