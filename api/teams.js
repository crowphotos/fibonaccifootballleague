import { getSeason } from '../lib/season.js';
// api/teams.js
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { requireAdmin } from './auth.js';
import { withCors } from './cors.js';

async function handler(req, res) {
  await ensureSchema();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const season = getSeason(url, res);
  if (season === null) return;
  const method = req.method;

  if (method === 'GET') {
    const r = await sql`SELECT id, name, espn_id AS "espnId" FROM teams WHERE season = ${season} ORDER BY id ASC`;
    return res.status(200).json(r.rows);
  }

  if (method === 'POST') {
    try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }
    const { name, espnId } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await sql`
      INSERT INTO teams (season, name, espn_id) VALUES (${season}, ${name}, ${espnId || null})
      RETURNING id, name, espn_id AS "espnId"
    `;
    return res.status(200).json(r.rows[0]);
  }

  if (method === 'PUT') {
    try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }
    const { id, name, espnId } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    await sql`UPDATE teams SET name = COALESCE(${name}, name), espn_id = ${espnId || null} WHERE season = ${season} AND id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  if (method === 'DELETE') {
    try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }

    const id = Number(url.searchParams.get('id'));
    if (!id) return res.status(400).json({ error: 'id required' });
    await sql`DELETE FROM teams WHERE season = ${season} AND id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}

export default withCors(handler);

