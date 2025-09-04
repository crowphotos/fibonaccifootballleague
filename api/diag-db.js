import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  try {
    const out = await sql`select 1 as ok`;
    res.status(200).json({ ok: true, result: out.rows[0] });
  } catch (err) {
    console.error('diag-db error:', err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

