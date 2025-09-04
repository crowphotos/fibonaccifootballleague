// api/map-teams.js
import { sql } from '@vercel/postgres';
import { requireAdmin } from './auth.js';

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchEspnJson(url, cookies) {
  const headers = { 'Accept': 'application/json' };
  if (cookies) headers['Cookie'] = cookies;

  const r = await fetch(url, { headers });
  const ct = r.headers.get('content-type') || '';

  // If it's not JSON, return a structured error with a snippet
  if (!ct.includes('application/json')) {
    const body = await r.text().catch(() => '');
    return { ok: false, status: r.status, error: 'ESPN did not return JSON', contentType: ct, bodySnippet: body.slice(0, 400) };
  }

  try {
    const data = await r.json();
    if (!r.ok) {
      return { ok: false, status: r.status, error: 'ESPN returned non-200 with JSON', data };
    }
    return { ok: true, status: r.status, data };
  } catch (e) {
    const body = await r.text().catch(() => '');
    return { ok: false, status: r.status, error: String(e?.message || e), contentType: ct, bodySnippet: body.slice(0, 400) };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const season = Number(url.searchParams.get('season')) || Number(process.env.ESPN_SEASON) || new Date().getFullYear();
    const leagueId = 708357460;

    const espnUrl = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam`;
    const cookies = (process.env.ESPN_SWID && process.env.ESPN_S2) ? `SWID=${process.env.ESPN_SWID}; ESPN_S2=${process.env.ESPN_S2}` : '';

    const out = await fetchEspnJson(espnUrl, cookies);
    if (!out.ok) {
      return res.status(out.status || 502).json({ source: 'espn', ...out });
    }
    const espnTeams = (out.data?.teams || []).map(t => ({
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

