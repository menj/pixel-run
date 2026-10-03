-- ============================================================
-- Pixel Run — MySQL schema
-- Run once on first deployment, or let install.php do it for you.
--   mysql -u root -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS pixel_run
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pixel_run;

CREATE TABLE IF NOT EXISTS scores (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  player_name     VARCHAR(20)        NOT NULL,
  score           INT UNSIGNED       NOT NULL,
  character_type  ENUM('dino','cat','penguin','robot') NOT NULL DEFAULT 'dino',
  obstacles       INT UNSIGNED       NOT NULL DEFAULT 0,
  duration_ms     INT UNSIGNED       NOT NULL DEFAULT 0,
  ip_hash         CHAR(64)           NOT NULL,
  user_agent      VARCHAR(255)       DEFAULT NULL,
  created_at      DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_score   (score DESC),
  INDEX idx_char    (character_type, score DESC),
  INDEX idx_ip      (ip_hash, created_at),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Optional: dedicated app user with minimum required privileges.
-- Run the lines below as MySQL root, then update config.php.
-- ============================================================

-- CREATE USER 'pixel_run_app'@'localhost' IDENTIFIED BY 'CHANGE_THIS_PASSWORD';
-- GRANT SELECT, INSERT ON pixel_run.scores TO 'pixel_run_app'@'localhost';
-- FLUSH PRIVILEGES;
