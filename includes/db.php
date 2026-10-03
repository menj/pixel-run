<?php
/**
 * Pixel Run — Shared helpers.
 *
 * PDO connection (MySQL/MariaDB, PostgreSQL or SQLite), JSON response wrapper, IP hashing, CORS preflight.
 * Required by all API endpoints.
 */

declare(strict_types=1);

/** Supported PDO drivers. MySQL stays the default so old configs keep working. */
const PIXEL_RUN_DRIVERS = ['mysql', 'pgsql', 'sqlite'];

function db_driver(array $db): string
{
    $d = strtolower((string)($db['driver'] ?? 'mysql'));
    return in_array($d, PIXEL_RUN_DRIVERS, true) ? $d : 'mysql';
}

/** Absolute path of the SQLite file; relative paths are from the app root. */
function db_sqlite_path(array $db): string
{
    $p = (string)($db['path'] ?? '');
    if ($p === '') {
        return '';
    }
    $absolute = $p[0] === '/' || $p[0] === '\\' || preg_match('~^[A-Za-z]:[\\\\/]~', $p);
    return $absolute ? $p : dirname(__DIR__) . '/' . $p;
}

/**
 * Connect with the configured driver. $selectDb = false connects to the
 * server without a database (used once, by the installer, to create it).
 */
function db_connect(array $db, bool $selectDb = true): PDO
{
    $opts = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_TIMEOUT            => 3, // an unreachable database must not stall the page
    ];

    switch (db_driver($db)) {
        case 'sqlite':
            $pdo = new PDO('sqlite:' . db_sqlite_path($db), null, null, $opts);
            try {
                // Readers do not block the writer, which suits a busy leaderboard.
                $pdo->exec('PRAGMA journal_mode = WAL');
            } catch (Throwable $e) {
                // Unsupported on some filesystems; the default journal still works.
            }
            return $pdo;

        case 'pgsql':
            $dsn = sprintf(
                'pgsql:host=%s;port=%d;dbname=%s',
                $db['host'],
                (int)($db['port'] ?? 5432),
                $selectDb ? $db['name'] : 'postgres'
            );
            return new PDO($dsn, $db['user'], $db['pass'], $opts);

        default:
            $dsn = sprintf(
                'mysql:host=%s;port=%d;%scharset=%s',
                $db['host'],
                (int)($db['port'] ?? 3306),
                $selectDb ? 'dbname=' . $db['name'] . ';' : '',
                $db['charset'] ?? 'utf8mb4'
            );
            return new PDO($dsn, $db['user'], $db['pass'], $opts);
    }
}

/**
 * Open the database if there is one, without ever throwing.
 *
 * The game works without a database, so "no database" is an expected state,
 * not an error. $reason says why: 'unconfigured' (nobody has set one up;
 * not logged) or 'unreachable' (configured but failing; logged).
 */
function db_open(array $cfg, ?string &$reason = null): ?PDO
{
    $reason = null;
    if (empty($cfg['configured'])) {
        $reason = 'unconfigured';
        return null;
    }
    try {
        // Never let a connection attempt create an empty SQLite file.
        if (db_driver($cfg['db']) === 'sqlite' && !is_file(db_sqlite_path($cfg['db']))) {
            throw new RuntimeException('SQLite file not found');
        }
        return db_connect($cfg['db']);
    } catch (Throwable $e) {
        error_log('[pixel-run] database unreachable: ' . $e->getMessage());
        $reason = 'unreachable';
        return null;
    }
}

/** Connected, but the tables have not been created yet (any driver). */
function db_is_missing_table(Throwable $e): bool
{
    if (!$e instanceof PDOException) {
        return false;
    }
    return (int)($e->errorInfo[1] ?? 0) === 1146                 // MySQL / MariaDB
        || ($e->errorInfo[0] ?? '') === '42P01'                  // PostgreSQL
        || stripos($e->getMessage(), 'no such table') !== false; // SQLite
}

/**
 * 503 reply for "the leaderboard is not available right now". The game
 * treats any non-200 from the API as offline and carries on locally.
 */
function send_unavailable(string $reason, array $extra = []): void
{
    send_json($extra + ['error' => 'database_unavailable', 'offline' => true, 'reason' => $reason], 503);
}

function send_json($payload, int $status = 200): void
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Client address for rate limiting.
 *
 * Proxy headers are client-controlled and would let any submitter pick a
 * fresh address per request, defeating the rate limit. They are honoured
 * only when the TCP peer (REMOTE_ADDR) is a proxy listed in
 * $trustedProxies; otherwise REMOTE_ADDR is the answer.
 *
 * @param string[] $trustedProxies
 */
function client_ip(array $trustedProxies): string
{
    $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if (!filter_var($remote, FILTER_VALIDATE_IP)) {
        return '0.0.0.0';
    }
    if (!in_array($remote, $trustedProxies, true)) {
        return $remote;
    }

    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
        $_SERVER['HTTP_X_REAL_IP']        ?? null,
        $_SERVER['HTTP_X_FORWARDED_FOR']  ?? null,
    ];
    foreach ($candidates as $value) {
        if (!$value) {
            continue;
        }
        // X-Forwarded-For may contain a chain; the first entry is the client.
        $ip = trim(explode(',', (string)$value)[0]);
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            return $ip;
        }
    }
    return $remote;
}

function ip_hash(string $salt, array $trustedProxies): string
{
    return hash('sha256', client_ip($trustedProxies) . '|' . $salt);
}

/**
 * Emit CORS headers only when an origin is configured. A same-origin
 * deployment needs none, and a wildcard would be sent for nothing.
 */
function apply_cors(string $origin): void
{
    if ($origin === '') {
        return;
    }
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Vary: Origin');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
