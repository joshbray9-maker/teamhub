// Stats: player game stats. Everyone on the team sees the season leaderboard; coaches enter
// stats game by game in a spreadsheet grid (type or paste a block of cells). Columns per sport
// are in lib/stats.js. Spectator links can show the same leaderboard when a coach ticks it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, todayISO, gameView, ourGames, hasScore, leagueLabel, ago } from '../lib/util.js';
import { colsFor, derivedFor, seasonTotals, statOf, leadCol } from '../lib/stats.js';
import { parseTsv } from '../lib/imports.js';
import { parseLeagueStats, planLeagueStats, mergeSeason, LEAGUE_COLS, LEADER_COLS, blankRow, toGrid, fromGrid, pasteBlock, badCell, DECIMALS } from '../lib/leagueStats.js';
import { readStatsImage, skippedLines } from '../lib/ocrStats.js';
import { nameKey } from '../lib/rosterImport.js';
import { docToText } from '../../supabase/functions/_shared/leagueParse.js';
import Modal from '../components/Modal.jsx';
import { byNumber } from './Roster.jsx';
import PageHead from '../components/PageHead.jsx';
import Icon from '../components/Icon.jsx';

/** Sortable season leaderboard; also used on the public spectator page. */
export function StatsTable({ rows, sport, columns }) {
  const cols = columns || [...colsFor(sport).map(([k, l]) => [k, l]), ...derivedFor(sport).map(([k, l]) => [k, l])];
  const [sort, setSort] = useState(leadCol(sport));
  const val = (p, k) => (k === 'gp' ? p.gp : k === 'name' ? p.name : statOf(p, k));
  const list = [...rows].sort((a, b) => { const x = val(a, sort), y = val(b, sort); if (sort === 'name') return String(x).localeCompare(String(y)); const nx = x === '' || x === undefined ? -Infinity : +x, ny = y === '' || y === undefined ? -Infinity : +y; return ny - nx || a.name.localeCompare(b.name); });
  const th = (k, l, cls = 'num') => <th key={k} className={`${cls} click ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{l}{sort === k ? ' ▼' : ''}</th>;
  if (!rows.length) return <p className="muted small" style={{ margin: 0 }}>No stats entered yet.</p>;
  return <div className="tbl-wrap"><table className="tbl st-tbl">
    <thead><tr><th>#</th>{th('name', 'Player', '')}{th('gp', 'GP')}{cols.map(([k, l]) => th(k, l))}</tr></thead>
    <tbody>{list.map((p, i) => <tr key={p.player_id} title={p.league ? 'Season totals from the league' : undefined}><td className="muted tnum">{i + 1}</td><td><b>{p.num && <span className="muted tnum">{p.num} </span>}{p.name}</b>{p.position && <span className="muted small"> {p.position}</span>}</td>
      <td className="num tnum">{p.gp}</td>{cols.map(([k]) => { const v0 = statOf(p, k), v = typeof v0 === 'number' && DECIMALS[k] !== undefined ? v0.toFixed(DECIMALS[k]) : v0; return <td key={k} className={`num tnum ${sort === k ? 'on' : ''}`}>{v === undefined || v === '' ? '–' : v}</td>; })}</tr>)}</tbody>
  </table></div>;
}

export default function Stats() {
  const H = useHub(); const t = H.team; const sport = t.sport;
  const [players, setPlayers] = useState(null), [rows, setRows] = useState([]), [gid, setGid] = useState(''), [league, setLeague] = useState(null);
  const load = () => Promise.all([H.api.listPlayers(t.id), H.api.listGameStats(t.id), H.api.getSetting(t.id, 'league_stats').catch(() => null)]).then(([p, r, l]) => { setPlayers(p.sort(byNumber)); setRows(r); setLeague(l); })
    .catch((e) => { setPlayers([]); H.toast('Could not load stats: ' + e.message); });
  useEffect(() => { load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const games = ourGames(H.tdata.league.games, t).filter((g) => g.date <= todayISO() || hasScore(g)).reverse();
  const byId = Object.fromEntries((players || []).map((p) => [p.id, p]));
  const season = useMemo(() => mergeSeason(seasonTotals(rows.filter((r) => byId[r.player_id] && byId[r.player_id].active !== false).map((r) => ({ ...r, ...byId[r.player_id], player_id: r.player_id })), sport), league, players || [], sport), [rows, players, league]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = (g) => { const v = gameView(g, t); return `${fmtDate(g.date)} · ${v.home ? 'vs' : '@'} ${v.opp}${v.res ? ` (${v.us}–${v.them})` : ''}`; };
  const entered = new Set(rows.map((r) => r.game_id));
  return <>
    <PageHead title="Stats" actions={H.isCoach && players && <button className="btn" onClick={() => H.openDialog((c) => <LeagueStatsImport close={c} players={players} onSaved={load} />)}><Icon n="refresh" /> Import league stats</button>} />
    <section className="card"><div className="card-head"><h2>Season leaderboard</h2><span className="muted small">{league && league.rows && league.rows.length ? `Season totals from ${league.source || 'the league'}, updated ${ago(new Date(league.updated_at).getTime())}` : `${entered.size} game${entered.size === 1 ? '' : 's'} with stats`} · click a column to sort</span></div>
      {!players ? <div className="muted small">Loading…</div> : <StatsTable rows={season} sport={sport} columns={league && league.rows && league.rows.length ? LEADER_COLS : undefined} />}</section>
    {H.isCoach && <section className="card">
      <div className="card-head"><h2>Enter game stats</h2>
        <select className="select st-pick" value={gid} onChange={(e) => setGid(e.target.value)} aria-label="Game"><option value="">Choose a game…</option>
          {games.map((g) => <option key={g.id} value={g.id}>{entered.has(g.id) ? '✓ ' : ''}{label(g)}</option>)}</select></div>
      {!gid ? <p className="muted small" style={{ margin: 0 }}>Pick a game to type or paste its stats. Games with stats are ticked.</p>
        : <StatsGrid key={gid} game={games.find((g) => g.id === gid)} players={(players || []).filter((p) => p.active !== false)} rows={rows.filter((r) => r.game_id === gid)} sport={sport} onSaved={load} />}
    </section>}
  </>;
}

function StatsGrid({ game, players, rows, sport, onSaved }) {
  const H = useHub(); const cols = colsFor(sport);
  const init = () => Object.fromEntries(players.map((p) => { const r = rows.find((x) => x.player_id === p.id); return [p.id, Object.fromEntries(cols.map(([k]) => [k, r && r.stats[k] !== undefined ? String(r.stats[k]) : '']))]; }));
  const [cells, setCells] = useState(init), [busy, setBusy] = useState(false); const [base] = useState(init); const box = useRef();
  const dirty = JSON.stringify(cells) !== JSON.stringify(base);
  const focus = (r, c) => { const el = box.current && box.current.querySelector(`input[data-r="${r}"][data-c="${c}"]`); if (el) { el.focus(); el.select(); } };
  const paste = (e, r, c) => {
    const text = e.clipboardData.getData('text/plain'); if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return; e.preventDefault();
    const block = parseTsv(text);
    setCells((cur) => { const n = { ...cur }; block.forEach((b, i) => { const p = players[r + i]; if (!p) return; n[p.id] = { ...n[p.id] }; b.forEach((v, j) => { const k = (cols[c + j] || [])[0]; if (k) n[p.id][k] = v.trim(); }); }); return n; });
  };
  const key = (e, r, c) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focus(r + 1, c); } else if (e.key === 'ArrowUp') { e.preventDefault(); focus(r - 1, c); } };
  const save = async () => {
    const out = players.map((p) => ({ player_id: p.id, stats: Object.fromEntries(cols.map(([k]) => [k, (cells[p.id] || {})[k]]).filter(([, v]) => v !== '' && v !== undefined && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) }))
      .filter((r) => Object.keys(r.stats).length || rows.some((x) => x.player_id === r.player_id));
    setBusy(true);
    try { await H.api.saveGameStats(H.teamId, game.id, out); H.toast('Stats saved'); await onSaved(); } catch (e) { H.toast('Could not save. ' + e.message); } finally { setBusy(false); }
  };
  return <>
    <p className="muted small" style={{ margin: 0 }}>Type numbers, or copy a block from a spreadsheet (same column order), click the first cell and paste (⌘V). Leave blanks for players who didn't play.</p>
    <div className="tbl-wrap ts-grid" ref={box}><table className="tbl">
      <thead><tr><th>Player</th>{cols.map(([k, l, long]) => <th key={k} className="num" title={long}>{l}</th>)}</tr></thead>
      <tbody>{players.map((p, r) => <tr key={p.id}><td className="ts-name">{p.num && <span className="muted tnum">{p.num} </span>}<b>{p.name}</b></td>
        {cols.map(([k, l], c) => { const v = (cells[p.id] || {})[k] || ''; return <td key={k} className="ts-cell"><input className={`tnum ${v && !Number.isFinite(Number(v)) ? 'bad' : ''}`} inputMode="numeric" data-r={r} data-c={c} value={v}
          aria-label={`${p.name} ${l}`} onChange={(e) => setCells((cur) => ({ ...cur, [p.id]: { ...cur[p.id], [k]: e.target.value } }))} onPaste={(e) => paste(e, r, c)} onKeyDown={(e) => key(e, r, c)} /></td>; })}</tr>)}</tbody>
    </table></div>
    <div className="pp-foot"><span className="spacer" /><button className="btn primary" disabled={!dirty || busy} onClick={save}><Icon n="check" /> {busy ? 'Saving…' : dirty ? 'Save stats' : 'Saved'}</button></div>
  </>;
}

/** Coach: the league's player stats in a table with CSSHL's columns. Paste rows straight into it
 *  (from the league table or a spreadsheet), or paste the whole page or a screenshot into the box
 *  above to fill it. Saving updates season totals, plus jersey numbers and positions. */
function LeagueStatsImport({ close, players, onSaved }) {
  const H = useHub(); const t = H.team; const src = leagueLabel(t);
  const [grid, setGrid] = useState(() => [blankRow(), blankRow(), blankRow()]);
  const [addNew, setAddNew] = useState(true), [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const [shot, setShot] = useState(null); // {progress} while reading a screenshot, then {skipped, from: true}
  const box = useRef();
  const rows = useMemo(() => fromGrid(grid), [grid]);
  const plan = useMemo(() => planLeagueStats(players, rows), [players, rows]);
  const filled = (g) => LEAGUE_COLS.some(([c]) => String(g[c]).trim());
  // rows found in a page or screenshot go into the table: onto the same player's row, else new rows
  const addRows = (found) => setGrid((cur) => {
    const n = cur.filter(filled), by = new Map(n.map((g) => [nameKey(g.name), g]));
    toGrid(found).forEach((g) => { const ex = by.get(nameKey(g.name)); if (ex) Object.assign(ex, { ...g, key: ex.key, extra: { ...ex.extra, ...g.extra } }); else n.push(g); });
    return [...n, blankRow()];
  });
  // a screenshot is read in this browser (nothing is uploaded)
  const readImage = async (file) => {
    if (!file || !/^image\//.test(file.type)) return;
    setShot({ progress: 0 });
    try {
      const got = await readStatsImage(file, (p) => setShot({ progress: p }));
      setShot({ from: true, skipped: [...((shot && shot.skipped) || []), ...skippedLines(got)] });
      if (got.length) addRows(got); else H.toast("Couldn't find the player table in that screenshot. Include the heading row (Name, Pos, GP, G, A…) and take it at full size.");
    } catch (e) { setShot(null); H.toast('Could not read the screenshot. ' + e.message); }
  };
  const clipText = (e) => { const html = e.clipboardData.getData('text/html'); return html ? docToText(new DOMParser().parseFromString(html, 'text/html')) : e.clipboardData.getData('text/plain'); };
  // the box above the table: a screenshot, or a whole page (Ctrl/Cmd + A)
  const onBoxPaste = (e) => {
    e.preventDefault();
    const img = [...(e.clipboardData.files || [])].find((f) => /^image\//.test(f.type));
    if (img) { readImage(img); return; }
    const found = parseLeagueStats(clipText(e));
    if (found.length) { addRows(found); setNote(`${found.length} player${found.length === 1 ? '' : 's'} added to the table from the pasted page.`); }
    else setNote('No player table found in that paste. Include the heading row (Name, Pos, GP, G, A…), or paste the rows straight into the table.');
  };
  // a table cell: rows copied from the league table or a spreadsheet, filled from that cell
  const onCellPaste = (e, r, c) => {
    const text = clipText(e); if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    setGrid((cur) => { const n = pasteBlock(cur, parseTsv(text.replace(/\r?\n$/, '')), r, c); return filled(n[n.length - 1]) ? [...n, blankRow()] : n; });
  };
  const setCell = (i, c, v) => setGrid((g) => g.map((x, j) => (j === i ? { ...x, [c]: v, check: undefined } : x)));
  const focus = (r, c) => { const el = box.current && box.current.querySelector(`input[data-r="${r}"][data-c="${c}"]`); if (el) { el.focus(); el.select(); } };
  const key = (e, r, c) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (r + 1 >= grid.length) setGrid((g) => [...g, blankRow()]); setTimeout(() => focus(r + 1, c)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focus(r - 1, c); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const strip = ({ was, ...p }) => p; // eslint-disable-line no-unused-vars
      const fresh = addNew && plan.missing.length ? await H.api.savePlayers(H.teamId, plan.missing.map((r) => ({ num: r.num, name: r.name, position: r.position, source: 'league' }))) : [];
      if (plan.updates.length) await H.api.savePlayers(H.teamId, plan.updates.map(strip));
      const ids = [...plan.matched.map((m) => [m.row, m.player.id]), ...(addNew ? plan.missing.map((r) => [r, (fresh.find((f) => f.name === r.name) || {}).id]) : [])].filter(([, id]) => id);
      await H.api.saveSetting(H.teamId, 'league_stats', { source: src, updated_at: new Date().toISOString(), rows: ids.map(([r, id]) => ({ player_id: id, gp: r.gp, stats: r.stats })) });
      H.toast(`Stats updated from ${src}: ${ids.length} players${plan.updates.length ? `, ${plan.updates.length} roster change${plan.updates.length === 1 ? '' : 's'}` : ''}${addNew && fresh.length ? `, ${fresh.length} added` : ''}`);
      close(); await onSaved();
    } catch (e) { H.toast('Could not save. ' + e.message); }
    finally { setBusy(false); }
  };
  // what saving does to each table row
  const status = (g) => {
    const r = rows.find((x) => nameKey(x.name) === nameKey(g.name) && g.name.trim()); if (!r) return null;
    const m = plan.matched.find((x) => x.row === r), u = m && plan.updates.find((x) => x.id === m.player.id);
    return { m, u, label: m ? (u ? 'Update' : 'Stats') : addNew ? 'New' : 'Skip',
      title: m ? [nameKey(m.player.name) !== nameKey(g.name) && `Roster: ${m.player.name}`, u && u.was.num !== u.num && `# was ${u.was.num || '–'}`, u && u.was.position !== u.position && `Pos was ${u.was.position || '–'}`].filter(Boolean).join(' · ') : 'Not on the roster' };
  };
  const n = plan.matched.length + (addNew ? plan.missing.length : 0);
  const incomplete = grid.filter((g) => filled(g) && !rows.some((r) => nameKey(r.name) === nameKey(g.name) && g.name.trim())).length;
  return <Modal title={`Import stats from ${src}`} wide onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!n || busy} onClick={apply}>{busy ? 'Saving…' : `Update ${n} player${n === 1 ? '' : 's'}`}</button></>}>
    <p className="muted small" style={{ margin: 0 }}>Copy the player rows from the {src} stats table (or a spreadsheet) and paste them into the table: click the first <b>Jersey #</b> cell and paste. Rows copied with the line number in front, or with their heading row, line up by themselves. Or paste the whole page (Ctrl/Cmd + A) or a <b>screenshot</b> into the box. Season totals replace the leaderboard numbers; jersey numbers and positions on the roster are updated to match, and the team is left as it is.</p>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <textarea className="input ls-drop" rows="1" placeholder="Paste the whole page or a screenshot here" value="" onChange={() => {}} onPaste={onBoxPaste}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const f = e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) { e.preventDefault(); readImage(f); } }} />
      <label className="btn sm"><Icon n="plus" /> Choose screenshot<input type="file" accept="image/*" hidden onChange={(e) => { readImage(e.target.files[0]); e.target.value = ''; }} /></label>
      {grid.some(filled) && <button className="btn sm ghost" onClick={() => { setGrid([blankRow(), blankRow(), blankRow()]); setShot(null); setNote(''); }}>Clear table</button>}
    </div>
    {shot && shot.progress !== undefined && <div className="small muted">Reading screenshot… {Math.round(shot.progress * 100)}% (the first time takes a little longer)</div>}
    {shot && shot.skipped && shot.skipped.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>Line{shot.skipped.length > 1 ? 's' : ''} {shot.skipped.join(', ')} on the screenshot couldn't be read. Add those players to the table by hand.</div>}
    {shot && shot.from && <div className="small" style={{ color: 'var(--warn)' }}>Read from a screenshot: check the numbers against the league page before saving{grid.some((g) => g.check) ? ', especially rows marked Check' : ''}. Pt/G, PIMPG and SO% are worked out from the totals.</div>}
    {note && <div className="small muted">{note}</div>}
    <div className="tbl-wrap ts-grid ls-grid" ref={box}><table className="tbl">
      <thead><tr><th />{LEAGUE_COLS.map(([c, l, long]) => <th key={c} className={TEXT_COLS.has(c) ? '' : 'num'} title={long}>{l}</th>)}<th /></tr></thead>
      <tbody>{grid.map((g, i) => { const st = status(g); return <tr key={g.key}>
        <td style={{ whiteSpace: 'nowrap' }}>{st && <span className={`pill ${st.m ? '' : 'new'}`} title={st.title}>{st.label}</span>}{g.check && <span className="pill warn" title="G + A doesn't match PTS on the screenshot">Check</span>}</td>
        {LEAGUE_COLS.map(([c, l], j) => <td key={c} className={`ts-cell ${TEXT_COLS.has(c) ? 'ts-text' : ''} ${c === 'name' ? 'ls-name' : ''}`}><input className={`tnum ${badCell(c, g[c]) ? 'bad' : ''}`} inputMode={TEXT_COLS.has(c) ? 'text' : 'decimal'}
          data-r={i} data-c={j} value={g[c]} aria-label={`${g.name || `Row ${i + 1}`} ${l}`} onChange={(e) => setCell(i, c, e.target.value)} onPaste={(e) => onCellPaste(e, i, j)} onKeyDown={(e) => key(e, i, j)} /></td>)}
        <td><button className="icon-btn" aria-label={`Remove row ${g.name || i + 1}`} onClick={() => setGrid((cur) => { const x = cur.filter((_, k2) => k2 !== i); return x.length ? x : [blankRow()]; })}><Icon n="x" /></button></td>
      </tr>; })}</tbody>
    </table></div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn sm" onClick={() => setGrid((g) => [...g, ...Array.from({ length: 5 }, blankRow)])}><Icon n="plus" /> Add 5 rows</button>
      {rows.length > 0 && <span className="small"><b>{rows.length} player{rows.length === 1 ? '' : 's'}</b>: {plan.matched.length} on the roster{plan.updates.length ? `, ${plan.updates.length} with a new number or position (hover Update to see)` : ''}{plan.missing.length ? `, ${plan.missing.length} not on the roster` : ''}.</span>}
      {plan.repeated > 0 && <span className="small" style={{ color: 'var(--warn)' }}>{plan.repeated} name{plan.repeated === 1 ? ' is' : 's are'} in the table twice; only the first row is saved.</span>}
      {incomplete > 0 && <span className="small" style={{ color: 'var(--warn)' }}>{incomplete} row{incomplete === 1 ? '' : 's'} need{incomplete === 1 ? 's' : ''} a name and GP to be saved.</span>}
    </div>
    {plan.missing.length > 0 && <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" className="cb" checked={addNew} onChange={(e) => setAddNew(e.target.checked)} /> Add the {plan.missing.length} player{plan.missing.length === 1 ? '' : 's'} not on the roster{plan.missing.length <= 5 ? ` (${plan.missing.map((r) => r.name).join(', ')})` : ''}. Untick if a name is spelled differently on the roster; fix the spelling there and import again.</label>}
  </Modal>;
}
const TEXT_COLS = new Set(LEAGUE_COLS.filter((c) => c[3]).map((c) => c[0]));
