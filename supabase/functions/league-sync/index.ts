// Daily league sync. For every team with sync enabled it reads the team's league source,
// then ONLY updates games already on that team's calendar (time, venue, date moves, scores)
// and flags them as changed. Games the league lists that are not on the calendar become
// review items (sync_candidates) — they are never added automatically, because a game is
// only on a team's calendar when that team's S&C sheet has it.
//
// Called two ways:
//   - by pg_cron once a day with header `x-cron-secret: <CRON_SECRET>` → all teams
//   - by a signed-in admin/coach from the app ("Sync now") with their JWT and {team_id}
//
// Sources:
//   - teams.sync_url ending in .ics / webcal:// / containing "ical"  → calendar feed
//   - diffusion.rseq.ca league pages                                   → RSEQ's public JSON
//   - anything else                                                    → the HTML page, parsed like a paste
// CSSHL (HockeyTech) pages build their schedule with JavaScript and EliteProspects blocks
// automated requests, so those need a sync_url (calendar feed) or a manual paste; the run
// log says so instead of failing silently. This function does not try to get around either.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';
import { parseLeague, docToText, parseIcs, planIcs, planSync, rseqLeagueId, rseqGames, gameKey } from '../_shared/leagueParse.js';

const TIME_ZONE = 'America/Toronto'; // every TeamHub team plays in Eastern time
const UA = 'TeamHub schedule sync';

type Team = { id: string; name: string; school: string; league_name: string; league_url: string; sync_url: string };
type Incoming = { ext_id?: string; date: string; time: string; home: string; away: string; hs: number | null; as: number | null; venue?: string; round?: string };

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function fetchText(url: string) {
  const r = await fetch(url.replace(/^webcal:/i, 'https:'), { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}${r.status === 403 ? ' (blocks automated requests)' : ''}`);
  return r.text();
}

async function readSource(t: Team): Promise<{ games: Incoming[]; label: string }> {
  const feed = t.sync_url.trim();
  if (feed && (/\.ics(\?|$)/i.test(feed) || /^webcal:/i.test(feed) || /ical/i.test(feed))) {
    const { games } = planIcs(parseIcs(await fetchText(feed), { timeZone: TIME_ZONE }), t.school || t.name);
    return { games, label: 'calendar feed' };
  }
  const url = feed || t.league_url.trim();
  if (!url) throw new Error('No league website or calendar feed set in Team settings');
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host === 'diffusion.rseq.ca') {
    const id = rseqLeagueId(url); if (!id) throw new Error('RSEQ link has no LeagueId');
    const json = JSON.parse(await fetchText(`https://s1.rseq.ca/api/LeagueApi/GetLeagueDiffusion/?leagueId=${id}`));
    return { games: rseqGames(json), label: 'RSEQ' };
  }
  if (host === 'eliteprospects.com') throw new Error('EliteProspects blocks automated requests — add a calendar feed (.ics) as the sync source, or paste the page');
  const html = await fetchText(url);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const { games } = parseLeague(docToText(doc));
  if (!games.length) {
    const why = /hockeytech|statview/i.test(html) ? 'this page builds its schedule with JavaScript' : 'no games found on the page';
    throw new Error(`${host}: ${why} — add a calendar feed (.ics) as the sync source, or paste the page`);
  }
  return { games, label: host };
}

async function syncTeam(t: Team) {
  const { games: incoming, label } = await readSource(t);
  const { data: rows, error } = await admin.from('games').select('id,date,time,home,away,home_score,away_score,venue,ext_id').eq('team_id', t.id);
  if (error) throw error;
  const existing = (rows || []).map((g) => ({ ...g, hs: g.home_score, as: g.away_score }));
  const team = { name: t.name, school: t.school };
  const { updates, fresh } = planSync(existing, incoming, team);
  const now = new Date().toISOString();

  for (const u of updates) {
    const p: Record<string, unknown> = { synced_at: now };
    for (const [k, v] of Object.entries(u.patch)) p[k === 'hs' ? 'home_score' : k === 'as' ? 'away_score' : k] = v;
    if (u.changes.length) { p.sync_flag = 'changed'; p.sync_changes = u.changes; }
    const { error: e } = await admin.from('games').update(p).eq('id', u.id);
    if (e) throw e;
  }

  let newCount = 0;
  if (fresh.length) {
    const cands = fresh.map((g: Incoming) => ({ team_id: t.id, key: g.ext_id || gameKey(g), game: g }));
    // ignoreDuplicates keeps earlier review decisions (dismissed stays dismissed)
    const { data: ins, error: e } = await admin.from('sync_candidates').upsert(cands, { onConflict: 'team_id,key', ignoreDuplicates: true }).select('id');
    if (e) throw e;
    newCount = ins?.length || 0;
  }

  const changed = updates.filter((u) => u.changes.length).length;
  const bits = [];
  if (changed) bits.push(`${changed} game${changed > 1 ? 's' : ''} changed`);
  if (newCount) bits.push(`${newCount} new game${newCount > 1 ? 's' : ''} to review`);
  if (bits.length) await admin.from('notifications').insert({ team_id: t.id, text: `League sync (${label}): ${bits.join(', ')}` });
  const msg = `${label}: ${incoming.length} league games read, ${changed} changed, ${newCount} new to review`;
  await admin.from('sync_runs').insert({ team_id: t.id, ok: true, message: msg });
  return msg;
}

Deno.serve(async (req) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

  const body = await req.json().catch(() => ({}));
  const cronSecret = Deno.env.get('CRON_SECRET');
  let teamFilter: string | null = null;

  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
    teamFilter = body.team_id || null;
  } else {
    // A signed-in user may sync one team they can edit.
    const auth = req.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ') || !body.team_id) return json({ error: 'unauthorized' }, 401);
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { authorization: auth } }, auth: { persistSession: false } });
    const { data: ok } = await user.rpc('can_edit_team', { p_team: body.team_id });
    if (!ok) return json({ error: 'forbidden' }, 403);
    teamFilter = body.team_id;
  }

  let q = admin.from('teams').select('id,name,school,league_name,league_url,sync_url').eq('sync_enabled', true);
  if (teamFilter) q = q.eq('id', teamFilter);
  const { data: teams, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const t of (teams || []) as Team[]) {
    if (!t.league_url && !t.sync_url) continue;
    try { results.push({ team: t.name, ok: true, message: await syncTeam(t) }); }
    catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.from('sync_runs').insert({ team_id: t.id, ok: false, message });
      results.push({ team: t.name, ok: false, message });
    }
  }
  return json({ results });
});
