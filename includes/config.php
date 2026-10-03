<?php
/**
 * Pixel Run — Configuration
 *
 * The easiest setup is to open install.php in your browser: it creates the
 * tables and writes your credentials to config.local.php. You can instead
 * edit the database credentials below by hand.
 * The includes/ directory is denied to browsers by .htaccess; if your
 * host ignores .htaccess, move this file outside the web root and
 * adjust the require paths in index.php and api/*.php.
 */

$config = [
    // Application version (semver). Also used as the asset cache-buster.
    'version' => '1.0.0',

    'db' => [
        'host'    => '127.0.0.1',
        'name'    => 'pixel_run',
        'user'    => 'pixel_run_app',
        'pass'    => 'CHANGE_THIS_PASSWORD',
        'charset' => 'utf8mb4',
        'port'    => 3306,
    ],

    // CORS: leave empty for a same-origin deployment (no CORS headers are
    // sent). Set to an origin such as 'https://example.com' only when the
    // game page is served from a different origin than the API.
    'cors_origin'        => '',

    // Reverse-proxy IPs whose X-Forwarded-For / X-Real-IP / CF-Connecting-IP
    // headers may be trusted for rate limiting. Leave empty on plain cPanel
    // or direct-Apache hosting: REMOTE_ADDR is already the client address.
    // Example for a single proxy: ['10.0.0.5']. Cloudflare publishes its
    // ranges at https://www.cloudflare.com/ips/ — list them here if in use.
    'trusted_proxies'    => [],

    // Validation bounds.
    'name_min_len'       => 1,
    'name_max_len'       => 20,
    'max_score'          => 999999,
    'max_duration_ms'    => 24 * 60 * 60 * 1000, // 24h; longer runs are rejected

    // Rate limit: minimum seconds between submissions per IP hash.
    'rate_limit_seconds' => 3,

    // Salt used when hashing IP addresses. Change to anything unique.
    'ip_salt'            => 'change-this-to-a-random-string-for-your-deployment',

    // Default leaderboard size when limit not supplied.
    'default_limit'      => 10,
    'max_limit'          => 50,
];

// install.php writes database credentials and a random ip_salt to
// config.local.php. Anything defined there wins over the values above, and
// it survives upgrades because the file is not part of the package.
$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    try {
        $config = array_replace_recursive($config, (array)require $local);
    } catch (Throwable $e) {
        // A damaged settings file must not take the game down with it.
        error_log('[pixel-run] ignoring unreadable config.local.php: ' . $e->getMessage());
    }
}

// True once somebody has supplied real database credentials, either through
// install.php or by editing the defaults above. While false, the game runs
// in local-only mode and never tries to connect.
$config['configured'] = is_file($local) || $config['db']['pass'] !== 'CHANGE_THIS_PASSWORD';

return $config;
