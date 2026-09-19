import { getSeason } from '../lib/season.js';
// api/scores.js
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { requireAdmin } from './auth.js';
import { withCors } from './cors.js';

async function handler(req, res) {
  await ensureSchema();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const season = getSeason(url, res);
  if (season === null) return;
  const week = Number(url.searchParams.get('week'));

  if (req.method === 'GET') {
    const r = await sql`SELECT team_id AS "teamId", score FROM scores WHERE season = ${season} AND week = ${week}`;
    return res.status(200).json(r.rows);
  }

  if (req.method === 'PUT') {
    try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }
    const payload = req.body || {};
    await sql`DELETE FROM scores WHERE season = ${season} AND week = ${week}`;
    for (const [teamId, score] of Object.entries(payload)) {
      await sql`INSERT INTO scores (season, week, team_id, score) VALUES (${season}, ${week}, ${Number(teamId)}, ${Number(score)})`;
    }
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}

export default withCors(handler);

