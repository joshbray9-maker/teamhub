# TeamHub

Team schedules, league tables and S&C plans for every team Josh coaches, shared with each
team's coaches by URL. A standalone version of the TeamHub claude.ai artifact:
Vite + React on Vercel, Supabase for the database, sign-in and the daily league sync.

**What it holds:** schedules (games, events), league standings, S&C day themes, intensity and
periodization, team notes/to-dos, team chat, game-day lines and rosters. Rosters hold only what
league and school sites publish (number, name, position, shoots, year, height, weight,
hometown, optional photo): **no medical, contact or date-of-birth fields**. Members of the
organization can read them; coaches edit. Injuries live in their own staff-only table (below).

## What's in here

| Path | What it is |
|---|---|
| `src/` | The app: team switcher, reorderable sidebar, Home (calendar, notifications, notes & to-do, fixtures, standings, league paste, .ics import, league-sync review), master schedules, S&C (calendar, periodization, Workload) |
| `src/pages/PublicSchedule.jsx` | Public read-only page at `/schedule/<org>` |
| `supabase/migrations/…_init.sql` | Tables, row-level security, sign-up trigger, public schedule function, logo storage |
| `supabase/migrations/…_chat*.sql` | Team chat + coaching-staff board: table, access rules, live updates |
| `supabase/migrations/…_lineups.sql` | Game day lines (hockey) |
| `supabase/migrations/…_roster.sql` | Team rosters |
| `src/lib/rosterImport.js` | Reads roster CSV / PDF files (in the browser) |
| `supabase/migrations/…_injuries.sql` | Injury report (staff only) and private player photos |
| `supabase/migrations/…_datasets.sql` | Data Center tables |
| `public/logos/` | Organization logos (BCS, Universel) used for teams without their own logo |
| `supabase/migrations/…_org_logo.sql` | Organization logos, lineup opponent |
| `supabase/migrations/…_testing.sql` | S&C testing sessions, results, gym-group targets (staff only) |
| `src/lib/testing.js` | Test metrics, batteries, gym-group formula, team trends, leaderboard |
| `supabase/migrations/…_leaderboard.sql` | Leaderboard function and its on/off switch |
| `supabase/migrations/…_practice.sql` | Practice plans and drill library (staff only) |
| `supabase/migrations/…_playbook*.sql` | Plays (padlock = coaches only), court / rink surface |
| `src/components/PlayDiagram.jsx`, `src/lib/playbook.js` | Court, play diagrams, steps |
| `supabase/migrations/…_stats_spectators.sql` | Game stats, spectator links, `spectator_view()` |
| `supabase/migrations/…_my_profile.sql` | Profile fields, private profile photos, chat names |
| `src/lib/stats.js` | Stat columns per sport, season totals |
| `src/lib/practice.js` | Block types per sport, clock times, practice CSV |
| `src/lib/imports.js` | S&C, Lines and Data Center imports, blank templates |
| `src/lib/injury.js` | Injury statuses, return countdowns, body regions, injury CSV/PDF import |
| `supabase/functions/league-sync/` | Edge Function for the daily league sync |
| `supabase/functions/roster-import/` | Edge Function that reads a public roster page's tables |
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

**Chat:** each team has a group chat that everyone in the team's organization (admin, coach,
viewer) can read and post in, plus a private **Coaching staff** board that only admins and
coaches can see (viewers don't even get the switch, and the database refuses them). In both, the sender or an admin can delete a message; messages can't be
edited. New messages show up live. The public link never shows chat. Like the notes card,
chat is free text: keep injury or medical details about athletes out of it.

**Game day / Lines (hockey teams):** four forward lines, three defence pairs, two goalies and
four extras, with the selected line shown on a rink. There's one set of **default lines** per
team; each game uses them until a coach changes that game's lines (**Use default lines** goes
back). Coaches click a spot to type a player's number and name and drag to swap; everyone
else in the organization sees the lines read-only. Also **power play** (PP1, PP2) and **penalty
kill** (PK1, PK2) units, the team's **roster** down the right side (drag a player in, or pick
them when clicking a spot), and **Print / PDF**, which opens the browser's print dialog with a
game-day sheet (choose "Save as PDF" there): team logo, team name, opponent (from the
schedule, or typed in the **Opponent** box), date, time and venue, the starting lineup on the
rink, every line and special-teams unit, then the full roster with player details and where
each player is slotted. Tick **Injury status on printout** to add Out / Limited / Available
(off by default, since printouts get passed around). Typing an opponent for a game that
uses your default lines saves that game's own copy of the lines. Other sports still show the placeholder.

**Injury report (admins and coaches only):** health information, so the database only lets an
organization's admins and coaches read or write it; viewers, other organizations and the public
link never see injuries or the flags. Give sports-med staff the **coach** role.
- **Team** view: every rostered player in red (**out**: not practising or playing), yellow
  (**limited**: hurt but can practise and play) or green (**available**), with the countdown to
  return to practice and play. Click a player for their profile: photo and roster details, a
  front/back body diagram glowing on the injured areas, limitations, the return timeline, and
  past injuries.
- **Sports med** view: add, edit and clear injuries (click the body diagram to pick the area),
  or import a CSV / PDF injury sheet (players matched to the roster by name or number).
- Statuses never change by themselves: when a return date passes, the report says
  "update status" until sports med clears or updates the injury.
- Injured players are flagged automatically (red = out, yellow = limited) on the Roster, the
  Lines page roster, and an **Injured players** card on S&C and Practice plan.

**Coach's report (admins and coaches only):** the next game, player availability (out /
limited / available, live from the Injury report), every active limitation, and a print /
PDF button. A **Weekly snapshot** view (week picker, print / PDF) shows that week's games and results plus
next week's, team events, the S&C week with its load versus the week before, who's out or
limited with new and returning injuries, and any testing compared with the previous session.
**Weekly testing results** show the latest team testing session: each test's team median and
change since the previous team session. **Team readiness** describes the same session in a few
sentences: how many athletes are on track, moderately down (orange) or well down (red), using
only Josh's confirmed rules (2026-10-22) on each athlete's latest CMJ jump height and RSImod
against the mean of their previous 3 tests (`FLAG_RULES` in `src/lib/testing.js`). There is no
overall readiness score.

**Imports at a glance:** every tab that holds team data has an **Import** button with two
ways in: **Upload a file** (CSV, or a PDF with selectable text and a row of column headings)
or **Paste from a spreadsheet**, an Excel-style grid you paste copied cells into (⌘V) from
Excel, Numbers or Google Sheets. Row 1 of the grid comes pre-filled with the expected headings.
Either way, everything is read in the browser and shown for review before anything is saved,
and most imports offer a **Download blank template**:

| Tab | What it reads |
|---|---|
| Roster | Number, Name, Position, Shoots, Year, Height, Weight, Hometown, or a roster web page |
| Injury report | Player / Number, Injury, Area, Side, Status, dates, Limitations, Notes |
| Game day / Lines | Line, Position, Number, Player (or a grid: Line, LW, C, RW...) |
| S&C | Date, Theme, Intensity, Note, Phase, Week |
| Data Center | Any table, kept as uploaded (testing results, stats) |

**S&C → Tests (admins and coaches only):** each testing session is a date plus a battery:
**Weekly readiness** (CMJ JH, RSImod, 10 m fly) or **Full team testing** (CMJ JH, RSImod, SJ JH,
IMTP peak force, relative peak force N/kg, 10 m fly, Cooper). **New session** fills the Name
column from the roster with empty test columns; type straight into the grid, paste a block of
cells, or **Import** a file / pasted sheet (matched by name or number). **Bulk import** takes a
whole season in one sheet (Date, Name and test columns, one row per player per day): each date
becomes its own session (or merges into the one already on that date), with the battery picked
from the tests that day and changeable before saving. Basketball teams have their own full
battery, in the order of Josh's sheet: bodyweight (lb), CMJ, RSImod, Abalakov, SJ, EUR, 5-0-5,
Cassivi shuttle, 20 m sprint (bodyweight and EUR are recorded but never ranked; timed drills rank
fastest first). The BCS hockey teams (U18 Varsity, U16 Prep) have their own battery and names,
in the order of Josh's sheet: Bodyweight, CMJ, RSI Mod, 10m Sprint, IMTP, N/kg, Links, SJ,
Chin-up, Cooper(laps), Cooper(distance), Archetype, TTPF, Est. VO2max, On Ice 5-10-5 best and
Stdv, Peak power (Links and Archetype are text; TTPF and the 5-10-5 Stdv aren't ranked; a
Bodyweight in kg, recognised from IMTP ÷ N/kg, is saved in pounds). Universel hockey keeps the
standard battery. A session can be marked **Individual testing** (in the session, or per day in
bulk import): its results stay in those athletes' profiles, gym groups and leaderboard bests but
are left out of every team median, trend and comparison. **Team averages from** (Coaches view)
sets the first date whose testing counts for the team. **Coaches view**: a
trend chart of the team's median % change per test since its first session (a faster 10 m fly
counts as an improvement), then one box per test with the team median over time and the middle
half of the team.

**Master schedule (team menu):** every team in the team's organization on one week (Mon–Sun),
with the organization's time slots as rows: **Universel** 7:30 am–12 pm in 30-minute rows,
**BCS** 3:30–4:30, 4:45–5:45 and 6–7 pm (`src/lib/slots.js`). Games, practices, events and gym
days all show, coloured by team, with filters per team and per kind and a Print button. A gym day
lands in a slot once its **gym time** is set in S&C (click the day); anything without a time sits
in **Time not set**, anything outside the slots in **Other times**. The month calendar for the
whole organization is still the organization's own page.

**All teams · S&C (only the admin of every organization, i.e. Josh):** in the team switcher under
**Master schedules**. Built from each team's own schedule, the same items as that team's Master
schedule (gym days with their gym time or the BCS rotation, games, events; no practices), on one sheet laid
out like the S&C spreadsheet: a block per week (Date (Monday), Team, Periodization, Week, Monday
to Sunday), teams in the sheet's order (Universel, Bishop's, BCS U16 / U18 / varsity / prep),
cells coloured by the day's intensity, games in yellow, events in navy. Current week first, then
the weeks ahead; earlier weeks on request. **Fully editable:** click any day for that team's
S&C session (theme, intensity, gym time, notes), its games (opponent, home/away, date, time,
venue) and events, to change, add, move or remove them; click Periodization / Week to change the
week for one team or all of them. Everything saves to each team's own S&C tab and schedule
(`src/pages/AllTeamsSC.jsx`, `src/lib/master.js`). The "only you" check is UI only: the data is still limited by RLS.

**BCS gym rotation** (`ORG_ROTATION` in `src/lib/slots.js`): Monday basketball 3:30, U18 4:45,
U16 6:00; Tuesday and Wednesday U16 3:30, U18 4:45, basketball 6:00. A gym day without its own
time uses it, and in a week the team has an S&C plan, a rotation day with nothing planned still
shows as **Gym** (a day off or game day removes it). **Coaches can change it by hand:** click an
item to move it (date / time), rename or remove it, or click the **+** in an empty spot to add
gym, a practice or an event there. Gym changes save to that team's S&C calendar (removing marks
the day off so the rotation doesn't put it back); practices and events save to the team's
schedule. Games stay on each team's Home page.

**Athlete reports (admins and coaches only):** every rostered athlete with their testing days;
open one for their full history over a time frame (this season, last 3 / 12 months, all testing,
or custom dates): a summary per test (first, latest, change, best, latest team median), a chart
of each test against the team median, and every result by date (individual testing days marked).
**Print / PDF** makes a one-athlete report to send out. The team median uses team testing only.

**S&C → Gym groups (admins and coaches only):** each athlete's latest full testing is compared
with **targets you set** (Targets button; no built-in numbers). Force = IMTP peak force and
relative peak force; expression = CMJ JH, SJ JH and RSImod. Below the force target →
**Force deficient** (GPP, stronger and bigger); force on target with expression and RSImod on
target → **Expression efficient** (preserve, keep getting stronger and more explosive);
otherwise **Expression deficient** (expression and rate of force development). Each card shows
why, with every result green/red against its target, and a coach can move a player by hand.
The formula is in `src/lib/testing.js`.

**Data Center:** upload any CSV / PDF table as its own named table (Testing, Stats, Other) with
a date. TeamHub doesn't calculate anything from it. Admins and coaches see every table;
viewers only see tables marked **Shared**. Player names in a table link to the roster.

**Playbook (hockey):** the same playbook on the offensive-zone half rink or the full rink, with C,
LW, RW, LD and RD to start, a puck, and skate / pass / carry / shot arrows; categories are
breakouts, neutral zone, offensive zone, power play, penalty kill, faceoffs, forecheck and
defensive zone.

**Playbook (basketball):** plays drawn on a half court (FIBA lines) in steps: offense 1–5,
defense X1–X5 and the ball, with cut (solid), pass (dashed), dribble (zigzag) and screen (bar)
arrows. **+ Step** starts the next step where this one's arrows end; the viewer steps through or
plays it. Categories (sets, quick hitters, BLOB/SLOB, press break, zone, defense), a call word
and notes. Everyone on the team sees unlocked plays; the **padlock** keeps a play to coaches and
admins (enforced in the database). **Playcalling sheet** prints every play by category with its
diagram and call.

**My Profile:** your name, staff title, phone, bio and photo (people in your organizations see
it; chat shows your name), your email and access per organization, a password change and sign
out, and the coaching staff of the current team's organization with their contact details.
You can only edit your own profile, never your email.

**Stats:** player game stats. Coaches enter them per game in a spreadsheet grid (type or paste);
everyone on the team sees the season leaderboard (sortable; hockey adds points and save %, rugby
points). Columns per sport live in `src/lib/stats.js`.

**Spectators (organization admins):** links for parents and fans. Each link covers every team
in the organization or chosen teams and shows the calendar, next game, results and standings;
player stats only when ticked for that link. Anyone with the link can open it without signing
in (`/s/<code>`, a 64-character random code); **Revoke** switches it off at once. Nothing about
injuries, testing, notes, lines or plays is ever included (enforced by `spectator_view()`).

**Practice plan (admins and coaches only):** build a practice block by block: minutes, type
(sport-specific, e.g. basketball: warm-up, ball handling, shooting, offense, defense,
transition, scrimmage, conditioning…), what you're running and coaching notes. Clock times run
from the start time, a bar shows the split by type, blocks reorder with the arrows, and any
block can be saved to the team's **drill library** and reused. **New practice** can start from
a copy of an earlier one; **Print / PDF** and **CSV** export. Injured players are flagged at
the top. Block types live in `src/lib/practice.js`.

**Player profile (admins and coaches only):** Roster → **Profile** on a player (or **Full
profile / print** in the Injury report): photo and roster details, current status, the body
diagram with limitations and return timeline, testing (latest and best per test, team median,
rank on the team, trend), gym group and injury history, with **Print / PDF** for one page.

**Working on several players at once:** tick players on the Roster (or the box in the heading
row for all), then **Move to team…**, **Mark as former / active** or **Delete**. **Add several**
opens a spreadsheet grid to type or paste a batch of new players.

**S&C → Leaderboard (everyone on the team):** each active player's best result per test, and an
overall ranking (average standing across the tests each player has done; 100 = best on the team
in every test). Test results themselves stay coaches-only: players and parents see only these
best results, through the `leaderboard()` database function, and a coach can untick **Visible
to players** to hide it.

**Moving a player to another team:** Roster → click the player → **Move to another team**. You
need coach or admin access to both teams. Their injuries go with them; they come out of the
old team's lines and gym-group moves; their test results stay with the old team's sessions.

**Roster:** add players by hand or **Import CSV / PDF**. The file is read in the browser and
shown for review before anything is saved; players are matched by name, so re-importing
updates numbers and positions instead of duplicating. PDFs need selectable text (not a scan).
**Import from a website** reads a roster page that lists players in a table (school athletics
sites like gaiters.ca) through the `roster-import` function; nothing is stored until you
review and press Import, and the page address is remembered per team. EliteProspects (blocks
automated reads) and CSSHL (builds rosters with JavaScript) can't be read this way: save
their roster page as a PDF and import the file. gaiters.ca's rugby roster has no numbers or
positions, so those stay blank until filled in.

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

### 4b. Roster import from a website

Same Supabase CLI setup as step 4 (`npx supabase login` and `link` once), then:
```bash
npx supabase functions deploy roster-import
```
No secrets needed. Until it's deployed, **Roster → Import → Read page** says it isn't set up.

### 5. Add coaches

Team switcher → **Members & sharing** (admins only). Enter the coach's email and role, and
choose **All teams** or tick **only these teams** (admins always see every team; change it later
with the teams button on each member). If
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

Same placeholders as the artifact: League, Opponents, Game day (non-hockey), Playbook for
football, Recruitment. Workload load units and the acute:chronic band are **placeholder values**, editable
per team. They're not a validated scale.
