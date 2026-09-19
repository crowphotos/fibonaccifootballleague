import { getSeason } from '../lib/season.js';
// api/standings.js
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { withCors } from './cors.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  await ensureSchema();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const season = getSeason(url, res);
  if (season === null) return;

  const latest = await sql`SELECT MAX(week) AS w FROM awards WHERE season = ${season}`;
  const latestWeek = latest.rows[0]?.w ?? null;

  const q = await sql`
    SELECT
      t.id,
      t.name,
      t.espn_id AS "espnId",
      COALESCE((SELECT SUM(points) FROM awards a WHERE a.season = ${season} AND a.team_id = t.id), 0) AS "seasonPts",
      COALESCE((SELECT SUM(score) FROM scores s WHERE s.season = ${season} AND s.team_id = t.id), 0) AS "rawSum",
      COALESCE((SELECT COUNT(*) FROM awards a WHERE a.season = ${season} AND a.team_id = t.id), 0) AS "played",
      (
        SELECT points FROM awards a2
        WHERE a2.season = ${season} AND a2.team_id = t.id
        AND a2.week = (SELECT MAX(week) FROM awards a3 WHERE a3.season = ${season} AND a3.team_id = t.id)
      ) AS "lastWeek"
    FROM teams t WHERE t.season = ${season}
    ORDER BY "seasonPts" DESC, "rawSum" DESC, t.name ASC
  `;
  res.status(200).json({ season, latestWeek, rows: q.rows });
}

export default withCors(handler);

