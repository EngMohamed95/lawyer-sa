<?php
/**
 * أدوات مشتركة لاختبارات التكامل: تجهيز قاعدة الاختبار، تشغيل php -S، طلبات HTTP بجرار كوكيز، والتحقق.
 * قاعدة الاختبار تُمسح بالكامل — الإعداد لازم اسم قاعدته فيه test و firebase_bridge = false.
 */

declare(strict_types=1);

function harness_start(string $configPath, int $port, array $extraConfig = []): PDO {
    global $base;
    if (!is_file($configPath)) { fwrite(STDERR, "مسار الإعداد غير موجود\n"); exit(2); }
    $config = require $configPath;
    if (!str_contains((string) $config['name'], 'test') || ($config['firebase_bridge'] ?? true) !== false) {
        fwrite(STDERR, "رفض: القاعدة لازم يكون اسمها فيه test و firebase_bridge = false\n"); exit(2);
    }
    $root = dirname(__DIR__, 2);
    $pdo = new PDO("mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4",
        $config['user'], $config['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) $pdo->exec("DROP TABLE `$t`");
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    $pdo->exec((string) file_get_contents("$root/database/schema.sql"));

    $runConfigPath = tempnam(sys_get_temp_dir(), 'mzcfg') . '.php';
    file_put_contents($runConfigPath, "<?php\nreturn " . var_export($config + $extraConfig, true) . ";\n");
    $env = getenv();
    $env['MZ_DB_CONFIG'] = $runConfigPath;
    $server = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", '-t', "$root/public"],
        [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', getenv('MZ_TEST_LOG') ?: 'NUL', 'a']], $pipes, $root, $env);
    for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) usleep(100_000);
    register_shutdown_function(function () use ($server, $runConfigPath) { proc_terminate($server); @unlink($runConfigPath); });
    $base = "http://127.0.0.1:$port/api/index.php?__route=";
    return $pdo;
}

/** مستخدم بكلمة مرور secret123 وملف شخصي في data */
function harness_user(PDO $pdo, string $id, string $email, string $role, ?string $lawyerId, array $data = [], string $status = 'ACTIVE'): void {
    $profile = ['name' => $id, 'role' => $role, 'status' => $status] + ($lawyerId !== null ? ['lawyerId' => $lawyerId] : []) + $data;
    $pdo->prepare('INSERT INTO users (id, email, password_hash, name, role, lawyer_id, status, data, firebase_pw_rotated_at) VALUES (?,?,?,?,?,?,?,?,NOW())')
        ->execute([$id, $email, password_hash('secret123', PASSWORD_DEFAULT), $id, $role, $lawyerId, $status, json_encode($profile)]);
}

$cookies = [];
/** طلب HTTP؛ $jar يمثل «متصفح» بكوكيزه. يرجع [الحالة, الجسم] */
function call(string $method, string $route, $body = null, string $jar = 'default', string $type = 'application/json', bool $assoc = true): array {
    global $base, $cookies;
    $ch = curl_init($base . $route);
    $headers = ["Content-Type: $type"];
    if (!empty($cookies[$jar])) $headers[] = 'Cookie: ' . implode('; ', array_map(fn($k, $v) => "$k=$v", array_keys($cookies[$jar]), $cookies[$jar]));
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $headers]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $type === 'application/json' ? json_encode($body, JSON_UNESCAPED_UNICODE) : http_build_query($body));
    $resp = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    if (preg_match_all('/^Set-Cookie:\s*([^=]+)=([^;]*)/mi', substr($resp, 0, $headerSize), $m, PREG_SET_ORDER)) {
        foreach ($m as [, $k, $v]) { if ($v === '' || $v === 'deleted') unset($cookies[$jar][$k]); else $cookies[$jar][$k] = $v; }
    }
    return [$status, json_decode(substr($resp, $headerSize), $assoc) ?? []];
}

function login(string $email, string $jar, string $password = 'secret123'): array {
    return call('POST', 'auth/login', ['email' => $email, 'password' => $password, 'rememberMe' => true], $jar);
}

$passed = 0; $failed = 0;
function check(string $name, bool $ok, $detail = null): void {
    global $passed, $failed;
    if ($ok) { $passed++; echo "  ✓ $name\n"; }
    else { $failed++; echo "  ✗ $name" . ($detail !== null ? ' — ' . json_encode($detail, JSON_UNESCAPED_UNICODE) : '') . "\n"; }
}

function harness_finish(): never {
    global $passed, $failed;
    echo "\nالنتيجة: $passed نجح، $failed فشل\n";
    exit($failed === 0 ? 0 : 1);
}
