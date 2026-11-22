<?php
/**
 * /api/v1/auth/* — الدخول، الخروج، تغيير واستعادة كلمة المرور.
 */

declare(strict_types=1);

require_once __DIR__ . '/access.php';
require_once __DIR__ . '/bridge.php';
require_once dirname(__DIR__, 2) . '/_mailer.php';

const LOGIN_WINDOW = 900;              // 15 دقيقة
const LOGIN_MAX_PER_EMAIL_IP = 5;      // نفس البريد من نفس العنوان — القفل العادي
const LOGIN_MAX_PER_EMAIL = 25;        // نفس البريد من كل العناوين — ضد التخمين الموزّع، وعالي
                                       // كفاية عشان ما يقدر أحد يقفل حساب غيره بسهولة
const LOGIN_MAX_PER_IP = 30;           // من نفس العنوان لكل البريدات
const RESET_TTL = 3600;
const RESET_MAX_PER_HOUR = 3;

const MSG_BAD_CREDENTIALS = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';

function login_rate_limit(string $email): void {
    $since = utc_now(-LOGIN_WINDOW);
    $row = q('SELECT COUNT(*) AS by_email, COALESCE(SUM(ip = ?), 0) AS by_email_ip
                FROM login_attempts WHERE email = ? AND success = 0 AND created_at > ?', [client_ip(), $email, $since])->fetch();
    $byIp = (int) q('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > ?', [client_ip(), $since])->fetchColumn();
    if ((int) $row['by_email_ip'] >= LOGIN_MAX_PER_EMAIL_IP || (int) $row['by_email'] >= LOGIN_MAX_PER_EMAIL || $byIp >= LOGIN_MAX_PER_IP) {
        fail(429, 'محاولات دخول كثيرة. انتظر 15 دقيقة ثم حاول مرة أخرى.', 'RATE_LIMITED');
    }
}

function login_record(string $email, bool $success): void {
    q('INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, ?)', [$email, client_ip(), $success ? 1 : 0]);
    if ($success) q('DELETE FROM login_attempts WHERE email = ? AND success = 0', [$email]);
    if (random_int(1, 100) === 1) q('DELETE FROM login_attempts WHERE created_at < ? LIMIT 5000', [utc_now(-86400)]);
}

/**
 * يتحقق من كلمة المرور ويرجع معرّف المستخدم أو null.
 * الحساب اللي ما انتقل بعد (password_hash = NULL): نتحقق عند Firebase مرة وحدة،
 * ونخزن bcrypt في MySQL، ونستبدل كلمة مرور Firebase بقيمة عشوائية.
 */
function verify_credentials(string $email, string $password): ?string {
    $row = q_one('SELECT id, password_hash FROM users WHERE email = ?', [$email]);
    if ($row !== null && $row['password_hash'] !== null) {
        if (!password_verify($password, (string) $row['password_hash'])) return null;
        if (password_needs_rehash((string) $row['password_hash'], PASSWORD_DEFAULT)) {
            q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $row['id']]);
        }
        return (string) $row['id'];
    }

    $uid = bridge_firebase_password_uid($email, $password);
    if ($uid === null) return null;
    // مسار Firebase للحسابات اللي ما انتقلت بس. لو المعرّف موجود عندنا ببريد ثاني أو بكلمة مرور
    // منقولة، فـ MySQL هو المرجع — وإلا يقدر أحد يغيّر بريد/كلمة مرور الحساب في Firebase
    // (بجلسة مسروقة) ويدخل بها للأبد متجاوزاً كلمة المرور الحقيقية.
    $byId = q_one('SELECT email, password_hash FROM users WHERE id = ?', [$uid]);
    if ($byId !== null && ($byId['email'] !== $email || $byId['password_hash'] !== null)) return null;
    if (!bridge_import_account($uid, $email)) {
        fail(409, 'يوجد تعارض في بيانات هذا الحساب. تواصل مع الدعم الفني.', 'ACCOUNT_CONFLICT');
    }
    q('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash IS NULL', [password_hash($password, PASSWORD_DEFAULT), $uid]);
    return $uid;
}

/**
 * نفس قيود startSession في الواجهة، لكن على السيرفر (ما يقدر أحد يتجاوزها).
 * $profile من Firestore — مصدر الحقيقة في المرحلة 1.
 */
function assert_can_login(?array $profile): void {
    if ($profile === null) return; // تسجيل ذاتي ما اكتمل — الواجهة تكمل التسجيل (NoProfileError)
    $role = (string) ($profile['role'] ?? 'TRAINEE');
    $status = is_string($profile['status'] ?? null) ? $profile['status'] : 'ACTIVE';

    if ($role === 'SUPER_ADMIN') {
        if ($status === 'DISABLED') fail(403, 'هذا الحساب الإداري معطّل. تواصل مع المدير العام للمنصة.', 'ACCOUNT_DISABLED');
        return;
    }
    if ($role !== 'LAWYER' && (!empty($profile['deletedAt']) || blocked_status($status))) {
        fail(403, 'هذا الحساب غير مفعّل. تواصل مع مدير المكتب.', 'ACCOUNT_DISABLED');
    }
    // المكتب: للمالك مستنده نفسه، وللعضو مستند مالك مكتبه
    $office = $role === 'LAWYER' ? $profile : null;
    $officeId = is_string($profile['lawyerId'] ?? null) ? $profile['lawyerId'] : '';
    if ($role !== 'LAWYER' && $officeId !== '' && $officeId !== 'ALL') {
        $office = bridge_profile($officeId);
        if ($office !== null && q_one('SELECT 1 FROM users WHERE id = ?', [$officeId])) {
            bridge_sync_profile($officeId, $office);
        }
    }
    if ($office !== null && blocked_status(is_string($office['status'] ?? null) ? $office['status'] : null)) {
        fail(403, 'هذا الحساب موقوف من إدارة المنصة. تواصل مع الدعم الفني لإعادة تفعيله.', 'OFFICE_DISABLED');
    }
}

function public_user(array $u): array {
    return [
        'id' => (string) $u['id'],
        'email' => (string) $u['email'],
        'name' => (string) $u['name'],
        'role' => (string) $u['role'],
        'lawyerId' => $u['lawyer_id'] ?? null,
        'status' => (string) $u['status'],
    ];
}

function load_user(string $id): array {
    $u = q_one('SELECT id, email, name, role, lawyer_id, status, deleted_at, data FROM users WHERE id = ?', [$id]);
    if ($u === null) fail(401, 'انتهت الجلسة. سجّل الدخول مرة أخرى.', 'UNAUTHENTICATED');
    $u['data'] = $u['data'] !== null ? (json_decode((string) $u['data'], true) ?: []) : [];
    return $u;
}

/* ───────────────────────────── المسارات ───────────────────────────── */

function route_auth_login(): void {
    $email = normalize_email(body_str('email', 191));
    $password = body_password();
    $remember = (bool) (json_body()['rememberMe'] ?? false);

    login_rate_limit($email);
    $uid = verify_credentials($email, $password);
    login_record($email, $uid !== null);
    if ($uid === null) fail(401, MSG_BAD_CREDENTIALS, 'INVALID_CREDENTIALS');

    $profile = bridge_profile($uid);
    bridge_sync_profile($uid, $profile);
    assert_can_login($profile);

    $row = q_one('SELECT firebase_pw_rotated_at FROM users WHERE id = ?', [$uid]);
    if ($row !== null && $row['firebase_pw_rotated_at'] === null) bridge_rotate_firebase_password($uid);

    q('UPDATE users SET last_login_at = ? WHERE id = ?', [utc_now(), $uid]);
    session_create($uid, $remember);

    respond(200, [
        'user' => public_user(load_user($uid)),
        'hasProfile' => $profile !== null,
        'firebaseToken' => bridge_custom_token($uid),
    ]);
}

function route_auth_logout(): void {
    session_destroy_current();
    respond(200, ['ok' => true]);
}

function route_auth_me(): void {
    respond(200, ['user' => public_user(require_user())]);
}

/** توكن Firebase جديد — لما تنتهي جلسة Firebase والجلسة عندنا ما زالت سارية */
function route_auth_firebase_token(): void {
    $u = require_user();
    // الحالة من Firestore الآن، مو من آخر دخول — حساب عُطّل بعد دخوله ما ياخذ توكن جديد
    $profile = bridge_profile((string) $u['id']);
    bridge_sync_profile((string) $u['id'], $profile);
    assert_can_login($profile);
    respond(200, ['firebaseToken' => bridge_custom_token((string) $u['id'])]);
}

function route_auth_change_password(): void {
    $u = require_user();
    $current = body_password('currentPassword');
    $new = body_password('newPassword');
    assert_new_password($new, 'newPassword');

    login_rate_limit((string) $u['email']);
    $ok = verify_credentials((string) $u['email'], $current) === (string) $u['id'];
    login_record((string) $u['email'], $ok);
    if (!$ok) fail(401, 'كلمة المرور الحالية غير صحيحة.', 'INVALID_CREDENTIALS', ['field' => 'currentPassword']);

    q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
    // روابط الاستعادة المفتوحة تبطل — وإلا تقدر تغيّر كلمة المرور الجديدة خلال ساعة
    q('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [utc_now(), $u['id']]);
    session_destroy_others((string) $u['id']);
    bridge_rotate_firebase_password((string) $u['id'], true);
    respond(200, ['ok' => true]);
}

/** دائماً نفس الرد — ما نكشف هل البريد مسجّل أو لا */
function route_auth_reset_request(): void {
    $email = normalize_email(body_str('email', 191));
    $generic = ['ok' => true, 'message' => 'إذا كان البريد مسجّلاً ستصلك رسالة فيها رابط تعيين كلمة المرور.'];
    // قبل أي بحث: نقص الإعداد ما يرد بشكل مختلف للبريد المسجّل وغير المسجّل
    $appUrl = rtrim((string) app_config()['app_url'], '/');
    if ($appUrl === '') {
        error_log('api: app_url غير مضبوط في db-config.php — ما نقدر نبني رابط الاستعادة');
        fail(503, 'الخدمة غير متاحة حالياً. تواصل مع الدعم الفني.', 'NOT_CONFIGURED');
    }

    // عدّاد منفصل عن الدخول (المفتاح reset:) عشان طلبات الاستعادة ما تقفل الدخول،
    // والعنوان (IP) يُحسب مع محاولات الدخول — يمنع استخدام الاستعادة لإغراق البريد
    login_rate_limit("reset:$email");
    login_record("reset:$email", false);

    $row = q_one('SELECT id, name FROM users WHERE email = ?', [$email]);
    if ($row === null) {
        $uid = bridge_firebase_uid_by_email($email);
        if ($uid === null || !bridge_import_account($uid, $email)) respond(200, $generic);
        bridge_sync_profile($uid, bridge_profile($uid));
        $row = q_one('SELECT id, name FROM users WHERE email = ?', [$email]);
        if ($row === null) respond(200, $generic);
    }

    $recent = (int) q('SELECT COUNT(*) FROM password_resets WHERE user_id = ? AND created_at > ?', [$row['id'], utc_now(-3600)])->fetchColumn();
    if ($recent >= RESET_MAX_PER_HOUR) respond(200, $generic);

    $token = random_token();
    q('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [token_hash($token), $row['id'], utc_now(RESET_TTL)]);

    $link = $appUrl . '/reset-password?token=' . rawurlencode($token);
    $name = htmlspecialchars((string) $row['name'] ?: 'مستخدم موازين', ENT_QUOTES, 'UTF-8');
    $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
    $html = <<<HTML
<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">
  <p>مرحباً {$name}،</p>
  <p>طلبت تعيين كلمة مرور جديدة لحسابك في موازين. اضغط الرابط التالي خلال ساعة:</p>
  <p><a href="{$safeLink}">تعيين كلمة المرور</a></p>
  <p>إذا ما طلبت هذا، تجاهل الرسالة — كلمة مرورك ما تتغير.</p>
</div>
HTML;
    if (!send_mawazeen_email($email, (string) $row['name'], 'تعيين كلمة المرور — موازين', $html)) {
        error_log("api: تعذّر إرسال بريد الاستعادة لـ {$row['id']}");
    }
    respond(200, $generic);
}

function route_auth_reset_confirm(): void {
    $token = body_str('token', 128);
    $new = body_password('newPassword');
    assert_new_password($new, 'newPassword');

    $pdo = db();
    $pdo->beginTransaction();
    $reset = q_one('SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? FOR UPDATE',
        [token_hash($token), utc_now()]);
    if ($reset === null) {
        $pdo->rollBack();
        fail(400, 'رابط تعيين كلمة المرور غير صالح أو منتهي. اطلب رابطاً جديداً.', 'INVALID_TOKEN');
    }
    $uid = (string) $reset['user_id'];
    q('UPDATE password_resets SET used_at = ? WHERE token_hash = ?', [utc_now(), token_hash($token)]);
    // أي رابط ثاني لنفس المستخدم يبطل
    q('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [utc_now(), $uid]);
    q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $uid]);
    q('DELETE FROM auth_sessions WHERE user_id = ?', [$uid]);
    // المحاولات الفاشلة السابقة ما تقفل الدخول بكلمة المرور الجديدة
    q('DELETE a FROM login_attempts a JOIN users u ON u.email = a.email WHERE u.id = ? AND a.success = 0', [$uid]);
    $pdo->commit();

    bridge_rotate_firebase_password($uid, true);
    respond(200, ['ok' => true]);
}
