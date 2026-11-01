// S&C → Tests and S&C → Gym groups (admins + coaches only; RLS enforces it).
// Tests: pick a testing session (date + battery) or start one; the roster fills the Name column
// and the battery's test columns start empty. Type or paste straight into the grid, or import a
// file / pasted sheet. Bulk import takes a whole season's sheet (a Date column plus names and
// tests) and files each day into its own session. The coaches view charts the team's median change across every metric
// (top) and each metric's history in its own box.
// Gym groups: from each athlete's latest full testing against the targets the coach sets
// (formula in lib/testing.js), with a manual move per player.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, todayISO } from '../lib/util.js';
import { METRICS, BATTERIES, batteryCols, metricOrder, seasonSheet, GROUPS, FORCE, EXPRESSION, num, fmt, ratio, gymGroup, metricSeries, changeSeries, metricField, rowsToTests, rowsToTestDays, leaderboards } from '../lib/testing.js';
import { parseTsv } from '../lib/imports.js';
import { byNumber } from './Roster.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';
import InjuryFlag from '../components/InjuryFlag.jsx';
import ImportSource from '../components/ImportSource.jsx';

const COLORS = { cmj_jh: '#2563eb', rsimod: '#d97706', sj_jh: '#7c3aed', imtp_pf: '#dc2626', rel_pf: '#db2777', fly10: '#059669', cooper: '#0891b2',
  bw: '#64748b', abalakov: '#4f46e5', eur: '#a16207', t505: '#0d9488', cassivi: '#c026d3', sprint20: '#ea580c' };
const sessLabel = (s) => `${fmtDate(s.tested_on)} · ${BATTERIES[s.battery].label}`;
const StaffOnly = ({ what }) => <section className="card"><p className="muted" style={{ margin: 0 }}>{what} are only visible to coaches and admins.</p></section>;

function useTestData() {
  const H = useHub();
  const [d, setD] = useState(null);
  const load = async () => {
    try {
      const [tests, players] = await Promise.all([H.api.listTests(H.teamId), H.api.listPlayers(H.teamId)]);
      setD({ ...tests, players: players.sort(byNumber) });
    } catch (e) { setD({ sessions: [], results: [], players: [] }); H.toast('Could not load tests: ' + e.message); }
  };
  useEffect(() => { if (H.isCoach) load(); }, [H.teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  return [d, load];
}

/* ================= Tests ================= */
export default function Tests() {
  const H = useHub();
  const [d, reload] = useTestData();
  const [view, setView] = useState('enter');
  const [sid, setSid] = useState(null);
  useEffect(() => { if (d && (!sid || !d.sessions.some((s) => s.id === sid)) && d.sessions.length) setSid(d.sessions[d.sessions.length - 1].id); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!H.isCoach) return <StaffOnly what="Test results" />;
  if (!d) return <div className="loading">Loading…</div>;
  const session = d.sessions.find((s) => s.id === sid);
  const newSession = () => H.openDialog((c) => <NewSession close={c} onSave={async (date, battery) => {
    try { const s = await H.api.createTestSession(H.teamId, date, battery); await reload(); setSid(s.id); setView('enter'); } catch (e) { H.toast('Could not create the session. ' + e.message); }
  }} />);
  const del = async () => {
    if (!(await H.confirm('Delete testing session?', `${sessLabel(session)} and all its results are removed.`))) return;
    try { await H.api.deleteTestSession(session.id); setSid(null); await reload(); } catch (e) { H.toast(e.message); }
  };
  const bulk = () => H.openDialog((c) => <BulkImport d={d} close={c} onDone={async () => { await reload(); setView('enter'); }} />);
  return <>
    <div className="ts-bar">
      <div className="seg" role="tablist">{[['enter', 'Enter results'], ['trends', 'Coaches view']].map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
      {view === 'enter' && <>
        <select className="select ts-pick" value={sid || ''} onChange={(e) => setSid(e.target.value)} aria-label="Testing session" disabled={!d.sessions.length}>
          {!d.sessions.length && <option value="">No sessions yet</option>}
          {[...d.sessions].reverse().map((s) => <option key={s.id} value={s.id}>{sessLabel(s)}</option>)}
        </select>
        <button className="btn primary" onClick={newSession}><Icon n="plus" /> New session</button>
        <button className="btn" onClick={bulk}><Icon n="refresh" /> Bulk import</button>
        {session && <button className="btn ghost danger" onClick={del}><Icon n="trash" /> Delete session</button>}
      </>}
    </div>
    {view === 'trends' ? <Trends d={d} />
      : !session ? <section className="card"><div className="empty-state"><b>No testing sessions yet</b><span className="muted small">Start one with <b>New session</b>: pick the date and the battery (weekly readiness or full team testing). The roster fills in the names; enter or paste the results.</span></div></section>
        : <EntryGrid key={session.id} d={d} session={session} onSaved={reload} />}
  </>;
}

function NewSession({ close, onSave }) {
  const H = useHub();
  const [date, setDate] = useState(todayISO()), [battery, setBattery] = useState('readiness');
  return <Modal title="New testing session" onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!date} onClick={() => { close(); onSave(date, battery); }}>Create</button></>}>
    <label className="field"><span>Date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
    <div className="field"><span>Battery</span>
      {Object.entries(BATTERIES).map(([k, b]) => <label key={k} className="ts-bat"><input type="radio" name="bat" checked={battery === k} onChange={() => setBattery(k)} />
        <span><b>{b.label}</b><span className="muted small">{batteryCols(k, H.team.sport).map((m) => METRICS[m].label).join(', ')}</span></span></label>)}</div>
  </Modal>;
}

/* Spreadsheet-style entry: one row per player, one column per test in the battery. */
function EntryGrid({ d, session, onSaved }) {
  const H = useHub();
  const saved = useMemo(() => Object.fromEntries(d.results.filter((r) => r.session_id === session.id).map((r) => [r.player_id, r.values || {}])), [d, session.id]);
  // the battery's tests for this sport, plus any other test already saved in this session (e.g. from a bulk import)
  const cols = useMemo(() => { const base = batteryCols(session.battery, H.team.sport), extra = new Set(Object.values(saved).flatMap(Object.keys));
    return [...base, ...metricOrder(H.team.sport).filter((k) => extra.has(k) && !base.includes(k))]; }, [session.battery, saved, H.team.sport]);
  // active roster, plus anyone with results here who has since left
  const rows = useMemo(() => d.players.filter((p) => p.active !== false || saved[p.id]), [d.players, saved]);
  const toText = (v) => Object.fromEntries(cols.map((k) => [k, v && v[k] !== undefined && v[k] !== null ? String(v[k]) : '']));
  const [cells, setCells] = useState(() => Object.fromEntries(rows.map((p) => [p.id, toText(saved[p.id])])));
  const [busy, setBusy] = useState(false);
  const box = useRef();
  const dirty = rows.some((p) => cols.some((k) => (cells[p.id] || {})[k] !== toText(saved[p.id])[k]));
  const bad = (v) => v.trim() !== '' && num(v) === null;
  const set = (pid, k, v) => setCells((c) => ({ ...c, [pid]: { ...c[pid], [k]: v } }));
  const focus = (r, c) => { const el = box.current && box.current.querySelector(`input[data-r="${r}"][data-c="${c}"]`); if (el) { el.focus(); el.select(); } };
  const paste = (e, r, c) => {
    const text = e.clipboardData.getData('text/plain'); if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    const block = parseTsv(text);
    setCells((cur) => { const n = { ...cur }; block.forEach((b, i) => { const p = rows[r + i]; if (!p) return; n[p.id] = { ...n[p.id] }; b.forEach((v, j) => { const k = cols[c + j]; if (k) n[p.id][k] = v.trim(); }); }); return n; });
  };
  const key = (e, r, c) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focus(r + 1, c); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focus(r - 1, c); }
    else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) { e.preventDefault(); focus(r, c + 1); }
    else if (e.key === 'ArrowLeft' && e.target.selectionEnd === 0) { e.preventDefault(); focus(r, c - 1); }
  };
  const save = async () => {
    const out = rows.map((p) => ({ player_id: p.id, values: Object.fromEntries(cols.map((k) => [k, num((cells[p.id] || {})[k])]).filter(([, v]) => v !== null)) }))
      .filter((r) => Object.keys(r.values).length || saved[r.player_id]);
    const skipped = rows.reduce((n, p) => n + cols.filter((k) => bad((cells[p.id] || {})[k] || '')).length, 0);
    setBusy(true);
    try { await H.api.saveTestResults(H.teamId, session.id, out); H.toast(`Saved${skipped ? ` (${skipped === 1 ? '1 cell that isn\'t a number was' : `${skipped} cells that aren't numbers were`} left out)` : ''}`); await onSaved(); }
    catch (e) { H.toast('Could not save. ' + e.message); }
    finally { setBusy(false); }
  };
  const importRows = () => H.openDialog((c) => <ImportTests roster={rows} cols={cols} close={c} onUse={(vals) => setCells((cur) => {
    const n = { ...cur }; Object.entries(vals).forEach(([pid, v]) => { n[pid] = { ...n[pid], ...Object.fromEntries(Object.entries(v).filter(([k]) => cols.includes(k)).map(([k, x]) => [k, String(x)])) }; }); return n;
  })} />);
  const filled = rows.filter((p) => cols.some((k) => num((cells[p.id] || {})[k]) !== null)).length;
  if (!rows.length) return <section className="card"><p className="muted" style={{ margin: 0 }}>Add players in the <a href="#" onClick={(e) => { e.preventDefault(); H.go('roster'); }}>Roster</a> tab first; they fill the Name column here.</p></section>;
  return <section className="card">
    <div className="card-head"><div><h2>{BATTERIES[session.battery].label}</h2><span className="muted small">{fmtDate(session.tested_on, true)} · {filled} of {rows.length} players entered</span></div>
      <div className="acts"><button className="btn" onClick={importRows}><Icon n="refresh" /> Import: file or paste</button><button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save results' : 'Saved'}</button></div></div>
    <p className="muted small" style={{ margin: 0 }}>Type results, or copy a block of cells from a spreadsheet, click the first cell and paste (⌘V). Use the same column order as here. Leave a cell blank if the test wasn't done.</p>
    <div className="tbl-wrap ts-grid" ref={box}><table className="tbl">
      <thead><tr><th>Name</th>{cols.map((k) => <th key={k} className="num">{METRICS[k].label}{METRICS[k].unit && <span className="muted"> ({METRICS[k].unit})</span>}</th>)}</tr></thead>
      <tbody>{rows.map((p, r) => <tr key={p.id} className={p.active === false ? 'muted' : ''}>
        <td className="ts-name">{p.num && <span className="muted tnum">{p.num} </span>}<b>{p.name}</b> <InjuryFlag p={p} /></td>
        {cols.map((k, c) => { const v = (cells[p.id] || {})[k] || ''; return <td key={k} className="ts-cell"><input className={`tnum ${bad(v) ? 'bad' : ''}`} inputMode="decimal" data-r={r} data-c={c} value={v}
          aria-label={`${p.name} ${METRICS[k].long}`} onChange={(e) => set(p.id, k, e.target.value)} onPaste={(e) => paste(e, r, c)} onKeyDown={(e) => key(e, r, c)} /></td>; })}
      </tr>)}</tbody>
    </table></div>
  </section>;
}

function ImportTests({ roster, cols, close, onUse }) {
  const [res, setRes] = useState(null);
  const take = (rows, label) => {
    const r = rowsToTests(rows, roster);
    const n = Object.keys(r.values).length; if (!n) throw new Error(r.unmatched.length ? `None of the ${r.unmatched.length} names matched the roster.` : 'No results found.');
    setRes({ ...r, file: label, other: r.metrics.filter((k) => !cols.includes(k)) });
  };
  const byId = Object.fromEntries(roster.map((p) => [p.id, p]));
  return <Modal title="Import test results" wide onClose={close}
    actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!res} onClick={() => { close(); onUse(res.values); }}>Put in the grid</button></>}>
    <p className="muted small" style={{ margin: 0 }}>A sheet with a <b>Name</b> (or <b>#</b>) column and test columns such as <b>CMJ JH</b>, <b>RSImod</b>, <b>SJ JH</b>, <b>IMTP</b>, <b>Rel PF</b> (N/kg), <b>10m fly</b>, <b>Cooper</b>. Players are matched to the roster by name or number. The results go into the grid; nothing is saved until you press <b>Save results</b>.</p>
    <ImportSource onRows={take} isHeading={(h) => !!metricField(h)} template={[['Name', ...cols.map((k) => `${METRICS[k].label}${METRICS[k].unit ? ` (${METRICS[k].unit})` : ''}`)]]} templateName="test-results-template.csv" />
    {res && <>
      <div className="small"><b>{res.file}</b>: {Object.keys(res.values).length} players{res.unmatched.length ? `; not on the roster (skipped): ${res.unmatched.join(', ')}` : ''}{res.other.length ? `; not in this battery (ignored): ${res.other.map((k) => METRICS[k].label).join(', ')}` : ''}.</div>
      <div className="tbl-wrap" style={{ maxHeight: 280, overflow: 'auto' }}><table className="tbl"><thead><tr><th>Name</th>{cols.map((k) => <th key={k} className="num">{METRICS[k].label}</th>)}</tr></thead>
        <tbody>{Object.entries(res.values).map(([pid, v]) => <tr key={pid}><td>{byId[pid].name}</td>{cols.map((k) => <td key={k} className="num tnum">{fmt(k, v[k])}</td>)}</tr>)}</tbody></table></div>
    </>}
  </Modal>;
}

/* Bulk import: every testing day in one sheet. Each date goes into the session already on that
   date (one with the same battery first; made if there's none), so a day is never split in two.
   A readiness session that gets full-testing results becomes full team testing (gym groups read
   those); a full session is never turned back into readiness. Results merge per player, so tests
   already entered for a player that day are kept unless the sheet has a new number for them. */
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function BulkImport({ d, close, onDone }) {
  const H = useHub();
  const [res, setRes] = useState(null), [bat, setBat] = useState({}), [busy, setBusy] = useState(false);
  const take = (rows, label) => {
    const r = rowsToTestDays(rows, d.players, H.team.sport);
    if (!r.days.length) throw new Error(r.unmatched.length ? `None of the ${r.unmatched.length} names matched the roster.` : r.badDates.length ? `No dates could be read (e.g. "${r.badDates[0]}").` : 'No results found.');
    setRes({ ...r, file: label }); setBat(Object.fromEntries(r.days.map((x) => [x.date, x.battery])));
  };
  const existing = (date, b) => d.sessions.find((s) => s.tested_on === date && s.battery === b) || d.sessions.find((s) => s.tested_on === date);
  const total = res ? res.days.reduce((n, x) => n + Object.keys(x.values).length, 0) : 0;
  const save = async () => {
    setBusy(true);
    try {
      for (const day of res.days) {
        const b = bat[day.date]; let s = existing(day.date, b);
        if (!s) s = await H.api.createTestSession(H.teamId, day.date, b);
        else if (s.battery !== b && b === 'full') await H.api.setTestBattery(s.id, 'full');
        const before = Object.fromEntries(d.results.filter((r) => r.session_id === s.id).map((r) => [r.player_id, r.values || {}]));
        await H.api.saveTestResults(H.teamId, s.id, Object.entries(day.values).map(([pid, v]) => ({ player_id: pid, values: { ...(before[pid] || {}), ...v } })));
      }
      H.toast(`Imported ${plural(total, 'result')} over ${plural(res.days.length, 'testing day')}`); close(); await onDone();
    } catch (e) { H.toast('Could not finish the import. ' + e.message + ' Days before the error were saved; running it again is safe.'); await onDone(); }
    finally { setBusy(false); }
  };
  return <Modal title="Bulk import test results" wide onClose={close}
    actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!res || busy} onClick={save}>{busy ? 'Importing…' : res ? `Import ${res.days.length} day${res.days.length === 1 ? '' : 's'}` : 'Import'}</button></>}>
    <p className="muted small" style={{ margin: 0 }}>Paste your whole sheet: one row per player per testing day, with a <b>Date</b> column, a <b>Name</b> (or <b>#</b>) column and test columns such as <b>{batteryCols('full', H.team.sport).map((k) => METRICS[k].label).join(', ')}</b>. Other columns (team, position, notes) are ignored. A blank date repeats the date above. Each date becomes its own testing session (or adds to the one already there); you can check everything before it's saved.</p>
    <ImportSource mode0="paste" onRows={take} isHeading={(h) => !!metricField(h)} template={[seasonSheet(H.team.sport)]} templateName="test-results-season-template.csv" />
    {res && <>
      <div className="small"><b>{res.file}</b>: {plural(total, 'result')} for {plural(new Set(res.days.flatMap((x) => Object.keys(x.values))).size, 'player')} over {plural(res.days.length, 'testing day')} ({metricOrder(H.team.sport).filter((k) => res.metrics.includes(k)).map((k) => METRICS[k].label).join(', ')}).
        {res.unmatched.length > 0 && <> <b>Not on the roster (skipped):</b> {res.unmatched.join(', ')}.</>}
        {res.badDates.length > 0 && <> <b>Dates not understood (rows skipped):</b> {res.badDates.join(', ')}.</>}</div>
      <div className="tbl-wrap" style={{ maxHeight: 320, overflow: 'auto' }}><table className="tbl">
        <thead><tr><th>Date</th><th>Battery</th><th className="num">Players</th><th>Tests</th><th>Goes into</th></tr></thead>
        <tbody>{res.days.map((x) => { const used = [...new Set(Object.values(x.values).flatMap(Object.keys))]; const s = existing(x.date, bat[x.date]);
          return <tr key={x.date}><td>{fmtDate(x.date, true)}</td>
            <td><select className="select" value={bat[x.date]} onChange={(e) => setBat({ ...bat, [x.date]: e.target.value })} aria-label={`Battery for ${x.date}`}>{Object.entries(BATTERIES).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}</select></td>
            <td className="num tnum">{Object.keys(x.values).length}</td><td className="small">{metricOrder(H.team.sport).filter((k) => used.includes(k)).map((k) => METRICS[k].label).join(', ')}</td>
            <td className="small">{!s ? <span className="muted">New session</span> : s.battery !== bat[x.date] && bat[x.date] === 'full' ? 'Existing session (merged, becomes full team testing)' : 'Existing session (merged)'}</td></tr>; })}</tbody>
      </table></div>
    </>}
  </Modal>;
}

/* ================= Coaches view: trends ================= */
const CW = 720, CL = 46, CR = 14, CT = 12;
function Trends({ d }) {
  const H = useHub();
  const series = useMemo(() => metricSeries(d.sessions, d.results), [d]);
  const change = useMemo(() => changeSeries(series), [series]);
  const keys = metricOrder(H.team.sport).filter((k) => series[k].length);
  const trend = keys.filter((k) => !METRICS[k].neutral); // bodyweight and EUR have no better direction
  const [hide, setHide] = useState({});
  if (!keys.length) return <section className="card"><p className="muted" style={{ margin: 0 }}>Trends appear once a testing session has results.</p></section>;
  const dates = [...new Set(keys.flatMap((k) => series[k].map((p) => p.date)))].sort();
  return <>
    <section className="card">
      <div className="card-head"><div><h2>Team trend</h2><span className="muted small">Median change since each test's first session. Up is better (a faster time counts as up). Bodyweight and EUR aren't charted here.</span></div></div>
      <div className="tr-legend">{trend.map((k) => <button key={k} className={hide[k] ? 'off' : ''} onClick={() => setHide({ ...hide, [k]: !hide[k] })}><i style={{ background: COLORS[k] }} />{METRICS[k].label}</button>)}</div>
      <ChangeChart dates={dates} change={change} keys={trend.filter((k) => !hide[k] && change[k])} />
    </section>
    <div className="tr-grid">{keys.map((k) => <MetricBox key={k} k={k} pts={series[k]} />)}</div>
  </>;
}
function ChangeChart({ dates, change, keys }) {
  const H = 240, ph = H - 26 - CT, pw = CW - CL - CR;
  const vals = keys.flatMap((k) => change[k].map((p) => p.change));
  const lim = Math.max(0.05, ...vals.map(Math.abs)); const top = Math.ceil(lim * 20) / 20;
  const x = (dt) => CL + (dates.length < 2 ? pw / 2 : (dates.indexOf(dt) / (dates.length - 1)) * pw), y = (v) => CT + ((top - v) / (2 * top)) * ph;
  const ticks = [-top, -top / 2, 0, top / 2, top];
  return <svg className="tr-chart" viewBox={`0 0 ${CW} ${H}`} role="img" aria-label="Team median change per test">
    {ticks.map((t) => <g key={t}><line x1={CL} x2={CW - CR} y1={y(t)} y2={y(t)} className={t === 0 ? 'zero' : 'grid'} /><text x={CL - 6} y={y(t) + 4} className="ax" textAnchor="end">{t > 0 ? '+' : ''}{Math.round(t * 100)}%</text></g>)}
    {dates.map((dt) => <text key={dt} x={x(dt)} y={H - 6} className="ax" textAnchor="middle">{fmtDate(dt).replace(/^\w+ /, '')}</text>)}
    {keys.map((k) => { const pts = change[k]; return <g key={k}>
      <polyline points={pts.map((p) => `${x(p.date)},${y(p.change)}`).join(' ')} fill="none" stroke={COLORS[k]} strokeWidth="2.2" strokeLinejoin="round" />
      {pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.change)} r="3.5" fill={COLORS[k]}><title>{`${METRICS[k].label} ${fmtDate(p.date)}: ${p.change >= 0 ? '+' : ''}${(p.change * 100).toFixed(1)}%`}</title></circle>)}</g>; })}
  </svg>;
}
function MetricBox({ k, pts }) {
  const m = METRICS[k], W = 320, H = 120, L = 6, R = 6, T = 10, B = 18;
  const last = pts[pts.length - 1], first = pts[0], prev = pts[pts.length - 2];
  const lo = Math.min(...pts.map((p) => p.q1)), hi = Math.max(...pts.map((p) => p.q3)); const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1;
  const y = (v) => T + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - T - B), x = (i) => (pts.length < 2 ? W / 2 : L + (i / (pts.length - 1)) * (W - L - R));
  const delta = (a, b) => { if (!b) return null; const c = (a.median - b.median) / b.median * (m.lower ? -1 : 1); return c; };
  const ch = (c, label) => c === null ? null : <span className={m.neutral ? '' : c > 0.0005 ? 'up' : c < -0.0005 ? 'down' : ''}>{c > 0 ? '▲' : c < 0 ? '▼' : '•'} {Math.abs(c * 100).toFixed(1)}% {label}</span>;
  return <section className="card tr-box">
    <div className="tr-h"><b style={{ color: COLORS[k] }}>{m.long}</b><span className="muted small">{m.lower ? 'lower is better' : ''}</span></div>
    <div className="tr-v tnum">{fmt(k, last.median)}<span className="muted"> {m.unit}</span></div>
    <div className="tr-d small">{ch(delta(last, prev), 'vs last')}{pts.length > 2 && ch(delta(last, first), 'since first')}<span className="muted">n = {last.n}</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} className="tr-spark" role="img" aria-label={`${m.long} team median over time`}>
      <polygon points={[...pts.map((p, i) => `${x(i)},${y(p.q3)}`), ...[...pts].reverse().map((p, i) => `${x(pts.length - 1 - i)},${y(p.q1)}`)].join(' ')} fill={COLORS[k]} opacity=".14" />
      <polyline points={pts.map((p, i) => `${x(i)},${y(p.median)}`).join(' ')} fill="none" stroke={COLORS[k]} strokeWidth="2" />
      {pts.map((p, i) => <circle key={p.date} cx={x(i)} cy={y(p.median)} r="3" fill={COLORS[k]}><title>{`${fmtDate(p.date)}: median ${fmt(k, p.median)} ${m.unit} (middle half ${fmt(k, p.q1)}–${fmt(k, p.q3)}, n=${p.n})`}</title></circle>)}
      <text x={L} y={H - 4} className="ax">{fmtDate(first.date).replace(/^\w+ /, '')}</text>{pts.length > 1 && <text x={W - R} y={H - 4} className="ax" textAnchor="end">{fmtDate(last.date).replace(/^\w+ /, '')}</text>}
    </svg>
    <div className="muted small">Line: team median · band: middle half of the team</div>
  </section>;
}

/* ================= Gym groups ================= */
export function GymGroups() {
  const H = useHub();
  const [d] = useTestData();
  const [cfg, setCfg] = useState(null);
  useEffect(() => { if (H.isCoach) H.api.getGymConfig(H.teamId).then(setCfg).catch(() => setCfg({ targets: {}, overrides: {} })); }, [H.teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!H.isCoach) return <StaffOnly what="Gym groups" />;
  if (!d || !cfg) return <div className="loading">Loading…</div>;
  const saveCfg = async (c, msg) => { setCfg(c); try { await H.api.saveGymConfig(H.teamId, c); if (msg) H.toast(msg); } catch (e) { H.toast('Could not save. ' + e.message); } };
  // each player's latest full testing
  const full = d.sessions.filter((s) => s.battery === 'full').sort((a, b) => b.tested_on.localeCompare(a.tested_on));
  const latest = {};
  for (const s of full) for (const r of d.results.filter((x) => x.session_id === s.id)) if (!latest[r.player_id]) latest[r.player_id] = { values: r.values || {}, date: s.tested_on };
  const players = d.players.filter((p) => p.active !== false);
  const placed = players.map((p) => ({ p, t: latest[p.id], g: latest[p.id] ? gymGroup(latest[p.id].values, cfg.targets, cfg.overrides[p.id]) : null }));
  const hasTargets = [...FORCE, ...EXPRESSION].some((k) => num(cfg.targets[k]) !== null);
  const editTargets = () => H.openDialog((c) => <Targets targets={cfg.targets} close={c} onSave={(t) => saveCfg({ ...cfg, targets: t }, 'Targets saved')} />);
  const move = (pid, g) => { const o = { ...cfg.overrides }; if (g) o[pid] = g; else delete o[pid]; saveCfg({ ...cfg, overrides: o }); };
  const card = ({ p, t, g }) => <li key={p.id} className="gg-p">
    <div className="gg-ph"><b>{p.num && <span className="muted tnum">{p.num} </span>}{p.name}</b><InjuryFlag p={p} />
      <select className="select gg-move" value={cfg.overrides[p.id] || ''} onChange={(e) => move(p.id, e.target.value)} aria-label={`Group for ${p.name}`}>
        <option value="">By formula</option>{Object.entries(GROUPS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select></div>
    {g && <div className="muted small">{g.reason}</div>}
    {t && <div className="gg-vals">{[...FORCE, ...EXPRESSION].filter((k) => num(t.values[k]) !== null).map((k) => { const r = ratio(k, t.values[k], cfg.targets[k]); return <span key={k} className={r === null ? '' : r >= 1 ? 'ok' : 'low'} title={cfg.targets[k] ? `Target ${cfg.targets[k]} ${METRICS[k].unit}` : 'No target set'}>{METRICS[k].label} {fmt(k, t.values[k])}</span>; })}</div>}
  </li>;
  const notPlaced = placed.filter((x) => !x.g || !x.g.group);
  return <>
    <section className="card gg-top">
      <div className="card-head"><div><h2>Gym groups</h2><span className="muted small">From each athlete's latest <b>full team testing</b>, compared with your targets. Force: IMTP peak force and relative peak force. Expression: CMJ JH, SJ JH and RSImod.</span></div>
        <button className="btn" onClick={editTargets}><Icon n="gear" /> Targets</button></div>
      {!hasTargets && <div className="hint">Set your targets first (<b>Targets</b>): groups appear once there's a target for at least one force test and one expression test.</div>}
      {!full.length && <div className="hint">No full team testing yet. Add a session with the Full team testing battery in the Tests tab.</div>}
    </section>
    <div className="gg-grid">{Object.entries(GROUPS).map(([k, x]) => { const list = placed.filter((y) => y.g && y.g.group === k); return <section key={k} className={`card gg-col ${x.color}`}>
      <div className="gg-h"><b>{x.label}</b><span className="muted tnum">{list.length}</span></div>
      <div className="gg-focus">{x.focus}</div>
      <ul className="gg-list">{list.map(card)}</ul>
    </section>; })}</div>
    {notPlaced.length > 0 && <section className="card"><div className="card-head"><h2>Not placed</h2><span className="muted small">{notPlaced.length}</span></div>
      <ul className="gg-list">{notPlaced.map(({ p, t, g }) => <li key={p.id} className="gg-p"><div className="gg-ph"><b>{p.name}</b><InjuryFlag p={p} /></div><div className="muted small">{!t ? 'No full testing results yet' : g.reason}</div></li>)}</ul></section>}
  </>;
}

function Targets({ targets, close, onSave }) {
  const keys = [...FORCE, ...EXPRESSION];
  const [t, setT] = useState(Object.fromEntries(keys.map((k) => [k, targets[k] !== undefined && targets[k] !== null ? String(targets[k]) : ''])));
  const submit = () => { close(); onSave(Object.fromEntries(keys.map((k) => [k, num(t[k])]).filter(([, v]) => v !== null && v > 0))); };
  return <Modal title="Gym group targets" onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></>}>
    <p className="muted small" style={{ margin: 0 }}>The value you consider good for this team, per test. Leave a test blank to leave it out of the formula. Athletes are compared with these numbers.</p>
    <div className="row2">{keys.map((k) => <label key={k} className="field"><span>{METRICS[k].long}{METRICS[k].unit && ` (${METRICS[k].unit})`}</span>
      <input className="input tnum" inputMode="decimal" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} placeholder="No target" /></label>)}</div>
    <div className="hint">Force deficient: force below target. Otherwise expression efficient when expression and RSImod meet target, else expression deficient.</div>
  </Modal>;
}

/* ================= Leaderboard (everyone on the team) ================= */
// Players and parents see each active player's best result per test, unless a coach hides it.
export function Leaderboard() {
  const H = useHub();
  const [rows, setRows] = useState(null), [shared, setShared] = useState(true), [tab, setTab] = useState('overall');
  useEffect(() => {
    H.api.leaderboard(H.teamId).then(setRows).catch((e) => { setRows([]); H.toast('Could not load the leaderboard: ' + e.message); });
    if (H.isCoach) H.api.getGymConfig(H.teamId).then((c) => setShared(c.leaderboard !== false)).catch(() => {});
  }, [H.teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return <div className="loading">Loading…</div>;
  const L = leaderboards(rows);
  const keys = metricOrder(H.team.sport).filter((k) => L.byMetric[k]);
  const toggle = async (on) => { setShared(on); try { await H.api.setLeaderboardShared(H.teamId, on); H.toast(on ? 'Players can see the leaderboard' : 'Leaderboard hidden from players'); } catch (e) { setShared(!on); H.toast(e.message); } };
  const medal = (r) => <span className={`lb-rank r${r <= 3 ? r : ''}`}>{r}</span>;
  const who = (r) => <span className="lb-who">{r.num && <span className="muted tnum">{r.num}</span>}<b>{r.name}</b></span>;
  const cur = tab === 'overall' ? null : L.byMetric[tab];
  return <>
    <section className="card">
      <div className="card-head"><div><h2>Leaderboard</h2><span className="muted small">Each player's best result per test{H.isCoach ? '. Players and parents on this team see this page.' : '.'}</span></div>
        {H.isCoach && <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" className="cb" checked={shared} onChange={(e) => toggle(e.target.checked)} /> Visible to players</label>}</div>
      {!keys.length ? <p className="muted small" style={{ margin: 0 }}>No results to show yet.</p> : <>
        <div className="lb-tabs">
          <button className={tab === 'overall' ? 'on' : ''} onClick={() => setTab('overall')}>Overall</button>
          {keys.map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{METRICS[k].label}</button>)}
        </div>
        {tab === 'overall' ? <>
          <p className="muted small" style={{ margin: 0 }}>Average standing across the tests each player has done: 100 means best on the team in every test, 0 means last. Players need at least {L.need} test{L.need === 1 ? '' : 's'} to be ranked.</p>
          {!L.overall.length ? <p className="muted small" style={{ margin: 0 }}>Not enough results yet for an overall ranking.</p>
            : <table className="tbl lb-tbl"><thead><tr><th>#</th><th>Player</th><th className="num">Score</th><th className="num">Tests</th></tr></thead>
              <tbody>{L.overall.map((s) => <tr key={s.player_id}><td>{medal(s.rank)}</td><td>{who(s)}</td><td className="num tnum"><b>{Math.round(s.score)}</b></td><td className="num tnum muted">{s.tests}</td></tr>)}</tbody></table>}
        </> : <table className="tbl lb-tbl"><thead><tr><th>#</th><th>Player</th><th className="num">{METRICS[tab].long}{METRICS[tab].unit && ` (${METRICS[tab].unit})`}</th><th className="num">Date</th></tr></thead>
          <tbody>{cur.map((r) => <tr key={r.player_id}><td>{medal(r.rank)}</td><td>{who(r)}</td><td className="num tnum"><b>{fmt(tab, r.value)}</b></td><td className="num muted">{r.tested_on ? fmtDate(r.tested_on) : ''}</td></tr>)}</tbody></table>}
        {tab !== 'overall' && METRICS[tab].lower && <span className="muted small">Lowest time ranks first.</span>}
      </>}
    </section>
  </>;
}
