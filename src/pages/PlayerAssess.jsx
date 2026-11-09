// A player's self-assessment page: /a/<token>, their own permanent link. No sign-in. After each
// game on the team's schedule, that game's questionnaire opens here (assess_view decides which
// games are open); answers can be changed until a game on a later date starts. Below, the player's
// own past answers, read-only. An athlete with a TeamHub account sees the same page inside the
// app (`token` and `embedded`, from the Self-assessment menu).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { applyTheme, fmtDate, fmtTime } from '../lib/util.js';
import { QUESTIONS, splitName, cleanAnswers } from '../lib/selfAssess.js';
import Logo from '../components/Logo.jsx';

export default function PlayerAssess({ api, token: given, embedded = false }) {
  const params = useParams(); const token = given || params.token;
  const [d, setD] = useState(undefined);
  const load = () => api.assessView(token).then((r) => { setD(r); if (r && !embedded) { applyTheme(r.team.color); document.title = `${r.team.name} · Self-assessment`; } }).catch(() => setD(null));
  useEffect(() => { if (!api) { setD(null); return; } load(); }, [api, token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d === undefined) return <div className="loading">Loading…</div>;
  if (!d && embedded) return <section className="card"><p className="muted" style={{ margin: 0 }}>Your self-assessment isn't available. Ask your coach to check you're still on the roster.</p></section>;
  if (!d) return <div className="auth"><div className="card"><div className="card-head"><h2>Link not available</h2></div><p className="muted" style={{ margin: 0 }}>This link was replaced or the address is wrong. Ask your coach for your link.</p></div></div>;
  const n = splitName(d.player.name);
  return <div className={embedded ? 'sa-wrap sa-in' : 'pub-wrap sa-wrap'}>
    {!embedded && <header className="spx-head"><Logo t={{ name: d.team.name, logo_url: d.team.logo_url }} cls="lg" /><div><h1>Self-assessment</h1><span className="muted">{d.team.name}</span></div></header>}
    <section className="card sa-who">
      <div><span className="muted small">First name</span><b>{n.first}</b></div>
      <div><span className="muted small">Last name</span><b>{n.last || '—'}</b></div>
      <div><span className="muted small">Jersey number</span><b>{d.player.num ? '#' + d.player.num : '—'}</b></div>
    </section>
    {!d.open.length ? <section className="card"><div className="card-head"><h2>No game to answer right now</h2></div>
      <p className="muted small" style={{ margin: 0 }}>Your questionnaire opens here after each game. Keep this link and come back after your next game.</p></section>
      : d.open.map((g) => <GameForm key={g.id} g={g} save={(a) => api.assessSubmit(token, g.id, a)} onSaved={load} two={d.open.length > 1} />)}
    {d.past.length > 0 && <section className="card"><div className="card-head"><h2>Your past games</h2><span className="muted small">{d.past.length}</span></div>
      <div className="sa-past">{d.past.map((a, i) => <details key={i}><summary><b>{fmtDate(a.game_date)}</b>{a.opponent && <span> · vs {a.opponent}</span>}</summary><Answers a={a.answers} /></details>)}</div></section>}
    <footer className="muted small spx-foot">Only you and your coaches see your answers.</footer>
  </div>;
}

function GameForm({ g, save, onSaved, two }) {
  const [a, setA] = useState(() => ({ ...(g.answers || {}) }));
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(g.submitted_at ? 'saved' : '');
  const missing = QUESTIONS.filter((q) => !cleanAnswers(a)[q.id]);
  const set = (k, v) => { setA((x) => ({ ...x, [k]: v })); setMsg(''); };
  const submit = async (e) => {
    e.preventDefault();
    if (missing.length) { setMsg('missing'); return; }
    setBusy(true);
    try { await save(cleanAnswers(a)); setMsg('saved'); onSaved(); } catch (err) { setMsg(err.message || 'Could not save. Try again.'); } finally { setBusy(false); }
  };
  return <form className="card sa-form" onSubmit={submit}>
    <div className="card-head"><h2>vs {g.opponent}</h2><span className="muted small">{fmtDate(g.date, true)}{two && g.time ? ' · ' + fmtTime(g.time) : ''}</span></div>
    {QUESTIONS.map((q, i) => <fieldset key={q.id} className="sa-q">
      <legend>{i + 1}. {q.label}</legend>
      {q.scale ? <><div className="sa-scale">{['1', '2', '3', '4', '5'].map((v) => <button type="button" key={v} className={a[q.id] === v ? 'on' : ''} aria-pressed={a[q.id] === v} onClick={() => set(q.id, v)}>{v}</button>)}</div>
        <div className="sa-ends muted small"><span>1 · {q.low}</span><span>5 · {q.high}</span></div></>
        : q.choices ? <div className="sa-scale">{q.choices.map((v) => <button type="button" key={v} className={a[q.id] === v ? 'on' : ''} aria-pressed={a[q.id] === v} onClick={() => set(q.id, v)}>{v}</button>)}</div>
        : <textarea className="input" maxLength={1000} value={a[q.id] || ''} onChange={(e) => set(q.id, e.target.value)} aria-label={q.label} />}
    </fieldset>)}
    <div className="sa-send">
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : g.submitted_at ? 'Save changes' : 'Send my answers'}</button>
      {msg === 'saved' ? <span className="sa-ok">✓ Saved. You can change your answers until your next game.</span>
        : msg === 'missing' ? <span className="sa-err">Please answer every question ({missing.map((q) => QUESTIONS.indexOf(q) + 1).join(', ')}).</span>
        : msg ? <span className="sa-err">{msg}</span> : null}
    </div>
  </form>;
}

/** A self-assessment's answers, question by question (also used in the staff views). */
export function Answers({ a }) {
  return <dl className="sa-ans">{QUESTIONS.map((q) => <div key={q.id}><dt>{q.label}</dt><dd>{(a || {})[q.id] || <span className="muted">—</span>}</dd></div>)}</dl>;
}
