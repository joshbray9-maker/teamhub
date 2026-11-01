import { useHub } from './lib/hub.jsx';
import { MENUS, PAGE_INFO } from './lib/util.js';
import Shell, { menuLabel } from './components/Shell.jsx';
import Home from './pages/Home.jsx';
import SC from './pages/SC.jsx';
import Chat from './pages/Chat.jsx';
import GameDay from './pages/GameDay.jsx';
import Roster from './pages/Roster.jsx';
import Injury from './pages/Injury.jsx';
import CoachReport from './pages/CoachReport.jsx';
import DataCenter from './pages/DataCenter.jsx';
import Practice from './pages/Practice.jsx';
import Playbook from './pages/Playbook.jsx';
import Stats from './pages/Stats.jsx';
import Spectators from './pages/Spectators.jsx';
import MyProfile from './pages/MyProfile.jsx';
import InjuredCard from './components/InjuredCard.jsx';
import OrgSchedule from './pages/OrgSchedule.jsx';
import PageHead from './components/PageHead.jsx';
import TeamForm from './components/TeamForm.jsx';
import Icon from './components/Icon.jsx';

export default function App() {
  const H = useHub();
  return <>
    <Shell><Page /></Shell>
    {H.dialogs.map((d) => <div key={d.id}>{d.render(d.close)}</div>)}
    {H.toastMsg && <div className="toast" role="status">{H.toastMsg}</div>}
  </>;
}

function Page() {
  const H = useHub();
  if (!H.hub) return <div className="loading">Loading TeamHub…</div>;
  if (H.viewOrg) {
    const ts = H.orgTeams(H.viewOrg.id);
    if (ts.length) return <OrgSchedule key={H.viewOrg.id} orgKey={H.viewOrg.id} orgName={H.viewOrg.name} teams={ts} data={H.orgData} openDialog={H.openDialog}
      onOpenTeam={(id) => { H.selectTeam(id); H.go('home'); }} />;
  }
  const t = H.team;
  if (!t) {
    const canCreate = true; // anyone signed in can start an organization; RLS limits what they see
    return <div className="onboard">
      <div className="eyebrow">Welcome</div><h1>{H.orgs.length ? 'No teams yet' : 'Nothing shared with you yet'}</h1>
      <p className="muted">{H.orgs.length ? 'Create the first team for your organization.' : 'If a coach or admin added you, ask them to check the email they used. You can also start your own organization.'}</p>
      {canCreate && <button className="btn primary" onClick={() => H.openDialog((c) => <TeamForm t={null} close={c} />)}><Icon n="plus" /> New team</button>}
    </div>;
  }
  if (H.tdata._loading) return <div className="loading">Loading {t.name}…</div>;
  if (H.page === 'home') return <Home key={t.id} />;
  if (H.page === 'sc') return <SC key={t.id} />;
  if (H.page === 'chat') return <Chat key={t.id} />;
  if (H.page === 'gameday' && t.sport === 'hockey') return <GameDay key={t.id} />;
  if (H.page === 'roster') return <Roster key={t.id} />;
  if (H.page === 'injury') return <Injury key={t.id} />;
  if (H.page === 'coach') return <CoachReport key={t.id} />;
  if (H.page === 'data') return <DataCenter key={t.id} />;
  if (H.page === 'practice') return <Practice key={t.id} />;
  if (H.page === 'playbook') return <Playbook key={t.id} />;
  if (H.page === 'stats') return <Stats key={t.id} />;
  if (H.page === 'spectators') return <Spectators key={t.id} />;
  if (H.page === 'profile') return <MyProfile key={t.id} />;
  const m = MENUS.find((x) => x.id === H.page) || MENUS[0];
  return <>
    <PageHead title={menuLabel(m, t)} />
    {m.id === 'practice' && <InjuredCard key={t.id} />}
    <div className="soon"><section className="card"><div className="card-head"><h2>Coming next</h2><span className="pill">Not built yet</span></div>
      <p className="muted small" style={{ margin: 0 }}>This menu is in place in the sidebar and keeps its spot in your order. We'll build it in a later step.</p>
      <ul>{(PAGE_INFO[m.id] || []).map((x) => <li key={x}>{x}</li>)}</ul></section></div>
  </>;
}
