// Org admins: who can see this organization's teams (all of them, or only chosen ones), and
// the public schedule link. Access is enforced in the database (team_role / member_teams).
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { ago } from '../lib/util.js';

const ROLES = { admin: 'Admin', coach: 'Coach', sportsmed: 'Sports med', viewer: 'Viewer', athlete: 'Athlete' };
// what each access level can do (enforced in the database, see the RLS policies)
const ROLE_INFO = {
  coach: 'Edits schedules, the S&C plan, team notes, injuries, testing and IPPs for their teams.',
  sportsmed: 'Only the Injury report (can edit), S&C, Athlete reports and Master schedule (view only).',
  viewer: 'Looks only: schedules and plans. No notes, injuries, test results or IPPs.',
  admin: 'Everything on every team, plus members, invite links and settings.',
  athlete: 'One player\'s own account: Master schedule, Chat, Playbook, Stats, S&C schedule and leaderboard, and their self-assessment.',
};

/** Team access as switches: "All teams" on = null; off = only the teams switched on ([ids]). */
function TeamPick({ teams, value, onChange }) {
  const all = value === null;
  const flip = (id) => { const s = new Set(value || []); if (s.has(id)) s.delete(id); else s.add(id); onChange([...s]); };
  return <div className="tp">
    <label className="tp-opt"><input type="checkbox" role="switch" className="sw" checked={all} onChange={(e) => onChange(e.target.checked ? null : [])} /> <b>All teams</b><span className="muted small">including teams added later</span></label>
    {!all && <div className="tp-list">{teams.map((t) => <label key={t.id}><input type="checkbox" role="switch" className="sw" checked={value.includes(t.id)} onChange={() => flip(t.id)} /> {t.name}</label>)}</div>}
  </div>;
}
// online = the app sent its once-a-minute heartbeat recently (user_activity)
const ONLINE_MS = 150000;
const isOnline = (m) => !!m.seen_at && Date.now() - Date.parse(m.seen_at) < ONLINE_MS;
function Seen({ m }) {
  if (m.pending) return null;
  if (isOnline(m)) return <span className="seen on"><i />Online now</span>;
  return <span className="seen">{m.seen_at ? `Last active ${ago(Date.parse(m.seen_at))}` : 'Not active since this was added'}</span>;
}
const who = (m) => (m.pending ? m.label || m.email || 'this invite' : m.email);
const teamsLabel = (m, teams) => (m.role === 'admin' || !m.teams ? 'All teams' : m.teams.length === 1 ? (teams.find((t) => t.id === m.teams[0]) || {}).name || '1 team' : `${m.teams.length} teams`);

export default function MembersDialog({ org, close }) {
  const H = useHub();
  const teams = H.orgTeams(org.id);
  const [list, setList] = useState(null);
  const [label, setLabel] = useState(''); const [email, setEmail] = useState(''); const [role, setRole] = useState('coach'); const [pick, setPick] = useState(null);
  const [made, setMade] = useState(null); // the link just created: { url, label }
  // athlete links: one player, picked from a team's roster
  const [aTeam, setATeam] = useState((teams[0] || {}).id || ''), [players, setPlayers] = useState(null), [aPlayer, setAPlayer] = useState('');
  useEffect(() => {
    if (role !== 'athlete' || !aTeam) return; setPlayers(null); setAPlayer('');
    H.api.listPlayers(aTeam).then((l) => setPlayers(l.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name)))).catch((e) => { setPlayers([]); H.toast('Could not load the roster: ' + e.message); });
  }, [role, aTeam]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pub, setPub] = useState(!!org.public_schedule);
  const load = () => H.api.listMembers(org.id).then(setList).catch((e) => H.toast('Could not load members: ' + e.message));
  // reload each minute so "Online now" stays current while the dialog is open
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn, msg) => { try { const r = await fn(); if (msg) H.toast(typeof msg === 'function' ? msg(r) : msg); load(); } catch (e) { H.toast(e.message); } };
  const link = `${location.origin}/schedule/${org.slug}`;
  // each pending invite's own join link: the admin copies it and sends it (TeamHub sends no email)
  const joinLink = (m) => `${location.origin}/join/${m.token}`;
  const copy = (text, what) => navigator.clipboard.writeText(text).then(() => H.toast(what + ' copied'), () => window.prompt('Copy this link:', text));
  const togglePub = async (on) => {
    setPub(on);
    try { await H.api.updateOrg(org.id, { public_schedule: on }); H.setHub((h) => ({ ...h, orgs: h.orgs.map((o) => (o.id === org.id ? { ...o, public_schedule: on } : o)) })); }
    catch (e) { setPub(!on); H.toast(e.message); }
  };
  // With an email: the person is added now if they have an account, else an invite tied to that
  // email. Without one: a link-only invite. Either way the link is shown, ready to copy.
  const add = async (e) => {
    e.preventDefault(); const em = email.trim();
    if (role === 'athlete') {
      const p = (players || []).find((x) => x.id === aPlayer); if (!p) { H.toast('Pick the player this link is for.'); return; }
      try { show({ url: `${location.origin}/join/${await H.api.createInviteLink(org.id, { label: label.trim() || p.name, role, player: p.id })}`, label: label.trim() || p.name }); setLabel(''); setAPlayer(''); load(); }
      catch (x) { H.toast(x.message); }
      return;
    }
    if (em && !/^\S+@\S+\.\S+$/.test(em)) { H.toast('That email doesn\'t look right. Fix it or leave it empty.'); return; }
    if (role !== 'admin' && pick && !pick.length) { H.toast('Switch on at least one team, or All teams.'); return; }
    const teamIds = role === 'admin' ? null : pick;
    try {
      if (em) {
        const r = await H.api.inviteMember(org.id, em, role, teamIds, label);
        if (r === 'added') { H.toast(`Added ${em}: they already have an account, so no link is needed`); setMade(null); }
        else { const fresh = await H.api.listMembers(org.id); setList(fresh); const m = fresh.find((x) => x.pending && x.email === em.toLowerCase()); if (m) show({ url: joinLink(m), label: label.trim() || em }); }
      } else show({ url: `${location.origin}/join/${await H.api.createInviteLink(org.id, { label, role, teams: teamIds })}`, label: label.trim() });
      setLabel(''); setEmail(''); setPick(null); load();
    } catch (x) { H.toast(x.message); }
  };
  const show = (m) => { setMade(m); navigator.clipboard.writeText(m.url).then(() => H.toast('Invite link created and copied'), () => H.toast('Invite link created: copy it below')); };
  const editTeams = (m) => H.openDialog((c) => <MemberTeams m={m} teams={teams} close={c} onSave={(v) => act(() => H.api.setMemberTeams(org.id, m, v), 'Team access updated')} />);
  return <Modal title={`${org.name} · members`} wide onClose={close} actions={<button className="btn primary" onClick={close}>Done</button>}>
    <p className="muted small" style={{ margin: 0 }}>Make an <b>invite link</b>, choose what it opens, then copy it and send it yourself (text or email). Whoever opens it creates an account (or signs in) and gets that access. Each link works once; you can change a person's access or remove them any time below.</p>
    <form className="mem-add card" onSubmit={add}>
      <div className="mem-h">New invite link</div>
      <label className="small">Who is it for? <span className="muted">(optional, just so you know which link is whose)</span>
        <input className="input" value={label} maxLength={80} placeholder="e.g. Coach Martin" onChange={(e) => setLabel(e.target.value)} /></label>
      <div className="small">Access level</div>
      <div className="role-pick" role="radiogroup" aria-label="Access level">{['coach', 'sportsmed', 'viewer', 'athlete', 'admin'].map((k) => <label key={k} className={role === k ? 'on' : ''}>
        <span><input type="radio" name="inv-role" checked={role === k} onChange={() => setRole(k)} /> <b>{ROLES[k]}</b></span><span className="muted small">{ROLE_INFO[k]}</span></label>)}</div>
      {role === 'athlete' ? <div className="mem-ath">
        <label className="small">Team<select className="select" value={aTeam} onChange={(e) => setATeam(e.target.value)}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="small">Player<select className="select" value={aPlayer} disabled={!players || !players.length} onChange={(e) => setAPlayer(e.target.value)}>
          <option value="">{!players ? 'Loading…' : players.length ? 'Choose a player' : 'No players on this roster'}</option>
          {(players || []).map((p) => <option key={p.id} value={p.id}>{p.num ? `#${p.num} ` : ''}{p.name}</option>)}</select></label>
        <div className="muted small">The link signs them in as this player, on this team only. Make one link per player.</div>
      </div>
      : teams.length > 1 && <><div className="small">Teams they can see</div>
        {role === 'admin' ? <div className="muted small">Admins always see every team.</div> : <TeamPick teams={teams} value={pick} onChange={setPick} />}</>}
      {role !== 'athlete' && <label className="small">Their email <span className="muted">(optional: if they already have a TeamHub account they're added right away, no link needed)</span>
        <input className="input" type="email" value={email} placeholder="coach@school.ca" onChange={(e) => setEmail(e.target.value)} /></label>}
      <div><button className="btn primary" type="submit"><Icon n="plus" /> Create invite link</button></div>
      {made && <div className="mem-made">
        <div className="small"><b>Link ready{made.label ? ` for ${made.label}` : ''}.</b> Send it to them: it works once.</div>
        <div className="todo-add"><input className="input" readOnly value={made.url} onFocus={(e) => e.target.select()} aria-label="Invite link" /><button type="button" className="btn primary" onClick={() => copy(made.url, 'Invite link')}>Copy</button></div>
      </div>}
    </form>
    <div className="mem-h">People and links{list && <span className="seen on" style={{ marginLeft: 10 }}><i />{list.filter(isOnline).length} online now</span>}</div>
    {!list ? <div className="muted small">Loading…</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{list.map((m) => { const me = m.user_id === H.user.id; return <div key={m.id || m.email + (m.user_id || '')} className="mem-row">
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{m.pending ? (m.label || m.email || 'Invite link') : m.email} {m.pending && m.label && m.email && <span className="muted small">{m.email} </span>}{m.pending && <span className="pill">{m.email ? 'Invited' : 'Link not used yet'}</span>}{m.pending && m.token && <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => copy(joinLink(m), 'Invite link')} title="Copy the link to send to this person">Copy invite link</button>}{me && <span className="pill">You</span>}<Seen m={m} /></span>
      <select className="select" value={m.role} disabled={me || m.role === 'athlete'} title={m.role === 'athlete' ? 'An athlete account stays an athlete: remove it and send a new link instead' : undefined} onChange={(e) => act(() => H.api.setMemberRole(org.id, m, e.target.value))}>{Object.entries(ROLES).filter(([k]) => k !== 'athlete' || m.role === 'athlete').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button className="btn sm mem-teams" disabled={m.role === 'admin' || m.role === 'athlete' || teams.length < 2} onClick={() => editTeams(m)} title={m.role === 'admin' ? 'Admins see every team' : 'Choose which teams they see'}>{teamsLabel(m, teams)}</button>
      {me ? <span /> : <button className="icon-btn" aria-label={`Remove ${who(m)}`} onClick={async () => { if (await H.confirm(m.pending ? 'Delete this invite link?' : 'Remove access?', m.pending ? `The link for ${who(m)} will stop working.` : `${who(m)} will no longer see ${org.name}.`, m.pending ? 'Delete link' : 'Remove')) act(() => H.api.removeMember(org.id, m), 'Removed'); }}><Icon n="x" /></button>}
    </div>; })}</div>}
    <div className="card" style={{ padding: 14 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}><input type="checkbox" className="cb" checked={pub} onChange={(e) => togglePub(e.target.checked)} /> Public master schedule link</label>
      <div className="muted small">Anyone with the link sees {org.name}'s games and calendar events, read-only. No S&C plan, notes or member list.</div>
      {pub && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><a href={link} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>{link}</a><button className="btn sm" onClick={() => copy(link, 'Link')}>Copy</button></div>}
    </div>
  </Modal>;
}

function MemberTeams({ m, teams, close, onSave }) {
  const H = useHub();
  const [v, setV] = useState(m.teams ? [...m.teams] : null);
  return <Modal title={`Teams for ${who(m)}`} onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { if (v && !v.length) { H.toast('Switch on at least one team, or All teams.'); return; } close(); onSave(v); }}>Save</button></>}>
    <TeamPick teams={teams} value={v} onChange={setV} />
  </Modal>;
}
