// api/espn.js
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';

export default async function handler(req, res) {
  try {
    // Parse params
    const url = new URL(req.url, `http://${req.headers.host}`);
    const weekParam = url.searchParams.get('week');  // 1-based ESPN week
    const seasonParam = url.searchParams.get('season');
    const mapParam = url.searchParams.get('map');     // "1" to map to internal team IDs

    const season = Number(seasonParam) || Number(process.env.ESPN_SEASON) || new Date().getFullYear();
    // Our admin UI uses 0..17; if someone passes 0-based by accident, normalize up to ESPN 1-based
    let week = Number(weekParam || 1);
    if (week >= 0 && week <= 17 && url.searchParams.get('zeroBased') === '1') week = week + 1;

    if (!Number.isFinite(week) || week < 1 || week > 18) {
      return res.status(400).json({ error: 'Invalid week. Use 1..18 (ESPN uses 1-based weeks).' });
    }

    const leagueId = 708357460; // your league
    const espnUrl = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mBoxscore&scoringPeriodId=${week}`;

    // Optional cookies for private leagues
    const headers = {};
    const swid = process.env.ESPN_SWID;
    const s2 = process.env.ESPN_S2;
    if (swid && s2) headers['Cookie'] = `SWID=${swid}; ESPN_S2=${s2}`;

    const r = await fetch(espnUrl, { headers });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(r.status).json({ error: 'Failed to fetch ESPN data', status: r.status, body: text.slice(0, 400) });
    }
    const data = await r.json();

    // Extract per-team totals for that scoring period
    const matchups = Array.isArray(data?.schedule) ? data.schedule : [];
    const espnScores = [];
    for (const m of matchups) {
      if (m?.home?.teamId != null && m?.home?.totalPoints != null) {
        espnScores.push({ espnTeamId: m.home.teamId, points: m.home.totalPoints });
      }
      if (m?.away?.teamId != null && m?.away?.totalPoints != null) {
        espnScores.push({ espnTeamId: m.away.teamId, points: m.away.totalPoints });
      }
    }

    // If mapping requested, map ESPN teamId -> your teams.id using teams.espn_id
    let mapped = null;
    let missing = null;
    if (mapParam === '1') {
      await ensureSchema();
      const teams = (await sql`SELECT id, name, espn_id AS "espnId" FROM teams ORDER BY id ASC`).rows;
      const byEspnId = new Map(teams.map(t => [String(t.espnId ?? '').trim(), t]));
      mapped = [];
      missing = [];

      for (const s of espnScores) {
        const key = String(s.espnTeamId);
        const t = byEspnId.get(key);
        if (t) {
          mapped.push({ teamId: t.id, name: t.name, points: s.points, espnTeamId: s.espnTeamId });
        } else {
          missing.push(s); // ESPN team without a match in your DB
        }
      }
    }

    res.status(200).json({ season, week, leagueId, scores: espnScores, mapped, missing });
  } catch (err) {
    console.error('espn endpoint error:', err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}

