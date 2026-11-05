// Athlete reports → Edit testing: one athlete's whole testing history as one grid (a row per
// testing day, a column per test) to fix, fill in or add to in bulk. Type, or paste a block from a
// spreadsheet: into any cell (pasted by position), or with its heading row (columns matched by
// name, e.g. Date, CMJ, RSImod; a date already in the grid fills that row, others are added).
// Saving files every row into that day's testing session (lib/testing.js athleteSave); a day with
// no session gets one, marked individual testing (left out of team averages) unless unticked.
import { useMemo, useRef, useState } from 'react';
import { useHub, useMetrics } from '../lib/hub.jsx';
import { fmtDate } from '../lib/util.js';
import { BATTERIES, batteryCols, metricOrder, metricField, cellValue, num, athleteRows, athleteSave, testDate, dateOrder } from '../lib/testing.js';
import { parseTsv } from '../lib/imports.js';
import PageHead from '../components/PageHead.jsx';
import Icon from '../components/Icon.jsx';

let seq = 0;
const isDateHead = (h) => /^(test(ing)?\s*)?(date|day)$|^tested\s*on$/i.test(String(h || '').trim());

export default function AthleteTesting({ p, tests, prof, back, onSaved }) {
  const H = useHub(); const M = useMetrics();
  const orig = useMemo(() => athleteRows(tests.sessions, tests.results, p.id), [tests, p.id]);
  // the team's full and readiness tests, then any other test this athlete has results for
  const cols = useMemo(() => { const has = new Set(orig.flatMap((r) => Object.keys(r.values)));
    return metricOrder(prof).filter((k) => batteryCols('full', prof).includes(k) || batteryCols('readiness', prof).includes(k) || has.has(k)); }, [orig, prof]);
  const toText = (v) => Object.fromEntries(cols.map((k) => [k, v && v[k] !== undefined && v[k] !== null ? String(v[k]) : '']));
  const blank = () => ({ key: 'n' + ++seq, sid: null, date: '', cells: toText({}) });
  const start = () => [...orig.map((r) => ({ key: r.sid, sid: r.sid, date: r.date, cells: toText(r.values), battery: r.battery, individual: r.individual })), blank(), blank(), blank()];
  const [rows, setRows] = useState(start);
  const [order, setOrder] = useState('dmy'), [ind, setInd] = useState(true), [busy, setBusy] = useState(false);
  const box = useRef();

  const iso = (d) => testDate(d, order);
  const values = (r) => Object.fromEntries(cols.map((k) => [k, cellValue(k, r.cells[k])]).filter(([, v]) => v !== null));
  const plan = useMemo(() => athleteSave(rows.map((r) => ({ sid: r.sid, date: iso(r.date), values: values(r) })), tests.sessions, tests.results, p.id, prof), [rows, order, tests]); // eslint-disable-line react-hooks/exhaustive-deps
  const changes = plan.save.length + plan.create.length;
  const badCell = (k, v) => !M[k].text && String(v || '').trim() !== '' && num(v) === null;
  const badDate = (r) => Object.keys(values(r)).length > 0 && !iso(r.date);

  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setCell = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, cells: { ...r.cells, [k]: v } } : r)));
  const remove = (i) => setRows((rs) => { const n = rs.filter((_, j) => j !== i); return n.length ? n : [blank()]; });
  const addRows = (n) => setRows((rs) => [...rs, ...Array.from({ length: n }, blank)]);
  const focus = (r, c) => { const el = box.current && box.current.querySelector(`input[data-r="${r}"][data-c="${c}"]`); if (el) { el.focus(); el.select(); } };
  const key = (e, r, c) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (r + 1 >= rows.length) addRows(1); setTimeout(() => focus(r + 1, c)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focus(r - 1, c); }
    else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) { e.preventDefault(); focus(r, c + 1); }
    else if (e.key === 'ArrowLeft' && e.target.selectionEnd === 0) { e.preventDefault(); focus(r, c - 1); }
  };
  // column 0 is the date, 1.. the tests
  const paste = (e, r, c) => {
    const text = e.clipboardData.getData('text/plain'); if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    const block = parseTsv(text).filter((b) => b.some((v) => String(v).trim()));
    const head = block[0] || [], di = head.findIndex(isDateHead), map = head.map((h) => { const k = metricField(h); return k && cols.includes(k) ? k : null; });
    const headed = di >= 0 && map.some(Boolean);
    const dates = headed ? block.slice(1).map((b) => b[di]) : c === 0 ? block.map((b) => b[0]) : [];
    const o = dateOrder(dates); if (o) setOrder(o);
    const read = (d) => testDate(d, o || order) || String(d || '').trim();
    setRows((cur) => {
      const n = cur.map((x) => ({ ...x, cells: { ...x.cells } }));
      if (headed) {
        block.slice(1).forEach((b) => {
          const date = read(b[di]); if (!date) return;
          let row = n.find((x) => x.date === date) || n.find((x) => !x.sid && !x.date && !Object.values(x.cells).some((v) => v.trim()));
          if (!row) { row = blank(); n.push(row); }
          row.date = date;
          map.forEach((k, j) => { if (k && String(b[j] ?? '').trim() !== '') row.cells[k] = String(b[j]).trim(); });
        });
      } else {
        block.forEach((b, i) => {
          while (n.length <= r + i) n.push(blank());
          const row = n[r + i];
          b.forEach((v, j) => { const cc = c + j; if (cc === 0) row.date = read(v); else if (cols[cc - 1]) row.cells[cols[cc - 1]] = String(v).trim(); });
        });
      }
      return n;
    });
  };

  const save = async () => {
    if (plan.bad.length) { H.toast(`${plan.bad.length === 1 ? 'A row has' : `${plan.bad.length} rows have`} results but no date that can be read. Fix the date (e.g. 2025-09-15) or clear the row.`); return; }
    setBusy(true);
    try {
      for (const sid of plan.full) await H.api.updateTestSession(sid, { battery: 'full' });
      for (const x of plan.save) await H.api.saveTestResults(H.teamId, x.sid, [{ player_id: p.id, values: x.values }]);
      for (const x of plan.create) {
        const s = await H.api.createTestSession(H.teamId, x.date, x.battery);
        if (ind) await H.api.updateTestSession(s.id, { individual: true });
        await H.api.saveTestResults(H.teamId, s.id, [{ player_id: p.id, values: x.values }]);
      }
      H.toast(`Saved ${p.name}'s testing: ${changes} testing day${changes === 1 ? '' : 's'} updated${plan.create.length ? ` (${plan.create.length} new)` : ''}`);
      await onSaved(); back();
    } catch (e) { H.toast('Could not finish saving. ' + e.message + ' Days before the error were saved; check and save again.'); await onSaved(); }
    finally { setBusy(false); }
  };
  const leave = async () => { if (changes && !(await H.confirm('Leave without saving?', `Your changes to ${p.name}'s testing haven't been saved.`, 'Leave'))) return; back(); };
  const dayLabel = (r) => { if (!r.sid) return r.date && iso(r.date) ? (tests.sessions.some((s) => s.tested_on === iso(r.date)) ? 'Adds to that day' : 'New testing day') : '';
    return `${BATTERIES[r.battery].label}${r.individual ? ' · individual' : ''}${iso(r.date) !== orig.find((o) => o.sid === r.sid).date ? ' · moves' : ''}`; };

  return <>
    <PageHead title={`Edit testing · ${p.name}`} actions={<><button className="btn" onClick={leave}>← Back to report</button>
      <button className="btn primary" disabled={!changes || busy} onClick={save}>{busy ? 'Saving…' : changes ? `Save ${changes} change${changes === 1 ? '' : 's'}` : 'No changes'}</button></>} />
    <section className="card">
      <p className="muted small" style={{ margin: 0 }}>Every testing day {p.name} has, one row each. Change any number, clear a cell to remove that result, or use × to remove the whole day for {p.name} (the team's session stays). Add earlier or later testing in the empty rows: type the date and results, or paste rows from a spreadsheet. <b>Paste with your heading row</b> (Date, CMJ, RSImod…) into any cell and the columns are matched by name; without headings, click the cell where the block should start. Nothing is saved until you press <b>Save</b>.</p>
      <div className="bi-opts">
        <label className="small">Typed dates are <select className="select" value={order} onChange={(e) => setOrder(e.target.value)}>
          <option value="dmy">day/month (08/09/2025 = 8 Sep 2025)</option><option value="mdy">month/day (09/08/2025 = 8 Sep 2025)</option></select></label>
        <label className="small"><input type="checkbox" className="cb" checked={ind} onChange={(e) => setInd(e.target.checked)} /> New testing days count as individual testing (left out of team averages)</label>
      </div>
      <div className="tbl-wrap ts-grid" ref={box}><table className="tbl">
        <thead><tr><th>Date</th>{cols.map((k) => <th key={k} className="num">{M[k].label}{M[k].unit && <span className="muted"> ({M[k].unit})</span>}</th>)}<th>Testing day</th><th /></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.key}>
          <td className="ts-cell ts-text"><input className={badDate(r) ? 'bad' : ''} data-r={i} data-c={0} value={r.date} placeholder="YYYY-MM-DD" aria-label={`Row ${i + 1} date`}
            title={iso(r.date) ? fmtDate(iso(r.date), true) : ''} onChange={(e) => set(i, { date: e.target.value })} onBlur={() => { const d = iso(r.date); if (d && d !== r.date) set(i, { date: d }); }}
            onPaste={(e) => paste(e, i, 0)} onKeyDown={(e) => key(e, i, 0)} /></td>
          {cols.map((k, c) => { const v = r.cells[k] || ''; return <td key={k} className={`ts-cell ${M[k].text ? 'ts-text' : ''}`}><input className={`tnum ${badCell(k, v) ? 'bad' : ''}`} inputMode={M[k].text ? 'text' : 'decimal'}
            data-r={i} data-c={c + 1} value={v} aria-label={`${r.date || `Row ${i + 1}`} ${M[k].long}`} onChange={(e) => setCell(i, k, e.target.value)} onPaste={(e) => paste(e, i, c + 1)} onKeyDown={(e) => key(e, i, c + 1)} /></td>; })}
          <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{dayLabel(r)}</td>
          <td><button className="icon-btn" aria-label={`Remove row ${r.date || i + 1}`} onClick={() => remove(i)}><Icon n="x" /></button></td>
        </tr>)}</tbody>
      </table></div>
      <div><button className="btn sm" onClick={() => addRows(5)}><Icon n="plus" /> Add 5 rows</button></div>
    </section>
  </>;
}
