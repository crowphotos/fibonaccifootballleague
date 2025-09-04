#!/usr/bin/env bash
set -euo pipefail

# Tip for Git Bash on Windows: prevent history expansion breaking <!doctype>
set +o histexpand || true

ROOT="."
echo "Setting up Fibonacci Football League project in $ROOT"
mkdir -p "$ROOT"/{api,public/admin}

# .gitignore
cat > "$ROOT/.gitignore" <<'EOF'
node_modules
.vercel
.env
.env.*
.DS_Store
EOF

# package.json
cat > "$ROOT/package.json" <<'EOF'
{
  "name": "ffl-fibonacci-vercel",
  "version": "1.0.0",
  "private": true,
  "description": "Fibonacci Football League — Vercel serverless API + Vercel Postgres",
  "scripts": {
    "dev": "vercel dev",
    "build": "echo 'Vercel builds serverless functions automatically'",
    "start": "vercel dev"
  },
  "dependencies": {
    "@vercel/postgres": "^0.9.0"
  }
}
EOF

# vercel.json
cat > "$ROOT/vercel.json" <<'EOF'
{
  "version": 2,
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" },
    { "src": "/admin", "dest": "/admin/index.html" }
  ],
  "headers": [
    {
      "source": "/api/standings",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type" }
      ]
    }
  ]
}
EOF

# README.md
cat > "$ROOT/README.md" <<'EOF'
# Fibonacci Football League — Vercel + Postgres

Serverless API (in `/api`) backed by **Vercel Postgres** and a static **public** site for standings plus an **admin** page.

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
EOF

#public/styles.css

cat > "$ROOT/public/styles.css" <<'EOF'
:root { --bg:#0e1116; --card:#171b22; --muted:#8a94a6; --text:#e6eaf2; --acc:#5ab0ff; }

{ box-sizing: border-box; }
body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:var(--bg); color:var(--text); }
header { padding:16px 20px; border-bottom:1px solid #222832; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
header h1 { font-size:18px; margin:0; font-weight:700; letter-spacing:.3px; }
main { padding:16px; display:grid; gap:16px; }
.card { background:var(--card); border:1px solid #222832; border-radius:12px; padding:16px; }
h2 { font-size:16px; margin:0 0 12px; }
table { width:100%; border-collapse: collapse; }
th, td { text-align:left; padding:10px; border-bottom:1px solid #202736; font-size:14px; }
th { color:var(--muted); font-weight:700; }
tbody tr:hover { background:#141a24; }
.btn { background:#223149; border:1px solid #2e4b75; color:#d8ecff; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:700; }
.btn.secondary { background:#1b222e; border-color:#2a3447; color:var(--muted); }
.pill { padding:2px 8px; border-radius:999px; border:1px solid #2b3547; background:#121826; font-size:12px; color:#a9b5c9; }
.muted { color:var(--muted); }
.flex { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
input, select { background:#121620; color:var(--text); border:1px solid #263143; border-radius:8px; padding:8px 10px; }
EOF

#public/index.html

cat > "$ROOT/public/index.html" <<'EOF'

<!doctype html> <html lang="en"> <head> <meta charset="utf-8" /> <meta name="viewport" content="width=device-width,initial-scale=1" /> <title>Fibonacci Football League – Standings</title> <link rel="stylesheet" href="/styles.css" /> </head> <body> <header> <h1>Fibonacci Football League – Standings</h1> </header> <main> <div class="card"> <h2>Table</h2> <div class="muted" id="meta"></div> <table> <thead> <tr> <th>#</th> <th>Team</th> <th class="muted">ESPN ID</th> <th>FFL Pts</th> <th class="muted">Raw Pts (sum)</th> <th class="muted">Played</th> <th class="muted">Last Week</th> </tr> </thead> <tbody id="tbody"></tbody> </table> </div> </main> <script> async function loadStandings(){ const res = await fetch('/api/standings'); const data = await res.json(); document.getElementById('meta').textContent = data.latestWeek != null ? ('Through Week ' + (data.latestWeek+1)) : 'No weeks calculated yet.'; const tb = document.getElementById('tbody'); tb.innerHTML = ''; data.rows.forEach((r, idx) => { const tr = document.createElement('tr'); tr.innerHTML = ` <td>${idx+1}</td> <td>${r.name}</td> <td class="muted">${r.espnId ? '<span class="pill">'+r.espnId+'</span>' : ''}</td> <td><strong>${r.seasonPts}</strong></td> <td class="muted">${Number(r.rawSum).toFixed(2)}</td> <td class="muted">${r.played}</td> <td class="muted">${r.lastWeek == null ? '-' : r.lastWeek}</td> `; tb.appendChild(tr); }); } loadStandings(); </script> </body> </html> EOF
public/admin/index.html

cat > "$ROOT/public/admin/index.html" <<'EOF'

<!doctype html> <html lang="en"> <head> <meta charset="utf-8" /> <meta name="viewport" content="width=device-width,initial-scale=1" /> <title>FFL Admin</title> <link rel="stylesheet" href="/styles.css" /> </head> <body> <header> <h1>FFL Admin</h1> </header> <main> <div class="card"> <h2>Login</h2> <div class="flex"> <input id="u" placeholder="Admin user" /> <input id="p" type="password" placeholder="Admin password" /> <button class="btn" id="login">Set Credentials</button> <span class="muted">Stored in this browser only.</span> </div> </div> <div class="card"> <h2>Teams</h2> <div class="flex"> <input id="newTeamName" placeholder="Team name" /> <input id="newTeamEspn" placeholder="ESPN ID (optional)" /> <button class="btn" id="addTeamBtn">Add Team</button> </div> <table> <thead><tr><th>ID</th><th>Name</th><th>ESPN</th><th></th></tr></thead> <tbody id="teamsBody"></tbody> </table> </div> <div class="card"> <h2>Schedule</h2> <div class="flex"> <button class="btn" id="genBtn">Generate Double Round-Robin (18 weeks)</button> </div> <div class="flex"> <input id="weekInput" type="number" min="0" max="17" value="0" /> <button class="btn secondary" id="loadWeekBtn">Load Week</button> <button class="btn" id="saveWeekBtn">Save Week</button> </div> <table> <thead><tr><th>#</th><th>Team A</th><th>Team B</th></tr></thead> <tbody id="schedBody"></tbody> </table> </div> <div class="card"> <h2>Scores & Calculate</h2> <div class="flex"> <input id="scoreWeek" type="number" min="0" max="17" value="0" /> <button class="btn secondary" id="loadScoresBtn">Load Scores</button> <button class="btn" id="saveScoresBtn">Save Scores</button> <button class="btn" id="calcBtn">Calculate Awards for Week</button> </div> <table> <thead><tr><th>Team</th><th>Score</th></tr></thead> <tbody id="scoresBody"></tbody> </table> <div id="calcResult" class="muted"></div> </div> </main> <script> function getAuthHeader(){ const token = localStorage.getItem('ffl_admin_token') || ''; return token ? { 'Authorization': 'Basic ' + token } : {}; } document.getElementById('login').addEventListener('click', ()=>{ const u = document.getElementById('u').value.trim(); const p = document.getElementById('p').value; if(!u || !p) return alert('Enter user & password'); localStorage.setItem('ffl_admin_token', btoa(u+':'+p)); alert('Credentials saved in this browser.'); }); async function api(path, opts){ const res = await fetch(path, Object.assign({ headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeader()) }, opts)); if(!res.ok){ if(res.status === 401){ alert('Unauthorized. Click "Set Credentials" with your admin user/pass.'); } else { const txt = await res.text(); alert('Error: ' + txt); } throw new Error('API error'); } return res.json(); } // Teams async function loadTeams(){ const rows = await api('/api/teams', { method:'GET', headers: { 'Content-Type':'application/json' } }); const tb = document.getElementById('teamsBody'); tb.innerHTML = ''; rows.forEach(r=>{ const tr = document.createElement('tr'); tr.innerHTML = ` <td>${r.id}</td> <td><input data-id="${r.id}" data-field="name" value="${r.name}"/></td> <td><input data-id="${r.id}" data-field="espnId" value="${r.espnId||''}"/></td> <td><button class="btn secondary" data-del="${r.id}">Delete</button></td> `; tb.appendChild(tr); }); tb.querySelectorAll('input').forEach(inp=>{ inp.addEventListener('change', async (e)=>{ const id = e.target.getAttribute('data-id'); const field = e.target.getAttribute('data-field'); const payload = { id: Number(id) }; payload[field] = e.target.value; await api('/api/teams', { method:'PUT', body: JSON.stringify(payload) }); }); }); tb.querySelectorAll('button[data-del]').forEach(btn=>{ btn.addEventListener('click', async ()=>{ const id = btn.getAttribute('data-del'); if(!confirm('Delete team '+id+'?')) return; await api('/api/teams?id='+id, { method:'DELETE' }); await loadTeams(); }); }); renderScoresEditor(rows); } document.getElementById('addTeamBtn').addEventListener('click', async ()=>{ const name = document.getElementById('newTeamName').value.trim(); if(!name) return alert('Name required'); const espnId = document.getElementById('newTeamEspn').value.trim(); await api('/api/teams', { method:'POST', body: JSON.stringify({ name, espnId }) }); document.getElementById('newTeamName').value=''; document.getElementById('newTeamEspn').value=''; loadTeams(); }); // Schedule async function loadWeek(){ const week = Number(document.getElementById('weekInput').value); const pairs = await api('/api/schedule?week='+week, { method:'GET', headers:{ 'Content-Type':'application/json' } }); const teams = await api('/api/teams', { method:'GET', headers:{ 'Content-Type':'application/json' } }); const options = (val) => ['<option value="">-- pick --</option>'].concat(teams.map(t=>`<option value="${t.id}" ${t.id==val?'selected':''}>${t.name}</option>`)).join(''); const tb = document.getElementById('schedBody'); tb.innerHTML=''; for(let i=0;i<5;i++){ const p = pairs[i] || { teamA:'', teamB:'' }; const tr = document.createElement('tr'); tr.innerHTML = ` <td>${i+1}</td> <td><select id="a-${i}">${options(p.teamA)}</select></td> <td><select id="b-${i}">${options(p.teamB)}</select></td> `; tb.appendChild(tr); } } document.getElementById('loadWeekBtn').addEventListener('click', loadWeek); document.getElementById('saveWeekBtn').addEventListener('click', async ()=>{ const week = Number(document.getElementById('weekInput').value); const pairs = []; for(let i=0;i<5;i++){ const a = Number(document.getElementById('a-'+i).value); const b = Number(document.getElementById('b-'+i).value); if(Number.isFinite(a) && Number.isFinite(b) && a && b){ if(a===b) return alert('Pair teams must differ.'); pairs.push({ teamA:a, teamB:b }); } } await api('/api/schedule?week='+week, { method:'PUT', body: JSON.stringify(pairs) }); alert('Saved schedule for week '+(week+1)); }); document.getElementById('genBtn').addEventListener('click', async ()=>{ if(!confirm('Generate double round-robin schedule for all 18 weeks (overwrites existing)?')) return; await api('/api/schedule?generate=1', { method:'POST' }); alert('Schedule generated.'); }); // Scores & calc function renderScoresEditor(teams){ const tb = document.getElementById('scoresBody'); tb.innerHTML=''; teams.forEach(t=>{ const tr = document.createElement('tr'); tr.innerHTML = ` <td>${t.name}</td> <td><input type="number" step="0.01" id="score-${t.id}" /></td> `; tb.appendChild(tr); }); } document.getElementById('loadScoresBtn').addEventListener('click', async ()=>{ const week = Number(document.getElementById('scoreWeek').value); const rows = await api('/api/scores?week='+week, { method:'GET', headers:{ 'Content-Type':'application/json' } }); rows.forEach(r=>{ const inp = document.getElementById('score-'+r.teamId); if(inp) inp.value = r.score; }); }); document.getElementById('saveScoresBtn').addEventListener('click', async ()=>{ const week = Number(document.getElementById('scoreWeek').value); const teams = await api('/api/teams', { method:'GET', headers:{ 'Content-Type':'application/json' } }); const payload = {}; teams.forEach(t=>{ const v = document.getElementById('score-'+t.id).value; if(v !== '') payload[t.id] = Number(v); }); await api('/api/scores?week='+week, { method:'PUT', body: JSON.stringify(payload) }); alert('Scores saved for week '+(week+1)); }); document.getElementById('calcBtn').addEventListener('click', async ()=>{ const week = Number(document.getElementById('scoreWeek').value); await api('/api/calc?week='+week, { method:'POST' }); document.getElementById('calcResult').textContent = 'Calculated.'; alert('Awards calculated for week '+(week+1)); }); // boot loadTeams(); loadWeek(); </script> </body> </html> EOF
api/db.js

cat > "$ROOT/api/db.js" <<'EOF'
import { sql } from '@vercel/postgres';

export async function ensureSchema() {
await sqlCREATE TABLE IF NOT EXISTS teams ( id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, espn_id TEXT );
await sqlCREATE TABLE IF NOT EXISTS schedule ( week INT NOT NULL, pair_index INT NOT NULL, team_a INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, team_b INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, PRIMARY KEY (week, pair_index) );
await sqlCREATE TABLE IF NOT EXISTS scores ( week INT NOT NULL, team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, score DOUBLE PRECISION NOT NULL DEFAULT 0, PRIMARY KEY (week, team_id) );
await sqlCREATE TABLE IF NOT EXISTS awards ( week INT NOT NULL, team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, points DOUBLE PRECISION NOT NULL DEFAULT 0, PRIMARY KEY (week, team_id) );
}
EOF

#api/auth.js

cat > "$ROOT/api/auth.js" <<'EOF'
export function requireAdmin(req, res) {
const hdr = req.headers['authorization'] || '';
const token = hdr.startsWith('Basic ') ? hdr.slice(6) : '';
const [user, pass] = Buffer.from(token, 'base64').toString('utf8').split(':');
if (user !== process.env.ADMIN_USER || pass !== process.env.ADMIN_PASS) {
if (res) res.setHeader('WWW-Authenticate', 'Basic realm="FFL Admin"');
const err = new Error('Unauthorized');
err.statusCode = 401;
throw err;
}
}
EOF

#api/standings.js

cat > "$ROOT/api/standings.js" <<'EOF'
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';

export default async function handler(req, res) {
if (req.method === 'OPTIONS') {
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
return res.status(200).end();
}
if (req.method !== 'GET') return res.status(405).end();

await ensureSchema();
res.setHeader('Access-Control-Allow-Origin', '*'); // allow WP embed

const latest = await sqlSELECT MAX(week) AS w FROM awards;
const latestWeek = latest.rows[0]?.w ?? null;

const q = await sql SELECT t.id, t.name, t.espn_id AS "espnId", COALESCE((SELECT SUM(points) FROM awards a WHERE a.team_id = t.id), 0) AS "seasonPts", COALESCE((SELECT SUM(score) FROM scores s WHERE s.team_id = t.id), 0) AS "rawSum", COALESCE((SELECT COUNT(*) FROM awards a WHERE a.team_id = t.id), 0) AS "played", ( SELECT points FROM awards a2 WHERE a2.team_id = t.id AND a2.week = (SELECT MAX(week) FROM awards a3 WHERE a3.team_id = t.id) ) AS "lastWeek" FROM teams t ORDER BY "seasonPts" DESC, "rawSum" DESC, t.name ASC ;
res.status(200).json({ latestWeek, rows: q.rows });
}
EOF

#api/teams.js

cat > "$ROOT/api/teams.js" <<'EOF'
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { requireAdmin } from './auth.js';

export default async function handler(req, res) {
await ensureSchema();
const method = req.method;

if (method === 'GET') {
const r = await sqlSELECT id, name, espn_id AS "espnId" FROM teams ORDER BY id ASC;
return res.status(200).json(r.rows);
}

if (method === 'POST') {
try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode||401).send(e.message); }
const { name, espnId } = req.body || {};
if (!name) return res.status(400).json({ error: 'name required' });
const r = await sqlINSERT INTO teams (name, espn_id) VALUES (${name}, ${espnId||null}) RETURNING id, name, espn_id AS "espnId";
return res.status(200).json(r.rows[0]);
}

if (method === 'PUT') {
try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode||401).send(e.message); }
const { id, name, espnId } = req.body || {};
if (!id) return res.status(400).json({ error: 'id required' });
await sqlUPDATE teams SET name = COALESCE(${name}, name), espn_id = ${espnId||null} WHERE id = ${id};
return res.status(200).json({ ok: true });
}

if (method === 'DELETE') {
try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode||401).send(e.message); }
const url = new URL(req.url, http://${req.headers.host});
const id = Number(url.searchParams.get('id'));
if (!id) return res.status(400).json({ error: 'id required' });
await sqlDELETE FROM teams WHERE id = ${id};
return res.status(200).json({ ok: true });
}

res.status(405).end();
}
EOF

#api/schedule.js

cat > "$ROOT/api/schedule.js" <<'EOF'
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { requireAdmin } from './auth.js';

const TOTAL_WEEKS = 18;

function roundRobin(ids) {
const n = ids.length;
const arr = [...ids];
const fixed = arr[0];
let rot = arr.slice(1);
const rounds = [];
for (let r=0; r<n-1; r++) {
const left = [fixed].concat(rot.slice(0,(n/2)-1));
const right = rot.slice((n/2)-1).reverse();
const pairs = [];
for (let i=0;i<n/2;i++) pairs.push({ a:left, b:right });
rounds.push(pairs);
rot = [rot[rot.length-1], ...rot.slice(0,-1)];
}
return rounds;
}
function doubleRoundRobin(ids) {
const base = roundRobin(ids);
const swapped = base.map(r => r.map(p => ({ a:p.b, b:p.a })));
return base.concat(swapped).slice(0, TOTAL_WEEKS);
}

export default async function handler(req, res) {
await ensureSchema();
const url = new URL(req.url, http://${req.headers.host});

if (req.method === 'GET') {
const week = Number(url.searchParams.get('week'));
const r = await sqlSELECT pair_index AS "pairIndex", team_a AS "teamA", team_b AS "teamB" FROM schedule WHERE week = ${week} ORDER BY pair_index ASC;
return res.status(200).json(r.rows);
}

if (req.method === 'PUT') {
try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode||401).send(e.message); }
const week = Number(url.searchParams.get('week'));
const pairs = Array.isArray(req.body) ? req.body : [];
await sql.begin(async (trx) => {
await trxDELETE FROM schedule WHERE week = ${week};
for (let i=0;i<pairs.length;i++) {
const { teamA, teamB } = pairs[i];
if (teamA === teamB) throw new Error('Pair teams must be different');
await trxINSERT INTO schedule (week, pair_index, team_a, team_b) VALUES (${week}, ${i}, ${teamA}, ${teamB});
}
});
return res.status(200).json({ ok: true, saved: pairs.length });
}

if (req.method === 'POST') {
try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode||401).send(e.message); }
const generate = url.searchParams.get('generate');
if (!generate) return res.status(400).json({ error: 'missing ?generate=1' });

const teams = await sql`SELECT id FROM teams ORDER BY id ASC`;
if (teams.rows.length !== 10) return res.status(400).json({ error: 'Exactly 10 teams required' });
const ids = teams.rows.map(r=>r.id);
const sched = doubleRoundRobin(ids);
await sql.begin(async (trx) => {
  for (let w=0; w<sched.length; w++) {
    const pairs = sched[w];
    await trx`DELETE FROM schedule WHERE week = ${w}`;
    for (let i=0;i<pairs.length;i++) {
      await trx`INSERT INTO schedule (week, pair_index, team_a, team_b) VALUES (${w}, ${i}, ${pairs[i].a}, ${pairs[i].b})`;
    }
  }
});
return res.status(200).json({ ok: true, weeks: sched.length });


}

res.status(405).end();
}
EOF

#api/scores.js

cat > "$ROOT/api/scores.js" <<'EOF'
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { requireAdmin } from './auth.js';

export default async function handler(req, res) {
await ensureSchema();
const url = new URL(req.url, http://${req.headers.host});
const week = Number(url.searchParams.get('week'));

if (req.method === 'GET') {
const r = await sqlSELECT team_id AS "teamId", score FROM scores WHERE week = ${week};
return res.status(200).json(r.rows);
}

if (req.method === 'PUT') {
try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode||401).send(e.message); }
const payload = req.body || {};
await sql.begin(async (trx) => {
await trxDELETE FROM scores WHERE week = ${week};
for (const [teamId, score] of Object.entries(payload)) {
await trxINSERT INTO scores (week, team_id, score) VALUES (${week}, ${Number(teamId)}, ${Number(score)});
}
});
return res.status(200).json({ ok: true });
}

res.status(405).end();
}
EOF

#api/calc.js

cat > "$ROOT/api/calc.js" <<'EOF'
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { requireAdmin } from './auth.js';

const WEEK_POINTS = [8,5,3,2,1];

export default async function handler(req, res) {
await ensureSchema();
if (req.method !== 'POST') return res.status(405).end();
try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode||401).send(e.message); }

const url = new URL(req.url, http://${req.headers.host});
const week = Number(url.searchParams.get('week'));

const pairs = (await sqlSELECT pair_index, team_a, team_b FROM schedule WHERE week = ${week} ORDER BY pair_index ASC).rows;
if (pairs.length === 0) return res.status(400).json({ error: 'No schedule for this week' });

const scoresRows = (await sqlSELECT team_id, score FROM scores WHERE week = ${week}).rows;
const scores = new Map(scoresRows.map(r=>[r.team_id, r.score]));

const sums = pairs.map(p => {
const aScore = scores.get(p.team_a) ?? 0;
const bScore = scores.get(p.team_b) ?? 0;
return { pairIndex: p.pair_index, a: p.team_a, b: p.team_b, sum: (aScore||0)+(bScore||0) };
}).sort((x,y)=> y.sum - x.sum);

// average-of-places for ties
const awards = new Map();
let i=0, place=0;
while (i < sums.length) {
let j=i+1;
while (j < sums.length && sums[j].sum === sums[i].sum) j++;
const count = j - i;
const avg = WEEK_POINTS.slice(place, place+count).reduce((a,b)=>a+b,0) / count;
for (let k=i; k<j; k++) awards.set(sums[k].pairIndex, avg);
place += count; i = j;
}

await sql.begin(async (trx) => {
await trxDELETE FROM awards WHERE week = ${week};
for (const p of pairs) {
const pts = awards.get(p.pair_index) ?? 0;
await trxINSERT INTO awards (week, team_id, points) VALUES (${week}, ${p.team_a}, ${pts});
await trxINSERT INTO awards (week, team_id, points) VALUES (${week}, ${p.team_b}, ${pts});
}
});

res.status(200).json({ ok: true });
}
EOF

echo "✅ Project files created"
echo
echo "Next steps:"
#cat <<'EOS'
#npm install
#git add .
#git commit -m "Initialize FFL Vercel + Postgres project"
#git push

