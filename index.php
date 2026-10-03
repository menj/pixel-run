<?php
/**
 * Pixel Run — main entry point.
 *
 * This is the single page the player visits. PHP handles three jobs:
 *
 *   1. Connect to MySQL and fetch the current top scores so the
 *      leaderboard opens without an AJAX round-trip.
 *
 *   2. Accept a traditional form POST as a no-JS fallback for score
 *      submission, using the Post-Redirect-Get pattern.
 *
 *   3. Hand server-side state to the game through a JSON data block
 *      (no inline JavaScript): API status, initial scores, and the rank
 *      of a score just saved through the form fallback.
 *
 * If the database is unreachable, the page still renders and the game
 * runs in local-only mode.
 */

declare(strict_types=1);

require __DIR__ . '/includes/db.php';
require __DIR__ . '/includes/scores.php';
require __DIR__ . '/includes/admin.php';
$cfg = require __DIR__ . '/includes/config.php';

// Only a signed-in admin gets the cheat code; everyone else never sees it.
$isAdmin = admin_is_logged_in($cfg);
if ($isAdmin) {
    header('Cache-Control: private, no-store');
}

// The game always runs. With no database (never set up, unreachable, or not
// yet installed) this page renders in local-only mode; the leaderboard and
// score submission simply switch off. On a fresh upload it also offers a
// link to the optional installer.
$needsSetup = empty($cfg['configured']);
$setupLink  = $needsSetup && is_file(__DIR__ . '/install.php');

/* ----------------------------------------------------------------
 * Database bootstrap
 * --------------------------------------------------------------*/
$dbAvailable   = false;
$initialScores = [];
$totalRuns     = 0;
$flash         = null;   // ['type' => 'success'|'error', 'text' => string]
$savedRank     = null;
$isScorePost   = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'
              && (($_POST['action'] ?? '') === 'submit_score');

$pdo = db_open($cfg);
if ($pdo !== null) {
    try {
        // ----- POST submission fallback (no-JS) -----
        if ($isScorePost) {
            $hash   = ip_hash($cfg['ip_salt'], $cfg['trusted_proxies']);
            $ua     = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
            $result = process_score_submission($pdo, $cfg, $_POST, $hash, $ua);

            if ($result['ok']) {
                // Post-Redirect-Get: prevents resubmission on refresh. The target
                // is SCRIPT_NAME (set by the server), never REQUEST_URI (set by
                // the client), so it cannot be steered to another host.
                header('Location: ' . $_SERVER['SCRIPT_NAME'] . '?saved=' . (int)$result['rank']);
                exit;
            }
            $flash = [
                'type' => 'error',
                'text' => 'Could not save: ' . $result['error'],
            ];
        }

        // ----- Initial leaderboard payload (top 20, all characters) -----
        $initialScores = fetch_top_scores($pdo, null, 20);
        $totalRuns     = fetch_total_count($pdo);
        $dbAvailable   = true;   // only once the tables answered

        if (isset($_GET['saved'])) {
            $savedRank = max(0, (int)$_GET['saved']);
        }
    } catch (Throwable $e) {
        if (!db_is_missing_table($e)) {
            error_log('[pixel-run] index: ' . $e->getMessage());
        }
        // Page still renders; game falls back to offline mode.
    }
}
if ($isScorePost && !$dbAvailable && $flash === null) {
    $flash = ['type' => 'error', 'text' => 'The leaderboard is offline, so that score was not saved.'];
}

/* ----------------------------------------------------------------
 * View helpers
 * --------------------------------------------------------------*/

/** Escape for HTML attribute or text content. */
function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/* ----------------------------------------------------------------
 * State for the JavaScript game, emitted as a JSON data block.
 * JSON_HEX_* prevents a value from ever closing the <script> element;
 * the '{}' fallback keeps the game bootable if encoding fails.
 * --------------------------------------------------------------*/
$serverData = [
    'apiBase'       => './api',
    'apiAvailable'  => $dbAvailable,
    'initialScores' => $initialScores,
    'totalRuns'     => $totalRuns,
    'savedRank'     => $savedRank,
    'isAdmin'       => $isAdmin,
];
$serverDataJson = json_encode(
    $serverData,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
) ?: '{}';

$assetVersion = h((string)$cfg['version']);
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Pixel Run — Colour Edition</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css?v=<?= $assetVersion ?>">
</head>
<body>

<div class="stage">
  <header>
    <h1>PIXEL • RUN</h1>
    <span class="subtitle">COLOUR EDITION</span>
  </header>

  <div class="toolbar">
    <div class="char-picker" role="tablist" aria-label="Choose character">
      <button class="char-btn active" data-char="dino" type="button">
        <span class="char-emoji">🦖</span>
        <span class="char-label">DINO</span>
      </button>
      <button class="char-btn" data-char="cat" type="button">
        <span class="char-emoji">🐱</span>
        <span class="char-label">CAT</span>
      </button>
      <button class="char-btn" data-char="penguin" type="button">
        <span class="char-emoji">🐧</span>
        <span class="char-label">PENGUIN</span>
      </button>
      <button class="char-btn" data-char="robot" type="button">
        <span class="char-emoji">🤖</span>
        <span class="char-label">BOT</span>
      </button>
    </div>
    <div class="toolbar-right">
      <button id="story-btn" class="daily-btn story-btn" type="button"
              title="Read the character's story">
        <span class="daily-icon">📖</span>
        <span class="daily-label">STORY</span>
      </button>
      <button id="daily-btn" class="daily-btn" type="button" aria-pressed="false"
              title="Daily challenge: everyone gets the same course today">
        <span class="daily-icon">📅</span>
        <span class="daily-label">DAILY</span>
      </button>
      <button id="sound-btn" class="sound-btn" type="button"
              aria-pressed="false" title="Sound on — click to mute">
        <span class="sound-icon">🔊</span>
      </button>
      <button id="mode-btn" class="mode-btn <?= $dbAvailable ? 'online' : 'offline' ?>" type="button"
              title="Switch between online and local play">
        <span class="mode-icon"><?= $dbAvailable ? '🌐' : '📴' ?></span>
        <span class="mode-label"><?= $dbAvailable ? 'ONLINE' : 'OFFLINE' ?></span>
      </button>
      <button id="lb-open" class="lb-btn" type="button" <?= $dbAvailable ? '' : 'hidden' ?>>
        <span class="lb-icon">🏆</span>
        <span>LEADERBOARD</span>
      </button>
    </div>
  </div>
  <?php if ($setupLink): ?>
  <p class="setup-note">Playing locally. <a href="install.php">Set up the online leaderboard</a> (optional).</p>
  <?php endif; ?>
  <p id="mode-note" class="mode-note" <?= $flash ? '' : 'hidden' ?>>
    <?= $flash ? h($flash['text']) : '' ?>
  </p>

  <div class="frame">
    <div class="scoreboard">
      <span><span class="label">HI</span><span class="hi" id="hi">00000</span></span>
      <span><span class="label">SC</span><span class="cur" id="sc">00000</span></span>
      <?php if ($isAdmin): ?><span class="god-badge" id="god-badge" hidden>GOD</span><?php endif; ?>
    </div>
    <canvas id="game" width="960" height="320"></canvas>
    <div class="overlay" id="overlay">
      <div class="overlay-card">
        <h2 id="ov-title">PRESS SPACE TO PLAY</h2>
        <div id="ov-result" class="ov-result" hidden>
          <span id="ov-medal" class="ov-medal" hidden><span class="medal-disc"></span><span class="medal-label"></span></span>
          <span id="ov-best" class="ov-best" hidden>NEW BEST</span>
        </div>
        <p id="ov-sub" class="pulse">Jump the cacti. Duck the birds.</p>
        <div id="ov-submit" class="ov-submit" hidden>
          <label class="ov-name-label" for="ov-name">YOUR NAME</label>
          <div class="ov-name-row">
            <input id="ov-name" type="text" maxlength="20" autocomplete="off"
                   placeholder="PLAYER" spellcheck="false">
            <button id="ov-send" type="button">SUBMIT</button>
          </div>
          <p id="ov-status" class="ov-status"></p>
        </div>
        <button id="ov-again" class="ov-again" type="button" hidden>PLAY AGAIN</button>
      </div>
    </div>
  </div>

  <!-- Character stories. Content comes from assets/js/stories.js; the
       sprite portrait and chapter list are rendered by game.js. -->
  <div class="lb-modal" id="story-modal" hidden role="dialog" aria-modal="true" aria-labelledby="story-title">
    <div class="lb-card story-card">
      <header class="lb-header">
        <h2 id="story-title">📖 STORY</h2>
        <button id="story-close" class="lb-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="lb-tabs" role="tablist" id="story-tabs">
        <button class="story-tab" data-char="dino" type="button">🦖 DINO</button>
        <button class="story-tab" data-char="cat" type="button">🐱 CAT</button>
        <button class="story-tab" data-char="penguin" type="button">🐧 PENGUIN</button>
        <button class="story-tab" data-char="robot" type="button">🤖 BOT</button>
      </div>
      <div class="story-body" id="story-body"></div>
    </div>
  </div>

  <!-- Leaderboard modal. Rows are rendered by game.js from the JSON block
       below (one row template, not two). -->
  <div class="lb-modal" id="lb-modal" hidden>
    <div class="lb-card">
      <header class="lb-header">
        <h2>🏆 LEADERBOARD</h2>
        <button id="lb-close" class="lb-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="lb-tabs" role="tablist">
        <button class="lb-tab active" data-filter="all" type="button">ALL</button>
        <button class="lb-tab" data-filter="dino" type="button">🦖 DINO</button>
        <button class="lb-tab" data-filter="cat" type="button">🐱 CAT</button>
        <button class="lb-tab" data-filter="penguin" type="button">🐧 PENGUIN</button>
        <button class="lb-tab" data-filter="robot" type="button">🤖 BOT</button>
        <button class="lb-tab" data-filter="daily" type="button">📅 TODAY</button>
      </div>
      <div class="lb-list" id="lb-list"></div>
      <p class="lb-foot" id="lb-foot"></p>
    </div>
  </div>

  <!-- No-JS fallback: posts to this page; validation is shared with the
       AJAX endpoint through process_score_submission(). -->
  <noscript>
    <form id="ov-form" action="" method="post" class="ov-noscript-form">
      <p>JavaScript is required to play. To submit a score manually:</p>
      <input type="hidden" name="action" value="submit_score">
      <input type="hidden" name="character" value="dino">
      <label>Name <input type="text" name="name" maxlength="20" required></label>
      <label>Score <input type="number" name="score" min="0" max="999999" required></label>
      <button type="submit">Submit</button>
    </form>
  </noscript>

    <div class="touch-controls" id="touch-controls">
    <button id="touch-duck" class="touch-btn" type="button" aria-label="Duck (hold)">▼ DUCK</button>
    <button id="touch-jump" class="touch-btn touch-jump" type="button" aria-label="Jump">▲ JUMP</button>
  </div>

  <div class="controls">
    <span><strong>SPACE</strong> jump</span>
    <span><strong>↓</strong> duck</span>
    <span><strong>R</strong> restart</span>
    <span><strong>M</strong> mute</span>
    <span><strong class="accent-bomb">🎁 PINK</strong> bomb</span>
    <span><strong class="accent-shield">🎁 BLUE</strong> shield</span>
  </div>

  <p class="footer-mark">DNS_PROBE_FINISHED_NO_INTERNET</p>
</div>

<script type="application/json" id="pixel-run-config"><?= $serverDataJson ?></script>
<script src="assets/js/sprites.js?v=<?= $assetVersion ?>"></script>
<script src="assets/js/stories.js?v=<?= $assetVersion ?>"></script>
<script src="assets/js/game.js?v=<?= $assetVersion ?>"></script>

</body>
</html>
