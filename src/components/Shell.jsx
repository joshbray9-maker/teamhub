import { useEffect, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { MENUS, SPORTS, LEVELS, ORG_PAL } from '../lib/util.js';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import TeamForm from './TeamForm.jsx';
import MembersDialog from './MembersDialog.jsx';

export function fullMenuOrder(saved) {
  const known = new Set(MENUS.map((m) => m.id));
  const out = (saved || []).filter((id) => known.has(id));
  MENUS.forEach((m, i) => {
    if (out.includes(m.id)) return;
    // a menu added later lands after its default predecessor
    let at = 0; for (let j = i - 1; j >= 0; j--) { const k = out.indexOf(MENUS[j].id); if (k >= 0) { at = k + 1; break; } }
    out.splice(at, 0, m.id);
  });
  return out;
}
export function menuLabel(m, t) {
  if (m.id === 'gameday') return t && t.sport === 'hockey' ? 'Game day / Lines' : 'Game day / Tactics';
  return m.label;
}

export default function Shell({ children }) {
  const H = useHub();
  const [drawer, setDrawer] = useState(false);
  const close = () => setDrawer(false);
  useEffect(() => { const esc = (e) => { if (e.key === 'Escape') setDrawer(false); }; document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, []);
  const t = H.team, o = H.viewOrg;
  return (
    <div className={`shell ${drawer ? 'drawer' : ''}`}>
      <aside className="side" aria-label="Main menu"><Side onNavigate={close} /></aside>
      <div className="scrim" onClick={close} />
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <button className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu"><Icon n="menu" /></button>
          <Logo t={o ? { name: o.name, logo: o.logo_url } : t} />
          <div className="topbar-title"><span className="ts-name">{o ? o.name : t ? t.name : 'TeamHub'}</span></div>
        </header>
        <main className="main"><div className="main-in">{children}</div></main>
      </div>
    </div>
  );
}

function Side({ onNavigate }) {
  const H = useHub();
  const [open, setOpen] = useState(false);
  const wrap = useRef();
  useEffect(() => {
    if (!open) return;
    const f = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', f); return () => document.removeEventListener('click', f);
  }, [open]);
  const t = H.team, o = H.viewOrg, ots = o ? H.orgTeams(o.id) : [];
  const orgsWithTeams = H.orgs.map((x) => ({ ...x, n: H.orgTeams(x.id).length })).filter((x) => x.n);
  const adminOrgs = H.orgs.filter((x) => x.role === 'admin');
  const pick = (fn) => () => { setOpen(false); fn(); onNavigate(); };
  const visible = fullMenuOrder(H.prefs.menuOrder).map((id) => MENUS.find((m) => m.id === id)).filter((m) => H.menuAvailable(m));

  return (<>
    <div className="team-switch" ref={wrap}>
      <button className="ts-btn" onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open}>
        <Logo t={o ? { name: o.name, logo: o.logo_url } : t} />
        <span className="ts-txt"><span className="ts-name">{o ? o.name : t ? t.name : 'TeamHub'}</span>
          <span className="ts-meta">{o ? `Master schedule · ${ots.length} team${ots.length === 1 ? '' : 's'}` : t ? `${SPORTS[t.sport] || ''} · ${LEVELS[t.level] || ''}` : 'No team yet'}</span></span>
        <Icon n="down" />
      </button>
      {open && <div className="pop" role="menu">
        {H.teamList.map((x) => <button key={x.id} className="pop-item" role="menuitem" onClick={pick(() => H.selectTeam(x.id))}>
          <Logo t={x} /><span className="ts-txt">{x.name}<span className="ts-meta">{SPORTS[x.sport] || ''} · {LEVELS[x.level] || ''}</span></span>{x.id === H.teamId && !o && <Icon n="check" />}</button>)}
        {orgsWithTeams.length > 0 && <><div className="pop-sep" /><div className="pop-label">Master schedules</div>
          {orgsWithTeams.map((x) => <button key={x.id} className="pop-item" role="menuitem" onClick={pick(() => H.openOrg(x.id))}>
            <Logo t={{ name: x.name, logo: x.logo_url }} /><span className="ts-txt">{x.name}<span className="ts-meta">{x.n} team{x.n === 1 ? '' : 's'}</span></span>{o && o.id === x.id && <Icon n="check" />}</button>)}</>}
        {(H.isCoach || adminOrgs.length > 0) && <><div className="pop-sep" />
          {t && !o && H.isCoach && <button className="pop-item dim" onClick={pick(() => H.openDialog((c) => <TeamForm t={t} close={c} />))}><Icon n="gear" /> Team settings</button>}
          {t && !o && H.isAdmin && <button className="pop-item dim" onClick={pick(() => H.openDialog((c) => <MembersDialog org={H.orgOf(t)} close={c} />))}><Icon n="users" /> Members & sharing</button>}
          {o && o.role === 'admin' && <button className="pop-item dim" onClick={pick(() => H.openDialog((c) => <MembersDialog org={o} close={c} />))}><Icon n="users" /> Members & sharing</button>}
          <button className="pop-item dim" onClick={pick(() => H.openDialog((c) => <TeamForm t={null} close={c} />))}><Icon n="plus" /> New team</button></>}
        <div className="pop-sep" />
        <button className="pop-item dim" onClick={pick(() => H.api.signOut())}><Icon n="user" /> Sign out</button>
      </div>}
    </div>
    {o ? <>
      <div className="side-label">Schedule</div>
      <ul className="menu"><li className="on"><a href="#" onClick={(e) => e.preventDefault()}><Icon n="cal" /><span>Master schedule</span></a></li></ul>
      <div className="side-label">Teams</div>
      <ul className="menu">{ots.map((x, i) => <li key={x.id}><a href="#" onClick={(e) => { e.preventDefault(); H.selectTeam(x.id); onNavigate(); }}><i className="tdot" style={{ background: ORG_PAL[i % ORG_PAL.length] }} /><span>{x.name}</span></a></li>)}</ul>
    </> : <>
      <div className="side-label">Menu</div>
      {t && <MenuList items={visible} onNavigate={onNavigate} />}
    </>}
    <div className="side-foot">
      <div className="sync">{H.pending ? <><span className="dot warn" />Saving…</> : H.api.demo ? <><span className="dot warn" />Demo data on this device</> : <><span className="dot" />Synced</>}</div>
      <div>{H.role === 'admin' ? 'Admin view' : H.isCoach ? 'Coach view' : 'Viewer'}{H.user && H.user.email ? ` · ${H.user.email}` : ''}</div>
    </div>
  </>);
}

/* sidebar drag-to-reorder */
function MenuList({ items, onNavigate }) {
  const H = useHub();
  const [order, setOrder] = useState(items.map((m) => m.id));
  const [drag, setDrag] = useState(null);
  const list = useRef();
  useEffect(() => { if (!drag) setOrder(items.map((m) => m.id)); }, [items.map((m) => m.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = Object.fromEntries(items.map((m) => [m.id, m]));

  const start = (e, id) => {
    if (!H.isCoach) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(id);
  };
  const move = (e) => {
    if (!drag) return;
    const lis = [...list.current.children].filter((x) => x.dataset.id !== drag);
    let before = null; for (const s of lis) { const r = s.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { before = s.dataset.id; break; } }
    setOrder((o) => { const rest = o.filter((x) => x !== drag); const i = before ? rest.indexOf(before) : rest.length; rest.splice(i, 0, drag); return rest; });
  };
  const end = () => {
    if (!drag) return; setDrag(null);
    // hidden sport-specific menus keep their own slot; visible ones fill the remaining slots in the new order
    const full = fullMenuOrder(H.prefs.menuOrder), vis = new Set(order); let j = 0;
    const res = full.map((id) => (vis.has(id) ? order[j++] : id));
    if (res.join() !== full.join()) H.savePrefs({ menuOrder: res });
  };
  return <ul className="menu" ref={list}>{order.filter((id) => byId[id]).map((id) => { const m = byId[id]; return (
    <li key={id} data-id={id} className={`${H.page === id ? 'on' : ''} ${drag === id ? 'dragging' : ''}`}>
      <a href="#" onClick={(e) => { e.preventDefault(); H.go(id); onNavigate(); }}><Icon n={m.icon} /><span>{menuLabel(m, H.team)}</span>{m.coach && <em className="tag">Coach</em>}</a>
      {H.isCoach && <span className="grip" title="Drag to reorder" aria-label={`Drag to reorder ${m.label}`} onPointerDown={(e) => start(e, id)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><Icon n="grip" /></span>}
    </li>); })}</ul>;
}
