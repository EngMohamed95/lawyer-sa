<?php
/**
 * فحص توافق قاعدة البيانات (MySQL 8 أو MariaDB 10.6+) مع ما يستخدمه الموقع — قبل أول نشر.
 *
 *   php database/check_db.php <مسار-db-config.php>
 *
 * ينشئ جدول مؤقت بنفس شكل docs، يجرب الأعمدة المولّدة ودوال JSON والترتيب، ثم يحذفه.
 * ما يلمس أي بيانات حقيقية.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$config = is_file($argv[1] ?? '') ? require $argv[1] : null;
if (!is_array($config)) { fwrite(STDERR, "استخدم: php database/check_db.php <db-config.php>\n"); exit(2); }

$pdo = new PDO("mysql:host={$config['host']};port=" . (int) ($config['port'] ?? 3306) . ";dbname={$config['name']};charset=utf8mb4",
    (string) $config['user'], (string) ($config['pass'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]);
$version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
echo "الخادم: $version\n";

$ok = 0; $bad = 0;
$check = function (string $name, callable $fn) use (&$ok, &$bad): void {
    try {
        $res = $fn();
        if ($res === true) { $ok++; echo "  ✓ $name\n"; }
        else { $bad++; echo "  ✗ $name — " . json_encode($res, JSON_UNESCAPED_UNICODE) . "\n"; }
    } catch (Throwable $e) { $bad++; echo "  ✗ $name — " . $e->getMessage() . "\n"; }
};

// نفس تعريف docs في schema.sql بالضبط، باسم مؤقت
$schema = (string) file_get_contents(__DIR__ . '/schema.sql');
if (!preg_match('/CREATE TABLE IF NOT EXISTS docs \((.*?)\) ENGINE=InnoDB[^;]*;/s', $schema, $m)) { fwrite(STDERR, "ما لقيت تعريف docs\n"); exit(1); }
$pdo->exec('DROP TABLE IF EXISTS zz_compat_docs');
$check('إنشاء جدول بأعمدة مولّدة (lawyer_id/case_id/client_id)', function () use ($pdo, $m) {
    $pdo->exec('CREATE TABLE zz_compat_docs (' . $m[1] . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    return true;
});

try {
    $ins = $pdo->prepare('INSERT INTO zz_compat_docs (collection, parent_path, id, data) VALUES (?, ?, ?, ?)');
    foreach ([
        ['t', '', 'a', '{"lawyerId":"L1","n":9,"s":"ب","tags":["x","y"],"e":{},"ok":true,"caseId":null}'],
        ['t', '', 'b', '{"lawyerId":"L1","n":10,"s":"أ","tags":"x"}'],
        ['t', '', 'c', '{"lawyerId":"L2","n":"10"}'],
    ] as $r) $ins->execute($r);
    $col = fn(string $sql, array $p = []) => (function () use ($pdo, $sql, $p) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchAll(PDO::FETCH_COLUMN); })();

    $check('العمود المولّد lawyer_id + الفهرس', fn() => $col("SELECT id FROM zz_compat_docs WHERE lawyer_id = ? ORDER BY id", ['L1']) === ['a', 'b'] ?: $col("SELECT lawyer_id FROM zz_compat_docs"));
    $check('null في JSON ← NULL في العمود المولّد', fn() => $col("SELECT case_id IS NULL FROM zz_compat_docs WHERE id = 'a'") == [1]);
    $check('مقارنة نص بنوعه', fn() => $col("SELECT id FROM zz_compat_docs WHERE JSON_TYPE(JSON_EXTRACT(data, '$.\"s\"')) = 'STRING' AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"s\"')) = ?", ['أ']) === ['b']);
    $check('مقارنة رقم بنوعه (الرقم 10 مو النص "10")', fn() => ($r = $col("SELECT id FROM zz_compat_docs WHERE JSON_TYPE(JSON_EXTRACT(data, '$.\"n\"')) IN ('INTEGER','DOUBLE','DECIMAL','UNSIGNED INTEGER') AND (JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"n\"')) + 0) >= ? ORDER BY id", [10])) === ['b'] ?: $r);
    $check('منطقي', fn() => $col("SELECT id FROM zz_compat_docs WHERE JSON_TYPE(JSON_EXTRACT(data, '$.\"ok\"')) = 'BOOLEAN' AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"ok\"')) = 'true'") === ['a']);
    $check('array-contains على قائمة فقط', fn() => ($r = $col("SELECT id FROM zz_compat_docs WHERE JSON_TYPE(JSON_EXTRACT(data, '$.\"tags\"')) = 'ARRAY' AND JSON_CONTAINS(JSON_EXTRACT(data, '$.\"tags\"'), ?)", ['"x"'])) === ['a'] ?: $r);
    $check('ترتيب الأرقام كأرقام (9 قبل 10)', fn() => ($r = $col("SELECT id FROM zz_compat_docs WHERE lawyer_id = 'L1' ORDER BY CASE WHEN JSON_TYPE(JSON_EXTRACT(data, '$.\"n\"')) IN ('INTEGER','DOUBLE','DECIMAL','UNSIGNED INTEGER') THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"n\"')) + 0 END ASC")) === ['a', 'b'] ?: $r);
    $check('الخريطة الفاضية تظل {}', fn() => ($r = $col("SELECT JSON_EXTRACT(data, '$.\"e\"') FROM zz_compat_docs WHERE id = 'a'")[0]) === '{}' ?: $r);
    $check('النص العربي يرجع كما هو', fn() => json_decode((string) $col("SELECT data FROM zz_compat_docs WHERE id = 'b'")[0])->s === 'أ');
    $check('LIKE مع تهريب _', function () use ($pdo, $ins) {
        $ins->execute(['h', 'cases/a_b', 'x', '{}']);
        $ins->execute(['h', 'cases/aXb', 'y', '{}']);
        $s = $pdo->prepare("SELECT id FROM zz_compat_docs WHERE parent_path LIKE ?");
        $s->execute(['cases/a\\_b%']);
        return $s->fetchAll(PDO::FETCH_COLUMN) === ['x'];
    });
    $check('SELECT ... FOR UPDATE داخل معاملة', function () use ($pdo) {
        $pdo->beginTransaction();
        $pdo->query("SELECT data FROM zz_compat_docs WHERE collection = 't' AND parent_path = '' AND id = 'a' FOR UPDATE")->fetchAll();
        $pdo->rollBack();
        return true;
    });
} finally {
    $pdo->exec('DROP TABLE IF EXISTS zz_compat_docs');
}

echo "\nالنتيجة: $ok نجح، $bad فشل" . ($bad ? " — لا تنشر قبل إصلاح التوافق\n" : " — القاعدة متوافقة\n");
exit($bad === 0 ? 0 : 1);
