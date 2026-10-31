// The "where's the data coming from" part of every import window: upload a CSV / PDF file, or
// paste from a spreadsheet into an Excel-style grid. Both end in `onRows(rows, label)` with
// rows[0] = headings, so each import reviews pasted data exactly like a file.
// `onFile` replaces the default file reading when an import has its own (the roster's PDFs).
import { useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { readRows } from '../lib/readRows.js';
import { downloadCsv } from '../lib/imports.js';
import Icon from './Icon.jsx';
import PasteGrid from './PasteGrid.jsx';

export default function ImportSource({ onRows, onFile, isHeading, template, templateName, fileHint, mode0 = 'file' }) {
  const H = useHub();
  const [mode, setMode] = useState(mode0), [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { H.toast(e.message); } finally { setBusy(false); } };
  const pick = (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    run(async () => (onFile ? onFile(file) : onRows(await readRows(file, isHeading), file.name)));
  };
  return <div className="isrc">
    <div className="seg" role="tablist" aria-label="Import from">
      <button type="button" role="tab" aria-selected={mode === 'file'} className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>Upload a file</button>
      <button type="button" role="tab" aria-selected={mode === 'paste'} className={mode === 'paste' ? 'on' : ''} onClick={() => setMode('paste')}>Paste from a spreadsheet</button>
    </div>
    {mode === 'file' ? <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="btn"><Icon n="plus" /> {busy ? 'Reading…' : 'Choose CSV or PDF'}<input type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" hidden onChange={pick} /></label>
        {template && <button type="button" className="btn ghost" onClick={() => downloadCsv(templateName, template)}>Download blank template</button>}
      </div>
      {fileHint && <span className="muted small">{fileHint}</span>}
    </> : <PasteGrid headings={template ? template[0] : []} busy={busy} onRead={(rows) => run(() => onRows(rows, 'Pasted data'))} />}
  </div>;
}
