<?php
/**
 * Pixel Run — Shared score logic.
 *
 * Used by both index.php (server-side rendering and POST fallback) and
 * the api/ AJAX endpoints. Centralising the validation and queries here
 * keeps the rules in one place.
 */

declare(strict_types=1);

/**
 * Fetch the top N scores, optionally filtered by character.
 *
 * @param PDO         $pdo
 * @param string|null $character 'dino' | 'cat' | null for all
 * @param int         $limit
 * @return array<int, array{player_name:string,score:int,character_type:string,created_at:string}>
 */
function fetch_top_scores(PDO $pdo, ?string $character, int $limit): array
{
    $limit = max(1, min(100, $limit));
    $where  = '';
    $params = [];
    if ($character === 'dino' || $character === 'cat') {
        $where    = 'WHERE character_type = ?';
        $params[] = $character;
    }
    $sql = "SELECT player_name, score, character_type, created_at
              FROM scores
              $where
          ORDER BY score DESC, created_at ASC
             LIMIT $limit";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * Total number of submitted scores.
 */
function fetch_total_count(PDO $pdo, ?string $character = null): int
{
    if ($character === 'dino' || $character === 'cat') {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM scores WHERE character_type = ?');
        $stmt->execute([$character]);
        return (int)$stmt->fetchColumn();
    }
    return (int)$pdo->query('SELECT COUNT(*) FROM scores')->fetchColumn();
}

/**
 * Validate an incoming score payload (from JSON body or POST form).
 *
 * @param array $input
 * @param array $cfg
 * @return array{ok:bool, error?:string, clean?:array}
 */
function validate_score_payload(array $input, array $cfg): array
{
    $name = trim((string)($input['name'] ?? ''));
    $len  = function_exists('mb_strlen') ? mb_strlen($name) : strlen($name);
    if ($len < (int)$cfg['name_min_len'] || $len > (int)$cfg['name_max_len']) {
        return ['ok' => false, 'error' => 'invalid_name_length'];
    }
    if (!preg_match('/^[A-Za-z0-9 _\-]+$/', $name)) {
        return ['ok' => false, 'error' => 'invalid_name_chars'];
    }

    $scoreRaw = $input['score'] ?? null;
    if (!is_int($scoreRaw) && !ctype_digit((string)$scoreRaw)) {
        return ['ok' => false, 'error' => 'invalid_score'];
    }
    $score = (int)$scoreRaw;
    if ($score < 0 || $score > (int)$cfg['max_score']) {
        return ['ok' => false, 'error' => 'score_out_of_range'];
    }

    $character = (string)($input['character'] ?? 'dino');
    if (!in_array($character, ['dino', 'cat'], true)) {
        return ['ok' => false, 'error' => 'invalid_character'];
    }

    $obstacles  = max(0, (int)($input['obstacles']   ?? 0));
    $durationMs = max(0, (int)($input['duration_ms'] ?? 0));
    if ($durationMs > (int)$cfg['max_duration_ms']) {
        // A duration this long is a tampered payload; zeroing it would
        // bypass the plausibility check below, so reject instead.
        return ['ok' => false, 'error' => 'invalid_duration'];
    }

    if ($durationMs > 1000) {
        $maxPlausible = (int)($durationMs / 1000 * 25) + 50;
        if ($score > $maxPlausible) {
            return ['ok' => false, 'error' => 'implausible_score'];
        }
    }

    return [
        'ok'    => true,
        'clean' => [
            'name'         => $name,
            'score'        => $score,
            'character'    => $character,
            'obstacles'    => $obstacles,
            'duration_ms'  => $durationMs,
        ],
    ];
}

/**
 * Returns true if the IP has submitted within the rate-limit window.
 */
function is_rate_limited(PDO $pdo, string $ipHash, int $minSeconds): bool
{
    $stmt = $pdo->prepare(
        'SELECT TIMESTAMPDIFF(SECOND, MAX(created_at), NOW()) AS gap
           FROM scores
          WHERE ip_hash = ?'
    );
    $stmt->execute([$ipHash]);
    $row = $stmt->fetch();
    return $row && $row['gap'] !== null && (int)$row['gap'] < $minSeconds;
}

/**
 * Insert a validated score row.
 */
function insert_score(PDO $pdo, array $clean, string $ipHash, string $userAgent): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO scores
            (player_name, score, character_type, obstacles, duration_ms, ip_hash, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $clean['name'],
        $clean['score'],
        $clean['character'],
        $clean['obstacles'],
        $clean['duration_ms'],
        $ipHash,
        $userAgent,
    ]);
}

/**
 * Compute the global rank of a given score (1 = best).
 */
function compute_rank(PDO $pdo, int $score): int
{
    $stmt = $pdo->prepare('SELECT COUNT(*) + 1 FROM scores WHERE score > ?');
    $stmt->execute([$score]);
    return (int)$stmt->fetchColumn();
}

/**
 * Rate-limit and insert an already-validated payload.
 *
 * @param array $clean The 'clean' array returned by validate_score_payload().
 * @return array{ok:bool, rank?:int, total?:int, error?:string}
 */
function record_score(PDO $pdo, array $cfg, array $clean, string $ipHash, string $userAgent): array
{
    if (is_rate_limited($pdo, $ipHash, (int)$cfg['rate_limit_seconds'])) {
        return ['ok' => false, 'error' => 'rate_limited'];
    }
    insert_score($pdo, $clean, $ipHash, $userAgent);
    return [
        'ok'    => true,
        'rank'  => compute_rank($pdo, $clean['score']),
        'total' => fetch_total_count($pdo),
    ];
}

/**
 * Full submission pipeline: validate, rate-limit, insert, return rank.
 * Used by the index.php form fallback. The AJAX endpoint validates first
 * and then calls record_score() directly.
 *
 * @return array{ok:bool, rank?:int, total?:int, error?:string}
 */
function process_score_submission(PDO $pdo, array $cfg, array $input, string $ipHash, string $userAgent): array
{
    $v = validate_score_payload($input, $cfg);
    if (!$v['ok']) {
        return ['ok' => false, 'error' => $v['error']];
    }
    return record_score($pdo, $cfg, $v['clean'], $ipHash, $userAgent);
}
