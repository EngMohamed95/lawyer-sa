<?php
/**
 * اختبار تكامل لـ API الدخول والحسابات على قاعدة اختبار منفصلة.
 *
 *   php database/tests/api_auth_test.php <مسار-إعداد-قاعدة-الاختبار>
 *
 * الإعداد بنفس شكل db-config.php لكن لقاعدة اختبار (تُمسح بالكامل!) و 'firebase_bridge' => false
 * — فما في أي اتصال بـ Firebase. السكربت يشغّل php -S بنفسه على منفذ 8091.
 */

declare(strict_types=1);

$configPath = $argv[1] ?? '';
if (!is_file($configPath)) { fwrite(STDERR, "استخدم: php api_auth_test.php <test-config.php>\n"); exit(2); }
$config = require $configPath;
if (!str_contains((string) $config['name'], 'test') || ($config['firebase_bridge'] ?? true) !== false) {
    fwrite(STDERR, "رفض: القاعدة لازم يكون اسمها فيه test و firebase_bridge = false\n"); exit(2);
}

$root = dirname(__DIR__, 2);
$port = 8091;
$base = "http://127.0.0.1:$port/api/index.php?__route=";

/* ─── تجهيز القاعدة ─── */
$pdo = new PDO("mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4",
    $config['user'], $config['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) $pdo->exec("DROP TABLE `$t`");
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
$pdo->exec((string) file_get_contents("$root/database/schema.sql"));
while ($pdo->query('SELECT 1')) break; // يستهلك نتائج الاستعلامات المتعددة

$pw = password_hash('secret123', PASSWORD_DEFAULT);
$seed = function (string $id, string $email, string $role, ?string $lawyerId, array $data = [], string $status = 'ACTIVE') use ($pdo, $pw) {
    $profile = ['name' => $id, 'role' => $role, 'status' => $status] + ($lawyerId !== null ? ['lawyerId' => $lawyerId] : []) + $data;
    $pdo->prepare('INSERT INTO users (id, email, password_hash, name, role, lawyer_id, status, data, firebase_pw_rotated_at) VALUES (?,?,?,?,?,?,?,?,NOW())')
        ->execute([$id, $email, $pw, $id, $role, $lawyerId, $status, json_encode($profile)]);
};
$seed('ownerA', 'a@test.local', 'LAWYER', null);
$seed('ownerB', 'b@test.local', 'LAWYER', null);
$seed('ownerC', 'c@test.local', 'LAWYER', null, ['subscriptionBilling' => 'trial', 'trialEndsAt' => '2020-01-01T00:00:00Z']);
$seed('ownerD', 'd@test.local', 'LAWYER', null, [], 'DISABLED');
$seed('traineeA', 'ta@test.local', 'TRAINEE', 'ownerA');
$seed('disabledA', 'xa@test.local', 'SECRETARY', 'ownerA', [], 'DISABLED');
$seed('memberD', 'md@test.local', 'SECRETARY', 'ownerD');
$seed('admin', 'admin@test.local', 'SUPER_ADMIN', 'ALL');
// حساب ما انتقل بعد: صف بلا كلمة مرور، وكلمة مروره في «Firebase» الوهمي
$pdo->prepare("INSERT INTO users (id, email, name, role, lawyer_id, data) VALUES ('legacy1', 'legacy@test.local', 'legacy', 'TRAINEE', 'ownerA', ?)")
    ->execute([json_encode(['name' => 'legacy', 'role' => 'TRAINEE', 'lawyerId' => 'ownerA'])]);
// حساب Firebase بلا ملف شخصي (تسجيل ذاتي ما اكتمل)
$pdo->prepare("INSERT INTO users (id, email) VALUES ('pending1', 'pending@test.local')")->execute();

/* ─── خادم PHP — بإعداد مؤقت فيه حسابات Firebase الوهمية ─── */
$runConfig = $config + ['test_firebase_accounts' => [
    'legacy@test.local' => ['legacy1', 'oldpass1'],
    'pending@test.local' => ['pending1', 'pendpass1'],
    // هجوم: بريد في Firebase يرجع معرّف حساب منقول (عنده كلمة مرور في MySQL)
    'attacker@test.local' => ['ownerA', 'attackpw1'],
    // هجوم: البريد الأصلي للضحية لكن كلمة مرور Firebase غيّرها المهاجم
    'ta@test.local' => ['traineeA', 'firebase-set-by-attacker'],
]];
$runConfigPath = tempnam(sys_get_temp_dir(), 'mzcfg') . '.php';
file_put_contents($runConfigPath, "<?php\nreturn " . var_export($runConfig, true) . ";\n");
register_shutdown_function(fn() => @unlink($runConfigPath));
$env = getenv();
$env['MZ_DB_CONFIG'] = $runConfigPath;
$server = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", '-t', "$root/public"], [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']], $pipes, $root, $env);
for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) usleep(100_000);
register_shutdown_function(function () use ($server) { proc_terminate($server); });

/* ─── أدوات ─── */
$cookies = []; // جرة كوكيز لكل «متصفح»
function call(string $method, string $route, ?array $body = null, string $jar = 'default', string $type = 'application/json'): array {
    global $base, $cookies;
    $ch = curl_init($base . $route);
    $headers = ["Content-Type: $type"];
    if (!empty($cookies[$jar])) $headers[] = 'Cookie: ' . implode('; ', array_map(fn($k, $v) => "$k=$v", array_keys($cookies[$jar]), $cookies[$jar]));
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $headers]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $type === 'application/json' ? json_encode($body) : http_build_query($body));
    $resp = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    if (preg_match_all('/^Set-Cookie:\s*([^=]+)=([^;]*)/mi', substr($resp, 0, $headerSize), $m, PREG_SET_ORDER)) {
        foreach ($m as [, $k, $v]) { if ($v === '' || $v === 'deleted') unset($cookies[$jar][$k]); else $cookies[$jar][$k] = $v; }
    }
    return [$status, json_decode(substr($resp, $headerSize), true) ?? []];
}

$passed = 0; $failed = 0;
function check(string $name, bool $ok, $detail = null): void {
    global $passed, $failed;
    if ($ok) { $passed++; echo "  ✓ $name\n"; }
    else { $failed++; echo "  ✗ $name" . ($detail !== null ? ' — ' . json_encode($detail, JSON_UNESCAPED_UNICODE) : '') . "\n"; }
}
function login(string $email, string $jar, string $password = 'secret123'): array {
    return call('POST', 'auth/login', ['email' => $email, 'password' => $password, 'rememberMe' => true], $jar);
}
$col = fn(string $sql, array $p = []) => (function () use ($pdo, $sql, $p) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchColumn(); })();

/* ─── الاختبارات ─── */
echo "الدخول\n";
[$s, $r] = login('a@test.local', 'x', 'wrong-pass');
check('كلمة مرور غلط ← 401', $s === 401 && ($r['code'] ?? '') === 'INVALID_CREDENTIALS', [$s, $r]);
[$s, $r] = login('nobody@test.local', 'x');
check('بريد غير موجود ← 401 بنفس الرسالة', $s === 401 && ($r['code'] ?? '') === 'INVALID_CREDENTIALS', [$s, $r]);
[$s, $r] = login('A@Test.Local', 'A');
check('دخول المالك (البريد بأي حالة أحرف) ← 200 + توكن Firebase', $s === 200 && ($r['firebaseToken'] ?? '') === 'test-token:ownerA' && ($r['user']['role'] ?? '') === 'LAWYER', [$s, $r]);
check('الكوكي HttpOnly محفوظ', !empty($cookies['A']['mz_session']));
check('القاعدة تخزن hash التوكن فقط', $col('SELECT COUNT(*) FROM auth_sessions WHERE token_hash = ?', [hash('sha256', $cookies['A']['mz_session'] ?? '')]) == 1);
[$s, $r] = call('GET', 'auth/me', null, 'A');
check('/auth/me بالجلسة ← المستخدم', $s === 200 && ($r['user']['id'] ?? '') === 'ownerA', [$s, $r]);
[$s, $r] = call('GET', 'auth/me', null, 'nobody');
check('/auth/me بدون جلسة ← 401', $s === 401, [$s, $r]);
[$s, $r] = call('POST', 'auth/firebase-token', [], 'A');
check('توكن Firebase جديد من الجلسة', $s === 200 && ($r['firebaseToken'] ?? '') === 'test-token:ownerA', [$s, $r]);

[$s, $r] = login('xa@test.local', 'X');
check('عضو معطّل ← 403', $s === 403 && ($r['code'] ?? '') === 'ACCOUNT_DISABLED', [$s, $r]);
[$s, $r] = login('md@test.local', 'X');
check('عضو في مكتب موقوف ← 403', $s === 403 && ($r['code'] ?? '') === 'OFFICE_DISABLED', [$s, $r]);
[$s, $r] = login('d@test.local', 'X');
check('مالك مكتب موقوف ← 403', $s === 403 && ($r['code'] ?? '') === 'OFFICE_DISABLED', [$s, $r]);
check('الدخول المرفوض ما ينشئ جلسة', empty($cookies['X']['mz_session']));

echo "نقل كلمات المرور من Firebase\n";
[$s, $r] = login('legacy@test.local', 'L', 'oldpass1');
check('حساب ما انتقل يدخل بكلمة مروره القديمة', $s === 200 && ($r['user']['id'] ?? '') === 'legacy1', [$s, $r]);
check('كلمة المرور انحفظت في MySQL', password_verify('oldpass1', (string) $col('SELECT password_hash FROM users WHERE id = ?', ['legacy1'])));
[$s] = login('legacy@test.local', 'L2', 'oldpass1');
check('الدخول الثاني من MySQL مباشرة', $s === 200, $s);
[$s, $r] = login('attacker@test.local', 'ATK', 'attackpw1');
check('ثغرة: بريد Firebase ثاني لمعرّف حساب منقول ← مرفوض', $s === 401 && empty($cookies['ATK']['mz_session']), [$s, $r]);
check('… وما انضاف صف للمهاجم', $col('SELECT COUNT(*) FROM users WHERE email = ?', ['attacker@test.local']) == 0);
[$s, $r] = login('ta@test.local', 'ATK2', 'firebase-set-by-attacker');
check('ثغرة: كلمة مرور Firebase مغيّرة لحساب منقول ← مرفوضة', $s === 401, [$s, $r]);
[$s, $r] = login('pending@test.local', 'P', 'pendpass1');
check('تسجيل ذاتي ما اكتمل يدخل بدون ملف (hasProfile=false)', $s === 200 && ($r['hasProfile'] ?? null) === false, [$s, $r]);
[$s, $r] = call('POST', 'accounts', ['email' => 'p2@test.local', 'password' => 'secret123', 'role' => 'TRAINEE'], 'P');
check('… لكنه مو عضو ما يقدر ينشئ شي ← 403', $s === 403, [$s, $r]);

echo "حماية الطلبات\n";
[$s] = call('POST', 'auth/login', ['email' => 'a@test.local', 'password' => 'secret123'], 'F', 'application/x-www-form-urlencoded');
check('POST بنموذج HTML (CSRF) ← 415', $s === 415, $s);
[$s] = call('GET', 'no/such/route');
check('مسار غير موجود ← 404', $s === 404, $s);
[$s] = call('GET', 'auth/login');
check('طريقة غلط ← 405', $s === 405, $s);

echo "إنشاء الحسابات\n";
[$s, $r] = call('POST', 'accounts', ['email' => 'new1@test.local', 'password' => 'secret123', 'name' => 'متدرب', 'role' => 'TRAINEE'], 'A');
$new1 = $r['id'] ?? '';
check('المالك ينشئ متدرب ← 201', $s === 201 && strlen($new1) === 28, [$s, $r]);
check('الحساب الجديد في مكتب المالك', $col('SELECT lawyer_id FROM users WHERE id = ?', [$new1]) === 'ownerA');
[$s, $r] = call('POST', 'accounts', ['email' => 'new2@test.local', 'password' => 'secret123', 'role' => 'SECRETARY', 'lawyerId' => 'ownerB'], 'A');
check('lawyerId من الطلب يُتجاهل (ما يقدر يضيف لمكتب ثاني)', $s === 201 && $col('SELECT lawyer_id FROM users WHERE id = ?', [$r['id'] ?? '']) === 'ownerA', [$s, $r]);
[$s, $r] = call('POST', 'accounts', ['email' => 'new3@test.local', 'password' => 'secret123', 'role' => 'LAWYER'], 'A');
check('المالك ما ينشئ مكتب ← 403', $s === 403, [$s, $r]);
[$s, $r] = call('POST', 'accounts', ['email' => 'new3@test.local', 'password' => 'secret123', 'role' => 'SUPER_ADMIN'], 'A');
check('المالك ما ينشئ مدير منصة ← 403', $s === 403, [$s, $r]);
[$s, $r] = call('POST', 'accounts', ['email' => 'NEW1@test.local', 'password' => 'secret123', 'role' => 'TRAINEE'], 'A');
check('بريد مكرر ← 409', $s === 409 && ($r['code'] ?? '') === 'EMAIL_EXISTS', [$s, $r]);
[$s, $r] = call('POST', 'accounts', ['email' => 'new4@test.local', 'password' => '123', 'role' => 'TRAINEE'], 'A');
check('كلمة مرور ضعيفة ← 422', $s === 422 && ($r['code'] ?? '') === 'WEAK_PASSWORD', [$s, $r]);
[$s, $r] = call('POST', 'accounts', ['email' => 'new5@test.local', 'password' => 'secret123', 'role' => 'TRAINEE']);
check('بدون جلسة ← 401', $s === 401, [$s, $r]);

login('ta@test.local', 'TA');
[$s, $r] = call('POST', 'accounts', ['email' => 'new6@test.local', 'password' => 'secret123', 'role' => 'TRAINEE'], 'TA');
check('المتدرب ما ينشئ حسابات ← 403', $s === 403, [$s, $r]);

login('c@test.local', 'C');
[$s, $r] = call('POST', 'accounts', ['email' => 'new7@test.local', 'password' => 'secret123', 'role' => 'TRAINEE'], 'C');
check('مكتب انتهت تجربته ما يضيف أعضاء ← 403', $s === 403 && ($r['code'] ?? '') === 'TRIAL_EXPIRED', [$s, $r]);

login('admin@test.local', 'ADM');
[$s, $r] = call('POST', 'accounts', ['email' => 'new8@test.local', 'password' => 'secret123', 'role' => 'TRAINEE', 'lawyerId' => 'ownerB'], 'ADM');
check('مدير المنصة يضيف عضو لمكتب محدد', $s === 201 && $col('SELECT lawyer_id FROM users WHERE id = ?', [$r['id'] ?? '']) === 'ownerB', [$s, $r]);
[$s, $r] = call('POST', 'accounts', ['email' => 'new9@test.local', 'password' => 'secret123', 'role' => 'TRAINEE', 'lawyerId' => 'traineeA'], 'ADM');
check('مدير المنصة: lawyerId لازم يكون مكتب حقيقي ← 422', $s === 422, [$s, $r]);
[$s, $r] = call('POST', 'accounts', ['email' => 'new10@test.local', 'password' => 'secret123', 'role' => 'LAWYER'], 'ADM');
check('مدير المنصة ينشئ مكتب جديد', $s === 201 && $col('SELECT lawyer_id FROM users WHERE id = ?', [$r['id'] ?? '']) === null, [$s, $r]);

echo "حذف حساب بلا ملف شخصي (تراجع)\n";
[$s] = call('DELETE', "accounts/$new1", null, 'B');
check('مكتب ثاني ما يحذف عضو مكتبي ← 401/403', $s === 401 || $s === 403, $s);
login('b@test.local', 'B');
[$s] = call('DELETE', "accounts/$new1", null, 'B');
check('مالك مكتب ثاني ← 403', $s === 403, $s);
[$s] = call('DELETE', "accounts/$new1", null, 'A');
check('المالك يتراجع عن حساب أنشأه ← 200', $s === 200 && $col('SELECT COUNT(*) FROM users WHERE id = ?', [$new1]) == 0, $s);
[$s] = call('DELETE', 'accounts/traineeA', null, 'A');
check('ما يحذف حساب له ملف شخصي ← 409', $s === 409, $s);

echo "تغيير كلمة المرور\n";
login('a@test.local', 'A2'); // جهاز ثاني
[$s, $r] = call('POST', 'auth/change-password', ['currentPassword' => 'nope', 'newPassword' => 'newpass456'], 'A');
check('كلمة المرور الحالية غلط ← 401', $s === 401, [$s, $r]);
$pdo->prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))')->execute([hash('sha256', 'open-before-change'), 'ownerA']);
[$s, $r] = call('POST', 'auth/change-password', ['currentPassword' => 'secret123', 'newPassword' => 'newpass456'], 'A');
check('تغيير كلمة المرور ← 200', $s === 200, [$s, $r]);
[$s] = call('POST', 'auth/password-reset/confirm', ['token' => 'open-before-change', 'newPassword' => 'hijack999']);
check('رابط استعادة قديم يبطل بعد تغيير كلمة المرور', $s === 400, $s);
[$s] = call('GET', 'auth/me', null, 'A');
check('الجهاز الحالي يظل داخل', $s === 200, $s);
[$s] = call('GET', 'auth/me', null, 'A2');
check('الجهاز الثاني يخرج', $s === 401, $s);
[$s] = login('a@test.local', 'A3');
check('كلمة المرور القديمة ما تشتغل', $s === 401, $s);
[$s] = login('a@test.local', 'A3', 'newpass456');
check('كلمة المرور الجديدة تشتغل', $s === 200, $s);

echo "استعادة كلمة المرور\n";
[$s, $r] = call('POST', 'auth/password-reset/request', ['email' => 'ghost@test.local']);
check('بريد غير موجود ← نفس الرد العام', $s === 200 && ($r['ok'] ?? false) === true, [$s, $r]);
[$s, $r] = call('POST', 'auth/password-reset/request', ['email' => 'b@test.local']);
check('بريد موجود ← 200 ويُنشأ رابط', $s === 200 && $col('SELECT COUNT(*) FROM password_resets WHERE user_id = ?', ['ownerB']) == 1, [$s, $r]);
$token = 'known-test-token';
$pdo->prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))')->execute([hash('sha256', $token), 'ownerB']);
[$s, $r] = call('POST', 'auth/password-reset/confirm', ['token' => 'wrong', 'newPassword' => 'resetpw789']);
check('رابط غلط ← 400', $s === 400 && ($r['code'] ?? '') === 'INVALID_TOKEN', [$s, $r]);
[$s, $r] = call('POST', 'auth/password-reset/confirm', ['token' => $token, 'newPassword' => 'resetpw789']);
check('رابط صحيح ← 200', $s === 200, [$s, $r]);
[$s] = call('GET', 'auth/me', null, 'B');
check('كل جلسات المستخدم تنتهي بعد الاستعادة', $s === 401, $s);
[$s] = call('POST', 'auth/password-reset/confirm', ['token' => $token, 'newPassword' => 'another000']);
check('الرابط لمرة وحدة', $s === 400, $s);
[$s] = login('b@test.local', 'B', 'resetpw789');
check('الدخول بكلمة المرور الجديدة', $s === 200, $s);
$pdo->prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE))')->execute([hash('sha256', 'expired'), 'ownerB']);
[$s] = call('POST', 'auth/password-reset/confirm', ['token' => 'expired', 'newPassword' => 'resetpw000']);
check('رابط منتهي ← 400', $s === 400, $s);

echo "الخروج والحد من التخمين\n";
[$s] = call('POST', 'auth/logout', [], 'A3');
[$s2] = call('GET', 'auth/me', null, 'A3');
check('الخروج ينهي الجلسة', $s === 200 && $s2 === 401, [$s, $s2]);
for ($i = 0; $i < 5; $i++) login('ta@test.local', 'R', 'bad');
[$s, $r] = login('ta@test.local', 'R');
check('بعد 5 محاولات فاشلة ← 429 حتى لو كلمة المرور صحيحة', $s === 429 && ($r['code'] ?? '') === 'RATE_LIMITED', [$s, $r]);
[$s] = login('admin@test.local', 'R');
check('الحد لكل بريد — بريد ثاني من نفس الجهاز يدخل', $s === 200, $s);

echo "\nالنتيجة: $passed نجح، $failed فشل\n";
exit($failed === 0 ? 0 : 1);
