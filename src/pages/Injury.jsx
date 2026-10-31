// Injury report (admins + coaches only; RLS enforces it). Two views:
//   Team       : every rostered player with a red / yellow / green status and the countdown
//                to return to practice and play. Click a player for their profile.
//   Sports med : enter, edit and clear injuries, or import a CSV / PDF injury sheet.
// The profile shows roster details, a body diagram heat-mapping active injuries, limitations
// and the return timeline. Statuses never change by themselves (see lib/injury.js).
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, todayISO } from '../lib/util.js';
import { STATUS, GO, REGIONS, isActive, currentInjury, nextStep, inDays, daysFrom, rowsToInjuries, injuryField } from '../lib/injury.js';
import { parseCsv, pdfItemsToTable } from '../lib/rosterImport.js';
import { downloadCsv } from '../lib/imports.js';
import { pdfTextItems } from '../lib/pdfText.js';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';
import Anatomy from '../components/Anatomy.jsx';
import Avatar from '../components/Avatar.jsx';
import InjuryFlag from '../components/InjuryFlag.jsx';
import { byNumber } from './Roster.jsx';

const SIDE = { L: 'left', R: 'right', both: 'both sides' };
export const where = (i) => (i.body_area && REGIONS[i.body_area] ? REGIONS[i.body_area].label + (i.side && REGIONS[i.body_area].pair ? ` (${SIDE[i.side]})` : '') : '');
const statusOf = (i) => (i ? STATUS[i.status] : GO);
export const StatusPill = ({ i, long }) => { const s = statusOf(i); return <span className={`st-pill ${s.color}`}><i />{long ? s.long : s.label}</span>; };
const dateOr = (d) => (d ? fmtDate(d) : '—');
function Next({ i, today }) {
  const n = nextStep(i, today); if (!n) return <span className="muted">—</span>;
  if (n.days === null) return <span className="muted">No return date</span>;
  return <span className={n.overdue ? 'inj-overdue' : ''}>{n.what} {inDays(n.days)}{n.overdue ? ' · update status' : ''}</span>;
}

/** Loads the active roster (+ photo links) for staff pages. */
export function useRoster() {
  const H = useHub();
  const [roster, setRoster] = useState(null), [photos, setPhotos] = useState({});
  const load = async () => {
    try {
      const r = (await H.api.listPlayers(H.teamId)).filter((p) => p.active !== false).sort(byNumber);
      setRoster(r); setPhotos(await H.api.photoUrls(r.map((p) => p.photo)).catch(() => ({})));
    } catch (e) { setRoster([]); H.toast('Could not load roster: ' + e.message); }
  };
  useEffect(() => { load(); }, [H.teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { roster, photos, reload: load };
}

export default function Injury() {
  const H = useHub();
  const [tab, setTab] = useState('team');
  const { roster, photos } = useRoster();
  const injuries = H.tdata.injuries || [];
  const today = todayISO();
  if (!H.isCoach) return <><PageHead title="Injury report" /><section className="card"><p className="muted" style={{ margin: 0 }}>The injury report is only visible to coaches and admins.</p></section></>;

  const save = async (list, msg) => { try { await H.api.saveInjuries(H.teamId, list); if (msg) H.toast(msg); } catch (e) { H.toast('Could not save. ' + e.message); } H.reloadTeam(); };
  const remove = async (i) => { try { await H.api.deleteInjury(i.id); } catch (e) { H.toast(e.message); } H.reloadTeam(); };
  const edit = (i, player) => H.openDialog((c) => <InjuryForm i={i} player={player} roster={roster || []} close={c} onSave={(x) => save([x], 'Saved')} onDelete={() => remove(i)} />);
  const profile = (p) => H.openDialog((c) => <Profile p={p} photo={photos[p.photo]} close={c} onEdit={(i) => { c(); edit(i, p); }} onAdd={() => { c(); edit(null, p); }} />);

  const rows = (roster || []).map((p) => ({ p, i: currentInjury(p.id, injuries) })).sort((a, b) => statusOf(b.i).rank - statusOf(a.i).rank || byNumber(a.p, b.p));
  const n = { out: rows.filter((r) => r.i && r.i.status === 'out').length, limited: rows.filter((r) => r.i && r.i.status === 'limited').length };
  const acts = <><button className="btn" disabled={!roster || !roster.length} onClick={() => H.openDialog((c) => <ImportInjuries roster={roster} close={c} onSave={save} />)}><Icon n="refresh" /> Import CSV / PDF</button><div className="seg" role="tablist">{[['team', 'Team'], ['med', 'Sports med']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div></>;

  return <>
    <PageHead title="Injury report" actions={acts} />
    {!roster ? <div className="loading">Loading…</div> : !roster.length ? <section className="card"><p className="muted" style={{ margin: 0 }}>Add players in the <a href="#" onClick={(e) => { e.preventDefault(); H.go('roster'); }}>Roster</a> tab first; injuries are recorded against roster players.</p></section>
      : tab === 'team' ? <>
        <section className="strip inj-strip">
          <div className="tile inj-t red"><div className="tile-k">Out</div><div className="tile-v tnum">{n.out}</div><div className="tile-s">Not practising or playing</div></div>
          <div className="tile inj-t yellow"><div className="tile-k">Limited</div><div className="tile-v tnum">{n.limited}</div><div className="tile-s">Hurt, can practise and play</div></div>
          <div className="tile inj-t green"><div className="tile-k">Available</div><div className="tile-v tnum">{rows.length - n.out - n.limited}</div><div className="tile-s">of {rows.length} on the roster</div></div>
        </section>
        <section className="card">
          <div className="tbl-wrap"><table className="tbl inj-tbl">
            <thead><tr><th>Status</th><th>Player</th><th>Injury</th><th>Next</th><th>Practice</th><th>Play</th></tr></thead>
            <tbody>{rows.map(({ p, i }) => <tr key={p.id} className="click" onClick={() => profile(p)}>
              <td><StatusPill i={i} /></td>
              <td><span className="inj-who"><Avatar p={p} url={photos[p.photo]} size={28} /><span><span className="inj-nm"><b>{p.num ? `#${p.num} ` : ''}{p.name}</b><InjuryFlag p={p} /></span><span className="muted small">{p.position}</span></span></span></td>
              <td>{i ? <>{i.injury || where(i) || '—'}{i.injury && where(i) && <span className="muted small"> · {where(i)}</span>}</> : <span className="muted">—</span>}</td>
              <td><Next i={i} today={today} /></td>
              <td className="tnum">{i ? dateOr(i.return_practice) : ''}</td><td className="tnum">{i ? dateOr(i.return_play) : ''}</td>
            </tr>)}</tbody>
          </table></div>
        </section>
      </> : <MedView roster={roster} injuries={injuries} today={today} edit={edit} save={save} />}
  </>;
}

function MedView({ roster, injuries, today, edit, save }) {
  const H = useHub();
  const [hist, setHist] = useState(false);
  const byId = Object.fromEntries(roster.map((p) => [p.id, p]));
  const active = injuries.filter(isActive), done = injuries.filter((i) => !isActive(i));
  const clear = (i) => save([{ ...i, status: 'cleared', cleared_on: today }], `${byId[i.player_id] ? byId[i.player_id].name : 'Player'} cleared`);
  const list = (l) => <div className="tbl-wrap"><table className="tbl inj-tbl">
    <thead><tr><th>Status</th><th>Player</th><th>Injury</th><th>Injured</th><th>Practice</th><th>Play</th><th /></tr></thead>
    <tbody>{l.map((i) => { const p = byId[i.player_id]; return <tr key={i.id} className="click" onClick={() => edit(i, p)}>
      <td><StatusPill i={i} /></td><td><b>{p ? `${p.num ? '#' + p.num + ' ' : ''}${p.name}` : 'Removed player'}</b></td>
      <td>{i.injury || '—'}{where(i) && <span className="muted small"> · {where(i)}</span>}</td>
      <td className="tnum">{dateOr(i.injured_on)}</td><td className="tnum">{dateOr(i.return_practice)}</td><td className="tnum">{i.status === 'cleared' ? `Cleared ${dateOr(i.cleared_on)}` : dateOr(i.return_play)}</td>
      <td>{isActive(i) && <button className="btn sm" onClick={(e) => { e.stopPropagation(); clear(i); }}>Clear</button>}</td>
    </tr>; })}</tbody></table></div>;
  return <section className="card">
    <div className="card-head"><h2>Injuries</h2><div className="acts">
      <button className="btn" onClick={() => H.openDialog((c) => <ImportInjuries roster={roster} close={c} onSave={save} />)}><Icon n="refresh" /> Import CSV / PDF</button>
      <button className="btn primary" onClick={() => edit(null, null)}><Icon n="plus" /> Injury</button></div></div>
    {active.length ? list(active) : <p className="muted small" style={{ margin: 0 }}>No active injuries. Everyone is green.</p>}
    {done.length > 0 && <><button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setHist(!hist)}>{hist ? 'Hide' : 'Show'} cleared injuries ({done.length})</button>{hist && list(done)}</>}
  </section>;
}

function InjuryForm({ i, player, roster, close, onSave, onDelete }) {
  const H = useHub();
  const [f, setF] = useState({ player_id: player ? player.id : '', status: 'out', injury: '', body_area: '', side: '', details: '', limitations: '', injured_on: todayISO(), return_practice: '', return_play: '', cleared_on: '', ...(i || {}) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    if (!f.player_id) { H.toast('Choose the player.'); return; }
    if (!f.injury.trim() && !f.body_area) { H.toast('Describe the injury or pick the body area.'); return; }
    if (f.return_practice && f.return_play && f.return_play < f.return_practice) { H.toast('Return to play is before return to practice.'); return; }
    close(); onSave({ ...f, injury: f.injury.trim(), cleared_on: f.status === 'cleared' ? f.cleared_on || todayISO() : null });
  };
  const del = async () => { close(); if (await H.confirm('Delete injury?', 'It is removed from the report and the player\'s history.')) onDelete(); };
  const pair = f.body_area && REGIONS[f.body_area] && REGIONS[f.body_area].pair;
  return <Modal title={i ? 'Edit injury' : 'Add injury'} wide onClose={close}
    actions={<>{i && <><button className="btn danger" onClick={del}><Icon n="trash" /> Delete</button><span className="spacer" /></>}<button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></>}>
    <div className="inj-form">
      <div className="inj-form-l">
        <label className="field"><span>Player</span><select className="select" value={f.player_id} onChange={set('player_id')} disabled={!!i}>
          <option value="">Choose…</option>{roster.map((p) => <option key={p.id} value={p.id}>{p.num ? `#${p.num} ` : ''}{p.name}</option>)}</select></label>
        <div className="field"><span>Status</span><div className="st-pick">{Object.entries(STATUS).map(([k, s]) => <button type="button" key={k} className={`st-pill ${s.color} ${f.status === k ? 'on' : ''}`} onClick={() => setF({ ...f, status: k })}><i />{k === 'cleared' ? 'Cleared (green)' : s.label}</button>)}</div>
          <span className="muted small">{STATUS[f.status].long}</span></div>
        <label className="field"><span>Injury</span><input className="input" maxLength={80} value={f.injury} onChange={set('injury')} placeholder="e.g. Ankle sprain" /></label>
        <div className="row2">
          <label className="field"><span>Body area</span><select className="select" value={f.body_area} onChange={(e) => setF({ ...f, body_area: e.target.value, side: REGIONS[e.target.value] && REGIONS[e.target.value].pair ? f.side : '' })}>
            <option value="">—</option>{Object.entries(REGIONS).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></label>
          <label className="field"><span>Side</span><select className="select" value={f.side} onChange={set('side')} disabled={!pair}><option value="">—</option><option value="L">Left</option><option value="R">Right</option><option value="both">Both</option></select></label>
        </div>
        <div className="row3">
          <label className="field"><span>Injured on</span><input className="input" type="date" value={f.injured_on || ''} onChange={set('injured_on')} /></label>
          <label className="field"><span>Return to practice</span><input className="input" type="date" value={f.return_practice || ''} onChange={set('return_practice')} /></label>
          <label className="field"><span>Return to play</span><input className="input" type="date" value={f.return_play || ''} onChange={set('return_play')} /></label>
        </div>
        <label className="field"><span>Limitations</span><textarea className="input" maxLength={2000} value={f.limitations} onChange={set('limitations')} placeholder="e.g. No contact, upper body lifts only" /></label>
        <label className="field"><span>Details</span><textarea className="input" maxLength={2000} value={f.details} onChange={set('details')} /></label>
      </div>
      <div className="inj-form-r"><span className="muted small">Click the body to set the area</span>
        <Anatomy injuries={f.body_area ? [{ ...f, status: f.status === 'cleared' ? 'limited' : f.status }] : []} picked={{ area: f.body_area, side: f.side }}
          onPick={(area, side) => setF({ ...f, body_area: area, side: REGIONS[area].pair ? side : '' })} /></div>
    </div>
  </Modal>;
}

function Profile({ p, photo, close, onEdit, onAdd }) {
  const H = useHub(); const today = todayISO();
  const mine = (H.tdata.injuries || []).filter((i) => i.player_id === p.id);
  const active = mine.filter(isActive), past = mine.filter((i) => !isActive(i));
  const cur = currentInjury(p.id, mine);
  return <Modal title="Player profile" wide onClose={close} actions={<><button className="btn" onClick={onAdd}><Icon n="plus" /> Injury</button><span className="spacer" /><button className="btn primary" onClick={close}>Done</button></>}>
    <div className="prof-head">
      <Avatar p={p} url={photo} size={76} />
      <div><h3 className="prof-name">{p.num && <span className="tnum">#{p.num} </span>}{p.name}</h3>
        <div className="muted small">{[p.position, p.height, p.weight && (/\d$/.test(p.weight) ? p.weight + ' lb' : p.weight), p.year, p.hometown].filter(Boolean).join(' · ')}</div>
        <div style={{ marginTop: 6 }}><StatusPill i={cur} long /></div></div>
    </div>
    <div className="prof-grid">
      <div className="prof-body"><Anatomy injuries={active} /></div>
      <div className="prof-boxes">
        {!active.length ? <div className="prof-box"><b>No active injuries</b><span className="muted small">Available to practise and play.</span></div>
          : active.map((i) => { const n = nextStep(i, today); return <div key={i.id} className={`prof-box ${STATUS[i.status].color}`}>
            <div className="prof-box-h"><b>{i.injury || where(i)}</b><StatusPill i={i} /><button className="btn sm ghost" onClick={() => onEdit(i)}><Icon n="edit" /> Edit</button></div>
            {i.injury && where(i) && <div className="muted small">{where(i)}</div>}
            <div className="prof-k">Limitations</div><div className="prof-v">{i.limitations || <span className="muted">None noted</span>}</div>
            <div className="prof-k">Timeline</div>
            <ul className="prof-tl">
              <li><span>Injured</span><b>{dateOr(i.injured_on)}</b>{i.injured_on && <em>{inDays(daysFrom(today, i.injured_on))}</em>}</li>
              <li><span>Return to practice</span><b>{dateOr(i.return_practice)}</b>{i.return_practice && <em>{inDays(daysFrom(today, i.return_practice))}</em>}</li>
              <li><span>Return to play</span><b>{dateOr(i.return_play)}</b>{i.return_play && <em>{inDays(daysFrom(today, i.return_play))}</em>}</li>
            </ul>
            {n && n.overdue && <div className="inj-overdue small">The return date has passed. Update or clear the status.</div>}
            {i.details && <><div className="prof-k">Details</div><div className="prof-v">{i.details}</div></>}
          </div>; })}
        {past.length > 0 && <div className="prof-box"><div className="prof-k">History</div>
          <ul className="prof-hist">{past.map((i) => <li key={i.id}><button className="linkish" onClick={() => onEdit(i)}>{i.injury || where(i)}</button><span className="muted small">{dateOr(i.injured_on)} → cleared {dateOr(i.cleared_on)}</span></li>)}</ul></div>}
      </div>
    </div>
  </Modal>;
}

function ImportInjuries({ roster, close, onSave }) {
  const H = useHub();
  const [res, setRes] = useState(null), [busy, setBusy] = useState(false);
  const byId = Object.fromEntries(roster.map((p) => [p.id, p]));
  const pick = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true); setRes(null);
    try {
      const pdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
      const rows = pdf ? pdfItemsToTable(await pdfTextItems(file), injuryField) : parseCsv(await file.text());
      if (!rows || rows.length < 2) throw new Error(pdf ? 'No injury table found. The PDF needs selectable text with headings like Player, Injury, Status, Return to play.' : 'The file has no rows.');
      const r = rowsToInjuries(rows, roster);
      if (!r.injuries.length) throw new Error(r.unmatched.length ? `None of the ${r.unmatched.length} players in the file matched the roster by name or number.` : 'No injuries found in the file.');
      setRes({ ...r, file: file.name });
    } catch (err) { H.toast(err.message); }
    finally { setBusy(false); e.target.value = ''; }
  };
  return <Modal title="Import injuries" wide onClose={close}
    actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!res} onClick={() => { close(); onSave(res.injuries, `${res.injuries.length} injur${res.injuries.length === 1 ? 'y' : 'ies'} imported`); }}>Import</button></>}>
    <p className="muted small" style={{ margin: 0 }}>A CSV or PDF (selectable text) with headings like <b>Player</b> (or #), <b>Injury</b>, <b>Area</b>, <b>Side</b>, <b>Status</b> (out / limited / cleared), <b>Date</b>, <b>Return to practice</b>, <b>Return to play</b>, <b>Limitations</b>, <b>Notes</b>. Read in your browser; players are matched to the roster by name or number, and each row is added as a new injury. Dates: YYYY-MM-DD, or month/day/year.</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <label className="btn"><Icon n="plus" /> {busy ? 'Reading…' : res ? 'Choose another file' : 'Choose CSV or PDF'}<input type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" hidden onChange={pick} /></label>
      <button className="btn ghost" onClick={() => downloadCsv('injuries-template.csv', [['Player', 'Number', 'Injury', 'Area', 'Side', 'Status', 'Injury date', 'Return to practice', 'Return to play', 'Limitations', 'Notes']])}>Download blank template</button>
    </div>
    {res && <>
      <div className="small"><b>{res.file}</b>: {res.injuries.length} to add{res.unmatched.length ? `; not on the roster (skipped): ${res.unmatched.join(', ')}` : ''}.</div>
      <div className="tbl-wrap" style={{ maxHeight: 320, overflow: 'auto' }}><table className="tbl inj-tbl">
        <thead><tr><th>Player</th><th>Status</th><th>Injury</th><th>Injured</th><th>Practice</th><th>Play</th></tr></thead>
        <tbody>{res.injuries.map((i, k) => <tr key={k}><td>{byId[i.player_id].name}</td><td><StatusPill i={i} /></td><td>{i.injury}{where(i) && <span className="muted small"> · {where(i)}</span>}</td><td>{dateOr(i.injured_on)}</td><td>{dateOr(i.return_practice)}</td><td>{dateOr(i.return_play)}</td></tr>)}</tbody>
      </table></div>
    </>}
  </Modal>;
}
