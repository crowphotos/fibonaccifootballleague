import { parseScheduleScores } from '../lib/espn-scores.js';
import { ensureSchema } from './db.js';
import { getSeason } from '../lib/season.js';
// api/espn.js
import { sql } from '@vercel/postgres';
import { withCors } from './cors.js';

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

async function fetchJson(url, cookies) {
  let r;
  try {
    r = await fetch(url, { headers: buildHeaders(cookies), redirect: 'follow', signal: AbortSignal.timeout(5000) });
  } catch {
    return { ok: false, error: 'ESPN could not be reached. Please try again.' };
  }
  const ct = r.headers.get('content-type') || '';
  const text = await r.text().catch(() => '');
  if (!r.ok || !ct.includes('application/json')) {
    return { ok: false, status: r.status, url: r.url || url, contentType: ct, bodySnippet: text.slice(0, 800) };
  }
  try {
    return { ok: true, status: r.status, url: r.url || url, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, status: r.status, url: r.url || url, error: String(e?.message || e), bodySnippet: text.slice(0, 800) };
  }
}

async function fetchWeekScores({ season, week, cookies }) {
  const hosts = ['https://lm-api-reads.fantasy.espn.com', 'https://fantasy.espn.com'];
  const views = ['mMatchupScore'];
  const paramCombos = [
    (h,v) => `${h}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=${v}&scoringPeriodId=${week}`
  ];

  let last = null;
  for (const host of hosts) {
    for (const view of views) {
      for (const make of paramCombos) {
        const url = make(host, view);
        const r = await fetchJson(url, cookies);
        if (!r.ok) {
          if (r.status === 401 || r.status === 403) return { ok: false, error: 'ESPN denied access. Check the ESPN_S2 and ESPN_SWID cookies configured for this league.' };
          last = { ...r, view }; continue;
        }
        const schedule = r.data?.schedule;
        if (!Array.isArray(schedule)) { last = { ok:false, error:'No schedule[]', url, view }; continue; }

        const scores = parseScheduleScores(schedule, week);
        if (scores.length) {
          return { ok: true, host: new URL(r.url).host, view, url, scores };
        }
        // keep trying
        last = { ok:false, error:'No scores available for the selected ESPN season and week', url, view };
      }
    }
  }
  return { ok:false, ...last };
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const season = getSeason(url, res);
  if (season === null) return;
  await ensureSchema();
  const espnWeek = Number(url.searchParams.get('week'));
  const mapFlag  = url.searchParams.get('map') === '1';

  if (!Number.isInteger(espnWeek) || espnWeek < 1 || espnWeek > 18) {
    return res.status(400).json({ error: 'Missing or invalid ?week= (ESPN uses 1..18)' });
  }

  const cookies = (process.env.ESPN_SWID && process.env.ESPN_S2)
    ? `SWID=${process.env.ESPN_SWID}; ESPN_S2=${process.env.ESPN_S2}`
    : '';

  const pulled = await fetchWeekScores({ season, week: espnWeek, cookies });
  if (!pulled.ok) {
    return res.status(200).json({
      source: 'espn',
      ok: false,
      season, week: espnWeek,
      error: pulled.error || 'No usable JSON from ESPN',
      details: pulled.bodySnippet || pulled.contentType || pulled.view || pulled.url || null
    });
  }

  const payload = {
    source: 'espn',
    ok: true,
    season,
    week: espnWeek,
    host: pulled.host,
    view: pulled.view,
    scores: pulled.scores
  };

  if (mapFlag) {
    const teams = (await sql`SELECT id, name, espn_id AS "espnId" FROM teams WHERE season = ${season} ORDER BY id ASC`).rows;
    const byEspn = new Map(teams.map(t => [String(t.espnId ?? '').trim(), t]));
    const mapped = [];
    const missing = [];
    for (const s of pulled.scores) {
      const t = byEspn.get(String(s.espnTeamId));
      if (t) mapped.push({ teamId: t.id, name: t.name, points: s.points, espnTeamId: s.espnTeamId });
      else missing.push({ espnTeamId: s.espnTeamId, points: s.points });
    }
    payload.mapped = mapped;
    payload.missing = missing;
  }

  res.status(200).json(payload);
}

export default withCors(handler);

