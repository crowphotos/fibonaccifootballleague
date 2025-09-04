// api/espn-teams.js
function buildHeaders(cookies) {
  const h = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': 'https://fantasy.espn.com/'
  };
  if (cookies) h['Cookie'] = cookies;
  return h;
}

async function fetchEspnJson(url, cookies) {
  const r = await fetch(url, { headers: buildHeaders(cookies) });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const body = await r.text().catch(() => '');
    return { ok: false, status: r.status, error: 'ESPN did not return JSON', contentType: ct, bodySnippet: body.slice(0, 400) };
  }
  try {
    const data = await r.json();
    if (!r.ok) return { ok: false, status: r.status, error: 'ESPN returned non-200 with JSON', data };
    return { ok: true, status: r.status, data };
  } catch (e) {
    const body = await r.text().catch(() => '');
    return { ok: false, status: r.status, error: String(e?.message || e), contentType: ct, bodySnippet: body.slice(0, 400) };
  }
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const season = Number(url.searchParams.get('season')) || Number(process.env.ESPN_SEASON) || new Date().getFullYear();
    const leagueId = 708357460;

    const espnUrl = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam`;
    const cookies = (process.env.ESPN_SWID && process.env.ESPN_S2) ? `SWID=${process.env.ESPN_SWID}; ESPN_S2=${process.env.ESPN_S2}` : '';

    const out = await fetchEspnJson(espnUrl, cookies);
    if (!out.ok) return res.status(out.status || 502).json({ source: 'espn', ...out });

    const teams = (out.data?.teams || []).map(t => ({
      espnTeamId: t.id,
      name: (t.location && t.nickname) ? `${t.location} ${t.nickname}` : (t.name || `Team ${t.id}`),
      abbrev: t.abbrev || ''
    })).sort((a,b)=> a.espnTeamId - b.espnTeamId);

    res.status(200).json({ season, leagueId, teams });
  } catch (err) {
    console.error('espn-teams error:', err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}

