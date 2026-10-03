<?php
/**
 * Pixel Run — GET /api/get-scores.php
 *
 * Query params:
 *   limit     1..max_limit      (default: default_limit)
 *   character "dino" | "cat" | "penguin" | "robot" | "all"  (default: "all")
 *   challenge "today" | YYYY-MM-DD   daily-challenge board (default: ordinary runs)
 *
 * Returns:
 *   200 { scores: [ ... ], total: 142 }
 *   503 { error: "database_unavailable", offline: true }  (no database; game plays locally)
 *   500 { error: "server_error" }
 */

declare(strict_types=1);

require __DIR__ . '/../includes/db.php';
require __DIR__ . '/../includes/scores.php';
$cfg = require __DIR__ . '/../includes/config.php';

apply_cors($cfg['cors_origin']);

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    send_json(['error' => 'method_not_allowed'], 405);
}

$limit = (int)($_GET['limit'] ?? $cfg['default_limit']);
$limit = max(1, min((int)$cfg['max_limit'], $limit));

$character = (string)($_GET['character'] ?? 'all');
$filter = in_array($character, PIXEL_RUN_CHARACTERS, true) ? $character : null;

$challenge = parse_challenge($_GET['challenge'] ?? null);
if ($challenge === false) {
    send_json(['error' => 'invalid_challenge'], 400);
}

$pdo = db_open($cfg, $reason);
if ($pdo === null) {
    send_unavailable($reason);
}

try {
    $scores = fetch_top_scores($pdo, $filter, $limit, $challenge);
    $total  = fetch_total_count($pdo, $filter, $challenge);

    send_json([
        'scores' => $scores,
        'total'  => $total,
    ]);
} catch (Throwable $e) {
    if (db_is_missing_table($e)) {
        send_unavailable('not_installed');
    }
    error_log('[pixel-run] get_scores: ' . $e->getMessage());
    send_json(['error' => 'server_error'], 500);
}
