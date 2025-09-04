import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { requireAdmin } from './auth.js';

const TOTAL_WEEKS = 18;

function roundRobin(ids) {
  const n = ids.length;
  const arr = [...ids];
  const fixed = arr[0];
  let rot = arr.slice(1);
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const left = [fixed].concat(rot.slice(0, (n / 2) - 1));
    const right = rot.slice((n / 2) - 1).reverse();
    const pairs = [];
    for (let i = 0; i < n / 2; i++) pairs.push({ a: left[i], b: right[i] });
    rounds.push(pairs);
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  return rounds;
}

function doubleRoundRobin(ids) {
  const base = roundRobin(ids);
  const swapped = base.map(r => r.map(p => ({ a: p.b, b: p.a })));
  return base.concat(swapped).slice(0, TOTAL_WEEKS);
}

export default async function handler(req, res) {
  await ensureSchema();
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET') {
    const week = Number(url.searchParams.get('week'));
    const r = await sql`
      SELECT pair_index AS "pairIndex", team_a AS "teamA", team_b AS "teamB"
      FROM schedule WHERE week = ${week}
      ORDER BY pair_index ASC
    `;
    return res.status(200).json(r.rows);
  }

  if (req.method === 'PUT') {
    try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }
    const week = Number(url.searchParams.get('week'));
    const pairs = Array.isArray(req.body) ? req.body : [];
    await sql.begin(async (trx) => {
      await trx`DELETE FROM schedule WHERE week = ${week}`;
      for (let i = 0; i < pairs.length; i++) {
        const { teamA, teamB } = pairs[i];
        if (teamA === teamB) throw new Error('Pair teams must be different');
        await trx`INSERT INTO schedule (week, pair_index, team_a, team_b) VALUES (${week}, ${i}, ${teamA}, ${teamB})`;
      }
    });
    return res.status(200).json({ ok: true, saved: pairs.length });
  }

  if (req.method === 'POST') {
    try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }
    const generate = url.searchParams.get('generate');
    if (!generate) return res.status(400).json({ error: 'missing ?generate=1' });

    const teams = await sql`SELECT id FROM teams ORDER BY id ASC`;
    if (teams.rows.length !== 10) return res.status(400).json({ error: 'Exactly 10 teams required' });
    const ids = teams.rows.map(r => r.id);
    const sched = doubleRoundRobin(ids);
    await sql.begin(async (trx) => {
      for (let w = 0; w < sched.length; w++) {
        const pairs = sched[w];
        await trx`DELETE FROM schedule WHERE week = ${w}`;
        for (let i = 0; i < pairs.length; i++) {
          await trx`INSERT INTO schedule (week, pair_index, team_a, team_b) VALUES (${w}, ${i}, ${pairs[i].a}, ${pairs[i].b})`;
        }
      }
    });
    return res.status(200).json({ ok: true, weeks: sched.length });
  }

  res.status(405).end();
}

