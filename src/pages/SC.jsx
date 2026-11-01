// S&C: day themes + intensity calendar, periodization, and the Workload tab.
import { useState, Fragment } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, fromISO, todayISO, MON, DOW, gameView, ourGames, clone } from '../lib/util.js';
import { INT, DEFAULT_LOADS, DEFAULT_BAND, RATED, mondayOf, addDays, scWeeks, scSeries, niceTicks } from '../lib/sc.js';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';
import Table from '../components/Table.jsx';
import InjuredCard from '../components/InjuredCard.jsx';
import Tests, { GymGroups, Leaderboard } from './Tests.jsx';
import { rowsToSc, scField, SC_TEMPLATE } from '../lib/imports.js';
import ImportSource from '../components/ImportSource.jsx';

const cap = (k) => k[0].toUpperCase() + k.slice(1);
export function IBadge({ k }) { const i = INT.find((x) => x.k === (k || '')) || INT[0]; return <span className={`ibadge i-${i.k || 'none'}`} aria-hidden="true">{i.short}</span>; }
const Legend = () => <div className="sc-legend">{INT.slice(1).map((i) => <span key={i.k} className="ichip"><IBadge k={i.k} />{i.label}</span>)}<span className="ichip"><IBadge k="" />Unrated</span></div>;

export default function SC() {
  const H = useHub();
  const [tab, setTab] = useState('cal');
  return <>
    <PageHead title="S&C" actions={H.isCoach && (tab === 'cal' || tab === 'load') && <button className="btn" onClick={() => H.openDialog((c) => <ScImport close={c} />)}><Icon n="refresh" /> Import: file or paste</button>} />
    <InjuredCard />
    <div className="seg" role="tablist">{[['cal', 'Calendar'], ['load', 'Workload'], ['gym', 'Gym groups'], ['tests', 'Tests'], ['board', 'Leaderboard']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'cal' ? <ScCalendar /> : tab === 'load' ? <Workload /> : tab === 'gym' ? <GymGroups key={H.teamId} /> : tab === 'board' ? <Leaderboard key={H.teamId} /> : <Tests key={H.teamId} />}
  </>;
}

function ScCalendar() {
  const H = useHub(); const sc = H.tdata.sc, weeks = scWeeks(sc), today = todayISO(), thisMon = mondayOf(today);
  const games = {}; ourGames(H.tdata.league.games, H.team).forEach((g) => { (games[g.date] = games[g.date] || []).push(g); });
  const jump = () => { const m = mondayOf(todayISO()); const t = weeks.includes(m) ? m : (weeks.find((w) => w > m) || weeks[weeks.length - 1]); const e = document.getElementById('wk-' + t); if (e) e.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  const addWeek = () => {
    const mk = weeks.length ? addDays(weeks[weeks.length - 1], 7) : mondayOf(todayISO());
    const prev = weeks.length ? (sc.weeks || {})[weeks[weeks.length - 1]] || {} : {};
    const w = { phase: prev.phase || '', week: prev.week && /^\d+$/.test(prev.week) ? String(+prev.week + 1) : '' };
    H.save((api) => api.saveScWeek(H.teamId, mk, w), { optimistic: (d) => ({ ...d, sc: { ...d.sc, weeks: { ...(d.sc.weeks || {}), [mk]: w } } }) });
    setTimeout(() => { const e = document.getElementById('wk-' + mk); if (e) e.scrollIntoView({ block: 'center' }); }, 50);
  };
  const tools = <div className="sc-tools"><Legend /><div className="head-actions">{weeks.length > 0 && <button className="btn sm" onClick={jump}>This week</button>}{H.isCoach && <button className="btn sm primary" onClick={addWeek}><Icon n="plus" /> Add week</button>}</div></div>;
  if (!weeks.length) return <>{tools}<div className="empty"><b>No S&C plan yet.</b>Add a week to start planning day themes.</div></>;
  // this week on top, then the weeks ahead in order, then earlier weeks, most recent first
  const ahead = weeks.filter((mk) => mk >= thisMon), past = weeks.filter((mk) => mk < thisMon).reverse();
  return <>{tools}<div className="sc-list">{[...ahead, ...past].map((mk) => {
    const w = (sc.weeks || {})[mk] || {};
    return <Fragment key={mk}>{mk === past[0] && <h3 className="sc-earlier">Earlier weeks</h3>}<section className={`sc-week ${mk === thisMon ? 'now' : ''}`} id={'wk-' + mk}>
      <div className="sc-whead"><b>Week of {MON[fromISO(mk).getMonth()]} {fromISO(mk).getDate()}</b>
        {w.phase && <span className="phase">{w.phase}</span>}{w.week && <span className="muted small">Season week {w.week}</span>}
        {H.isCoach && <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => H.openDialog((c) => <WeekForm mk={mk} close={c} />)}><Icon n="edit" /> Periodization</button>}</div>
      <div className="sc-days">{[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const d = addDays(mk, i), x = (sc.days || {})[d] || {}, gs = games[d] || [], dd = fromISO(d);
        const label = (INT.find((v) => v.k === (x.intensity || '')) || INT[0]).label;
        return <button key={d} className={`sc-cell i-${x.intensity || 'none'} ${H.isCoach ? '' : 'ro'}`} onClick={() => H.isCoach && H.openDialog((c) => <DayForm d={d} close={c} />)} aria-label={`${fmtDate(d, true)}: ${x.theme || 'nothing planned'}, ${label}`}>
          <span className="sc-dtop"><span className={d === today ? 'today' : ''}>{DOW[dd.getDay()]} {dd.getDate()}</span>{(x.intensity || x.theme) && <IBadge k={x.intensity} />}</span>
          <span className="sc-theme">{x.theme || ''}</span>
          {gs.length > 0 && x.intensity !== 'game' && <span className="sc-flag">{gs.map((g) => { const v = gameView(g, H.team); return (v.home ? 'vs ' : '@ ') + v.opp; }).join(', ')}</span>}
          {x.pdfColor === 'cyan' && !x.intensity && <span className="sc-flag">Cyan in sheet</span>}
        </button>;
      })}</div></section></Fragment>;
  })}</div></>;
}

function DayForm({ d, close }) {
  const H = useHub(); const x = (H.tdata.sc.days || {})[d] || {};
  const [theme, setTheme] = useState(x.theme || ''); const [k, setK] = useState(x.intensity || ''); const [note, setNote] = useState(x.note || '');
  const put = (val) => { close(); H.save((api) => api.saveScDay(H.teamId, d, val), { optimistic: (s) => { const days = { ...(s.sc.days || {}) }; if (val) days[d] = val; else delete days[d]; return { ...s, sc: { ...s.sc, days } }; } }); };
  const submit = () => {
    const t = theme.trim(), n = note.trim();
    if (!t && !k && !n) return put(null);
    const val = { theme: t, intensity: k, ...(n ? { note: n } : {}) }; if (!k && x.pdfColor) val.pdfColor = x.pdfColor;
    put(val);
  };
  return <Modal title={fmtDate(d, true)} onClose={close}
    actions={<>{(x.theme || x.intensity) && <><button className="btn danger" onClick={() => put(null)}><Icon n="trash" /> Clear day</button><span className="spacer" /></>}<button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></>}>
    <label className="field"><span>Day theme</span><input className="input" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. Brick 1, Regen, Supercharge" /></label>
    <div className="field"><span>Intensity</span><div className="iseg">{INT.map((i) => <button type="button" key={i.k} className={k === i.k ? 'on' : ''} aria-pressed={k === i.k} onClick={() => setK(i.k)}><IBadge k={i.k} />{i.label}</button>)}</div></div>
    <label className="field"><span>Notes</span><textarea className="input" rows="3" value={note} onChange={(e) => setNote(e.target.value)} /></label>
    {x.pdfColor === 'cyan' && <div className="hint">This day was cyan in the S&C sheet, which isn’t in the light/moderate/heavy code. Pick an intensity to include it in workload.</div>}
  </Modal>;
}

function WeekForm({ mk, close }) {
  const H = useHub(); const sc = H.tdata.sc, w = (sc.weeks || {})[mk] || {};
  const [phase, setPhase] = useState(w.phase || ''); const [wk, setWk] = useState(w.week || '');
  const phases = [...new Set(Object.values(sc.weeks || {}).map((x) => x.phase).filter(Boolean))];
  const submit = () => { const val = { phase: phase.trim(), week: wk.trim() }; close(); H.save((api) => api.saveScWeek(H.teamId, mk, val), { optimistic: (d) => ({ ...d, sc: { ...d.sc, weeks: { ...(d.sc.weeks || {}), [mk]: val } } }) }); };
  const del = async () => {
    close();
    if (!(await H.confirm('Remove week?', `The periodization and all 7 day themes for the week of ${fmtDate(mk)} will be removed.`, 'Remove week'))) return;
    const last = addDays(mk, 6);
    H.save((api) => api.removeScWeek(H.teamId, mk, last), { optimistic: (d) => { const s = clone(d.sc); delete (s.weeks || {})[mk]; for (let i = 0; i < 7; i++) delete (s.days || {})[addDays(mk, i)]; return { ...d, sc: s }; } });
  };
  return <Modal title={`Week of ${fmtDate(mk)}`} onClose={close}
    actions={<><button className="btn danger" onClick={del}><Icon n="trash" /> Remove week</button><span className="spacer" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></>}>
    <div className="row2"><label className="field"><span>Periodization</span><input className="input" list="scPhases" value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="e.g. Accumulation week 1" /><datalist id="scPhases">{phases.map((p) => <option key={p} value={p} />)}</datalist></label>
      <label className="field"><span>Season week</span><input className="input" inputMode="numeric" value={wk} onChange={(e) => setWk(e.target.value)} /></label></div>
  </Modal>;
}

/* ---------- workload ---------- */
const CH = { W: 900, L: 44, R: 14, T: 12 };
const f = (v, n = 2) => (v == null ? '—' : (+v).toFixed(n));

function Workload() {
  const H = useHub(); const sc = H.tdata.sc, { weeks, loads } = scSeries(sc), band = { ...DEFAULT_BAND, ...(sc.band || {}) };
  const [tip, setTip] = useState(null);
  if (!weeks.length) return <div className="empty"><b>No S&C plan yet.</b>Workload is calculated from the colour of each day in the Calendar tab.</div>;
  const thisMon = mondayOf(todayISO()); const cur = weeks.find((w) => w.mk === thisMon) || [...weeks].reverse().find((w) => w.mk <= thisMon) || weeks[0];
  const unr = weeks.reduce((a, w) => a + w.unrated, 0);
  const onMove = (e) => { const el = e.target.closest && e.target.closest('[data-wk]'); setTip(el ? { i: +el.dataset.wk, x: e.clientX, y: e.clientY } : null); };
  const chartProps = { onPointerMove: onMove, onPointerLeave: () => setTip(null) };
  const saveNum = (key, field, base) => (e) => {
    const v = parseFloat(e.target.value); if (isNaN(v) || v < 0) { H.toast('Enter a number of 0 or more.'); return; }
    const value = { ...base, ...(sc[key === 'sc_loads' ? 'loads' : 'band'] || {}), [field]: v };
    H.save((api) => api.saveSetting(H.teamId, key, value), { optimistic: (d) => ({ ...d, sc: { ...d.sc, [key === 'sc_loads' ? 'loads' : 'band']: value } }) });
  };
  return <>
    <section className="kpis">
      <div className="tile"><div className="tile-k">Acute load (7 days)</div><div className="tile-v tnum">{f(cur.acute, 0)}</div><div className="tile-s">Week of {fmtDate(cur.mk)}</div></div>
      <div className="tile"><div className="tile-k">Chronic load (28-day weekly avg)</div><div className="tile-v tnum">{f(cur.chronic, 1)}</div><div className="tile-s">{cur.chronic == null ? 'Needs 4 weeks of data' : 'Rolling 4 weeks'}</div></div>
      <div className="tile"><div className="tile-k">Acute : chronic</div><div className="tile-v tnum">{f(cur.acwr)}</div><div className="tile-s">{cur.acwr == null ? 'Needs 4 weeks of data' : `${cur.acwr < band.lo ? 'Below' : cur.acwr > band.hi ? 'Above' : 'Inside'} reference band ${band.lo}–${band.hi}`}</div></div>
      <div className="tile"><div className="tile-k">This week</div><div className="tile-v tnum">{cur.sessions} sessions</div><div className="tile-s">{RATED.map((k) => `${cur.c[k]} ${k[0].toUpperCase()}`).join(' · ')}</div></div>
    </section>
    <section className="card chart-card"><div className="chart-title"><h3>Volume: sessions per week by intensity</h3><div className="sc-legend">{RATED.map((k) => <span key={k} className="ichip"><IBadge k={k} />{cap(k)}</span>)}</div></div>
      <div className="chart-wrap" {...chartProps}><VolChart weeks={weeks} /></div></section>
    <section className="card chart-card"><div className="chart-title"><h3>Intensity: average load per session</h3><span className="muted small">Load units: {RATED.map((k) => `${k[0].toUpperCase()}=${loads[k]}`).join(', ')}</span></div>
      <div className="chart-wrap" {...chartProps}><LineChart weeks={weeks} get={(w) => w.avg} max={Math.max(3, ...weeks.map((w) => w.avg || 0))} fmt={(v) => v.toFixed(1)} label="Avg load" /></div></section>
    <section className="card chart-card"><div className="chart-title"><h3>Acute : chronic workload ratio</h3><span className="muted small">Shaded: reference band {band.lo}–{band.hi} (placeholder, set your own)</span></div>
      <div className="chart-wrap" {...chartProps}><LineChart weeks={weeks} get={(w) => w.acwr} max={Math.max(2, ...weeks.map((w) => w.acwr || 0))} band={band} fmt={(v) => v.toFixed(2)} label="ACWR" /></div></section>
    <section className="card"><div className="card-head"><h2>Weekly numbers</h2></div>
      <Table id="scload" cols={[{ k: 'wk', label: 'Week', always: true }, { k: 'ph', label: 'Periodization' }, { k: 'L', label: 'L', num: true }, { k: 'M', label: 'M', num: true }, { k: 'H', label: 'H', num: true }, { k: 'G', label: 'G', num: true }, { k: 'n', label: 'Sessions', num: true }, { k: 'load', label: 'Load', num: true }, { k: 'avg', label: 'Avg', num: true }, { k: 'ac', label: 'Acute', num: true }, { k: 'ch', label: 'Chronic', num: true }, { k: 'r', label: 'A:C', num: true }]}
        rows={weeks.map((w) => ({ wk: fmtDate(w.mk), ph: w.phase, L: w.c.light, M: w.c.moderate, H: w.c.heavy, G: w.c.game, n: w.sessions, load: w.load, avg: f(w.avg, 1), ac: w.acute, ch: f(w.chronic, 1), r: f(w.acwr) }))} /></section>
    {H.isCoach && <section className="card"><div className="card-head"><h2>Workload settings</h2><span className="pill">Placeholder values</span></div>
      <p className="muted small" style={{ margin: 0 }}>Each day counts as one session, and its load comes from its colour. These units and the reference band are starting values, not a validated scale. Change them to match how you rate sessions.{unr > 0 && ` ${unr} planned day${unr === 1 ? ' has' : 's have'} a theme but no colour, so ${unr === 1 ? 'it isn’t' : 'they aren’t'} counted; rate them in the Calendar tab.`}</p>
      <div className="settings-row" key={H.teamId}>{RATED.map((k) => <label key={k} className="field"><span><IBadge k={k} /> {cap(k)}</span><input className="input" type="number" step="0.5" min="0" defaultValue={loads[k]} onBlur={saveNum('sc_loads', k, DEFAULT_LOADS)} /></label>)}
        <label className="field"><span>Band low</span><input className="input" type="number" step="0.05" min="0" defaultValue={band.lo} onBlur={saveNum('sc_band', 'lo', DEFAULT_BAND)} /></label>
        <label className="field"><span>Band high</span><input className="input" type="number" step="0.05" min="0" defaultValue={band.hi} onBlur={saveNum('sc_band', 'hi', DEFAULT_BAND)} /></label></div></section>}
    {tip && weeks[tip.i] && <Tip w={weeks[tip.i]} x={tip.x} y={tip.y} />}
  </>;
}

function Tip({ w, x, y }) {
  const left = x + 14 + 190 > innerWidth - 8 ? x - 190 - 14 : x + 14, top = y + 14 + 190 > innerHeight - 8 ? y - 190 - 14 : y + 14;
  return <div className="ctip" style={{ left, top }}><b>Week of {fmtDate(w.mk)}</b>{w.phase && <div className="muted">{w.phase}</div>}
    {RATED.map((k) => <div key={k} className="r"><span><IBadge k={k} /> {cap(k)}</span><span>{w.c[k]}</span></div>)}
    <div className="r"><span>Sessions</span><b>{w.sessions}</b></div><div className="r"><span>Load</span><span>{w.load}</span></div><div className="r"><span>Avg per session</span><span>{f(w.avg, 1)}</span></div><div className="r"><span>Acute : chronic</span><span>{f(w.acwr, 2)}</span></div></div>;
}

const ChartStyle = () => <style>{'.sc-chart .ax{font:11px var(--f-body);fill:var(--muted)}.sc-chart .grid{stroke:var(--line);stroke-width:1}.sc-chart .base{stroke:var(--muted);stroke-width:1}.sc-chart .ln{fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round}.sc-chart .dot{fill:var(--accent);stroke:var(--surface);stroke-width:2}.sc-chart .lab{font:600 12px var(--f-body);fill:var(--fg)}.sc-chart .band{fill:var(--accent);opacity:.12}.sc-chart .now{stroke:var(--fg);stroke-dasharray:3 3;opacity:.5}.sc-chart [data-wk]:hover{fill:var(--fg);fill-opacity:.05}'}</style>;
function XAxis({ weeks, H }) {
  const n = weeks.length, bw = (CH.W - CH.L - CH.R) / n, step = Math.ceil(n / 12), thisMon = mondayOf(todayISO());
  return weeks.map((w, i) => { const x = CH.L + bw * i + bw / 2; return <g key={w.mk}>
    {i % step === 0 && <text x={x} y={H - 6} textAnchor="middle" className="ax">{MON[fromISO(w.mk).getMonth()]} {fromISO(w.mk).getDate()}</text>}
    {w.mk === thisMon && <line x1={x} x2={x} y1={CH.T} y2={H - 22} className="now" />}
    <rect x={CH.L + bw * i} y={CH.T} width={bw} height={H - 22 - CH.T} fill="transparent" data-wk={i} /></g>; });
}
function YGrid({ H, max, ticks, fmt }) {
  const ph = H - 22 - CH.T;
  return ticks.map((t) => { const y = CH.T + ph - (t / max) * ph; return <g key={t}><line x1={CH.L} x2={CH.W - CH.R} y1={y} y2={y} className="grid" /><text x={CH.L - 8} y={y + 4} textAnchor="end" className="ax">{fmt(t)}</text></g>; });
}
function VolChart({ weeks }) {
  const H = 230, ph = H - 22 - CH.T, nt = niceTicks(Math.max(7, ...weeks.map((w) => w.sessions))), max = nt.max;
  const n = weeks.length, bw = (CH.W - CH.L - CH.R) / n, barW = Math.max(4, Math.min(26, bw * 0.62));
  const cv = { light: 'var(--i-light)', moderate: 'var(--i-mod)', heavy: 'var(--i-heavy)', game: 'var(--i-game)' };
  const bars = [];
  weeks.forEach((w, i) => {
    let y = CH.T + ph; const x = CH.L + bw * i + (bw - barW) / 2; const segs = RATED.filter((k) => w.c[k]);
    segs.forEach((k, j) => {
      const hgt = (w.c[k] / max) * ph; const top = j === segs.length - 1; y -= hgt; const r = top ? Math.min(4, barW / 2, hgt) : 0;
      bars.push(r ? <path key={w.mk + k} d={`M${x},${y + hgt - 1} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + hgt - 1} Z`} fill={cv[k]} />
        : <rect key={w.mk + k} x={x} y={y} width={barW} height={Math.max(0, hgt - 1)} fill={cv[k]} />);
    });
  });
  return <svg viewBox={`0 0 ${CH.W} ${H}`} className="sc-chart" role="img" aria-label="Stacked bars: sessions per week by intensity"><ChartStyle /><YGrid H={H} max={max} ticks={nt.ticks} fmt={(v) => v} /><line x1={CH.L} x2={CH.W - CH.R} y1={CH.T + ph} y2={CH.T + ph} className="base" />{bars}<XAxis weeks={weeks} H={H} /></svg>;
}
function LineChart({ weeks, get, max: m, band, fmt, label }) {
  const H = 200, ph = H - 22 - CH.T, nt = niceTicks(m), max = nt.max, n = weeks.length, bw = (CH.W - CH.L - CH.R) / n;
  const pt = (v, i) => [CH.L + bw * i + bw / 2, CH.T + ph - (v / max) * ph];
  let path = '', open = false, last = null;
  weeks.forEach((w, i) => { const v = get(w); if (v == null) { open = false; return; } const [x, y] = pt(v, i); path += (open ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); open = true; last = [x, y, v]; });
  return <svg viewBox={`0 0 ${CH.W} ${H}`} className="sc-chart" role="img" aria-label={`${label} by week`}><ChartStyle />
    {band && <rect x={CH.L} width={CH.W - CH.L - CH.R} y={CH.T + ph - (Math.min(band.hi, max) / max) * ph} height={((Math.min(band.hi, max) - Math.min(band.lo, max)) / max) * ph} className="band" />}
    <YGrid H={H} max={max} ticks={nt.ticks} fmt={fmt} /><line x1={CH.L} x2={CH.W - CH.R} y1={CH.T + ph} y2={CH.T + ph} className="base" /><path d={path} className="ln" />
    {last && <><circle cx={last[0]} cy={last[1]} r="4.5" className="dot" /><text x={Math.min(last[0] + 8, CH.W - CH.R - 2)} y={last[1] - 8} className="lab" textAnchor={last[0] > CH.W - 80 ? 'end' : 'start'}>{fmt(last[2])}</text></>}
    <XAxis weeks={weeks} H={H} /></svg>;
}

/* S&C plan import: a CSV or PDF table with a Date column plus Theme, Intensity, Note, Phase,
   Week. Days in the file replace those days; everything else in the plan is kept. */
function ScImport({ close }) {
  const H = useHub();
  const [res, setRes] = useState(null);
  const take = (rows, label) => {
    const r = rowsToSc(rows);
    const dates = Object.keys(r.days).sort();
    if (!dates.length && !Object.keys(r.weeks).length) throw new Error('No dated sessions found.');
    const cur = H.tdata.sc.days || {};
    setRes({ ...r, file: label, dates, replaced: dates.filter((d) => cur[d]).length });
  };
  const go = () => {
    close();
    H.save((api) => api.saveScBulk(H.teamId, res.days, res.weeks), { reload: true }).then(() => H.toast(`S&C plan updated: ${res.dates.length} days`)).catch(() => {});
  };
  return <Modal title="Import S&C plan" wide onClose={close}
    actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!res} onClick={go}>Import</button></>}>
    <p className="muted small" style={{ margin: 0 }}>A CSV, a PDF with selectable text, or cells pasted from a spreadsheet, laid out as a table: one row per day with <b>Date</b> and any of <b>Theme</b>, <b>Intensity</b> (off, light, moderate, heavy, game), <b>Note</b>, <b>Phase</b>, <b>Week</b>. Days in the file replace those days in the plan; other days stay as they are. A colour-coded calendar PDF can't be read this way: export it as a table or use the template.</p>
    <ImportSource onRows={take} isHeading={scField} template={SC_TEMPLATE} templateName="s&c-plan-template.csv" />
    {res && <>
      <div className="small"><b>{res.file}</b>: {res.dates.length} days{res.dates.length ? ` from ${fmtDate(res.dates[0])} to ${fmtDate(res.dates[res.dates.length - 1])}` : ''}{res.replaced ? `, ${res.replaced} already in the plan (will be replaced)` : ''}, {Object.keys(res.weeks).length} week labels{res.skipped ? `, ${res.skipped} rows without a readable date skipped` : ''}.</div>
      {res.unknown.length > 0 && <div className="hint">Intensity not recognised, left unrated: {res.unknown.join(', ')}</div>}
      <div className="tbl-wrap" style={{ maxHeight: 300, overflow: 'auto' }}><table className="tbl">
        <thead><tr><th>Date</th><th>Theme</th><th>Intensity</th><th>Note</th></tr></thead>
        <tbody>{res.dates.map((d) => { const x = res.days[d]; return <tr key={d}><td>{fmtDate(d)}</td><td>{x.theme}</td><td><span className="ichip"><IBadge k={x.intensity} />{(INT.find((i) => i.k === x.intensity) || INT[0]).label}</span></td><td>{x.note || ''}</td></tr>; })}</tbody>
      </table></div>
    </>}
  </Modal>;
}
