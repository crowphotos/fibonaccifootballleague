// api/calc.js
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { requireAdmin } from './auth.js';
import { withCors } from './cors.js';

const WEEK_POINTS = [8, 5, 3, 2, 1];

async function handler(req, res) {
  await ensureSchema();
  if (req.method !== 'POST') return res.status(405).end();
  try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const week = Number(url.searchParams.get('week'));

  const pairs = (await sql`
    SELECT pair_index, team_a, team_b
    FROM schedule WHERE week = ${week}
    ORDER BY pair_index ASC
  `).rows;
  if (pairs.length === 0) return res.status(400).json({ error: 'No schedule for this week' });

  const scoresRows = (await sql`
    SELECT team_id, score FROM scores WHERE week = ${week}
  `).rows;
  const scores = new Map(scoresRows.map(r => [r.team_id, r.score]));

  const sums = pairs.map(p => {
    const aScore = scores.get(p.team_a) ?? 0;
    const bScore = scores.get(p.team_b) ?? 0;
    return { pairIndex: p.pair_index, a: p.team_a, b: p.team_b, sum: (aScore || 0) + (bScore || 0) };
  }).sort((x, y) => y.sum - x.sum);

  // Average-of-places tie handling
  const awards = new Map();
  let i = 0, place = 0;
  while (i < sums.length) {
    let j = i + 1;
    while (j < sums.length && sums[j].sum === sums[i].sum) j++;
    const count = j - i;
    const avg = WEEK_POINTS.slice(place, place + count).reduce((a, b) => a + b, 0) / count;
    for (let k = i; k < j; k++) awards.set(sums[k].pairIndex, avg);
    place += count;
    i = j;
  }

  await sql.begin(async (trx) => {
    await trx`DELETE FROM awards WHERE week = ${week}`;
    for (const p of pairs) {
      const pts = awards.get(p.pair_index) ?? 0;     // ← bugfix here
      await trx`INSERT INTO awards (week, team_id, points) VALUES (${week}, ${p.team_a}, ${pts})`;
      await trx`INSERT INTO awards (week, team_id, points) VALUES (${week}, ${p.team_b}, ${pts})`;
    }
  });

  res.status(200).json({ ok: true });
}

export default withCors(handler);

