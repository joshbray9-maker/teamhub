// Injury report → SCAT tab: SCAT6 concussion assessments. Staff enter the scores from a
// completed SCAT6 for a player (a baseline, or a post-injury test linked to the injury); every
// test stays in the player's history, and the progress table lines each test up against the
// player's baseline. Totals are added up in lib/scat.js; nothing here judges a result.
import { useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, todayISO } from '../lib/util.js';
import { currentInjury } from '../lib/injury.js';
import { SYMPTOMS, SYMPTOM_MAX, KINDS, FIELDS, SUMMARY, score, badScore, totals, progress, baselineFor, daysSince } from '../lib/scat.js';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import InjuryFlag from './InjuryFlag.jsx';

const label = (p) => (p ? `${p.num ? '#' + p.num + ' ' : ''}${p.name}` : 'Removed player');
const injName = (i) => (i ? i.injury || 'Injury' : '');
const fmt = (v, c) => (v === null || v === undefined ? '—' : c.dp ? v.toFixed(c.dp) : String(v));
const signed = (v, c) => (v === 0 ? '0' : (v > 0 ? '+' : '−') + fmt(Math.abs(v), c));

/** A player's SCATs, oldest first, with the change from baseline under each post-injury score. */
export function ScatHistory({ tests, injuries, onOpen }) {
  const rows = progress(tests);
  if (!rows.length) return <p className="muted small" style={{ margin: 0 }}>No SCATs yet.</p>;
  const injById = Object.fromEntries((injuries || []).map((i) => [i.id, i]));
  return <div className="tbl-wrap"><table className="tbl scat-tbl">
    <thead><tr><th>Date</th><th>Test</th>{SUMMARY.map((c) => <th key={c.k} className="num">{c.label}{c.of ? <span className="muted"> /{c.of}</span> : c.unit ? <span className="muted"> ({c.unit})</span> : null}</th>)}</tr></thead>
    <tbody>{rows.map(({ test: t, totals: tot, base, change }) => { const inj = injById[t.injury_id], d = inj ? daysSince(inj.injured_on, t.tested_on) : null;
      return <tr key={t.id} className={`${t.kind === 'baseline' ? 'scat-base' : ''} ${onOpen ? 'click' : ''}`} onClick={onOpen ? () => onOpen(t) : undefined}>
        <td className="tnum">{fmtDate(t.tested_on)}<div className="muted small">{t.tested_on.slice(0, 4)}</div></td>
        <td><b>{KINDS[t.kind]}</b>{t.kind !== 'baseline' && <div className="muted small">{inj ? `${injName(inj)}${d !== null ? ` · day ${d}` : ''}` : 'No injury linked'}{!base ? ' · no baseline' : ''}</div>}</td>
        {SUMMARY.map((c) => <td key={c.k} className="num tnum">{fmt(tot[c.k], c)}{c.unit === '%' && tot[c.k] !== null ? '%' : ''}
          {change && change[c.k] !== null && <div className="muted small" title={`Baseline ${fmtDate(base.tested_on, true)}: ${fmt(totals(base.data)[c.k], c)}`}>{signed(change[c.k], c)} vs base</div>}</td>)}
      </tr>; })}</tbody>
  </table></div>;
}

/** The SCAT tab: every player's baseline and latest test; click one for their full history. */
export function ScatView({ roster, photos, injuries, scats, reload }) {
  const H = useHub();
  const [pid, setPid] = useState(null);
  const byPlayer = (id) => scats.filter((t) => t.player_id === id);
  const open = (t, player) => openScatForm(H, { t, player, roster, injuries, scats, reload });
  const p = pid && roster.find((x) => x.id === pid);

  if (p) {
    const mine = byPlayer(p.id);
    return <section className="card">
      <div className="card-head"><h2><button className="icon-btn" aria-label="Back to all players" onClick={() => setPid(null)}><Icon n="chevl" /></button>SCAT6 · {label(p)}</h2>
        <div className="acts"><button className="btn primary" onClick={() => open(null, p)}><Icon n="plus" /> New SCAT</button></div></div>
      <p className="muted small" style={{ margin: 0 }}>Every SCAT6 {p.name} has done, oldest first. Baselines are shaded; each post-injury test shows its change from the baseline before it. Click a test to see or edit it.</p>
      <ScatHistory tests={mine} injuries={injuries.filter((i) => i.player_id === p.id)} onOpen={(t) => open(t, p)} />
    </section>;
  }
  const last = (l) => l.reduce((a, t) => (!a || t.tested_on >= a.tested_on ? t : a), null);
  return <section className="card">
    <div className="card-head"><h2>SCAT6</h2><div className="acts"><button className="btn primary" onClick={() => open(null, null)}><Icon n="plus" /> New SCAT</button></div></div>
    <p className="muted small" style={{ margin: 0 }}>Enter the scores from a completed SCAT6: a <b>baseline</b> (pre-season) or a <b>post-injury</b> test. Each one is kept in the player's injury history, and repeat tests are lined up against the baseline. Click a player to see their tests.</p>
    <div className="tbl-wrap"><table className="tbl inj-tbl">
      <thead><tr><th>Player</th><th>Baseline</th><th>Latest test</th><th className="num">Tests</th><th /></tr></thead>
      <tbody>{roster.map((pl) => { const mine = byPlayer(pl.id), bl = last(mine.filter((t) => t.kind === 'baseline')), lt = last(mine.filter((t) => t.kind !== 'baseline'));
        return <tr key={pl.id} className="click" onClick={() => setPid(pl.id)}>
          <td><span className="inj-who"><Avatar p={pl} url={photos[pl.photo]} size={28} /><span><span className="inj-nm"><b>{label(pl)}</b><InjuryFlag p={pl} /></span><span className="muted small">{pl.position}</span></span></span></td>
          <td className="tnum">{bl ? fmtDate(bl.tested_on) + ' ' + bl.tested_on.slice(0, 4) : <span className="muted">None</span>}</td>
          <td className="tnum">{lt ? `${fmtDate(lt.tested_on)} · ${((n) => (n === null ? 'no symptom ratings' : `${n} symptom${n === 1 ? '' : 's'}`))(totals(lt.data).symptoms)}` : <span className="muted">—</span>}</td>
          <td className="num tnum">{mine.length || ''}</td>
          <td><button className="btn sm" onClick={(e) => { e.stopPropagation(); open(null, pl); }}><Icon n="plus" /> SCAT</button></td>
        </tr>; })}</tbody>
    </table></div>
  </section>;
}

export function openScatForm(H, props) {
  H.openDialog((c) => <ScatForm {...props} close={c} />);
}

const asText = (d = {}) => ({ ...d, symptoms: { ...(d.symptoms || {}) }, ...Object.fromEntries(Object.keys(FIELDS).map((k) => [k, d[k] === null || d[k] === undefined ? '' : String(d[k])])) });
const asData = (f) => ({ ...f, symptoms: Object.fromEntries(Object.entries(f.symptoms).filter(([, v]) => v !== '' && v !== null && v !== undefined)),
  ...Object.fromEntries(Object.keys(FIELDS).map((k) => [k, score(f[k])])) });

function ScatForm({ t, player, roster, injuries, scats, reload, close }) {
  const H = useHub();
  const pick = (pid) => { const c = currentInjury(pid, injuries.filter((i) => i.player_id === pid)); return c ? c.id : ''; };
  const start = { player_id: player ? player.id : '', tested_on: todayISO(), kind: 'injury', injury_id: player ? pick(player.id) : '', examiner: '', notes: '', ...(t || {}) };
  const [m, setM] = useState({ ...start, injury_id: start.injury_id || '' });
  const [d, setD] = useState(asText(t ? t.data : {}));
  const [busy, setBusy] = useState(false);
  const setMeta = (k) => (e) => { const v = e.target.value; setM((x) => ({ ...x, [k]: v })); };
  const setNum = (k) => (e) => { const v = e.target.value; setD((x) => ({ ...x, [k]: v })); };
  const setSym = (k, v) => setD((x) => ({ ...x, symptoms: { ...x.symptoms, [k]: x.symptoms[k] === v ? '' : v } }));
  const mineInj = injuries.filter((i) => i.player_id === m.player_id).sort((a, b) => String(b.injured_on || '').localeCompare(String(a.injured_on || '')));
  const tot = totals(asData(d));
  const draft = { ...m, id: t ? t.id : '_new', data: asData(d) };
  const base = m.kind === 'baseline' || !m.player_id ? null : baselineFor(draft, scats.filter((x) => x.player_id === m.player_id));
  const bt = base && totals(base.data);
  const bad = Object.keys(FIELDS).filter((k) => badScore(k, d[k]));
  const dirty = JSON.stringify([m, d]) !== JSON.stringify([{ ...start, injury_id: start.injury_id || '' }, asText(t ? t.data : {})]);
  const inj = mineInj.find((i) => i.id === m.injury_id), day = inj ? daysSince(inj.injured_on, m.tested_on) : null;

  const leave = async () => { if (dirty && !(await H.confirm('Close without saving?', 'The scores you entered on this SCAT haven\'t been saved.', 'Close'))) return; close(); };
  const save = async () => {
    if (!m.player_id) { H.toast('Choose the player.'); return; }
    if (!m.tested_on) { H.toast('Enter the test date.'); return; }
    if (bad.length) { H.toast(`Fix the ${bad.length === 1 ? 'score' : 'scores'} marked in red.`); return; }
    if (!Object.values(tot).some((v) => v !== null)) { H.toast('Enter at least one score from the SCAT.'); return; }
    setBusy(true);
    try { await H.api.saveScat({ ...draft, id: t ? t.id : undefined, injury_id: m.kind === 'baseline' ? null : m.injury_id || null }); H.toast(`SCAT saved for ${roster.find((p) => p.id === m.player_id)?.name || 'the player'}`); close(); reload(); }
    catch (e) { H.toast('Could not save. ' + e.message); }
    finally { setBusy(false); }
  };
  const del = async () => { close(); if (!(await H.confirm('Delete this SCAT?', 'It is removed from the player\'s injury history.'))) return;
    try { await H.api.deleteScat(t.id); } catch (e) { H.toast(e.message); } reload(); };

  const num = (k, extra) => { const f = FIELDS[k], b = badScore(k, d[k]); return <label className="field scat-num"><span>{f.label}{f.max !== undefined && f.unit !== '%' ? ` (/${f.max})` : f.unit ? ` (${f.unit})` : ''}</span>
    <input className={`input tnum ${b ? 'bad' : ''}`} inputMode="decimal" value={d[k]} onChange={setNum(k)} title={b} placeholder={extra} /></label>; };
  const out = (v, of, unit) => <span className="scat-total"><b className="tnum">{v === null ? '—' : v}{unit || ''}</b>{of ? <span className="muted"> / {of}</span> : null}</span>;
  const vsBase = (k) => (bt && tot[k] !== null && bt[k] !== null ? <span className="muted small"> · baseline {bt[k]}{{ '%': '%', s: ' s' }[SUMMARY.find((c) => c.k === k).unit] || ''}</span> : null);

  return <Modal title={t ? 'SCAT6 test' : 'New SCAT6 test'} wide onClose={leave}
    actions={<>{t && <><button className="btn danger" onClick={del}><Icon n="trash" /> Delete</button><span className="spacer" /></>}<button className="btn" onClick={leave}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
    <div className="scat-form">
      <div className="row3">
        <label className="field"><span>Player</span><select className="select" value={m.player_id} disabled={!!t} onChange={(e) => setM({ ...m, player_id: e.target.value, injury_id: pick(e.target.value) })}>
          <option value="">Choose…</option>{roster.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</select></label>
        <label className="field"><span>Test date</span><input className="input" type="date" value={m.tested_on} onChange={setMeta('tested_on')} /></label>
        <label className="field"><span>Examiner</span><input className="input" maxLength={80} value={m.examiner} onChange={setMeta('examiner')} /></label>
      </div>
      <div className="row2">
        <div className="field"><span>Test</span><div className="seg" role="tablist">{Object.entries(KINDS).map(([k, l]) => <button type="button" key={k} role="tab" aria-selected={m.kind === k} className={m.kind === k ? 'on' : ''} onClick={() => setM({ ...m, kind: k })}>{l}</button>)}</div></div>
        {m.kind !== 'baseline' && <label className="field"><span>After injury{day !== null ? ` · day ${day}` : ''}</span><select className="select" value={m.injury_id} onChange={setMeta('injury_id')} disabled={!m.player_id}>
          <option value="">No injury linked</option>{mineInj.map((i) => <option key={i.id} value={i.id}>{injName(i)}{i.injured_on ? ` · ${fmtDate(i.injured_on)} ${i.injured_on.slice(0, 4)}` : ''}{i.status === 'cleared' ? ' (cleared)' : ''}</option>)}</select></label>}
      </div>
      {m.kind !== 'baseline' && m.player_id && <div className="muted small">{base ? <>Compared with the baseline from <b>{fmtDate(base.tested_on, true)}</b>.</> : 'This player has no baseline SCAT yet, so there is nothing to compare with.'}</div>}

      <fieldset className="scat-step"><legend>Step 1 · Symptom evaluation</legend>
        <div className="muted small">Rate each symptom 0 (none) to 6 (severe), as the athlete reported it. Click a rating again to clear it.</div>
        <div className="scat-syms">{SYMPTOMS.map(([k, l]) => <div key={k} className="scat-sym"><span>{l}</span><div className="scat-rate" role="radiogroup" aria-label={l}>
          {Array.from({ length: SYMPTOM_MAX + 1 }, (_, v) => <button type="button" key={v} role="radio" aria-checked={d.symptoms[k] === v} className={d.symptoms[k] === v ? 'on' : ''} onClick={() => setSym(k, v)}>{v}</button>)}</div></div>)}</div>
        <div className="scat-sum"><span>Number of symptoms {out(tot.symptoms, 22)}{vsBase('symptoms')}</span><span>Symptom severity score {out(tot.severity, 132)}{vsBase('severity')}</span></div>
        <div className="row3">
          <label className="field"><span>Worse with physical activity?</span><select className="select" value={d.worse_physical || ''} onChange={setNum('worse_physical')}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label className="field"><span>Worse with mental activity?</span><select className="select" value={d.worse_mental || ''} onChange={setNum('worse_mental')}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          {num('pct_normal', '0–100')}
        </div>
        <label className="field"><span>If not feeling 100%, why?</span><input className="input" maxLength={300} value={d.why || ''} onChange={setNum('why')} /></label>
      </fieldset>

      <fieldset className="scat-step"><legend>Step 2 · Cognitive screening</legend>
        <div className="scat-row"><b>Immediate memory</b><label className="field scat-num"><span>Word list used</span><input className="input" maxLength={20} value={d.word_list || ''} onChange={setNum('word_list')} /></label>{num('im1')}{num('im2')}{num('im3')}<span className="scat-res">Total {out(tot.immediate, 30)}{vsBase('immediate')}</span></div>
        <div className="scat-row"><b>Concentration</b>{num('digits')}{num('months')}<span className="scat-res">Total {out(tot.concentration, 5)}{vsBase('concentration')}</span></div>
      </fieldset>

      <fieldset className="scat-step"><legend>Step 3 · Coordination and balance</legend>
        <div className="scat-row"><b>mBESS errors</b>{num('bess_double')}{num('bess_single')}{num('bess_tandem')}<span className="scat-res">Total {out(tot.bess, 30)}{vsBase('bess')}</span></div>
        <div className="scat-row"><b>Tandem gait</b>{num('gait1')}{num('gait2')}{num('gait3')}<span className="scat-res">Fastest {out(tot.gait, null, ' s')}{vsBase('gait')}</span></div>
        <div className="scat-row"><b>Dual-task gait <span className="muted small">(optional)</span></b>{num('dual')}{num('dual_cog')}</div>
      </fieldset>

      <fieldset className="scat-step"><legend>Step 4 · Delayed recall</legend>
        <div className="scat-row"><b>Words recalled</b>{num('recall')}<span className="scat-res">{out(tot.recall, 10)}{vsBase('recall')}</span></div>
      </fieldset>

      <label className="field"><span>Notes / decision</span><textarea className="input" maxLength={3000} value={m.notes} onChange={setMeta('notes')} placeholder="e.g. Neurological screen, cervical spine, clinician's decision" /></label>
    </div>
  </Modal>;
}
