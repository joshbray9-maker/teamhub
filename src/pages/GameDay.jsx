// Game day / Lines (hockey): forward lines, defence pairs, goalies and extras. One set of
// default lines per team, plus per-game lines that start from the default the first time a
// coach changes them. The selected unit is shown on the rink. Coaches add players by
// clicking a spot and swap them by dragging; everyone else sees the lines read-only.
import { useEffect, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, fmtTime, todayISO, gameView, ourGames } from '../lib/util.js';
import PageHead from '../components/PageHead.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';
import Rink from '../components/Rink.jsx';

const FWD = [1, 2, 3, 4], DEF = [1, 2, 3];
const POS_NAME = { LW: 'Left wing', C: 'Centre', RW: 'Right wing', L: 'Left D', R: 'Right D' };
export const slotLabel = (id) => {
  let m;
  if ((m = id.match(/^F(\d)(LW|C|RW)$/))) return `Line ${m[1]} · ${POS_NAME[m[2]]}`;
  if ((m = id.match(/^D(\d)(L|R)$/))) return `Pair ${m[1]} · ${POS_NAME[m[2]]}`;
  if (id === 'G1') return 'Starting goalie';
  if (id === 'G2') return 'Backup goalie';
  return 'Extra';
};
// where the selected unit stands on the rink (feet; our goal on the left)
const SPOTS = (f, d) => [
  [`G1`, 'G', 17, 42.5], [`D${d}L`, 'LD', 55, 24], [`D${d}R`, 'RD', 55, 61],
  [`F${f}LW`, 'LW', 88, 14], [`F${f}C`, 'C', 93, 42.5], [`F${f}RW`, 'RW', 88, 69],
];
const short = (s, n = 15) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export default function GameDay() {
  const H = useHub(); const t = H.team;
  const games = ourGames(H.tdata.league.games, t);
  const today = todayISO();
  const [all, setAll] = useState(null);
  const [key, setKey] = useState(() => { const n = games.find((g) => g.date >= today); return n ? n.id : 'default'; });
  const [unit, setUnit] = useState({ f: 1, d: 1 });
  const load = () => H.api.listLineups(t.id).then(setAll).catch((e) => { setAll({}); H.toast('Could not load lines: ' + e.message); });
  useEffect(() => { load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const own = all && all[key];
  const usingDefault = key !== 'default' && !own;
  const slots = (own || (all && all.default) || {}).slots || {};
  const game = games.find((g) => g.id === key);
  const edit = H.isCoach;

  const write = (next) => {
    setAll((a) => ({ ...a, [key]: { slots: next, updatedAt: Date.now() } }));
    H.save((api) => api.saveLineup(t.id, key, next)).catch(() => load());
  };
  const setSlot = (id, p) => { const n = { ...slots }; if (p) n[id] = p; else delete n[id]; write(n); };
  const swap = (a, b) => { if (a === b) return; const n = { ...slots }; const x = n[a], y = n[b]; if (y) n[a] = y; else delete n[a]; if (x) n[b] = x; else delete n[b]; write(n); };
  const openSlot = (id) => edit && H.openDialog((c) => <PlayerForm id={id} p={slots[id]} close={c} onSave={(p) => setSlot(id, p)} />);
  const drag = useSlotDrag(edit, swap, openSlot);

  const useDefault = async () => {
    if (!(await H.confirm('Use default lines?', 'This game\'s own lines are removed and it shows your default lines again.', 'Use default'))) return;
    setAll((a) => { const n = { ...a }; delete n[key]; return n; });
    H.save((api) => api.deleteLineup(t.id, key)).catch(() => load());
  };
  const clearAll = async () => {
    if (await H.confirm('Clear all lines?', `Every position in ${key === 'default' ? 'your default lines' : 'this game\'s lines'} is emptied.`, 'Clear')) write({});
  };

  const opts = [['default', 'Default lines'], ...games.map((g) => { const v = gameView(g, t); return [g.id, `${fmtDate(g.date)} · ${v.home ? 'vs' : '@'} ${v.opp}`]; })];
  const acts = <select className="select gd-pick" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Lines for">
    {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
  </select>;

  // a plain function, not a component, so a chip keeps its element (and pointer capture) while dragging
  const chip = (id) => {
    const p = slots[id];
    return <button type="button" className={`gd-chip ${p ? '' : 'empty'} ${drag.over === id ? 'over' : ''}`} data-slot={id} disabled={!edit && !p} key={id}
      aria-label={`${slotLabel(id)}: ${p ? `${p.num ? '#' + p.num + ' ' : ''}${p.name}` : 'empty'}`} {...drag.handlers(id, !!p)} onClick={(e) => { if (e.detail === 0) openSlot(id); }}>
      {p ? <>{p.num && <b className="tnum">{p.num}</b>}<span>{p.name}</span></> : edit ? <><Icon n="plus" /><span>Add</span></> : <span>—</span>}
    </button>;
  };

  return <>
    <PageHead title="Game day / Lines" actions={acts} />
    {!all ? <div className="loading">Loading lines…</div> : <>
      <div className="gd-status">
        {game ? <span>{fmtDate(game.date, true)}{game.time ? ' · ' + fmtTime(game.time) : ''}{game.venue ? ' · ' + game.venue : ''}</span> : <span>Default lines. Every game uses these until you change that game's lines.</span>}
        {usingDefault && <span className="pill">Using default lines</span>}
        {edit && <span className="gd-tools">
          {key !== 'default' && own && <button className="btn sm" onClick={useDefault}>Use default lines</button>}
          {Object.keys(slots).length > 0 && (!usingDefault) && <button className="btn sm ghost" onClick={clearAll}>Clear all</button>}
        </span>}
      </div>
      <div className="gd-grid">
        <section className="card gd-rink-card">
          <div className="card-head"><h2>On the ice</h2>
            <div className="acts">
              <div className="seg" aria-label="Forward line">{FWD.map((n) => <button key={n} className={unit.f === n ? 'on' : ''} onClick={() => setUnit({ ...unit, f: n })}>F{n}</button>)}</div>
              <div className="seg" aria-label="Defence pair">{DEF.map((n) => <button key={n} className={unit.d === n ? 'on' : ''} onClick={() => setUnit({ ...unit, d: n })}>D{n}</button>)}</div>
            </div>
          </div>
          <Rink label={`Line ${unit.f} and pair ${unit.d} on the rink`}>
            {SPOTS(unit.f, unit.d).map(([id, pos, x, y]) => { const p = slots[id]; return (
              <g key={id} className={`gd-token ${p ? '' : 'empty'} ${edit ? 'edit' : ''} ${drag.over === id ? 'over' : ''}`} data-slot={id} transform={`translate(${x} ${y})`}
                role={edit ? 'button' : undefined} tabIndex={edit ? 0 : undefined} aria-label={`${slotLabel(id)}: ${p ? p.name : 'empty'}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSlot(id); } }} {...drag.handlers(id, !!p)}>
                <circle r="6.5" />
                <text className="gd-num" dy="1.9">{p ? p.num || pos : edit ? '+' : pos}</text>
                <text className="gd-name" y="11.5">{p ? short(p.name) : pos}</text>
              </g>); })}
          </Rink>
          {edit && <p className="muted small" style={{ margin: 0 }}>Click a spot to add a player. Drag a player onto another spot, here or in the lines, to swap them (on a phone: press and hold, then drag).</p>}
        </section>
        <section className="card gd-lines">
          <div className="card-head"><h2>Lines</h2></div>
          <table className="gd-table"><thead><tr><th /><th>LW</th><th>C</th><th>RW</th></tr></thead>
            <tbody>{FWD.map((n) => <tr key={n} className={unit.f === n ? 'on' : ''}>
              <th><button className="gd-row" onClick={() => setUnit({ ...unit, f: n })}>F{n}</button></th>
              {['LW', 'C', 'RW'].map((p) => <td key={p}>{chip(`F${n}${p}`)}</td>)}</tr>)}</tbody></table>
          <table className="gd-table"><thead><tr><th /><th>LD</th><th>RD</th></tr></thead>
            <tbody>{DEF.map((n) => <tr key={n} className={unit.d === n ? 'on' : ''}>
              <th><button className="gd-row" onClick={() => setUnit({ ...unit, d: n })}>D{n}</button></th>
              {['L', 'R'].map((p) => <td key={p}>{chip(`D${n}${p}`)}</td>)}</tr>)}</tbody></table>
          <table className="gd-table"><thead><tr><th /><th>Starter</th><th>Backup</th></tr></thead>
            <tbody><tr><th><span className="gd-row">G</span></th><td>{chip('G1')}</td><td>{chip('G2')}</td></tr></tbody></table>
          <div className="gd-extras"><span className="gd-row">Extras</span>{[1, 2, 3, 4].map((n) => chip(`X${n}`))}</div>
        </section>
      </div>
    </>}
    {drag.ghost && <div className="gd-ghost" style={{ left: drag.ghost.x, top: drag.ghost.y }}>{drag.ghost.text}</div>}
  </>;
}

function PlayerForm({ id, p, close, onSave }) {
    const H = useHub();
    const [num, setNum] = useState(p ? p.num || '' : ''); const [name, setName] = useState(p ? p.name : '');
    const submit = () => { const n = name.trim(); if (!n) { H.toast('Enter a name.'); return; } close(); onSave({ num: num.trim().slice(0, 3), name: n.slice(0, 40) }); };
    return <Modal title={slotLabel(id)} onClose={close}
      actions={<>{p && <><button className="btn danger" onClick={() => { close(); onSave(null); }}><Icon n="trash" /> Remove</button><span className="spacer" /></>}<button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></>}>
      <form className="gd-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="field"><span>Number</span><input className="input tnum" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} maxLength={3} placeholder="12" /></label>
        <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Player name" /></label>
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
