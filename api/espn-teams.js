// api/espn-teams.js
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const season = Number(url.searchParams.get('season')) || Number(process.env.ESPN_SEASON) || new Date().getFullYear();
    const leagueId = 708357460;

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

    const teams = (data?.teams || []).map(t => ({
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

