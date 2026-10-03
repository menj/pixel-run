<?php
/**
 * Pixel Run — admin helpers.
 *
 * "Admin" means someone who knows the password whose hash is stored in
 * config.local.php as 'admin_password_hash'. With no hash configured, admin
 * mode does not exist. Nothing here needs the database, so it works on a
 * database-free install too.
 *
 * The cheat code in the game is only switched on when the server reports
 * isAdmin. Cheated runs are never recorded (the game refuses to submit them
 * and submit-score.php rejects a payload flagged as cheated).
 */

declare(strict_types=1);

const PIXEL_RUN_ADMIN_COOKIE = 'pixelrun_admin';

function admin_enabled(array $cfg): bool
{
    return !empty($cfg['admin_password_hash']) && is_string($cfg['admin_password_hash']);
}

/** Token stored in the session. Changing the password invalidates old logins. */
function admin_session_token(array $cfg): string
{
    return hash('sha256', 'pixel-run-admin|' . (string)$cfg['admin_password_hash']);
}

function admin_cookie_path(): string
{
    $dir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    return $dir . '/';
}

function admin_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name(PIXEL_RUN_ADMIN_COOKIE);
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_set_cookie_params([
        'path'     => admin_cookie_path(),
        'httponly' => true,
        'secure'   => $https,
        'samesite' => 'Strict',
    ]);
    session_start();
}

/**
 * Whether this request comes from a logged-in admin. Cheap for everyone else:
 * without the admin cookie no session is started at all.
 */
function admin_is_logged_in(array $cfg): bool
{
    if (!admin_enabled($cfg) || empty($_COOKIE[PIXEL_RUN_ADMIN_COOKIE])) {
        return false;
    }
    admin_session_start();
    $ok = isset($_SESSION['pr_admin'])
        && hash_equals(admin_session_token($cfg), (string)$_SESSION['pr_admin']);
    session_write_close();
    return $ok;
}

/* ----------------------------------------------------------------
 * Brute-force throttle: at most 6 failed logins per client per 15 minutes.
 * Kept in a small temp file so cookie-less retries cannot reset it.
 * --------------------------------------------------------------*/

const PIXEL_RUN_ADMIN_MAX_FAILS = 6;
const PIXEL_RUN_ADMIN_WINDOW    = 900;

function admin_throttle_file(string $clientKey): string
{
    return sys_get_temp_dir() . '/pixel_run_admin_' . substr(hash('sha256', $clientKey), 0, 24) . '.json';
}

function admin_throttle_read(string $clientKey): array
{
    $file = admin_throttle_file($clientKey);
    $raw  = is_file($file) ? @file_get_contents($file) : false;
    $data = $raw ? json_decode($raw, true) : null;
    if (!is_array($data) || ($data['first'] ?? 0) < time() - PIXEL_RUN_ADMIN_WINDOW) {
        return ['n' => 0, 'first' => time()];
    }
    return ['n' => (int)$data['n'], 'first' => (int)$data['first']];
}

function admin_throttle_blocked(string $clientKey): bool
{
    return admin_throttle_read($clientKey)['n'] >= PIXEL_RUN_ADMIN_MAX_FAILS;
}

function admin_throttle_fail(string $clientKey): void
{
    $d = admin_throttle_read($clientKey);
    $d['n']++;
    @file_put_contents(admin_throttle_file($clientKey), json_encode($d), LOCK_EX);
}

function admin_throttle_clear(string $clientKey): void
{
    @unlink(admin_throttle_file($clientKey));
}
