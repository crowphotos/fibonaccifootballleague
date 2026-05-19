# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start local dev server (vercel dev)
vercel               # Deploy to preview
vercel --prod        # Deploy to production
```

No test runner or linter is configured. Manual testing via browser or curl against `http://localhost:3000`.

## Architecture

Serverless app on Vercel: static HTML/JS frontend in `public/` + Node.js API functions in `api/`.

**Key patterns:**
- Every `api/*.js` file is a Vercel serverless function. All export a default `handler(req, res)` and wrap it with `cors()` from `api/cors.js`.
- `api/db.js` exports `ensureSchema()` which creates all four tables if they don't exist. Every endpoint calls this on each request — no migration tooling.
- Basic auth for write operations comes from `api/auth.js` checking `ADMIN_USER`/`ADMIN_PASS` env vars against the `Authorization: Basic ...` header.
- All files use ES module syntax (`import`/`export`), per `"type": "module"` in package.json.

**Data flow for a scoring week:**
1. Admin enters (or auto-populates from ESPN via `api/espn.js`) raw fantasy scores → stored in `scores` table
2. `api/calc.js` reads scores for the week, ranks all 10 teams, assigns Fibonacci points (8-5-3-2-1), and writes to `awards` table
3. `api/standings.js` aggregates `awards` for the season standings view
4. `api/week.js` returns per-pair breakdown for a given week

**Fibonacci scoring logic** (`api/calc.js`): 10 teams form 5 pairs per week. Each team is ranked individually by score. Ties share the average of their tied positions (e.g., two teams tied for 2nd both receive (5+3)/2 = 4 pts). Points scale: 1st=8, 2nd=5, 3rd=3, 4th=2, 5th=1.

**ESPN integration** (`api/espn.js`, `api/espn-teams.js`, `api/map-teams.js`): Fetches scores from ESPN fantasy API using `ESPN_S2` and `ESPN_SWID` cookies. `map-teams.js` auto-matches ESPN team names to local team IDs.

**Schedule generation** (`api/schedule.js`): Double round-robin across 10 teams = 18 weeks, 5 pairs/week. `POST /api/schedule?generate=1` regenerates the full season schedule.

## Environment Variables

Set in Vercel project settings (or `.env.local` for `vercel dev`):

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_USER` / `ADMIN_PASS` | Yes | Basic auth for write endpoints |
| `POSTGRES_*` | Yes | Auto-injected by Vercel Postgres storage add-on |
| `ESPN_S2` / `ESPN_SWID` | No | Browser cookies for private ESPN leagues |
| `ESPN_SEASON` / `ESPN_LEAGUE_ID` | No | Default ESPN league parameters |

## Deployment

Two deployment paths exist:
- **Vercel** (primary): `vercel --prod` — deploys serverless functions and static assets
- **SFTP** (legacy): GitHub Actions workflow (`.github/workflows/deploy.yml`) pushes to HostGator on `main` push; requires `SFTP_*` GitHub secrets

Vercel routing is defined in `vercel.json`: `/` → `public/index.html`, `/admin` → `public/admin/index.html`.
