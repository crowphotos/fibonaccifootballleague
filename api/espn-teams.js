// api/espn-teams.js
const LEAGUE_ID = Number(process.env.ESPN_LEAGUE_ID || 708357460);
import { withCors } from './cors.js';

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
  const url = new URL(req.url, `http://${req.headers.host}`);
  const season = Number(url.searchParams.get('season')) || Number(process.env.ESPN_SEASON) || new Date().getFullYear();

  const urls = [
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=mTeam`,
    `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=mTeam`
  ];
  const cookies = (process.env.ESPN_SWID && process.env.ESPN_S2)
    ? `SWID=${process.env.ESPN_SWID}; ESPN_S2=${process.env.ESPN_S2}`
    : '';

  let lastErr = null;
  for (const u of urls) {
    const out = await tryJson(u, cookies);
    if (out.ok) {
      const teams = (out.data?.teams || []).map(t => ({
        espnTeamId: t.id,
        name: (t.location && t.nickname) ? `${t.location} ${t.nickname}` : (t.name || `Team ${t.id}`),
        abbrev: t.abbrev || ''
      })).sort((a,b)=> a.espnTeamId - b.espnTeamId);
      return res.status(200).json({ season, leagueId: LEAGUE_ID, host: new URL(out.url).host, teams });
    }
    lastErr = out;
  }

  return res.status(lastErr?.status || 502).json({
    source: 'espn',
    ok: false,
    season,
    leagueId: LEAGUE_ID,
    tried: urls,
    ...lastErr,
    hint: 'HTML content indicates login/interstitial. Ensure cookies belong to a member of this private league.'
  });
}

export default withCors(handler);

