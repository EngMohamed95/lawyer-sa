<?php
/**
 * بيانات المساعد الذكي من MySQL لـ public/ai-proxy.php — بديل قراءة Firestore بتوكن Firebase.
 *
 * مستقل عن core.php عمداً: ai-proxy.php له fail() و http_request() خاصة (إبقاء الاتصال حياً
 * أثناء الردود الطويلة)، فما نحمّل مكتبة الـ API معه. الأسماء كلها aidb_* لتفادي التعارض.
 * نفس منطق session.php و access.php — أي تغيير هناك يقابله تغيير هنا.
 */

declare(strict_types=1);

function aidb(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $file = '';
    $override = getenv('MZ_DB_CONFIG');
    if (PHP_SAPI === 'cli-server' && is_string($override) && $override !== '') $file = $override;
    foreach ([$file, dirname(__DIR__, 2) . '/db-config.php', dirname(__DIR__, 3) . '/db-config.php'] as $c) {
        if ($c !== '' && is_file($c)) { $file = $c; break; }
    }
    $c = is_file($file) ? require $file : null;
    if (!is_array($c)) fail(503, 'الخدمة غير متاحة حالياً.');
    $pdo = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'] ?? '127.0.0.1', (int) ($c['port'] ?? 3306), $c['name']),
        (string) $c['user'], (string) ($c['pass'] ?? ''),
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    $pdo->exec("SET time_zone = '+00:00'");
    $GLOBALS['aidb_cookie_secure'] = (bool) ($c['cookie_secure'] ?? true);
    return $pdo;
}

function aidb_one(string $sql, array $params = []): ?array {
    $s = aidb()->prepare($sql);
    $s->execute($params);
    $row = $s->fetch();
    return $row === false ? null : $row;
}

function aidb_doc(string $collection, string $id): ?array {
    $row = aidb_one("SELECT data FROM docs WHERE collection = ? AND parent_path = '' AND id = ?", [$collection, $id]);
    return $row === null ? null : (json_decode((string) $row['data'], true) ?: []);
}

/** المستخدم من كوكي الجلسة (نفس session_user في session.php)، أو null */
function aidb_session_user(): ?array {
    aidb();
    $name = $GLOBALS['aidb_cookie_secure'] ? '__Host-mz_session' : 'mz_session';
    $token = $_COOKIE[$name] ?? null;
    if (!is_string($token) || $token === '' || strlen($token) > 128) return null;
    $u = aidb_one('SELECT u.id, u.role, u.lawyer_id, u.status, u.deleted_at, u.data
                     FROM auth_sessions s JOIN users u ON u.id = s.user_id
                    WHERE s.token_hash = ? AND s.expires_at > ? AND s.created_at > ?',
        [hash('sha256', $token), gmdate('Y-m-d H:i:s'), gmdate('Y-m-d H:i:s', time() - 90 * 86400)]);
    if ($u === null) return null;
    $u['data'] = $u['data'] !== null ? (json_decode((string) $u['data'], true) ?: []) : [];
    return $u;
}

/** الحساب نشط ومكتبه نشط (account_active في access.php) */
function aidb_active(array $u): bool {
    $blocked = fn($s) => in_array($s, ['SUSPENDED', 'DISABLED'], true);
    if (($u['role'] ?? 'PENDING') === 'PENDING' || $blocked($u['status'] ?? null) || !empty($u['deleted_at'])) return false;
    if ($u['role'] === 'SUPER_ADMIN') return true;
    $tenant = is_string($u['lawyer_id']) && $u['lawyer_id'] !== '' ? $u['lawyer_id'] : $u['id'];
    if ($tenant === $u['id']) return true;
    $owner = aidb_one('SELECT role, status FROM users WHERE id = ?', [$tenant]);
    return $owner !== null && $owner['role'] === 'LAWYER' && !$blocked($owner['status']);
}

/**
 * حصة المكتب: quotaOverrides.ai للمالك، وإلا quotas.ai لباقته (0 = غير محدود)، والتجربة 10.
 * مدير المنصة مستثنى. التجربة المنتهية مقفلة (نفس officeWritable).
 */
function aidb_office_context(array $u): array {
    if ($u['role'] === 'SUPER_ADMIN') return ['exempt' => true, 'tenant' => '', 'quota' => 0, 'locked' => false];
    $tenant = is_string($u['lawyer_id']) && $u['lawyer_id'] !== '' ? $u['lawyer_id'] : $u['id'];
    $ownerRow = $tenant === $u['id'] ? $u : aidb_one('SELECT data FROM users WHERE id = ?', [$tenant]);
    $owner = $tenant === $u['id'] ? $u['data'] : (json_decode((string) ($ownerRow['data'] ?? ''), true) ?: []);

    $quota = 0;
    $override = $owner['quotaOverrides']['ai'] ?? null;
    if (is_numeric($override) && $override >= 0) {
        $quota = (int) $override;
    } elseif (is_string($owner['planId'] ?? null) && $owner['planId'] !== '') {
        $q = aidb_doc('subscriptionPlans', $owner['planId'])['quotas']['ai'] ?? 0;
        $quota = is_numeric($q) && $q > 0 ? (int) $q : 0;
    }
    $trial = ($owner['subscriptionBilling'] ?? '') === 'trial';
    if ($trial) $quota = 10;
    $trialEnd = $trial ? strtotime((string) ($owner['subscriptionExpiry'] ?? '')) : false;
    return ['exempt' => false, 'tenant' => $tenant, 'quota' => $quota, 'locked' => $trialEnd !== false && $trialEnd <= time()];
}

function aidb_usage(string $tenant): int {
    return (int) (aidb_doc('ai_usage', $tenant . '_' . gmdate('Y-m'))['count'] ?? 0);
}

/** +1 لعدّاد الشهر — قفل صف داخل معاملة (طلبان متزامنان ما يضيعون زيادة) */
function aidb_count_usage(string $tenant): void {
    $month = gmdate('Y-m');
    $id = "{$tenant}_{$month}";
    $pdo = aidb();
    for ($try = 0; $try < 3; $try++) {
        $pdo->beginTransaction();
        try {
            $row = aidb_one("SELECT data FROM docs WHERE collection = 'ai_usage' AND parent_path = '' AND id = ? FOR UPDATE", [$id]);
            $count = $row === null ? 1 : (int) ((json_decode((string) $row['data'], true) ?: [])['count'] ?? 0) + 1;
            $data = json_encode(['lawyerId' => $tenant, 'month' => $month, 'count' => $count, 'updatedAt' => gmdate('Y-m-d\TH:i:s.v\Z')]);
            $sql = $row === null
                ? "INSERT INTO docs (collection, parent_path, id, data) VALUES ('ai_usage', '', ?, ?)"
                : "UPDATE docs SET data = ? WHERE collection = 'ai_usage' AND parent_path = '' AND id = ?";
            aidb()->prepare($sql)->execute($row === null ? [$id, $data] : [$data, $id]);
            $pdo->commit();
            return;
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ($e->getCode() !== '23000') { error_log('ai-proxy: فشل تحديث عدّاد الاستهلاك: ' . $e->getMessage()); return; }
        }
    }
}

/** حالة خدمة المساعد للمنصة (platform_status/ai) — يقرؤها مدير المنصة */
function aidb_platform_state(string $state, string $reason, int $httpStatus): void {
    $data = json_encode(['state' => $state, 'reason' => $reason, 'httpStatus' => $httpStatus, 'at' => gmdate('Y-m-d\TH:i:s.v\Z')]);
    aidb()->prepare("INSERT INTO docs (collection, parent_path, id, data) VALUES ('platform_status', '', 'ai', ?)
                     ON DUPLICATE KEY UPDATE data = VALUES(data)")->execute([$data]);
}
