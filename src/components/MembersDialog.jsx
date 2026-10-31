// Org admins: who can see this organization's teams, and the public schedule link.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

const ROLES = { admin: 'Admin', coach: 'Coach', viewer: 'Viewer' };

export default function MembersDialog({ org, close }) {
  const H = useHub();
  const [list, setList] = useState(null);
  const [email, setEmail] = useState(''); const [role, setRole] = useState('coach');
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
  return <Modal title={`${org.name} · members`} wide onClose={close} actions={<button className="btn primary" onClick={close}>Done</button>}>
    <p className="muted small" style={{ margin: 0 }}>Members see every team in {org.name}. <b>Coaches</b> can edit schedules, the S&C plan and team notes; <b>viewers</b> can only look (no notes or to-dos). People without an account get access as soon as they sign up with that email.</p>
    <form className="todo-add" onSubmit={(e) => { e.preventDefault(); const em = email.trim(); if (!/^\S+@\S+\.\S+$/.test(em)) { H.toast('Enter an email address.'); return; } setEmail(''); act(() => H.api.inviteMember(org.id, em, role), (r) => (r === 'added' ? 'Added' : 'Invite saved: they get access when they sign up')); }}>
      <input className="input" type="email" placeholder="coach@school.ca" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
      <select className="select" style={{ width: 120, flex: 'none' }} value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button className="btn primary" type="submit">Add</button>
    </form>
    {!list ? <div className="muted small">Loading…</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{list.map((m) => <div key={m.email + (m.user_id || '')} className="mem-row">
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{m.email} {m.pending && <span className="pill">Invited</span>}{m.user_id === H.user.id && <span className="pill">You</span>}</span>
      <select className="select" value={m.role} disabled={m.user_id === H.user.id} onChange={(e) => act(() => H.api.setMemberRole(org.id, m, e.target.value))}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {m.user_id === H.user.id ? <span /> : <button className="icon-btn" aria-label={`Remove ${m.email}`} onClick={async () => { if (await H.confirm('Remove access?', `${m.email} will no longer see ${org.name}.`, 'Remove')) act(() => H.api.removeMember(org.id, m), 'Removed'); }}><Icon n="x" /></button>}
    </div>)}</div>}
    <div className="card" style={{ padding: 14 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}><input type="checkbox" className="cb" checked={pub} onChange={(e) => togglePub(e.target.checked)} /> Public master schedule link</label>
      <div className="muted small">Anyone with the link sees {org.name}'s games and calendar events, read-only. No S&C plan, notes or member list.</div>
      {pub && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><a href={link} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>{link}</a><button className="btn sm" onClick={() => navigator.clipboard.writeText(link).then(() => H.toast('Link copied'))}>Copy</button></div>}
    </div>
  </Modal>;
}
