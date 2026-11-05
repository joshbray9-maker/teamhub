// Email + password sign-in, sign-up and password reset (Supabase Auth).
import { useState } from 'react';

/** Which teams an invite opens, in words. */
export const inviteTeams = (inv) => (!inv.teams ? 'every team' : inv.teams.length ? inv.teams.join(', ') : 'no teams yet');

// invite: { org_name, role, email, back } from an invite link (pages/Join.jsx): the form starts on
// Create account with the invited email, and a confirmation email returns to the link.
export default function Login({ api, mode: initial = 'in', invite = null }) {
  const [mode, setMode] = useState(initial); // in | up | forgot | reset
  const [email, setEmail] = useState((invite && invite.email) || ''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try {
      if (mode === 'in') await api.signIn(email.trim(), pw);
      else if (mode === 'up') { if (pw.length < 8) throw new Error('Use at least 8 characters.'); const r = await api.signUp(email.trim(), pw, invite && invite.back); if (!r || !r.session) setMsg('Check your email to confirm your account, then sign in.'); }
      else if (mode === 'forgot') { await api.resetPassword(email.trim()); setMsg('If that email has an account, a reset link is on its way.'); }
      else if (mode === 'reset') { if (pw.length < 8) throw new Error('Use at least 8 characters.'); await api.updatePassword(pw); setMsg('Password updated.'); location.replace('/'); }
    } catch (e2) { setErr(e2.message || 'Something went wrong.'); }
    finally { setBusy(false); }
  };
  const title = { in: 'Sign in', up: 'Create account', forgot: 'Reset password', reset: 'Choose a new password' }[mode];
  return <div className="auth">
    <div className="eyebrow">TeamHub</div>
    <form className="card" onSubmit={submit}>
      {invite && <div className="okmsg" style={{ color: 'inherit' }}>You're invited to <b>{invite.org_name}</b> as {invite.role === 'admin' ? 'an admin' : `a ${invite.role}`} ({inviteTeams(invite)}). Create your account below, or sign in if you already have one.</div>}
      <div className="card-head"><h2>{title}</h2></div>
      {mode !== 'reset' && <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
      {mode !== 'forgot' && <label className="field"><span>{mode === 'reset' ? 'New password' : 'Password'}</span><input className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required value={pw} onChange={(e) => setPw(e.target.value)} /></label>}
      {err && <div className="err">{err}</div>}{msg && <div className="okmsg">{msg}</div>}
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : title}</button>
      {mode === 'in' && <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); }}>Forgot password?</a>
        <a href="#" onClick={(e) => { e.preventDefault(); setMode('up'); }}>Create an account</a></div>}
      {mode === 'up' && invite && <a className="small" href="#" onClick={(e) => { e.preventDefault(); setMode('in'); }}>I already have an account: sign in</a>}
      {(mode === 'up' && !invite || mode === 'forgot') && <a className="small" href="#" onClick={(e) => { e.preventDefault(); setMode('in'); }}>Back to sign in</a>}
    </form>
    {!invite && <p className="muted small">Coaches get access from the invite link an organization admin sends them.</p>}
  </div>;
}
