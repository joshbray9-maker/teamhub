// App state: the signed-in user's organizations and teams, the selected team/org/page, the
// selected team's data, plus toasts and dialogs. Components call `save(...)` for writes:
// they update local state first, then the backend; a failed write shows a toast and reloads.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { applyTheme, store, SWATCHES, MENUS, SISTER } from './util.js';
import Modal from '../components/Modal.jsx';

const Ctx = createContext(null);
export const useHub = () => useContext(Ctx);

const EMPTY = { league: { groups: [], games: [] }, events: [], notifs: [], sc: { weeks: {}, days: {} }, coach: null, candidates: [], lastRun: null, injuries: [] };

export function HubProvider({ api, user, children }) {
  const [hub, setHub] = useState(null); // {orgs, teams, prefs}
  const [teamId, setTeamId] = useState(store.get('team') || null);
  const [orgId, setOrgId] = useState(store.get('org') || null);
  const [page, setPage] = useState(store.get('page') || 'home');
  const [tdata, setTdata] = useState(EMPTY);
  const [orgData, setOrgData] = useState({});
  const [pending, setPending] = useState(0);
  const [toastMsg, setToastMsg] = useState(null);
  const [dialogs, setDialogs] = useState([]);
  const toastT = useRef();
  const curTeam = useRef(teamId);
  curTeam.current = teamId;

  const toast = useCallback((m) => { setToastMsg(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(null), 2600); }, []);

  const reloadHub = useCallback(async () => { const h = await api.loadHub(user); setHub(h); return h; }, [api, user]);
  useEffect(() => { reloadHub().catch((e) => toast('Could not load: ' + e.message)); }, [reloadHub, toast]);

  const teams = hub ? hub.teams : [];
  const orgs = hub ? hub.orgs : [];
  const prefs = hub ? hub.prefs : {};
  const team = teams.find((t) => t.id === teamId) || null;
  const orgOf = (t) => orgs.find((o) => o.id === (t && t.org_id)) || null;
  const roleOf = (t) => (orgOf(t) || {}).role || null;
  const role = roleOf(team);
  const isCoach = role === 'admin' || role === 'coach';
  const isAdmin = role === 'admin';
  const viewOrg = orgId ? orgs.find((o) => o.id === orgId) || null : null;

  const teamList = useMemo(() => {
    const order = prefs.teamOrder || [];
    return [...teams].sort((a, b) => { const ia = order.indexOf(a.id), ib = order.indexOf(b.id); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || (a.sort_order - b.sort_order); });
  }, [teams, prefs.teamOrder]);
  const orgTeams = useCallback((oid) => teamList.filter((t) => t.org_id === oid), [teamList]);

  // pick a team once loaded
  useEffect(() => { if (hub && !team) { const first = teamList[0]; setTeamId(first ? first.id : null); } }, [hub, team, teamList]);
  useEffect(() => { store.set('team', teamId || ''); }, [teamId]);
  useEffect(() => { store.set('org', orgId || ''); }, [orgId]);
  useEffect(() => { store.set('page', page); }, [page]);

  const reloadTeam = useCallback(async () => {
    if (!teamId || !hub) return;
    const t = hub.teams.find((x) => x.id === teamId); if (!t) return;
    const r = (hub.orgs.find((o) => o.id === t.org_id) || {}).role;
    const d = await api.loadTeamData(teamId, r === 'admin' || r === 'coach');
    if (curTeam.current === teamId) setTdata(d); // ignore a late answer for a team we've left
  }, [api, teamId, hub]);
  useEffect(() => { setTdata({ ...EMPTY, _loading: true }); reloadTeam().catch((e) => toast('Could not load team: ' + e.message)); }, [teamId, hub && hub.teams.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadOrg = useCallback(async () => {
    if (!orgId) return; const ids = orgTeams(orgId).map((t) => t.id);
    setOrgData(await api.loadOrgData(ids));
  }, [api, orgId, orgTeams]);
  useEffect(() => { if (orgId && hub) reloadOrg().catch((e) => toast('Could not load schedule: ' + e.message)); }, [orgId, hub, reloadOrg, toast]);

  // theme follows the team (or the org's first team)
  useEffect(() => {
    const t = viewOrg ? orgTeams(viewOrg.id)[0] : team;
    applyTheme(t ? t.color : SWATCHES[0]);
  }, [team, viewOrg, orgTeams]);

  /** Run a backend write; `optimistic` is applied to tdata first. */
  const save = useCallback(async (fn, { optimistic, reload } = {}) => {
    if (optimistic) setTdata((d) => optimistic(d));
    setPending((n) => n + 1);
    try { const r = await fn(api); if (reload) await reloadTeam(); return r; }
    catch (e) { toast(/permission|row-level|policy/i.test(e.message || '') ? 'You have view-only access.' : 'Could not save. ' + (e.message || 'Try again.')); await reloadTeam().catch(() => {}); throw e; }
    finally { setPending((n) => n - 1); }
  }, [api, reloadTeam, toast]);

  const savePrefs = useCallback((patch) => {
    setHub((h) => ({ ...h, prefs: { ...h.prefs, ...patch } }));
    api.savePrefs(user, { ...prefs, ...patch }).catch(() => toast('Could not save your layout.'));
  }, [api, user, prefs, toast]);

  const menuAvailable = useCallback((m, t = team) => {
    const r = roleOf(t); const coach = r === 'admin' || r === 'coach';
    if (m.coach && !coach) return false;
    if (m.sports && !(t && m.sports.includes(t.sport))) return false;
    return true;
  }, [team, orgs]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectTeam = useCallback((id) => {
    const t = teams.find((x) => x.id === id);
    setOrgId(null); setTeamId(id);
    // stay on the same page; swap to the sport's sister page when needed
    const m = MENUS.find((x) => x.id === page);
    if (t && m && !menuAvailable(m, t)) setPage(SISTER[m.id] && menuAvailable(MENUS.find((x) => x.id === SISTER[m.id]), t) ? SISTER[m.id] : 'home');
  }, [teams, page, menuAvailable]);

  const openDialog = useCallback((render) => {
    const id = Math.random();
    const close = () => setDialogs((ds) => ds.filter((d) => d.id !== id));
    setDialogs((ds) => [...ds, { id, render, close }]);
    return close;
  }, []);
  const confirm = useCallback((title, msg, ok = 'Delete') => new Promise((res) => {
    const done = (close, v) => { close(); res(v); };
    openDialog((close) => <Modal title={title} onClose={() => done(close, false)}
      actions={<><button className="btn" onClick={() => done(close, false)}>Cancel</button><button className="btn primary" onClick={() => done(close, true)}>{ok}</button></>}>
      <p style={{ margin: 0 }}>{msg}</p></Modal>);
  }), [openDialog]);

  const value = {
    api, user, hub, orgs, teams, teamList, orgTeams, prefs, savePrefs, reloadHub, setHub,
    team, teamId, role, isCoach, isAdmin, orgOf, roleOf, selectTeam, menuAvailable,
    viewOrg, openOrg: (id) => setOrgId(id), closeOrg: () => setOrgId(null), orgData, reloadOrg,
    page, go: (p) => { setPage(p); window.scrollTo(0, 0); },
    tdata, setTdata, reloadTeam, save, pending,
    toast, toastMsg, openDialog, dialogs, confirm,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
