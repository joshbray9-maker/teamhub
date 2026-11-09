import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FILLS, BASE_SIZE, colName, cellAt, hiddenCells, mergeAt, rangeOf, ensure, setText, clearText,
  toggle, toTSV, paste, cellsOf, fillDown, setWidth,
} from '../lib/sheet.js';

// The program sheet editor: an Excel-style grid. Click / drag / shift-click to select, type to
// replace, Enter or double-click to edit, arrows / Tab / Enter to move, Delete to clear,
// Cmd/Ctrl + C / X / V (works with Excel and Google Sheets), B, I, D (fill down), Z / Shift+Z.
// It never saves: every change goes to onChange(nextSheet), and the page keeps history and saves.
// One textarea keeps the keyboard focus the whole time (laid over the cell while editing), so
// nothing typed is lost while the editor opens.

let clip = null; // { text, cells }: the last copy inside Programs, so a paste keeps its styles

export function cellStyle(x) {
  if (!x) return undefined;
  const f = FILLS[x.f || ''];
  return {
    fontWeight: x.b ? 700 : undefined, fontStyle: x.i ? 'italic' : undefined,
    textAlign: x.a === 'c' ? 'center' : x.a === 'r' ? 'right' : undefined,
    fontSize: x.s && x.s !== BASE_SIZE ? x.s + 'pt' : undefined,
    background: f || undefined, color: x.f === 'd' ? '#fff' : undefined,
  };
}

export default function SheetGrid({ sheet, onChange, undo, redo, sel, setSel }) {
  const [edit, setEdit] = useState(null);           // { r, c }: the cell being edited
  const [val, setVal] = useState('');
  const [box, setBox] = useState(null);
  const wrap = useRef(), inner = useRef(), drag = useRef(false), ta = useRef();
  const hidden = useMemo(() => hiddenCells(sheet), [sheet]);
  const rg = rangeOf(sel.a, sel.b, sheet);
  const act = sel.b;
  const anchorOf = (p) => { const m = mergeAt(sheet, p.r, p.c); return m ? { r: m.r, c: m.c } : p; };
  const anc = anchorOf(act);

  useEffect(() => { const up = () => { drag.current = false; }; window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up); }, []);
  // the input sits on the active cell: full size while editing, a dot otherwise
  useLayoutEffect(() => {
    const el = inner.current && inner.current.querySelector(`[data-rc="${anc.r},${anc.c}"]`);
    if (!el) return setBox(null);
    const a = el.getBoundingClientRect(), b = inner.current.getBoundingClientRect();
    setBox({ top: a.top - b.top, left: a.left - b.left, width: a.width, height: a.height });
    if (!edit) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [anc.r, anc.c, edit, sheet]); // eslint-disable-line react-hooks/exhaustive-deps

  // the editor grows with its text
  useLayoutEffect(() => {
    const t = ta.current; if (!t || !edit || !box) return;
    t.style.height = 'auto'; t.style.height = Math.max(box.height, t.scrollHeight) + 'px';
  }, [val, edit, box]);

  const focus = () => ta.current && ta.current.focus({ preventScroll: true });
  // one step from p, skipping over the rest of a merged cell; grows the sheet at the right / bottom edge
  const target = (sh, p, dr, dc) => {
    const m = mergeAt(sh, p.r, p.c);
    const r = !dr ? p.r : dr > 0 ? (m ? m.r + m.rs : p.r + 1) : (m ? m.r : p.r) - 1;
    const c = !dc ? p.c : dc > 0 ? (m ? m.c + m.cs : p.c + 1) : (m ? m.c : p.c) - 1;
    return { r: Math.max(0, r), c: Math.max(0, c) };
  };
  const grow = (sh, p) => (p.r >= sh.rows.length || p.c >= sh.widths.length ? ensure(sh, p.r, p.c) : sh);
  const step = (dr, dc, extend) => {
    const p = target(sheet, act, dr, dc), sh = grow(sheet, p);
    if (sh !== sheet) onChange(sh, { soft: true });
    setSel(extend ? { a: sel.a, b: p } : { a: p, b: p });
  };

  const startEdit = (v) => { setEdit(anc); setVal(v ?? ((cellAt(sheet, anc.r, anc.c) || {}).v || '')); };
  // save the cell being edited, then optionally move by (dr, dc) from it
  const commit = (dr = 0, dc = 0) => {
    if (!edit) return;
    const old = (cellAt(sheet, edit.r, edit.c) || {}).v || '';
    let sh = val !== old ? setText(sheet, edit.r, edit.c, val) : sheet;
    setEdit(null); setVal('');
    if (dr || dc) { const p = target(sh, edit, dr, dc); sh = grow(sh, p); setSel({ a: p, b: p }); }
    if (sh !== sheet) onChange(sh);
  };
  const cancel = () => { setEdit(null); setVal(''); };

  const onKey = (e) => {
    const mod = e.metaKey || e.ctrlKey, k = e.key;
    if (e.nativeEvent.isComposing) return;
    if (edit) {
      if (k === 'Escape') { e.preventDefault(); cancel(); }
      else if (k === 'Enter' && e.altKey) { e.preventDefault(); const t = e.target, i = t.selectionStart; setVal(val.slice(0, i) + '\n' + val.slice(t.selectionEnd)); requestAnimationFrame(() => t.setSelectionRange(i + 1, i + 1)); }
      else if (k === 'Enter') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 0); }
      else if (k === 'Tab') { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); }
      return;
    }
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 'b') { e.preventDefault(); onChange(toggle(sheet, rg, 'b')); return; }
    if (mod && k === 'i') { e.preventDefault(); onChange(toggle(sheet, rg, 'i')); return; }
    if (mod && k === 'd') { e.preventDefault(); if (rg.r1 > rg.r0) onChange(fillDown(sheet, rg)); return; }
    if (mod && k === 'a') { e.preventDefault(); setSel({ a: { r: 0, c: 0 }, b: { r: sheet.rows.length - 1, c: sheet.widths.length - 1 } }); return; }
    if (mod) return;                                  // copy / paste / cut arrive as their own events
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[k]) { e.preventDefault(); step(...moves[k], e.shiftKey); return; }
    if (k === 'Tab') { e.preventDefault(); step(0, e.shiftKey ? -1 : 1); return; }
    if (k === 'Enter') { e.preventDefault(); if (e.shiftKey) step(-1, 0); else startEdit(); return; }
    if (k === 'F2') { e.preventDefault(); startEdit(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); onChange(clearText(sheet, rg)); }
    // any other key types into the input, and onInput opens the editor with it
  };
  const onInput = (e) => {
    const v = e.target.value;
    if (edit) setVal(v); else if (v) { setEdit(anc); setVal(v); }
  };

  const onCopy = (e, cut) => {
    if (edit) return;
    e.preventDefault();
    const text = toTSV(sheet, rg);
    clip = { text, cells: cellsOf(sheet, rg) };
    e.clipboardData.setData('text/plain', text);
    if (cut) onChange(clearText(sheet, rg));
  };
  const onPaste = (e) => {
    if (edit) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const ours = clip && clip.text === text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
    onChange(paste(sheet, rg.r0, rg.c0, text, ours ? clip.cells : null));
  };

  const down = (e, r, c) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (edit) commit();
    focus();
    drag.current = true;
    setSel(e.shiftKey ? { a: sel.a, b: { r, c } } : { a: { r, c }, b: { r, c } });
  };
  const enter = (r, c) => { if (drag.current) setSel((s) => ({ a: s.a, b: { r, c } })); };
  const pickCol = (e, c) => { e.preventDefault(); if (edit) commit(); focus(); const last = sheet.rows.length - 1; setSel(e.shiftKey ? { a: { r: 0, c: sel.a.c }, b: { r: last, c } } : { a: { r: 0, c }, b: { r: last, c } }); };
  const pickRow = (e, r) => { e.preventDefault(); if (edit) commit(); focus(); const last = sheet.widths.length - 1; setSel(e.shiftKey ? { a: { r: sel.a.r, c: 0 }, b: { r, c: last } } : { a: { r, c: 0 }, b: { r, c: last } }); };

  // drag a column header's right edge to resize
  const resize = (e, c) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = sheet.widths[c], start = sheet;
    let last = start;
    const mv = (ev) => { last = setWidth(start, c, w0 + ev.clientX - x0); onChange(last, { soft: true }); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (last !== start) onChange(last, { from: start }); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const inSel = (r, c) => r >= rg.r0 && r <= rg.r1 && c >= rg.c0 && c <= rg.c1;
  const single = rg.r0 === rg.r1 && rg.c0 === rg.c1;
  const total = sheet.widths.reduce((a, b) => a + b, 0);
  const editCell = edit && cellAt(sheet, edit.r, edit.c);

  return (
    <div className="sg-wrap" ref={wrap} onMouseDown={(e) => { if (e.target === wrap.current) { e.preventDefault(); focus(); } }}>
      <div className="sg-inner" ref={inner}>
        <table className="sg" style={{ width: total + 36 }}>
          <colgroup><col style={{ width: 36 }} />{sheet.widths.map((w, c) => <col key={c} style={{ width: w }} />)}</colgroup>
          <thead><tr><th className="sg-corner" />{sheet.widths.map((_, c) => <th key={c} className={c >= rg.c0 && c <= rg.c1 ? 'on' : ''} onMouseDown={(e) => pickCol(e, c)}>
            {colName(c)}<span className="sg-rs" onPointerDown={(e) => resize(e, c)} onMouseDown={(e) => e.stopPropagation()} /></th>)}</tr></thead>
          <tbody>{sheet.rows.map((row, r) => <tr key={r}>
            <th className={`sg-rn ${r >= rg.r0 && r <= rg.r1 ? 'on' : ''}`} onMouseDown={(e) => pickRow(e, r)}>{r + 1}</th>
            {row.map((x, c) => {
              if (hidden.has(r + ',' + c)) return null;
              const m = mergeAt(sheet, r, c);
              const cls = ['sg-c', x && x.nb ? 'nb' : '', inSel(r, c) && !(single && !m) ? 'sel' : '', anc.r === r && anc.c === c ? 'act' : ''].join(' ');
              return <td key={c} data-rc={`${r},${c}`} rowSpan={m ? m.rs : undefined} colSpan={m ? m.cs : undefined} className={cls} style={cellStyle(x)}
                onMouseDown={(e) => down(e, r, c)} onMouseEnter={() => enter(r, c)} onDoubleClick={() => { startEdit(); focus(); }}>
                {edit && edit.r === r && edit.c === c ? '' : (x && x.v) || ''}
              </td>;
            })}
          </tr>)}</tbody>
        </table>
        <textarea ref={ta} className={`sg-input ${edit ? 'on' : ''}`} aria-label="Cell" rows={1} value={edit ? val : ''} autoFocus spellCheck={!!edit}
          style={box ? { top: box.top, left: box.left, width: edit ? box.width : 2, ...(edit ? {} : { height: 2 }), ...(edit ? cellStyle(editCell) : {}) } : undefined}
          onChange={onInput} onKeyDown={onKey} onBlur={() => { if (edit) commit(); }}
          onCopy={(e) => onCopy(e)} onCut={(e) => onCopy(e, true)} onPaste={onPaste} />
      </div>
    </div>
  );
}
