// api/espn.js
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';

const LEAGUE_ID = Number(process.env.ESPN_LEAGUE_ID || 708357460);

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

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const season = Number(url.searchParams.get('season')) || Number(process.env.ESPN_SEASON) || new Date().getFullYear();
    const week = Number(url.searchParams.get('week') || 1);
    const mapParam = url.searchParams.get('map');

    if (!Number.isFinite(week) || week < 1 || week > 18) {
      return res.status(400).json({ error: 'Invalid week. Use 1..18 (ESPN is 1-based).' });
    }

    const endpoints = [
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=mBoxscore&scoringPeriodId=${week}`,
      `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=mBoxscore&scoringPeriodId=${week}`
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
        leagueId: LEAGUE_ID,
        tried: endpoints,
        ...lastErr,
        hint: 'HTML content indicates login/interstitial. Ensure cookies belong to a member of this private league.'
      });
    }

    const matchups = Array.isArray(success.data?.schedule) ? success.data.schedule : [];
    const espnScores = [];
    for (const m of matchups) {
      if (m?.home?.teamId != null && m?.home?.totalPoints != null) {
        espnScores.push({ espnTeamId: m.home.teamId, points: m.home.totalPoints });
      }
      if (m?.away?.teamId != null && m?.away?.totalPoints != null) {
        espnScores.push({ espnTeamId: m.away.teamId, points: m.away.totalPoints });
      }
    }

    if (mapParam === '1') {
      await ensureSchema();
      const teams = (await sql`SELECT id, name, espn_id AS "espnId" FROM teams ORDER BY id ASC`).rows;
      const byEspn = new Map(teams.map(t => [String(t.espnId ?? '').trim(), t]));
      const mapped = [];
      const missing = [];
      for (const s of espnScores) {
        const hit = byEspn.get(String(s.espnTeamId));
        if (hit) mapped.push({ teamId: hit.id, name: hit.name, points: s.points, espnTeamId: s.espnTeamId });
        else missing.push(s);
      }
      return res.status(200).json({ season, week, leagueId: LEAGUE_ID, host: new URL(success.url).host, scores: espnScores, mapped, missing });
    }

    res.status(200).json({ season, week, leagueId: LEAGUE_ID, host: new URL(success.url).host, scores: espnScores });
  } catch (err) {
    console.error('espn endpoint error:', err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}

