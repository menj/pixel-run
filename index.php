<?php
/**
 * Pixel Run — main entry point.
 *
 * This is the single page the player visits. PHP handles three jobs:
 *
 *   1. Connect to the database and fetch the current top scores so the
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
    'arcadeUrl'     => preg_match('~^(/|\\.{1,2}/|https?://)~', (string)($cfg['arcade_url'] ?? '')) ? (string)$cfg['arcade_url'] : '',
];
$serverDataJson = json_encode(
    $serverData,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
) ?: '{}';

// Cache-buster for the JS/CSS: the app version plus the newest asset's modified
// time, so a browser that has played before picks up a new game.js or style.css
// instead of running the cached one. (The version alone never changes.)
$assetStamp = 0;
foreach (glob(__DIR__ . '/assets/{js,css}/*.{js,css}', GLOB_BRACE) ?: [] as $assetFile) {
    $assetStamp = max($assetStamp, (int)filemtime($assetFile));
}
$assetVersion = h((string)$cfg['version'] . ($assetStamp ? '.' . $assetStamp : ''));

// Where this game is served from. A <base> tag makes every relative URL (the
// assets, the API, the installer) resolve to the game's own folder even when
// the page is opened as /arcade/pixel-run without the trailing slash.
$baseDir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/') . '/';

// Absolute address for share previews (Open Graph needs full URLs).
$publicUrl = trim((string)($cfg['public_url'] ?? ''));
if ($publicUrl === '') {
    $https     = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $publicUrl = ($https ? 'https' : 'http') . '://' . (string)($_SERVER['HTTP_HOST'] ?? 'localhost') . $baseDir;
}
$publicUrl = rtrim($publicUrl, '/') . '/';

// One source for the text that appears in the tab title, the search snippet and the
// schema.org markup, so they cannot drift apart. Title under 50 characters with the
// hub suffix; description under 130 characters including its call to action.
$hubName   = trim((string)($cfg['hub_name'] ?? ''));
$hubUrl    = trim((string)($cfg['hub_url'] ?? ''));
$hubUrl    = $hubUrl === '' ? '' : rtrim($hubUrl, '/') . '/';
$pageTitle = 'Pixel Run: Free Pixel-Art Runner' . ($hubName !== '' ? ' | ' . $hubName : '');
$pageDesc  = 'Dodge cacti, duck birds and grab power-ups in this free pixel-art runner. Beat the daily course. Play now in your browser!';
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<base href="<?= h($baseDir) ?>">
<title><?= h($pageTitle) ?></title>
<meta name="description" content="<?= h($pageDesc) ?>">
<link rel="canonical" href="<?= h($publicUrl) ?>">
<meta name="theme-color" content="#0d0221">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pixel Run">
<meta property="og:title" content="Pixel Run: Pick a hero. Outrun the desert.">
<meta property="og:description" content="Dodge cacti, duck birds and beat the daily course with Eeny, Meeny, Miny or Moe.">
<meta property="og:url" content="<?= h($publicUrl) ?>">
<meta property="og:image" content="<?= h($publicUrl) ?>assets/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Pixel Run: a pixel-art dino running across a desert at sunset">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Pixel Run: Pick a hero. Outrun the desert.">
<meta name="twitter:description" content="Dodge cacti, duck birds and beat the daily course with Eeny, Meeny, Miny or Moe.">
<meta name="twitter:image" content="<?= h($publicUrl) ?>assets/img/og.png">
<?php
// Structured data (schema.org), one linked graph: the site (hub), this page, its share
// image, the breadcrumb, and the game with its characters, items, quests and tips.
// No ratings or reviews on purpose: those must come from real players, so Google's
// Software App rich result (which needs them) is not claimed.
$gameJson = is_file(__DIR__ . '/game.json') ? (json_decode((string)file_get_contents(__DIR__ . '/game.json'), true) ?: []) : [];
$ogImage  = $publicUrl . 'assets/img/og.png';
$thing    = static fn(string $name, string $desc): array => ['@type' => 'Thing', 'name' => $name, 'description' => $desc];
$modified = !empty($assetStamp) ? gmdate('c', (int)$assetStamp) : null;

$ld = [];
if ($hubUrl !== '') {
    $ld[] = ['@type' => 'WebSite', '@id' => $hubUrl . '#website', 'name' => $hubName ?: 'Arcade', 'url' => $hubUrl, 'inLanguage' => 'en'];
}
$ld[] = array_filter([
    '@type'              => 'WebPage',
    '@id'                => $publicUrl . '#webpage',
    'url'                => $publicUrl,
    'name'               => $pageTitle,
    'description'        => $pageDesc,
    'inLanguage'         => 'en',
    'isPartOf'           => $hubUrl !== '' ? ['@id' => $hubUrl . '#website'] : null,
    'primaryImageOfPage' => ['@id' => $publicUrl . '#image'],
    'breadcrumb'         => $hubUrl !== '' ? ['@id' => $publicUrl . '#breadcrumb'] : null,
    'mainEntity'         => ['@id' => $publicUrl . '#game'],
    'dateModified'       => $modified,
]);
$ld[] = [
    '@type' => 'ImageObject', '@id' => $publicUrl . '#image', 'url' => $ogImage, 'contentUrl' => $ogImage,
    'width' => 1200, 'height' => 630,
    'caption' => 'Pixel Run: a pixel-art dino running across a desert at sunset',
];
if ($hubUrl !== '') {
    $ld[] = [
        '@type' => 'BreadcrumbList', '@id' => $publicUrl . '#breadcrumb',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => $hubName ?: 'Arcade', 'item' => $hubUrl],
            ['@type' => 'ListItem', 'position' => 2, 'name' => 'Pixel Run', 'item' => $publicUrl],
        ],
    ];
}
$ld[] = array_filter([
    '@type'               => ['VideoGame', 'WebApplication'],
    '@id'                 => $publicUrl . '#game',
    'name'                => 'Pixel Run',
    'alternateName'       => 'Pixel Run: Pick a hero. Outrun the desert.',
    'url'                 => $publicUrl,
    'mainEntityOfPage'    => ['@id' => $publicUrl . '#webpage'],
    'isPartOf'            => $hubUrl !== '' ? ['@id' => $hubUrl . '#website'] : null,
    'description'         => (string)($gameJson['description'] ?? $pageDesc),
    'image'               => ['@id' => $publicUrl . '#image'],
    'screenshot'          => ['@id' => $publicUrl . '#image'],
    'applicationCategory' => 'GameApplication',
    'applicationSubCategory' => 'Endless runner',
    'operatingSystem'     => 'Any (runs in a web browser)',
    'browserRequirements' => 'Requires JavaScript',
    'softwareVersion'     => (string)($cfg['version'] ?? ''),
    'genre'               => ['Endless runner', 'Arcade', 'Pixel art'],
    'keywords'            => implode(', ', (array)($gameJson['tags'] ?? [])),
    'featureList'         => [
        'Five hearts per run',
        'Daily challenge: the same course for everyone',
        'Four playable heroes, each with a skill and a story',
        'Power-ups: bomb, shield, slow-mo, heart and mystery surprises',
        'Copper to Platinum medals',
        'In-game how-to-play guide',
        'Optional online leaderboard',
        'Works offline',
    ],
    'playMode'            => 'https://schema.org/SinglePlayer',
    'gamePlatform'        => 'Web browser',
    'numberOfPlayers'     => ['@type' => 'QuantitativeValue', 'minValue' => 1, 'maxValue' => 1],
    'gameLocation'        => ['@type' => 'Place', 'name' => 'A desert road that drifts from dawn to a starlit night'],
    'characterAttribute'  => [
        $thing('Eeny the dino', 'Balanced all-rounder.'),
        $thing('Meeny the cat', 'Jumps 10% higher.'),
        $thing('Miny the penguin', 'Glides while jump is held. Unlocked by best score.'),
        $thing('Moe the bot', 'Starts every run with a shield. Unlocked by best score.'),
    ],
    'gameItem'            => [
        $thing('Bomb gift', 'Destroys every obstacle on screen and takes down a bomber bird overhead.'),
        $thing('Shield gift', 'Smashes whatever you touch for about nine seconds.'),
        $thing('Slow-mo gift', 'Eases the road to about half speed for about six seconds.'),
        $thing('Heart gift', 'Wins back one lost heart, or gives bonus points when your hearts are full.'),
        $thing('Mystery gift', 'A random surprise: wither, bird boom, lightning, cactus party, moon jump, giant mode, Hamilton Taxi, sneeze or jackpot.'),
    ],
    'quest'               => [
        $thing('Daily challenge', 'Race the same seeded course as everyone else, once a day.'),
        $thing('Earn medals', 'Score high enough for Copper, Bronze, Silver, Gold and Platinum medals.'),
        $thing('Unlock heroes and stories', 'Raise your best score to unlock more heroes and read their stories.'),
    ],
    'gameTip'             => [
        ['@type' => 'CreativeWork', 'name' => 'Jumping', 'text' => 'Hold jump for a higher jump.'],
        ['@type' => 'CreativeWork', 'name' => 'Birds', 'text' => 'Duck under head-height birds and jump the low ones.'],
        ['@type' => 'CreativeWork', 'name' => 'Bird droppings', 'text' => 'Watch for the "!" warning: duck a head-height drop, jump a low one.'],
    ],
    'softwareHelp'        => ['@type' => 'CreativeWork', 'name' => 'How to play', 'url' => $publicUrl . '#about'],
    'inLanguage'          => 'en',
    'isAccessibleForFree' => true,
    'offers'              => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'USD', 'availability' => 'https://schema.org/InStock', 'url' => $publicUrl],
    'potentialAction'     => [
        '@type'  => 'PlayGameAction',
        'target' => ['@type' => 'EntryPoint', 'urlTemplate' => $publicUrl,
                     'actionPlatform' => ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform']],
    ],
], static fn($v) => $v !== null && $v !== '');
?>
<script type="application/ld+json"><?= json_encode(['@context' => 'https://schema.org', '@graph' => $ld], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
<link rel="icon" type="image/png" href="assets/img/favicon.png">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
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
      <button id="guide-btn" class="daily-btn guide-btn" type="button"
              title="How to play: the goal, controls, gifts and medals">
        <span class="daily-icon">❓</span>
        <span class="daily-label">GUIDE</span>
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
    <button id="pause-btn" class="pause-btn" type="button" aria-label="Pause (P)" title="Pause (P)" hidden>&#10074;&#10074;</button>
    <div class="lives" id="lives" role="img" aria-label="Lives" hidden></div>
    <div class="pause-screen" id="pause-screen" role="dialog" aria-label="Paused" hidden>
      <div class="pause-card">
        <h2>PAUSED</h2>
        <p>Press <span class="key">P</span> to resume</p>
        <div class="pause-actions">
          <button id="pause-resume" class="pause-action" type="button">RESUME</button>
          <button id="pause-restart" class="pause-action secondary" type="button">RESTART</button>
        </div>
      </div>
    </div>
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

  <!-- Player guide. Content comes from assets/js/guide.js and is rendered
       by game.js: one tab per topic. -->
  <div class="lb-modal" id="guide-modal" hidden role="dialog" aria-modal="true" aria-labelledby="guide-title">
    <div class="lb-card story-card">
      <header class="lb-header">
        <h2 id="guide-title">❓ GUIDE</h2>
        <button id="guide-close" class="lb-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="lb-tabs guide-tabs" role="tablist" id="guide-tabs"></div>
      <div class="story-body" id="guide-body" role="tabpanel"></div>
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
    <span><strong>P</strong> pause</span>
    <span><strong class="accent-bomb"><span class="pu-icon">💣</span> PINK</strong> bomb</span>
    <span><strong class="accent-shield"><span class="pu-icon">🛡️</span> BLUE</strong> shield</span>
    <span><strong class="accent-slow"><span class="pu-icon">⏳</span> GREEN</strong> slow-mo</span>
    <span><strong class="accent-life"><span class="pu-icon">❤️</span> HEART</strong> +1 life</span>
    <span><strong class="accent-mystery"><span class="pu-icon">🎁</span> GOLD</strong> surprise</span>
  </div>

  <section class="about" id="about" aria-labelledby="about-title">
    <h2 id="about-title">About Pixel Run</h2>
    <p>Pixel Run is a free pixel-art endless runner you play in your browser. Sprint across a desert that drifts from dawn to a starlit night, jump the cacti and duck the birds as the pace climbs. You get five hearts, so one mistake does not end the run.</p>
    <h2>How to play</h2>
    <p>Press Space or the up arrow to jump (hold for a higher jump) and the down arrow to duck. On a phone or tablet, use the on-screen buttons or tap the game. Press P to pause.</p>
    <h2>Power-ups and surprises</h2>
    <p>Gifts float along the road: a bomb clears the screen, a shield smashes what you touch, slow-mo eases the road, a heart wins back a life, and a gold gift is a random surprise, from a cactus party to lightning speed to a ride on Hamilton the bird.</p>
    <h2>Four heroes</h2>
    <p>Eeny the dino is balanced, Meeny the cat jumps higher, Miny the penguin glides and Moe the bot starts with a shield. Unlock more heroes and their stories by raising your best score, race the daily challenge, and earn medals from Copper to Platinum.</p>
  </section>

  <p class="footer-mark">DNS_PROBE_FINISHED_NO_INTERNET</p>
</div>

<script type="application/json" id="pixel-run-config"><?= $serverDataJson ?></script>
<script src="assets/js/sprites.js?v=<?= $assetVersion ?>"></script>
<script src="assets/js/stories.js?v=<?= $assetVersion ?>"></script>
<script src="assets/js/guide.js?v=<?= $assetVersion ?>"></script>
<script src="assets/js/game.js?v=<?= $assetVersion ?>"></script>

</body>
</html>
