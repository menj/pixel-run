# Pixel Run

A pixel-art endless runner in the spirit of the browser offline game, with
a colour day-and-night cycle, four playable characters (Eeny the dino,
Meeny the tabby cat, Miney the penguin and Mo the bot), bomb and shield pickups, synthesised sound, and an optional global
leaderboard backed by MySQL/MariaDB, PostgreSQL or SQLite and PHP.

Version 1.0.0. See `CHANGELOG.md` for release notes and `UPGRADING.md`
if you deployed an earlier draft package.

## Two ways to deploy

| Mode | Entry point | Needs | Leaderboard |
|------|-------------|-------|-------------|
| Full | `index.php` | PHP 7.4+ with a PDO driver for one of: MySQL 5.7+ / MariaDB 10.3+, PostgreSQL 9.5+, or SQLite 3 | Yes |
| Standalone | `standalone.html` | Any static host, or open from disk | No |

Both pages load the same `assets/` files, so gameplay is identical.

## Playing

Space or ↑ jumps (hold to jump higher), ↓ ducks, R restarts, M mutes. On
touch screens use the on-screen buttons or tap the game. Each character has
a trait (Miney glides while jump is held, Mo starts with a shield). Miney
and Mo unlock at best scores of 300 and 600. The 📅 DAILY button plays a
shared seeded course that changes each UTC day, with its own leaderboard
tab.

## Admin and the cheat code

Optional. Enter an admin password in the installer (or add
`'admin_password_hash' => '<password_hash() output>'` to
`includes/config.local.php`), then sign in at `admin.php`. While signed in,
type `IDDQD` in the game (or tap the title five times on a touch screen) to
toggle god mode: you pass through obstacles. Runs that used it are never
saved to the leaderboard, your best score, unlocks or story progress.
Without the setting there is no admin and the cheat does not exist. It works
without a database, but not in `standalone.html`, which has no server.

Anyone can edit browser scripts, so the cheat is gated by the server session
and cheated runs are kept out of the records instead of trying to hide the
code.

## Stories

Each character has a four-chapter story behind the 📖 STORY button. Chapters
open as your best score grows, so the score goals double as story progress.
Edit `assets/js/stories.js` to change the text or add a language.

## Characters

Eeny (dino), Meeny (tabby cat), Miney (penguin) and Mo (bot). They are
labelled DINO, CAT, PENGUIN and BOT in the picker and leaderboard, and
called by name in in-game text. The
internal ids `dino`, `cat`, `penguin` and `robot` are what the database and
API store, so renaming a character on screen never needs a migration.

## Package contents

```
pixel-run/
├── index.php              full version: renders the page, serves the form fallback
├── install.php            web installer (WordPress-style first-run wizard)
├── data/                  SQLite database folder (blocked from downloads)
├── admin.php              admin sign-in for the cheat code
├── standalone.html        no-backend version: links the same assets
├── assets/
│   ├── css/style.css      all styling
│   └── js/
│       ├── sprites.js     character and obstacle bitmaps with palettes
│       ├── stories.js     character story text (plain data, easy to edit)
│       └── game.js        engine (requires sprites.js to load first)
├── includes/              internal PHP, denied to browsers by .htaccess
│   ├── config.php         version and tunables (credentials come from config.local.php)
│   ├── config.local.php   written by install.php; holds credentials, git-ignored
│   ├── installer.php      installer logic: checks, schema, settings file
│   ├── admin.php          admin session and sign-in throttle helpers
│   ├── db.php             PDO, JSON responses, client IP, CORS
│   └── scores.php         validation, rate limiting, queries, insert
├── api/
│   ├── get-scores.php     GET  top scores as JSON
│   └── submit-score.php   POST a score as JSON
├── sql/schema.sql         one-time database setup
├── README.md
├── CHANGELOG.md
└── UPGRADING.md
```

## Quick start: standalone

Keep `standalone.html` and the `assets/` directory together, then either
open the HTML file directly in a browser or upload both to any static
host. Nothing else is required. The only outbound request is the Google
Fonts stylesheet; the page never contacts an API.

## Databases

The leaderboard works with any one of these, picked in the installer:

| Database | PHP extension | Notes |
|----------|---------------|-------|
| MySQL / MariaDB | `pdo_mysql` | The default; `sql/schema.sql` |
| PostgreSQL | `pdo_pgsql` | `sql/schema.pgsql.sql`; the installer can create the database |
| SQLite | `pdo_sqlite` | `sql/schema.sqlite.sql`; no server, one file in `data/` |

The choice is saved as `db.driver` (`mysql`, `pgsql` or `sqlite`) in
`includes/config.local.php`; existing configs without it stay on MySQL.
SQLite keeps its file under `data/` with a random name, and that folder is
blocked from downloads on Apache. On nginx add a `deny all` rule for it, or
set an absolute `db.path` outside the web root. Back up SQLite by copying
the file (and its `-wal` file if present).

## Full deployment


### Quickest: the web installer

The game always runs, with or without a database: until one is set up it
plays in local-only mode with a link to the installer. To enable the
leaderboard, open `install.php`. It checks the server, lets you pick
MySQL/MariaDB, PostgreSQL or SQLite, asks for the details (SQLite needs
none), creates the tables and writes `includes/config.local.php` with a
random `ip_salt`. For MySQL or PostgreSQL create the user in your hosting
panel first. Once the game can reach its database the installer locks
itself; you can delete `install.php` afterwards. Re-running it on an
existing database keeps all scores and upgrades the table if needed.

If `includes/` is not writable, the installer shows the settings file to
save by hand. Prefer the command line? Follow the manual steps below.

### Manual setup (MySQL / MariaDB)

For PostgreSQL run `sql/schema.pgsql.sql` with `psql`; for SQLite run
`sql/schema.sqlite.sql` with `sqlite3`. Then set `db.driver` (and `db.path`
for SQLite) in `includes/config.local.php`.

### 1. Create the database

```bash
mysql -u root -p < sql/schema.sql
```

### 2. Create a dedicated database user

```sql
CREATE USER 'pixel_run_app'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT SELECT, INSERT ON pixel_run.scores TO 'pixel_run_app'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Configure

Open `includes/config.php` and set:

- `db.user` and `db.pass` to the account above
- `ip_salt` to a long random string unique to this deployment
- `trusted_proxies` only if Apache sits behind a reverse proxy or
  Cloudflare (list the proxy addresses); leave empty on plain cPanel
- `cors_origin` only if the game page will be served from a different
  origin than the API; leave empty for the normal same-origin setup

### 4. Upload

```bash
scp -r pixel-run user@yourhost:/var/www/html/
cd /var/www/html/pixel-run
chmod 644 index.php standalone.html assets/css/*.css assets/js/*.js api/*.php api/.htaccess includes/*.php includes/.htaccess
chmod 600 includes/config.php
chown -R www-data:www-data .
```

On RHEL, AlmaLinux and CentOS use `apache:apache` in place of
`www-data:www-data`.

### 5. Verify

Visit `https://yourdomain.com/pixel-run/`. The toolbar shows
**🌐 ONLINE** when the database is reachable and **📴 OFFLINE** when it is not;
the page renders either way.

```bash
curl https://yourdomain.com/pixel-run/api/get-scores.php?limit=5
# {"scores":[],"total":0}

curl -X POST https://yourdomain.com/pixel-run/api/submit-score.php \
  -H "Content-Type: application/json" \
  -d '{"name":"TESTER","score":42,"character":"dino"}'
# {"ok":true,"rank":1,"total":1}
```

## How it is organised

**One entry point.** `index.php` connects to the database, handles the no-JS
form POST (Post-Redirect-Get, redirect target taken from `SCRIPT_NAME`),
fetches the top twenty scores, and renders the page. If the connection
fails the exception is logged and the page renders in offline mode.

**No inline code.** Server state reaches the browser through a
`<script type="application/json" id="pixel-run-config">` data block,
encoded with the `JSON_HEX_*` flags. Styling lives in `assets/css/`,
behaviour in `assets/js/`, and the asset URLs carry `?v=<version>` from
`config.php` for cache-busting.

**One ruleset.** `includes/scores.php` holds `validate_score_payload()`
and `record_score()`. The AJAX endpoint validates first (so a bad payload
gets 400 even with the database down) and then records; the form fallback
runs both through `process_score_submission()`.

**Sprites as data.** `assets/js/sprites.js` describes every frame as a
character grid with a palette. At load, each frame is refined once: Scale2x
doubles the resolution and rounds off staircase edges, a light-and-shade
pass adds volume (lighter on top edges, darker underneath, eyes and teeth
untouched), and a thin outline is added. Padding restores the original
frame size, so hitboxes are unaffected. `game.js` then renders each frame
once to an offscreen canvas at the screen's real pixel density and blits
from there. To change a sprite, edit the grid; frame sizes must stay as
documented in the file because the hitboxes depend on them.

**Fixed timestep.** Game logic runs at exactly 60 updates per second on
any display; rendering runs at the display's rate. Speed and score are
therefore the same on a 60 Hz laptop and a 144 Hz monitor, which also
keeps the server's plausibility check meaningful.

## Sound

Seven synthesised effects (jump, land, duck, bomb, shield, milestone,
game over) generated with the Web Audio API; no audio files. Mute with
the 🔊 button or the `M` key. Browsers start audio only after a user
gesture, so the context is created on the first jump.

## Online and offline toggle

The 🌐 / 📴 pill switches between leaderboard play and local play. In
offline mode the game makes no network requests. Switching to online
re-checks the API and falls back if it is unreachable.

## Browser storage

The game keeps four keys in `localStorage`, all optional:
`pixel_run_mode`, `pixel_run_muted`, `pixel_run_hi` (personal best) and
`pixel_run_name` (last name entered). Nothing else is stored client-side.

## Configuration reference (`includes/config.php`)

| Key                  | Default   | Notes                                              |
|----------------------|-----------|----------------------------------------------------|
| `version`            | `1.0.0`   | semver; also the asset cache-buster                |
| `cors_origin`        | `''`      | empty sends no CORS headers                        |
| `trusted_proxies`    | `[]`      | proxy IPs whose forwarded-for headers are honoured |
| `name_min_len`       | 1         | minimum player name length                         |
| `name_max_len`       | 20        | maximum player name length                         |
| `max_score`          | 999999    | higher submissions are rejected                    |
| `max_duration_ms`    | 24 h      | longer runs are rejected                           |
| `rate_limit_seconds` | 3         | minimum gap between submissions per IP hash        |
| `default_limit`      | 10        | leaderboard rows when `limit` is not supplied      |
| `max_limit`          | 50        | maximum rows `get-scores.php` returns              |

The submit endpoint also rejects a score above 25 points per second of
reported run duration.

## Hardening

`includes/.htaccess` denies browser access to the PHP internals and
`api/.htaccess` disables listings and sets `X-Content-Type-Options`
inside an `IfModule` guard. Both need `AllowOverride All` (or at least
`AuthConfig Options`) for the directory. Where `.htaccess` is ignored,
place the equivalent in the vhost:

```apache
<Directory "/var/www/html/pixel-run/includes">
    Require all denied
</Directory>
```

Nginx:

```nginx
location /pixel-run/includes/ { deny all; return 403; }
```

## Limitations

The game runs in the browser, so a determined user can craft a request
with any score. Rate limiting per IP hash and the duration plausibility
check catch casual tampering only. Competitive integrity would need a
server-issued session token, a per-run signature, or server-side replay
of the input sequence, none of which is included.

## Maintenance

```sql
-- recent submissions
SELECT player_name, score, character_type, created_at
  FROM pixel_run.scores ORDER BY created_at DESC LIMIT 20;

-- wipe
TRUNCATE TABLE pixel_run.scores;
```

```bash
mysqldump -u root -p pixel_run scores > scores-backup.sql
```
