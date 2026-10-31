// Public, read-only master schedule: /schedule/:org. Reads only through the
// public_schedule() database function, which returns nothing unless the org admin turned
// the public link on.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { applyTheme } from '../lib/util.js';
import OrgSchedule from './OrgSchedule.jsx';

export default function PublicSchedule({ api }) {
  const { org } = useParams();
  const [d, setD] = useState(undefined);
  useEffect(() => {
    if (!api) { setD(null); return; }
    api.publicSchedule(org).then((r) => { setD(r); if (r && r.teams[0]) applyTheme(r.teams[0].color); document.title = r ? `${r.org.name} · schedule` : 'TeamHub'; }).catch(() => setD(null));
  }, [api, org]);
  if (d === undefined) return <div className="loading">Loading schedule…</div>;
  if (!d) return <div className="auth"><div className="card"><div className="card-head"><h2>Schedule not available</h2></div><p className="muted" style={{ margin: 0 }}>This link isn't shared publicly, or the address is wrong.</p></div></div>;
  const teams = d.teams.map((t) => ({ ...t, logo: t.logo_url }));
  const data = Object.fromEntries(teams.map((t) => [t.id, { games: [], events: [] }]));
  d.games.forEach((g) => data[g.team_id] && data[g.team_id].games.push({ ...g, hs: g.home_score, as: g.away_score }));
  d.events.forEach((e) => data[e.team_id] && data[e.team_id].events.push(e));
  return <div className="pub-wrap"><OrgSchedule orgKey={'pub:' + d.org.slug} orgName={d.org.name} teams={teams} data={data} /></div>;
}
