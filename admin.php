<?php
/**
 * Pixel Run — admin sign-in.
 *
 * A tiny page: sign in with the admin password and the in-game cheat code
 * (god mode) becomes available in this browser. There is no account system;
 * the password hash lives in includes/config.local.php.
 */

declare(strict_types=1);

require __DIR__ . '/includes/db.php';
require __DIR__ . '/includes/admin.php';
$cfg = require __DIR__ . '/includes/config.php';

header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$enabled = admin_enabled($cfg);
$error   = '';
$flash   = '';

if ($enabled) {
    admin_session_start();
    if (empty($_SESSION['pr_token'])) {
        $_SESSION['pr_token'] = bin2hex(random_bytes(16));
    }
    $token  = (string)$_SESSION['pr_token'];
    $client = ip_hash($cfg['ip_salt'], $cfg['trusted_proxies']);
    $in     = admin_session_token($cfg);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'POST') {
        $action = (string)($_POST['action'] ?? '');
        if (!hash_equals($token, (string)($_POST['token'] ?? ''))) {
            http_response_code(400);
            $error = 'Your session expired. Please try again.';
        } elseif ($action === 'logout') {
            unset($_SESSION['pr_admin']);
            session_regenerate_id(true);
            $_SESSION['pr_flash'] = 'Signed out.';
            header('Location: admin.php');
            exit;
        } elseif ($action === 'login') {
            if (admin_throttle_blocked($client)) {
                http_response_code(429);
                $error = 'Too many attempts. Try again in a few minutes.';
            } elseif (password_verify((string)($_POST['password'] ?? ''), (string)$cfg['admin_password_hash'])) {
                admin_throttle_clear($client);
                session_regenerate_id(true);
                $_SESSION['pr_admin'] = $in;
                $_SESSION['pr_flash'] = 'Signed in.';
                header('Location: admin.php');
                exit;
            } else {
                admin_throttle_fail($client);
                usleep(random_int(300000, 700000));   // slow guessing down
                http_response_code(401);
                $error = 'That password is not right.';
            }
        }
    }
    $loggedIn = isset($_SESSION['pr_admin']) && hash_equals($in, (string)$_SESSION['pr_admin']);
    $token    = (string)$_SESSION['pr_token'];
    $flash    = (string)($_SESSION['pr_flash'] ?? '');
    unset($_SESSION['pr_flash']);
    session_write_close();
} else {
    $loggedIn = false;
    $token    = '';
}
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Admin — Pixel Run</title>
<link rel="stylesheet" href="assets/css/install.css?v=<?= e((string)$cfg['version']) ?>">
</head>
<body>
<main class="card">
  <header class="brand">
    <h1>Pixel <span>Run</span></h1>
    <p>Admin</p>
  </header>

<?php if (!$enabled): ?>
  <section>
    <h2>Admin mode is off</h2>
    <p>No admin password has been set. Enter one in the installer, or add a
       hash line to <code>includes/config.local.php</code>:</p>
    <textarea class="code" readonly rows="2" spellcheck="false">'admin_password_hash' => '$2y$10$...paste the hash here...',</textarea>
    <p class="hint">Make a hash with
       <code>php -r "echo password_hash('your-password', PASSWORD_DEFAULT);"</code></p>
    <p><a class="btn" href="./">Back to the game</a></p>
  </section>

<?php elseif ($loggedIn): ?>
  <section>
    <h2>You are signed in</h2>
    <?php if ($flash): ?><p class="ok-note" role="status"><?= e($flash) ?></p><?php endif; ?>
    <p>Cheat code unlocked in this browser. In the game, type
       <code>IDDQD</code> (or tap the title five times on a touch screen) to
       toggle god mode. You cannot die while it is on.</p>
    <p class="hint">Runs where god mode was used are never saved to the
       leaderboard, your best score or your unlocks.</p>
    <form method="post" action="admin.php">
      <input type="hidden" name="token" value="<?= e($token) ?>">
      <input type="hidden" name="action" value="logout">
      <p><a class="btn" href="./">Play</a>
         <button class="skip linklike" type="submit">Sign out</button></p>
    </form>
  </section>

<?php else: ?>
  <section>
    <h2>Sign in</h2>
    <?php if ($flash): ?><p class="ok-note" role="status"><?= e($flash) ?></p><?php endif; ?>
    <?php if ($error): ?><p class="error" role="alert"><?= e($error) ?></p><?php endif; ?>
    <form method="post" action="admin.php" autocomplete="off">
      <input type="hidden" name="token" value="<?= e($token) ?>">
      <input type="hidden" name="action" value="login">
      <label class="field">Admin password
        <input name="password" type="password" autocomplete="current-password" required autofocus>
      </label>
      <p><button class="btn" type="submit">Sign in</button>
         <a class="skip" href="./">Back to the game</a></p>
    </form>
  </section>
<?php endif; ?>
</main>
</body>
</html>
