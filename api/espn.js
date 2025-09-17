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
  const r = await fetch(url, { headers: buildHeaders(cookies), redirect: 'follow' });
  const ct = r.headers.get('content-type') || '';
  const text = await r.text().catch(() => '');
  if (!ct.includes('application/json')) {
    return { ok: false, status: r.status, url: r.url || url, contentType: ct, bodySnippet: text.slice(0, 500) };
  }
  try {
    return { ok: true, status: r.status, url: r.url || url, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, status: r.status, url: r.url || url, error: String(e?.message || e), bodySnippet: text.slice(0, 500) };
  }
}

function tryNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract team points from a schedule item’s side (home/away) object, trying
 * multiple common ESPN fields and finally summing roster entries if needed.
 */
function extractTeamPoints(side) {
  if (!side) return 0;

  // 1) Common total fields seen across views
  const cand =
    tryNumber(side.totalPoints) ??
    tryNumber(side.totalPointsLive) ??
    tryNumber(side.score) ??
    tryNumber(side.cumulativeScore);
  if (cand != null) return cand;

  // 2) Some leagues expose a period-specific object
  //    side.pointsByScoringPeriod?.[scoringPeriodId] could exist in some views (rare).
  //    We don't have scoringPeriodId here; if a single value exists, use it.
  if (side.pointsByScoringPeriod && typeof side.pointsByScoringPeriod === 'object') {
    const vals = Object.values(side.pointsByScoringPeriod).map(tryNumber).filter(v => v != null);
    if (vals.length === 1) return vals[0];
  }

  // 3) mBoxscore: sum roster entries if available
  //    Typical shapes:
  //      side.rosterForCurrentScoringPeriod.entries[].appliedTotal
  //      side.rosterForCurrentScoringPeriod.entries[].playerPoolEntry.appliedStatTotal
  //      side.rosterForCurrentScoringPeriod.appliedStatTotal (rare, sometimes present)
  const rfcsp = side.rosterForCurrentScoringPeriod;
  if (rfcsp) {
    const whole = tryNumber(rfcsp.appliedStatTotal);
    if (whole != null) return whole;

    const entries = Array.isArray(rfcsp.entries) ? rfcsp.entries : [];
    let sum = 0, any = false;
    for (const e of entries) {
      const a = tryNumber(e?.appliedTotal);
      const b = tryNumber(e?.playerPoolEntry?.appliedStatTotal);
      const v = a ?? b;
      if (v != null) { sum += v; any = true; }
    }
    if (any) return sum;
  }

  // 4) Fallback: 0
  return 0;
}

/** Parse scores from an ESPN 'schedule' array (works for multiple views). */
function parseScoresFromSchedule(schedule) {
  const out = [];
  for (const g of (schedule || [])) {
    const homeId = g?.home?.teamId ?? g?.home?.team?.id ?? g?.home?.team?.teamId;
    const awayId = g?.away?.teamId ?? g?.away?.team?.id ?? g?.away?.team?.teamId;
    if (!Number.isFinite(homeId) || !Number.isFinite(awayId)) continue;

    const homePts = extractTeamPoints(g.home);
    const awayPts = extractTeamPoints(g.away);
    out.push({ espnTeamId: Number(homeId), points: homePts });
    out.push({ espnTeamId: Number(awayId), points: awayPts });
  }
  return out;
}

/**
 * Try multiple ESPN "views" because different leagues/formats expose totals in different ones.
 * Order is chosen for the most direct totals first, then heavier boxscore.
 */
async function fetchWeekScores({ season, espnWeek, cookies }) {
  const hosts = [
    'https://lm-api-reads.fantasy.espn.com',
    'https://fantasy.espn.com'
  ];
  const views = [
    'mMatchupScore',  // often has home.totalPoints
    'mScoreboard',    // often has home.score
    'mBoxscore'       // requires roster sum fallback sometimes
  ];

  let lastErr = null;
  for (const host of hosts) {
    for (const view of views) {
      const url = `${host}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=${view}&scoringPeriodId=${espnWeek}`;
      const r = await fetchJson(url, cookies);
      if (!r.ok) { lastErr = r; continue; }

      const schedule = r.data?.schedule;
      if (!Array.isArray(schedule)) { lastErr = { ok: false, error: 'No schedule array in JSON', url }; continue; }

      const scores = parseScoresFromSchedule(schedule);

      // If at least one non-zero or (non-null number) is present, accept.
      if (scores.some(s => Number.isFinite(s.points) && s.points !== 0)) {
        return { ok: true, host: new URL(r.url).host, view, scores };
      }

      // If all zeros, keep trying other views/hosts before giving up.
      lastErr = { ok: false, error: 'All-zero totals from this view', url, view };
    }
  }
  return { ok: false, ...lastErr };
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const season = Number(url.searchParams.get('season')) || Number(process.env.ESPN_SEASON) || new Date().getFullYear();
  const weekParam = url.searchParams.get('week');
  const mapFlag = url.searchParams.get('map') === '1';

  // ESPN uses week 1..18; our admin UI already adds +1 when calling this route.
  const espnWeek = Number(weekParam);
  if (!Number.isFinite(espnWeek) || espnWeek < 1 || espnWeek > 18) {
    return res.status(400).json({ error: 'Missing or invalid ?week= (ESPN uses 1..18)' });
  }

  const cookies = (process.env.ESPN_SWID && process.env.ESPN_S2)
    ? `SWID=${process.env.ESPN_SWID}; ESPN_S2=${process.env.ESPN_S2}`
    : '';

  const pulled = await fetchWeekScores({ season, espnWeek, cookies });
  if (!pulled.ok) {
    return res.status(200).json({
      source: 'espn',
      ok: false,
      season, week: espnWeek,
      error: pulled.error || 'ESPN did not return usable JSON',
      details: pulled.bodySnippet || pulled.contentType || pulled.view || pulled.url || null
    });
  }

  let payload = {
    source: 'espn',
    ok: true,
    season,
    week: espnWeek,
    host: pulled.host,
    view: pulled.view,
    scores: pulled.scores
  };

  if (mapFlag) {
    // Map ESPN teamId -> local team via teams.espn_id
    const teams = (await sql`SELECT id, name, espn_id AS "espnId" FROM teams ORDER BY id ASC`).rows;
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

