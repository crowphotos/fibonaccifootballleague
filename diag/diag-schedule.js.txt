// api/diag-schedule.js
import { sql } from '@vercel/postgres';
import { withCors } from './cors.js';

async function handler(req, res) {
  try {
    const teams = (await sql`SELECT id, name FROM teams ORDER BY id`).rows;
    const teamIds = new Set(teams.map(t => t.id));
    const report = [];
    for (let w = 0; w < 18; w++) {
      const rows = (await sql`
        SELECT pair_index, team_a, team_b
        FROM schedule WHERE week = ${w} ORDER BY pair_index
      `).rows;

      const seen = new Map(); // teamId -> count within week
      rows.forEach(r => {
        seen.set(r.team_a, (seen.get(r.team_a)||0)+1);
        seen.set(r.team_b, (seen.get(r.team_b)||0)+1);
      });
      const duplicates = [...seen.entries()].filter(([_,c])=>c>1).map(([id,c])=>({id, count:c}));
      const unknownTeams = [...seen.keys()].filter(id => !teamIds.has(id));

      report.push({
        week: w,
        pairCount: rows.length,
        uniqueTeams: seen.size,
        duplicates,           // any team appearing twice in the same week
        unknownTeams,         // team ids not found in teams table
        ok: rows.length === 5 && seen.size === 10 && duplicates.length === 0 && unknownTeams.length === 0
      });
    }
    const summary = {
      totalWeeks: 18,
      weeksWith5Pairs: report.filter(r=>r.pairCount===5).length,
      weeksOk: report.filter(r=>r.ok).length
    };
    res.status(200).json({ summary, teams: teams.length, report });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
export default withCors(handler);

