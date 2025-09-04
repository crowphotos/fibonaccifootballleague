import { sql } from '@vercel/postgres';

export async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    espn_id TEXT
  )`;

  await sql`CREATE TABLE IF NOT EXISTS schedule (
    week INT NOT NULL,
    pair_index INT NOT NULL,
    team_a INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    team_b INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (week, pair_index)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS scores (
    week INT NOT NULL,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (week, team_id)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS awards (
    week INT NOT NULL,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    points DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (week, team_id)
  )`;
}

