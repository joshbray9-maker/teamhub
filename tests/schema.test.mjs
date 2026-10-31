// Runs the real migration + generated seed in an in-process Postgres (PGlite) with small
// stand-ins for Supabase's auth/storage schemas, then checks the RLS rules as different users.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  await db.exec(readFileSync('supabase/migrations/20261030000000_init.sql', 'utf8'));
  await db.exec(GRANTS);
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

  // public schedule: off by default, then exposes only that org
  assert.equal((await as(db, null, `select public_schedule('bcs') s`))[0].s, null);
  await db.exec(`update organizations set public_schedule = true where slug = 'bcs'`);
  const pub = (await as(db, null, `select public_schedule('bcs') s`))[0].s;
  assert.equal(pub.org.slug, 'bcs');
  assert.equal(pub.teams.length, 3);
  assert.ok(pub.games.length > 0 && pub.events.length > 0);
  assert.ok(!('notes' in pub) && !JSON.stringify(pub).includes('sc_days'));
  // anon can't read tables directly
  assert.equal((await as(db, null, 'select count(*)::int c from games'))[0].c, 0);

  // logo upload only into a team folder you can edit
  await as(db, U.coach, `insert into storage.objects (bucket_id, name) values ('logos', $1)`, [`${bcsTeam}/logo.png`]);
  await assert.rejects(as(db, U.coach, `insert into storage.objects (bucket_id, name) values ('logos', $1)`, [`${uniTeam}/logo.png`]));
});
