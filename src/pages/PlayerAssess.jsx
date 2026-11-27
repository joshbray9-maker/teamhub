// A player's self-assessment page: /a/<token>, their own permanent link. No sign-in. After each
// game on the team's schedule, that game's questionnaire opens here (assess_view decides which
// games are open); answers can be changed until a game on a later date starts. Below, the player's
// own past answers, read-only. Above the games, the daily check-in: an RPE for each practice and
// gym session of the last 3 days and one note per day (lib/checkin.js). The questions are the
// team's own (coaches edit them). An athlete with a TeamHub account sees the same page inside the
// app (`token` and `embedded`, from the Self-assessment menu).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { applyTheme, fmtDate, fmtTime, todayISO } from '../lib/util.js';
import { activeQuestions, questionsOf, splitName, cleanAnswers } from '../lib/selfAssess.js';
import { RPE, sessionDays, openDays } from '../lib/checkin.js';
import { addDays } from '../lib/sc.js';
import Logo from '../components/Logo.jsx';
import { ModeToggle } from '../components/Shell.jsx';

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
    <CheckIns d={d} save={(date, pr, gy, note) => api.checkinSubmit(token, date, pr, gy, note)} onSaved={load} />
    {!d.open.length ? <section className="card"><div className="card-head"><h2>No game to answer right now</h2></div>
      <p className="muted small" style={{ margin: 0 }}>Your questionnaire opens here after each game. Keep this link and come back after your next game.</p></section>
      : d.open.map((g) => <GameForm key={g.id} g={g} qs={d.questions} save={(a) => api.assessSubmit(token, g.id, a)} onSaved={load} two={d.open.length > 1} />)}
    {d.past.length > 0 && <section className="card"><div className="card-head"><h2>Your past games</h2><span className="muted small">{d.past.length}</span></div>
      <div className="sa-past">{d.past.map((a, i) => <details key={i}><summary><b>{fmtDate(a.game_date)}</b>{a.opponent && <span> · vs {a.opponent}</span>}</summary><Answers a={a.answers} qs={d.questions} /></details>)}</div></section>}
    <footer className="muted small spx-foot">Only you and your coaches see your answers.{!embedded && <ModeToggle />}</footer>
  </div>;
}

function GameForm({ g, qs, save, onSaved, two }) {
  const QS = activeQuestions(qs);
  const [a, setA] = useState(() => ({ ...(g.answers || {}) }));
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(g.submitted_at ? 'saved' : '');
  const missing = QS.filter((q) => !cleanAnswers(a, qs)[q.id]);
  const set = (k, v) => { setA((x) => ({ ...x, [k]: v })); setMsg(''); };
  const submit = async (e) => {
    e.preventDefault();
    if (missing.length) { setMsg('missing'); return; }
    setBusy(true);
    try { await save(cleanAnswers(a, qs)); setMsg('saved'); onSaved(); } catch (err) { setMsg(err.message || 'Could not save. Try again.'); } finally { setBusy(false); }
  };
  return <form className="card sa-form" onSubmit={submit}>
    <div className="card-head"><h2>vs {g.opponent}</h2><span className="muted small">{fmtDate(g.date, true)}{two && g.time ? ' · ' + fmtTime(g.time) : ''}</span></div>
    {QS.map((q, i) => <fieldset key={q.id} className="sa-q">
      <legend>{i + 1}. {q.label}</legend>
      {q.type === 'scale' ? <><div className="sa-scale">{['1', '2', '3', '4', '5'].map((v) => <button type="button" key={v} className={a[q.id] === v ? 'on' : ''} aria-pressed={a[q.id] === v} onClick={() => set(q.id, v)}>{v}</button>)}</div>
        <div className="sa-ends muted small"><span>1{q.low ? ' · ' + q.low : ''}</span><span>5{q.high ? ' · ' + q.high : ''}</span></div></>
        : q.type === 'choices' ? <div className="sa-scale">{(q.choices || []).map((v) => <button type="button" key={v} className={a[q.id] === v ? 'on' : ''} aria-pressed={a[q.id] === v} onClick={() => set(q.id, v)}>{v}</button>)}</div>
        : <textarea className="input" maxLength={1000} value={a[q.id] || ''} onChange={(e) => set(q.id, e.target.value)} aria-label={q.label} />}
    </fieldset>)}
    <div className="sa-send">
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : g.submitted_at ? 'Save changes' : 'Send my answers'}</button>
      {msg === 'saved' ? <span className="sa-ok">✓ Saved. You can change your answers until your next game.</span>
        : msg === 'missing' ? <span className="sa-err">Please answer every question ({missing.map((q) => QS.indexOf(q) + 1).join(', ')}).</span>
        : msg ? <span className="sa-err">{msg}</span> : null}
    </div>
  </form>;
}

/** A self-assessment's answers, question by question (also used in the staff views). */
export function Answers({ a, qs }) {
  const QS = questionsOf(qs).filter((q) => !q.off || (a || {})[q.id]);
  return <dl className="sa-ans">{QS.map((q) => <div key={q.id}><dt>{q.label}</dt><dd>{(a || {})[q.id] || <span className="muted">—</span>}</dd></div>)}</dl>;
}

/* ---------- daily check-in ---------- */
const dayName = (date, today) => (date === today ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : fmtDate(date, true));

function CheckIns({ d, save, onSaved }) {
  const today = d.today || todayISO();
  const sc = Object.fromEntries((d.sc || []).map((x) => [x.date, x]));
  const days = openDays(sessionDays(d.team, d.org, d.events || [], sc, addDays(today, -9), today), today);
  const by = Object.fromEntries((d.checkins || []).map((c) => [c.date, c]));
  return <section className="card ci-card">
    <div className="card-head"><div><h2>Daily check-in</h2><span className="muted small">After practice and after the gym: how hard was it, from 1 (very easy) to 10 (max effort)? Add one note for the day if you want.</span></div></div>
    {!days.length ? <p className="muted small" style={{ margin: 0 }}>No practice or gym session on the schedule in the last 3 days. Your check-in opens here on days you have one.</p>
      : days.map((x) => <CheckInDay key={x.date} x={x} label={dayName(x.date, today)} c={by[x.date]} save={save} onSaved={onSaved} />)}
  </section>;
}

function CheckInDay({ x, label, c, save, onSaved }) {
  const [v, setV] = useState(() => ({ practice: c ? c.practice_rpe : null, gym: c ? c.gym_rpe : null, note: (c && c.note) || '' }));
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(c ? 'saved' : '');
  const set = (k, val) => { setV((o) => ({ ...o, [k]: val })); setMsg(''); };
  const kinds = [x.practice && ['practice', 'Practice'], x.gym && ['gym', 'Gym']].filter(Boolean);
  const submit = async (e) => {
    e.preventDefault();
    if (kinds.some(([k]) => v[k] == null)) { setMsg('missing'); return; }
    setBusy(true);
    try { await save(x.date, x.practice ? v.practice : null, x.gym ? v.gym : null, v.note); setMsg('saved'); onSaved(); } catch (err) { setMsg(err.message || 'Could not save. Try again.'); } finally { setBusy(false); }
  };
  return <form className="ci-day" onSubmit={submit}>
    <h3>{label} <span className="muted small">{kinds.map(([, l]) => l).join(' + ')}</span></h3>
    {kinds.map(([k, l]) => <fieldset key={k} className="sa-q"><legend>{l} RPE</legend>
      <div className="sa-scale ci-rpe">{RPE.map((n) => <button type="button" key={n} className={v[k] === n ? 'on' : ''} aria-pressed={v[k] === n} onClick={() => set(k, n)}>{n}</button>)}</div>
      <div className="sa-ends muted small"><span>1 · Very easy</span><span>10 · Max effort</span></div></fieldset>)}
    <fieldset className="sa-q"><legend>Note <span className="muted small">(optional)</span></legend>
      <textarea className="input" maxLength={1000} value={v.note} onChange={(e) => set('note', e.target.value)} aria-label={`Note for ${label}`} placeholder="How did you feel? Anything your coach should know?" /></fieldset>
    <div className="sa-send">
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : c ? 'Save changes' : 'Send check-in'}</button>
      {msg === 'saved' ? <span className="sa-ok">✓ Saved. You can change it for 3 days.</span>
        : msg === 'missing' ? <span className="sa-err">Pick an RPE for {kinds.filter(([k]) => v[k] == null).map(([, l]) => l.toLowerCase()).join(' and ')}.</span>
        : msg ? <span className="sa-err">{msg}</span> : null}
    </div>
  </form>;
}
