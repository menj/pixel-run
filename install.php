<?php
/**
 * Pixel Run — web installer.
 *
 * Open this page once after uploading the files. It checks the server,
 * asks for database details, creates (or upgrades) the tables, and writes
 * includes/config.local.php. Once the game can reach its database this page
 * refuses to run again, so it is safe to leave in place; deleting it is
 * still good practice.
 */

declare(strict_types=1);

require __DIR__ . '/includes/db.php';
require __DIR__ . '/includes/installer.php';
$cfg = require __DIR__ . '/includes/config.php';

header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

// Own cookie name and path, so it never clashes with other apps on the same domain.
$installDir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
session_name('pixelrun_install');
session_set_cookie_params([
    'path'     => $installDir . '/',
    'httponly' => true,
    'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Strict',
]);
session_start();
if (empty($_SESSION['pr_install_token'])) {
    $_SESSION['pr_install_token'] = bin2hex(random_bytes(16));
}
$token = $_SESSION['pr_install_token'];

function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/* ----------------------------------------------------------------
 * State machine: locked | requirements | database | manual | done
 * --------------------------------------------------------------*/
$step     = 'requirements';
$errors   = [];
$notice   = '';
$manual   = '';
$requirements = installer_requirements();
$canRun   = installer_can_run();

// Form defaults: reuse whatever config.php or config.local.php already holds.
$pre = $cfg['db'];
$preDriver = db_driver($pre);
$form = [
    'db_driver' => installer_driver_available($preDriver) ? $preDriver : installer_default_driver(),
    'db_host'   => (string)$pre['host'],
    'db_port'   => '',   // blank = the usual port for the chosen database
    'db_name'   => (string)$pre['name'],
    'db_user'   => $cfg['configured'] ? (string)$pre['user'] : '',
    'db_path'   => (string)($pre['path'] ?: installer_default_sqlite_path()),
    'create_db' => '1',
];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$upgradeMsg = '';
$upgradeOk  = false;
if (installer_is_installed($cfg)) {
    $step = 'locked';
    // Existing installs can pick up schema changes (for example the daily
    // challenge board) without reinstalling. Only fixed, idempotent
    // migrations run, using the credentials already configured.
    if ($method === 'POST' && ($_POST['action'] ?? '') === 'upgrade'
        && hash_equals($token, (string)($_POST['token'] ?? ''))) {
        try {
            $upgradePdo = installer_open_configured($cfg);
            if ($upgradePdo === null) {
                throw new RuntimeException('database unavailable');
            }
            installer_migrate($upgradePdo);
            $upgradeOk  = true;
            $upgradeMsg = 'Database updated. Your scores were not touched.';
        } catch (Throwable $ex) {
            $upgradeMsg = installer_explain($ex)
                . ' If this user cannot alter tables, run the ALTER TABLE from UPGRADING.md as an administrator.';
        }
    }
} elseif ($method === 'POST') {
    $postedToken = (string)($_POST['token'] ?? '');
    if (!hash_equals($token, $postedToken)) {
        http_response_code(400);
        $step   = 'database';
        $notice = 'Your session expired. Please submit the form again.';
    } elseif (!$canRun) {
        $step = 'requirements';
    } else {
        $step = 'database';
        foreach (array_keys($form) as $k) {
            $form[$k] = trim((string)($_POST[$k] ?? ''));
        }
        if ($form['db_driver'] === '') {
            $form['db_driver'] = installer_default_driver();
        }
        $form['create_db'] = isset($_POST['create_db']) ? '1' : '';
        [$errors, $db] = installer_validate($_POST);
        $adminPass = (string)($_POST['admin_pass'] ?? '');
        if ($adminPass !== '' && strlen($adminPass) < 8) {
            $errors['admin_pass'] = 'Use at least 8 characters, or leave it blank.';
        }

        if (!$errors) {
            try {
                installer_install($db, $form['create_db'] === '1');
                $salt   = bin2hex(random_bytes(32));
                $adminHash = $adminPass !== '' ? password_hash($adminPass, PASSWORD_DEFAULT) : '';
                $source = installer_config_source($db, $salt, $adminHash);
                if (installer_write_config($source)) {
                    $step = 'done';
                } else {
                    $step   = 'manual';
                    $manual = $source;
                }
            } catch (RuntimeException $ex) {
                $notice = $ex->getMessage();
            }
        }
    }
} elseif (($_GET['step'] ?? '') === 'database' && $canRun) {
    $step = 'database';
}

$steps = ['requirements' => 'Requirements', 'database' => 'Database', 'done' => 'Finish'];
$activeTab = ($step === 'manual' || $step === 'locked') ? ($step === 'locked' ? 'done' : 'database') : $step;
$order = array_keys($steps);
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Install — Pixel Run</title>
<link rel="stylesheet" href="assets/css/install.css?v=<?= e((string)$cfg['version']) ?>">
</head>
<body>
<main class="card">
  <header class="brand">
    <h1>Pixel <span>Run</span></h1>
    <p>Installation</p>
  </header>

  <nav class="steps" aria-label="Installation steps">
    <ol>
      <?php foreach ($steps as $key => $label):
        $state = array_search($key, $order, true) < array_search($activeTab, $order, true) ? 'is-done'
               : ($key === $activeTab ? 'is-current' : ''); ?>
        <li class="<?= $state ?>"<?= $key === $activeTab ? ' aria-current="step"' : '' ?>><?= e($label) ?></li>
      <?php endforeach; ?>
    </ol>
  </nav>

<?php if ($step === 'locked'): ?>
  <section>
    <h2>Already installed</h2>
    <p>Pixel Run can reach its database, so the installer is locked.</p>
    <p class="hint">To reinstall, remove <code>includes/config.local.php</code> and
      the <code>scores</code> table first. For safety you can delete
      <code>install.php</code> from the server.</p>
    <?php if ($upgradeMsg): ?>
      <p class="<?= $upgradeOk ? 'ok-note' : 'error' ?>" role="status"><?= e($upgradeMsg) ?></p>
    <?php elseif (installer_schema_outdated($cfg)): ?>
      <form method="post" action="install.php">
        <input type="hidden" name="token" value="<?= e($token) ?>">
        <input type="hidden" name="action" value="upgrade">
        <p><strong>Database update available.</strong> It adds the daily-challenge
           leaderboard. Existing scores are kept.</p>
        <p><button class="btn" type="submit">Update database</button></p>
      </form>
    <?php endif; ?>
    <p><a class="btn" href="./">Play Pixel Run</a></p>
  </section>

<?php elseif ($step === 'requirements'): ?>
  <section>
    <h2>Before we start</h2>
    <p>Pick a database: MySQL or MariaDB, PostgreSQL (you will need its host,
       name, username and password from your hosting panel), or SQLite, which
       needs nothing but a writable folder.</p>
    <ul class="checks">
      <?php foreach ($requirements as $r):
        $cls = $r['ok'] ? 'ok' : (!empty($r['optional']) ? 'warn' : 'fail'); ?>
        <li class="<?= $cls ?>"><span class="dot" aria-hidden="true"></span>
          <span class="label"><?= e($r['label']) ?></span>
          <span class="detail"><?= e($r['detail']) ?></span></li>
      <?php endforeach; ?>
    </ul>
    <?php if ($canRun): ?>
      <p><a class="btn" href="?step=database">Continue</a>
         <a class="skip" href="./">Skip and play offline</a></p>
    <?php else: ?>
      <p class="error">Fix the items marked in red, then reload this page.</p>
    <?php endif; ?>
  </section>

<?php elseif ($step === 'database'): ?>
  <section>
    <h2>Database details</h2>
    <?php if ($notice): ?><p class="error" role="alert"><?= e($notice) ?></p><?php endif; ?>
    <form method="post" action="install.php" autocomplete="off" novalidate>
      <input type="hidden" name="token" value="<?= e($token) ?>">
      <div class="tabs">
        <?php foreach (installer_drivers() as $id => $d):
          $ok = installer_driver_available($id); ?>
          <input type="radio" id="drv-<?= $id ?>" name="db_driver" value="<?= $id ?>"
                 <?= $form['db_driver'] === $id ? 'checked' : '' ?><?= $ok ? '' : ' disabled' ?>>
        <?php endforeach; ?>
        <div class="tablist" role="tablist" aria-label="Database type">
          <?php foreach (installer_drivers() as $id => $d):
            $ok = installer_driver_available($id); ?>
            <label for="drv-<?= $id ?>"<?= $ok ? '' : ' class="off" title="PHP extension ' . e($d['ext']) . ' is not loaded"' ?>><?= e($d['label']) ?></label>
          <?php endforeach; ?>
        </div>
        <?php if (isset($errors['db_driver'])): ?><p class="msg"><?= e($errors['db_driver']) ?></p><?php endif; ?>

        <div class="panel panel-server">
          <div class="grid">
            <label class="field">Host
              <input name="db_host" value="<?= e($form['db_host']) ?>">
              <?php if (isset($errors['db_host'])): ?><span class="msg"><?= e($errors['db_host']) ?></span><?php endif; ?>
            </label>
            <label class="field narrow">Port
              <input name="db_port" value="<?= e($form['db_port']) ?>" inputmode="numeric" placeholder="default">
              <?php if (isset($errors['db_port'])): ?><span class="msg"><?= e($errors['db_port']) ?></span><?php endif; ?>
            </label>
          </div>
          <label class="field">Database name
            <input name="db_name" value="<?= e($form['db_name']) ?>">
            <?php if (isset($errors['db_name'])): ?><span class="msg"><?= e($errors['db_name']) ?></span><?php endif; ?>
          </label>
          <label class="field">Username
            <input name="db_user" value="<?= e($form['db_user']) ?>">
            <?php if (isset($errors['db_user'])): ?><span class="msg"><?= e($errors['db_user']) ?></span><?php endif; ?>
          </label>
          <label class="field">Password
            <input name="db_pass" type="password" autocomplete="new-password">
          </label>
          <label class="check">
            <input type="checkbox" name="create_db" value="1"<?= $form['create_db'] === '1' ? ' checked' : '' ?>>
            Create the database if it does not exist
          </label>
          <p class="hint">Existing scores are never touched. After setup you may
            reduce this user to <code>SELECT</code> and <code>INSERT</code> on
            <code>scores</code>.</p>
        </div>

        <div class="panel panel-sqlite">
          <label class="field">Database file
            <input name="db_path" value="<?= e($form['db_path']) ?>" spellcheck="false">
            <?php if (isset($errors['db_path'])): ?><span class="msg"><?= e($errors['db_path']) ?></span><?php endif; ?>
          </label>
          <p class="hint">Created for you. The default folder, <code>data/</code>,
            is blocked from downloads on Apache; on nginx deny it yourself, or
            use an absolute path outside the web root.</p>
        </div>
      </div>
      <label class="field">Admin password <span class="opt">(optional)</span>
        <input name="admin_pass" type="password" autocomplete="new-password">
        <?php if (isset($errors['admin_pass'])): ?><span class="msg"><?= e($errors['admin_pass']) ?></span><?php endif; ?>
      </label>
      <p class="hint">Enables <code>admin.php</code> and the in-game cheat code
        (god mode, never recorded). Leave blank for no admin.</p>
      <p><button class="btn" type="submit">Install</button>
         <a class="skip" href="./">Skip and play offline</a></p>
    </form>
  </section>

<?php elseif ($step === 'manual'): ?>
  <section>
    <h2>One last step</h2>
    <p>The tables are ready, but <code>includes/</code> is not writable, so the
       settings could not be saved. Create <code>includes/config.local.php</code>
       with exactly this content, then reload.</p>
    <textarea class="code" readonly rows="16" spellcheck="false"><?= e($manual) ?></textarea>
    <p class="hint">This contains your database password. Do not share it.</p>
    <p><a class="btn" href="install.php">I have saved the file</a></p>
  </section>

<?php else: ?>
  <section>
    <h2>All set</h2>
    <p>The database is ready and your settings are saved to
       <code>includes/config.local.php</code>.</p>
    <p class="hint">You can delete <code>install.php</code> from the server now.</p>
    <p><a class="btn" href="./">Play Pixel Run</a></p>
  </section>
<?php endif; ?>
</main>
</body>
</html>
