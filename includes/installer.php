<?php
/**
 * Pixel Run — installer helpers.
 *
 * Used by install.php. Kept out of the web-facing script so the logic can be
 * read, tested and reused on its own. Nothing here runs at include time.
 * Supports MySQL/MariaDB, PostgreSQL and SQLite through PDO.
 */

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/scores.php';   // PIXEL_RUN_CHARACTERS

/** Credentials written by the installer; merged over config.php. */
const PIXEL_RUN_LOCAL_CONFIG = __DIR__ . '/config.local.php';

/** The password shipped in config.php. Seeing it means nobody has configured the app. */
const PIXEL_RUN_PLACEHOLDER_PASS = 'CHANGE_THIS_PASSWORD';

/** Human names and PHP extensions for the supported drivers. */
function installer_drivers(): array
{
    return [
        'mysql'  => ['label' => 'MySQL / MariaDB', 'ext' => 'pdo_mysql',  'port' => 3306],
        'pgsql'  => ['label' => 'PostgreSQL',      'ext' => 'pdo_pgsql',  'port' => 5432],
        'sqlite' => ['label' => 'SQLite',          'ext' => 'pdo_sqlite', 'port' => 0],
    ];
}

function installer_driver_available(string $driver): bool
{
    $d = installer_drivers();
    return isset($d[$driver]) && extension_loaded($d[$driver]['ext']);
}

/** First driver whose PHP extension is loaded, MySQL preferred. */
function installer_default_driver(): string
{
    foreach (array_keys(installer_drivers()) as $d) {
        if (installer_driver_available($d)) {
            return $d;
        }
    }
    return 'mysql';
}

/** Schema file for a driver. schema.sql (MySQL) also works with the mysql CLI. */
function installer_schema_file(string $driver): string
{
    $dir = dirname(__DIR__) . '/sql/';
    return $driver === 'mysql' ? $dir . 'schema.sql' : $dir . 'schema.' . $driver . '.sql';
}

/* ----------------------------------------------------------------
 * Environment checks
 * --------------------------------------------------------------*/

/**
 * @return array<int, array{label:string, ok:bool, detail:string}>
 */
function installer_requirements(): array
{
    $dir = __DIR__;
    $have = [];
    foreach (installer_drivers() as $id => $d) {
        if (installer_driver_available($id)) {
            $have[] = $d['label'];
        }
    }
    $schemas = true;
    foreach (array_keys(installer_drivers()) as $id) {
        $schemas = $schemas && is_readable(installer_schema_file($id));
    }
    return [
        [
            'label'  => 'PHP 7.4 or newer',
            'ok'     => PHP_VERSION_ID >= 70400,
            'detail' => 'Running ' . PHP_VERSION,
        ],
        [
            'label'  => 'A database driver',
            'ok'     => $have !== [],
            'detail' => $have ? 'Available: ' . implode(', ', $have)
                              : 'Enable pdo_mysql, pdo_pgsql or pdo_sqlite in php.ini',
        ],
        [
            'label'  => 'Schema files present',
            'ok'     => $schemas,
            'detail' => 'sql/',
        ],
        [
            'label'  => 'includes/ is writable',
            'ok'     => is_writable($dir),
            'detail' => is_writable($dir)
                ? 'Settings will be saved automatically'
                : 'Optional: you will be shown the settings file to upload yourself',
            'optional' => true,
        ],
    ];
}

/** True when every non-optional requirement passes. */
function installer_can_run(): bool
{
    foreach (installer_requirements() as $r) {
        if (!$r['ok'] && empty($r['optional'])) {
            return false;
        }
    }
    return true;
}

/* ----------------------------------------------------------------
 * Input
 * --------------------------------------------------------------*/

/** A fresh, hard-to-guess SQLite location inside the protected data/ folder. */
function installer_default_sqlite_path(): string
{
    return 'data/pixel-run-' . bin2hex(random_bytes(6)) . '.sqlite';
}

/**
 * Validate and normalise the database form.
 *
 * @return array{0: array<string,string>, 1: array<string,mixed>} [errors, clean]
 */
function installer_validate(array $in): array
{
    $errors = [];
    $driver = (string)($in['db_driver'] ?? 'mysql');
    $drivers = installer_drivers();
    if (!isset($drivers[$driver]) || !installer_driver_available($driver)) {
        $errors['db_driver'] = 'That database type is not available on this server.';
        $driver = installer_default_driver();
    }

    if ($driver === 'sqlite') {
        $path = trim((string)($in['db_path'] ?? ''));
        if ($path === '') {
            $path = installer_default_sqlite_path();
        }
        if (strlen($path) > 255 || preg_match('/[\x00-\x1f]/', $path)) {
            $errors['db_path'] = 'That file path is not valid.';
        } elseif (!preg_match('/\.(sqlite3?|db)$/i', $path)) {
            $errors['db_path'] = 'End the file name with .sqlite, .sqlite3 or .db.';
        } elseif (preg_match('~(^|[\\\\/])\.\.([\\\\/]|$)~', $path)) {
            $errors['db_path'] = 'Do not use ".." in the path.';
        }
        return [$errors, ['driver' => 'sqlite', 'path' => $path]];
    }

    $host = trim((string)($in['db_host'] ?? ''));
    $port = trim((string)($in['db_port'] ?? ''));
    $name = trim((string)($in['db_name'] ?? ''));
    $user = trim((string)($in['db_user'] ?? ''));
    $pass = (string)($in['db_pass'] ?? '');
    if ($port === '') {
        $port = (string)$drivers[$driver]['port'];   // blank means the usual port
    }

    if ($host === '' || !preg_match('/^[A-Za-z0-9._:\-\[\]]{1,255}$/', $host)) {
        $errors['db_host'] = 'Enter the database host, for example localhost.';
    }
    if (!ctype_digit($port) || (int)$port < 1 || (int)$port > 65535) {
        $errors['db_port'] = 'Port must be a number between 1 and 65535.';
    }
    if (!preg_match('/^[A-Za-z0-9_]{1,63}$/', $name)) {
        $errors['db_name'] = 'Use letters, numbers and underscores only (max 63).';
    }
    if ($user === '' || strlen($user) > 80) {
        $errors['db_user'] = 'Enter the database username.';
    }

    $clean = [
        'driver' => $driver,
        'host'   => $host,
        'port'   => (int)$port,
        'name'   => $name,
        'user'   => $user,
        'pass'   => $pass,
    ];
    if ($driver === 'mysql') {
        $clean['charset'] = 'utf8mb4';
    }
    return [$errors, $clean];
}

/* ----------------------------------------------------------------
 * Database
 * --------------------------------------------------------------*/

function installer_connect(array $db, bool $selectDb = true): PDO
{
    return db_connect($db, $selectDb);
}

/** Turn a PDO failure into something a site owner can act on. */
function installer_explain(Throwable $e): string
{
    $msg   = $e->getMessage();
    $code  = 0;
    $state = '';
    if ($e instanceof PDOException) {
        $code  = (int)($e->errorInfo[1] ?? 0);
        $state = (string)($e->errorInfo[0] ?? '');
    }
    if ($state === '' && preg_match('/SQLSTATE\[(\w+)\]/', $msg, $m)) {
        $state = $m[1];
    }
    if ($code === 0 && preg_match('/\[(\d{4})\]/', $msg, $m)) {
        $code = (int)$m[1];
    }

    if (stripos($msg, 'unable to open database file') !== false) {
        return 'Could not open or create the SQLite file. Check that its folder exists and is writable.';
    }
    if (stripos($msg, 'readonly') !== false || stripos($msg, 'read-only') !== false) {
        return 'The SQLite file or its folder is read-only. Make it writable by the web server.';
    }
    if (in_array($state, ['28P01', '28000'], true) || $code === 1045
        || stripos($msg, 'authentication failed') !== false) {
        return 'Access denied. Check the username and password.';
    }
    if ($code === 1044) {
        return 'This user is not allowed to use that database.';
    }
    if ($code === 1049 || $state === '3D000') {
        return 'That database does not exist, and this user cannot create it. Create it first in your hosting panel.';
    }
    if (in_array($code, [2002, 2003, 2006], true)
        || in_array($state, ['08001', '08004', '08006'], true)
        || stripos($msg, 'connection refused') !== false) {
        return 'Could not reach the database server. Check the host and port.';
    }
    if ($code === 1142 || $state === '42501') {
        return 'This user lacks the privileges needed to create tables (CREATE, ALTER, INSERT, SELECT).';
    }
    error_log('[pixel-run] installer: ' . $msg);
    return 'The database refused the request. See the PHP error log for details.';
}

/**
 * Statements from a schema file that belong inside the chosen database.
 *
 * The schema files stay the single source of truth for the table layout and
 * still work with each database's own CLI. The installer drops what it
 * handles itself (CREATE DATABASE, USE) and full-line comments.
 *
 * @return string[]
 */
function installer_schema_statements(string $file): array
{
    $sql = (string)file_get_contents($file);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $out = [];
    foreach (explode(';', (string)$sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '' || preg_match('/^(CREATE\s+DATABASE|USE)\b/i', $stmt)) {
            continue;
        }
        $out[] = $stmt;
    }
    return $out;
}

/**
 * Make sure a SQLite file can be created: folder exists and is writable, any
 * existing file really is SQLite, and the default data/ folder is shielded
 * from direct downloads.
 *
 * @throws RuntimeException with a message safe to show to the user
 */
function installer_prepare_sqlite(array $db): void
{
    $file = db_sqlite_path($db);
    $dir  = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
        throw new RuntimeException('Could not create the folder for the SQLite file: ' . $dir);
    }
    if (!is_writable($dir)) {
        throw new RuntimeException('The folder for the SQLite file is not writable: ' . $dir);
    }
    if (is_file($file)) {
        $head = (string)@file_get_contents($file, false, null, 0, 16);
        if ($head !== '' && strncmp($head, "SQLite format 3\0", 16) !== 0) {
            throw new RuntimeException('That file already exists and is not a SQLite database.');
        }
    }
    // Keep the database out of reach of browsers when it lives under the app.
    $root = realpath(dirname(__DIR__));
    $real = realpath($dir);
    if ($root !== false && $real !== false && strpos($real . '/', $root . '/') === 0) {
        $ht = $real . '/.htaccess';
        if (!is_file($ht)) {
            @file_put_contents($ht, "Require all denied\nOptions -Indexes\n");
        }
    }
}

/**
 * Create the database if allowed, then create or upgrade the tables.
 * Safe to run repeatedly: existing scores are never touched.
 *
 * @throws RuntimeException with a message safe to show to the user
 */
function installer_install(array $db, bool $createDb): void
{
    $driver = db_driver($db);

    if ($driver === 'sqlite') {
        installer_prepare_sqlite($db);
    } elseif ($createDb) {
        try {
            $root = installer_connect($db, false);
            if ($driver === 'pgsql') {
                $has = $root->prepare('SELECT 1 FROM pg_database WHERE datname = ?');
                $has->execute([$db['name']]);
                if (!$has->fetchColumn()) {
                    $root->exec(sprintf('CREATE DATABASE "%s"', $db['name']));
                }
            } else {
                $root->exec(sprintf(
                    'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
                    $db['name']
                ));
            }
        } catch (Throwable $e) {
            // Many shared hosts forbid this; carry on and let the next
            // connection report whether the database is usable. A wrong
            // password is the one failure worth stopping on.
            if ($e instanceof PDOException) {
                $state = (string)($e->errorInfo[0] ?? '');
                if ((int)($e->errorInfo[1] ?? 0) === 1045 || in_array($state, ['28P01', '28000'], true)) {
                    throw new RuntimeException(installer_explain($e));
                }
            }
        }
    }

    try {
        $pdo = installer_connect($db);
    } catch (Throwable $e) {
        throw new RuntimeException(installer_explain($e));
    }

    try {
        foreach (installer_schema_statements(installer_schema_file($driver)) as $stmt) {
            $pdo->exec($stmt);
        }
        installer_migrate($pdo);
    } catch (Throwable $e) {
        throw new RuntimeException(installer_explain($e));
    }

    if ($driver === 'sqlite') {
        @chmod(db_sqlite_path($db), 0660);
    }
}

/**
 * Bring an existing scores table up to date: the full character list (MySQL
 * keeps it in an ENUM) and the daily-challenge column. Idempotent, and it
 * never touches existing rows.
 */
function installer_migrate(PDO $pdo): void
{
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);

    if ($driver === 'mysql') {
        $enum = implode(',', array_map(
            static fn(string $c): string => "'" . $c . "'",
            PIXEL_RUN_CHARACTERS
        ));
        $pdo->exec("ALTER TABLE scores MODIFY character_type ENUM($enum) NOT NULL DEFAULT 'dino'");
    }

    if (!installer_has_challenge_column($pdo)) {
        if ($driver === 'mysql') {
            $pdo->exec(
                'ALTER TABLE scores
                   ADD COLUMN challenge_date DATE DEFAULT NULL,
                   ADD INDEX idx_challenge (challenge_date, score)'
            );
        } else {
            $type = $driver === 'sqlite' ? 'TEXT' : 'DATE';
            $pdo->exec("ALTER TABLE scores ADD COLUMN challenge_date $type");
            $pdo->exec('CREATE INDEX IF NOT EXISTS idx_challenge ON scores (challenge_date, score)');
        }
    }
}

function installer_has_challenge_column(PDO $pdo): bool
{
    try {
        $pdo->query('SELECT challenge_date FROM scores WHERE 1 = 0');
        return true;
    } catch (PDOException $e) {
        return false;
    }
}

/** A connection for an already-configured database, or null (never creates a SQLite file). */
function installer_open_configured(array $cfg): ?PDO
{
    $db = $cfg['db'] ?? [];
    if (empty($cfg['configured'])) {
        return null;
    }
    if (db_driver($db) === 'sqlite' && !is_file(db_sqlite_path($db))) {
        return null;
    }
    try {
        return installer_connect($db);
    } catch (Throwable $e) {
        return null;
    }
}

/** True when the database is reachable but predates the current schema. */
function installer_schema_outdated(array $cfg): bool
{
    $pdo = installer_open_configured($cfg);
    return $pdo !== null && !installer_has_challenge_column($pdo);
}

/** True when the configured database answers and the scores table exists. */
function installer_is_installed(array $cfg): bool
{
    $pdo = installer_open_configured($cfg);
    if ($pdo === null) {
        return false;
    }
    try {
        $pdo->query('SELECT 1 FROM scores LIMIT 1');
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * True on a fresh upload that nobody has configured: no database settings
 * yet (see 'configured' in config.php).
 */
function installer_needed(array $cfg): bool
{
    return isset($cfg['configured'])
        ? !$cfg['configured']
        : (!is_file(PIXEL_RUN_LOCAL_CONFIG)
            && ($cfg['db']['pass'] ?? '') === PIXEL_RUN_PLACEHOLDER_PASS);
}

/* ----------------------------------------------------------------
 * Settings file
 * --------------------------------------------------------------*/

function installer_config_source(array $db, string $salt, string $adminHash = ''): string
{
    $export = static fn($v): string => var_export($v, true);
    $driver = db_driver($db);
    $keys   = $driver === 'sqlite'
        ? ['driver', 'path']
        : ($driver === 'pgsql'
            ? ['driver', 'host', 'port', 'name', 'user', 'pass']
            : ['driver', 'host', 'port', 'name', 'user', 'pass', 'charset']);

    $lines = '';
    foreach ($keys as $k) {
        $v = $k === 'port' ? (int)$db[$k] : (string)($db[$k] ?? '');
        $lines .= sprintf("        %-9s => %s,\n", "'" . $k . "'", $export($v));
    }
    return "<?php\n"
        . "/**\n"
        . " * Pixel Run — settings written by install.php on " . gmdate('Y-m-d H:i') . " UTC.\n"
        . " * Merged over includes/config.php. Safe to edit; keep it private.\n"
        . " */\n\n"
        . "return [\n"
        . "    'db' => [\n"
        . $lines
        . "    ],\n"
        . "    'ip_salt' => " . $export($salt) . ",\n"
        . ($adminHash !== '' ? "    'admin_password_hash' => " . $export($adminHash) . ",\n" : '')
        . "];\n";
}

/** Write the settings file atomically with owner-only permissions. */
function installer_write_config(string $source): bool
{
    $tmp = PIXEL_RUN_LOCAL_CONFIG . '.tmp' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $source, LOCK_EX) === false) {
        return false;
    }
    @chmod($tmp, 0600);
    if (!@rename($tmp, PIXEL_RUN_LOCAL_CONFIG)) {
        @unlink($tmp);
        return false;
    }
    return true;
}
