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
    return { ok: false, status: r.status, url: r.url || url, contentType: ct, bodySnippet: text.slice(0, 800) };
  }
  try {
    return { ok: true, status: r.status, url: r.url || url, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, status: r.status, url: r.url || url, error: String(e?.message || e), bodySnippet: text.slice(0, 800) };
  }
}

function N(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }

function sumPlayerWeekStats(side, week) {
  // Look through roster entries -> player.stats for the specific scoringPeriodId
  const entries = side?.rosterForCurrentScoringPeriod?.entries || side?.rosterForMatchupPeriod?.entries || [];
  let sum = 0, any = false;
  for (const e of entries) {
    // Common places for applied totals:
    const a = N(e?.appliedTotal);
    if (a != null) { sum += a; any = true; continue; }

    const b = N(e?.playerPoolEntry?.appliedStatTotal);
    if (b != null) { sum += b; any = true; continue; }

    const stats = e?.playerPoolEntry?.player?.stats;
    if (Array.isArray(stats)) {
      const s = stats.find(s => s?.scoringPeriodId === week && (s?.statSourceId === 0 || s?.statSourceId == null));
      const v = N(s?.appliedTotal ?? s?.appliedStatTotal);
      if (v != null) { sum += v; any = true; continue; }
    }
  }
  if (any) return sum;

  // Some shapes put a whole-period total here
  const whole = N(side?.rosterForCurrentScoringPeriod?.appliedStatTotal ?? side?.rosterForMatchupPeriod?.appliedStatTotal);
  return whole != null ? whole : 0;
}

function extractSidePoints(side, week) {
  // Try common total fields first
  const cand =
    N(side?.totalPoints) ??
    N(side?.totalPointsLive) ??
    N(side?.score) ??
    N(side?.cumulativeScore) ??
    (side?.pointsByScoringPeriod && N(side.pointsByScoringPeriod[week]));
  if (cand != null) return cand;

  // Fallback: sum the roster entries for the exact scoring period
  return sumPlayerWeekStats(side, week) || 0;
}

function parseScheduleScores(schedule, week) {
  const out = [];
  for (const g of (schedule || [])) {
    const homeId = g?.home?.teamId ?? g?.home?.team?.id ?? g?.home?.team?.teamId;
    const awayId = g?.away?.teamId ?? g?.away?.team?.id ?? g?.away?.team?.teamId;
    if (!Number.isFinite(homeId) || !Number.isFinite(awayId)) continue;
    const homePts = extractSidePoints(g.home, week);
    const awayPts = extractSidePoints(g.away, week);
    out.push({ espnTeamId: Number(homeId), points: homePts });
    out.push({ espnTeamId: Number(awayId), points: awayPts });
  }
  return out;
}

async function fetchWeekScores({ season, week, cookies, debug }) {
  // Try both hosts and both parameter styles:
  //  - scoringPeriodId=week (NFL week 1..18)
  //  - matchupPeriodId=week (league matchup week 1..N; often same but not always)
  const hosts = ['https://lm-api-reads.fantasy.espn.com', 'https://fantasy.espn.com'];
  const views  = ['mMatchupScore', 'mScoreboard', 'mBoxscore'];
  const paramCombos = [
    (h,v) => `${h}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=${v}&scoringPeriodId=${week}`,
    (h,v) => `${h}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=${v}&matchupPeriodId=${week}`,
    (h,v) => `${h}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=${v}&scoringPeriodId=${week}&matchupPeriodId=${week}`
  ];

  let last = null;
  for (const host of hosts) {
    for (const view of views) {
      for (const make of paramCombos) {
        const url = make(host, view);
        const r = await fetchJson(url, cookies);
        if (!r.ok) { last = { ...r, view }; continue; }
        const schedule = r.data?.schedule;
        if (!Array.isArray(schedule)) { last = { ok:false, error:'No schedule[]', url, view }; continue; }

        const scores = parseScheduleScores(schedule, week);
        const nonZero = scores.some(s => Number.isFinite(s.points) && s.points !== 0);
        if (nonZero) {
          return { ok: true, host: new URL(r.url).host, view, url, scores, tried: debug ? undefined : undefined };
        }
        // keep trying
        last = { ok:false, error:'All-zero after parse', url, view };
      }
    }
  }
  return { ok:false, ...last };
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const season = Number(url.searchParams.get('season')) || Number(process.env.ESPN_SEASON) || new Date().getFullYear();
  const espnWeek = Number(url.searchParams.get('week'));
  const mapFlag  = url.searchParams.get('map') === '1';
  const debug    = url.searchParams.get('debug') === '1';

  if (!Number.isFinite(espnWeek) || espnWeek < 1 || espnWeek > 18) {
    return res.status(400).json({ error: 'Missing or invalid ?week= (ESPN uses 1..18)' });
  }

  const cookies = (process.env.ESPN_SWID && process.env.ESPN_S2)
    ? `SWID=${process.env.ESPN_SWID}; ESPN_S2=${process.env.ESPN_S2}`
    : '';

  const pulled = await fetchWeekScores({ season, week: espnWeek, cookies, debug });
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

