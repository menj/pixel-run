-- ============================================================
-- Pixel Run — PostgreSQL schema
-- install.php runs this for you. To do it by hand, connect to your
-- (already created) database and run:
--   psql -U your_user -d pixel_run -f schema.pgsql.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS scores (
  id              BIGSERIAL PRIMARY KEY,
  player_name     VARCHAR(20)  NOT NULL,
  score           INTEGER      NOT NULL,
  character_type  VARCHAR(16)  NOT NULL DEFAULT 'dino',
  obstacles       INTEGER      NOT NULL DEFAULT 0,
  duration_ms     INTEGER      NOT NULL DEFAULT 0,
  ip_hash         CHAR(64)     NOT NULL,
  user_agent      VARCHAR(255),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  challenge_date  DATE
);

CREATE INDEX IF NOT EXISTS idx_score     ON scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_char      ON scores (character_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_ip        ON scores (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_created   ON scores (created_at);
CREATE INDEX IF NOT EXISTS idx_challenge ON scores (challenge_date, score DESC);
