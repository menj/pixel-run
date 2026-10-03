-- ============================================================
-- Pixel Run — SQLite schema
-- install.php creates the database file and runs this for you. By hand:
--   sqlite3 data/pixel-run.sqlite < schema.sqlite.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS scores (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name     TEXT    NOT NULL,
  score           INTEGER NOT NULL,
  character_type  TEXT    NOT NULL DEFAULT 'dino',
  obstacles       INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  ip_hash         TEXT    NOT NULL,
  user_agent      TEXT,
  created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  challenge_date  TEXT
);

CREATE INDEX IF NOT EXISTS idx_score     ON scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_char      ON scores (character_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_ip        ON scores (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_created   ON scores (created_at);
CREATE INDEX IF NOT EXISTS idx_challenge ON scores (challenge_date, score DESC);
