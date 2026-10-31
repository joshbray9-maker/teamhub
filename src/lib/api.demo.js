// Local demo backend for `npm run dev` before Supabase is set up: same API as
// api.supabase.js, running on the exported artifact data in seed/export, saved to this
// browser's localStorage. Only loaded in development builds (see api.js).
import { clone, uid, slugify } from './util.js';

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
    if (!org) { org = { id: 'o_' + slugify(orgName), slug: slugify(orgName), name: orgName, public_schedule: true, role: 'admin' }; db.orgs.push(org); db.members[org.id] = [{ user_id: USER.id, email: USER.email, role: 'admin' }]; }
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

  async loadHub() { await load(); return clone({ orgs: db.orgs, teams: [...db.teams].sort((a, b) => a.sort_order - b.sort_order), prefs: db.prefs }); },
  async savePrefs(_u, v) { db.prefs = clone(v); save(); },
  async loadTeamData(teamId, canEdit) {
    await load(); const d = D(teamId);
    return clone({ league: { groups: d.groups, updatedAt: d.updatedAt, games: d.games }, events: d.events, notifs: [...d.notifs].sort((a, b) => b.ts - a.ts), sc: d.sc, coach: canEdit ? d.coach : null, candidates: d.candidates.filter((c) => c.status !== 'added' && c.status !== 'dismissed'), lastRun: d.lastRun });
  },
  async loadOrgData(ids) { await load(); return clone(Object.fromEntries(ids.map((id) => [id, { games: D(id).games, events: D(id).events }]))); },
  async saveGames(teamId, games) { const r = upsert(D(teamId).games, games, 'g'); save(); return clone(r); },
  async deleteGame(id) { Object.values(db.data).forEach((d) => { d.games = d.games.filter((g) => g.id !== id); }); save(); },
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
  async saveSetting(teamId, key, value) { const s = D(teamId).sc; if (key === 'sc_loads') s.loads = value; if (key === 'sc_band') s.band = value; save(); },
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

  async listLineups(teamId) { await load(); return clone(D(teamId).lineups || {}); },
  async saveLineup(teamId, key, slots) { (D(teamId).lineups = D(teamId).lineups || {})[key] = { slots: clone(slots), updatedAt: Date.now() }; save(); },
  async deleteLineup(teamId, key) { delete (D(teamId).lineups || {})[key]; save(); },

  async saveTeam(t) {
    if (t.id) { const i = db.teams.findIndex((x) => x.id === t.id); db.teams[i] = { ...db.teams[i], ...clone(t) }; save(); return clone(db.teams[i]); }
    const n = { ...clone(t), id: 't' + uid(), created_at: Date.now() }; db.teams.push(n); save(); return clone(n);
  },
  async deleteTeam(id) { db.teams = db.teams.filter((t) => t.id !== id); delete db.data[id]; save(); },
  async uploadLogo(_teamId, blob) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); },
  async createOrg(name, slug) { const o = { id: 'o_' + slug, slug, name, public_schedule: false, role: 'admin' }; db.orgs.push(o); db.members[o.id] = [{ user_id: USER.id, email: USER.email, role: 'admin' }]; save(); return clone(o); },
  async updateOrg(id, patch) { Object.assign(db.orgs.find((o) => o.id === id), patch); save(); },
  async listMembers(orgId) { return clone(db.members[orgId] || []); },
  async inviteMember(orgId, email, role) { (db.members[orgId] = db.members[orgId] || []).push({ email: email.toLowerCase(), role, pending: true }); save(); return 'invited'; },
  async setMemberRole(orgId, m, role) { const x = (db.members[orgId] || []).find((y) => y.email === m.email); if (x) x.role = role; save(); },
  async removeMember(orgId, m) { db.members[orgId] = (db.members[orgId] || []).filter((y) => y.email !== m.email); save(); },

  async publicSchedule(slug) {
    await load(); const o = db.orgs.find((x) => x.slug === slug && x.public_schedule); if (!o) return null;
    const ts = db.teams.filter((t) => t.org_id === o.id);
    return clone({ org: { name: o.name, slug: o.slug }, teams: ts.map((t) => ({ id: t.id, name: t.name, school: t.school, color: t.color, logo_url: t.logo, sort_order: t.sort_order })),
      games: ts.flatMap((t) => D(t.id).games.map((g) => ({ ...g, team_id: t.id, home_score: g.hs, away_score: g.as }))), events: ts.flatMap((t) => D(t.id).events.map((e) => ({ ...e, team_id: t.id }))) });
  },
};
export function resetDemo() { localStorage.removeItem(KEY); db = null; loading = null; }
