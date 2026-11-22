<?php
/**
 * نقل مجموعات Firestore (مع كل مجموعاتها الفرعية) إلى جدول docs في MySQL.
 *
 *   php database/migrate_store.php <مسار-db-config.php> [--dry-run] [--collections=cases,clients,tasks]
 *
 * - يقرأ فقط من Firestore (ما يغيّر فيه شيء)، ويكتب في MySQL بـ upsert حسب المسار،
 *   فإعادة التشغيل آمنة (آخر نسخة من Firestore تكتب فوق).
 * - المعرّفات تظل نفسها، والخرائط تظل كائنات، والتواريخ (Timestamp) تصير نصوص ISO.
 * - في الآخر يقارن العدد في Firestore مع MySQL لكل مجموعة، ويفشل لو اختلف.
 * - يحتاج serviceAccountKey.json في جذر المشروع.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$configPath = $argv[1] ?? '';
$dryRun = in_array('--dry-run', $argv, true);
$roots = ['cases', 'clients', 'tasks'];
foreach ($argv as $a) if (str_starts_with($a, '--collections=')) $roots = array_filter(explode(',', substr($a, 14)));
if (!is_file($configPath)) { fwrite(STDERR, "استخدم: php database/migrate_store.php <db-config.php> [--dry-run] [--collections=a,b]\n"); exit(2); }

require_once dirname(__DIR__) . '/public/_firebase.php';
$config = require $configPath;
$project = (string) ($config['firebase_project_id'] ?? 'lawyer-sa');
$token = admin_access_token(service_account());
$baseUrl = "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents";

/** قيمة Firestore REST ← قيمة JSON (الخرائط stdClass عشان {} يظل {}) */
function fs_to_json(array $v) {
    if (array_key_exists('nullValue', $v)) return null;
    if (array_key_exists('stringValue', $v)) return $v['stringValue'];
    if (array_key_exists('booleanValue', $v)) return (bool) $v['booleanValue'];
    if (array_key_exists('integerValue', $v)) return (int) $v['integerValue'];
    if (array_key_exists('doubleValue', $v)) return (float) $v['doubleValue'];
    if (array_key_exists('timestampValue', $v)) {
        // نفس صيغة Date.toISOString() في الواجهة: 2026-01-02T03:04:05.123Z
        // (Firestore يرسل حتى 9 أرقام للكسور — DateTime يقبل 6)
        $ts = preg_replace('/(\.\d{6})\d+/', '$1', (string) $v['timestampValue']);
        return (new DateTimeImmutable($ts))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    }
    if (array_key_exists('referenceValue', $v)) return preg_replace('#^projects/[^/]+/databases/[^/]+/documents/#', '', $v['referenceValue']);
    if (array_key_exists('geoPointValue', $v)) return (object) ['latitude' => $v['geoPointValue']['latitude'] ?? 0, 'longitude' => $v['geoPointValue']['longitude'] ?? 0];
    if (array_key_exists('bytesValue', $v)) return $v['bytesValue'];
    if (array_key_exists('arrayValue', $v)) return array_map('fs_to_json', $v['arrayValue']['values'] ?? []);
    if (array_key_exists('mapValue', $v)) {
        $o = new stdClass();
        foreach ($v['mapValue']['fields'] ?? [] as $k => $f) $o->$k = fs_to_json($f);
        return $o;
    }
    return null;
}

function fs_call(string $method, string $url, ?array $body = null): array {
    global $token;
    for ($try = 1; ; $try++) {
        [$status, $resp] = http_request($method, $url, ["Authorization: Bearer $token", 'Content-Type: application/json'], $body !== null ? json_encode($body) : null);
        if ($status === 200) return json_decode($resp, true) ?: [];
        if ($try < 4 && ($status === 0 || $status === 429 || $status >= 500)) { sleep($try * 2); continue; }
        fwrite(STDERR, "فشل طلب Firestore ($status) $url: " . substr($resp, 0, 300) . "\n");
        exit(1);
    }
}

/** كل مستندات مجموعة (صفحة صفحة) — $collPath مثل "cases" أو "cases/abc/hearings" */
function fs_list(string $collPath): array {
    global $baseUrl;
    $docs = [];
    $next = '';
    do {
        $page = fs_call('GET', "$baseUrl/$collPath?pageSize=300" . ($next !== '' ? '&pageToken=' . rawurlencode($next) : ''));
        foreach ($page['documents'] ?? [] as $d) $docs[] = $d;
        $next = (string) ($page['nextPageToken'] ?? '');
    } while ($next !== '');
    return $docs;
}

function fs_subcollections(string $docPath): array {
    global $baseUrl;
    $ids = [];
    $next = '';
    do {
        $page = fs_call('POST', "$baseUrl/$docPath:listCollectionIds", ['pageSize' => 100] + ($next !== '' ? ['pageToken' => $next] : []));
        array_push($ids, ...($page['collectionIds'] ?? []));
        $next = (string) ($page['nextPageToken'] ?? '');
    } while ($next !== '');
    return $ids;
}

$rows = [];          // [collection, parent_path, id, json]
$counts = [];        // "cases" / "cases/*/hearings" => عدد
$badIds = [];

$walk = function (string $collPath, int $depth) use (&$walk, &$rows, &$counts, &$badIds): void {
    $segs = explode('/', $collPath);
    $collection = end($segs);
    $parent = implode('/', array_slice($segs, 0, -1));
    $key = preg_replace('#/[^/]+/#', '/*/', $collPath);
    foreach (fs_list($collPath) as $d) {
        $id = substr($d['name'], strrpos($d['name'], '/') + 1);
        $counts[$key] = ($counts[$key] ?? 0) + 1;
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) { $badIds[] = "$collPath/$id"; continue; }
        $data = new stdClass();
        foreach ($d['fields'] ?? [] as $k => $f) $data->$k = fs_to_json($f);
        $rows[] = [$collection, $parent, $id, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE)];
        if ($depth < 3) foreach (fs_subcollections("$collPath/$id") as $sub) $walk("$collPath/$id/$sub", $depth + 1);
    }
};

foreach ($roots as $root) {
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $root)) { fwrite(STDERR, "اسم مجموعة غير صالح: $root\n"); exit(2); }
    $walk($root, 0);
}

echo "Firestore:\n";
foreach ($counts as $k => $n) echo "  $k: $n\n";
if ($badIds) { echo "معرّفات بصيغة غير مدعومة (ما تنقل): " . implode(', ', $badIds) . "\n"; }
if ($dryRun) { echo "--dry-run: ما كُتب شيء.\n"; exit($badIds ? 1 : 0); }

$pdo = new PDO("mysql:host={$config['host']};port=" . (int) ($config['port'] ?? 3306) . ";dbname={$config['name']};charset=utf8mb4",
    (string) $config['user'], (string) ($config['pass'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$stmt = $pdo->prepare('INSERT INTO docs (collection, parent_path, id, data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)');
$pdo->beginTransaction();
foreach ($rows as $r) $stmt->execute($r);
$pdo->commit();

// المستندات الفرعية بلا lawyerId (قديمة في Firestore) تاخذ مكتب السجل الأم — نفس ما يسويه
// store.php عند الكتابة. بدونه ما تظهر في استعلامات المكتب (كل جلسات المكتب مثلاً).
$orphans = $pdo->query("SELECT collection, parent_path, id, data FROM docs WHERE parent_path <> '' AND lawyer_id IS NULL")->fetchAll(PDO::FETCH_ASSOC);
$parentTenant = $pdo->prepare("SELECT lawyer_id FROM docs WHERE collection = ? AND parent_path = '' AND id = ?");
$fill = $pdo->prepare('UPDATE docs SET data = ? WHERE collection = ? AND parent_path = ? AND id = ?');
$filled = 0;
foreach ($orphans as $o) {
    [$rootColl, $rootId] = explode('/', $o['parent_path']);
    $parentTenant->execute([$rootColl, $rootId]);
    $tenant = $parentTenant->fetchColumn();
    if (!is_string($tenant) || $tenant === '') continue;
    $data = json_decode((string) $o['data'], false);
    $data->lawyerId = $tenant;
    $fill->execute([json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION), $o['collection'], $o['parent_path'], $o['id']]);
    $filled++;
}
if ($filled) echo "عُبّئ lawyerId من السجل الأم لـ $filled مستند فرعي\n";

echo "MySQL بعد النقل:\n";
$mismatch = 0;
foreach ($counts as $k => $n) {
    $segs = explode('/', $k);
    $collection = end($segs);
    if (count($segs) === 1) {
        $got = (int) $pdo->query("SELECT COUNT(*) FROM docs WHERE collection = " . $pdo->quote($collection) . " AND parent_path = ''")->fetchColumn();
    } else {
        $like = str_replace('*', '%', implode('/', array_slice($segs, 0, -1)));
        $s = $pdo->prepare("SELECT COUNT(*) FROM docs WHERE collection = ? AND parent_path LIKE ?");
        $s->execute([$collection, $like]);
        $got = (int) $s->fetchColumn();
    }
    $ok = $got >= $n - count(array_filter($badIds, fn($b) => str_contains($b, "/$collection/")));
    if (!$ok) $mismatch++;
    echo "  $k: $got " . ($ok ? '✓' : "✗ (المتوقع $n)") . "\n";
}
$missingTenant = (int) $pdo->query("SELECT COUNT(*) FROM docs WHERE parent_path = '' AND lawyer_id IS NULL")->fetchColumn();
if ($missingTenant) echo "تنبيه: $missingTenant سجل رئيسي بلا lawyerId — ما يظهر إلا لمدير المنصة\n";
exit($mismatch === 0 && !$badIds ? 0 : 1);
