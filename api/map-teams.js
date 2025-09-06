// api/map-teams.js
import { sql } from '@vercel/postgres';
import { requireAdmin } from './auth.js';
import { withCors } from './cors.js';

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function buildHeaders(cookies) {
  const h = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Referer': 'https://fantasy.espn.com/',
    'Origin': 'https://fantasy.espn.com',
    'Accept-Language': 'en-US,en;q=0.9'
  };
  if (cookies) h['Cookie'] = cookies;
  return h;
}
async function tryJson(url, cookies) {
  const r = await fetch(url, { headers: buildHeaders(cookies), redirect: 'follow' });
  const ct = r.headers.get('content-type') || '';
  const text = await r.text().catch(() => '');
  if (!ct.includes('application/json')) {
    return { ok: false, status: r.status, url: r.url || url, contentType: ct, bodySnippet: text.slice(0, 400) };
  }
  try {
    const data = JSON.parse(text);
    if (!r.ok) return { ok: false, status: r.status, url: r.url || url, data };
    return { ok: true, status: r.status, url: r.url || url, data };
  } catch (e) {
    return { ok: false, status: r.status, url: r.url || url, error: String(e?.message || e), bodySnippet: text.slice(0, 400) };
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const season = Number(url.searchParams.get('season')) || Number(process.env.ESPN_SEASON) || new Date().getFullYear();
  const leagueId = Number(process.env.ESPN_LEAGUE_ID || 708357460);

  const endpoints = [
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam`,
    `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam`
  ];
  const cookies = (process.env.ESPN_SWID && process.env.ESPN_S2)
    ? `SWID=${process.env.ESPN_SWID}; ESPN_S2=${process.env.ESPN_S2}`
    : '';

  let success = null;
  let lastErr = null;
  for (const u of endpoints) {
    const out = await tryJson(u, cookies);
    if (out.ok) { success = out; break; }
    lastErr = out;
  }
  if (!success) {
    return res.status(lastErr?.status || 502).json({
      source: 'espn',
      ok: false,
      season,
      leagueId,
      tried: endpoints,
      ...lastErr
    });
  }

  const espnTeams = (success.data?.teams || []).map(t => ({
    espnTeamId: t.id,
    name: (t.location && t.nickname) ? `${t.location} ${t.nickname}` : (t.name || `Team ${t.id}`)
  }));

  const dbTeams = (await sql`SELECT id, name, espn_id AS "espnId" FROM teams ORDER BY id ASC`).rows;

  const espnByNorm = new Map(espnTeams.map(t => [norm(t.name), t]));
  const updates = [];
  const misses = [];

  for (const team of dbTeams) {
    const key = norm(team.name);
    const hit = espnByNorm.get(key);
    if (hit) {
      if (String(team.espnId ?? '') !== String(hit.espnTeamId)) {
        updates.push({ id: team.id, from: team.espnId, to: String(hit.espnTeamId), name: team.name, espnName: hit.name });
      }
    } else {
      misses.push({ id: team.id, name: team.name });
    }
  }

  for (const u of updates) {
    await sql`UPDATE teams SET espn_id = ${u.to} WHERE id = ${u.id}`;
  }

  res.status(200).json({ season, leagueId, updated: updates.length, updates, unmapped: misses, espnTeams });
}

export default withCors(handler);

