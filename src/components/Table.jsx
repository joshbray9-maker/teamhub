// Table with show/hide columns: right-click a column title (long-press on touch).
// Hidden columns are saved per user (user_settings.hiddenCols[id]).
import { useEffect, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';

export default function Table({ id, cols, rows, rowClass }) {
  const H = useHub();
  const hidden = new Set((H.prefs.hiddenCols || {})[id] || []);
  const vis = cols.filter((c) => c.always || !hidden.has(c.k));
  const [menu, setMenu] = useState(null);
  const lp = useRef(null);
  const toggle = (k, on) => { const s = new Set(hidden); on ? s.delete(k) : s.add(k); H.savePrefs({ hiddenCols: { ...(H.prefs.hiddenCols || {}), [id]: [...s] } }); };
  const thProps = {
    title: 'Right-click or long-press to show/hide columns',
    onContextMenu: (e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); },
    onPointerDown: (e) => { if (e.pointerType === 'mouse') return; const x = e.clientX, y = e.clientY; lp.current = { x, y, t: setTimeout(() => { lp.current = null; setMenu({ x, y }); }, 500) }; },
    onPointerMove: (e) => { if (lp.current && Math.hypot(e.clientX - lp.current.x, e.clientY - lp.current.y) > 8) { clearTimeout(lp.current.t); lp.current = null; } },
    onPointerUp: () => { if (lp.current) { clearTimeout(lp.current.t); lp.current = null; } },
  };
  return <div className="tbl-wrap"><table className="tbl">
    <thead><tr>{vis.map((c) => <th key={c.k} className={c.num ? 'num' : ''} {...thProps}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className={rowClass ? rowClass(r) : ''}>{vis.map((c) => <td key={c.k} className={`${c.num ? 'num' : ''} ${c.cls || ''}`}>{r[c.k] ?? ''}</td>)}</tr>)}</tbody>
  </table>{menu && <ColMenu at={menu} cols={cols} hidden={hidden} onToggle={toggle} onClose={() => setMenu(null)} />}</div>;
}

function ColMenu({ at, cols, hidden, onToggle, onClose }) {
  const ref = useRef(); const [pos, setPos] = useState({ left: at.x, top: at.y });
  useEffect(() => {
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(at.x, innerWidth - r.width - 8)), top: Math.max(8, Math.min(at.y, innerHeight - r.height - 8)) });
    const out = (e) => { if (!ref.current.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('pointerdown', out, true));
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', esc); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="colmenu" role="menu" ref={ref} style={pos}><h4>Show columns</h4>
    {cols.map((c) => <label key={c.k}><input type="checkbox" className="cb" disabled={c.always} checked={c.always || !hidden.has(c.k)} onChange={(e) => onToggle(c.k, e.target.checked)} /> {c.label}</label>)}</div>;
}
