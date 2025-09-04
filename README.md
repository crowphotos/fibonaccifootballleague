# Fibonacci Football League — Vercel + Postgres

Serverless API (in `/api`) backed by **Vercel Postgres** and a static **public** site for standings plus an **admin** page.

Do we put files at the root of the repo?

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
