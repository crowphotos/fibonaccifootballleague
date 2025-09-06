// api/week.js
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { withCors } from './cors.js';

const WEEK_POINTS = [8, 5, 3, 2, 1];

/** average-of-places for ties (same logic as /api/calc, but read-only) */
function rankAndPoints(pairs) {
  // pairs: [{ pairIndex, sum }]
  const sorted = [...pairs].sort((a, b) => b.sum - a.sum);

  // Assign ranks (1-based) with ties (same sum -> same rank)
  const ranks = new Map();      // pairIndex -> rank
  const points = new Map();     // pairIndex -> computed points
  let i = 0, place = 0;         // place is 0-based index into WEEK_POINTS
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].sum === sorted[i].sum) j++;
    const count = j - i;
    const avgPts = WEEK_POINTS.slice(place, place + count).reduce((a, b) => a + b, 0) / count;
    for (let k = i; k < j; k++) {
      ranks.set(sorted[k].pairIndex, place + 1);     // 1-based rank
      points.set(sorted[k].pairIndex, avgPts);
    }
    place += count;
    i = j;
  }
  return { ranks, points };
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  await ensureSchema();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const weekParam = url.searchParams.get('week');

  let week = Number(weekParam);
  if (!Number.isFinite(week) || week < 0 || week > 17) {
    // Default to the most recent week we have (awards, else scores, else 0)
    const a = await sql`SELECT MAX(week) AS w FROM awards`;
    const s = await sql`SELECT MAX(week) AS w FROM scores`;
    const wa = a.rows[0]?.w;
    const ws = s.rows[0]?.w;
    week = Number.isFinite(wa) ? wa : (Number.isFinite(ws) ? ws : 0);
  }

  // Get schedule for the week (5 pairs expected)
  const sched = (await sql`
    SELECT pair_index, team_a, team_b
    FROM schedule
    WHERE week = ${week}
    ORDER BY pair_index ASC
  `).rows;

  if (sched.length === 0) {
    return res.status(200).json({
      week,
      pairs: [],
      awardsApplied: false,
      note: 'No schedule for this week.'
    });
  }

  // Get all teams (simpler than IN (...) juggling)
  const teams = (await sql`SELECT id, name FROM teams ORDER BY id ASC`).rows;
  const nameById = new Map(teams.map(t => [t.id, t.name]));

  // Scores & awards
  const scoresRows = (await sql`SELECT team_id, score FROM scores WHERE week = ${week}`).rows;
  const awardsRows = (await sql`SELECT team_id, points FROM awards WHERE week = ${week}`).rows;
  const scoreById = new Map(scoresRows.map(r => [r.team_id, Number(r.score) || 0]));
  const awardById = new Map(awardsRows.map(r => [r.team_id, Number(r.points) || 0]));

  // Build pairs with sums
  const pairs = sched.map(row => {
    const aScore = scoreById.get(row.team_a) ?? 0;
    const bScore = scoreById.get(row.team_b) ?? 0;
    return {
      pairIndex: row.pair_index,
      sum: (aScore || 0) + (bScore || 0),
      teams: [
        { id: row.team_a, name: nameById.get(row.team_a) || `Team ${row.team_a}`, score: aScore || 0 },
        { id: row.team_b, name: nameById.get(row.team_b) || `Team ${row.team_b}`, score: bScore || 0 }
      ]
    };
  });

  // Compute ranks & computed points
  const { ranks, points: computedPoints } = rankAndPoints(pairs);

  // Attach awarded points if present (we treat pair’s awarded points as team_a’s award)
  let awardsApplied = true;
  const enriched = pairs.map(p => {
    const awarded = awardById.has(p.teams[0].id) && awardById.has(p.teams[1].id)
      ? Number(awardById.get(p.teams[0].id))
      : null;
    if (awarded === null) awardsApplied = false;
    return {
      pairIndex: p.pairIndex,
      rank: ranks.get(p.pairIndex),
      sum: p.sum,
      pointsAwarded: awarded,
      pointsComputed: Number(computedPoints.get(p.pairIndex)),
      teams: p.teams
    };
  });

  // Sort by rank asc for display
  enriched.sort((a, b) => a.rank - b.rank);

  res.status(200).json({
    week,
    pairs: enriched,
    awardsApplied
  });
}

export default withCors(handler);

