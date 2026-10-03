# Changelog

All notable changes to Pixel Run are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- `index.php` and the API degrade gracefully without a database: the API answers
  `503 database_unavailable` (never a fatal or a 500) for an unconfigured,
  unreachable or not-yet-installed database, and the game carries on locally.
  A damaged `config.local.php` is ignored rather than fatal.
- Redesigned the dino sprites: larger head with a toothy open jaw, stout
  upright body, tiny forearms and thick legs. The duck pose is a hunch with
  a raised tail spike rather than a long flat shape. Hitboxes are unchanged.

### Added
- Web installer (`install.php`): checks requirements, creates or upgrades the
  tables from `sql/schema.sql`, and writes credentials and a random `ip_salt`
  to `includes/config.local.php`. Fresh uploads play locally with a link to it
  (no forced redirect); it locks once the database is reachable. `config.php` now merges that file over its
  defaults.
- Two new playable characters, a penguin and a robot, with picker buttons
  and leaderboard tabs. Existing databases need the `ALTER TABLE` in
  `UPGRADING.md`.
- Idle bob on the title screen, with a swoosh sound on start and restart.
- Game-over medals (bronze 100, silver 300, gold 600) and a NEW BEST badge,
  coloured through CSS variables in `assets/css/style.css`.
- White collision flash and a short hit-stop before the game-over panel.

## [1.0.0] - 2026-09-24

First versioned release. Earlier iterations circulated as unversioned
draft packages; the entries below describe this release relative to the
last of those drafts.

### Added
- `assets/js/sprites.js`: character and obstacle bitmaps as character
  grids with per-sprite palettes and an automatic one-cell outline;
  frames are pre-rendered once to offscreen canvases.
- Redrawn T-Rex (stand, two run frames, two duck frames), tabby cat,
  small and large cacti, bird (two wing frames) and gift boxes.
- Personal best persisted in `localStorage` (`pixel_run_hi`).
- `version` key in `config.php`, used as the asset cache-buster.
- `trusted_proxies` key in `config.php` for deployments behind a reverse
  proxy or Cloudflare.
- Styling for the no-JS fallback form.
- `CHANGELOG.md` and `UPGRADING.md`.

### Changed
- Game logic runs at a fixed 60 updates per second regardless of display
  refresh rate; rendering runs at the display rate.
- API endpoints renamed to kebab-case: `api/get-scores.php` and
  `api/submit-score.php`.
- `cors_origin` defaults to empty; no CORS headers are sent unless an
  origin is configured.
- `standalone.html` links the shared `assets/` files instead of carrying
  an inlined copy of the CSS and JavaScript.
- Server state is passed to the browser as a JSON data block
  (`type="application/json"`) encoded with the `JSON_HEX_*` flags; the
  page contains no inline JavaScript or inline style attributes.
- `game.js` is wrapped in a strict-mode IIFE; `render()` no longer
  mutates game state.
- Leaderboard rows are produced by a single JavaScript template; the
  duplicate PHP loop was removed.
- `submit-score.php` validates the payload before opening the database
  connection, so malformed requests receive 400 even when MySQL is down.
- Milestone flashes are detected by threshold so bonus points cannot skip
  a hundred.

### Fixed
- The `hidden` attribute was overridden by author `display` rules, which
  showed the name/submit form on the start screen and the leaderboard
  button while offline.
- Space, R and M fired game actions while the player was typing a name.
- The ALL leaderboard tab showed stale data after a score was submitted.
- The Enter key could submit a score twice.
- Rate limiting could be bypassed by supplying forwarded-for headers;
  proxy headers are now trusted only from configured proxy addresses.
- A run duration above the cap was zeroed, which skipped the plausibility
  check; it is now rejected.
- The Post-Redirect-Get target was derived from the client-controlled
  request URI; it now uses `SCRIPT_NAME`.
- `api/.htaccess` used a `Header` directive without a `mod_headers`
  guard (a 500 on hosts lacking the module) and kept a stale rule for
  files that had moved to `includes/`.
- The shield bubble and timer bar were misaligned while ducking.

### Removed
- Dead code: the unused `pebbles` array, the idle `legPhase` interval,
  and unused palette entries.
