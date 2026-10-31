# TeamHub

Team schedules, league tables and S&C plans for every team Josh coaches, shared with each
team's coaches by URL. A standalone version of the TeamHub claude.ai artifact:
Vite + React on Vercel, Supabase for the database, sign-in and the daily league sync.

**What it holds:** schedules (games, events), league standings, S&C day themes, intensity and
periodization, team notes/to-dos. **No athlete data.** Rosters aren't part of TeamHub yet. Keep
it that way until the access rules have been reviewed for it.

## What's in here

| Path | What it is |
|---|---|
| `src/` | The app: team switcher, reorderable sidebar, Home (calendar, notifications, notes & to-do, fixtures, standings, league paste, .ics import, league-sync review), master schedules, S&C (calendar, periodization, Workload) |
| `src/pages/PublicSchedule.jsx` | Public read-only page at `/schedule/<org>` |
| `supabase/migrations/…_init.sql` | Tables, row-level security, sign-up trigger, public schedule function, logo storage |
| `supabase/migrations/…_chat.sql` | Team chat table, its access rules and live updates |
| `supabase/functions/league-sync/` | Edge Function for the daily league sync |
| `supabase/functions/_shared/leagueParse.js` | League/.ics parsing, used by both the app and the sync |
| `supabase/cron.sql` | Schedules the daily sync |
| `seed/export/` | Data exported from the artifact (schedules, S&C plans, league tables) |
| `scripts/build-seed-sql.mjs` | Turns the export into `seed/seed.sql` |
| `tests/` | Parser tests, plus the schema and RLS rules run in an in-process Postgres |

## Who sees what

Every team belongs to an **organization** (BCS, Universel, Bishop's University). Access is
per organization:

| Role | Can |
|---|---|
| **admin** | Everything: create/delete teams, add/remove members, turn on the public link |
| **coach** | Edit schedules, standings, the S&C plan, team settings, notes & to-dos, review league-sync items |
| **viewer** | Read-only. No notes & to-dos |
| *public link* | Only that organization's games and calendar events. Off until an admin turns it on |

**Chat:** each team has one group chat. Everyone in the team's organization (admin, coach,
viewer) can read and post; the sender or an admin can delete a message; messages can't be
edited. New messages show up live. The public link never shows chat. Like the notes card,
chat is free text: keep injury or medical details about athletes out of it.

These rules live in the database (row-level security), so they hold no matter what the app
shows. A coach at BCS can't see Universel's teams, and the reverse.

## Set up (one time)

You'll need a Supabase project and a Vercel project. TeamHub gets **its own** of each.
Don't reuse the Performance Hub's Supabase project.

### 1. Supabase project

1. supabase.com → **New project** → name it `teamhub`. Pick the Canada (Central) region if offered.
2. **SQL Editor → New query**: paste all of `supabase/migrations/20261030000000_init.sql` and **Run**.
   Then do the same, in order, for every later file in `supabase/migrations/` (e.g. `…_chat.sql`).
   When a new migration file is added later, run just that file once.
3. **Authentication → URL Configuration**: set **Site URL** to your Vercel address (step 3), e.g. `https://teamhub-xyz.vercel.app`, and add the same address to **Redirect URLs**. Leave Email as the provider.
4. **Project Settings → API**: note the **Project URL** and the **publishable / anon** key. You'll paste them into Vercel. Don't copy the `service_role` / secret key anywhere. TeamHub never needs it outside Supabase.

### 2. Load your data

1. Sign up in the app first (after step 3) with the email you'll use as admin, **or** skip this; the seed also works before you sign up.
2. On your Mac, in this folder:
   ```bash
   npm install
   ```
   ```bash
   ADMIN_EMAIL=you@example.com npm run seed:sql
   ```
   This writes `seed/seed.sql` and makes that email admin of BCS, Universel and Bishop's University.
3. Open `seed/seed.sql`, copy everything into the Supabase SQL editor, **Run**. It's safe to run again: it replaces the seeded teams.

The export does **not** include the artifact's coach notes and to-dos (free text that could
mention athletes). Copy anything you want to keep by hand into each team's Notes card.
Team logos were stored inside the artifact, so re-upload them in **Team settings**.

### 3. Vercel

1. Push this folder to a new GitHub repo (e.g. `joshbray9-maker/teamhub`, private), separate from BSP-APP.
2. vercel.com → **Add New → Project** → import that repo. Framework: Vite (detected).
3. **Environment Variables** (Production + Preview):
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable / anon key
4. **Deploy**. Put the Vercel address into Supabase's Site URL (step 1.3) if you haven't yet.

`vercel.json` already routes every path to the app, so `/schedule/bcs` links work.

### 4. Daily league sync

Uses the Supabase CLI through `npx` (no Homebrew needed).

```bash
npx supabase login
```
```bash
npx supabase link --project-ref YOUR-PROJECT-REF
```
```bash
npx supabase functions deploy league-sync
```
Make a random secret so only your cron job can trigger the sync. Print one:
```bash
openssl rand -hex 24
```
Store it in Supabase, replacing `PASTE-IT-HERE` with the printed value:
```bash
npx supabase secrets set CRON_SECRET=PASTE-IT-HERE
```
Then open `supabase/cron.sql`, replace `YOUR-CRON-SECRET` with the same value and
`YOUR-PROJECT-REF` with your project ref, and run it in the SQL editor. The sync then runs
every day at 06:00 Eastern. Coaches can also press **Sync now** on a team's Home page.

**What the sync does.** It only updates games already on a team's calendar: time, venue, a
moved date (within 3 days, same opponent) and scores. Changed games get a **Changed** tag and
a notification. Games the league lists that aren't on the calendar show up under **League
sync → New** for a coach to **Add** or **Dismiss**. Nothing is added automatically, because a
game belongs on a team's calendar only when that team's S&C sheet has it.

**Which leagues it can read today:**

| League | Daily sync |
|---|---|
| RSEQ (Bishop's rugby) | Yes. Reads the same public data the diffusion.rseq.ca page loads (games only) |
| CSSHL (BCS U18/U16) | No. The page builds its schedule with JavaScript. Keep using **Update from CSSHL East** (paste) |
| EliteProspects (Universel USPHL/NCDC) | No. The site blocks automated requests. Keep using paste or .ics import |
| Any team with a calendar feed | Yes. Put the `.ics` / webcal link in **Team settings → Calendar feed** |

If a league publishes an .ics subscription link for a team, that's the most reliable source.
Each run is logged under the team's **League sync** card.

### 5. Add coaches

Team switcher → **Members & sharing** (admins only). Enter the coach's email and role. If
they already have an account they get access right away; otherwise they get it the moment
they sign up at your TeamHub address with that email. Turn on **Public master schedule
link** there to get `https://<your-app>/schedule/<org>` for parents/staff. It shows games
and events only.

Sign-ups are open by default: a stranger who signs up sees nothing unless an admin adds
them. To lock it down, turn off **Authentication → Sign In / Providers → Allow new users to
sign up** and invite people from **Authentication → Users → Invite user** instead (still add
them in Members & sharing).

## Working on it locally

```bash
npm install
```
```bash
npm run dev
```
Without Supabase keys, `npm run dev` runs a **demo mode** on the exported data, saved only
in that browser. To use your real project locally, copy `.env.example` to `.env.local` and
fill in the two values. Demo mode and the export are left out of production builds.

```bash
npm test
```
runs the parser tests and loads the real migration + seed into an in-process Postgres to
check the access rules (coach vs viewer vs outsider vs public link).

## Not built yet

Same placeholders as the artifact: League, Opponents, Practice plan, Game day,
Playbook, Roster, Data Center, Injury report, Recruitment, My Profile, S&C Gym groups and
Tests. Workload load units and the acute:chronic band are **placeholder values**, editable
per team. They're not a validated scale.
