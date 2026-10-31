import { useEffect, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, fmtTime, ago, daysUntil, todayISO, iso, fromISO, MON, MONTHS, DOW, hasScore, gameView, ourGames, isUsT, leagueLabel, uid, hostOf } from '../lib/util.js';
import Icon from '../components/Icon.jsx';
import { GameDialog, GameForm, EventForm, EventView, LeagueUpdate, ImportIcs, addCandidate } from '../components/Dialogs.jsx';
import PageHead from '../components/PageHead.jsx';
import Table from '../components/Table.jsx';

export default function Home() {
  const H = useHub(); const t = H.team;
  const games = ourGames(H.tdata.league.games, t), today = todayISO();
  const next = games.find((g) => g.date >= today && !hasScore(g));
  const last = [...games].reverse().find((g) => hasScore(g));
  let W = 0, L = 0, T = 0, PF = 0, PA = 0; games.forEach((g) => { const v = gameView(g, t); if (!v.res) return; if (v.res === 'w') W++; else if (v.res === 'l') L++; else T++; PF += v.us; PA += v.them; });
  const nv = next && gameView(next, t), lv = last && gameView(last, t);
  const dn = next ? daysUntil(next.date) : 0;
  const openGame = (g) => H.openDialog((c) => <GameDialog g={g} close={c} />);
  const acts = H.isCoach && <>
    <button className="btn" onClick={() => H.openDialog((c) => <EventForm close={c} />)}><Icon n="plus" /> Event</button>
    <button className="btn" onClick={() => H.openDialog((c) => <GameForm close={c} />)}><Icon n="plus" /> Game</button>
    <button className="btn primary" onClick={() => H.openDialog((c) => <LeagueUpdate close={c} />)}><Icon n="refresh" /> Update from {leagueLabel(t)}</button></>;
  return <>
    <PageHead title="Home" actions={acts} />
    <section className="strip">
      <div className={`tile hero ${next ? 'click' : ''}`} onClick={next ? () => openGame(next) : undefined}>
        <div className="tile-k">Next game {next && <span className="countdown">{dn === 0 ? 'Today' : dn === 1 ? 'Tomorrow' : 'In ' + dn + ' days'}</span>}</div>
        <div className="tile-v">{next ? `${nv.home ? 'vs' : '@'} ${nv.opp}` : 'No game scheduled'}</div>
        <div className="tile-s">{next ? `${fmtDate(next.date)}${next.time ? ' · ' + fmtTime(next.time) : ''}${next.venue ? ' · ' + next.venue : ''}` : H.isCoach ? 'Add a game or paste the league schedule.' : 'Your coach will add the schedule.'}</div>
      </div>
      <div className={`tile ${last ? 'click' : ''}`} onClick={last ? () => openGame(last) : undefined}>
        <div className="tile-k">Last result</div>
        <div className="tile-v tnum">{last ? <>{lv.us}–{lv.them} <span className={`pill ${lv.res}`}>{lv.res.toUpperCase()}</span></> : '—'}</div>
        <div className="tile-s">{last ? `${lv.home ? 'vs' : '@'} ${lv.opp} · ${fmtDate(last.date)}` : 'No results yet'}</div>
      </div>
      <div className="tile">
        <div className="tile-k">Season record</div>
        <div className="tile-v tnum">{W}–{L}{T ? '–' + T : ''}</div>
        <div className="tile-s tnum">{W + L + T ? `For ${PF} · Against ${PA} · Diff ${PF - PA > 0 ? '+' : ''}${PF - PA}` : 'W–L from league results'}</div>
      </div>
    </section>
    <div className={`home-grid ${H.isCoach ? '' : 'player'}`}>
      <section className="card a-cal"><Calendar games={games} openGame={openGame} /></section>
      <section className="card a-notif"><Notifications /></section>
      {H.isCoach && <section className="card a-todo"><Todo key={H.teamId + (H.tdata._loading ? ':loading' : '')} /></section>}
      <section className="card a-fix"><Fixtures games={games} openGame={openGame} /></section>
      <section className="card a-stand"><Standings /></section>
      {H.isCoach && <section className="card" style={{ gridColumn: '1 / -1' }}><LeagueSync /></section>}
    </div>
  </>;
}

/* ---------- calendar ---------- */
function Calendar({ games, openGame }) {
  const H = useHub(); const t = H.team;
  const [cal, setCal] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth(), sel: todayISO() }; });
  useEffect(() => { const d = new Date(); setCal({ y: d.getFullYear(), m: d.getMonth(), sel: todayISO() }); }, [H.teamId]);
  const map = {}; const add = (d, x) => { (map[d] = map[d] || []).push(x); };
  games.forEach((g) => { const v = gameView(g, t); add(g.date, { kind: 'game', time: g.time || '', title: `${v.home ? 'vs' : '@'} ${v.opp}` + (v.res ? ` (${v.us}–${v.them})` : ''), open: () => openGame(g) }); });
  H.tdata.events.forEach((e) => add(e.date, { kind: e.kind || 'event', time: e.time || '', title: e.title, open: () => H.openDialog((c) => (H.isCoach ? <EventForm e={e} close={c} /> : <EventView e={e} close={c} />)) }));
  Object.values(map).forEach((a) => a.sort((x, y) => (x.time || '99').localeCompare(y.time || '99')));
  const { y, m, sel } = cal, today = todayISO();
  const first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  const move = (n) => { let mm = m + n, yy = y; if (mm < 0) { mm = 11; yy--; } if (mm > 11) { mm = 0; yy++; } setCal({ ...cal, y: yy, m: mm }); };
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); const k = iso(d); const its = map[k] || [];
    cells.push(<button key={k} className={`cal-cell ${d.getMonth() !== m ? 'out' : ''} ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''}`} onClick={() => setCal({ y: d.getFullYear(), m: d.getMonth(), sel: k })} aria-label={`${fmtDate(k, true)}${its.length ? ', ' + its.length + ' items' : ''}`}>
      <span className="cal-num">{d.getDate()}</span>
      {its.slice(0, 2).map((x, j) => <span key={j} className={`chip ${x.kind}`}>{x.title}</span>)}{its.length > 2 && <span className="chip more">+{its.length - 2} more</span>}
      <span className="dots">{its.slice(0, 3).map((x, j) => <i key={j} className={x.kind} />)}</span>
    </button>);
  }
  const day = map[sel] || [];
  return <>
    <div className="card-head"><h2>Calendar</h2>
      <div className="cal-nav"><button className="icon-btn" onClick={() => move(-1)} aria-label="Previous month"><Icon n="chevl" /></button>
        <span className="cal-title">{MONTHS[m]} {y}</span>
        <button className="icon-btn" onClick={() => move(1)} aria-label="Next month"><Icon n="chev" /></button>
        <button className="btn sm ghost" onClick={() => { const d = new Date(); setCal({ y: d.getFullYear(), m: d.getMonth(), sel: todayISO() }); }}>Today</button>
        {H.isCoach && <button className="btn sm" onClick={() => H.openDialog((c) => <ImportIcs close={c} />)} title="Import a calendar file (.ics)"><Icon n="plus" /> Import .ics</button>}</div></div>
    <div className="cal-dow">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
    <div className="cal-grid">{cells}</div>
    <div className="legend"><span><i style={{ background: 'var(--accent)' }} />Game</span><span><i style={{ background: 'var(--good)' }} />Practice</span><span><i style={{ background: 'var(--muted)' }} />Event</span></div>
    <div className="agenda"><div className="agenda-head"><b>{fmtDate(sel, true)}</b>{H.isCoach && <button className="btn sm" onClick={() => H.openDialog((c) => <EventForm date={sel} close={c} />)}><Icon n="plus" /> Add</button>}</div>
      {day.length ? day.map((x, i) => <button key={i} className="ag-item" onClick={x.open}><span className={`ag-bar ${x.kind}`} /><span className="ag-time">{x.time ? fmtTime(x.time) : 'All day'}</span><span className="ag-title">{x.title}</span></button>)
        : <div className="muted small">Nothing on this day.</div>}
    </div>
  </>;
}

/* ---------- notifications ---------- */
function Notifications() {
  const H = useHub(); const n = H.tdata.notifs, unread = n.filter((x) => !x.read).length;
  const mark = (ids) => H.save((api) => api.markNotifs(H.teamId, ids), { optimistic: (d) => ({ ...d, notifs: d.notifs.map((x) => (!ids || ids.includes(x.id) ? { ...x, read: true } : x)) }) });
  const clear = async () => { if (await H.confirm('Clear all notifications?', 'Every notification for this team will be removed.', 'Clear all')) H.save((api) => api.clearNotifs(H.teamId), { optimistic: (d) => ({ ...d, notifs: [] }) }); };
  return <>
    <div className="card-head"><h2>Notifications {unread > 0 && <span className="count">{unread}</span>}</h2>
      {n.length > 0 && H.isCoach && <div className="acts"><button className="btn sm ghost" onClick={() => mark(null)} disabled={!unread}>Read all</button><button className="btn sm ghost" onClick={clear}>Clear all</button></div>}</div>
    {n.length ? <div className="notifs">{n.map((x) => <button key={x.id} className={`notif ${x.read ? '' : 'unread'}`} onClick={() => H.isCoach && !x.read && mark([x.id])}><span className="ndot" /><span><div className="ntext">{x.text}</div><div className="ntime">{ago(x.ts)}</div></span></button>)}</div>
      : <div className="empty">You're all caught up. League updates, new games and results show up here.</div>}
  </>;
}

/* ---------- notes / to-do (coach only) ---------- */
function Todo() {
  const H = useHub(); const c = H.tdata.coach || { notes: '', todos: [] }, todos = c.todos || [];
  const [input, setInput] = useState(''); const [notes, setNotes] = useState(c.notes || '');
  const timer = useRef();
  const put = (next) => H.save((api) => api.saveCoach(H.teamId, next), { optimistic: (d) => ({ ...d, coach: next }) });
  const open = todos.filter((x) => !x.done).length;
  return <>
    <div className="card-head"><h2>Notes & to-do {open > 0 && <span className="count">{open}</span>}</h2><span className="pill">Coach only</span></div>
    <form className="todo-add" onSubmit={(e) => { e.preventDefault(); const v = input.trim(); if (!v) return; setInput(''); put({ ...c, notes, todos: [...todos, { id: uid(), text: v, done: false }] }); }}>
      <input className="input" placeholder="Add a to-do" autoComplete="off" aria-label="New to-do" value={input} onChange={(e) => setInput(e.target.value)} /><button className="btn" type="submit"><Icon n="plus" /></button></form>
    {todos.length > 0 && <ul className="todos">{todos.map((x) => <li key={x.id} className={x.done ? 'done' : ''}>
      <input type="checkbox" className="cb" checked={!!x.done} onChange={(e) => put({ ...c, notes, todos: todos.map((y) => (y.id === x.id ? { ...y, done: e.target.checked } : y)) })} aria-label="Done" />
      <span className="tt">{x.text}</span>
      <button className="icon-btn" onClick={() => put({ ...c, notes, todos: todos.filter((y) => y.id !== x.id) })} aria-label="Delete"><Icon n="x" /></button></li>)}</ul>}
    <label className="field"><span>Notes</span><textarea className="input" placeholder="Quick notes for this team…" value={notes}
      onChange={(e) => { const v = e.target.value; setNotes(v); clearTimeout(timer.current); timer.current = setTimeout(() => put({ ...c, todos, notes: v }), 700); }} /></label>
  </>;
}

/* ---------- fixtures ---------- */
function Fixtures({ games, openGame }) {
  const H = useHub(); const t = H.team, today = todayISO();
  const up = games.filter((g) => !hasScore(g) && g.date >= today), res = games.filter((g) => hasScore(g)).reverse();
  const [tabSel, setTab] = useState(null);
  const tab = tabSel || (up.length ? 'up' : 'res'), list = tab === 'up' ? up : res;
  return <>
    <div className="card-head"><h2>Fixtures & results</h2>
      <div className="seg" role="tablist"><button className={tab === 'up' ? 'on' : ''} onClick={() => setTab('up')}>Upcoming {up.length ? `(${up.length})` : ''}</button><button className={tab === 'res' ? 'on' : ''} onClick={() => setTab('res')}>Results {res.length ? `(${res.length})` : ''}</button></div></div>
    {list.length ? <><div className="fx-list">{list.slice(0, 8).map((g) => { const v = gameView(g, t), d = fromISO(g.date); return <button key={g.id} className="fx" onClick={() => openGame(g)}>
      <span className="fx-date"><small>{MON[d.getMonth()]}</small><b>{d.getDate()}</b><small>{DOW[d.getDay()]}</small></span>
      <span style={{ minWidth: 0 }}><div className="fx-opp">{v.home ? 'vs' : '@'} {v.opp} {g.sync_flag === 'changed' && <span className="pill new">Changed</span>}</div><div className="fx-sub">{[g.time ? fmtTime(g.time) : '', g.venue || '', g.round || ''].filter(Boolean).join(' · ') || (v.home ? 'Home' : 'Away')}</div></span>
      <span className="fx-score">{v.res ? <>{v.us}–{v.them}<span className={`pill ${v.res}`}>{v.res.toUpperCase()}</span></> : <span className="pill">{v.home ? 'Home' : 'Away'}</span>}</span>
    </button>; })}</div>{list.length > 8 && <div className="hint">Showing 8 of {list.length}. The full schedule will live in League.</div>}</>
      : <div className="empty">{tab === 'up' ? 'No upcoming games.' : 'No results yet.'}{H.isCoach && <><span>Paste the schedule from <b>{leagueLabel(t)}</b> or add a game by hand.</span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn sm primary" onClick={() => H.openDialog((c) => <LeagueUpdate close={c} />)}><Icon n="refresh" /> Paste league page</button><button className="btn sm" onClick={() => H.openDialog((c) => <GameForm close={c} />)}><Icon n="plus" /> Add game</button></span></>}</div>}
  </>;
}

/* ---------- standings ---------- */
function Standings() {
  const H = useHub(); const t = H.team, lg = H.tdata.league, groups = lg.groups || [];
  const head = <div className="card-head"><h2>League standings</h2>{H.isCoach && <div className="acts"><button className="btn sm" onClick={() => H.openDialog((c) => <LeagueUpdate close={c} />)}><Icon n="refresh" /> Update from {leagueLabel(t)}</button></div>}</div>;
  if (!groups.length) return <>{head}<div className="empty">No standings yet.{H.isCoach && <span>Open <b>{leagueLabel(t)}</b>, copy the standings page and paste it here. No typing needed.</span>}</div></>;
  return <>{head}
    {groups.map((g, gi) => {
      const cols = [{ k: '#', label: '#', num: true }, { k: 'Team', label: 'Team', always: true, cls: 'team' }, ...g.cols.map((c) => ({ k: c, label: c, num: true }))];
      const rows = g.rows.map((r, i) => ({ '#': r.rank || i + 1, Team: r.team, ...r.v }));
      return <div key={gi}>{g.name && groups.length > 1 && <div className="grp-name">{g.name}</div>}<Table id="standings" cols={cols} rows={rows} rowClass={(r) => (isUsT(r.Team, t) ? 'us' : '')} /></div>;
    })}
    <div className="hint">{lg.updatedAt ? 'Updated ' + ago(lg.updatedAt) + ' · ' : ''}Right-click a column title (long-press on phone) to hide or show columns.</div>
  </>;
}

/* ---------- league sync (coach) ---------- */
function LeagueSync() {
  const H = useHub(); const t = H.team; const cands = H.tdata.candidates || [], run = H.tdata.lastRun;
  const changed = H.tdata.league.games.filter((g) => g.sync_flag === 'changed');
  const [busy, setBusy] = useState(false);
  // matches what supabase/functions/league-sync can read
  const readable = !!(t.syncUrl || /(^|\.)rseq\.ca$/.test(hostOf(t.leagueUrl)));
  const syncNow = async () => {
    setBusy(true);
    try { const r = await H.api.syncNow(H.teamId); const x = r && r.results && r.results[0]; H.toast(x ? x.message : 'Sync finished'); await H.reloadTeam(); }
    catch (e) { H.toast('Sync failed: ' + e.message); }
    finally { setBusy(false); }
  };
  const dismiss = (c) => H.save((api) => api.resolveCandidate(c.id, 'dismissed'), { optimistic: (d) => ({ ...d, candidates: d.candidates.filter((x) => x.id !== c.id) }) });
  return <>
    <div className="card-head"><h2>League sync {cands.length + changed.length > 0 && <span className="count">{cands.length + changed.length}</span>}</h2>
      <div className="acts"><button className="btn sm" onClick={syncNow} disabled={busy}><Icon n="refresh" /> {busy ? 'Syncing…' : 'Sync now'}</button></div></div>
    {readable ? <p className="muted small" style={{ margin: 0 }}>Every morning TeamHub reads {t.syncUrl ? 'the calendar feed' : leagueLabel(t)} and updates times, venues, dates and scores for games already on this calendar. Games the league lists that aren't on the calendar wait here for you; nothing is added automatically.</p>
      : <p className="small" style={{ margin: 0, color: 'var(--warn)' }}>{t.leagueUrl ? `${leagueLabel(t)}'s website can't be read automatically` : 'No league website set'}. Add a calendar feed (.ics) link in Team settings to turn on the daily sync, or keep using “Update from {leagueLabel(t)}”.</p>}
    {run && <div className={`small ${run.ok ? 'muted' : ''}`} style={run.ok ? undefined : { color: 'var(--warn)' }}>Last run {ago(run.ts)}: {run.message}</div>}
    {changed.map((g) => { const v = gameView(g, t); return <div key={g.id} className="sync-item"><span className="pill new">Changed</span><div><b>{fmtDate(g.date)} · {v.home ? 'vs' : '@'} {v.opp}</b>
      <div className="small muted">{(g.sync_changes || []).map((c) => `${c.field}: ${c.from ?? '—'} → ${c.to}`).join(' · ')}</div></div>
      <button className="btn sm ghost" onClick={() => H.save((api) => api.clearGameFlag(g.id), { optimistic: (d) => ({ ...d, league: { ...d.league, games: d.league.games.map((x) => (x.id === g.id ? { ...x, sync_flag: null } : x)) } }) })}>Seen</button></div>; })}
    {cands.map((c) => { const g = c.game; const home = isUsT(g.home, t); return <div key={c.id} className="sync-item"><span className="pill">New</span><div><b>{fmtDate(g.date)}{g.time ? ' · ' + fmtTime(g.time) : ''} · {home ? 'vs ' + g.away : '@ ' + g.home}</b>
      <div className="small muted">{[g.venue, g.round].filter(Boolean).join(' · ') || 'On the league schedule, not on this calendar'}</div></div>
      <button className="btn sm" onClick={() => addCandidate(H, c)}>Add</button><button className="btn sm ghost" onClick={() => dismiss(c)}>Dismiss</button></div>; })}
    {!changed.length && !cands.length && <div className="muted small">Nothing to review.</div>}
  </>;
}
