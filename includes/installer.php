<?php
/**
 * Pixel Run — installer helpers.
 *
 * Used by install.php. Kept out of the web-facing script so the logic can be
 * read, tested and reused on its own. Nothing here runs at include time.
 */

declare(strict_types=1);

require_once __DIR__ . '/scores.php';   // PIXEL_RUN_CHARACTERS

/** Credentials written by the installer; merged over config.php. */
const PIXEL_RUN_LOCAL_CONFIG = __DIR__ . '/config.local.php';

/** The password shipped in config.php. Seeing it means nobody has configured the app. */
const PIXEL_RUN_PLACEHOLDER_PASS = 'CHANGE_THIS_PASSWORD';

/* ----------------------------------------------------------------
 * Environment checks
 * --------------------------------------------------------------*/

/**
 * @return array<int, array{label:string, ok:bool, detail:string}>
 */
function installer_requirements(): array
{
    $dir = __DIR__;
    return [
        [
            'label'  => 'PHP 7.4 or newer',
            'ok'     => PHP_VERSION_ID >= 70400,
            'detail' => 'Running ' . PHP_VERSION,
        ],
        [
            'label'  => 'PDO MySQL extension',
            'ok'     => extension_loaded('pdo_mysql'),
            'detail' => extension_loaded('pdo_mysql') ? 'Loaded' : 'Enable pdo_mysql in php.ini',
        ],
        [
            'label'  => 'Schema file present',
            'ok'     => is_readable(dirname(__DIR__) . '/sql/schema.sql'),
            'detail' => 'sql/schema.sql',
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

/**
 * Validate and normalise the database form.
 *
 * @return array{0: array<string,string>, 1: array<string,mixed>} [errors, clean]
 */
function installer_validate(array $in): array
{
    $errors = [];
    $host = trim((string)($in['db_host'] ?? ''));
    $port = trim((string)($in['db_port'] ?? '3306'));
    $name = trim((string)($in['db_name'] ?? ''));
    $user = trim((string)($in['db_user'] ?? ''));
    $pass = (string)($in['db_pass'] ?? '');

    if ($host === '' || !preg_match('/^[A-Za-z0-9._:\-\[\]]{1,255}$/', $host)) {
        $errors['db_host'] = 'Enter the database host, for example localhost.';
    }
    if (!ctype_digit($port) || (int)$port < 1 || (int)$port > 65535) {
        $errors['db_port'] = 'Port must be a number between 1 and 65535.';
    }
    if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $name)) {
        $errors['db_name'] = 'Use letters, numbers and underscores only (max 64).';
    }
    if ($user === '' || strlen($user) > 80) {
        $errors['db_user'] = 'Enter the database username.';
    }

    return [$errors, [
        'host'    => $host,
        'port'    => (int)$port,
        'name'    => $name,
        'user'    => $user,
        'pass'    => $pass,
        'charset' => 'utf8mb4',
    ]];
}

/* ----------------------------------------------------------------
 * Database
 * --------------------------------------------------------------*/

function installer_connect(array $db, bool $selectDb = true): PDO
{
    $dsn = sprintf(
        'mysql:host=%s;port=%d;%scharset=%s',
        $db['host'],
        (int)($db['port'] ?? 3306),
        $selectDb ? 'dbname=' . $db['name'] . ';' : '',
        $db['charset'] ?? 'utf8mb4'
    );
    return new PDO($dsn, $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT            => 5,
    ]);
}

/** Turn a PDO failure into something a site owner can act on. */
function installer_explain(Throwable $e): string
{
    $code = 0;
    if ($e instanceof PDOException && isset($e->errorInfo[1])) {
        $code = (int)$e->errorInfo[1];
    } elseif (preg_match('/\[(\d{4})\]/', $e->getMessage(), $m)) {
        $code = (int)$m[1];
    }
    switch ($code) {
        case 1045: return 'Access denied. Check the username and password.';
        case 1044: return 'This user is not allowed to use that database.';
        case 1049: return 'That database does not exist, and this user cannot create it. Create it first in your hosting panel.';
        case 2002:
        case 2003:
        case 2006: return 'Could not reach the database server. Check the host and port.';
        case 1142: return 'This user lacks the privileges needed to create tables (CREATE, ALTER, INSERT, SELECT).';
    }
    error_log('[pixel-run] installer: ' . $e->getMessage());
    return 'The database refused the request. See the PHP error log for details.';
}

/**
 * Statements from sql/schema.sql that belong inside the chosen database.
 *
 * schema.sql stays the single source of truth for the table layout and still
 * works with the mysql CLI. The installer drops what it handles itself
 * (CREATE DATABASE, USE) and the commented-out user setup.
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
 * Create the database if allowed, then create or upgrade the tables.
 * Safe to run repeatedly: existing scores are never touched.
 *
 * @throws RuntimeException with a message safe to show to the user
 */
function installer_install(array $db, bool $createDb): void
{
    if ($createDb) {
        try {
            $root = installer_connect($db, false);
            $root->exec(sprintf(
                'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
                $db['name']
            ));
        } catch (Throwable $e) {
            // Many shared hosts forbid this; carry on and let the next
            // connection report whether the database is usable.
            if ($e instanceof PDOException && (int)($e->errorInfo[1] ?? 0) === 1045) {
                throw new RuntimeException(installer_explain($e));
            }
        }
    }

    try {
        $pdo = installer_connect($db);
    } catch (Throwable $e) {
        throw new RuntimeException(installer_explain($e));
    }

    try {
        foreach (installer_schema_statements(dirname(__DIR__) . '/sql/schema.sql') as $stmt) {
            $pdo->exec($stmt);
        }
        installer_migrate($pdo);
    } catch (Throwable $e) {
        throw new RuntimeException(installer_explain($e));
    }
}

/**
 * Bring an existing scores table up to date: the full character list and the
 * daily-challenge column. Idempotent, and it never touches existing rows.
 */
function installer_migrate(PDO $pdo): void
{
    $enum = implode(',', array_map(
        static fn(string $c): string => "'" . $c . "'",
        PIXEL_RUN_CHARACTERS
    ));
    $pdo->exec("ALTER TABLE scores MODIFY character_type ENUM($enum) NOT NULL DEFAULT 'dino'");

    if (!installer_has_challenge_column($pdo)) {
        $pdo->exec(
            'ALTER TABLE scores
               ADD COLUMN challenge_date DATE DEFAULT NULL,
               ADD INDEX idx_challenge (challenge_date, score)'
        );
    }
}

function installer_has_challenge_column(PDO $pdo): bool
{
    return $pdo->query("SHOW COLUMNS FROM scores LIKE 'challenge_date'")->fetch() !== false;
}

/** True when the database is reachable but predates the current schema. */
function installer_schema_outdated(array $cfg): bool
{
    try {
        $pdo = installer_connect($cfg['db'] ?? []);
        return !installer_has_challenge_column($pdo);
    } catch (Throwable $e) {
        return false;
    }
}

/** True when the configured database answers and the scores table exists. */
function installer_is_installed(array $cfg): bool
{
    $db = $cfg['db'] ?? [];
    if (($db['pass'] ?? '') === PIXEL_RUN_PLACEHOLDER_PASS && !is_file(PIXEL_RUN_LOCAL_CONFIG)) {
        return false;
    }
    try {
        $pdo = installer_connect($db);
        $pdo->query('SELECT 1 FROM scores LIMIT 1');
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * True on a fresh upload that nobody has configured: no generated settings
 * file and the placeholder password still in config.php.
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

function installer_config_source(array $db, string $salt): string
{
    $export = static fn($v): string => var_export($v, true);
    return "<?php\n"
        . "/**\n"
        . " * Pixel Run — settings written by install.php on " . gmdate('Y-m-d H:i') . " UTC.\n"
        . " * Merged over includes/config.php. Safe to edit; keep it private.\n"
        . " */\n\n"
        . "return [\n"
        . "    'db' => [\n"
        . "        'host'    => " . $export($db['host']) . ",\n"
        . "        'port'    => " . (int)$db['port'] . ",\n"
        . "        'name'    => " . $export($db['name']) . ",\n"
        . "        'user'    => " . $export($db['user']) . ",\n"
        . "        'pass'    => " . $export($db['pass']) . ",\n"
        . "        'charset' => 'utf8mb4',\n"
        . "    ],\n"
        . "    'ip_salt' => " . $export($salt) . ",\n"
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
