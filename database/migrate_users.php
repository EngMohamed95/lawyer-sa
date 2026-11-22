<?php
/**
 * نقل الحسابات من Firebase Auth + Firestore (users) إلى جدول users في MySQL — المرحلة 1.
 *
 *   php database/migrate_users.php <مسار-db-config.php> [--dry-run]
 *
 * - يقرأ فقط من Firebase (ما يغيّر فيه شيء)، ويكتب في MySQL بـ upsert حسب المعرّف،
 *   فإعادة التشغيل آمنة.
 * - كلمات المرور ما تنتقل (Firebase ما يصدّرها بصيغة قابلة للاستخدام)؛ كل مستخدم تنتقل
 *   كلمة مروره تلقائياً عند أول دخول. password_hash الموجود ما يُلمس.
 * - يحتاج serviceAccountKey.json في جذر المشروع (أو بجانب _firebase.php).
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$configPath = $argv[1] ?? '';
$dryRun = in_array('--dry-run', $argv, true);
if (!is_file($configPath)) { fwrite(STDERR, "استخدم: php database/migrate_users.php <db-config.php> [--dry-run]\n"); exit(2); }

require_once dirname(__DIR__) . '/public/_firebase.php';
$config = require $configPath;
$project = (string) ($config['firebase_project_id'] ?? 'lawyer-sa');

$sa = service_account();
$token = admin_access_token($sa);

/* ─── حسابات Firebase Auth (البريد مصدره هنا) ─── */
$accounts = [];
$next = '';
do {
    $url = "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:batchGet?maxResults=1000"
        . ($next !== '' ? '&nextPageToken=' . rawurlencode($next) : '');
    [$status, $body] = http_request('GET', $url, ["Authorization: Bearer $token"]);
    $page = json_decode($body, true);
    if ($status !== 200 || !is_array($page)) { fwrite(STDERR, "فشل قراءة حسابات Firebase ($status)\n"); exit(1); }
    foreach ($page['users'] ?? [] as $acc) {
        if (!empty($acc['email'])) $accounts[(string) $acc['localId']] = strtolower((string) $acc['email']);
    }
    $next = (string) ($page['nextPageToken'] ?? '');
} while ($next !== '');

/* ─── مستندات users في Firestore ─── */
$profiles = [];
$next = '';
do {
    $url = "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents/users?pageSize=300"
        . ($next !== '' ? '&pageToken=' . rawurlencode($next) : '');
    [$status, $body] = http_request('GET', $url, ["Authorization: Bearer $token"]);
    $page = json_decode($body, true);
    if ($status !== 200 || !is_array($page)) { fwrite(STDERR, "فشل قراءة users من Firestore ($status)\n"); exit(1); }
    foreach ($page['documents'] ?? [] as $doc) {
        $id = substr((string) $doc['name'], strrpos((string) $doc['name'], '/') + 1);
        $data = [];
        foreach ($doc['fields'] ?? [] as $k => $f) $data[$k] = fs_decode($f);
        $profiles[$id] = $data;
    }
    $next = (string) ($page['nextPageToken'] ?? '');
} while ($next !== '');

$withProfile = count(array_intersect_key($accounts, $profiles));
$authOnly = count($accounts) - $withProfile;
$profileOnly = count(array_diff_key($profiles, $accounts));
echo "حسابات Firebase Auth: " . count($accounts) . "\n";
echo "مستندات users: " . count($profiles) . "\n";
echo "  لها حساب وملف: $withProfile\n";
echo "  حساب بلا ملف (تسجيل ما اكتمل): $authOnly\n";
echo "  ملف بلا حساب دخول (يُتخطى): $profileOnly\n";
if ($dryRun) { echo "--dry-run: ما كُتب شيء.\n"; exit(0); }

/* ─── الكتابة في MySQL ─── */
$pdo = new PDO("mysql:host={$config['host']};port=" . (int) ($config['port'] ?? 3306) . ";dbname={$config['name']};charset=utf8mb4",
    (string) $config['user'], (string) ($config['pass'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec("SET time_zone = '+00:00'");
$upsert = $pdo->prepare(
    'INSERT INTO users (id, email, name, role, lawyer_id, status, deleted_at, data)
     VALUES (:id, :email, :name, :role, :lawyer_id, :status, :deleted_at, :data)
     ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), role = VALUES(role),
       lawyer_id = VALUES(lawyer_id), status = VALUES(status), deleted_at = VALUES(deleted_at), data = VALUES(data)'
);
$str = fn($v, int $max) => is_string($v) && $v !== '' ? substr($v, 0, $max) : null;

$written = 0; $conflicts = 0;
$pdo->beginTransaction();
foreach ($accounts as $id => $email) {
    $p = $profiles[$id] ?? null;
    $owner = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id <> ?');
    $owner->execute([$email, $id]);
    if ($owner->fetchColumn() !== false) { $conflicts++; fwrite(STDERR, "تعارض: $email مربوط بمعرّف آخر في MySQL — تخطّي $id\n"); continue; }
    $upsert->execute([
        'id' => $id,
        'email' => $email,
        'name' => $p !== null && is_string($p['name'] ?? null) ? (preg_match('/^.{0,255}/us', $p['name'], $m) ? $m[0] : '') : '',
        'role' => $p !== null ? ($str($p['role'] ?? null, 32) ?? 'TRAINEE') : 'PENDING',
        'lawyer_id' => $p !== null ? $str($p['lawyerId'] ?? null, 64) : null,
        'status' => $p !== null ? ($str($p['status'] ?? null, 32) ?? 'ACTIVE') : 'ACTIVE',
        'deleted_at' => $p !== null && !empty($p['deletedAt']) ? gmdate('Y-m-d H:i:s') : null,
        'data' => $p !== null ? json_encode($p, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) : null,
    ]);
    $written++;
}
$pdo->commit();

$check = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
echo "كُتب/حُدّث: $written — تعارضات: $conflicts — إجمالي الجدول الآن: $check\n";
exit($conflicts === 0 ? 0 : 1);
