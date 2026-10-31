// Game day / Lines (hockey): forward lines, defence pairs, goalies, extras, power-play and
// penalty-kill units. One set of default lines per team, plus per-game lines that start from
// the default the first time a coach changes them. The selected unit is shown on the rink and
// the roster sits on the right. Coaches add players by clicking a spot or dragging from the
// roster, and swap them by dragging; everyone else sees the lines read-only. Print / PDF
// uses the browser's print dialog (Save as PDF) with a print-only layout.
import { useEffect, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, fmtTime, todayISO, gameView, ourGames } from '../lib/util.js';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';
import Rink from '../components/Rink.jsx';
import { InjuryMark, byNumber } from './Roster.jsx';
import { rowsToSlots, lineField, LINES_TEMPLATE } from '../lib/imports.js';
import ImportSource from '../components/ImportSource.jsx';

const FWD = [1, 2, 3, 4], DEF = [1, 2, 3], UNITS = [1, 2];
const POS_NAME = { LW: 'Left wing', C: 'Centre', RW: 'Right wing', L: 'Left D', R: 'Right D', LD: 'Left D', RD: 'Right D', F1: 'Forward', F2: 'Forward' };
const PP_POS = ['LW', 'C', 'RW', 'LD', 'RD'], PK_POS = ['F1', 'F2', 'LD', 'RD'];
export const slotLabel = (id) => {
  let m;
  if ((m = id.match(/^F(\d)(LW|C|RW)$/))) return `Line ${m[1]} · ${POS_NAME[m[2]]}`;
  if ((m = id.match(/^D(\d)(L|R)$/))) return `Pair ${m[1]} · ${POS_NAME[m[2]]}`;
  if ((m = id.match(/^(PP|PK)(\d)(\w+)$/))) return `${m[1] === 'PP' ? 'Power play' : 'Penalty kill'} ${m[2]} · ${POS_NAME[m[3]]}`;
  if (id === 'G1') return 'Starting goalie';
  if (id === 'G2') return 'Backup goalie';
  return 'Extra';
};
// a player can be on a 5-on-5 line and on special teams, but only once within each of these
const group = (id) => (/^P[PK]\d/.test(id) ? id.slice(0, 3) : 'EV');
const shortSlot = (id) => { const m = id.match(/^F(\d)(\w+)$/) || id.match(/^D(\d)(\w)$/); return m ? `${id[0]}${m[1]} ${m[2]}` : /^P[PK]/.test(id) ? id.slice(0, 3) : id[0] === 'G' ? (id === 'G1' ? 'G' : 'G2') : 'Extra'; };

// where each unit stands on the rink (feet; our goal on the left, attacking right)
const SPOTS = (view, f, d) => {
  if (view === 'EV') return [['G1', 'G', 17, 42.5], [`D${d}L`, 'LD', 55, 24], [`D${d}R`, 'RD', 55, 61], [`F${f}LW`, 'LW', 88, 14], [`F${f}C`, 'C', 93, 42.5], [`F${f}RW`, 'RW', 88, 69]];
  if (view.startsWith('PP')) return [['G1', 'G', 17, 42.5], [`${view}LD`, 'LD', 132, 22], [`${view}RD`, 'RD', 132, 63], [`${view}LW`, 'LW', 160, 13], [`${view}C`, 'C', 164, 42.5], [`${view}RW`, 'RW', 160, 72]];
  return [['G1', 'G', 17, 42.5], [`${view}LD`, 'LD', 33, 21], [`${view}RD`, 'RD', 33, 64], [`${view}F1`, 'F', 58, 29], [`${view}F2`, 'F', 58, 56]];
};
const short = (s, n = 15) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export default function GameDay() {
  const H = useHub(); const t = H.team;
  const games = ourGames(H.tdata.league.games, t);
  const today = todayISO();
  const [all, setAll] = useState(null);
  const [roster, setRoster] = useState([]);
  const [key, setKey] = useState(() => { const n = games.find((g) => g.date >= today); return n ? n.id : 'default'; });
  const [view, setView] = useState('EV');
  const [unit, setUnit] = useState({ f: 1, d: 1 });
  const [free, setFree] = useState(false);
  const load = () => H.api.listLineups(t.id).then(setAll).catch((e) => { setAll({}); H.toast('Could not load lines: ' + e.message); });
  useEffect(() => {
    load();
    H.api.listPlayers(t.id).then((r) => setRoster(r.filter((p) => p.active !== false).sort(byNumber))).catch(() => setRoster([]));
  }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const own = all && all[key];
  const usingDefault = key !== 'default' && !own;
  const slots = (own || (all && all.default) || {}).slots || {};
  const game = games.find((g) => g.id === key);
  const edit = H.isCoach;
  const byId = Object.fromEntries(roster.map((p) => [p.id, p]));
  // a slot linked to a roster player shows the roster's current number and name
  const who = (s) => (s && s.pid && byId[s.pid] ? { ...s, num: byId[s.pid].num, name: byId[s.pid].name, player: byId[s.pid] } : s);

  const write = (next) => {
    setAll((a) => ({ ...a, [key]: { slots: next, updatedAt: Date.now() } }));
    H.save((api) => api.saveLineup(t.id, key, next)).catch(() => load());
  };
  const put = (id, p) => {
    const n = { ...slots };
    if (p && p.pid) Object.keys(n).forEach((k) => { if (k !== id && group(k) === group(id) && n[k].pid === p.pid) delete n[k]; });
    if (p) n[id] = p; else delete n[id];
    write(n);
  };
  const swap = (a, b) => { if (a === b) return; const n = { ...slots }; const x = n[a], y = n[b]; if (y) n[a] = y; else delete n[a]; if (x) n[b] = x; else delete n[b]; write(n); };
  const drop = (from, to) => {
    if (to === '__roster') { if (!from.startsWith('pid:')) put(from, null); return; }
    if (from.startsWith('pid:')) { const p = byId[from.slice(4)]; if (p) put(to, { pid: p.id, num: p.num, name: p.name }); return; }
    swap(from, to);
  };
  const openSlot = (id) => edit && !id.startsWith('pid:') && H.openDialog((c) => <PlayerForm id={id} p={slots[id]} roster={roster} close={c} onSave={(p) => put(id, p)} />);
  const drag = useSlotDrag(edit, drop, openSlot);

  const useDefault = async () => {
    if (!(await H.confirm('Use default lines?', 'This game\'s own lines are removed and it shows your default lines again.', 'Use default'))) return;
    setAll((a) => { const n = { ...a }; delete n[key]; return n; });
    H.save((api) => api.deleteLineup(t.id, key)).catch(() => load());
  };
  const clearAll = async () => {
    if (await H.confirm('Clear all lines?', `Every position in ${key === 'default' ? 'your default lines' : 'this game\'s lines'} is emptied, special teams included.`, 'Clear')) write({});
  };

  const label = (g) => { const v = gameView(g, t); return `${fmtDate(g.date)} · ${v.home ? 'vs' : '@'} ${v.opp}`; };
  const acts = <>
    <select className="select gd-pick" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Lines for">
      <option value="default">Default lines</option>{games.map((g) => <option key={g.id} value={g.id}>{label(g)}</option>)}
    </select>
    {edit && <button className="btn" disabled={!all} onClick={() => H.openDialog((c) => <LinesImport roster={roster} target={game ? label(game) : 'your default lines'} close={c} onSave={write} />)}><Icon n="refresh" /> Import: file or paste</button>}
    <button className="btn" onClick={() => window.print()} disabled={!all}><Icon n="clipboard" /> Print / PDF</button>
  </>;

  // plain functions, not components, so a chip keeps its element (and pointer capture) while dragging
  const chip = (id) => {
    const p = who(slots[id]);
    return <button type="button" className={`gd-chip ${p ? '' : 'empty'} ${drag.over === id ? 'over' : ''}`} data-slot={id} disabled={!edit && !p} key={id}
      aria-label={`${slotLabel(id)}: ${p ? `${p.num ? '#' + p.num + ' ' : ''}${p.name}` : 'empty'}`} {...drag.handlers(id, !!p)} onClick={(e) => { if (e.detail === 0) openSlot(id); }}>
      {p ? <>{p.num && <b className="tnum">{p.num}</b>}<span>{p.name}</span>{edit && p.player && <InjuryMark p={p.player} />}</> : edit ? <><Icon n="plus" /><span>Add</span></> : <span>—</span>}
    </button>;
  };
  const rowBtn = (v, txt, on) => <button className={`gd-row ${on ? 'on' : ''}`} onClick={() => setView(v)}>{txt}</button>;
  const where = {}; Object.entries(slots).forEach(([k, s]) => { if (s.pid) (where[s.pid] = where[s.pid] || []).push(k); });
  const dressed = new Set(Object.entries(slots).filter(([k, s]) => s.pid && /^[FDG]\d/.test(k)).map(([, s]) => s.pid));
  const shown = free ? roster.filter((p) => !where[p.id]) : roster;

  return <>
    <PageHead title="Game day / Lines" actions={acts} />
    {!all ? <div className="loading">Loading lines…</div> : <>
      <div className="print-only gd-print-head"><b>{t.name}</b> · {game ? `${label(game)}${game.time ? ' · ' + fmtTime(game.time) : ''}${game.venue ? ' · ' + game.venue : ''}` : 'Default lines'}</div>
      <div className="gd-status no-print">
        {game ? <span>{fmtDate(game.date, true)}{game.time ? ' · ' + fmtTime(game.time) : ''}{game.venue ? ' · ' + game.venue : ''}</span> : <span>Default lines. Every game uses these until you change that game's lines.</span>}
        {usingDefault && <span className="pill">Using default lines</span>}
        {edit && <span className="gd-tools">
          {key !== 'default' && own && <button className="btn sm" onClick={useDefault}>Use default lines</button>}
          {Object.keys(slots).length > 0 && !usingDefault && <button className="btn sm ghost" onClick={clearAll}>Clear all</button>}
        </span>}
      </div>
      <div className="gd-grid">
        <div className="gd-main">
          <section className="card gd-rink-card no-print">
            <div className="card-head"><h2>On the ice</h2>
              <div className="acts">
                <div className="seg" aria-label="Unit">{['EV', 'PP1', 'PP2', 'PK1', 'PK2'].map((v) => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v === 'EV' ? '5 on 5' : v}</button>)}</div>
                {view === 'EV' && <>
                  <div className="seg" aria-label="Forward line">{FWD.map((n) => <button key={n} className={unit.f === n ? 'on' : ''} onClick={() => setUnit({ ...unit, f: n })}>F{n}</button>)}</div>
                  <div className="seg" aria-label="Defence pair">{DEF.map((n) => <button key={n} className={unit.d === n ? 'on' : ''} onClick={() => setUnit({ ...unit, d: n })}>D{n}</button>)}</div></>}
              </div>
            </div>
            <Rink label={`${view === 'EV' ? `Line ${unit.f} and pair ${unit.d}` : view} on the rink`}>
              {SPOTS(view, unit.f, unit.d).map(([id, pos, x, y]) => { const p = who(slots[id]); return (
                <g key={id} className={`gd-token ${p ? '' : 'empty'} ${edit ? 'edit' : ''} ${drag.over === id ? 'over' : ''}`} data-slot={id} transform={`translate(${x} ${y})`}
                  role={edit ? 'button' : undefined} tabIndex={edit ? 0 : undefined} aria-label={`${slotLabel(id)}: ${p ? p.name : 'empty'}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSlot(id); } }} {...drag.handlers(id, !!p)}>
                  <circle r="6.5" />
                  <text className="gd-num" dy="1.9">{p ? p.num || pos : edit ? '+' : pos}</text>
                  <text className="gd-name" y="11.5">{p ? short(p.name) : pos}</text>
                </g>); })}
            </Rink>
            {edit && <p className="muted small" style={{ margin: 0 }}>Click a spot to add a player, or drag one in from the roster. Drag players between spots to swap them, or back to the roster to take them out (on a phone: press and hold, then drag).</p>}
          </section>
          <section className="card gd-lines">
            <div className="card-head"><h2>Lines</h2></div>
            <table className="gd-table"><thead><tr><th /><th>LW</th><th>C</th><th>RW</th></tr></thead>
              <tbody>{FWD.map((n) => <tr key={n} className={view === 'EV' && unit.f === n ? 'on' : ''}>
                <th><button className="gd-row" onClick={() => { setView('EV'); setUnit({ ...unit, f: n }); }}>F{n}</button></th>
                {['LW', 'C', 'RW'].map((p) => <td key={p}>{chip(`F${n}${p}`)}</td>)}</tr>)}</tbody></table>
            <table className="gd-table"><thead><tr><th /><th>LD</th><th>RD</th></tr></thead>
              <tbody>{DEF.map((n) => <tr key={n} className={view === 'EV' && unit.d === n ? 'on' : ''}>
                <th><button className="gd-row" onClick={() => { setView('EV'); setUnit({ ...unit, d: n }); }}>D{n}</button></th>
                {['L', 'R'].map((p) => <td key={p}>{chip(`D${n}${p}`)}</td>)}</tr>)}</tbody></table>
            <table className="gd-table"><thead><tr><th /><th>Starter</th><th>Backup</th></tr></thead>
              <tbody><tr><th><span className="gd-row">G</span></th><td>{chip('G1')}</td><td>{chip('G2')}</td></tr></tbody></table>
            <div className="gd-extras"><span className="gd-row">Extras</span>{[1, 2, 3, 4].map((n) => chip(`X${n}`))}</div>
            <h3 className="gd-sub">Power play</h3>
            <table className="gd-table"><thead><tr><th />{PP_POS.map((p) => <th key={p}>{p}</th>)}</tr></thead>
              <tbody>{UNITS.map((n) => <tr key={n} className={view === `PP${n}` ? 'on' : ''}><th>{rowBtn(`PP${n}`, `PP${n}`)}</th>{PP_POS.map((p) => <td key={p}>{chip(`PP${n}${p}`)}</td>)}</tr>)}</tbody></table>
            <h3 className="gd-sub">Penalty kill</h3>
            <table className="gd-table"><thead><tr><th /><th>F</th><th>F</th><th>LD</th><th>RD</th></tr></thead>
              <tbody>{UNITS.map((n) => <tr key={n} className={view === `PK${n}` ? 'on' : ''}><th>{rowBtn(`PK${n}`, `PK${n}`)}</th>{PK_POS.map((p) => <td key={p}>{chip(`PK${n}${p}`)}</td>)}</tr>)}</tbody></table>
          </section>
        </div>
        <aside className={`card gd-roster no-print ${drag.over === '__roster' ? 'over' : ''}`} data-slot="__roster" aria-label="Roster">
          <div className="card-head"><h2>Roster</h2>{roster.length > 0 && <span className="muted small tnum">{dressed.size} of {roster.length} dressed</span>}</div>
          {roster.length > 0 && <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" className="cb" checked={free} onChange={(e) => setFree(e.target.checked)} /> Only players not in the lines</label>}
          {!roster.length ? <p className="muted small" style={{ margin: 0 }}>No players yet. {H.isCoach ? <>Add them in the <a href="#" onClick={(e) => { e.preventDefault(); H.go('roster'); }}>Roster</a> tab, then drag them into the lines.</> : 'Your coach will add the roster.'}</p>
            : <ul className="gd-plist">{shown.map((p) => <li key={p.id} className={`gd-p ${edit ? 'edit' : ''} ${where[p.id] ? 'in' : ''}`} aria-label={`Roster: ${p.num ? '#' + p.num + ' ' : ''}${p.name}`} {...drag.handlers('pid:' + p.id, true)}>
                <b className="tnum">{p.num}</b><span className="gd-pn">{p.name}{edit && <InjuryMark p={p} />}</span>
                <span className="gd-pos">{(where[p.id] || []).map(shortSlot).join(', ') || p.position}</span>
              </li>)}</ul>}
        </aside>
      </div>
    </>}
    {drag.ghost && <div className="gd-ghost" style={{ left: drag.ghost.x, top: drag.ghost.y }}>{drag.ghost.text}</div>}
  </>;
}

/* Lines import: a CSV or PDF table, either one row per spot (Line, Position, Number, Player) or
   a grid (Line, LW, C, RW...). Players are matched to the roster by name or number; anyone not
   on the roster is kept as typed. Replaces the lines being viewed. */
function LinesImport({ roster, target, close, onSave }) {
  const H = useHub();
  const [res, setRes] = useState(null);
  const take = (rows, label) => {
    const r = rowsToSlots(rows, roster);
    if (!r.filled) throw new Error('No players found for any line.');
    setRes({ ...r, file: label });
  };
  const order = (id) => ['PP', 'PK', 'F', 'D', 'G', 'X'].map((p, k) => (id.startsWith(p) ? [2, 3, 0, 1, 4, 5][k] : 9)).reduce((a, b) => Math.min(a, b));
  return <Modal title="Import lines" wide onClose={close}
    actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!res} onClick={() => { close(); onSave(res.slots); H.toast(`Lines imported: ${res.filled} spots`); }}>Replace lines</button></>}>
    <p className="muted small" style={{ margin: 0 }}>A CSV, a PDF with selectable text, or cells pasted from a spreadsheet, as a table: one row per spot with <b>Line</b> (F1–F4, D1–D3, G, Extra, PP1–PP2, PK1–PK2), <b>Position</b> (LW, C, RW, LD, RD, G1, G2, F), <b>Number</b> and <b>Player</b>; or a grid with a <b>Line</b> column and position columns (<b>LW, C, RW</b> or <b>LD, RD</b>). Players are matched to the roster by name or number. This replaces <b>{target}</b>.</p>
    <ImportSource onRows={take} isHeading={lineField} template={LINES_TEMPLATE} templateName="lines-template.csv" />
    {res && <>
      <div className="small"><b>{res.file}</b>: {res.filled} spots filled{res.skipped ? `, ${res.skipped} rows skipped (line or position not recognised)` : ''}.</div>
      {res.unmatched.length > 0 && <div className="hint">Not on the roster (kept as typed): {res.unmatched.join(', ')}</div>}
      <div className="tbl-wrap" style={{ maxHeight: 300, overflow: 'auto' }}><table className="tbl">
        <thead><tr><th>Spot</th><th>Player</th></tr></thead>
        <tbody>{Object.keys(res.slots).sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((id) => { const p = res.slots[id]; return <tr key={id}><td>{slotLabel(id)}</td><td>{p.num ? `#${p.num} ` : ''}{p.name}{!p.pid && <span className="muted small"> · not on roster</span>}</td></tr>; })}</tbody>
      </table></div>
    </>}
  </Modal>;
}

function PlayerForm({ id, p, roster, close, onSave }) {
  const H = useHub();
  const [pid, setPid] = useState(p && p.pid && roster.some((r) => r.id === p.pid) ? p.pid : '');
  const [num, setNum] = useState(p ? p.num || '' : ''); const [name, setName] = useState(p ? p.name : '');
  const submit = () => {
    if (pid) { const r = roster.find((x) => x.id === pid); close(); onSave({ pid, num: r.num, name: r.name }); return; }
    const n = name.trim(); if (!n) { H.toast('Pick a player or enter a name.'); return; }
    close(); onSave({ num: num.trim().slice(0, 3), name: n.slice(0, 40) });
  };
  return <Modal title={slotLabel(id)} onClose={close}
    actions={<>{p && <><button className="btn danger" onClick={() => { close(); onSave(null); }}><Icon n="trash" /> Remove</button><span className="spacer" /></>}<button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></>}>
    <form className="gd-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {roster.length > 0 && <label className="field gd-wide"><span>From the roster</span>
        <select className="select" value={pid} onChange={(e) => setPid(e.target.value)}>
          <option value="">Not on the roster (type below)</option>
          {roster.map((r) => <option key={r.id} value={r.id}>{r.num ? `#${r.num} ` : ''}{r.name}{r.position ? ` · ${r.position}` : ''}</option>)}
        </select></label>}
      {!pid && <>
        <label className="field"><span>Number</span><input className="input tnum" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} maxLength={3} placeholder="12" /></label>
        <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Player name" /></label>
      </>}
      <button type="submit" hidden />
    </form>
  </Modal>;
}

/** Pointer-based drag between any elements carrying data-slot. Mouse: drag right away.
 *  Touch: press and hold briefly, then drag, so a normal swipe still scrolls the page. */
function useSlotDrag(enabled, onDrop, onClick) {
  const st = useRef(null);
  const [ghost, setGhost] = useState(null);
  const [over, setOver] = useState(null);
  const target = (x, y) => { const el = document.elementFromPoint(x, y); const s = el && el.closest('[data-slot]'); return s ? s.getAttribute('data-slot') : null; };
  const reset = () => { if (st.current) clearTimeout(st.current.timer); st.current = null; setGhost(null); setOver(null); };
  // while a touch drag is live, stop the page from scrolling under the finger
  useEffect(() => {
    const block = (e) => { if (st.current && st.current.armed) e.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, []);
  const handlers = (id, filled) => ({
    onPointerDown: (e) => {
      if (!enabled || e.button > 0) return;
      const touch = e.pointerType === 'touch';
      const s = { id, filled, x: e.clientX, y: e.clientY, moved: false, armed: !touch, text: e.currentTarget.getAttribute('aria-label').replace(/^[^:]*: /, '') };
      if (touch && filled) s.timer = setTimeout(() => { s.armed = true; setGhost({ x: s.x, y: s.y, text: s.text }); if (navigator.vibrate) navigator.vibrate(10); }, 280);
      st.current = s;
      if (!touch) e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      const s = st.current; if (!s) return;
      const far = Math.hypot(e.clientX - s.x, e.clientY - s.y) >= 6;
      if (!s.armed) { if (far) reset(); return; } // touch moved before the hold: it's a scroll
      if (!s.filled || (!s.moved && !far)) return;
      s.moved = true; setGhost({ x: e.clientX, y: e.clientY, text: s.text });
      const tg = target(e.clientX, e.clientY); setOver(tg && tg !== s.id ? tg : null);
    },
    onPointerUp: (e) => {
      const s = st.current; reset();
      if (!s) return;
      if (!s.moved) { onClick(s.id); return; }
      const tg = target(e.clientX, e.clientY); if (tg) onDrop(s.id, tg);
    },
    onPointerCancel: reset,
    onContextMenu: (e) => { if (enabled) e.preventDefault(); },
  });
  return { handlers, ghost, over };
}
