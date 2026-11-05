// Self-assessments (admins + coaches): players' game-by-game answers. Each player has one
// permanent link (/a/<token>); a coach sends it once and, after every game on the schedule, that
// game's questionnaire opens on it (PlayerAssess.jsx). Tabs: By game (every player's answers for
// one game, and who hasn't answered), By player (one player's season file) and Player links
// (copy each link, or all of them at once; a new link stops the old one working).
import { useEffect, useMemo, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, ourGames, todayISO } from '../lib/util.js';
import { QUESTIONS, openGames, opponentOf } from '../lib/selfAssess.js';
import { useRoster } from './Injury.jsx';
import PageHead from '../components/PageHead.jsx';
import Icon from '../components/Icon.jsx';

export const assessUrl = (token) => `${location.origin}/a/${token}`;
async function copy(H, text, done) {
  try { await navigator.clipboard.writeText(text); H.toast(done); } catch { window.prompt('Copy this:', text); }
}

export default function SelfAssess() {
  const H = useHub(); const t = H.team;
  const { roster } = useRoster();
  const [list, setList] = useState(null), [links, setLinks] = useState(null), [tab, setTab] = useState('game');
  const load = () => Promise.all([H.api.listSelfAssessments(t.id), H.api.listAssessLinks(t.id)]).then(([a, l]) => { setList(a); setLinks(l); })
    .catch((e) => { setList((x) => x || []); setLinks((x) => x || {}); H.toast('Could not load self-assessments: ' + e.message); });
  useEffect(() => { if (H.isCoach) load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!H.isCoach) return <><PageHead title="Self-assessments" /><section className="card"><p className="muted" style={{ margin: 0 }}>Self-assessments are only visible to coaches and admins.</p></section></>;
  if (!roster || !list || !links) return <><PageHead title="Self-assessments" /><div className="loading">Loading…</div></>;
  return <>
    <PageHead title="Self-assessments" actions={<div className="seg">{[['game', 'By game'], ['player', 'By player'], ['links', 'Player links']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>} />
    {tab === 'game' && <ByGame roster={roster} list={list} />}
    {tab === 'player' && <ByPlayer roster={roster} list={list} reload={load} />}
    {tab === 'links' && <Links roster={roster} links={links} reload={load} />}
  </>;
}

function ByGame({ roster, list }) {
  const H = useHub(); const t = H.team; const today = todayISO();
  const open = new Set(openGames(ourGames(H.tdata.league.games, t)).map((g) => g.id));
  // games played so far, plus answers kept for games since removed from the schedule
  const games = useMemo(() => {
    const out = ourGames(H.tdata.league.games, t).filter((g) => g.date <= today).map((g) => ({ key: g.id, date: g.date, time: g.time, opp: opponentOf(g, t) }));
    list.filter((a) => !a.game_id).forEach((a) => { const key = `x:${a.game_date}:${a.opponent}`; if (!out.some((g) => g.key === key)) out.push({ key, date: a.game_date, opp: a.opponent, removed: true }); });
    return out.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  }, [H.tdata.league.games, list]); // eslint-disable-line react-hooks/exhaustive-deps
  const [key, setKey] = useState(() => (games.find((g) => list.some((a) => a.game_id === g.key)) || games[0] || {}).key);
  const g = games.find((x) => x.key === key);
  if (!g) return <section className="card"><p className="muted" style={{ margin: 0 }}>No games played yet. After each game on the schedule, players' answers show up here.</p></section>;
  const rows = list.filter((a) => (g.removed ? !a.game_id && `x:${a.game_date}:${a.opponent}` === g.key : a.game_id === g.key));
  const by = Object.fromEntries(rows.map((a) => [a.player_id, a]));
  const missing = roster.filter((p) => !by[p.id]);
  const name = (id) => { const p = roster.find((x) => x.id === id); return p ? `${p.num ? '#' + p.num + ' ' : ''}${p.name}` : 'Former player'; };
  const avg = (k) => { const v = rows.map((a) => Number(a.answers[k])).filter(Boolean); return v.length ? (v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : '—'; };
  return <>
    <section className="card">
      <div className="card-head"><div><h2>{fmtDate(g.date, true)} · vs {g.opp}</h2>
        <span className="muted small">{g.removed ? 'This game is no longer on the schedule; the answers are kept.' : open.has(g.key) ? 'Open: players can still answer or change their answers.' : 'Closed: a later game has started.'}</span></div>
        <select className="select" style={{ width: 'auto' }} value={key} onChange={(e) => setKey(e.target.value)} aria-label="Game">
          {games.map((x) => { const n = list.filter((a) => (x.removed ? !a.game_id && `x:${a.game_date}:${a.opponent}` === x.key : a.game_id === x.key)).length;
            return <option key={x.key} value={x.key}>{fmtDate(x.date)} · vs {x.opp}{x.removed ? ' (removed)' : ''} · {n} answer{n === 1 ? '' : 's'}</option>; })}</select></div>
      <div className="sa-tiles">
        <div className="tile"><div className="tile-k">Answered</div><div className="tile-v">{rows.length} / {roster.length}</div></div>
        <div className="tile"><div className="tile-k">Overall (avg)</div><div className="tile-v">{avg('rating')}</div></div>
        <div className="tile"><div className="tile-k">Compete (avg)</div><div className="tile-v">{avg('compete')}</div></div>
        <div className="tile"><div className="tile-k">Had fun</div><div className="tile-v">{rows.filter((a) => a.answers.fun === 'Yes').length} / {rows.filter((a) => a.answers.fun).length}</div></div>
      </div>
      {missing.length > 0 && <p className="small" style={{ margin: 0 }}><b>Not answered yet:</b> <span className="muted">{missing.map((p) => `${p.num ? '#' + p.num + ' ' : ''}${p.name}`).join(', ')}</span></p>}
    </section>
    {rows.length > 0 && <section className="card"><AnswerTable rows={rows.sort((a, b) => name(a.player_id).localeCompare(name(b.player_id), undefined, { numeric: true }))} first={(a) => <b>{name(a.player_id)}</b>} head="Player" /></section>}
  </>;
}

/** Answers as a table, one row each; `first` renders the first column (player or game). */
export function AnswerTable({ rows, first, head, onDelete }) {
  return <div className="tbl-wrap"><table className="tbl sa-grid">
    <thead><tr><th>{head}</th>{QUESTIONS.map((q) => <th key={q.id} className={q.scale ? 'num' : ''}>{q.short}</th>)}{onDelete && <th />}</tr></thead>
    <tbody>{rows.map((a) => <tr key={a.id}><td>{first(a)}</td>{QUESTIONS.map((q) => <td key={q.id} className={q.scale ? 'num tnum' : ''}>{a.answers[q.id] || <span className="muted">—</span>}</td>)}
      {onDelete && <td><button className="icon-btn" aria-label="Delete this self-assessment" onClick={() => onDelete(a)}><Icon n="x" /></button></td>}</tr>)}</tbody>
  </table></div>;
}

/** One player's season file: every game they answered, newest first. */
export function PlayerFile({ p, list, reload }) {
  const H = useHub();
  const mine = list.filter((a) => a.player_id === p.id);
  const del = async (a) => {
    if (!(await H.confirm('Delete this self-assessment?', `${p.name}'s answers for ${fmtDate(a.game_date, true)} will be removed for good.`, 'Delete'))) return;
    try { await H.api.deleteSelfAssessment(a.id); H.toast('Deleted'); reload && reload(); } catch (e) { H.toast('Could not delete. ' + e.message); }
  };
  if (!mine.length) return <p className="muted small" style={{ margin: 0 }}>{p.name} hasn't answered a self-assessment yet.</p>;
  return <AnswerTable rows={mine} head="Game" onDelete={reload ? del : null} first={(a) => <><b>{fmtDate(a.game_date)}</b><div className="muted small">vs {a.opponent}{!a.game_id ? ' (removed)' : ''}</div></>} />;
}

function ByPlayer({ roster, list, reload }) {
  const [pid, setPid] = useState(() => (roster.find((p) => list.some((a) => a.player_id === p.id)) || roster[0] || {}).id);
  const p = roster.find((x) => x.id === pid);
  if (!p) return <section className="card"><p className="muted" style={{ margin: 0 }}>Add players in the Roster tab first.</p></section>;
  const n = list.filter((a) => a.player_id === p.id).length;
  return <section className="card">
    <div className="card-head"><div><h2>{p.num ? `#${p.num} ` : ''}{p.name}</h2><span className="muted small">{n} game{n === 1 ? '' : 's'} answered</span></div>
      <select className="select" style={{ width: 'auto' }} value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Player">
        {roster.map((x) => { const c = list.filter((a) => a.player_id === x.id).length; return <option key={x.id} value={x.id}>{x.num ? `#${x.num} ` : ''}{x.name} · {c}</option>; })}</select></div>
    <PlayerFile p={p} list={list} reload={reload} />
  </section>;
}

function Links({ roster, links, reload }) {
  const H = useHub();
  const all = roster.filter((p) => links[p.id]).map((p) => `${p.num ? '#' + p.num + ' ' : ''}${p.name}: ${assessUrl(links[p.id])}`).join('\n');
  const reset = async (p) => {
    if (!(await H.confirm(`New link for ${p.name}?`, 'Their current link stops working. Send them the new one. Answers already given are kept.', 'Make new link'))) return;
    try { await H.api.resetAssessLink(p.id); await reload(); H.toast(`New link ready for ${p.name}`); } catch (e) { H.toast('Could not make a new link. ' + e.message); }
  };
  return <section className="card sa-links">
    <div className="card-head"><div><h2>Player links</h2><span className="muted small">Send each player their own link once (text, email or your team chat). After every game on the schedule, that game's questions open on it automatically, with their name and number filled in. Players can change answers until a game on a later date starts.</span></div>
      <button className="btn primary" disabled={!all} onClick={() => copy(H, all, `Copied ${roster.length} links`)}><Icon n="clipboard" /> Copy all links</button></div>
    {!roster.length ? <p className="muted small" style={{ margin: 0 }}>Add players in the Roster tab first.</p>
      : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Player</th><th>Link</th><th /></tr></thead>
        <tbody>{roster.map((p) => <tr key={p.id}><td><b>{p.num ? `#${p.num} ` : ''}{p.name}</b></td>
          <td className="muted small sa-url" title={links[p.id] ? assessUrl(links[p.id]) : ''}>{links[p.id] ? assessUrl(links[p.id]) : 'No link yet'}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{links[p.id] && <button className="btn sm" onClick={() => copy(H, assessUrl(links[p.id]), `Link copied for ${p.name}`)}>Copy link</button>}
            <button className="btn sm ghost" onClick={() => reset(p)}>New link</button></td></tr>)}</tbody></table></div>}
  </section>;
}
