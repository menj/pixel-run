<?php
/**
 * Pixel Run — POST /api/submit-score.php
 *
 * AJAX endpoint. Body is JSON:
 *   {
 *     "name":         "PLAYER",
 *     "score":        1234,
 *     "character":    "dino" | "cat" | "penguin" | "robot",
 *     "obstacles":    42,
 *     "duration_ms":  67000,
 *     "challenge":    "2026-10-03"   (optional: UTC date of a daily course)
 *   }
 *
 * Returns:
 *   200 { ok: true,  rank: 7, total: 142 }
 *   400 { ok: false, error: "invalid_name_chars" }   (validation)
 *   429 { ok: false, error: "rate_limited" }
 *   503 { ok: false, error: "database_unavailable" } (no database; score stays local)
 *   500 { ok: false, error: "server_error" }
 *
 * Validation, rate-limiting and the insert are shared with the form
 * fallback in index.php through includes/scores.php.
 */

declare(strict_types=1);

require __DIR__ . '/../includes/db.php';
require __DIR__ . '/../includes/scores.php';
$cfg = require __DIR__ . '/../includes/config.php';

apply_cors($cfg['cors_origin']);

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    send_json(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

$body = read_json_body();

// Validate before opening the database connection, so a malformed payload
// receives 400 even while MySQL is unavailable.
$check = validate_score_payload($body, $cfg);
if (!$check['ok']) {
    send_json(['ok' => false, 'error' => $check['error']], 400);
}

$pdo = db_open($cfg, $reason);
if ($pdo === null) {
    send_unavailable($reason, ['ok' => false]);
}

try {
    $hash = ip_hash($cfg['ip_salt'], $cfg['trusted_proxies']);
    $ua   = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);

    $result = record_score($pdo, $cfg, $check['clean'], $hash, $ua);

    if ($result['ok']) {
        send_json($result, 200);
    }
    if (($result['error'] ?? '') === 'database_unavailable') {
        send_json($result + ['offline' => true], 503);
    }
    $status = ($result['error'] ?? '') === 'rate_limited' ? 429 : 400;
    send_json($result, $status);
} catch (Throwable $e) {
    if (db_is_missing_table($e)) {
        send_unavailable('not_installed', ['ok' => false]);
    }
    error_log('[pixel-run] submit_score: ' . $e->getMessage());
    send_json(['ok' => false, 'error' => 'server_error'], 500);
}
