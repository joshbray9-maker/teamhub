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
const chatIn = (m) => ({ id: m.id, channel: m.channel || 'team', user_id: m.user_id, author: m.author, body: m.body, ts: Date.parse(m.created_at) });

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
    const og = ok(orgs);
    const orgLogo = Object.fromEntries(og.map((o) => [o.id, o.logo_url || null]));
    // orgLogo: the organization's logo, shown for teams without their own (never saved on the team)
    return { orgs: og.map((o) => ({ ...o, role: roles[o.id] || null })), teams: ok(teams).map((t) => ({ ...teamIn(t), orgLogo: orgLogo[t.org_id] })), prefs: (ok(prefs) || {}).value || {} };
  },
  async savePrefs(user, value) { ok(await supabase.from('user_settings').upsert({ user_id: user.id, value })); },

  async loadTeamData(teamId, canEdit) {
    const q = (t) => supabase.from(t).select('*').eq('team_id', teamId);
    const [games, events, standings, notifs, weeks, days, settings, coach, cands, run, inj] = await Promise.all([
      q('games').order('date'), q('events').order('date'), q('standings').maybeSingle(),
      q('notifications').order('created_at', { ascending: false }).limit(60),
      q('sc_weeks'), q('sc_days'), q('settings'),
      canEdit ? q('coach_notes').maybeSingle() : Promise.resolve({ data: null }),
      canEdit ? q('sync_candidates').eq('status', 'open').order('found_at') : Promise.resolve({ data: [] }),
      supabase.from('sync_runs').select('*').eq('team_id', teamId).order('ran_at', { ascending: false }).limit(1).maybeSingle(),
      // injuries are staff-only (RLS); everyone else gets none
      canEdit ? q('injuries').order('updated_at', { ascending: false }) : Promise.resolve({ data: [] }),
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
      injuries: ok(inj),
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
  /** Imported S&C plan: upserts the given days and weeks, leaves the rest alone. */
  async saveScBulk(teamId, days, weeks) {
    const d = Object.entries(days).map(([date, x]) => ({ team_id: teamId, date, theme: x.theme || '', intensity: x.intensity || '', note: x.note || '', pdf_color: null }));
    const w = Object.entries(weeks).map(([mk, x]) => ({ team_id: teamId, week_start: mk, phase: x.phase || '', season_week: x.week || '' }));
    if (d.length) ok(await supabase.from('sc_days').upsert(d));
    if (w.length) ok(await supabase.from('sc_weeks').upsert(w));
  },
  async saveSetting(teamId, key, value) { ok(await supabase.from('settings').upsert({ team_id: teamId, key, value })); },
  async saveCoach(teamId, c) { ok(await supabase.from('coach_notes').upsert({ team_id: teamId, notes: c.notes || '', todos: c.todos || [], updated_at: new Date().toISOString() })); },

  /* ---------- chat ---------- */
  /** One channel's newest `limit` messages (oldest first), or the ones before `beforeTs`.
   *  Channels: 'team' (everyone in the org) and 'staff' (admins + coaches; RLS enforces it). */
  async listChat(teamId, { channel = 'team', beforeTs, limit = 100 } = {}) {
    let q = supabase.from('chat_messages').select('*').eq('team_id', teamId).eq('channel', channel).order('created_at', { ascending: false }).limit(limit);
    if (beforeTs) q = q.lt('created_at', new Date(beforeTs).toISOString());
    return ok(await q).map(chatIn).reverse();
  },
  async sendChat(teamId, body, channel = 'team') { return chatIn(ok(await supabase.from('chat_messages').insert({ team_id: teamId, channel, body }).select().single())); },
  async deleteChat(id) { ok(await supabase.from('chat_messages').delete().eq('id', id)); },
  /** Live updates for one team's chat. Realtime only delivers rows this user may read. */
  subscribeChat(teamId, channel, { onAdd, onRemove }) {
    const ch = supabase.channel(`chat:${teamId}:${channel}`)
      // Realtime filters on one column, so the channel is checked here
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `team_id=eq.${teamId}` }, (p) => { if ((p.new.channel || 'team') === channel) onAdd(chatIn(p.new)); })
      // delete events can't be filtered by team and carry only the id; ids from other teams are ignored
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (p) => p.old && onRemove(p.old.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  },

  /* ---------- roster ---------- */
  async listPlayers(teamId) { return ok(await supabase.from('players').select('*').eq('team_id', teamId).order('created_at')); },
  /** Insert or update players (rows with an id are updated). */
  async savePlayers(teamId, players) {
    return saveRows('players', players.map((p) => ({ id: p.id, team_id: teamId, num: p.num || '', name: p.name, position: p.position || '', shoots: p.shoots || '', year: p.year || '', height: p.height || '', weight: p.weight || '', hometown: p.hometown || '', active: p.active !== false, source: p.source || 'manual', ...(p.photo !== undefined ? { photo: p.photo } : {}) })));
  },
  async deletePlayer(id) { ok(await supabase.from('players').delete().eq('id', id)); },
  /** Stores a player photo in the private bucket; returns its path (saved on the player). */
  async uploadPlayerPhoto(teamId, blob) {
    const path = `${teamId}/p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    ok(await supabase.storage.from('player-photos').upload(path, blob, { contentType: 'image/jpeg' }));
    return path;
  },
  /** Short-lived links for photo paths: { path: url } */
  async photoUrls(paths) {
    const list = [...new Set(paths.filter(Boolean))]; if (!list.length) return {};
    const r = ok(await supabase.storage.from('player-photos').createSignedUrls(list, 3600));
    return Object.fromEntries(r.filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  },

  /* ---------- injuries (staff only) ---------- */
  async saveInjuries(teamId, list) {
    const text = ['player_id', 'status', 'injury', 'body_area', 'side', 'details', 'limitations'], dates = ['injured_on', 'return_practice', 'return_play', 'cleared_on'];
    return saveRows('injuries', list.map((i) => ({ id: i.id, team_id: teamId,
      ...Object.fromEntries(text.map((c) => [c, i[c] ?? ''])), ...Object.fromEntries(dates.map((c) => [c, i[c] || null])) })));
  },
  async deleteInjury(id) { ok(await supabase.from('injuries').delete().eq('id', id)); },
  /** Reads a public roster page through the roster-import function: { tables } or throws. */
  async fetchRosterPage(teamId, url) {
    const { data, error } = await supabase.functions.invoke('roster-import', { body: { team_id: teamId, url } });
    if (error) throw new Error(/not found|failed to send|404/i.test(error.message) ? 'The roster import function isn\'t set up in Supabase yet (see README: Roster import from a website).' : error.message);
    if (data.error) throw new Error(data.error);
    return data;
  },
  async getSetting(teamId, key) { const r = ok(await supabase.from('settings').select('value').eq('team_id', teamId).eq('key', key).maybeSingle()); return r ? r.value : null; },

  /* ---------- game day lines ---------- */
  /** All of a team's lines: { default: {slots, updatedAt}, <gameId>: {...} } */
  async listLineups(teamId) {
    const rows = ok(await supabase.from('lineups').select('key, slots, opponent, updated_at').eq('team_id', teamId));
    return Object.fromEntries(rows.map((r) => [r.key, { slots: r.slots || {}, opponent: r.opponent || '', updatedAt: Date.parse(r.updated_at) }]));
  },
  async saveLineup(teamId, key, slots, opponent = '') {
    ok(await supabase.from('lineups').upsert({ team_id: teamId, key, game_id: key === 'default' ? null : key, slots, opponent, updated_at: new Date().toISOString() }));
  },
  async deleteLineup(teamId, key) { ok(await supabase.from('lineups').delete().eq('team_id', teamId).eq('key', key)); },

  /* ---------- S&C testing (staff only) ---------- */
  async listTests(teamId) {
    const [s, r] = await Promise.all([supabase.from('test_sessions').select('*').eq('team_id', teamId).order('tested_on'), supabase.from('test_results').select('session_id, player_id, values').eq('team_id', teamId)]);
    return { sessions: ok(s), results: ok(r) };
  },
  async createTestSession(teamId, tested_on, battery) { return ok(await supabase.from('test_sessions').insert({ team_id: teamId, tested_on, battery }).select().single()); },
  async deleteTestSession(id) { ok(await supabase.from('test_sessions').delete().eq('id', id)); },
  /** rows: [{player_id, values}]; a row with no values removes that player's results for the session. */
  async saveTestResults(teamId, sessionId, rows) {
    const keep = rows.filter((r) => Object.keys(r.values).length), drop = rows.filter((r) => !Object.keys(r.values).length).map((r) => r.player_id);
    if (keep.length) ok(await supabase.from('test_results').upsert(keep.map((r) => ({ session_id: sessionId, player_id: r.player_id, team_id: teamId, values: r.values, updated_at: new Date().toISOString() }))));
    if (drop.length) ok(await supabase.from('test_results').delete().eq('session_id', sessionId).in('player_id', drop));
  },
  async getGymConfig(teamId) { return ok(await supabase.from('gym_config').select('targets, overrides').eq('team_id', teamId).maybeSingle()) || { targets: {}, overrides: {} }; },
  async saveGymConfig(teamId, c) { ok(await supabase.from('gym_config').upsert({ team_id: teamId, targets: c.targets || {}, overrides: c.overrides || {}, updated_at: new Date().toISOString() })); },

  /* ---------- data center ---------- */
  async listDatasets(teamId) { return ok(await supabase.from('datasets').select('*').eq('team_id', teamId).order('recorded_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })); },
  async saveDataset(teamId, d) {
    const row = { team_id: teamId, title: d.title, kind: d.kind, recorded_on: d.recorded_on || null, columns: d.columns, rows: d.rows, shared: !!d.shared, source: d.source || '' };
    return ok(d.id ? await supabase.from('datasets').update(row).eq('id', d.id).select().single() : await supabase.from('datasets').insert(row).select().single());
  },
  async deleteDataset(id) { ok(await supabase.from('datasets').delete().eq('id', id)); },

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
