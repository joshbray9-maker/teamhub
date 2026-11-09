// Local demo backend for `npm run dev` before Supabase is set up: same API as
// api.supabase.js, running on the exported artifact data in seed/export, saved to this
// browser's localStorage. Only loaded in development builds (see api.js).
import { clone, uid, slugify } from './util.js';
import { METRICS } from './testing.js';
import { openGames, opponentOf, cleanAnswers } from './selfAssess.js';

const KEY = 'teamhub-demo-db';
const files = import.meta.glob('../../seed/export/**/*.json');
const ORG_FOR_UNSET = { t_rugby: "Bishop's University" };
const USER = { id: 'demo-user', email: 'demo@teamhub.local' };
let db = null, loading = null;

// one shared load, even when two callers ask at once (React StrictMode runs effects twice)
function load() { return db ? Promise.resolve(db) : (loading = loading || build()); }
async function build() {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (db) return db;
  const get = async (p) => { const f = files[`../../seed/export/${p}`]; return f ? (await f()).default : null; };
  const order = ((await get('config/app.json')) || {}).teamOrder || [];
  const teamFiles = Object.keys(files).map((p) => p.match(/export\/teams\/([^/]+)\.json$/)).filter(Boolean).map((m) => m[1]);
  teamFiles.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
  db = { orgs: [], teams: [], prefs: {}, data: {}, members: {} };
  for (const [i, id] of teamFiles.entries()) {
    const t = await get(`teams/${id}.json`);
    const orgName = t.org || ORG_FOR_UNSET[id] || t.school || t.name;
    let org = db.orgs.find((o) => o.name === orgName);
    if (!org) { org = { id: 'o_' + slugify(orgName), slug: slugify(orgName), name: orgName, public_schedule: true, role: 'admin', logo_url: ({ bcs: '/logos/bcs.png', universel: '/logos/universel.png' })[slugify(orgName)] || null }; db.orgs.push(org); db.members[org.id] = [{ user_id: USER.id, email: USER.email, role: 'admin' }]; }
    db.teams.push({ id, org_id: org.id, name: t.name, school: t.school || '', sport: t.sport, level: t.level, color: t.color, logo: t.logo && /^https?:/.test(t.logo) ? t.logo : null, leagueName: t.leagueName || '', leagueUrl: t.leagueUrl || '', syncUrl: '', syncEnabled: true, sort_order: i, created_at: t.created });
    const league = (await get(`teams/${id}/data/league.json`)) || { groups: [], games: [] };
    const sc = (await get(`teams/${id}/data/sc.json`)) || { weeks: {}, days: {} };
    db.data[id] = {
      games: (league.games || []).map((g) => ({ ...g, id: 'g' + uid() })), groups: league.groups || [], updatedAt: league.updatedAt || null,
      events: ((await get(`teams/${id}/data/events.json`)) || { items: [] }).items.map((e) => ({ ...e, id: 'e' + uid() })),
      notifs: ((await get(`teams/${id}/data/notifs.json`)) || { items: [] }).items,
      sc: { weeks: sc.weeks || {}, days: sc.days || {}, loads: sc.loads, band: sc.band },
      coach: { notes: '', todos: [] }, candidates: [], lastRun: null,
    };
  }
  save(); return db;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked */ } }
const D = (teamId) => db.data[teamId] || (db.data[teamId] = { games: [], groups: [], events: [], notifs: [], sc: { weeks: {}, days: {} }, coach: { notes: '', todos: [] }, candidates: [], lastRun: null });
const upsert = (list, rows, prefix) => rows.map((r) => { const x = { ...r, id: r.id || prefix + uid() }; const i = list.findIndex((y) => y.id === x.id); if (i >= 0) list[i] = x; else list.push(x); return x; });

// a member row: pending invites by id (a link-only invite has no email), members by email
const same = (y, m) => (m.pending ? y.pending && y.id === m.id : !y.pending && y.email === m.email);
const chatSubs = new Set();
let authCb = null, signedIn = (() => { try { return localStorage.getItem(KEY + ':out') !== '1'; } catch { return true; } })();
export const api = {
  demo: true,
  async getUser() { return signedIn ? USER : null; },
  onAuthChange(cb) { authCb = cb; return () => { authCb = null; }; },
  async signIn() { signedIn = true; localStorage.removeItem(KEY + ':out'); authCb && authCb(USER); },
  async signUp() { return api.signIn(); },
  async signOut() { signedIn = false; localStorage.setItem(KEY + ':out', '1'); authCb && authCb(null); },
  async resetPassword() {}, async updatePassword() {},

  async loadHub() { await load(); const lg = Object.fromEntries(db.orgs.map((o) => [o.id, o.logo_url || null])); return clone({ orgs: db.orgs, teams: [...db.teams].sort((a, b) => a.sort_order - b.sort_order).map((t) => ({ ...t, orgLogo: lg[t.org_id] })), prefs: db.prefs }); },
  async savePrefs(_u, v) { db.prefs = clone(v); save(); },
  async loadTeamData(teamId, canEdit, med = false) {
    await load(); const d = D(teamId);
    return clone({ league: { groups: d.groups, updatedAt: d.updatedAt, games: d.games }, events: d.events, notifs: [...d.notifs].sort((a, b) => b.ts - a.ts), sc: d.sc, coach: canEdit ? d.coach : null, candidates: d.candidates.filter((c) => c.status !== 'added' && c.status !== 'dismissed'), lastRun: d.lastRun, injuries: canEdit || med ? (d.injuries || []) : [] });
  },
  async loadOrgData(ids) { await load(); return clone(Object.fromEntries(ids.map((id) => [id, { games: D(id).games, events: D(id).events, sc: (D(id).sc || {}).days || {}, weeks: (D(id).sc || {}).weeks || {} }]))); },
  async saveGames(teamId, games) { const r = upsert(D(teamId).games, games, 'g'); save(); return clone(r); },
  async deleteGame(id) { Object.values(db.data).forEach((d) => { d.games = d.games.filter((g) => g.id !== id); }); (db.selfAssess || []).forEach((a) => { if (a.game_id === id) a.game_id = null; }); save(); },
  async clearGameFlag(id) { Object.values(db.data).forEach((d) => d.games.forEach((g) => { if (g.id === id) { g.sync_flag = null; g.sync_changes = null; } })); save(); },
  async saveEvents(teamId, events) { const r = upsert(D(teamId).events, events, 'e'); save(); return clone(r); },
  async deleteEvent(id) { Object.values(db.data).forEach((d) => { d.events = d.events.filter((e) => e.id !== id); }); save(); },
  async saveStandings(teamId, groups) { Object.assign(D(teamId), { groups, updatedAt: Date.now() }); save(); },
  async addNotif(teamId, text) { const n = { id: 'n' + uid(), text, read: false, ts: Date.now() }; D(teamId).notifs.unshift(n); D(teamId).notifs = D(teamId).notifs.slice(0, 60); save(); return n; },
  async markNotifs(teamId, ids) { D(teamId).notifs.forEach((n) => { if (!ids || ids.includes(n.id)) n.read = true; }); save(); },
  async clearNotifs(teamId) { D(teamId).notifs = []; save(); },
  async resolveCandidate(id, status) { Object.values(db.data).forEach((d) => d.candidates.forEach((c) => { if (c.id === id) c.status = status; })); save(); },
  async syncNow(teamId) { D(teamId).lastRun = { ok: false, message: 'Demo mode: the league sync runs on Supabase once it is set up.', ts: Date.now() }; save(); return { results: [] }; },

  async saveScDay(teamId, date, x) { const s = D(teamId).sc; s.days = s.days || {}; if (x) s.days[date] = x; else delete s.days[date]; save(); },
  async saveScWeek(teamId, mk, w) { const s = D(teamId).sc; s.weeks = s.weeks || {}; s.weeks[mk] = w; save(); },
  async removeScWeek(teamId, mk, last) { const s = D(teamId).sc; delete (s.weeks || {})[mk]; Object.keys(s.days || {}).forEach((d) => { if (d >= mk && d <= last) delete s.days[d]; }); save(); },
  async saveScBulk(teamId, days, weeks) { const s = D(teamId).sc; s.days = { ...(s.days || {}), ...clone(days) }; s.weeks = { ...(s.weeks || {}), ...clone(weeks) }; save(); },
  async listTests(teamId) { await load(); const d = D(teamId); return clone({ sessions: [...(d.testSessions || [])].sort((a, b) => a.tested_on.localeCompare(b.tested_on)), results: d.testResults || [], teamFrom: (d.gym || {}).team_from || null }); },
  async createTestSession(teamId, tested_on, battery) { const s = { id: 'ts' + uid(), team_id: teamId, tested_on, battery, notes: '' }; (D(teamId).testSessions = D(teamId).testSessions || []).push(s); save(); return clone(s); },
  async updateTestSession(id, patch) { Object.values(db.data).forEach((d) => (d.testSessions || []).forEach((s) => { if (s.id === id) Object.assign(s, patch); })); save(); },
  async setTeamAveragesFrom(teamId, date) { const d = D(teamId); d.gym = { targets: {}, overrides: {}, ...(d.gym || {}), team_from: date || null }; save(); },
  async deleteTestSession(id) { Object.values(db.data).forEach((d) => { d.testSessions = (d.testSessions || []).filter((s) => s.id !== id); d.testResults = (d.testResults || []).filter((r) => r.session_id !== id); }); save(); },
  async saveTestResults(teamId, sessionId, rows) {
    const d = D(teamId); d.testResults = (d.testResults || []).filter((r) => !(r.session_id === sessionId && rows.some((x) => x.player_id === r.player_id)));
    rows.filter((r) => Object.keys(r.values).length).forEach((r) => d.testResults.push({ session_id: sessionId, player_id: r.player_id, values: clone(r.values) })); save();
  },
  async getGymConfig(teamId) { await load(); return clone({ leaderboard: true, ...(D(teamId).gym || { targets: {}, overrides: {} }) }); },
  async leaderboard(teamId) {
    await load(); const d = D(teamId), best = {};
    const players = Object.fromEntries((d.players || []).filter((p) => p.active !== false).map((p) => [p.id, p]));
    const when = Object.fromEntries((d.testSessions || []).map((s) => [s.id, s.tested_on]));
    for (const r of d.testResults || []) { const p = players[r.player_id]; if (!p) continue;
      for (const [k, v] of Object.entries(r.values || {})) { const key = p.id + k, b = best[key];
        if (!METRICS[k] || METRICS[k].neutral || METRICS[k].text || typeof v !== 'number') continue;   // same tests as leaderboard() in SQL
        if (!b || (METRICS[k].lower ? v < b.value : v > b.value)) best[key] = { player_id: p.id, name: p.name, num: p.num, metric: k, value: v, tested_on: when[r.session_id] }; } }
    return Object.values(best);
  },
  async setLeaderboardShared(teamId, on) { const d = D(teamId); d.gym = { targets: {}, overrides: {}, ...(d.gym || {}), leaderboard: on }; save(); },
  async saveGymConfig(teamId, c) { D(teamId).gym = clone({ ...(D(teamId).gym || {}), targets: c.targets || {}, overrides: c.overrides || {} }); save(); },
  async listPractices(teamId) { await load(); return clone([...(D(teamId).practices || [])].sort((a, b) => b.practice_on.localeCompare(a.practice_on))); },
  async savePractice(teamId, p) { const l = (D(teamId).practices = D(teamId).practices || []); const [r] = upsert(l, [{ team_id: teamId, ...clone(p) }], 'pp'); save(); return clone(r); },
  async deletePractice(id) { Object.values(db.data).forEach((d) => { d.practices = (d.practices || []).filter((x) => x.id !== id); }); save(); },
  async listDrills(teamId) { await load(); return clone([...(D(teamId).drills || [])].sort((a, b) => a.title.localeCompare(b.title))); },
  async saveDrill(teamId, d) { const l = (D(teamId).drills = D(teamId).drills || []); const [r] = upsert(l, [{ team_id: teamId, ...clone(d) }], 'dr'); save(); return clone(r); },
  async deleteDrill(id) { Object.values(db.data).forEach((d) => { d.drills = (d.drills || []).filter((x) => x.id !== id); }); save(); },
  async listPlays(teamId) { await load(); return clone(D(teamId).plays || []); },
  async savePlay(teamId, p) { const l = (D(teamId).plays = D(teamId).plays || []); const [r] = upsert(l, [{ team_id: teamId, ...clone(p) }], 'pl'); save(); return clone(r); },
  async deletePlay(id) { Object.values(db.data).forEach((d) => { d.plays = (d.plays || []).filter((x) => x.id !== id); }); save(); },
  async listGameStats(teamId) { await load(); return clone(D(teamId).gameStats || []); },
  async saveGameStats(teamId, gameId, rows) { const d = D(teamId); d.gameStats = (d.gameStats || []).filter((r) => !(r.game_id === gameId && rows.some((x) => x.player_id === r.player_id))); rows.filter((r) => Object.keys(r.stats).length).forEach((r) => d.gameStats.push({ game_id: gameId, player_id: r.player_id, stats: clone(r.stats) })); save(); },
  async listSpectatorLinks(orgId) { await load(); return clone((db.links || []).filter((l) => l.org_id === orgId)); },
  async saveSpectatorLink(orgId, l) { db.links = db.links || []; const [r] = upsert(db.links, [{ org_id: orgId, token: l.token || uid() + uid() + uid(), created_at: new Date().toISOString(), ...clone(l), team_ids: l.team_ids && l.team_ids.length ? l.team_ids : null }], 'sl'); save(); return clone(r); },
  async deleteSpectatorLink(id) { db.links = (db.links || []).filter((l) => l.id !== id); save(); },
  async spectatorView(token) {
    await load(); const l = (db.links || []).find((x) => x.token === token && !x.revoked); if (!l) return null;
    const o = db.orgs.find((x) => x.id === l.org_id); const ts = db.teams.filter((t) => t.org_id === o.id && (!l.team_ids || l.team_ids.includes(t.id)));
    const players = Object.fromEntries(ts.flatMap((t) => (D(t.id).players || []).filter((p) => p.active !== false).map((p) => [p.id, p])));
    return clone({ label: l.label, org: { name: o.name, slug: o.slug, logo_url: o.logo_url }, teams: ts.map((t) => ({ id: t.id, name: t.name, school: t.school, sport: t.sport, color: t.color, logo_url: t.logo || o.logo_url, sort_order: t.sort_order })),
      games: ts.flatMap((t) => D(t.id).games.map((g) => ({ ...g, team_id: t.id, home_score: g.hs, away_score: g.as }))), events: ts.flatMap((t) => D(t.id).events.map((e) => ({ ...e, team_id: t.id }))),
      standings: ts.map((t) => ({ team_id: t.id, groups: D(t.id).groups || [] })),
      stats: l.show_stats ? ts.flatMap((t) => (D(t.id).gameStats || []).filter((r) => players[r.player_id]).map((r) => ({ team_id: t.id, game_id: r.game_id, player_id: r.player_id, name: players[r.player_id].name, num: players[r.player_id].num, position: players[r.player_id].position, stats: r.stats }))) : null });
  },
  async getMyProfile() { await load(); return clone({ id: USER.id, email: USER.email, display_name: '', title: '', phone: '', bio: '', photo: null, ...(db.profile || {}) }); },
  async saveMyProfile(_u, p) { db.profile = clone(p); save(); },
  async uploadAvatar(_u, blob) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); },
  async avatarUrls(paths) { return Object.fromEntries(paths.filter(Boolean).map((p) => [p, p])); },
  async listStaff() { await load(); return [{ id: USER.id, email: USER.email, display_name: '', title: '', phone: '', bio: '', photo: null, ...(db.profile || {}), role: 'admin' }]; },
  async listDatasets(teamId) { await load(); return clone(D(teamId).datasets || []); },
  async saveDataset(teamId, d) { const l = (D(teamId).datasets = D(teamId).datasets || []); const [r] = upsert(l, [{ team_id: teamId, created_at: new Date().toISOString(), ...clone(d) }], 'ds'); save(); return clone(r); },
  async deleteDataset(id) { Object.values(db.data).forEach((d) => { d.datasets = (d.datasets || []).filter((x) => x.id !== id); }); save(); },
  async saveSetting(teamId, key, value) { const s = D(teamId).sc; if (key === 'sc_loads') s.loads = value; if (key === 'sc_band') s.band = value; (D(teamId).settings = D(teamId).settings || {})[key] = value; save(); },
  async saveCoach(teamId, c) { D(teamId).coach = clone(c); save(); },

  async listChat(teamId, { channel = 'team', beforeTs, limit = 100 } = {}) {
    await load(); const all = (D(teamId).chat || []).filter((m) => (m.channel || 'team') === channel && (!beforeTs || m.ts < beforeTs));
    return clone(all.slice(-limit));
  },
  async sendChat(teamId, body, channel = 'team') {
    const m = { id: 'm' + uid(), channel, user_id: USER.id, author: USER.email, body: body.trim(), ts: Date.now() };
    (D(teamId).chat = D(teamId).chat || []).push(m); save();
    chatSubs.forEach((s) => s.teamId === teamId && s.channel === channel && s.onAdd(clone(m)));
    return clone(m);
  },
  async deleteChat(id) { Object.values(db.data).forEach((d) => { d.chat = (d.chat || []).filter((m) => m.id !== id); }); save(); chatSubs.forEach((s) => s.onRemove(id)); },
  subscribeChat(teamId, channel, { onAdd, onRemove }) { const s = { teamId, channel, onAdd, onRemove }; chatSubs.add(s); return () => chatSubs.delete(s); },

  async listPlayers(teamId) { await load(); return clone(D(teamId).players || []); },
  async savePlayers(teamId, players) { const list = (D(teamId).players = D(teamId).players || []); const r = upsert(list, players.map((p) => ({ active: true, source: 'manual', ...p })), 'p'); save(); return clone(r); },
  async fetchRosterPage() { throw new Error('Demo mode: importing from a website runs on Supabase once the roster-import function is deployed.'); },
  async getSetting(teamId, key) { await load(); return (D(teamId).settings || {})[key] ?? null; },
  async uploadPlayerPhoto(_teamId, blob) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); },
  async photoUrls(paths) { return Object.fromEntries(paths.filter(Boolean).map((p) => [p, p])); },
  async saveInjuries(teamId, list) { const l = (D(teamId).injuries = D(teamId).injuries || []); const r = upsert(l, list.map((i) => ({ team_id: teamId, updated_at: new Date().toISOString(), ...i })), 'i'); save(); return clone(r); },
  async deleteInjury(id) { Object.values(db.data).forEach((d) => { d.injuries = (d.injuries || []).filter((i) => i.id !== id); }); save(); },
  async listScats(teamId) { await load(); const ids = new Set((D(teamId).players || []).map((p) => p.id)); return clone((db.scats || []).filter((t) => ids.has(t.player_id))); },
  async saveScat(t) { const l = (db.scats = db.scats || []), now = new Date().toISOString(); const [r] = upsert(l, [{ created_at: now, ...t, updated_at: now }], 'sc'); save(); return clone(r); },
  async deleteScat(id) { db.scats = (db.scats || []).filter((t) => t.id !== id); save(); },
  async listPrograms() { await load(); return clone([...(db.programs || [])].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))); },
  async saveProgram(p) {
    const l = (db.programs = db.programs || []), now = new Date().toISOString();
    const old = p.id && l.find((x) => x.id === p.id);
    const r = { ...(old || { id: 'pg' + uid(), created_at: now }), name: p.name || 'Untitled program', folder: p.folder || '', data: clone(p.data || {}), updated_at: now };
    if (old) l[l.indexOf(old)] = r; else l.push(r);
    save(); return clone(r);
  },
  async deleteProgram(id) { db.programs = (db.programs || []).filter((x) => x.id !== id); save(); },
  async listIpps(teamId) { await load(); const x = D(teamId).ipps || {}; const { base, ...ps } = x; return clone({ base: base ? base.data : null, baseAt: base ? base.updated_at : null, players: ps }); },
  async saveIpp(teamId, playerId, data) { const x = (D(teamId).ipps = D(teamId).ipps || {}); x[playerId || 'base'] = { data: clone(data), updated_at: new Date().toISOString() }; save(); },
  async deleteIpp(teamId, playerId) { delete (D(teamId).ipps || {})[playerId || 'base']; save(); },
  async listAssessLinks(teamId) {
    await load(); const l = (db.assessLinks = db.assessLinks || {});
    (D(teamId).players || []).forEach((p) => { if (!l[p.id]) l[p.id] = uid() + uid() + uid() + uid(); }); save();
    return Object.fromEntries((D(teamId).players || []).map((p) => [p.id, l[p.id]]));
  },
  async resetAssessLink(playerId) { await load(); (db.assessLinks = db.assessLinks || {})[playerId] = uid() + uid() + uid() + uid(); save(); return db.assessLinks[playerId]; },
  async listSelfAssessments(teamId) {
    await load(); const ids = new Set((D(teamId).players || []).map((p) => p.id));
    return clone((db.selfAssess || []).filter((a) => ids.has(a.player_id)).sort((a, b) => b.game_date.localeCompare(a.game_date)));
  },
  async deleteSelfAssessment(id) { db.selfAssess = (db.selfAssess || []).filter((a) => a.id !== id); save(); },
  async assessView(token) {
    await load(); const pid = Object.keys(db.assessLinks || {}).find((k) => db.assessLinks[k] === token); if (!pid) return null;
    const tid = Object.keys(db.data).find((k) => (db.data[k].players || []).some((p) => p.id === pid && p.active !== false)); if (!tid) return null;
    const p = D(tid).players.find((x) => x.id === pid), t = db.teams.find((x) => x.id === tid), o = db.orgs.find((x) => x.id === t.org_id);
    const open = openGames(D(tid).games), mine = (db.selfAssess || []).filter((a) => a.player_id === pid);
    return clone({ player: { name: p.name, num: p.num || '', position: p.position || '' }, team: { name: t.name, sport: t.sport, color: t.color, logo_url: t.logo || o.logo_url }, org: { name: o.name, logo_url: o.logo_url },
      open: open.map((g) => { const a = mine.find((x) => x.game_id === g.id); return { id: g.id, date: g.date, time: g.time || '', home: g.home, away: g.away, opponent: opponentOf(g, t), answers: a ? a.answers : null, submitted_at: a ? a.submitted_at : null }; }),
      past: mine.filter((a) => !open.some((g) => g.id === a.game_id)).sort((a, b) => b.game_date.localeCompare(a.game_date)) });
  },
  // demo: an athlete view (org role switched to 'athlete' by hand) answers as the team's first player
  async myAssessToken(teamId) {
    await load(); const t = db.teams.find((x) => x.id === teamId), o = t && db.orgs.find((x) => x.id === t.org_id); if (!o || o.role !== 'athlete') return null;
    const p = (D(teamId).players || []).find((x) => x.active !== false); if (!p) return null;
    return (await api.listAssessLinks(teamId))[p.id];
  },
  async assessSubmit(token, gameId, answers) {
    const v = await api.assessView(token); if (!v) throw new Error('This link is not valid');
    const g = v.open.find((x) => x.id === gameId); if (!g) throw new Error('This game is closed for answers');
    const a = cleanAnswers(answers); if (!Object.keys(a).length) throw new Error('Answer at least one question');
    const pid = Object.keys(db.assessLinks).find((k) => db.assessLinks[k] === token), list = (db.selfAssess = db.selfAssess || []);
    const now = new Date().toISOString(), ex = list.find((x) => x.player_id === pid && x.game_id === gameId);
    if (ex) Object.assign(ex, { answers: a, updated_at: now }); else list.push({ id: 'sa' + uid(), player_id: pid, game_id: gameId, game_date: g.date, opponent: g.opponent, answers: a, submitted_at: now, updated_at: now });
    save(); return ex ? ex.submitted_at : now;
  },
  async movePlayer(id, teamId) {
    await load(); let p = null, from = null;
    Object.entries(db.data).forEach(([tid, d]) => { const i = (d.players || []).findIndex((x) => x.id === id); if (i >= 0) { p = d.players.splice(i, 1)[0]; from = tid; } });
    if (!p || from === teamId) return;
    const to = D(teamId); (to.players = to.players || []).push(p);
    const fd = db.data[from];
    to.injuries = [...(to.injuries || []), ...(fd.injuries || []).filter((x) => x.player_id === id).map((x) => ({ ...x, team_id: teamId }))];
    fd.injuries = (fd.injuries || []).filter((x) => x.player_id !== id);
    if (fd.ipps && fd.ipps[id]) { to.ipps = { ...(to.ipps || {}), [id]: fd.ipps[id] }; delete fd.ipps[id]; }
    Object.values(fd.lineups || {}).forEach((l) => Object.keys(l.slots).forEach((k) => { if (l.slots[k].pid === id) delete l.slots[k]; }));
    if (fd.gym) delete fd.gym.overrides[id];
    save();
  },
  async deletePlayer(id) { Object.values(db.data).forEach((d) => { d.players = (d.players || []).filter((p) => p.id !== id); if (d.ipps) delete d.ipps[id]; }); db.selfAssess = (db.selfAssess || []).filter((a) => a.player_id !== id); db.scats = (db.scats || []).filter((t) => t.player_id !== id); save(); },
  async listLineups(teamId) { await load(); return clone(D(teamId).lineups || {}); },
  async saveLineup(teamId, key, slots, opponent = '') { (D(teamId).lineups = D(teamId).lineups || {})[key] = { slots: clone(slots), opponent, updatedAt: Date.now() }; save(); },
  async deleteLineup(teamId, key) { delete (D(teamId).lineups || {})[key]; save(); },

  async saveTeam(t) {
    if (t.id) { const i = db.teams.findIndex((x) => x.id === t.id); db.teams[i] = { ...db.teams[i], ...clone(t) }; save(); return clone(db.teams[i]); }
    const n = { ...clone(t), id: 't' + uid(), created_at: Date.now() }; db.teams.push(n); save(); return clone(n);
  },
  async deleteTeam(id) { db.teams = db.teams.filter((t) => t.id !== id); delete db.data[id]; save(); },
  async uploadLogo(_teamId, blob) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); },
  async createOrg(name, slug) { const o = { id: 'o_' + slug, slug, name, public_schedule: false, role: 'admin' }; db.orgs.push(o); db.members[o.id] = [{ user_id: USER.id, email: USER.email, role: 'admin' }]; save(); return clone(o); },
  async updateOrg(id, patch) { Object.assign(db.orgs.find((o) => o.id === id), patch); save(); },
  async listMembers(orgId) { return clone((db.members[orgId] || []).map((m) => (m.user_id ? { ...m, seen_at: (db.seen || {})[m.user_id] || null } : m))); },
  async touchSeen() { await load(); (db.seen = db.seen || {})[USER.id] = new Date().toISOString(); save(); },
  async inviteMember(orgId, email, role, teams = null, label = '') { (db.members[orgId] = db.members[orgId] || []).push({ id: 'inv' + uid(), email: email.toLowerCase(), label: label.trim().slice(0, 80), role, pending: true, token: 'demo-' + uid(), teams: teams && teams.length ? teams : null }); save(); return 'invited'; },
  async createInviteLink(orgId, { label = '', role, teams = null, player = null }) {
    await load(); const pt = role === 'athlete' ? db.teams.find((t) => t.org_id === orgId && (D(t.id).players || []).some((p) => p.id === player)) : null;
    if (role === 'athlete' && !pt) throw new Error('That player is not on a team in this organization');
    const token = 'demo-' + uid(); (db.members[orgId] = db.members[orgId] || []).push({ id: 'inv' + uid(), email: '', label: label.trim().slice(0, 80), role, pending: true, token, player_id: pt ? player : null, teams: pt ? [pt.id] : role !== 'admin' && teams && teams.length ? teams : null }); save(); return token;
  },
  async inviteInfo(token) {
    await load(); for (const o of db.orgs) { const m = (db.members[o.id] || []).find((x) => x.pending && x.token === token); if (m) return { org_name: o.name, role: m.role, email: m.email || null, label: m.label || '', teams: m.role === 'admin' || !m.teams ? null : db.teams.filter((t) => m.teams.includes(t.id)).map((t) => t.name), player: m.player_id ? ((m.teams && (D(m.teams[0]).players || []).find((p) => p.id === m.player_id)) || {}).name || null : null }; }
    return null;
  },
  // demo: the one demo user is already in every organization, so joining just uses the link up
  async acceptInvite(token) {
    await load(); for (const o of db.orgs) { const l = db.members[o.id] || []; const i = l.findIndex((x) => x.pending && x.token === token); if (i >= 0) { l.splice(i, 1); save(); return o.id; } }
    return null;
  },
  async setMemberTeams(orgId, m, teams) { const x = (db.members[orgId] || []).find((y) => same(y, m)); if (x) x.teams = teams && teams.length ? teams : null; save(); },
  async setMemberRole(orgId, m, role) { const x = (db.members[orgId] || []).find((y) => same(y, m)); if (x) x.role = role; save(); },
  async removeMember(orgId, m) { db.members[orgId] = (db.members[orgId] || []).filter((y) => !same(y, m)); save(); },

  async publicSchedule(slug) {
    await load(); const o = db.orgs.find((x) => x.slug === slug && x.public_schedule); if (!o) return null;
    const ts = db.teams.filter((t) => t.org_id === o.id);
    return clone({ org: { name: o.name, slug: o.slug }, teams: ts.map((t) => ({ id: t.id, name: t.name, school: t.school, color: t.color, logo_url: t.logo, sort_order: t.sort_order })),
      games: ts.flatMap((t) => D(t.id).games.map((g) => ({ ...g, team_id: t.id, home_score: g.hs, away_score: g.as }))), events: ts.flatMap((t) => D(t.id).events.map((e) => ({ ...e, team_id: t.id }))) });
  },
};
export function resetDemo() { localStorage.removeItem(KEY); db = null; loading = null; }
