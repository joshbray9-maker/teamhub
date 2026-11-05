// /join/<token>: an invite link from the Members dialog. Signed out: shows the organization and
// role, then create an account or sign in. Signed in: one click joins with that account. The token
// is also kept in this browser, so a confirmation email that lands on the home page still joins.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Login, { inviteTeams } from './Login.jsx';

export const JOIN_KEY = 'teamhub-join';

export default function Join({ api, user }) {
  const { token } = useParams();
  const go = useNavigate();
  const [inv, setInv] = useState(undefined); // undefined loading, null used/removed
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!api) return;
    api.inviteInfo(token).then((i) => { setInv(i); try { if (i) localStorage.setItem(JOIN_KEY, token); else localStorage.removeItem(JOIN_KEY); } catch { /* storage blocked */ } })
      .catch(() => setInv(null));
  }, [api, token]);
  const join = async () => {
    setBusy(true); setErr('');
    try { await api.acceptInvite(token); try { localStorage.removeItem(JOIN_KEY); } catch { /* storage blocked */ } location.replace('/'); }
    catch (e) { setErr(e.message || 'Could not join.'); setBusy(false); }
  };
  if (inv === undefined || user === undefined) return <div className="loading">Loading invite…</div>;
  if (!inv) return <div className="auth"><div className="eyebrow">TeamHub</div><div className="card">
    <div className="card-head"><h2>Invite link not valid</h2></div>
    <p className="muted" style={{ margin: 0 }}>This link was already used or removed. {user ? 'If you just created your account with it, you are already in.' : 'If you already joined, sign in.'} Otherwise ask your admin for a new link.</p>
    <button className="btn primary" onClick={() => go('/')}>{user ? 'Open TeamHub' : 'Sign in'}</button>
  </div></div>;
  if (!user) return <Login api={api} mode="up" invite={{ ...inv, back: `/join/${token}` }} />;
  return <div className="auth"><div className="eyebrow">TeamHub</div><div className="card">
    <div className="card-head"><h2>Join {inv.org_name}</h2></div>
    <p style={{ margin: 0 }}>You're invited as {inv.role === 'admin' ? 'an admin' : `a ${inv.role}`} ({inviteTeams(inv)}). You're signed in as <b>{user.email}</b>.</p>
    {err && <div className="err">{err}</div>}
    <button className="btn primary" disabled={busy} onClick={join}>{busy ? 'Joining…' : `Join ${inv.org_name}`}</button>
    <a className="small" href="#" onClick={async (e) => { e.preventDefault(); await api.signOut(); }}>Use a different account</a>
  </div></div>;
}
