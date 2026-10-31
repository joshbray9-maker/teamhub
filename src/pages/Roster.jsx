// Roster: the team's players. Everyone in the organization sees it; coaches add, edit and
// import (CSV or PDF, reviewed before saving). Injury markers come from lib/injury.js.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { parseCsv, rowsToPlayers, pdfItemsToPlayers, tablesToPlayers, planImport } from '../lib/rosterImport.js';
import { pdfTextItems } from '../lib/pdfText.js';
import { resizePhoto } from '../lib/photo.js';
import { ROSTER_TEMPLATE } from '../lib/imports.js';
import ImportSource from '../components/ImportSource.jsx';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';
import InjuryFlag from '../components/InjuryFlag.jsx';
import Avatar from '../components/Avatar.jsx';
import { openPlayerReport } from './PlayerReport.jsx';
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
  const [sel, setSel] = useState(() => new Set()); // selected player ids (coaches)
  useEffect(() => setSel(new Set()), [t.id]);
  const load = () => H.api.listPlayers(t.id).then((ps) => { setPlayers(ps); H.api.photoUrls(ps.map((p) => p.photo)).then(setPhotos).catch(() => {}); })
    .catch((e) => { setPlayers([]); H.toast('Could not load roster: ' + e.message); });
  useEffect(() => { load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const hockey = t.sport === 'hockey';
  const save = async (list, msg) => { try { await H.api.savePlayers(t.id, list); if (msg) H.toast(msg); } catch (e) { H.toast('Could not save. ' + e.message); } load(); };
  const edit = (p) => H.isCoach && H.openDialog((c) => <PlayerDialog p={p} photoUrl={p && photos[p.photo]} sport={t.sport} close={c} onSave={(x) => save([x])}
    onDelete={async () => { try { await H.api.deletePlayer(p.id); } catch (e) { H.toast(e.message); } load(); }}
    onMove={async (to) => { try { await H.api.movePlayer(p.id, to.id); H.toast(`${p.name} moved to ${to.name}`); } catch (e) { H.toast('Could not move. ' + e.message); } load(); H.reloadTeam(); }} />);
  const openImport = (paste) => H.openDialog((c) => <ImportDialog current={players || []} paste={paste} close={c} onSave={(list, msg) => save(list, msg)} />);
  const acts = H.isCoach && <>
    <button className="btn" onClick={() => openImport(false)}><Icon n="refresh" /> Import: file, paste or web</button>
    <button className="btn" onClick={() => openImport(true)}><Icon n="users" /> Add several</button>
    <button className="btn primary" onClick={() => edit(null)}><Icon n="plus" /> Player</button></>;

  /* ---------- bulk actions on the selected players ---------- */
  const chosen = (players || []).filter((p) => sel.has(p.id));
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = async (msg) => { setSel(new Set()); if (msg) H.toast(msg); await load(); H.reloadTeam(); };
  const bulkDelete = async () => {
    if (!(await H.confirm(`Delete ${chosen.length} player${chosen.length === 1 ? '' : 's'}?`, `${chosen.map((p) => p.name).join(', ')} will be removed from the roster, with their injuries and test results. To keep their history, mark them as former players instead.`))) return;
    let n = 0; for (const p of chosen) { try { await H.api.deletePlayer(p.id); n++; } catch (e) { H.toast(`Could not delete ${p.name}. ${e.message}`); } }
    done(`${n} deleted`);
  };
  const bulkActive = async (active) => { try { await H.api.savePlayers(t.id, chosen.map((p) => ({ ...p, active }))); } catch (e) { H.toast('Could not save. ' + e.message); } done(active ? 'Back on the active roster' : 'Moved to former players'); };
  const bulkMove = async (to) => {
    if (!(await H.confirm(`Move ${chosen.length} player${chosen.length === 1 ? '' : 's'} to ${to.name}?`, `They move with their injuries and come out of ${t.name}'s lines. Their test results stay with ${t.name}.`, 'Move'))) return;
    let n = 0; for (const p of chosen) { try { await H.api.movePlayer(p.id, to.id); n++; } catch (e) { H.toast(`Could not move ${p.name}. ${e.message}`); } }
    done(`${n} moved to ${to.name}`);
  };
  const moveTargets = H.teamList.filter((x) => x.id !== t.id && ['admin', 'coach'].includes(H.roleOf(x)));

  const list = (players || []).filter((p) => p.active !== false).sort(byNumber);
  const gone = (players || []).filter((p) => p.active === false).sort(byNumber);
  const shown = [...list, ...(former ? gone : [])];
  const allOn = shown.length > 0 && shown.every((p) => sel.has(p.id));
  const Rows = ({ ps }) => ps.map((p) => <tr key={p.id} className={`${H.isCoach ? 'click' : ''} ${sel.has(p.id) ? 'sel' : ''}`} onClick={() => edit(p)}>
    {H.isCoach && <td className="ro-cb" onClick={(e) => { e.stopPropagation(); toggle(p.id); }}><input type="checkbox" className="cb" checked={sel.has(p.id)} onChange={() => {}} aria-label={`Select ${p.name}`} /></td>}
    <td className="num tnum">{p.num}</td>
    <td><span className="inj-who"><Avatar p={p} url={photos[p.photo]} size={26} /><span className="ro-name">{p.name}</span><InjuryFlag p={p} /></span></td>
    <td>{p.position}</td>{hockey && <td>{p.shoots}</td>}<td>{p.year}</td><td>{p.height}</td><td>{p.weight}</td><td>{p.hometown}</td>
    {H.isCoach && <td className="ro-prof"><button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); openPlayerReport(H, p, photos[p.photo]); }}>Profile</button></td>}
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
        {H.isCoach && chosen.length > 0 && <div className="ro-bulk">
          <b>{chosen.length} selected</b>
          {moveTargets.length > 0 && <select className="select" value="" onChange={(e) => { const to = moveTargets.find((x) => x.id === e.target.value); if (to) bulkMove(to); }} aria-label="Move selected players to">
            <option value="">Move to team…</option>{moveTargets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
          {chosen.some((p) => p.active !== false) && <button className="btn sm" onClick={() => bulkActive(false)}>Mark as former</button>}
          {chosen.some((p) => p.active === false) && <button className="btn sm" onClick={() => bulkActive(true)}>Mark as active</button>}
          <button className="btn sm danger" onClick={bulkDelete}><Icon n="trash" /> Delete</button>
          <button className="btn sm ghost" onClick={() => setSel(new Set())}>Clear selection</button>
        </div>}
        <div className="tbl-wrap"><table className="tbl ro-tbl">
          <thead><tr>{H.isCoach && <th className="ro-cb"><input type="checkbox" className="cb" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((p) => p.id)))} aria-label="Select all players" /></th>}<th className="num">#</th><th>Name</th><th>Pos</th>{hockey && <th>Shoots</th>}<th>Year</th><th>Ht</th><th>Wt</th><th>Hometown</th>{H.isCoach && <th />}</tr></thead>
          <tbody><Rows ps={list} />{former && gone.length > 0 && <><tr className="ro-sep"><td colSpan={(hockey ? 8 : 7) + (H.isCoach ? 2 : 0)}>Former players</td></tr><Rows ps={gone} /></>}</tbody>
        </table></div>
      </>}
    </section>
  </>;
}

function PlayerDialog({ p, photoUrl, sport, close, onSave, onDelete, onMove }) {
  const H = useHub();
  // teams this coach can move the player to: ones they can edit, other than this one
  const targets = H.teamList.filter((x) => x.id !== H.teamId && ['admin', 'coach'].includes(H.roleOf(x)));
  const [moveTo, setMoveTo] = useState('');
  const move = async () => {
    const to = targets.find((x) => x.id === moveTo); if (!to) return;
    close();
    if (await H.confirm(`Move ${p.name}?`, `${p.name} moves to ${to.name} with their injuries, and comes out of ${H.team.name}'s lines. Their test results stay with ${H.team.name}.`, 'Move')) onMove(to);
  };
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
      {p && targets.length > 0 && <div className="field ro-wide ro-move"><span>Move to another team</span>
        <div className="todo-add"><select className="select" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Team to move to">
          <option value="">Choose a team…</option>{targets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <button type="button" className="btn" disabled={!moveTo} onClick={move}>Move</button></div></div>}
      <button type="submit" hidden />
    </form>
  </Modal>;
}

async function readPdf(file) { return pdfItemsToPlayers(await pdfTextItems(file)); }

function ImportDialog({ current, paste, close, onSave }) {
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
  const take = (r, label) => {
    if (!r.players.length) throw new Error('No players found. Check that there is a Name column (or First / Last name).');
    setRes({ ...r, file: label, plan: planImport(current, r.players) });
  };
  const onFile = async (file) => {
    const pdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    const r = pdf ? await readPdf(file) : rowsToPlayers(parseCsv(await file.text()));
    if (pdf && !r.players.length) throw new Error('No players found. The PDF needs selectable text (not a scanned image) with a number and a name on each line, or column headings like No., Name, Pos.');
    take(r, file.name);
  };
  const go = () => {
    const { adds, updates, missing } = res.plan;
    const list = [...updates, ...adds, ...(retire ? missing.map((p) => ({ ...p, active: false })) : [])];
    close(); onSave(list, `Roster updated: ${adds.length} added, ${updates.length} updated${retire && missing.length ? `, ${missing.length} moved to former players` : ''}`);
  };
  const p = res && res.plan;
  return <Modal title={paste ? 'Add players' : 'Import roster'} wide onClose={close}
    actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!p || (!p.adds.length && !p.updates.length && !(retire && p.missing.length))} onClick={go}>Import</button></>}>
    <p className="muted small" style={{ margin: 0 }}>Only the roster columns are kept (number, name, position, shoots, year, height, weight, hometown); anything else is dropped and a date of birth is reduced to its year. Players already on the roster are matched by name and updated. Nothing is saved until you press Import.</p>
    <div className="ro-src">
      <div className="field"><span>From a website</span>
        <form className="todo-add" onSubmit={(e) => { e.preventDefault(); readPage(); }}>
          <input className="input" type="url" placeholder="https://gaiters.ca/sports/mens-rugby/roster" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Roster page address" />
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Reading…' : 'Read page'}</button>
        </form>
        <span className="muted small">A team or league page that lists the roster in a table (school athletics sites like gaiters.ca). EliteProspects and CSSHL pages can't be read this way: save them as a PDF and use the file option.</span></div>
      <div className="field"><span>From a file or spreadsheet</span>
        <ImportSource mode0={paste ? 'paste' : 'file'} onFile={onFile} onRows={(rows, label) => take(rowsToPlayers(rows, 'csv'), label)} template={ROSTER_TEMPLATE} templateName="roster-template.csv"
          fileHint="CSV with headings like Number, Name, Position, Shoots, Year, Height, Weight, Hometown, or a PDF with selectable text (not a scan). Read in your browser." /></div>
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
