# Changelog

All notable changes to Pixel Run are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Two new medal tiers on the game-over screen: **Copper** (600 points, below
  Bronze) and **Platinum** (12000 points, above Gold). The tiers are now
  Copper 600, Bronze 1500, Silver 3500, Gold 7000, Platinum 12000 (tuned for five hearts).
- A hidden level. It is not listed anywhere in the interface: it has to be
  found. It plays a fixed course at one steady pace with no pickups, records
  nothing to the leaderboard, the best score, the unlocks or `arcade.stats`,
  and keeps its own best time on the device (`pixel_run_glitch`). Silver or
  better gives the first hint, once.
- A third gift: **GREEN slow-mo** eases the world to 55% speed for about six seconds (you keep full control). Gifts are now 50% bomb, 30% shield, 20% slow-mo, and the controls legend uses matching icons (💣 🛡️ ⏳).
- A **GOLD mystery gift** (20% of gifts) with one random surprise, never the
  same twice running, each with a line from the character and from the
  obstacles: cacti **wither** away, birds **explode**, **lightning** speedster
  mode (invulnerable, leaves a burning trail and sets every cactus it passes through ablaze; the dino ends up dizzy and wheezing), cacti stand up and throw a
  **party** while ignoring you, **moon jump** low gravity, **giant mode** (stomps cacti flat, ground-shaking footsteps), **Hamilton Taxi** (Hamilton, the bird from Beberd, carries you over everything), a delayed **sneeze** that blows every obstacle ahead off the road, or a **jackpot**
  of +75 points. Characters have their own lines for every gift.
- Destroying obstacles now always scores, with a floating "+10" (cactus) or
  "+15" (bird) popup: shield smash, bomb, burn, stomp, wither, bird boom and
  sneeze all pay the same. Cacti that only dance in the party stay alive and
  score nothing.
- **Pause**: press **P** or tap the ⏸ button mid-run. The game freezes, a PAUSED
  screen offers Resume and Restart, and resuming gives a 3-2-1 countdown.
  The game also pauses by itself when the tab is hidden. Paused time does not
  count towards the run's duration.
- Each gift now has its own shape in the game: a bomb with a lit fuse, a shield and an hourglass. The mystery gift keeps the wrapped box with a ?.
- A **GUIDE** button next to DAILY opens a tabbed how-to-play panel: goal,
  controls, gifts (including every surprise), medals, modes and runners. Medal
  scores and unlock marks are read from the game, so it stays accurate. Opening
  it mid-run pauses the game. Text is in `assets/js/guide.js`.
- **Five lives**: hearts are shown beside the pause button (in the page, so a
  phone's smaller canvas never hides them). A hit costs a heart (the obstacle
  is smashed, the runner blinks and is safe for two seconds) instead of ending
  the run; losing the last heart ends it. The daily challenge uses lives too,
  so it stays equal for everyone. The hidden level stays one-life.
- Bombs (and the bird-boom surprise) also take down the bomber bird, and any dropping already in the air splats harmlessly. It scores like any bird (+15).
- Bomb gifts are more common (45% of gifts, up from 35%).
- A pink **heart gift** (12% of gifts) wins back a lost heart, or gives +25
  points when your hearts are already full.
- **Bomber birds**: rare, and only in a long run. The first comes after about
  3 minutes, then one every 60 to 90 seconds. A green bird crosses the top of
  the screen, shows a "!" and drops something on the runner. One at a time, slow and visible, and dodgeable: duck if it comes
  at head height, jump if it comes low. A hit costs a heart; shields,
  lightning and giant mode splat it harmlessly. Never in the hidden level.
- Page title is now "Pixel Run: Free Pixel-Art Runner | Arcade Hub" (45 characters, with the Arcade Hub suffix).
- Meta description is now 122 characters (under 130) and ends with a call to action: "Play now in your browser!"
- Search-friendly page (from Google's SEO starter guide and schema.org): a canonical
  link, social card tags with an image description, and a visible "About Pixel
  Run" text section with a proper heading outline. The schema.org markup is one
  linked graph, checked against schema.org's vocabulary: the hub site
  (`WebSite`), the page (`WebPage`), its share image (`ImageObject`), a
  `BreadcrumbList`, and the game itself (`VideoGame` and `WebApplication`) with
  its heroes (`characterAttribute`), power-ups (`gameItem`), quests, tips,
  feature list, help link, free offer and a `PlayGameAction`. No ratings or
  reviews, on purpose. The hub name and address are `hub_name` and `hub_url`
  in `includes/config.php`.
- A jump pose for Eeny (dino) and Meeny (cat): legs thrown wide on the way up,
  reaching down on the way back. Looks only: the hitbox is unchanged.

### Fixed
- `index.php` cached the JS and CSS under a fixed `?v=1.0.0`, so browsers that had played before could keep running an old `game.js` (for example without Pause). The cache-buster now includes the newest asset's modified time.
- Leaving the hidden level works from any state, including mid-run, on
  keyboard and on touch.
- The ONLINE / OFFLINE button did nothing: a second function named `setMode`
  (the daily-challenge toggle) shadowed the one that switches the server
  mode. The daily toggle is now `setPlayMode`.

### Changed (copy)
- Rewrote the description, tagline ("Pick a hero. Outrun the desert."), tags,
  share text and page titles. `game.json` gains `summary` and `badges` fields
  for hub cards, and the share image carries the new tagline.

### Added (arcade hub readiness)
- Each finished run updates the shared `arcade.stats` record in localStorage
  (best, plays, last score, last played) so a hub on the same domain can show
  a player's best on the game card. Cheated runs are not recorded.
- Ready to live at a path such as `/arcade/pixel-run/`: `index.php` now emits a
  `<base>` tag so the game works even without a trailing slash, and the
  sub-folder layout was tested (assets, API, installer, SQLite, admin cookie).
- `game.json` describes the game for a hub (title, tagline, thumbnail, icon,
  share image, features), with a 1280x720 thumbnail, 1200x630 share image,
  favicon and home-screen icons in `assets/img/`, a web app manifest, and
  Open Graph and Twitter tags. `public_url` and `arcade_url` settings add the
  full share address and an optional "‹ ARCADE" back link.
- `sql/` is now blocked from browsers, and the README lists the nginx rules.

### Added (reactions)
- Characters now react, humorously. Crashing into anything knocks the
  character back, topples it onto its back and bounces it once, with a comic
  impact burst, X-eyes, a lolling tongue (sparks and short-circuit X-eyes for
  Moe the bot), dizzy stars and a joke ("BONK!", "MEOWCH!", "NOOT NOOT",
  "ERROR 404", and more, different per character). The game-over card now
  appears after about a second so the gag can be seen.
- Other moments get their own reactions: a close call gives wide eyes, a sweat
  drop and a "PHEW!"; a bomb pickup gives a shocked face and "KABOOM!"; a shield
  gives a grin; each 100 points a cheer; and on the title screen the character
  blinks, then dozes off with floating Z's. The title screen is no longer
  dimmed and blurred, so this is visible.
- Names are spelled Eeny, Meeny, Miny and Moe.

### Changed (graphics)
- Sharper characters and obstacles: every sprite is refined at load with
  Scale2x (double detail, smoother edges), a light-and-shade pass for volume,
  and a thinner outline. Sprite sizes, hitboxes and ground contact are
  unchanged, and the designs are the same, so no sprite grid had to be redrawn.
- Sharper rendering: the canvas now renders at the screen's real pixel
  resolution (up to 3x, capped at 2880 px wide) instead of a fixed 960x320
  that the browser stretched. Sprites are rebuilt at that scale with cell edges
  snapped to whole device pixels, and the canvas follows window resizes and
  zoom, so pixel art stays crisp on high-DPI phones, tablets and monitors.
- Richer scenery: layered parallax mountains and dunes that scroll at
  different speeds and take their colour from the time of day, a soft glowing
  sun and a cratered moon, a shaded ground that dims at night, and soft
  shadows under the characters and cacti.

### Added (databases)
- PostgreSQL and SQLite support alongside MySQL/MariaDB. The installer has a
  tab for each, creates the PostgreSQL database or the SQLite file for you,
  and upgrades old tables. Driver-specific SQL (rate limiting, schema
  checks) is handled in one place, with `sql/schema.pgsql.sql` and
  `sql/schema.sqlite.sql` next to `sql/schema.sql`. New `db.driver` setting;
  configs without it stay on MySQL. SQLite lives under `data/`, which is
  blocked from downloads.

### Added (admin)
- Admin mode and a cheat code. Set an admin password in the installer (or an
  `admin_password_hash` in `includes/config.local.php`), sign in at
  `admin.php`, then type `IDDQD` in the game (or tap the title five times on
  a touch screen) to toggle god mode: obstacles no longer end the run. It
  only exists for a signed-in admin, needs no database, and runs that used it
  are never recorded (no best score, unlocks, chapters or leaderboard entry;
  `submit-score.php` also rejects a cheated payload). Sign-in is throttled to
  6 failures per 15 minutes per client.

### Added (stories)
- Every character has a four-chapter story, opened with the 📖 STORY button.
  Chapters unlock as the best score rises (Eeny and Meeny at 0, 100, 300 and
  600; Miny from 300; Moe from 600), a dot marks unread chapters, and the
  game-over card announces a newly opened chapter. The text lives in
  `assets/js/stories.js`, separate from the game code, so it is easy to edit
  or translate.

### Added (gameplay)
- Game feel: variable jump height (hold to climb higher), jump buffering (a
  press just before landing still jumps), landing squash and jump stretch,
  and screen shake on a crash.
- Character traits: Eeny (dino) is balanced, Meeny (cat) jumps 10% higher,
  Miny (penguin) glides while jump is held, Moe (bot) starts with a shield.
  Miny unlocks at a best score of 300 and Moe at 600 (the silver and gold
  medal marks), tracked on the device.
- Daily challenge: a DAILY button plays one seeded course per UTC day, the
  same for everyone, with traits off. It has its own TODAY leaderboard tab
  and works offline with an on-device best.
- Database: new `challenge_date` column. `install.php` adds it to existing
  installs from its locked page ("Update database"); until then the normal
  leaderboard keeps working and daily scores report that an update is needed.

### Changed
- Characters are named Eeny (dino), Meeny (cat), Miny (penguin) and Moe (bot)
  in in-game text (tips, unlock messages). Picker and leaderboard labels stay
  DINO, CAT, PENGUIN and BOT. Stored ids are unchanged.
- `index.php` and the API degrade gracefully without a database: the API answers
  `503 database_unavailable` (never a fatal or a 500) for an unconfigured,
  unreachable or not-yet-installed database, and the game carries on locally.
  A damaged `config.local.php` is ignored rather than fatal.
- Redesigned the dino sprites: larger head with a toothy open jaw, stout
  upright body, tiny forearms and thick legs. The duck pose is a hunch with
  a raised tail spike rather than a long flat shape. Hitboxes are unchanged.

### Added
- Responsive layout for desktop, tablet, phone and landscape phone. The page
  scrolls instead of clipping, the picker becomes a 4-up grid on phones, and
  the game-over card becomes a full-screen sheet on small screens.
- Touch controls (hold-to-duck and jump buttons, tap the canvas to jump, tap
  to start or retry) shown on touch devices, and on hybrid devices once a
  touch is seen. A PLAY AGAIN button appears on game over. Keyboard controls
  are unchanged. Audio now unlocks on the first touch release, as mobile
  browsers require.
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
