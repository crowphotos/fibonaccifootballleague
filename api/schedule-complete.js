// api/schedule-complete.js
import { sql } from '@vercel/postgres';
import { ensureSchema } from './db.js';
import { requireAdmin } from './auth.js';
import { withCors } from './cors.js';

const TOTAL_WEEKS = 18;

function key(u, v) {
  return u < v ? `${u}-${v}` : `${v}-${u}`;
}

// Build a count matrix of how many more times each unordered pair must occur (target = 2)
function buildRemainingCounts(teamIds, scheduledPairsSoFar) {
  // Initialize to 2 for every unordered pair
  const remaining = new Map();
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      remaining.set(key(teamIds[i], teamIds[j]), 2);
    }
  }
  // Subtract what has already been scheduled
  for (const { teamA, teamB } of scheduledPairsSoFar) {
    const k = key(teamA, teamB);
    remaining.set(k, (remaining.get(k) ?? 0) - 1);
  }
  // Keep only pairs that still need at least 1 more meeting
  for (const [k2, cnt] of [...remaining.entries()]) {
    if (cnt <= 0) remaining.delete(k2);
  }
  return remaining;
}

// Make a fast lookup: team -> Set of opponents still needed (with multiplicity)
function countsToAdj(teamIds, remaining) {
  const adj = new Map(teamIds.map(id => [id, new Map()])); // id -> Map(opponentId -> count)
  for (const [k, c] of remaining.entries()) {
    const [a, b] = k.split('-').map(Number);
    adj.get(a).set(b, c);
    adj.get(b).set(a, c);
  }
  return adj;
}

// Pick next team to pair this week: the one with the fewest available opponents (to reduce branching)
function pickTeamWithFewestOptions(adj, usedThisWeek) {
  let best = null, bestOptions = Infinity;
  for (const [t, map] of adj.entries()) {
    if (usedThisWeek.has(t)) continue;
    // count opponents not used this week and with positive count
    let opts = 0;
    for (const [opp, c] of map.entries()) {
      if (c > 0 && !usedThisWeek.has(opp)) opts++;
    }
    if (opts < bestOptions) { bestOptions = opts; best = t; }
  }
  return best;
}

// Try to build one week’s perfect matching (5 pairs) by backtracking
function buildOneWeek(adj, teamIds) {
  const used = new Set();
  const pairs = [];

  function step() {
    if (pairs.length === teamIds.length / 2) return true; // 5 pairs
    const t = pickTeamWithFewestOptions(adj, used);
    if (t == null) return false;

    // Try all available opponents
    const candidates = [];
    for (const [opp, c] of adj.get(t).entries()) {
      if (c > 0 && !used.has(opp) && !used.has(t)) candidates.push(opp);
    }
    // Heuristic: sort candidates by their own availability (fewest options first)
    candidates.sort((a, b) => {
      const aOpts = [...adj.get(a).entries()].filter(([o, c]) => c > 0 && !used.has(o) && o !== t).length;
      const bOpts = [...adj.get(b).entries()].filter(([o, c]) => c > 0 && !used.has(o) && o !== t).length;
      return aOpts - bOpts;
    });

    for (const opp of candidates) {
      // choose t-opp
      used.add(t); used.add(opp);
      pairs.push({ teamA: t, teamB: opp });

      // decrement counts for t-opp
      const oldCount = adj.get(t).get(opp);
      adj.get(t).set(opp, oldCount - 1);
      adj.get(opp).set(t, oldCount - 1);

      if (step()) return true;

      // backtrack
      adj.get(t).set(opp, oldCount);
      adj.get(opp).set(t, oldCount);
      pairs.pop();
      used.delete(t); used.delete(opp);
    }
    return false;
  }

  const ok = step();
  return ok ? pairs : null;
}

// Full scheduler across multiple weeks with backtracking
function scheduleRemainingWeeks(adj, teamIds, weeksToFill) {
  const result = [];

  function step(weekIdx) {
    if (weekIdx === weeksToFill) return true;
    const saved = cloneAdj(adj);
    const weekPairs = buildOneWeek(adj, teamIds);
    if (weekPairs) {
      result.push(weekPairs);
      if (step(weekIdx + 1)) return true;
      result.pop();
    }
    restoreAdj(adj, saved);
    return false;
  }

  const ok = step(0);
  return ok ? result : null;
}

function cloneAdj(adj) {
  const snap = new Map();
  for (const [t, m] of adj.entries()) snap.set(t, new Map(m));
  return snap;
}
function restoreAdj(adj, snap) {
  adj.clear();
  for (const [t, m] of snap.entries()) adj.set(t, new Map(m));
}

async function handler(req, res) {
  await ensureSchema();
  if (!['POST', 'GET'].includes(req.method)) return res.status(405).end();
  try { requireAdmin(req, res); } catch (e) { return res.status(e.statusCode || 401).send(e.message); }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const startWeek = Math.max(14, Number(url.searchParams.get('start') ?? 14)); // 0-based; 14 => Week 15
  const endWeek   = Math.min(TOTAL_WEEKS - 1, Number(url.searchParams.get('end') ?? 17)); // inclusive
  const dryRun = url.searchParams.get('dry') === '1';

  // Load teams
  const teams = (await sql`SELECT id, name FROM teams ORDER BY id ASC`).rows;
  if (teams.length !== 10) {
    return res.status(400).json({ error: 'Exactly 10 teams required', teams: teams.length });
  }
  const teamIds = teams.map(t => t.id);

  // Load what’s already scheduled BEFORE startWeek
  const scheduled = (await sql`
    SELECT week, team_a AS "teamA", team_b AS "teamB"
    FROM schedule
    WHERE week < ${startWeek}
    ORDER BY week, pair_index
  `).rows;

  // Build remaining pair counts (each unordered pair must total 2 across all 18 weeks)
  const remaining = buildRemainingCounts(teamIds, scheduled);
  const neededPairs = [...remaining.values()].reduce((a, b) => a + b, 0);
  const weeksToFill = endWeek - startWeek + 1;
  const capacity = weeksToFill * (teamIds.length / 2); // 4 * 5 = 20

  if (neededPairs !== capacity) {
    return res.status(400).json({
      error: 'Remaining pair counts do not equal available slots',
      neededPairs, capacity, weeksToFill, startWeek, endWeek
    });
  }

  // Build adjacency (with multiplicity) and find weekly perfect matchings
  const adj = countsToAdj(teamIds, remaining);
  const weekly = scheduleRemainingWeeks(adj, teamIds, weeksToFill);
  if (!weekly) {
    return res.status(409).json({ error: 'Could not construct a valid completion. Check earlier weeks for duplicates or missing pairs.' });
  }

  // Write to DB (or preview)
  if (!dryRun) {
    for (let w = 0; w < weeksToFill; w++) {
      const week = startWeek + w;
      await sql`DELETE FROM schedule WHERE week = ${week}`;
      const pairs = weekly[w];
      for (let i = 0; i < pairs.length; i++) {
        await sql`INSERT INTO schedule (week, pair_index, team_a, team_b) VALUES (${week}, ${i}, ${pairs[i].teamA}, ${pairs[i].teamB})`;
      }
    }
  }

  res.status(200).json({
    ok: true,
    startWeek,
    endWeek,
    dryRun,
    weeks: weekly.map((pairs, idx) => ({
      week: startWeek + idx,
      pairs
    }))
  });
}

export default withCors(handler);

