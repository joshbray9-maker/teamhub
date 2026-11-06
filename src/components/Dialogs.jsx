// Game, event, league-paste and .ics dialogs (ported from the TeamHub artifact).
import { useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, fmtTime, todayISO, hasScore, isUsT, schoolName, leagueLabel, standingsUrl } from '../lib/util.js';
import { parseLeague, gameKey, docToText, parseIcs, planIcs, cleanTeam, findSameGame } from '../../supabase/functions/_shared/leagueParse.js';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import TeamForm from './TeamForm.jsx';

const v = (e) => e.target.value;
async function notify(H, text) {
  const n = await H.api.addNotif(H.teamId, text);
  H.setTdata((d) => ({ ...d, notifs: [n, ...d.notifs].slice(0, 60) }));
}

/* ---------- game ---------- */
export function GameDialog({ g, close }) {
  const H = useHub(); const t = H.team;
  const [tab, setTab] = useState('sum');
  const has = hasScore(g);
  const del = async () => {
    close();
    if (!(await H.confirm('Delete game?', `${g.home} vs ${g.away} on ${fmtDate(g.date)} will be removed.`))) return;
    H.save((api) => api.deleteGame(g.id), { optimistic: (d) => ({ ...d, league: { ...d.league, games: d.league.games.filter((x) => x.id !== g.id) } }) });
  };
  const src = g.source === 'paste' ? `From ${leagueLabel(t)} page` : g.source === 'ics' ? 'Calendar file' : g.source === 'league' ? 'League website' : g.source === 's&c' ? 'S&C master schedule' : 'Added by hand';
  return <Modal title={has ? 'Result' : 'Fixture'} onClose={close}
    actions={H.isCoach ? <><button className="btn danger" onClick={del}><Icon n="trash" /> Delete</button><span className="spacer" /><button className="btn" onClick={() => { close(); H.openDialog((c) => <GameForm g={g} close={c} />); }}><Icon n="edit" /> Edit</button><button className="btn primary" onClick={close}>Done</button></> : <button className="btn primary" onClick={close}>Done</button>}>
    <div className="score-head">
      <div className={`sh-team ${isUsT(g.home, t) ? 'us' : ''}`}><span className="sh-tag">Home</span><span className="sh-name">{g.home}</span></div>
      <div className="sh-score tnum">{has ? <>{g.hs}<span>–</span>{g.as}</> : <span>vs</span>}</div>
      <div className={`sh-team right ${isUsT(g.away, t) ? 'us' : ''}`}><span className="sh-tag">Away</span><span className="sh-name">{g.away}</span></div>
    </div>
    {g.sync_flag === 'changed' && <div className="sync-item"><span className="pill new">Changed</span><div className="small">
      League sync updated: {(g.sync_changes || []).map((c) => `${c.field} ${c.from ?? '—'} → ${c.to}`).join(', ')}
      {H.isCoach && <div><button className="btn sm ghost" onClick={() => { close(); H.save((api) => api.clearGameFlag(g.id), { optimistic: (d) => ({ ...d, league: { ...d.league, games: d.league.games.map((x) => (x.id === g.id ? { ...x, sync_flag: null } : x)) } }) }); }}>Mark as seen</button></div>}</div></div>}
    <div className="tabs" role="tablist"><button className={tab === 'sum' ? 'on' : ''} onClick={() => setTab('sum')}>Summary</button><button className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>Game Stats</button></div>
    {tab === 'sum' ? <dl className="kv">
      <dt>Date</dt><dd>{fmtDate(g.date, true)}</dd>
      <dt>Time</dt><dd>{g.time ? fmtTime(g.time) : '—'}</dd>
      <dt>Venue</dt><dd>{g.venue || '—'}</dd>
      <dt>Type</dt><dd>{g.round || 'League'}</dd>
      <dt>Source</dt><dd>{src}</dd>
    </dl> : <div className="empty"><b>No game stats yet.</b>Pasting the game page from {leagueLabel(t)} will fill this tab with the team comparison and a tab for each team's players. That arrives with the League menu.</div>}
  </Modal>;
}

export function GameForm({ g, close, date }) {
  const H = useHub(); const t = H.team; const us = schoolName(t);
  const home0 = g ? isUsT(g.home, t) : true;
  const [f, setF] = useState({ opp: g ? (home0 ? g.away : g.home) : '', ha: home0 ? 'h' : 'a', date: g ? g.date : date || todayISO(), time: g ? g.time : '', venue: g ? g.venue || '' : '', round: g ? g.round || '' : '', us: g && hasScore(g) ? String(home0 ? g.hs : g.as) : '', them: g && hasScore(g) ? String(home0 ? g.as : g.hs) : '' });
  const set = (k) => (e) => setF({ ...f, [k]: v(e) });
  const submit = async () => {
    const opp = f.opp.trim(); if (!opp || !f.date) { H.toast('Add an opponent and a date.'); return; }
    const Hm = f.ha === 'h', sc = f.us !== '' && f.them !== '';
    const ng = { id: g ? g.id : undefined, date: f.date, time: f.time, venue: f.venue.trim(), round: f.round.trim(), home: Hm ? us : opp, away: Hm ? opp : us, hs: sc ? +(Hm ? f.us : f.them) : null, as: sc ? +(Hm ? f.them : f.us) : null, source: g ? g.source || 'manual' : 'manual', ext_id: g ? g.ext_id : null };
    close();
    await H.save((api) => api.saveGames(H.teamId, [ng]), { reload: true });
    if (!g) notify(H, `Game added: ${Hm ? 'vs' : '@'} ${opp} on ${fmtDate(ng.date)}`);
    else if (sc && !hasScore(g)) notify(H, `Result: ${Hm ? 'vs' : '@'} ${opp} ${f.us}–${f.them}`);
  };
  return <Modal title={g ? 'Edit game' : 'Add game'} onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></>}>
    <div className="row2">
      <label className="field"><span>Opponent</span><input className="input" value={f.opp} onChange={set('opp')} placeholder="School name" /></label>
      <label className="field"><span>Home or away</span><select className="select" value={f.ha} onChange={set('ha')}><option value="h">Home</option><option value="a">Away</option></select></label>
    </div>
    <div className="row2">
      <label className="field"><span>Date</span><input className="input" type="date" value={f.date} onChange={set('date')} /></label>
      <label className="field"><span>Time</span><input className="input" type="time" value={f.time} onChange={set('time')} /></label>
    </div>
    <div className="row2">
      <label className="field"><span>Venue</span><input className="input" value={f.venue} onChange={set('venue')} /></label>
      <label className="field"><span>Type</span><input className="input" list="gfRounds" value={f.round} onChange={set('round')} placeholder="League" /><datalist id="gfRounds"><option>League</option><option>Exhibition</option><option>Quarterfinal</option><option>Semifinal</option><option>Final</option></datalist></label>
    </div>
    <div className="row2">
      <label className="field"><span>Our score</span><input className="input" type="number" min="0" value={f.us} onChange={set('us')} /></label>
      <label className="field"><span>Their score</span><input className="input" type="number" min="0" value={f.them} onChange={set('them')} /></label>
    </div>
    <div className="hint">Leave scores empty for an upcoming game. Your team is listed as "{us}" (change it in Team settings).</div>
  </Modal>;
}

/* ---------- events ---------- */
export function EventForm({ e, date, close }) {
  const H = useHub();
  const [f, setF] = useState({ title: e ? e.title : '', date: e ? e.date : date || todayISO(), time: e ? e.time : '', kind: e ? e.kind : 'event', location: e ? e.location || '' : '' });
  const set = (k) => (ev) => setF({ ...f, [k]: v(ev) });
  const submit = () => {
    if (!f.title.trim() || !f.date) { H.toast('Add a title and a date.'); return; }
    close(); H.save((api) => api.saveEvents(H.teamId, [{ ...f, title: f.title.trim(), id: e ? e.id : undefined, ext_id: e ? e.ext_id : null }]), { reload: true });
  };
  const del = async () => {
    close();
    if (await H.confirm('Delete event?', `"${e.title}" will be removed from the calendar.`)) H.save((api) => api.deleteEvent(e.id), { optimistic: (d) => ({ ...d, events: d.events.filter((x) => x.id !== e.id) }) });
  };
  return <Modal title={e ? 'Edit event' : 'Add event'} onClose={close}
    actions={<>{e && <><button className="btn danger" onClick={del}><Icon n="trash" /> Delete</button><span className="spacer" /></>}<button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></>}>
    <label className="field"><span>Title</span><input className="input" value={f.title} onChange={set('title')} placeholder="Team meeting" /></label>
    <div className="row3">
      <label className="field"><span>Date</span><input className="input" type="date" value={f.date} onChange={set('date')} /></label>
      <label className="field"><span>Time</span><input className="input" type="time" value={f.time} onChange={set('time')} /></label>
      <label className="field"><span>Type</span><select className="select" value={f.kind} onChange={set('kind')}><option value="event">Event</option><option value="practice">Practice</option></select></label>
    </div>
    <label className="field"><span>Location</span><input className="input" value={f.location} onChange={set('location')} /></label>
  </Modal>;
}
export function EventView({ e, close }) {
  return <Modal title={e.title} onClose={close} actions={<button className="btn primary" onClick={close}>Done</button>}>
    <dl className="kv"><dt>Date</dt><dd>{fmtDate(e.date, true)}</dd><dt>Time</dt><dd>{e.time ? fmtTime(e.time) : 'All day'}</dd><dt>Location</dt><dd>{e.location || '—'}</dd></dl>
  </Modal>;
}

/* ---------- league paste ---------- */
export function LeagueUpdate({ close }) {
  const H = useHub(); const t = H.team; const url = t.leagueUrl, stUrl = standingsUrl(t);
  const [text, setText] = useState('');
  const parsed = text.trim() ? parseLeague(text) : null;
  const ours = parsed ? parsed.games.filter((g) => isUsT(g.home, t) || isUsT(g.away, t)) : [];
  const found = parsed && (parsed.groups.length || parsed.games.length);
  const onPaste = (e) => { const html = e.clipboardData && e.clipboardData.getData('text/html'); if (html) { e.preventDefault(); setText(docToText(new DOMParser().parseFromString(html, 'text/html'))); } };
  const apply = async () => {
    // merge: update matching games (score, missing details), add the rest
    const all = H.tdata.league.games, byKey = new Map(all.map((g) => [gameKey(g), g])), used = new Set();
    const rows = []; let added = 0, scored = 0;
    parsed.games.forEach((p) => {
      // the same game spelled differently ("Selwyn House" / "Selwyn House School", home and away swapped) is not added twice
      const ex = byKey.get(gameKey(p)) || findSameGame(all, p, t, parsed.games, used);
      if (ex) {
        if (ex.id) used.add(ex.id);
        const n = { ...ex }; let ch = false;
        const flip = isUsT(ex.home, t) !== isUsT(p.home, t), hs = flip ? p.as : p.hs, as = flip ? p.hs : p.as; // keep the calendar's home / away
        if (p.hs !== null && (ex.hs !== hs || ex.as !== as)) { n.hs = hs; n.as = as; scored++; ch = true; }
        ['time', 'venue', 'round'].forEach((k) => { if (p[k] && !ex[k]) { n[k] = p[k]; ch = true; } });
        if (ch) rows.push(n);
      } else { rows.push({ ...p, source: 'paste' }); byKey.set(gameKey(p), p); added++; if (p.hs !== null) scored++; }
    });
    close();
    await H.save(async (api) => { if (parsed.groups.length) await api.saveStandings(H.teamId, parsed.groups); if (rows.length) await api.saveGames(H.teamId, rows); }, { reload: true });
    const bits = []; if (parsed.groups.length) bits.push('standings'); if (added) bits.push(`${added} new game${added > 1 ? 's' : ''}`); if (scored) bits.push(`${scored} score${scored > 1 ? 's' : ''}`);
    notify(H, `League updated from ${leagueLabel(t)}: ${bits.join(', ') || 'no changes'}`);
    H.toast('League data updated');
  };
  return <Modal title={`Update from ${leagueLabel(t)}`} wide onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!found} onClick={apply}>Apply</button></>}>
    <ol className="steps">
      <li>{url ? <>Open <a href={url} target="_blank" rel="noopener noreferrer">{stUrl ? `${leagueLabel(t)} schedule` : leagueLabel(t)} <Icon n="ext" /></a>{stUrl && <> or <a href={stUrl} target="_blank" rel="noopener noreferrer">{leagueLabel(t)} standings <Icon n="ext" /></a></>}</> : <>Open your league website (add the link in <a href="#" onClick={(e) => { e.preventDefault(); close(); H.openDialog((c) => <TeamForm t={t} close={c} />); }}>Team settings</a> for a one-tap button)</>}.</li>
      <li>Select the whole standings or schedule page (Ctrl/Cmd + A) and copy it.</li>
      <li>Paste below. You'll see what was found before anything changes.</li></ol>
    <textarea className="input" rows="7" placeholder="Paste the league page here" value={text} onChange={(e) => setText(v(e))} onPaste={onPaste} />
    <div className="preview">
      {!parsed ? <span className="muted">Waiting for a paste…</span> : found ? <>
        <b>Found</b><ul>
          {parsed.groups.length > 0 && <li>Standings: {parsed.groups.length} table{parsed.groups.length > 1 ? 's' : ''}, {parsed.groups.reduce((n, g) => n + g.rows.length, 0)} teams ({parsed.groups[0].cols.join(', ')})</li>}
          {parsed.games.length > 0 && <li>Games: {parsed.games.length} ({parsed.games.filter((g) => g.hs !== null).length} with scores), {ours.length} involving {schoolName(t)}</li>}
        </ul>
        {ours.slice(0, 5).map((g, i) => <div key={i} className="small">{fmtDate(g.date)} · {g.home} {g.hs !== null ? `${g.hs}–${g.as}` : 'vs'} {g.away}</div>)}
        {parsed.games.length > 0 && !ours.length && <div className="small" style={{ color: 'var(--warn)' }}>None of these games matched "{schoolName(t)}". Check "Name in league tables" in Team settings matches the league's spelling.</div>}
      </> : <span style={{ color: 'var(--warn)' }}>Couldn't find standings or games in that text. Try copying the whole page, including the table headers.</span>}
    </div>
  </Modal>;
}

/* ---------- .ics import ---------- */
export function ImportIcs({ close }) {
  const H = useHub(); const t = H.team;
  const [plan, setPlan] = useState(null); const [err, setErr] = useState('');
  const onFile = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { setPlan(planIcs(parseIcs(await f.text()), schoolName(t))); setErr(''); } catch { setErr('Could not read that file.'); setPlan(null); }
  };
  const n = plan ? plan.games.length + plan.events.length : 0;
  const apply = async () => {
    const games = H.tdata.league.games, byKey = new Map(games.map((g) => [gameKey(g), g]));
    let ng = 0;
    const gRows = plan.games.map((g) => {
      const ex = games.find((x) => x.ext_id === g.ext_id) || byKey.get(gameKey(g));
      if (ex) return { ...ex, date: g.date, time: g.time || ex.time, venue: g.venue || ex.venue, ext_id: g.ext_id };
      ng++; return g;
    });
    const eRows = plan.events.map((x) => { const ex = H.tdata.events.find((y) => y.ext_id === x.ext_id); return ex ? { ...ex, ...x, id: ex.id } : x; });
    close();
    await H.save(async (api) => { if (gRows.length) await api.saveGames(H.teamId, gRows); if (eRows.length) await api.saveEvents(H.teamId, eRows); }, { reload: true });
    notify(H, `Calendar imported: ${plan.games.length} games${ng < plan.games.length ? ' (' + ng + ' new)' : ''}, ${plan.events.length} events`);
    H.toast('Calendar imported');
  };
  const all = plan ? [...plan.games.map((g) => ({ d: g.date, t: g.time, s: isUsT(g.home, t) ? 'vs ' + g.away : isUsT(g.away, t) ? '@ ' + g.home : g.away + ' @ ' + g.home })), ...plan.events.map((x) => ({ d: x.date, t: x.time, s: x.title }))].sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t)) : [];
  return <Modal title={`Import calendar · ${t.name}`} wide onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!n} onClick={apply}>Import</button></>}>
    <p className="muted small" style={{ margin: 0 }}>Pick a calendar file (.ics) exported from your schedule app or league site. Games ("vs", "@", "at") go to Fixtures & results; everything else goes on the calendar. Importing the same file again updates entries instead of duplicating them.</p>
    <input type="file" accept=".ics,text/calendar" onChange={onFile} />
    <div className="preview">
      {err ? <span style={{ color: 'var(--warn)' }}>{err}</span> : !plan ? <span className="muted">No file chosen.</span> : !n ? <span style={{ color: 'var(--warn)' }}>No events found in that file.</span> : <>
        <b>Found {plan.games.length} game{plan.games.length === 1 ? '' : 's'} and {plan.events.length} other event{plan.events.length === 1 ? '' : 's'}</b>
        <div className="small muted">{fmtDate(all[0].d)} to {fmtDate(all[all.length - 1].d)}</div>
        <ul>{all.slice(0, 8).map((x, i) => <li key={i}>{fmtDate(x.d)}{x.t ? ' ' + fmtTime(x.t) : ''} · {x.s}</li>)}</ul>
        {n > 8 && <div className="small muted">…and {n - 8} more</div>}
        {plan.games.length > 0 && !plan.games.some((g) => isUsT(g.home, t) || isUsT(g.away, t)) && <div className="small" style={{ color: 'var(--warn)' }}>None of these games list "{schoolName(t)}". They'll be saved, but won't show as your games until "Name in league tables" in Team settings matches the file's spelling.</div>}
      </>}
    </div>
  </Modal>;
}

/* ---------- league sync review ---------- */
export function addCandidate(H, c) {
  const g = { ...c.game, home: cleanTeam(c.game.home), away: cleanTeam(c.game.away), source: 'league' };
  return H.save(async (api) => { await api.saveGames(H.teamId, [g]); await api.resolveCandidate(c.id, 'added'); }, { reload: true });
}
