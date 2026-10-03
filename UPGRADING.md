# Upgrading

## To the four-character release (penguin and robot)

Existing databases need one migration so scores from the new characters
can be stored. The simplest way is to run `install.php` once with the
database's credentials: it keeps every score and applies this change
automatically. To do it by hand instead:

```sql
ALTER TABLE scores
  MODIFY character_type ENUM('dino','cat','penguin','robot') NOT NULL DEFAULT 'dino';
```

Until it runs, submitting a penguin or robot score fails; the game
itself still works. New installs get the updated `sql/schema.sql`.

## From an unversioned draft package to 1.0.0

The database schema is unchanged; no migration is needed.

1. **Replace the files.** Copy the whole package over the old one, then
   delete `api/submit_score.php` and `api/get_scores.php`. The endpoints
   are now `api/submit-score.php` and `api/get-scores.php`; anything
   that referenced the old names (bookmarks, monitoring, a custom page)
   must be updated.

2. **Keep your configuration.** `includes/config.php` has three changes.
   Merge them into your existing file rather than overwriting it, so
   your credentials and `ip_salt` survive:
   - new key `'version' => '1.0.0'`
   - new key `'trusted_proxies' => []`
   - `'cors_origin'` now defaults to `''`. The old default `'*'` sent a
     wildcard CORS header on every response. Leave it empty unless the
     game page and the API live on different origins.

3. **New script.** `assets/js/sprites.js` must load before
   `assets/js/game.js`. `index.php` and `standalone.html` already do
   this; a custom page embedding the game needs the extra `<script>` tag
   and a `<script type="application/json" id="pixel-run-config">` block
   in place of the former `window.PIXEL_RUN` assignment.

4. **Standalone page.** `standalone.html` no longer contains the CSS and
   JavaScript. Keep it in the same directory as `assets/`. A copy of the
   old single-file page placed elsewhere will keep working on its own
   but will not receive the fixes in this release.

5. **Players.** Existing `localStorage` keys (`pixel_run_mode`,
   `pixel_run_muted`, `pixel_run_name`) are read as before; the new
   `pixel_run_hi` key starts empty, so personal bests begin from zero.
