// Runs the real migration + generated seed in an in-process Postgres (PGlite) with small
// stand-ins for Supabase's auth/storage schemas, then checks the RLS rules as different users.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';

const STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage; create schema vault;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`;
const GRANTS = `
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
`;
const U = { josh: '00000000-0000-0000-0000-00000000000a', coach: '00000000-0000-0000-0000-00000000000b', viewer: '00000000-0000-0000-0000-00000000000c', other: '00000000-0000-0000-0000-00000000000d' };

async function setup() {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  await db.exec(GRANTS);
  // what the profiles migration sets up in Supabase: people may only update their own non-email fields
  await db.exec(`revoke update on public.profiles from authenticated, anon; grant update (display_name, title, phone, bio, photo) on public.profiles to authenticated;`);
  // Josh signs up before the seed is run
  await db.exec(`insert into auth.users values ('${U.josh}', 'Josh@Example.test')`);
  const seed = execFileSync('node', ['scripts/build-seed-sql.mjs'], { env: { ...process.env, ADMIN_EMAIL: 'josh@example.test' }, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  await db.exec(seed);
  return db;
}
async function as(db, uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}

test('migration + seed load, and access follows memberships', async () => {
  const db = await setup();
  const n = (await db.query('select count(*)::int c from public.teams')).rows[0].c;
  assert.equal(n, 8);

  // Josh is admin of all 3 orgs via the seed
  assert.equal((await as(db, U.josh, 'select count(*)::int c from teams'))[0].c, 8);

  const bcs = (await db.query(`select id from organizations where slug='bcs'`)).rows[0].id;
  const uni = (await db.query(`select id from organizations where slug='universel'`)).rows[0].id;
  // invite a coach (no account yet) and a viewer to BCS, then they sign up
  assert.equal((await as(db, U.josh, `select invite_member($1, 'Coach@x.test', 'coach') r`, [bcs]))[0].r, 'invited');
  await as(db, U.josh, `select invite_member($1, 'viewer@x.test', 'viewer')`, [bcs]);
  await db.exec(`insert into auth.users values ('${U.coach}', 'coach@x.test'), ('${U.viewer}', 'viewer@x.test'), ('${U.other}', 'other@x.test')`);

  // coach sees only BCS teams
  const coachTeams = await as(db, U.coach, 'select org_id from teams');
  assert.equal(coachTeams.length, 3);
  assert.ok(coachTeams.every((t) => t.org_id === bcs));
  // outsider sees nothing
  assert.equal((await as(db, U.other, 'select count(*)::int c from teams'))[0].c, 0);
  assert.equal((await as(db, U.other, 'select count(*)::int c from games'))[0].c, 0);

  const bcsTeam = (await db.query(`select id from teams where legacy_id='t_hockey'`)).rows[0].id;
  const uniTeam = (await db.query(`select id from teams where legacy_id='t_uni_usphl'`)).rows[0].id;

  // coach notes: coach can write + read, viewer can't read
  await as(db, U.coach, `insert into coach_notes (team_id, notes) values ($1, 'x')`, [bcsTeam]);
  assert.equal((await as(db, U.coach, 'select count(*)::int c from coach_notes'))[0].c, 1);
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from coach_notes'))[0].c, 0);

  // viewer reads games but can't write
  assert.ok((await as(db, U.viewer, 'select count(*)::int c from games where team_id=$1', [bcsTeam]))[0].c > 0);
  await assert.rejects(as(db, U.viewer, `insert into games (team_id, date, home, away) values ($1, '2026-11-01', 'a', 'b')`, [bcsTeam]));
  // coach writes own org, not another org
  await as(db, U.coach, `insert into games (team_id, date, home, away) values ($1, '2026-11-01', 'a', 'b')`, [bcsTeam]);
  await assert.rejects(as(db, U.coach, `insert into games (team_id, date, home, away) values ($1, '2026-11-01', 'a', 'b')`, [uniTeam]));
  // coach can't create teams or add members; admin can
  await assert.rejects(as(db, U.coach, `insert into teams (org_id, name) values ($1, 'X')`, [bcs]));
  await assert.rejects(as(db, U.coach, `select invite_member($1, 'z@x.test', 'admin')`, [bcs]));
  await as(db, U.josh, `insert into teams (org_id, name) values ($1, 'New team')`, [uni]);

  // BCS gets its organization logo; teams without their own logo show it on the public page
  assert.equal((await db.query(`select logo_url from organizations where slug='bcs'`)).rows[0].logo_url, '/logos/bcs.png');
  assert.equal((await db.query(`select logo_url from organizations where slug='universel'`)).rows[0].logo_url, '/logos/universel.png');

  // public schedule: off by default, then exposes only that org
  assert.equal((await as(db, null, `select public_schedule('bcs') s`))[0].s, null);
  await db.exec(`update organizations set public_schedule = true where slug = 'bcs'`);
  const pub = (await as(db, null, `select public_schedule('bcs') s`))[0].s;
  assert.equal(pub.org.slug, 'bcs');
  assert.equal(pub.teams.length, 3);
  assert.equal(pub.org.logo_url, '/logos/bcs.png');
  assert.ok(pub.teams.every((t) => t.logo_url === '/logos/bcs.png'));
  assert.ok(pub.games.length > 0 && pub.events.length > 0);
  assert.ok(!('notes' in pub) && !JSON.stringify(pub).includes('sc_days'));
  // anon can't read tables directly
  assert.equal((await as(db, null, 'select count(*)::int c from games'))[0].c, 0);

  // logo upload only into a team folder you can edit
  await as(db, U.coach, `insert into storage.objects (bucket_id, name) values ('logos', $1)`, [`${bcsTeam}/logo.png`]);
  await assert.rejects(as(db, U.coach, `insert into storage.objects (bucket_id, name) values ('logos', $1)`, [`${uniTeam}/logo.png`]));

  // chat: every org member reads + posts; sender and author come from the session
  const [vm] = await as(db, U.viewer, `insert into chat_messages (team_id, body, user_id, author) values ($1, '  hi team  ', $2, 'spoof@x.test') returning id, user_id, author, body`, [bcsTeam, U.coach]);
  assert.equal(vm.user_id, U.viewer); assert.equal(vm.author, 'viewer@x.test'); assert.equal(vm.body, 'hi team');
  const [cm] = await as(db, U.coach, `insert into chat_messages (team_id, body) values ($1, 'coach here') returning id`, [bcsTeam]);
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from chat_messages where team_id=$1', [bcsTeam]))[0].c, 2);
  // outsiders and other orgs: no read, no post; anon sees nothing; empty messages rejected
  assert.equal((await as(db, U.other, 'select count(*)::int c from chat_messages'))[0].c, 0);
  await assert.rejects(as(db, U.other, `insert into chat_messages (team_id, body) values ($1, 'x')`, [bcsTeam]));
  await assert.rejects(as(db, U.coach, `insert into chat_messages (team_id, body) values ($1, 'x')`, [uniTeam]));
  await assert.rejects(as(db, U.coach, `insert into chat_messages (team_id, body) values ($1, '   ')`, [bcsTeam]));
  assert.equal((await as(db, null, 'select count(*)::int c from chat_messages'))[0].c, 0);
  // no editing; delete only your own (admins any)
  await as(db, U.viewer, `update chat_messages set body='edited' where id=$1`, [vm.id]);
  assert.equal((await db.query('select body from chat_messages where id=$1', [vm.id])).rows[0].body, 'hi team');
  await as(db, U.viewer, 'delete from chat_messages where id=$1', [cm.id]);
  assert.equal((await db.query('select count(*)::int c from chat_messages where id=$1', [cm.id])).rows[0].c, 1);
  await as(db, U.josh, 'delete from chat_messages where id=$1', [cm.id]);
  await as(db, U.viewer, 'delete from chat_messages where id=$1', [vm.id]);
  assert.equal((await db.query('select count(*)::int c from chat_messages')).rows[0].c, 0);
  // coaching-staff board: coaches + admins only
  await as(db, U.coach, `insert into chat_messages (team_id, channel, body) values ($1, 'staff', 'staff only')`, [bcsTeam]);
  assert.equal((await as(db, U.josh, `select count(*)::int c from chat_messages where channel='staff'`))[0].c, 1);
  assert.equal((await as(db, U.viewer, `select count(*)::int c from chat_messages where channel='staff'`))[0].c, 0);
  await assert.rejects(as(db, U.viewer, `insert into chat_messages (team_id, channel, body) values ($1, 'staff', 'x')`, [bcsTeam]));
  await assert.rejects(as(db, U.coach, `insert into chat_messages (team_id, channel, body) values ($1, 'staff', 'x')`, [uniTeam]));
  await assert.rejects(as(db, U.coach, `insert into chat_messages (team_id, channel, body) values ($1, 'other', 'x')`, [bcsTeam]));
  // roster: org members read, coaches write, other orgs see nothing
  await as(db, U.coach, `insert into players (team_id, num, name, position) values ($1, '9', 'Player A', 'C')`, [bcsTeam]);
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from players where team_id=$1', [bcsTeam]))[0].c, 1);
  await assert.rejects(as(db, U.viewer, `insert into players (team_id, name) values ($1, 'X')`, [bcsTeam]));
  await assert.rejects(as(db, U.coach, `insert into players (team_id, name) values ($1, 'X')`, [uniTeam]));
  await assert.rejects(as(db, U.coach, `insert into players (team_id, name, shoots) values ($1, 'X', 'Z')`, [bcsTeam]));
  assert.equal((await as(db, U.other, 'select count(*)::int c from players'))[0].c, 0);
  assert.equal((await as(db, null, 'select count(*)::int c from players'))[0].c, 0);

  // injuries: staff only. Viewers (players/parents), other orgs and anon see nothing
  const [pa] = await db.query(`select id from players where team_id=$1 limit 1`, [bcsTeam]).then((r) => r.rows);
  await db.query(`insert into players (team_id, name) values ($1, 'Other Team Player')`, [uniTeam]);
  const uniPlayer = (await db.query(`select id from players where team_id=$1`, [uniTeam])).rows[0].id;
  await as(db, U.coach, `insert into injuries (team_id, player_id, status, injury, body_area, side, return_play) values ($1, $2, 'out', 'Test sprain', 'ankle', 'L', '2026-11-20')`, [bcsTeam, pa.id]);
  assert.equal((await as(db, U.coach, 'select count(*)::int c from injuries'))[0].c, 1);
  assert.equal((await as(db, U.josh, 'select count(*)::int c from injuries'))[0].c, 1);
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from injuries'))[0].c, 0);
  assert.equal((await as(db, U.other, 'select count(*)::int c from injuries'))[0].c, 0);
  assert.equal((await as(db, null, 'select count(*)::int c from injuries'))[0].c, 0);
  await assert.rejects(as(db, U.viewer, `insert into injuries (team_id, player_id) values ($1, $2)`, [bcsTeam, pa.id]));
  // a player from another team can't be attached, and bad statuses are refused
  await assert.rejects(as(db, U.coach, `insert into injuries (team_id, player_id) values ($1, $2)`, [bcsTeam, uniPlayer]));
  await assert.rejects(as(db, U.coach, `insert into injuries (team_id, player_id, status) values ($1, $2, 'maybe')`, [bcsTeam, pa.id]));
  // SCAT6 tests: staff of the player's team only, like injuries
  const injId = (await db.query(`select id from injuries where player_id=$1`, [pa.id])).rows[0].id;
  await as(db, U.coach, `insert into scat_tests (player_id, tested_on, kind, injury_id, data) values ($1, '2026-11-02', 'injury', $2, '{"recall": 6}')`, [pa.id, injId]);
  await as(db, U.coach, `insert into scat_tests (player_id, tested_on, kind) values ($1, '2026-08-20', 'baseline')`, [pa.id]);
  assert.equal((await as(db, U.coach, 'select count(*)::int c from scat_tests'))[0].c, 2);
  assert.equal((await as(db, U.josh, 'select count(*)::int c from scat_tests'))[0].c, 2);
  for (const u of [U.viewer, U.other, null]) assert.equal((await as(db, u, 'select count(*)::int c from scat_tests'))[0].c, 0);
  await assert.rejects(as(db, U.viewer, `insert into scat_tests (player_id, tested_on) values ($1, '2026-11-03')`, [pa.id]));
  await assert.rejects(as(db, U.coach, `insert into scat_tests (player_id, tested_on) values ($1, '2026-11-03')`, [uniPlayer]));
  await assert.rejects(as(db, U.coach, `insert into scat_tests (player_id, tested_on, kind) values ($1, '2026-11-03', 'maybe')`, [pa.id]));
  // the linked injury must be this player's
  const [pb] = (await db.query(`insert into players (team_id, name) values ($1, 'Athlete HV02') returning id`, [bcsTeam])).rows;
  await assert.rejects(as(db, U.coach, `insert into scat_tests (player_id, tested_on, injury_id) values ($1, '2026-11-03', $2)`, [pb.id, injId]));
  // IPPs: staff only, like injuries. One base IPP per team (player_id null) and one per athlete
  await as(db, U.coach, `insert into ipps (team_id, data) values ($1, '{"coach":"Test Coach"}')`, [bcsTeam]);
  await as(db, U.coach, `insert into ipps (team_id, player_id, data) values ($1, $2, '{"g.sleep":"4"}')`, [bcsTeam, pa.id]);
  await as(db, U.coach, `insert into ipps (team_id, player_id, data) values ($1, $2, '{"g.sleep":"5"}') on conflict (team_id, player_key) do update set data = excluded.data`, [bcsTeam, pa.id]);
  assert.equal((await as(db, U.coach, `select data->>'g.sleep' v from ipps where player_id=$1`, [pa.id]))[0].v, '5');
  assert.equal((await as(db, U.coach, 'select count(*)::int c from ipps'))[0].c, 2);
  await assert.rejects(as(db, U.coach, `insert into ipps (team_id) values ($1)`, [bcsTeam]));  // one base per team
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from ipps'))[0].c, 0);
  assert.equal((await as(db, U.other, 'select count(*)::int c from ipps'))[0].c, 0);
  assert.equal((await as(db, null, 'select count(*)::int c from ipps'))[0].c, 0);
  await assert.rejects(as(db, U.viewer, `insert into ipps (team_id, player_id) values ($1, $2)`, [bcsTeam, pa.id]));
  await assert.rejects(as(db, U.coach, `insert into ipps (team_id, player_id) values ($1, $2)`, [bcsTeam, uniPlayer]));
  await assert.rejects(as(db, U.coach, `insert into ipps (team_id, data) values ($1, '[1]')`, [uniTeam]));
  // player photos: team members read, coaches write, only into their own team's folder
  await as(db, U.coach, `insert into storage.objects (bucket_id, name) values ('player-photos', $1)`, [`${bcsTeam}/p.jpg`]);
  await assert.rejects(as(db, U.coach, `insert into storage.objects (bucket_id, name) values ('player-photos', $1)`, [`${uniTeam}/p.jpg`]));
  await assert.rejects(as(db, U.viewer, `insert into storage.objects (bucket_id, name) values ('player-photos', $1)`, [`${bcsTeam}/v.jpg`]));
  assert.equal((await as(db, U.viewer, `select count(*)::int c from storage.objects where bucket_id='player-photos'`))[0].c, 1);
  assert.equal((await as(db, U.other, `select count(*)::int c from storage.objects where bucket_id='player-photos'`))[0].c, 0);

  // data center: coaches upload; viewers see only shared tables
  await as(db, U.coach, `insert into datasets (team_id, title, kind, columns, rows) values ($1, 'Private test', 'testing', '["Name"]', '[["x"]]')`, [bcsTeam]);
  await as(db, U.coach, `insert into datasets (team_id, title, kind, shared) values ($1, 'Shared stats', 'stats', true)`, [bcsTeam]);
  assert.equal((await as(db, U.coach, 'select count(*)::int c from datasets'))[0].c, 2);
  assert.deepEqual((await as(db, U.viewer, 'select title from datasets')).map((r) => r.title), ['Shared stats']);
  assert.equal((await as(db, U.other, 'select count(*)::int c from datasets'))[0].c, 0);
  await assert.rejects(as(db, U.viewer, `insert into datasets (team_id, title) values ($1, 'x')`, [bcsTeam]));
  await as(db, U.viewer, `update datasets set shared = true where title = 'Private test'`);
  assert.equal((await db.query(`select shared from datasets where title = 'Private test'`)).rows[0].shared, false);

  // S&C testing + gym groups: staff only
  const [ts] = await as(db, U.coach, `insert into test_sessions (team_id, tested_on, battery) values ($1, '2026-11-02', 'full') returning id`, [bcsTeam]);
  await as(db, U.coach, `insert into test_results (session_id, player_id, team_id, values) values ($1, $2, $3, '{"cmj_jh": 40}')`, [ts.id, pa.id, bcsTeam]);
  await as(db, U.coach, `insert into gym_config (team_id, targets) values ($1, '{"cmj_jh": 40}')`, [bcsTeam]);
  assert.equal((await as(db, U.coach, 'select count(*)::int c from test_results'))[0].c, 1);
  for (const who of [U.viewer, U.other, null]) {
    assert.equal((await as(db, who, 'select count(*)::int c from test_sessions'))[0].c, 0);
    assert.equal((await as(db, who, 'select count(*)::int c from test_results'))[0].c, 0);
    assert.equal((await as(db, who, 'select count(*)::int c from gym_config'))[0].c, 0);
  }
  await assert.rejects(as(db, U.viewer, `insert into test_sessions (team_id, tested_on, battery) values ($1, '2026-11-02', 'full')`, [bcsTeam]));
  await assert.rejects(as(db, U.coach, `insert into test_results (session_id, player_id, team_id) values ($1, $2, $3)`, [ts.id, uniPlayer, bcsTeam]));
  await assert.rejects(as(db, U.coach, `insert into test_sessions (team_id, tested_on, battery) values ($1, '2026-11-02', 'other')`, [bcsTeam]));
  // leaderboard: viewers get only best results per test, until a coach hides it
  const [ts2] = await as(db, U.coach, `insert into test_sessions (team_id, tested_on, battery) values ($1, '2026-11-09', 'readiness') returning id`, [bcsTeam]);
  await as(db, U.coach, `insert into test_results (session_id, player_id, team_id, values) values ($1, $2, $3, '{"cmj_jh": 43, "fly10": 1.10, "note": "x"}')`, [ts2.id, pa.id, bcsTeam]);
  await as(db, U.coach, `update test_results set values = '{"cmj_jh": 40, "fly10": 1.05}' where session_id = $1`, [ts.id]);
  const lb = await as(db, U.viewer, 'select metric, value::float v, tested_on::text d from leaderboard($1) order by metric', [bcsTeam]);
  assert.deepEqual(lb.map((r) => [r.metric, r.v, r.d]), [['cmj_jh', 43, '2026-11-09'], ['fly10', 1.05, '2026-11-02']]);
  assert.equal((await as(db, U.other, 'select count(*)::int c from leaderboard($1)', [bcsTeam]))[0].c, 0);
  await assert.rejects(as(db, null, 'select * from leaderboard($1)', [bcsTeam]));
  await as(db, U.coach, `update gym_config set leaderboard = false where team_id = $1`, [bcsTeam]);
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from leaderboard($1)', [bcsTeam]))[0].c, 0);
  assert.equal((await as(db, U.coach, 'select count(*)::int c from leaderboard($1)', [bcsTeam]))[0].c, 2);

  // moving a player: needs edit access to both teams; injuries follow, old lines are cleared
  const bcsU16 = (await db.query(`select id from teams where legacy_id='t_bcs_u16'`)).rows[0].id;
  const [mp] = await as(db, U.coach, `insert into players (team_id, name) values ($1, 'Mover Test') returning id`, [bcsTeam]);
  await as(db, U.coach, `insert into injuries (team_id, player_id, status) values ($1, $2, 'limited')`, [bcsTeam, mp.id]);
  await as(db, U.coach, `insert into lineups (team_id, key, slots) values ($1, 'default', $2) on conflict (team_id, key) do update set slots = excluded.slots`, [bcsTeam, JSON.stringify({ F1C: { pid: mp.id, name: 'Mover Test' }, F1LW: { name: 'Typed' } })]);
  await assert.rejects(as(db, U.viewer, 'select move_player($1, $2)', [mp.id, bcsU16]));
  await assert.rejects(as(db, U.coach, 'select move_player($1, $2)', [mp.id, uniTeam]), /both teams/);
  await as(db, U.coach, 'select move_player($1, $2)', [mp.id, bcsU16]);
  assert.equal((await db.query('select team_id from players where id=$1', [mp.id])).rows[0].team_id, bcsU16);
  assert.equal((await db.query('select team_id from injuries where player_id=$1', [mp.id])).rows[0].team_id, bcsU16);
  assert.deepEqual(Object.keys((await db.query(`select slots from lineups where team_id=$1 and key='default'`, [bcsTeam])).rows[0].slots), ['F1LW']);
  // an admin of both organizations can move across them
  await as(db, U.josh, 'select move_player($1, $2)', [mp.id, uniTeam]);
  assert.equal((await db.query('select team_id from players where id=$1', [mp.id])).rows[0].team_id, uniTeam);
  await db.query(`delete from lineups where team_id=$1`, [bcsTeam]);

  // team-level access: a coach limited to one team sees and edits only that team
  const LIM = '00000000-0000-0000-0000-00000000000e';
  assert.equal((await as(db, U.josh, `select invite_member($1, 'limited@x.test', 'coach', $2) r`, [bcs, [bcsTeam]]))[0].r, 'invited');
  await assert.rejects(as(db, U.josh, `select invite_member($1, 'z2@x.test', 'coach', $2)`, [bcs, [uniTeam]]), /not in this organization/);
  await db.exec(`insert into auth.users values ('${LIM}', 'limited@x.test')`);
  assert.deepEqual((await as(db, LIM, 'select id from teams')).map((r) => r.id), [bcsTeam]);
  assert.equal((await as(db, LIM, 'select count(*)::int c from games where team_id=$1', [bcsU16]))[0].c, 0);
  assert.ok((await as(db, LIM, 'select count(*)::int c from games where team_id=$1', [bcsTeam]))[0].c > 0);
  await as(db, LIM, `insert into games (team_id, date, home, away) values ($1, '2026-12-01', 'a', 'b')`, [bcsTeam]);
  await assert.rejects(as(db, LIM, `insert into games (team_id, date, home, away) values ($1, '2026-12-01', 'a', 'b')`, [bcsU16]));
  await assert.rejects(as(db, LIM, 'select set_member_teams($1, $2, null)', [bcs, LIM]), /Only an organization admin/);
  // the admin widens it to every team, then narrows it again
  await as(db, U.josh, 'select set_member_teams($1, $2, null)', [bcs, LIM]);
  assert.equal((await as(db, LIM, 'select count(*)::int c from teams'))[0].c, (await as(db, U.coach, 'select count(*)::int c from teams'))[0].c);
  await as(db, U.josh, 'select set_member_teams($1, $2, $3)', [bcs, LIM, [bcsU16]]);
  assert.deepEqual((await as(db, LIM, 'select id from teams')).map((r) => r.id), [bcsU16]);
  // existing account added with a team choice: applies straight away; unlimited coaches unaffected
  assert.equal((await as(db, U.josh, `select invite_member($1, 'other@x.test', 'viewer', $2) r`, [bcs, [bcsTeam]]))[0].r, 'added');
  assert.deepEqual((await as(db, U.other, 'select id from teams')).map((r) => r.id), [bcsTeam]);
  assert.equal((await as(db, U.coach, 'select count(*)::int c from teams where org_id=$1', [bcs]))[0].c >= 3, true);
  await db.query('delete from memberships where user_id = $1', [U.other]);

  // practice plans + drill library: coaching staff only
  await as(db, U.coach, `insert into practice_plans (team_id, practice_on, blocks) values ($1, '2026-11-03', '[{"title":"Warm-up","minutes":10}]')`, [bcsTeam]);
  await as(db, U.coach, `insert into drills (team_id, title) values ($1, 'Shell drill')`, [bcsTeam]);
  assert.equal((await as(db, U.coach, 'select count(*)::int c from practice_plans'))[0].c, 1);
  for (const who of [U.viewer, U.other, null]) {
    assert.equal((await as(db, who, 'select count(*)::int c from practice_plans'))[0].c, 0);
    assert.equal((await as(db, who, 'select count(*)::int c from drills'))[0].c, 0);
  }
  await assert.rejects(as(db, U.viewer, `insert into drills (team_id, title) values ($1, 'x')`, [bcsTeam]));
  await assert.rejects(as(db, U.coach, `insert into drills (team_id, title, minutes) values ($1, 'x', 0)`, [bcsTeam]));

  // playbook: the team sees unlocked plays; locked (padlock) plays are staff only
  await as(db, U.coach, `insert into plays (team_id, name) values ($1, 'Horns')`, [bcsTeam]);
  await as(db, U.coach, `insert into plays (team_id, name, locked) values ($1, 'Secret set', true)`, [bcsTeam]);
  assert.deepEqual((await as(db, U.viewer, 'select name from plays order by name')).map((r) => r.name), ['Horns']);
  assert.equal((await as(db, U.coach, 'select count(*)::int c from plays'))[0].c, 2);
  assert.equal((await as(db, U.other, 'select count(*)::int c from plays'))[0].c, 0);
  assert.equal((await as(db, null, 'select count(*)::int c from plays'))[0].c, 0);
  await assert.rejects(as(db, U.viewer, `insert into plays (team_id, name) values ($1, 'x')`, [bcsTeam]));
  await as(db, U.viewer, `update plays set name = 'changed' where name = 'Horns'`);
  assert.equal((await db.query(`select count(*)::int c from plays where name = 'Horns'`)).rows[0].c, 1);

  // game stats: team reads, coaches write (only their team's games and players)
  const g1 = (await db.query('select id from games where team_id=$1 limit 1', [bcsTeam])).rows[0].id;
  await as(db, U.coach, `insert into game_stats (game_id, player_id, team_id, stats) values ($1, $2, $3, '{"g": 2}')`, [g1, pa.id, bcsTeam]);
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from game_stats'))[0].c, 1);
  await assert.rejects(as(db, U.viewer, `insert into game_stats (game_id, player_id, team_id) values ($1, $2, $3)`, [g1, pa.id, bcsTeam]));
  await assert.rejects(as(db, U.coach, `insert into game_stats (game_id, player_id, team_id) values ($1, $2, $3)`, [g1, uniPlayer, bcsTeam]));
  // spectator links: admins only; the public sees chosen teams, stats only when ticked, nothing once revoked
  await assert.rejects(as(db, U.coach, `insert into spectator_links (org_id, label) values ($1, 'x')`, [bcs]));
  const [sl] = await as(db, U.josh, `insert into spectator_links (org_id, label, team_ids) values ($1, 'Parents', $2) returning token`, [bcs, [bcsTeam]]);
  assert.equal(sl.token.length, 64);
  let v = (await as(db, null, 'select spectator_view($1) v', [sl.token]))[0].v;
  assert.deepEqual(v.teams.map((x) => x.id), [bcsTeam]); assert.ok(v.games.length > 0); assert.equal(v.stats, null);
  assert.ok(v.games.every((x) => x.team_id === bcsTeam)); assert.ok(!JSON.stringify(v).includes('injur'));
  await as(db, U.josh, `update spectator_links set show_stats = true where token = $1`, [sl.token]);
  v = (await as(db, null, 'select spectator_view($1) v', [sl.token]))[0].v;
  assert.equal(v.stats.length, 1); assert.equal(v.stats[0].stats.g, 2);
  await as(db, U.josh, `update spectator_links set team_ids = null where token = $1`, [sl.token]);
  assert.equal((await as(db, null, 'select spectator_view($1) v', [sl.token]))[0].v.teams.length, (await db.query('select count(*)::int c from teams where org_id=$1', [bcs])).rows[0].c);
  await as(db, U.josh, `update spectator_links set revoked = true where token = $1`, [sl.token]);
  assert.equal((await as(db, null, 'select spectator_view($1) v', [sl.token]))[0].v, null);
  assert.equal((await as(db, null, `select spectator_view('nope') v`))[0].v, null);
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from spectator_links'))[0].c, 0);

  // my profile: edit your own (not your email); org co-members read it; chat uses the name
  await as(db, U.coach, `update profiles set display_name = 'Coach Test', title = 'Head coach' where id = $1`, [U.coach]);
  await assert.rejects(as(db, U.coach, `update profiles set email = 'x@x.test' where id = $1`, [U.coach]));
  await as(db, U.coach, `update profiles set display_name = 'Hacked' where id = $1`, [U.viewer]);
  assert.equal((await db.query('select display_name from profiles where id = $1', [U.viewer])).rows[0].display_name, '');
  assert.equal((await as(db, U.viewer, 'select title from profiles where id = $1', [U.coach]))[0].title, 'Head coach');
  assert.equal((await as(db, U.other, 'select count(*)::int c from profiles where id = $1', [U.coach]))[0].c, 0);
  const [cm2] = await as(db, U.coach, `insert into chat_messages (team_id, body) values ($1, 'hello') returning author`, [bcsTeam]);
  assert.equal(cm2.author, 'Coach Test');
  await as(db, U.coach, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${U.coach}/a.jpg`]);
  await assert.rejects(as(db, U.coach, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${U.viewer}/a.jpg`]));
  assert.equal((await as(db, U.viewer, `select count(*)::int c from storage.objects where bucket_id='avatars'`))[0].c, 1);
  assert.equal((await as(db, U.other, `select count(*)::int c from storage.objects where bucket_id='avatars'`))[0].c, 0);

  // game day lines: coaches write (default + their own team's games), viewers read only
  const bcsGame = (await db.query('select id from games where team_id=$1 limit 1', [bcsTeam])).rows[0].id;
  const uniGame = (await db.query('select id from games where team_id=$1 limit 1', [uniTeam])).rows[0].id;
  const slots = JSON.stringify({ F1C: { num: '9', name: 'Player A' } });
  await as(db, U.coach, `insert into lineups (team_id, key, slots) values ($1, 'default', $2)`, [bcsTeam, slots]);
  await as(db, U.coach, `insert into lineups (team_id, key, game_id, slots) values ($1, $2::text, $2::uuid, $3)`, [bcsTeam, bcsGame, slots]);
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from lineups where team_id=$1', [bcsTeam]))[0].c, 2);
  await assert.rejects(as(db, U.viewer, `insert into lineups (team_id, key, slots) values ($1, 'x', '{}')`, [bcsTeam]));
  await as(db, U.viewer, `update lineups set slots='{}' where team_id=$1`, [bcsTeam]);
  assert.equal((await db.query(`select slots->'F1C'->>'name' n from lineups where team_id=$1 and key='default'`, [bcsTeam])).rows[0].n, 'Player A');
  // another team's game can't be attached, other orgs see nothing, deleting the game removes its lines
  await assert.rejects(as(db, U.coach, `insert into lineups (team_id, key, game_id) values ($1, $2::text, $2::uuid)`, [bcsTeam, uniGame]));
  assert.equal((await as(db, U.other, 'select count(*)::int c from lineups'))[0].c, 0);
  await db.query('delete from games where id=$1', [bcsGame]);
  assert.equal((await db.query('select count(*)::int c from lineups where team_id=$1', [bcsTeam])).rows[0].c, 1);

  // the public schedule never includes chat
  const pubNow = JSON.stringify((await as(db, null, `select public_schedule('bcs') s`))[0].s);
  assert.ok(!pubNow.includes('coach here') && !pubNow.includes('staff only'));
});

test('team averages: the basketball data fix marks individual testing days and the start date', async () => {
  const db = await setup();
  const t = (await db.query(`select id from teams where legacy_id = 't_basketball'`)).rows[0].id;
  const ids = [];
  for (const d of ['2025-10-06', '2025-12-08', '2026-07-10', '2026-09-08']) ids.push((await db.query(`insert into test_sessions (team_id, tested_on, battery) values ($1, $2, 'full') returning id`, [t, d])).rows[0].id);
  const fix = readFileSync('supabase/data-fixes/2026-11-01-basketball-team-averages.sql', 'utf8');
  assert.deepEqual((await db.query(fix)).rows[0], { sessions_marked_individual: 3, team_start_date_set: 1 });
  assert.deepEqual((await db.query(fix)).rows[0], { sessions_marked_individual: 0, team_start_date_set: 1 });
  assert.deepEqual((await db.query(`select tested_on::text d, individual from test_sessions where team_id = $1 order by tested_on`, [t])).rows.map((r) => `${r.d} ${r.individual}`),
    ['2025-10-06 true', '2025-12-08 true', '2026-07-10 true', '2026-09-08 false']);
  assert.equal((await db.query(`select team_from::text f from gym_config where team_id = $1`, [t])).rows[0].f, '2026-01-01');
});

test('BCS team overviews count testing from Sept 2026', async () => {
  const db = await setup();
  const fix = readFileSync('supabase/data-fixes/2026-11-01-bcs-team-averages-from-sept-2026.sql', 'utf8');
  const want = (await db.query(`select count(*)::int c from teams t join organizations o on o.id = t.org_id where o.slug = 'bcs' and t.sport in ('hockey', 'basketball')`)).rows[0].c;
  assert.ok(want >= 3);
  assert.equal((await db.query(fix)).rows[0].teams_set, want); assert.equal((await db.query(fix)).rows[0].teams_set, want);
  assert.deepEqual((await db.query(`select distinct team_from::text f from gym_config`)).rows.map((r) => r.f), ['2026-09-01']);
});

test('invite links: whoever holds the link joins with its role and teams, once', async () => {
  const db = await setup();
  const bcs = (await db.query(`select id from organizations where slug='bcs'`)).rows[0].id;
  const bcsTeam = (await db.query(`select id from teams where legacy_id='t_hockey'`)).rows[0].id;
  await as(db, U.josh, `select invite_member($1, 'newcoach@x.test', 'coach', $2)`, [bcs, [bcsTeam]]);
  const [{ token }] = await as(db, U.josh, `select token from invites where email = 'newcoach@x.test'`);
  // other people can't list invites or their tokens; anyone with the link sees what it's for
  assert.equal((await as(db, U.coach, 'select count(*)::int c from invites'))[0].c, 0);
  assert.equal((await as(db, null, 'select count(*)::int c from invites'))[0].c, 0);
  const [info] = await as(db, null, 'select * from invite_info($1)', [token]);
  assert.equal(info.org_name, (await db.query('select name from organizations where id=$1', [bcs])).rows[0].name);
  assert.equal(info.role, 'coach');
  assert.equal((await as(db, null, 'select * from invite_info(gen_random_uuid())')).length, 0);
  // signed out can't accept; an account with a different email accepts with the link
  await assert.rejects(as(db, null, 'select accept_invite($1)', [token]));
  await db.exec(`insert into auth.users values ('${U.other}', 'personal@x.test')`);
  assert.equal((await as(db, U.other, 'select accept_invite($1) r', [token]))[0].r, bcs);
  assert.deepEqual((await as(db, U.other, 'select id from teams')).map((r) => r.id), [bcsTeam]);
  assert.equal((await db.query(`select role from memberships where user_id=$1`, [U.other])).rows[0].role, 'coach');
  // used up
  assert.equal((await as(db, U.other, 'select accept_invite($1) r', [token]))[0].r, null);
  assert.equal((await as(db, null, 'select * from invite_info($1)', [token])).length, 0);
  // never downgrades an existing member: Josh (admin) accepting a viewer link stays admin with every team
  await as(db, U.josh, `select invite_member($1, 'v2@x.test', 'viewer', $2)`, [bcs, [bcsTeam]]);
  const [{ token: t2 }] = await as(db, U.josh, `select token from invites where email = 'v2@x.test'`);
  await as(db, U.josh, 'select accept_invite($1)', [t2]);
  assert.equal((await db.query(`select role from memberships where user_id=$1 and org_id=$2`, [U.josh, bcs])).rows[0].role, 'admin');
  assert.equal((await db.query(`select count(*)::int c from member_teams where user_id=$1`, [U.josh])).rows[0].c, 0);
});

test('self-assessments: a player answers open games through their link; only staff read the file', async () => {
  const db = await setup();
  const team = (await db.query(`select id from teams where legacy_id='t_hockey'`)).rows[0].id;
  const day = (n) => `((now() at time zone 'America/Toronto')::date + ${n})::text`;
  const [pl] = await as(db, U.josh, `insert into players (team_id, name, num) values ($1, 'Athlete HV01', '9') returning id`, [team]);
  // the new player got a link; only staff can list links
  const [{ token }] = await as(db, U.josh, 'select token from self_assess_links where player_id=$1', [pl.id]);
  assert.equal(token.length, 64);
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from self_assess_links'))[0].c, 0);
  assert.equal((await as(db, null, 'select count(*)::int c from self_assess_links'))[0].c, 0);
  const g = async (n, time = '') => (await db.query(`insert into games (team_id, date, time, home, away) values ($1, ${day(n)}::date, $2, 'Opponent U18', 'BCS Hockey') returning id`, [team, time])).rows[0].id;
  const old = await g(-40), prev = await g(-3), a1 = await g(-1, '10:00'), a2 = await g(-1, '18:00'), next = await g(2);
  let v = (await as(db, null, 'select assess_view($1) v', [token]))[0].v;
  assert.equal(v.player.name, 'Athlete HV01');
  // the two games yesterday are open; the one before, the 40-day-old one and the future one aren't
  assert.deepEqual(v.open.map((x) => x.id), [a1, a2]);
  assert.equal(v.open[0].opponent, 'Opponent U18');
  for (const x of [prev, old, next]) await assert.rejects(as(db, null, `select assess_submit($1, $2, '{"rating":"4"}')`, [token, x]));
  await assert.rejects(as(db, null, `select assess_submit('nope', $1, '{"rating":"4"}')`, [a1]));
  await assert.rejects(as(db, null, `select assess_submit($1, $2, '{"rating":"9","x":"y"}')`, [token, a1]));
  await as(db, null, `select assess_submit($1, $2, $3)`, [token, a1, { rating: '4', fun: 'Yes', compete: '5', well: '  Talked on D  ', hack: 'x' }]);
  await as(db, null, `select assess_submit($1, $2, $3)`, [token, a1, { rating: '3', fun: 'Maybe', well: 'Talked' }]);
  v = (await as(db, null, 'select assess_view($1) v', [token]))[0].v;
  assert.deepEqual(v.open[0].answers, { rating: '3', well: 'Talked' });
  // staff read it; viewers and the public don't
  assert.equal((await as(db, U.josh, 'select count(*)::int c from self_assessments'))[0].c, 1);
  assert.equal((await as(db, U.viewer, 'select count(*)::int c from self_assessments'))[0].c, 0);
  assert.equal((await as(db, null, 'select count(*)::int c from self_assessments'))[0].c, 0);
  // removing the game keeps the answers, as past
  await db.query('delete from games where id=$1', [a1]);
  const [kept] = (await db.query('select game_id, opponent from self_assessments')).rows;
  assert.equal(kept.game_id, null); assert.equal(kept.opponent, 'Opponent U18');
  v = (await as(db, null, 'select assess_view($1) v', [token]))[0].v;
  assert.equal(v.past.length, 1); assert.deepEqual(v.open.map((x) => x.id), [a2]);
  // a new link replaces the old one; an inactive player's link shows nothing
  await as(db, U.josh, `update self_assess_links set token = repeat('a', 64) where player_id = $1`, [pl.id]);
  assert.equal((await as(db, null, 'select assess_view($1) v', [token]))[0].v, null);
  await db.query('update players set active = false where id=$1', [pl.id]);
  assert.equal((await as(db, null, `select assess_view(repeat('a', 64)) v`))[0].v, null);
});

test('link-only invites: no email, chosen role and teams, used once', async () => {
  const db = await setup();
  const bcs = (await db.query(`select id from organizations where slug='bcs'`)).rows[0].id;
  const bcsTeam = (await db.query(`select id from teams where legacy_id='t_hockey'`)).rows[0].id;
  // an admin makes two links with no email; a coach can't make one
  const [{ token }] = await as(db, U.josh, `insert into invites (org_id, label, role, team_ids) values ($1, 'Coach Martin', 'viewer', $2) returning token`, [bcs, [bcsTeam]]);
  await as(db, U.josh, `insert into invites (org_id, label, role) values ($1, 'Second link', 'coach')`, [bcs]);
  await as(db, U.josh, `select invite_member($1, 'Coach@x.test', 'coach')`, [bcs]);
  await assert.rejects(as(db, U.coach, `insert into invites (org_id, role) values ($1, 'admin')`, [bcs]));
  const [info] = await as(db, null, 'select * from invite_info($1)', [token]);
  assert.equal(info.label, 'Coach Martin'); assert.equal(info.email, null);
  assert.deepEqual(info.teams, [(await db.query('select name from teams where id=$1', [bcsTeam])).rows[0].name]);
  await db.exec(`insert into auth.users values ('${U.other}', 'martin@x.test')`);
  assert.equal((await as(db, U.other, 'select accept_invite($1) r', [token]))[0].r, bcs);
  assert.equal((await db.query(`select role from memberships where user_id=$1`, [U.other])).rows[0].role, 'viewer');
  assert.deepEqual((await as(db, U.other, 'select id from teams')).map((r) => r.id), [bcsTeam]);
  // only that link is used up
  assert.equal((await as(db, null, 'select * from invite_info($1)', [token])).length, 0);
  assert.equal((await db.query(`select count(*)::int c from invites where org_id=$1`, [bcs])).rows[0].c, 2);
});

test('sports med: edits injuries, reads testing, never coach notes, IPPs or test edits', async () => {
  const db = await setup();
  const bcs = (await db.query(`select id from organizations where slug='bcs'`)).rows[0].id;
  const bcsTeam = (await db.query(`select id from teams where legacy_id='t_hockey'`)).rows[0].id;
  const [{ id: pid }] = (await db.query(`insert into players (team_id, name) values ($1, 'Athlete HV01') returning id`, [bcsTeam])).rows;
  const [{ id: sid }] = (await db.query(`insert into test_sessions (team_id, tested_on, battery) values ($1, '2026-10-01', 'readiness') returning id`, [bcsTeam])).rows;
  await db.query(`insert into test_results (session_id, player_id, team_id, values) values ($1, $2, $3, '{"cmj_jh": 40}')`, [sid, pid, bcsTeam]);
  await db.query(`insert into coach_notes (team_id) values ($1) on conflict do nothing`, [bcsTeam]);
  await db.query(`insert into ipps (team_id, player_id, data) values ($1, $2, '{}')`, [bcsTeam, pid]);
  // a link-only sports med invite for one team
  const [{ token }] = await as(db, U.josh, `insert into invites (org_id, label, role, team_ids) values ($1, 'Physio', 'sportsmed', $2) returning token`, [bcs, [bcsTeam]]);
  assert.equal((await as(db, null, 'select role from invite_info($1)', [token]))[0].role, 'sportsmed');
  assert.equal((await as(db, U.josh, `select invite_member($1, 'med@x.test', 'sportsmed') r`, [bcs]))[0].r, 'invited');
  await db.exec(`insert into auth.users values ('${U.other}', 'physio@x.test')`);
  await as(db, U.other, 'select accept_invite($1)', [token]);
  const me = (sql, p) => as(db, U.other, sql, p);
  // injuries: read and write
  await me(`insert into injuries (team_id, player_id, injury) values ($1, $2, 'Ankle sprain')`, [bcsTeam, pid]);
  assert.equal((await me('select count(*)::int c from injuries'))[0].c, 1);
  await me(`update injuries set status = 'limited'`);
  assert.equal((await db.query('select status from injuries')).rows[0].status, 'limited');
  // SCAT6 tests: read and write, like injuries
  await me(`insert into scat_tests (player_id, tested_on, kind) values ($1, '2026-08-20', 'baseline')`, [pid]);
  assert.equal((await me('select count(*)::int c from scat_tests'))[0].c, 1);
  // testing: read only
  assert.equal((await me('select count(*)::int c from test_results'))[0].c, 1);
  assert.equal((await me('select count(*)::int c from test_sessions'))[0].c, 1);
  await assert.rejects(me(`insert into test_sessions (team_id, tested_on, battery) values ($1, '2026-10-02', 'readiness')`, [bcsTeam]));
  await me(`update test_results set values = '{"cmj_jh": 99}'`);
  assert.equal((await db.query('select values from test_results')).rows[0].values.cmj_jh, 40);
  // schedules and players like a viewer; coach-only data stays hidden
  assert.equal((await me('select count(*)::int c from players where id = $1', [pid]))[0].c, 1);
  await assert.rejects(me(`insert into players (team_id, name) values ($1, 'X')`, [bcsTeam]));
  assert.equal((await me('select count(*)::int c from coach_notes'))[0].c, 0);
  assert.equal((await me('select count(*)::int c from ipps'))[0].c, 0);
  // only the team the link opened
  assert.deepEqual((await me('select id from teams')).map((r) => r.id), [bcsTeam]);
  await assert.rejects(as(db, U.josh, `select invite_member($1, 'x@x.test', 'medic')`, [bcs]), /Unknown role/);
});

test('activity: people record their own last-seen time; only their org admins read it', async () => {
  const db = await setup();
  const bcs = (await db.query(`select id from organizations where slug='bcs'`)).rows[0].id;
  await db.exec(`insert into auth.users values ('${U.other}', 'coach2@x.test')`);
  await db.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'coach')`, [bcs, U.other]);
  await as(db, U.other, 'select touch_seen()');
  await as(db, U.other, 'select touch_seen()');
  assert.equal((await db.query('select count(*)::int c from user_activity')).rows[0].c, 1);
  // can't fake a time or write someone else's
  await as(db, U.other, `update user_activity set seen_at = now() - interval '1 day'`).catch(() => {});
  assert.ok((await db.query(`select seen_at > now() - interval '1 hour' ok from user_activity`)).rows[0].ok);
  await assert.rejects(as(db, U.other, `insert into user_activity (user_id) values ($1)`, [U.josh]));
  // Josh (BCS admin) sees it; a signed-out visitor doesn't
  assert.equal((await as(db, U.josh, 'select count(*)::int c from user_activity where user_id = $1', [U.other]))[0].c, 1);
  assert.equal((await as(db, null, 'select count(*)::int c from user_activity'))[0].c, 0);
  await as(db, null, 'select touch_seen()').catch(() => {});
  assert.equal((await db.query('select count(*)::int c from user_activity')).rows[0].c, 1);
});

test('programs: private to whoever wrote them, even from another admin', async () => {
  const db = await setup();
  const bcs = (await db.query(`select id from organizations where slug='bcs'`)).rows[0].id;
  await db.exec(`insert into auth.users values ('${U.other}', 'admin2@x.test')`);
  await db.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'admin')`, [bcs, U.other]);
  const [p] = await as(db, U.josh, `insert into programs (name, data) values ('Phase 2', '{"sheets":[]}') returning id, owner`);
  assert.equal(p.owner, U.josh);
  assert.equal((await as(db, U.josh, 'select count(*)::int c from programs'))[0].c, 1);
  // another admin of the same org, and a signed-out visitor, see nothing and change nothing
  assert.equal((await as(db, U.other, 'select count(*)::int c from programs'))[0].c, 0);
  await as(db, U.other, `update programs set name = 'x'`); await as(db, U.other, 'delete from programs');
  assert.equal((await db.query('select name from programs')).rows[0].name, 'Phase 2');
  assert.equal((await as(db, null, 'select count(*)::int c from programs'))[0].c, 0);
  // nobody writes a program in someone else's name
  await assert.rejects(as(db, U.other, `insert into programs (owner, name) values ($1, 'mine')`, [U.josh]));
  await assert.rejects(as(db, U.other, `update programs set owner = $1`, [U.other]).then(() => as(db, U.josh, `update programs set owner = $1`, [U.other])));
});
