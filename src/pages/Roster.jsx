// Roster: the team's players. Everyone in the organization sees it; coaches add, edit and
// import (CSV or PDF, reviewed before saving). Injury markers come from lib/injury.js.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { parseCsv, rowsToPlayers, pdfItemsToPlayers, tablesToPlayers, planImport } from '../lib/rosterImport.js';
import { pdfTextItems } from '../lib/pdfText.js';
import { resizePhoto } from '../lib/photo.js';
import { downloadCsv } from '../lib/imports.js';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';
import InjuryFlag from '../components/InjuryFlag.jsx';
import Avatar from '../components/Avatar.jsx';
export { default as InjuryMark } from '../components/InjuryFlag.jsx';

export const POSITIONS = {
  hockey: ['C', 'LW', 'RW', 'F', 'D', 'G'],
  basketball: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'],
  rugby: ['Prop', 'Hooker', 'Lock', 'Flanker', 'No. 8', 'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback'],
  soccer: ['GK', 'DF', 'MF', 'FW'],
  football: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K'],
};
export const byNumber = (a, b) => (a.num === '' ? 999 : +a.num) - (b.num === '' ? 999 : +b.num) || a.name.localeCompare(b.name);

export default function Roster() {
  const H = useHub(); const t = H.team;
  const [players, setPlayers] = useState(null);
  const [former, setFormer] = useState(false);
  const [photos, setPhotos] = useState({});
  const load = () => H.api.listPlayers(t.id).then((ps) => { setPlayers(ps); H.api.photoUrls(ps.map((p) => p.photo)).then(setPhotos).catch(() => {}); })
    .catch((e) => { setPlayers([]); H.toast('Could not load roster: ' + e.message); });
  useEffect(() => { load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const hockey = t.sport === 'hockey';
  const save = async (list, msg) => { try { await H.api.savePlayers(t.id, list); if (msg) H.toast(msg); } catch (e) { H.toast('Could not save. ' + e.message); } load(); };
  const edit = (p) => H.isCoach && H.openDialog((c) => <PlayerDialog p={p} photoUrl={p && photos[p.photo]} sport={t.sport} close={c} onSave={(x) => save([x])}
    onDelete={async () => { try { await H.api.deletePlayer(p.id); } catch (e) { H.toast(e.message); } load(); }} />);
  const acts = H.isCoach && <>
    <button className="btn" onClick={() => H.openDialog((c) => <ImportDialog current={players || []} close={c} onSave={(list, msg) => save(list, msg)} />)}><Icon n="refresh" /> Import CSV / PDF / web</button>
    <button className="btn primary" onClick={() => edit(null)}><Icon n="plus" /> Player</button></>;

  const list = (players || []).filter((p) => p.active !== false).sort(byNumber);
  const gone = (players || []).filter((p) => p.active === false).sort(byNumber);
  const Rows = ({ ps }) => ps.map((p) => <tr key={p.id} className={H.isCoach ? 'click' : ''} onClick={() => edit(p)}>
    <td className="num tnum">{p.num}</td>
    <td><span className="inj-who"><Avatar p={p} url={photos[p.photo]} size={26} /><span className="ro-name">{p.name}</span><InjuryFlag p={p} /></span></td>
    <td>{p.position}</td>{hockey && <td>{p.shoots}</td>}<td>{p.year}</td><td>{p.height}</td><td>{p.weight}</td><td>{p.hometown}</td>
  </tr>);
  return <>
    <PageHead title="Roster" actions={acts} />
    <section className="card">
      {!players ? <div className="muted small">Loading…</div> : !players.length ? <div className="empty-state">
        <b>No players yet</b>
        <span className="muted small">{H.isCoach ? 'Add players one by one, or Import them from a team or school roster page, a CSV or a PDF.' : 'Your coach will add the roster.'}</span>
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

function PlayerDialog({ p, photoUrl, sport, close, onSave, onDelete }) {
  const H = useHub();
  const [pic, setPic] = useState(photoUrl || null), [upl, setUpl] = useState(false);
  const pickPhoto = async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    setUpl(true);
    try { const blob = await resizePhoto(file); const path = await H.api.uploadPlayerPhoto(H.teamId, blob); setF((x) => ({ ...x, photo: path })); setPic(URL.createObjectURL(blob)); }
    catch (err) { H.toast('Could not upload the photo. ' + err.message); }
    finally { setUpl(false); }
  };
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
      <div className="ro-wide ro-photo"><Avatar p={f} url={pic} size={64} />
        <label className="btn sm"><Icon n="plus" /> {upl ? 'Uploading…' : pic ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" hidden onChange={pickPhoto} /></label>
        {pic && <button type="button" className="btn sm ghost" onClick={() => { setPic(null); setF({ ...f, photo: null }); }}>Remove</button>}</div>
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

async function readPdf(file) { return pdfItemsToPlayers(await pdfTextItems(file)); }

function ImportDialog({ current, close, onSave }) {
  const H = useHub();
  const [res, setRes] = useState(null); // { players, skipped, plan, file }
  const [retire, setRetire] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  useEffect(() => { H.api.getSetting(H.teamId, 'roster_url').then((v) => { if (typeof v === 'string') setUrl(v); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const readPage = async () => {
    const u = url.trim(); if (!/^https:\/\/\S+\.\S+/.test(u)) { H.toast('Enter the roster page address, starting with https://'); return; }
    setBusy(true); setRes(null);
    try {
      const { tables, host } = await H.api.fetchRosterPage(H.teamId, u);
      const r = tablesToPlayers(tables);
      setRes({ ...r, file: host, plan: planImport(current, r.players) });
      H.api.saveSetting(H.teamId, 'roster_url', u).catch(() => {}); // remembered for next time
    } catch (err) { H.toast(err.message); }
    finally { setBusy(false); }
  };
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
    <p className="muted small" style={{ margin: 0 }}>Only the roster columns are kept (number, name, position, shoots, year, height, weight, hometown); anything else is dropped and a date of birth is reduced to its year. Players already on the roster are matched by name and updated. Nothing is saved until you press Import.</p>
    <div className="ro-src">
      <div className="field"><span>From a website</span>
        <form className="todo-add" onSubmit={(e) => { e.preventDefault(); readPage(); }}>
          <input className="input" type="url" placeholder="https://gaiters.ca/sports/mens-rugby/roster" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Roster page address" />
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Reading…' : 'Read page'}</button>
        </form>
        <span className="muted small">A team or league page that lists the roster in a table (school athletics sites like gaiters.ca). EliteProspects and CSSHL pages can't be read this way: save them as a PDF and use the file option.</span></div>
      <div className="field"><span>From a file</span>
        <label className="btn" style={{ alignSelf: 'flex-start' }}><Icon n="plus" /> {busy ? 'Reading…' : 'Choose CSV or PDF'}<input type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" hidden onChange={pick} /></label>
        <span className="muted small">CSV with headings like Number, Name, Position, Shoots, Year, Height, Weight, Hometown, or a PDF with selectable text (not a scan). Read in your browser.</span>
        <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => downloadCsv('roster-template.csv', [['Number', 'Name', 'Position', 'Shoots', 'Year', 'Height', 'Weight', 'Hometown']])}>Download blank template</button></div>
    </div>
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
