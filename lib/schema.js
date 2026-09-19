// One atomic, serialized migration; existing records belong to 2025.
export const schemaSql = `DO $$
BEGIN
  PERFORM pg_advisory_xact_lock(708357460, 2026);
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    espn_id TEXT
  );

CREATE TABLE IF NOT EXISTS schedule (
    week INT NOT NULL,
    pair_index INT NOT NULL,
    team_a INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    team_b INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (week, pair_index)
  );

CREATE TABLE IF NOT EXISTS scores (
    week INT NOT NULL,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (week, team_id)
  );

CREATE TABLE IF NOT EXISTS awards (
    week INT NOT NULL,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    points DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (week, team_id)
  );
  CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY);
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'season-isolation-v1') THEN
    ALTER TABLE teams ADD COLUMN season INT NOT NULL DEFAULT 2025;
    ALTER TABLE teams DROP CONSTRAINT teams_name_key;
    ALTER TABLE teams ADD UNIQUE (season, name);
    ALTER TABLE teams ADD UNIQUE (season, id);
    ALTER TABLE teams ALTER COLUMN season DROP DEFAULT;
    ALTER TABLE schedule ADD COLUMN season INT NOT NULL DEFAULT 2025;
    ALTER TABLE schedule DROP CONSTRAINT schedule_pkey;
    ALTER TABLE schedule ADD PRIMARY KEY (season, week, pair_index);
    ALTER TABLE schedule ALTER COLUMN season DROP DEFAULT;
    ALTER TABLE schedule DROP CONSTRAINT schedule_team_a_fkey;
    ALTER TABLE schedule ADD FOREIGN KEY (season, team_a) REFERENCES teams(season, id) ON DELETE CASCADE;
    ALTER TABLE schedule DROP CONSTRAINT schedule_team_b_fkey;
    ALTER TABLE schedule ADD FOREIGN KEY (season, team_b) REFERENCES teams(season, id) ON DELETE CASCADE;
    ALTER TABLE scores ADD COLUMN season INT NOT NULL DEFAULT 2025;
    ALTER TABLE scores DROP CONSTRAINT scores_pkey;
    ALTER TABLE scores ADD PRIMARY KEY (season, week, team_id);
    ALTER TABLE scores ALTER COLUMN season DROP DEFAULT;
    ALTER TABLE scores DROP CONSTRAINT scores_team_id_fkey;
    ALTER TABLE scores ADD FOREIGN KEY (season, team_id) REFERENCES teams(season, id) ON DELETE CASCADE;
    ALTER TABLE awards ADD COLUMN season INT NOT NULL DEFAULT 2025;
    ALTER TABLE awards DROP CONSTRAINT awards_pkey;
    ALTER TABLE awards ADD PRIMARY KEY (season, week, team_id);
    ALTER TABLE awards ALTER COLUMN season DROP DEFAULT;
    ALTER TABLE awards DROP CONSTRAINT awards_team_id_fkey;
    ALTER TABLE awards ADD FOREIGN KEY (season, team_id) REFERENCES teams(season, id) ON DELETE CASCADE;
    INSERT INTO teams (season, name, espn_id) SELECT 2026, name, espn_id FROM teams WHERE season = 2025;
    INSERT INTO schema_migrations (name) VALUES ('season-isolation-v1');
  END IF;
END $$;`;
