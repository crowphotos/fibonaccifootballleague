# Fibonacci Football League — Vercel + Postgres

Serverless API (in `/api`) backed by **Vercel Postgres** and a static **public** site for standings plus an **admin** page.

WORK PLEASE we put files at the root of the repo

## Local (optional)

```bash
npm i -g vercel
npm install
vercel link   # or just: vercel
vercel dev

Environment

Set these in Vercel → Project → Settings → Environment Variables:

ADMIN_USER – admin username for protected endpoints

ADMIN_PASS – admin password

### ESPN (optional, needed for private leagues)
- `ESPN_S2` — copy from your browser cookies after logging into fantasy.espn.com
- `ESPN_SWID` — copy from cookies (looks like `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}`)
- Season is selected using `?season=2025` or `?season=2026`; the default is 2026 for local data and ESPN. `ESPN_SEASON` is no longer used.


(Postgres) Add Vercel Postgres under Storage; Vercel injects the correct env vars for @vercel/postgres.

Locally (vercel dev) you can create .env.local:

ADMIN_USER=admin
ADMIN_PASS=change-me

Deploy
vercel
vercel --prod


Public: https://<project>.vercel.app/
Admin: https://<project>.vercel.app/admin

API

GET /api/standings

GET /api/teams | POST /api/teams | PUT /api/teams | DELETE /api/teams?id=<id>

GET /api/schedule?week=<0..17> | PUT /api/schedule?week=<0..17>

POST /api/schedule?generate=1

GET /api/scores?week=<0..17> | PUT /api/scores?week=<0..17>

POST /api/calc?week=<0..17>

Schema is created automatically on first API call.


## Seasons and migration

The public and admin pages have a 2025/2026 selector and default to 2026.
All data endpoints accept `?season=YYYY` (combine with `&week=0`, etc.).
Teams, names, ESPN mappings, schedules, scores, and awards belong to one season.

On the first database-backed API request after deployment, `ensureSchema()` runs
`lib/schema.js` as one atomic PostgreSQL statement, serialized with an advisory
transaction lock. Existing records are assigned to **2025**. The existing team
list is copied into **2026** with new local IDs; schedules, scores, and awards
are not copied. Composite foreign keys prevent referencing another season's teams.
The migration is recorded and does not repeat or recreate deleted teams.
No default season is set on database columns: every writer must supply it.

This migration assumes all existing unversioned records belong to 2025. Do not
run it on a database already containing mixed-year unversioned results. Export a
backup before production rollout, deploy the API and frontend together, then
verify 2025 totals and an empty 2026 season. Do not roll back to the old API after
the migration; it does not understand season isolation. Editing or deleting a team
in Admin affects only the selected season (including its related records).

## Tests

Run `npm install` followed by `npm test`. Tests use an isolated PGlite PostgreSQL
runtime, with no live database credentials. They cover migration preservation,
repeat execution, fresh installation, season validation, and API read/write
isolation including team deletion and award calculation.
