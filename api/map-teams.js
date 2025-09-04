// api/map-teams.js
import { sql } from '@vercel/postgres';
import { requireAdmin } from './auth.js';

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')   // remove punctuation
    .replace(/\s+/g, ' ')          // collapse spaces
    .trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const season = Number(url.searchParams.get('season')) || Number(process.env.ESPN_SEASON) || new Date().getFullYear();
    const leagueId = 708357460;

    // 1) Fetch ESPN team list
    const espnUrl = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam`;
    const headers = {};
    if (process.env.ESPN_SWID && process.env.ESPN_S2) {
      headers['Cookie'] = `SWID=${process.env.ESPN_SWID}; ESPN_S2=${process.env.ESPN_S2}`;
    }
    const r = await fetch(espnUrl, { headers });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(r.status).json({ error: 'Failed to fetch ESPN teams', status: r.status, body: txt.slice(0, 300) });
    }
    const data = await r.json();
    const espnTeams = (data?.teams || []).map(t => ({
      espnTeamId: t.id,
      name: (t.location && t.nickname) ? `${t.location} ${t.nickname}` : (t.name || `Team ${t.id}`)
    }));

    // 2) Load your DB teams
    const dbTeams = (await sql`SELECT id, name, espn_id AS "espnId" FROM teams ORDER BY id ASC`).rows;

    // 3) Build normalized name maps
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

    // 4) Write updates
    for (const u of updates) {
      await sql`UPDATE teams SET espn_id = ${u.to} WHERE id = ${u.id}`;
    }

    res.status(200).json({
      season,
      leagueId,
      updated: updates.length,
      updates,
      unmapped: misses,
      espnTeams
    });
  } catch (err) {
    console.error('map-teams error:', err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}

