// Data access against Supabase. Every call runs as the signed-in user, so the database's RLS
// rules decide what each person can read or change; nothing here is a permission check.
import { supabase } from './supabaseClient.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

/* ---------- row <-> app shapes ---------- */
const teamIn = (t) => ({ id: t.id, org_id: t.org_id, name: t.name, school: t.school, sport: t.sport, level: t.level, color: t.color, logo: t.logo_url, leagueName: t.league_name, leagueUrl: t.league_url, syncUrl: t.sync_url, syncEnabled: t.sync_enabled, sort_order: t.sort_order, created_at: t.created_at });
const teamOut = (t) => ({ org_id: t.org_id, name: t.name, school: t.school || '', sport: t.sport, level: t.level, color: t.color, logo_url: t.logo || null, league_name: t.leagueName || '', league_url: t.leagueUrl || '', sync_url: t.syncUrl || '', sync_enabled: t.syncEnabled !== false, sort_order: t.sort_order ?? 0 });
const gameIn = (g) => ({ id: g.id, date: g.date, time: g.time, home: g.home, away: g.away, hs: g.home_score, as: g.away_score, venue: g.venue, round: g.round, source: g.source, ext_id: g.ext_id, sync_flag: g.sync_flag, sync_changes: g.sync_changes });
const gameOut = (teamId, g) => ({ team_id: teamId, date: g.date, time: g.time || '', home: g.home, away: g.away, home_score: g.hs ?? null, away_score: g.as ?? null, venue: g.venue || '', round: g.round || '', source: g.source || 'manual', ext_id: g.ext_id || null });
const eventOut = (teamId, e) => ({ team_id: teamId, date: e.date, time: e.time || '', title: e.title, kind: e.kind === 'practice' ? 'practice' : 'event', location: e.location || '', ext_id: e.ext_id || null });
const notifIn = (n) => ({ id: n.id, text: n.text, read: n.read, ts: Date.parse(n.created_at) });
const chatIn = (m) => ({ id: m.id, user_id: m.user_id, author: m.author, body: m.body, ts: Date.parse(m.created_at) });

async function saveRows(table, rows) {
  const upd = rows.filter((r) => r.id), ins = rows.filter((r) => !r.id).map(({ id, ...r }) => r);
  const out = [];
  if (upd.length) out.push(...ok(await supabase.from(table).upsert(upd).select()));
  if (ins.length) out.push(...ok(await supabase.from(table).insert(ins).select()));
  return out;
}

export const api = {
  /* ---------- auth ---------- */
  async getUser() { const { data } = await supabase.auth.getSession(); return data.session ? data.session.user : null; },
  onAuthChange(cb) { const { data } = supabase.auth.onAuthStateChange((_e, s) => cb(s ? s.user : null)); return () => data.subscription.unsubscribe(); },
  async signIn(email, password) { ok(await supabase.auth.signInWithPassword({ email, password })); },
  async signUp(email, password) { return ok(await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })); },
  async signOut() { await supabase.auth.signOut(); },
  async resetPassword(email) { ok(await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/reset' })); },
  async updatePassword(password) { ok(await supabase.auth.updateUser({ password })); },

  /* ---------- hub ---------- */
  async loadHub(user) {
    const [mem, orgs, teams, prefs] = await Promise.all([
      supabase.from('memberships').select('org_id, role').eq('user_id', user.id),
      supabase.from('organizations').select('*'),
      supabase.from('teams').select('*').order('sort_order').order('created_at'),
      supabase.from('user_settings').select('value').eq('user_id', user.id).maybeSingle(),
    ]);
    const roles = Object.fromEntries(ok(mem).map((m) => [m.org_id, m.role]));
    return { orgs: ok(orgs).map((o) => ({ ...o, role: roles[o.id] || null })), teams: ok(teams).map(teamIn), prefs: (ok(prefs) || {}).value || {} };
  },
  async savePrefs(user, value) { ok(await supabase.from('user_settings').upsert({ user_id: user.id, value })); },

  async loadTeamData(teamId, canEdit) {
    const q = (t) => supabase.from(t).select('*').eq('team_id', teamId);
    const [games, events, standings, notifs, weeks, days, settings, coach, cands, run] = await Promise.all([
      q('games').order('date'), q('events').order('date'), q('standings').maybeSingle(),
      q('notifications').order('created_at', { ascending: false }).limit(60),
      q('sc_weeks'), q('sc_days'), q('settings'),
      canEdit ? q('coach_notes').maybeSingle() : Promise.resolve({ data: null }),
      canEdit ? q('sync_candidates').eq('status', 'open').order('found_at') : Promise.resolve({ data: [] }),
      supabase.from('sync_runs').select('*').eq('team_id', teamId).order('ran_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const st = ok(standings), set = Object.fromEntries(ok(settings).map((s) => [s.key, s.value])), c = ok(coach), r = ok(run);
    return {
      league: { groups: st ? st.groups : [], updatedAt: st ? Date.parse(st.updated_at) : null, games: ok(games).map(gameIn) },
      events: ok(events),
      notifs: ok(notifs).map(notifIn),
      sc: {
        weeks: Object.fromEntries(ok(weeks).map((w) => [w.week_start, { phase: w.phase, week: w.season_week }])),
        days: Object.fromEntries(ok(days).map((d) => [d.date, { theme: d.theme, intensity: d.intensity, ...(d.note ? { note: d.note } : {}), ...(d.pdf_color ? { pdfColor: d.pdf_color } : {}) }])),
        loads: set.sc_loads, band: set.sc_band,
      },
      coach: canEdit ? (c ? { notes: c.notes, todos: c.todos } : { notes: '', todos: [] }) : null,
      candidates: ok(cands),
      lastRun: r ? { ok: r.ok, message: r.message, ts: Date.parse(r.ran_at) } : null,
    };
  },
  async loadOrgData(teamIds) {
    if (!teamIds.length) return {};
    const [g, e] = await Promise.all([supabase.from('games').select('*').in('team_id', teamIds), supabase.from('events').select('*').in('team_id', teamIds)]);
    const out = Object.fromEntries(teamIds.map((id) => [id, { games: [], events: [] }]));
    ok(g).forEach((x) => out[x.team_id].games.push(gameIn(x)));
    ok(e).forEach((x) => out[x.team_id].events.push(x));
    return out;
  },

  /* ---------- games / events / league ---------- */
  async saveGames(teamId, games) { return (await saveRows('games', games.map((g) => ({ id: g.id, ...gameOut(teamId, g) })))).map(gameIn); },
  async deleteGame(id) { ok(await supabase.from('games').delete().eq('id', id)); },
  async clearGameFlag(id) { ok(await supabase.from('games').update({ sync_flag: null, sync_changes: null }).eq('id', id)); },
  async saveEvents(teamId, events) { return saveRows('events', events.map((e) => ({ id: e.id, ...eventOut(teamId, e) }))); },
  async deleteEvent(id) { ok(await supabase.from('events').delete().eq('id', id)); },
  async saveStandings(teamId, groups) { ok(await supabase.from('standings').upsert({ team_id: teamId, groups, updated_at: new Date().toISOString() })); },
  async addNotif(teamId, text) { return notifIn(ok(await supabase.from('notifications').insert({ team_id: teamId, text }).select().single())); },
  async markNotifs(teamId, ids) { let q = supabase.from('notifications').update({ read: true }).eq('team_id', teamId); if (ids) q = q.in('id', ids); ok(await q); },
  async clearNotifs(teamId) { ok(await supabase.from('notifications').delete().eq('team_id', teamId)); },
  async resolveCandidate(id, status) { ok(await supabase.from('sync_candidates').update({ status }).eq('id', id)); },
  async syncNow(teamId) { const { data, error } = await supabase.functions.invoke('league-sync', { body: { team_id: teamId } }); if (error) throw error; return data; },

  /* ---------- S&C ---------- */
  async saveScDay(teamId, date, x) {
    if (!x) return ok(await supabase.from('sc_days').delete().eq('team_id', teamId).eq('date', date));
    ok(await supabase.from('sc_days').upsert({ team_id: teamId, date, theme: x.theme || '', intensity: x.intensity || '', note: x.note || '', pdf_color: x.pdfColor || null }));
  },
  async saveScWeek(teamId, mk, w) { ok(await supabase.from('sc_weeks').upsert({ team_id: teamId, week_start: mk, phase: w.phase || '', season_week: w.week || '' })); },
  async removeScWeek(teamId, mk, lastDay) {
    ok(await supabase.from('sc_weeks').delete().eq('team_id', teamId).eq('week_start', mk));
    ok(await supabase.from('sc_days').delete().eq('team_id', teamId).gte('date', mk).lte('date', lastDay));
  },
  async saveSetting(teamId, key, value) { ok(await supabase.from('settings').upsert({ team_id: teamId, key, value })); },
  async saveCoach(teamId, c) { ok(await supabase.from('coach_notes').upsert({ team_id: teamId, notes: c.notes || '', todos: c.todos || [], updated_at: new Date().toISOString() })); },

  /* ---------- chat ---------- */
  /** Newest `limit` messages (oldest first), or the ones before `beforeTs`. */
  async listChat(teamId, { beforeTs, limit = 100 } = {}) {
    let q = supabase.from('chat_messages').select('*').eq('team_id', teamId).order('created_at', { ascending: false }).limit(limit);
    if (beforeTs) q = q.lt('created_at', new Date(beforeTs).toISOString());
    return ok(await q).map(chatIn).reverse();
  },
  async sendChat(teamId, body) { return chatIn(ok(await supabase.from('chat_messages').insert({ team_id: teamId, body }).select().single())); },
  async deleteChat(id) { ok(await supabase.from('chat_messages').delete().eq('id', id)); },
  /** Live updates for one team's chat. Realtime only delivers rows this user may read. */
  subscribeChat(teamId, { onAdd, onRemove }) {
    const ch = supabase.channel('chat:' + teamId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `team_id=eq.${teamId}` }, (p) => onAdd(chatIn(p.new)))
      // delete events can't be filtered by team and carry only the id; ids from other teams are ignored
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (p) => p.old && onRemove(p.old.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  },

  /* ---------- teams / orgs / members ---------- */
  async saveTeam(t) {
    const row = teamOut(t);
    return teamIn(ok(t.id ? await supabase.from('teams').update(row).eq('id', t.id).select().single() : await supabase.from('teams').insert(row).select().single()));
  },
  async deleteTeam(id) { ok(await supabase.from('teams').delete().eq('id', id)); },
  async uploadLogo(teamId, blob) {
    const path = `${teamId}/logo-${Date.now()}.png`;
    ok(await supabase.storage.from('logos').upload(path, blob, { contentType: 'image/png', upsert: true }));
    return supabase.storage.from('logos').getPublicUrl(path).data.publicUrl;
  },
  async createOrg(name, slug) { const id = ok(await supabase.rpc('create_org', { p_name: name, p_slug: slug })); return { id, name, slug, public_schedule: false, role: 'admin' }; },
  async updateOrg(id, patch) { ok(await supabase.from('organizations').update(patch).eq('id', id)); },
  async listMembers(orgId) {
    const [m, inv] = await Promise.all([supabase.from('memberships').select('user_id, role').eq('org_id', orgId), supabase.from('invites').select('email, role').eq('org_id', orgId)]);
    const mem = ok(m); const ids = mem.map((x) => x.user_id);
    const prof = ids.length ? ok(await supabase.from('profiles').select('id, email').in('id', ids)) : [];
    const em = Object.fromEntries(prof.map((p) => [p.id, p.email]));
    return [...mem.map((x) => ({ user_id: x.user_id, email: em[x.user_id] || '(unknown)', role: x.role })), ...(ok(inv) || []).map((x) => ({ email: x.email, role: x.role, pending: true }))];
  },
  async inviteMember(orgId, email, role) { return ok(await supabase.rpc('invite_member', { p_org: orgId, p_email: email, p_role: role })); },
  async setMemberRole(orgId, m, role) {
    if (m.pending) ok(await supabase.from('invites').update({ role }).eq('org_id', orgId).eq('email', m.email));
    else ok(await supabase.from('memberships').update({ role }).eq('org_id', orgId).eq('user_id', m.user_id));
  },
  async removeMember(orgId, m) {
    if (m.pending) ok(await supabase.from('invites').delete().eq('org_id', orgId).eq('email', m.email));
    else ok(await supabase.from('memberships').delete().eq('org_id', orgId).eq('user_id', m.user_id));
  },

  /* ---------- public ---------- */
  async publicSchedule(slug) { return ok(await supabase.rpc('public_schedule', { p_slug: slug })); },
};
