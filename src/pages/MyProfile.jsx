// My Profile: your name, staff title, phone, bio and photo (seen by people in your
// organizations; chat shows your name), your account and access, a password change, and the
// coaching staff of the current team's organization.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { resizePhoto } from '../lib/photo.js';
import PageHead from '../components/PageHead.jsx';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';

const TITLES = ['Head coach', 'Assistant coach', 'Goalie coach', 'S&C coach', 'Director of sports performance', 'Athletic therapist', 'Team manager', 'Video coordinator'];
const ROLE = { admin: 'Admin', coach: 'Coach', viewer: 'Viewer' };
const nameOf = (p) => (p.display_name && p.display_name.trim()) || (p.email || '').split('@')[0];

export default function MyProfile() {
  const H = useHub(); const org = H.orgOf(H.team);
  const [me, setMe] = useState(null), [saved, setSaved] = useState(null), [pic, setPic] = useState(null), [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState(null), [pics, setPics] = useState({});
  useEffect(() => {
    H.api.getMyProfile(H.user).then((p) => { setMe(p); setSaved(p); if (p.photo) H.api.avatarUrls([p.photo]).then((u) => setPic(u[p.photo] || null)).catch(() => {}); })
      .catch((e) => H.toast('Could not load your profile: ' + e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const loadStaff = () => org && H.api.listStaff(org.id).then(async (s) => { setStaff(s); setPics(await H.api.avatarUrls(s.map((x) => x.photo)).catch(() => ({}))); }).catch(() => setStaff([]));
  useEffect(() => { loadStaff(); }, [org && org.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return <><PageHead title="My Profile" /><div className="loading">Loading…</div></>;
  const dirty = JSON.stringify(me) !== JSON.stringify(saved);
  const set = (k) => (e) => setMe({ ...me, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try { await H.api.saveMyProfile(H.user, { ...me, display_name: me.display_name.trim(), title: me.title.trim(), phone: me.phone.trim() }); setSaved(me); H.toast('Profile saved'); loadStaff(); }
    catch (e) { H.toast('Could not save. ' + e.message); } finally { setBusy(false); }
  };
  const photo = async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try { const blob = await resizePhoto(file); const path = await H.api.uploadAvatar(H.user, blob); setMe({ ...me, photo: path }); setPic(URL.createObjectURL(blob)); }
    catch (err) { H.toast('Could not upload the photo. ' + err.message); }
  };
  const byOrg = H.orgs.map((o) => ({ o, teams: H.orgTeams(o.id) })).filter((x) => x.o.role);
  return <>
    <PageHead title="My Profile" />
    <div className="mp-grid">
      <section className="card">
        <div className="card-head"><h2>Your profile</h2><span className="muted small">Seen by people in your organizations</span></div>
        <div className="mp-photo"><Avatar p={{ name: nameOf(me) }} url={pic} size={88} />
          <div><label className="btn sm"><Icon n="plus" /> {pic ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" hidden onChange={photo} /></label>
            {pic && <button className="btn sm ghost" onClick={() => { setMe({ ...me, photo: null }); setPic(null); }}>Remove</button>}</div></div>
        <div className="row2">
          <label className="field"><span>Name</span><input className="input" value={me.display_name || ''} onChange={set('display_name')} maxLength={80} placeholder="First and last name" /></label>
          <label className="field"><span>Staff title</span><input className="input" list="mp-titles" value={me.title || ''} onChange={set('title')} maxLength={80} placeholder="e.g. Head coach" />
            <datalist id="mp-titles">{TITLES.map((x) => <option key={x} value={x} />)}</datalist></label>
        </div>
        <label className="field"><span>Phone (optional)</span><input className="input" type="tel" value={me.phone || ''} onChange={set('phone')} maxLength={40} placeholder="Shown to people in your organizations" /></label>
        <label className="field"><span>About</span><textarea className="input" value={me.bio || ''} onChange={set('bio')} maxLength={1000} placeholder="Background, certifications, how to reach you" /></label>
        <div className="pp-foot"><span className="muted small">Chat messages show your name once it's set.</span><span className="spacer" /><button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save profile' : 'Saved'}</button></div>
      </section>

      <div className="mp-side">
        <section className="card">
          <div className="card-head"><h2>Account</h2></div>
          <div className="mp-kv"><span className="muted small">Email (sign-in)</span><b>{me.email || H.user.email}</b></div>
          <div className="mp-k">Access</div>
          {!byOrg.length ? <p className="muted small" style={{ margin: 0 }}>No organizations yet.</p>
            : <ul className="mp-access">{byOrg.map(({ o, teams }) => <li key={o.id}><b>{o.name}</b> <span className="pill">{ROLE[o.role]}</span>
              <span className="muted small">{teams.map((t) => t.name).join(', ') || 'No teams'}</span></li>)}</ul>}
          <div className="pp-foot"><ChangePassword /><span className="spacer" /><button className="btn ghost" onClick={() => H.api.signOut()}><Icon n="user" /> Sign out</button></div>
        </section>
        {org && <section className="card">
          <div className="card-head"><h2>Coaching staff</h2><span className="muted small">{org.name}</span></div>
          {!staff ? <div className="muted small">Loading…</div> : !staff.length ? <p className="muted small" style={{ margin: 0 }}>No coaches listed yet.</p>
            : <ul className="mp-staff">{staff.map((s) => <li key={s.id}><Avatar p={{ name: nameOf(s) }} url={pics[s.photo]} size={44} />
              <div><b>{nameOf(s)}</b>{s.id === H.user.id && <span className="pill">You</span>}<span className="muted small">{s.title || ROLE[s.role]}</span>
                <span className="small mp-contact">{s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}{s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>{s.phone}</a>}</span>
                {s.bio && <span className="small mp-bio">{s.bio}</span>}</div></li>)}</ul>}
        </section>}
      </div>
    </div>
  </>;
}

function ChangePassword() {
  const H = useHub(); const [open, setOpen] = useState(false), [pw, setPw] = useState('');
  if (H.api.demo) return null;
  if (!open) return <button className="btn" onClick={() => setOpen(true)}><Icon n="lock" /> Change password</button>;
  const go = async () => { if (pw.length < 8) { H.toast('Use at least 8 characters.'); return; } try { await H.api.updatePassword(pw); H.toast('Password changed'); setOpen(false); setPw(''); } catch (e) { H.toast(e.message); } };
  return <form className="todo-add" onSubmit={(e) => { e.preventDefault(); go(); }}><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" aria-label="New password" /><button className="btn primary" type="submit">Save</button></form>;
}
