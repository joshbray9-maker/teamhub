// Excel-style grid for pasting straight from a spreadsheet (Excel, Numbers, Google Sheets).
// Row 1 holds the column headings (pre-filled from the import's template when there is one);
// click a cell and paste: a copied block of cells spreads out from that cell. Cells can also be
// typed in or fixed by hand. Everything stays in the browser until the import's review step.
import { useEffect, useRef, useState } from 'react';
import { parseTsv } from '../lib/imports.js';

const MAX_ROWS = 2000, MAX_COLS = 60, SHOW_ROWS = 300;
const colName = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
const blank = (headings) => { const w = Math.max(6, headings.length); return [Array.from({ length: w }, (_, i) => headings[i] || ''), ...Array.from({ length: 14 }, () => Array(w).fill(''))]; };

/** Rows without the empty ones at the end and the empty columns on the right. */
export function usedRows(grid) {
  const rows = grid.filter((r) => r.some((c) => String(c).trim()));
  const width = Math.max(0, ...rows.map((r) => { let w = r.length; while (w && !String(r[w - 1]).trim()) w--; return w; }));
  return rows.map((r) => r.slice(0, width).map((c) => String(c).trim()));
}

export default function PasteGrid({ headings = [], onRead, busy }) {
  const [grid, setGrid] = useState(() => blank(headings));
  const box = useRef();
  const focus = (r, c) => { const el = box.current && box.current.querySelector(`input[data-r="${r}"][data-c="${c}"]`); if (el) { el.focus(); el.select(); } };
  useEffect(() => { focus(headings.length ? 1 : 0, 0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (r, c, v) => setGrid((g) => g.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  const paste = (e, r, c) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return; // one value: normal paste into this cell
    e.preventDefault();
    const block = parseTsv(text);
    setGrid((g) => {
      const rows = Math.min(MAX_ROWS + 1, Math.max(g.length, r + block.length + 3));
      const cols = Math.min(MAX_COLS, Math.max(g[0].length, c + Math.max(...block.map((b) => b.length))));
      const out = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (g[i] && g[i][j] !== undefined ? g[i][j] : '')));
      block.forEach((b, i) => b.forEach((v, j) => { if (r + i < rows && c + j < cols) out[r + i][c + j] = v; }));
      return out;
    });
  };
  const key = (e, r, c) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (r + 1 >= grid.length) setGrid((g) => [...g, Array(g[0].length).fill('')]); setTimeout(() => focus(r + 1, c)); }
    else if (e.key === 'ArrowUp' && r > 0) { e.preventDefault(); focus(r - 1, c); }
    else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length && c + 1 < grid[0].length) { e.preventDefault(); focus(r, c + 1); }
    else if (e.key === 'ArrowLeft' && e.target.selectionEnd === 0 && c > 0) { e.preventDefault(); focus(r, c - 1); }
  };
  const used = usedRows(grid);
  const dataRows = Math.max(0, used.length - 1);
  return <div className="pg">
    <div className="pg-help muted small">Copy the cells in your spreadsheet (including the heading row, or just the rows under the headings already here), click a cell below, then paste with <b>⌘V</b> (Ctrl+V on Windows). You can also type or fix cells here.</div>
    <div className="pg-scroll" ref={box}><table className="pg-tbl">
      <thead><tr><th className="pg-corner" />{grid[0].map((_, j) => <th key={j}>{colName(j)}</th>)}</tr></thead>
      <tbody>{grid.slice(0, SHOW_ROWS).map((row, i) => <tr key={i} className={i === 0 ? 'pg-head' : ''}>
        <th>{i === 0 ? 'Headings' : i}</th>
        {row.map((v, j) => <td key={j}><input data-r={i} data-c={j} value={v} spellCheck={false} aria-label={`${i === 0 ? 'Heading' : 'Row ' + i} column ${colName(j)}`}
          onChange={(e) => set(i, j, e.target.value)} onPaste={(e) => paste(e, i, j)} onKeyDown={(e) => key(e, i, j)} /></td>)}
      </tr>)}</tbody>
    </table></div>
    {grid.length > SHOW_ROWS && <div className="muted small">{grid.length - SHOW_ROWS} more pasted rows aren't shown here but will be read.</div>}
    <div className="pg-bar">
      <span className="muted small tnum">{dataRows} row{dataRows === 1 ? '' : 's'} of data</span>
      <button type="button" className="btn sm ghost" onClick={() => setGrid((g) => [...g, ...Array.from({ length: 10 }, () => Array(g[0].length).fill(''))])}>Add 10 rows</button>
      <button type="button" className="btn sm ghost" onClick={() => { setGrid(blank(headings)); setTimeout(() => focus(headings.length ? 1 : 0, 0)); }}>Clear</button>
      <button type="button" className="btn sm primary" disabled={busy || dataRows < 1} onClick={() => onRead(used)}>{busy ? 'Reading…' : 'Read pasted data'}</button>
    </div>
  </div>;
}
