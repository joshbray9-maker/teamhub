// Spectators (org admins): links to send parents and fans. Each link shows chosen teams (or
// every team in the organization): calendar, next game, results and standings, plus player
// game stats only when ticked. Anyone with a link can open it without signing in; a revoked
// link stops working straight away. The public page is PublicSpectator.jsx.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate } from '../lib/util.js';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';

export const spectatorUrl = (token) => `${location.origin}/s/${token}`;

export default function Spectators() {
  const H = useHub(); const org = H.orgOf(H.team);
  const [links, setLinks] = useState(null);
  const teams = org ? H.orgTeams(org.id) : [];
  const load = () => H.api.listSpectatorLinks(org.id).then(setLinks).catch((e) => { setLinks([]); H.toast('Could not load links: ' + e.message); });
  useEffect(() => { if (org && org.role === 'admin') load(); }, [org && org.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!org || org.role !== 'admin') return <><PageHead title="Spectators" /><section className="card"><p className="muted" style={{ margin: 0 }}>Spectator links are managed by organization admins.</p></section></>;
  const save = async (l, msg) => { try { await H.api.saveSpectatorLink(org.id, l); if (msg) H.toast(msg); } catch (e) { H.toast('Could not save. ' + e.message); } load(); };
  const del = async (l) => { if (!(await H.confirm('Delete link?', `"${l.label || 'Link'}" stops working for everyone who has it.`))) return; try { await H.api.deleteSpectatorLink(l.id); } catch (e) { H.toast(e.message); } load(); };
  const edit = (l) => H.openDialog((c) => <LinkForm l={l} teams={teams} org={org} close={c} onSave={(x) => save(x, l ? 'Link updated' : 'Link created')} />);
  const names = (l) => (!l.team_ids ? `All ${org.name} teams` : l.team_ids.map((id) => (teams.find((t) => t.id === id) || {}).name).filter(Boolean).join(', ') || 'No teams');
  return <>
    <PageHead title="Spectators" actions={<button className="btn primary" onClick={() => edit(null)}><Icon n="plus" /> New link</button>} />
    <section className="card">
      <p className="muted small" style={{ margin: 0 }}>Links for parents, family and fans of <b>{org.name}</b>. Each shows the teams you choose: calendar, next game, results and standings{' '}(and player game stats only if you tick it). <b>Anyone with a link can open it without signing in</b>, so share it the way you'd share a schedule. Revoke a link to switch it off.</p>
      {!links ? <div className="muted small">Loading…</div> : !links.length ? <div className="empty-state"><b>No links yet</b><span className="muted small">Create one with <b>New link</b>, e.g. "BCS parents" for every BCS team, or "U16 families" for one team.</span></div>
        : <ul className="sp-list">{links.map((l) => <li key={l.id} className={l.revoked ? 'off' : ''}>
          <div className="sp-main"><b>{l.label || 'Untitled link'}</b>{l.revoked && <span className="pill">Revoked</span>}{l.show_stats && <span className="pill">Player stats</span>}
            <span className="muted small">{names(l)} · created {fmtDate(String(l.created_at).slice(0, 10))}</span>
            {!l.revoked && <a className="small sp-url" href={spectatorUrl(l.token)} target="_blank" rel="noopener noreferrer">{spectatorUrl(l.token)}</a>}</div>
          <div className="sp-acts">
            {!l.revoked && <button className="btn sm" onClick={() => navigator.clipboard.writeText(spectatorUrl(l.token)).then(() => H.toast('Link copied'))}>Copy link</button>}
            <button className="btn sm" onClick={() => edit(l)}><Icon n="edit" /> Edit</button>
            <button className="btn sm" onClick={() => save({ ...l, revoked: !l.revoked }, l.revoked ? 'Link switched back on' : 'Link revoked')}>{l.revoked ? 'Restore' : 'Revoke'}</button>
            <button className="icon-btn" onClick={() => del(l)} aria-label="Delete link"><Icon n="trash" /></button>
          </div>
        </li>)}</ul>}
    </section>
  </>;
}

function LinkForm({ l, teams, org, close, onSave }) {
  const H = useHub();
  const [label, setLabel] = useState(l ? l.label : ''), [pick, setPick] = useState(l ? l.team_ids : null), [stats, setStats] = useState(l ? l.show_stats : false);
  const flip = (id) => { const s = new Set(pick || []); if (s.has(id)) s.delete(id); else s.add(id); setPick([...s]); };
  const submit = () => {
    if (!label.trim()) { H.toast('Give the link a name, e.g. "BCS parents".'); return; }
    if (pick && !pick.length) { H.toast('Tick at least one team, or choose all teams.'); return; }
    close(); onSave({ ...(l || {}), label: label.trim(), team_ids: pick, show_stats: stats });
  };
  return <Modal title={l ? 'Edit spectator link' : 'New spectator link'} onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>{l ? 'Save' : 'Create link'}</button></>}>
    <label className="field"><span>Name (for you)</span><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="BCS parents" /></label>
    <div className="field"><span>Teams</span>
      <div className="tp">
        <label className="tp-opt"><input type="radio" checked={!pick} onChange={() => setPick(null)} /> Every {org.name} team (including teams added later)</label>
        <label className="tp-opt"><input type="radio" checked={!!pick} onChange={() => setPick([])} /> Only these teams:</label>
        {pick && <div className="tp-list">{teams.map((t) => <label key={t.id}><input type="checkbox" className="cb" checked={pick.includes(t.id)} onChange={() => flip(t.id)} /> {t.name}</label>)}</div>}
      </div></div>
    <label className="tp-opt"><input type="checkbox" className="cb" checked={stats} onChange={(e) => setStats(e.target.checked)} /> Show player game stats (names and season stats)</label>
    <span className="muted small">Calendar, next game, results and standings are always shown. Player names only appear with stats ticked. Nothing about injuries, testing, notes, lines or plays is ever shown.</span>
  </Modal>;
}
