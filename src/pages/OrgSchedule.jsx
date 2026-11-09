// Organization master schedule: every team's games + events in one calendar and list.
// Used inside the app and, read-only, on the public /schedule/:org page.
import { useState } from 'react';
import { fmtDate, fmtTime, daysUntil, todayISO, iso, MONTHS, DOW, ORG_PAL, hasScore, isUsT, store, DOW_MON, monthGrid } from '../lib/util.js';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';

function buildItems(teams, data, hidden) {
  const out = [], all = {};
  teams.forEach((t, i) => {
    const d = data[t.id] || {}, color = ORG_PAL[i % ORG_PAL.length];
    const add = (it) => { all[it.key] = it; if (!hidden.has(t.id)) out.push(it); };
    (d.games || []).forEach((g) => {
      const home = isUsT(g.home, t), away = isUsT(g.away, t); if (!home && !away) return;
      let res = null, us = null, them = null; if (hasScore(g)) { us = +(home ? g.hs : g.as); them = +(home ? g.as : g.hs); res = us > them ? 'w' : us < them ? 'l' : 't'; }
      add({ key: t.id + '|' + g.id, tid: t.id, team: t.name, color, kind: 'game', date: g.date, time: g.time || '', title: `${home ? 'vs' : '@'} ${home ? g.away : g.home}`, venue: g.venue || '', round: g.round || '', res, us, them });
    });
    (d.events || []).forEach((e) => add({ key: t.id + '|' + e.id, tid: t.id, team: t.name, color, kind: e.kind || 'event', date: e.date, time: e.time || '', title: e.title, venue: e.location || '' }));
  });
  return { items: out.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))), all };
}

function Row({ x, onOpen }) {
  return <button className="ag-item" onClick={() => onOpen(x)}><span className="ag-bar" style={{ background: x.color }} />
    <span className="ag-time">{x.time ? fmtTime(x.time) : 'All day'}</span>
    <span style={{ minWidth: 0, flex: 1 }}><span className="ag-team" style={{ color: x.color }}>{x.team}</span><span className="ag-title">{x.title}</span>{(x.venue || x.round) && <span className="ag-sub">{[x.round, x.venue].filter(Boolean).join(' · ')}</span>}</span>
    {x.res ? <span className="fx-score">{x.us}–{x.them}<span className={`pill ${x.res}`}>{x.res.toUpperCase()}</span></span> : x.kind === 'practice' ? <span className="pill">Practice</span> : null}
  </button>;
}

export default function OrgSchedule({ orgKey, orgName, teams, data, onOpenTeam, openDialog }) {
  const [hidden, setHidden] = useState(() => { try { return new Set(JSON.parse(store.get('orgHidden:' + orgKey) || '[]')); } catch { return new Set(); } });
  const [tab, setTab] = useState('up');
  const [cal, setCal] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth(), sel: todayISO() }; });
  const [dlg, setDlg] = useState(null);
  const { items } = buildItems(teams, data, hidden), today = todayISO();
  const toggle = (id) => { const s = new Set(hidden); s.has(id) ? s.delete(id) : s.add(id); if (s.size >= teams.length) return; store.set('orgHidden:' + orgKey, JSON.stringify([...s])); setHidden(s); };
  const up = items.filter((x) => x.date >= today && !x.res), res = items.filter((x) => x.res).reverse();
  const nextG = up.find((x) => x.kind === 'game');
  const wkEnd = iso(new Date(Date.now() + 6 * 864e5)), week = up.filter((x) => x.date <= wkEnd);
  const m30 = iso(new Date(Date.now() + 30 * 864e5)); const perDay = {};
  up.filter((x) => x.kind === 'game' && x.date <= m30).forEach((x) => { (perDay[x.date] = perDay[x.date] || new Set()).add(x.tid); });
  const busy = Object.keys(perDay).filter((d) => perDay[d].size > 1).sort();
  const dn = nextG ? daysUntil(nextG.date) : 0;
  const open = (x) => (openDialog ? openDialog((c) => <ItemDialog x={x} close={c} onOpenTeam={onOpenTeam} />) : setDlg(x));
  const list = tab === 'up' ? up : res;
  const wkGames = week.filter((x) => x.kind === 'game').length;

  const listRows = []; let last = '';
  list.slice(0, 60).forEach((x) => {
    if (x.date !== last) { last = x.date; const n = perDay[x.date] ? perDay[x.date].size : 0; listRows.push(<div key={'h' + x.date} className="day-h"><span>{fmtDate(x.date, true)}</span>{tab === 'up' && n > 1 && <span className="pill warn">{n} teams play</span>}</div>); }
    listRows.push(<Row key={x.key} x={x} onOpen={open} />);
  });

  // calendar
  const { y, m, sel } = cal, map = {};
  items.forEach((x) => (map[x.date] = map[x.date] || []).push(x));
  const { start, weeks } = monthGrid(y, m);
  const move = (n) => { let mm = m + n, yy = y; if (mm < 0) { mm = 11; yy--; } if (mm > 11) { mm = 0; yy++; } setCal({ ...cal, y: yy, m: mm }); };
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); const k = iso(d); const its = map[k] || [];
    cells.push(<button key={k} className={`cal-cell ${d.getMonth() !== m ? 'out' : ''} ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''}`} onClick={() => setCal({ y: d.getFullYear(), m: d.getMonth(), sel: k })} aria-label={`${fmtDate(k, true)}${its.length ? ', ' + its.length + ' items' : ''}`}>
      <span className="cal-num">{d.getDate()}</span>
      {its.slice(0, 2).map((x) => <span key={x.key} className={`chip ${x.kind === 'game' ? 'game' : ''}`} style={{ borderLeftColor: x.color }}>{x.title}</span>)}{its.length > 2 && <span className="chip more">+{its.length - 2} more</span>}
      <span className="dots">{its.slice(0, 4).map((x) => <i key={x.key} style={{ background: x.color }} />)}</span>
    </button>);
  }
  const day = map[sel] || [];

  return <>
    <header className="page-head"><div><div className="eyebrow">Master schedule · {teams.length} team{teams.length === 1 ? '' : 's'}</div><h1>{orgName}</h1></div></header>
    <div className="tchips" role="group" aria-label="Show teams">{teams.map((t, i) => <button key={t.id} className={`tchip ${hidden.has(t.id) ? 'off' : ''}`} onClick={() => toggle(t.id)} aria-pressed={!hidden.has(t.id)}><i style={{ background: ORG_PAL[i % ORG_PAL.length] }} /><span>{t.name}</span></button>)}</div>
    <section className="strip">
      <div className={`tile hero ${nextG ? 'click' : ''}`} onClick={nextG ? () => open(nextG) : undefined}>
        <div className="tile-k">Next game {nextG && <span className="countdown">{dn === 0 ? 'Today' : dn === 1 ? 'Tomorrow' : 'In ' + dn + ' days'}</span>}</div>
        <div className="tile-v">{nextG ? nextG.title : 'No game scheduled'}</div>
        <div className="tile-s">{nextG ? `${nextG.team} · ${fmtDate(nextG.date)}${nextG.time ? ' · ' + fmtTime(nextG.time) : ''}` : 'Add games on each team’s page.'}</div>
      </div>
      <div className="tile"><div className="tile-k">Next 7 days</div><div className="tile-v tnum">{wkGames} game{wkGames === 1 ? '' : 's'}</div><div className="tile-s">{week.length - wkGames} practices & events</div></div>
      <div className="tile"><div className="tile-k">Busy days</div><div className="tile-v tnum">{busy.length}</div><div className="tile-s">{busy.length ? '2+ teams play on ' + busy.slice(0, 3).map((d) => fmtDate(d)).join(', ') + (busy.length > 3 ? '…' : '') : 'No overlapping game days in the next 30 days'}</div></div>
    </section>
    <div className="org-grid">
      <section className="card">
        <div className="card-head"><h2>Calendar</h2>
          <div className="cal-nav"><button className="icon-btn" onClick={() => move(-1)} aria-label="Previous month"><Icon n="chevl" /></button>
            <span className="cal-title">{MONTHS[m]} {y}</span>
            <button className="icon-btn" onClick={() => move(1)} aria-label="Next month"><Icon n="chev" /></button>
            <button className="btn sm ghost" onClick={() => { const d = new Date(); setCal({ y: d.getFullYear(), m: d.getMonth(), sel: todayISO() }); }}>Today</button></div></div>
        <div className="cal-dow">{DOW_MON.map((d) => <div key={d}>{d}</div>)}</div>
        <div className="cal-grid">{cells}</div>
        <div className="agenda"><div className="agenda-head"><b>{fmtDate(sel, true)}</b></div>
          {day.length ? day.map((x) => <Row key={x.key} x={x} onOpen={open} />) : <div className="muted small">Nothing on this day.</div>}</div>
      </section>
      <section className="card">
        <div className="card-head"><h2>{tab === 'up' ? 'Upcoming' : 'Results'}</h2>
          <div className="seg" role="tablist"><button className={tab === 'up' ? 'on' : ''} onClick={() => setTab('up')}>Upcoming {up.length ? `(${up.length})` : ''}</button><button className={tab === 'res' ? 'on' : ''} onClick={() => setTab('res')}>Results {res.length ? `(${res.length})` : ''}</button></div></div>
        {list.length ? <><div className="org-list">{listRows}</div>{list.length > 60 && <div className="hint">Showing the first 60 of {list.length}.</div>}</>
          : <div className="empty">{tab === 'up' ? 'Nothing scheduled yet.' : 'No results yet.'} Games and events added on each team's page appear here automatically.</div>}
      </section>
    </div>
    {dlg && <ItemDialog x={dlg} close={() => setDlg(null)} onOpenTeam={onOpenTeam} />}
  </>;
}

function ItemDialog({ x, close, onOpenTeam }) {
  return <Modal title={x.kind === 'game' ? (x.res ? 'Result' : 'Game') : x.kind === 'practice' ? 'Practice' : 'Event'} onClose={close}
    actions={<><button className="btn" onClick={close}>Close</button>{onOpenTeam && <button className="btn primary" onClick={() => { close(); onOpenTeam(x.tid, x.date); }}>Open {x.team}</button>}</>}>
    <div className="tchips"><span className="tchip"><i style={{ background: x.color }} /><span>{x.team}</span></span></div>
    <dl className="kv"><dt>{x.kind === 'game' ? 'Game' : 'What'}</dt><dd>{x.title}{x.res ? ` · ${x.us}–${x.them} (${x.res.toUpperCase()})` : ''}</dd>
      <dt>Date</dt><dd>{fmtDate(x.date, true)}</dd><dt>Time</dt><dd>{x.time ? fmtTime(x.time) : 'All day'}</dd>
      <dt>{x.kind === 'game' ? 'Venue' : 'Location'}</dt><dd>{x.venue || '—'}</dd>{x.round && <><dt>Type</dt><dd>{x.round}</dd></>}</dl>
  </Modal>;
}
