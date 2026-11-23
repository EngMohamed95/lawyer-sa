<?php
/**
 * إنشاء مدير منصة (SUPER_ADMIN) في MySQL — للمدير الأول، أو لاسترجاع الوصول.
 *
 *   php database/create_admin.php <مسار-db-config.php> <email> "<الاسم>"
 *
 * كلمة المرور تُطلب من الطرفية بدون عرضها (أو من متغير MZ_ADMIN_PASSWORD للأتمتة).
 * لو البريد موجود: يُرقّى حسابه لمدير منصة ويُحدّث كلمة مروره.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
[$_, $configPath, $email, $name] = $argv + [null, '', '', ''];
if (!is_file((string) $configPath) || $email === '' || $name === '') {
    fwrite(STDERR, "استخدم: php database/create_admin.php <db-config.php> <email> \"<الاسم>\"\n");
    exit(2);
}
$email = strtolower(trim($email));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { fwrite(STDERR, "البريد غير صالح\n"); exit(2); }

$password = getenv('MZ_ADMIN_PASSWORD') ?: '';
if ($password === '') {
    fwrite(STDOUT, 'كلمة المرور (لن تظهر): ');
    if (PHP_OS_FAMILY !== 'Windows') shell_exec('stty -echo');
    $password = rtrim((string) fgets(STDIN), "\r\n");
    if (PHP_OS_FAMILY !== 'Windows') shell_exec('stty echo');
    fwrite(STDOUT, "\n");
}
if (strlen($password) < 10 || strlen($password) > 72) { fwrite(STDERR, "كلمة مرور مدير المنصة لازم 10 إلى 72 حرف\n"); exit(2); }

$c = require $configPath;
$pdo = new PDO("mysql:host={$c['host']};port=" . (int) ($c['port'] ?? 3306) . ";dbname={$c['name']};charset=utf8mb4",
    (string) $c['user'], (string) ($c['pass'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

$existing = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$existing->execute([$email]);
$id = $existing->fetchColumn() ?: substr(str_replace(['+', '/', '='], '', base64_encode(random_bytes(24))), 0, 28);
$now = gmdate('Y-m-d\TH:i:s.v\Z');
$profile = json_encode(['name' => $name, 'email' => $email, 'role' => 'SUPER_ADMIN', 'lawyerId' => 'ALL',
    'adminRole' => 'OWNER', 'status' => 'ACTIVE', 'createdAt' => $now], JSON_UNESCAPED_UNICODE);

$pdo->beginTransaction();
$pdo->prepare("INSERT INTO users (id, email, password_hash, name, role, lawyer_id, status, data, profile_synced_at)
               VALUES (?, ?, ?, ?, 'SUPER_ADMIN', 'ALL', 'ACTIVE', ?, UTC_TIMESTAMP())
               ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name), role = 'SUPER_ADMIN',
                 lawyer_id = 'ALL', status = 'ACTIVE', deleted_at = NULL, data = VALUES(data), profile_synced_at = UTC_TIMESTAMP()")
    ->execute([$id, $email, password_hash($password, PASSWORD_DEFAULT), $name, $profile]);
$pdo->prepare("INSERT INTO docs (collection, parent_path, id, data) VALUES ('users', '', ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)")
    ->execute([$id, $profile]);
$pdo->commit();
echo "تم: مدير المنصة $email ($id)\n";
