// Public spectator page: /s/<token>. Reads only through spectator_view(), which returns the
// link's teams with their calendar, results and standings, and player game stats only when the
// admin ticked it. Nothing here needs a sign-in.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { applyTheme, fmtDate, fmtTime, todayISO, gameView, ourGames, hasScore, daysUntil } from '../lib/util.js';
import { seasonTotals } from '../lib/stats.js';
import OrgSchedule from './OrgSchedule.jsx';
import { StatsTable } from './Stats.jsx';
import Logo from '../components/Logo.jsx';

export default function PublicSpectator({ api }) {
  const { token } = useParams();
  const [d, setD] = useState(undefined), [tid, setTid] = useState('all');
  useEffect(() => {
    if (!api) { setD(null); return; }
    api.spectatorView(token).then((r) => { setD(r); if (r && r.teams[0]) applyTheme(r.teams[0].color); document.title = r ? `${r.org.name} · ${r.label || 'teams'}` : 'TeamHub'; }).catch(() => setD(null));
  }, [api, token]);
  const teams = useMemo(() => (d ? d.teams.map((t) => ({ ...t, logo: t.logo_url })) : []), [d]);
  if (d === undefined) return <div className="loading">Loading…</div>;
  if (!d) return <div className="auth"><div className="card"><div className="card-head"><h2>Link not available</h2></div><p className="muted" style={{ margin: 0 }}>This link was switched off, or the address is wrong. Ask the team for a new one.</p></div></div>;
  const shown = tid === 'all' ? teams : teams.filter((t) => t.id === tid);
  const today = todayISO();
  const games = (t) => ourGames(d.games.filter((g) => g.team_id === t.id).map((g) => ({ ...g, hs: g.home_score, as: g.away_score })), t);
  const data = Object.fromEntries(shown.map((t) => [t.id, { games: games(t), events: d.events.filter((e) => e.team_id === t.id) }]));
  return <div className="pub-wrap spx">
    <header className="spx-head"><Logo t={{ name: d.org.name, logo: d.org.logo_url }} cls="lg" /><div><h1>{d.org.name}</h1>{d.label && <span className="muted">{d.label}</span>}</div></header>
    {teams.length > 1 && <div className="lb-tabs spx-tabs"><button className={tid === 'all' ? 'on' : ''} onClick={() => setTid('all')}>All teams</button>{teams.map((t) => <button key={t.id} className={tid === t.id ? 'on' : ''} onClick={() => setTid(t.id)}>{t.name}</button>)}</div>}
    {shown.length > 1 && <section className="spx-next">{shown.map((t) => { const g = games(t).find((x) => x.date >= today && !hasScore(x)); const v = g && gameView(g, t); const dn = g && daysUntil(g.date);
      return <div key={t.id} className="tile"><div className="tile-k">{t.name} · next game</div><div className="tile-v">{g ? `${v.home ? 'vs' : '@'} ${v.opp}` : '—'}</div>
        <div className="tile-s">{g ? `${fmtDate(g.date)}${g.time ? ' · ' + fmtTime(g.time) : ''}${g.venue ? ' · ' + g.venue : ''} · ${dn === 0 ? 'today' : dn === 1 ? 'tomorrow' : `in ${dn} days`}` : 'No game scheduled'}</div></div>; })}</section>}
    <OrgSchedule key={tid} orgKey={`spx:${token}:${tid}`} orgName={tid === 'all' ? d.org.name : shown[0].name} teams={shown} data={data} />
    {shown.map((t) => { const res = games(t).filter(hasScore).reverse(); const st = d.standings.find((s) => s.team_id === t.id); const groups = (st && st.groups) || [];
      const stats = d.stats ? seasonTotals(d.stats.filter((r) => r.team_id === t.id), t.sport) : null;
      return <div key={t.id} className="spx-team">
        {shown.length > 1 && <h2 className="spx-tn"><Logo t={t} />{t.name}</h2>}
        <div className="spx-grid">
          <section className="card"><div className="card-head"><h2>Results</h2><span className="muted small">{res.length} played</span></div>
            {!res.length ? <p className="muted small" style={{ margin: 0 }}>No results yet.</p> : <ul className="ws-list">{res.map((g) => { const v = gameView(g, t); return <li key={g.id}><span className="ws-d">{fmtDate(g.date)}</span><b>{v.home ? 'vs' : '@'} {v.opp}</b><span className={`pill ${v.res}`}>{v.res.toUpperCase()} {v.us}–{v.them}</span></li>; })}</ul>}</section>
          <section className="card"><div className="card-head"><h2>Standings</h2></div>
            {!groups.length ? <p className="muted small" style={{ margin: 0 }}>No standings yet.</p> : groups.map((g, gi) => <div key={gi}>{g.name && groups.length > 1 && <div className="grp-name">{g.name}</div>}
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>Team</th>{g.cols.map((c) => <th key={c} className="num">{c}</th>)}</tr></thead>
                <tbody>{g.rows.map((r, i) => <tr key={i} className={r.team && t.school && r.team.toLowerCase().includes(t.school.toLowerCase()) ? 'us' : ''}><td className="tnum">{r.rank || i + 1}</td><td>{r.team}</td>{g.cols.map((c) => <td key={c} className="num tnum">{(r.v || {})[c]}</td>)}</tr>)}</tbody></table></div></div>)}</section>
        </div>
        {stats && <section className="card"><div className="card-head"><h2>Player stats</h2><span className="muted small">Season totals · click a column to sort</span></div><StatsTable rows={stats} sport={t.sport} /></section>}
      </div>; })}
    <footer className="muted small spx-foot">Shared by {d.org.name} with TeamHub. Read-only.</footer>
  </div>;
}
