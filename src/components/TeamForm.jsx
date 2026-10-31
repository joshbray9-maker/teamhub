import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { SPORTS, LEVELS, SWATCHES, slugify } from '../lib/util.js';
import { processImage } from '../lib/logo.js';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

const NEW_ORG = '__new';

export default function TeamForm({ t, close }) {
  const H = useHub(); const isNew = !t;
  const adminOrgs = H.orgs.filter((o) => o.role === 'admin');
  const [f, setF] = useState(() => t ? { ...t } : { name: '', school: '', sport: 'rugby', level: 'university', color: SWATCHES[0], leagueName: '', leagueUrl: '', syncUrl: '', syncEnabled: true, org_id: (H.team && adminOrgs.some((o) => o.id === H.team.org_id) ? H.team.org_id : adminOrgs[0] ? adminOrgs[0].id : NEW_ORG) });
  const [newOrg, setNewOrg] = useState('');
  const [logo, setLogo] = useState(t ? t.logo : null);
  const [file, setFile] = useState(null); const [bg, setBg] = useState(true); const [tol, setTol] = useState(48);
  const [out, setOut] = useState(null); const [hint, setHint] = useState('Works best on logos with a plain background. Saved as a full-quality PNG.');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  useEffect(() => {
    if (!file) return; let live = true; setHint('Processing…');
    processImage(file, bg, tol).then((o) => { if (!live) return; setOut(o); setHint(bg ? (o.removed ? 'Background removed. Adjust the strength if edges look off.' : 'This image already has a transparent background.') : 'Original background kept.'); })
      .catch(() => live && setHint('Could not read that image. Try a PNG or JPG.'));
    return () => { live = false; };
  }, [file, bg, tol]);

  const submit = async () => {
    const name = f.name.trim(); if (!name) { H.toast('Give the team a name.'); return; }
    setBusy(true);
    try {
      let org_id = f.org_id;
      if (isNew && org_id === NEW_ORG) {
        const n = newOrg.trim(); if (!n) { H.toast('Name the new organization.'); setBusy(false); return; }
        org_id = (await H.api.createOrg(n, slugify(n) || 'org-' + Date.now().toString(36))).id;
      }
      let saved = await H.api.saveTeam({ ...f, name, school: f.school.trim(), leagueName: f.leagueName.trim(), leagueUrl: f.leagueUrl.trim(), syncUrl: (f.syncUrl || '').trim(), org_id, logo, sort_order: isNew ? H.teams.length : f.sort_order });
      if (out) {
        const blob = await new Promise((r) => out.canvas.toBlob(r, 'image/png'));
        const url = await H.api.uploadLogo(saved.id, blob);
        saved = await H.api.saveTeam({ ...saved, logo: url });
      } else if (!logo && t && t.logo) saved = await H.api.saveTeam({ ...saved, logo: null });
      await H.reloadHub();
      if (isNew) H.selectTeam(saved.id);
      close(); H.toast(isNew ? 'Team created' : 'Team saved');
    } catch (e) { H.toast('Could not save: ' + e.message); setBusy(false); }
  };
  const del = async () => {
    close();
    if (!(await H.confirm('Delete team?', `"${t.name}" and its calendar, league data, S&C plan, notes and notifications will be deleted for good.`, 'Delete team'))) return;
    try { await H.api.deleteTeam(t.id); await H.reloadHub(); H.toast('Team deleted'); } catch (e) { H.toast('Could not delete: ' + e.message); }
  };

  const preview = out ? out.canvas.toDataURL('image/png') : logo;
  return <Modal title={isNew ? 'New team' : 'Team settings'} wide onClose={close}
    actions={<>{!isNew && H.isAdmin && <><button className="btn danger" onClick={del}><Icon n="trash" /> Delete team</button><span className="spacer" /></>}<button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit} disabled={busy}>{isNew ? 'Create team' : 'Save'}</button></>}>
    <div className="row2">
      <label className="field"><span>Team name</span><input className="input" value={f.name} onChange={set('name')} placeholder="Varsity Rugby" /></label>
      <label className="field"><span>Name in league tables</span><input className="input" value={f.school} onChange={set('school')} placeholder="Same as team name" /></label>
    </div>
    <div className="row2">
      <label className="field"><span>Sport</span><select className="select" value={f.sport} onChange={set('sport')}>{Object.entries(SPORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="field"><span>Level</span><select className="select" value={f.level} onChange={set('level')}>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    </div>
    <div className="field"><span>Team colour</span><div className="swatches">{SWATCHES.map((c) => <button type="button" key={c} className={`sw ${c === f.color ? 'on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c} />)}<input type="color" value={f.color} onChange={set('color')} aria-label="Custom colour" /></div></div>
    <div className="field"><span>Logo</span><div className="logo-edit">
      <div className="checker">{preview ? <img src={preview} alt="Logo preview" /> : <span className="muted small">No logo</span>}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setFile(e.target.files[0] || null)} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" className="cb" checked={bg} onChange={(e) => setBg(e.target.checked)} /> Remove background</label>
        <label className="field"><span>Removal strength</span><input type="range" min="12" max="110" value={tol} onChange={(e) => setTol(+e.target.value)} /></label>
        <div className="hint">{hint}</div>
        {(logo || out) && <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setLogo(null); setFile(null); setOut(null); }}>Remove logo</button>}
      </div></div></div>
    <div className="row2">
      {isNew ? <label className="field"><span>Organization</span><select className="select" value={f.org_id} onChange={set('org_id')}>
        {adminOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}<option value={NEW_ORG}>New organization…</option></select></label>
        : <div className="field"><span>Organization</span><div>{(H.orgOf(t) || {}).name}</div></div>}
      {isNew && f.org_id === NEW_ORG ? <label className="field"><span>New organization name</span><input className="input" value={newOrg} onChange={(e) => setNewOrg(e.target.value)} placeholder="e.g. BCS" /></label>
        : <div className="hint" style={{ alignSelf: 'end' }}>Teams in the same organization share a master schedule and its members.</div>}
    </div>
    <div className="row2">
      <label className="field"><span>League name</span><input className="input" value={f.leagueName} onChange={set('leagueName')} placeholder="e.g. RSEQ" /></label>
      <label className="field"><span>League website</span><input className="input" type="url" value={f.leagueUrl} onChange={set('leagueUrl')} placeholder="https://" /></label>
    </div>
    <div className="row2">
      <label className="field"><span>Calendar feed for daily sync (optional)</span><input className="input" type="url" value={f.syncUrl || ''} onChange={set('syncUrl')} placeholder="https://…/schedule.ics" /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', alignSelf: 'end' }}><input type="checkbox" className="cb" checked={f.syncEnabled !== false} onChange={set('syncEnabled')} /> Daily league sync</label>
    </div>
    <div className="hint">The daily sync reads RSEQ pages directly. CSSHL and EliteProspects pages can't be read automatically; paste a calendar (.ics) link above if the league offers one, or keep using paste updates.</div>
  </Modal>;
}
