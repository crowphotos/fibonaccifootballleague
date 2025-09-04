import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(200).end();
    }
    if (req.method !== 'GET') return res.status(405).end();

    await ensureSchema();
    res.setHeader('Access-Control-Allow-Origin', '*');

    const latest = await sql`SELECT MAX(week) AS w FROM awards`;
    const latestWeek = latest.rows[0]?.w ?? null;

    const q = await sql`
      SELECT
        t.id,
        t.name,
        t.espn_id AS "espnId",
        COALESCE((SELECT SUM(points) FROM awards a WHERE a.team_id = t.id), 0) AS "seasonPts",
        COALESCE((SELECT SUM(score) FROM scores s WHERE s.team_id = t.id), 0) AS "rawSum",
        COALESCE((SELECT COUNT(*) FROM awards a WHERE a.team_id = t.id), 0) AS "played",
        (
          SELECT points FROM awards a2
          WHERE a2.team_id = t.id
          AND a2.week = (SELECT MAX(week) FROM awards a3 WHERE a3.team_id = t.id)
        ) AS "lastWeek"
      FROM teams t
      ORDER BY "seasonPts" DESC, "rawSum" DESC, t.name ASC
    `;

    res.status(200).json({ latestWeek, rows: q.rows });
  } catch (err) {
    console.error('standings error:', err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}

