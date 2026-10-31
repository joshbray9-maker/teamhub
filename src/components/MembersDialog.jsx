// Org admins: who can see this organization's teams (all of them, or only chosen ones), and
// the public schedule link. Access is enforced in the database (team_role / member_teams).
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

const ROLES = { admin: 'Admin', coach: 'Coach', viewer: 'Viewer' };

/** "All teams" or a chosen set. value: null (all) or [team ids]. */
function TeamPick({ teams, value, onChange }) {
  const some = value !== null;
  const flip = (id) => { const s = new Set(value || []); if (s.has(id)) s.delete(id); else s.add(id); onChange([...s]); };
  return <div className="tp">
    <label className="tp-opt"><input type="radio" checked={!some} onChange={() => onChange(null)} /> All teams in the organization</label>
    <label className="tp-opt"><input type="radio" checked={some} onChange={() => onChange([])} /> Only these teams:</label>
    {some && <div className="tp-list">{teams.map((t) => <label key={t.id}><input type="checkbox" className="cb" checked={value.includes(t.id)} onChange={() => flip(t.id)} /> {t.name}</label>)}</div>}
  </div>;
}
const teamsLabel = (m, teams) => (m.role === 'admin' || !m.teams ? 'All teams' : m.teams.length === 1 ? (teams.find((t) => t.id === m.teams[0]) || {}).name || '1 team' : `${m.teams.length} teams`);

export default function MembersDialog({ org, close }) {
  const H = useHub();
  const teams = H.orgTeams(org.id);
  const [list, setList] = useState(null);
  const [email, setEmail] = useState(''); const [role, setRole] = useState('coach'); const [pick, setPick] = useState(null);
  const [pub, setPub] = useState(!!org.public_schedule);
  const load = () => H.api.listMembers(org.id).then(setList).catch((e) => H.toast('Could not load members: ' + e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn, msg) => { try { const r = await fn(); if (msg) H.toast(typeof msg === 'function' ? msg(r) : msg); load(); } catch (e) { H.toast(e.message); } };
  const link = `${location.origin}/schedule/${org.slug}`;
  const togglePub = async (on) => {
    setPub(on);
    try { await H.api.updateOrg(org.id, { public_schedule: on }); H.setHub((h) => ({ ...h, orgs: h.orgs.map((o) => (o.id === org.id ? { ...o, public_schedule: on } : o)) })); }
    catch (e) { setPub(!on); H.toast(e.message); }
  };
  const add = (e) => {
    e.preventDefault(); const em = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) { H.toast('Enter an email address.'); return; }
    if (role !== 'admin' && pick && !pick.length) { H.toast('Tick at least one team, or choose All teams.'); return; }
    const teamIds = role === 'admin' ? null : pick;
    setEmail(''); setPick(null);
    act(() => H.api.inviteMember(org.id, em, role, teamIds), (r) => (r === 'added' ? 'Added' : 'Invite saved: they get access when they sign up'));
  };
  const editTeams = (m) => H.openDialog((c) => <MemberTeams m={m} teams={teams} close={c} onSave={(v) => act(() => H.api.setMemberTeams(org.id, m, v), 'Team access updated')} />);
  return <Modal title={`${org.name} · members`} wide onClose={close} actions={<button className="btn primary" onClick={close}>Done</button>}>
    <p className="muted small" style={{ margin: 0 }}><b>Coaches</b> can edit schedules, the S&C plan, team notes, injuries and testing; <b>viewers</b> can only look (no notes, injuries or test results). Coaches and viewers see <b>all teams</b> in {org.name} or only the teams you choose; <b>admins</b> always see every team. People without an account get access as soon as they sign up with that email.</p>
    <form className="mem-add" onSubmit={add}>
      <div className="todo-add">
        <input className="input" type="email" placeholder="coach@school.ca" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <select className="select" style={{ width: 120, flex: 'none' }} value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn primary" type="submit">Add</button>
      </div>
      {role !== 'admin' && teams.length > 1 && <TeamPick teams={teams} value={pick} onChange={setPick} />}
    </form>
    {!list ? <div className="muted small">Loading…</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{list.map((m) => { const me = m.user_id === H.user.id; return <div key={m.email + (m.user_id || '')} className="mem-row">
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{m.email} {m.pending && <span className="pill">Invited</span>}{me && <span className="pill">You</span>}</span>
      <select className="select" value={m.role} disabled={me} onChange={(e) => act(() => H.api.setMemberRole(org.id, m, e.target.value))}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button className="btn sm mem-teams" disabled={m.role === 'admin' || teams.length < 2} onClick={() => editTeams(m)} title={m.role === 'admin' ? 'Admins see every team' : 'Choose which teams they see'}>{teamsLabel(m, teams)}</button>
      {me ? <span /> : <button className="icon-btn" aria-label={`Remove ${m.email}`} onClick={async () => { if (await H.confirm('Remove access?', `${m.email} will no longer see ${org.name}.`, 'Remove')) act(() => H.api.removeMember(org.id, m), 'Removed'); }}><Icon n="x" /></button>}
    </div>; })}</div>}
    <div className="card" style={{ padding: 14 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}><input type="checkbox" className="cb" checked={pub} onChange={(e) => togglePub(e.target.checked)} /> Public master schedule link</label>
      <div className="muted small">Anyone with the link sees {org.name}'s games and calendar events, read-only. No S&C plan, notes or member list.</div>
      {pub && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><a href={link} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>{link}</a><button className="btn sm" onClick={() => navigator.clipboard.writeText(link).then(() => H.toast('Link copied'))}>Copy</button></div>}
    </div>
  </Modal>;
}

function MemberTeams({ m, teams, close, onSave }) {
  const H = useHub();
  const [v, setV] = useState(m.teams ? [...m.teams] : null);
  return <Modal title={`Teams for ${m.email}`} onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { if (v && !v.length) { H.toast('Tick at least one team, or choose All teams.'); return; } close(); onSave(v); }}>Save</button></>}>
    <TeamPick teams={teams} value={v} onChange={setV} />
  </Modal>;
}
