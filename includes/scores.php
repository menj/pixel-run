<?php
/**
 * Pixel Run — Shared score logic.
 *
 * Used by both index.php (server-side rendering and POST fallback) and
 * the api/ AJAX endpoints. Centralising the validation and queries here
 * keeps the rules in one place.
 */

declare(strict_types=1);

/** Playable characters; keep in sync with the ENUM in sql/schema.sql (MySQL only; other drivers store plain text). */
const PIXEL_RUN_CHARACTERS = ['dino', 'cat', 'penguin', 'robot'];

/**
 * Whether the scores table has the daily-challenge column. Databases created
 * before that feature lack it until install.php upgrades them, and the game
 * must keep working meanwhile, so every query that mentions it checks first.
 */
function scores_has_challenge(PDO $pdo): bool
{
    static $cache = [];
    $key = spl_object_id($pdo);
    if (!isset($cache[$key])) {
        // Portable across MySQL, PostgreSQL and SQLite: just ask for the column.
        try {
            $pdo->query('SELECT challenge_date FROM scores WHERE 1 = 0');
            $cache[$key] = true;
        } catch (PDOException $e) {
            $cache[$key] = false;
        }
    }
    return $cache[$key];
}

/**
 * WHERE fragments and parameters for the character and challenge filters.
 * $challenge null means ordinary runs only; a date means that day's course.
 *
 * @return array{0:string[],1:array}
 */
function score_filters(PDO $pdo, ?string $character, ?string $challenge): array
{
    $where  = [];
    $params = [];
    if (in_array($character, PIXEL_RUN_CHARACTERS, true)) {
        $where[]  = 'character_type = ?';
        $params[] = $character;
    }
    if (scores_has_challenge($pdo)) {
        if ($challenge === null) {
            $where[] = 'challenge_date IS NULL';
        } else {
            $where[]  = 'challenge_date = ?';
            $params[] = $challenge;
        }
    }
    return [$where, $params];
}

/**
 * Fetch the top N scores, optionally filtered by character or daily course.
 *
 * @param PDO         $pdo
 * @param string|null $character one of PIXEL_RUN_CHARACTERS, or null for all
 * @param int         $limit
 * @param string|null $challenge UTC date of a daily course, or null for ordinary runs
 * @return array<int, array{player_name:string,score:int,character_type:string,created_at:string}>
 */
function fetch_top_scores(PDO $pdo, ?string $character, int $limit, ?string $challenge = null): array
{
    $limit = max(1, min(100, $limit));
    if ($challenge !== null && !scores_has_challenge($pdo)) {
        return [];   // daily scores cannot exist before the database upgrade
    }
    [$conds, $params] = score_filters($pdo, $character, $challenge);
    $where = $conds ? 'WHERE ' . implode(' AND ', $conds) : '';
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
function fetch_total_count(PDO $pdo, ?string $character = null, ?string $challenge = null): int
{
    if ($challenge !== null && !scores_has_challenge($pdo)) {
        return 0;
    }
    [$conds, $params] = score_filters($pdo, $character, $challenge);
    $where = $conds ? 'WHERE ' . implode(' AND ', $conds) : '';
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM scores $where");
    $stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

/**
 * A daily-challenge date from the client, or null for an ordinary run.
 * Accepts today and the neighbouring UTC days so a slow or skewed clock does
 * not lock a player out. Returns false for anything malformed.
 *
 * @return string|null|false
 */
function parse_challenge($raw)
{
    if ($raw === null || $raw === '' || $raw === false) {
        return null;
    }
    $raw = (string)$raw;
    if ($raw === 'today') {
        return gmdate('Y-m-d');
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
        return false;
    }
    $allowed = [
        gmdate('Y-m-d', time() - 86400),
        gmdate('Y-m-d'),
        gmdate('Y-m-d', time() + 86400),
    ];
    return in_array($raw, $allowed, true) ? $raw : false;
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
    // Runs that used the admin cheat code are never recorded.
    if (!empty($input['cheat'])) {
        return ['ok' => false, 'error' => 'not_recorded'];
    }

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
    if (!in_array($character, PIXEL_RUN_CHARACTERS, true)) {
        return ['ok' => false, 'error' => 'invalid_character'];
    }

    $challenge = parse_challenge($input['challenge'] ?? null);
    if ($challenge === false) {
        return ['ok' => false, 'error' => 'invalid_challenge'];
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
            'challenge'    => $challenge,
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
    // Seconds since this client's latest row, computed by the database so the
    // comparison uses one clock; the expression differs per driver.
    switch ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)) {
        case 'pgsql':
            $gap = 'EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))';
            break;
        case 'sqlite':
            $gap = "(CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', MAX(created_at)) AS INTEGER))";
            break;
        default:
            $gap = 'TIMESTAMPDIFF(SECOND, MAX(created_at), NOW())';
    }
    $stmt = $pdo->prepare("SELECT $gap AS gap FROM scores WHERE ip_hash = ?");
    $stmt->execute([$ipHash]);
    $row = $stmt->fetch();
    return $row && $row['gap'] !== null && (int)$row['gap'] < $minSeconds;
}

/**
 * Insert a validated score row.
 */
function insert_score(PDO $pdo, array $clean, string $ipHash, string $userAgent): void
{
    $cols   = 'player_name, score, character_type, obstacles, duration_ms, ip_hash, user_agent';
    $marks  = '?, ?, ?, ?, ?, ?, ?';
    $values = [
        $clean['name'],
        $clean['score'],
        $clean['character'],
        $clean['obstacles'],
        $clean['duration_ms'],
        $ipHash,
        $userAgent,
    ];
    if (scores_has_challenge($pdo)) {
        $cols    .= ', challenge_date';
        $marks   .= ', ?';
        $values[] = $clean['challenge'] ?? null;
    }
    $stmt = $pdo->prepare("INSERT INTO scores ($cols) VALUES ($marks)");
    $stmt->execute($values);
}

/**
 * Compute the global rank of a given score (1 = best).
 */
function compute_rank(PDO $pdo, int $score, ?string $challenge = null): int
{
    [$conds, $params] = score_filters($pdo, null, $challenge);
    array_unshift($conds, 'score > ?');
    array_unshift($params, $score);
    $stmt = $pdo->prepare('SELECT COUNT(*) + 1 FROM scores WHERE ' . implode(' AND ', $conds));
    $stmt->execute($params);
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
    $challenge = $clean['challenge'] ?? null;
    if ($challenge !== null && !scores_has_challenge($pdo)) {
        // The daily board needs the database upgrade; ordinary play is unaffected.
        return ['ok' => false, 'error' => 'database_unavailable', 'reason' => 'needs_upgrade'];
    }
    if (is_rate_limited($pdo, $ipHash, (int)$cfg['rate_limit_seconds'])) {
        return ['ok' => false, 'error' => 'rate_limited'];
    }
    insert_score($pdo, $clean, $ipHash, $userAgent);
    return [
        'ok'    => true,
        'rank'  => compute_rank($pdo, $clean['score'], $challenge),
        'total' => fetch_total_count($pdo, null, $challenge),
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
