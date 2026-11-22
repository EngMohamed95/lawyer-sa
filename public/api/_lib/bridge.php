<?php
/**
 * جسر Firebase أثناء التحويل على مراحل.
 *
 * تسجيل الدخول صار في MySQL، لكن مجموعات كثيرة ما زالت في Firestore وتحميها
 * firestore.rules اللي تعتمد على request.auth.uid. فبعد الدخول نصدر توكن Firebase
 * مخصص لنفس المعرّف، والواجهة تدخل به Firebase فتظل تلك المجموعات شغالة.
 * يُحذف هذا الملف في المرحلة 5 بعد ما تنتقل كل البيانات.
 */

declare(strict_types=1);

require_once __DIR__ . '/core.php';

/** توكن وصول حساب الخدمة، مخزّن في app_cache لساعة إلا دقائق — بدل طلب OAuth مع كل دخول */
function bridge_admin_token(): string {
    $row = q_one('SELECT v FROM app_cache WHERE k = ? AND expires_at > ?', ['sa_access_token', utc_now(60)]);
    if ($row) return (string) $row['v'];
    $token = admin_access_token(service_account());
    q('REPLACE INTO app_cache (k, v, expires_at) VALUES (?, ?, ?)', ['sa_access_token', $token, utc_now(3300)]);
    return $token;
}

/**
 * توكن Firebase مخصص (custom token) — JWT موقّع بمفتاح حساب الخدمة.
 * https://firebase.google.com/docs/auth/admin/create-custom-tokens#create_custom_tokens_using_a_third-party_jwt_library
 */
function bridge_custom_token(string $uid): string {
    if (!bridge_enabled()) return "test-token:$uid";
    $sa = service_account();
    $now = time();
    $header = b64url_encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT', 'kid' => $sa['private_key_id']]));
    $claims = b64url_encode(json_encode([
        'iss' => $sa['client_email'],
        'sub' => $sa['client_email'],
        'aud' => 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        'iat' => $now,
        'exp' => $now + 3600,
        'uid' => $uid,
    ]));
    $signature = '';
    if (!openssl_sign("$header.$claims", $signature, $sa['private_key'], OPENSSL_ALGO_SHA256)) {
        error_log('api: تعذّر توقيع التوكن المخصص');
        fail(503, 'تعذّر إكمال الدخول. أعد المحاولة بعد قليل.', 'UNAVAILABLE');
    }
    return "$header.$claims." . b64url_encode($signature);
}

/**
 * يتحقق من كلمة المرور عند Firebase Auth — للمستخدم اللي ما انتقلت كلمة مروره لـ MySQL بعد.
 * يرجع uid عند النجاح، أو null لو البيانات غلط.
 */
function bridge_firebase_password_uid(string $email, string $password): ?string {
    if (!bridge_enabled()) {
        // وضع الاختبار: حسابات Firebase وهمية من الإعداد [email => [uid, password]]
        $fake = app_config()['test_firebase_accounts'][$email] ?? null;
        return is_array($fake) && hash_equals((string) $fake[1], $password) ? (string) $fake[0] : null;
    }
    $key = (string) app_config()['firebase_web_api_key'];
    [$status, $body] = http_request('POST',
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' . rawurlencode($key),
        ['Content-Type: application/json'],
        json_encode(['email' => $email, 'password' => $password, 'returnSecureToken' => false]));
    $data = json_decode($body, true);
    if ($status === 200 && is_array($data) && !empty($data['localId'])) return (string) $data['localId'];
    $code = is_array($data) ? (string) ($data['error']['message'] ?? '') : '';
    // بيانات غلط أو حساب غير موجود — نفس الرد للمستخدم
    if ($status === 400 && preg_match('/^(INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED)/', $code)) {
        return null;
    }
    if ($status === 400 && str_starts_with($code, 'TOO_MANY_ATTEMPTS')) {
        fail(429, 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.', 'RATE_LIMITED');
    }
    error_log("api: فشل التحقق عند Firebase ($status): " . substr($body, 0, 300));
    fail(503, 'تعذّر التحقق من بيانات الدخول. أعد المحاولة بعد قليل.', 'UNAVAILABLE');
}

/**
 * بعد نقل كلمة المرور لـ MySQL نستبدل كلمة مرور Firebase بقيمة عشوائية.
 * بدونها يقدر أي أحد يعرف كلمة المرور القديمة يدخل Firestore مباشرة متجاوزاً MySQL
 * (مثلاً بعد ما يغيّر المستخدم كلمة مروره عندنا). معطّل محلياً عشان التطوير ما يلمس حسابات حقيقية.
 */
function bridge_rotate_firebase_password(string $uid, bool $revokeSessions = false): bool {
    // نصفّر العلامة أولاً: لو فشل التدوير، أول دخول جاي يعيد المحاولة
    q('UPDATE users SET firebase_pw_rotated_at = NULL WHERE id = ?', [$uid]);
    if (!bridge_enabled() || !app_config()['rotate_firebase_passwords']) return false;
    $project = (string) app_config()['firebase_project_id'];
    $payload = ['localId' => $uid, 'password' => random_token(24)];
    // validSince يبطل كل جلسات Firebase القديمة (بعد تغيير/استعادة كلمة المرور) —
    // الجهاز الحالي يجدد جلسته تلقائياً من /auth/firebase-token
    if ($revokeSessions) $payload['validSince'] = (string) time();
    [$status, $body] = http_request('POST',
        "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:update",
        ['Authorization: Bearer ' . bridge_admin_token(), 'Content-Type: application/json'],
        json_encode($payload));
    if ($status !== 200) {
        // ما نوقف الدخول — نعيد المحاولة في الدخول الجاي (firebase_pw_rotated_at يظل NULL)
        error_log("api: تعذّر تدوير كلمة مرور Firebase لـ $uid ($status): " . substr($body, 0, 200));
        return false;
    }
    q('UPDATE users SET firebase_pw_rotated_at = ? WHERE id = ?', [utc_now(), $uid]);
    return true;
}

/** معرّف الحساب في Firebase Auth لهذا البريد، أو null — للمستخدم اللي ما انتقل لـ MySQL بعد */
function bridge_firebase_uid_by_email(string $email): ?string {
    if (!bridge_enabled()) {
        $fake = app_config()['test_firebase_accounts'][$email] ?? null;
        return is_array($fake) ? (string) $fake[0] : null;
    }
    $project = (string) app_config()['firebase_project_id'];
    [$status, $body] = http_request('POST',
        "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:lookup",
        ['Authorization: Bearer ' . bridge_admin_token(), 'Content-Type: application/json'],
        json_encode(['email' => [$email]]));
    if ($status !== 200) {
        error_log("api: فشل البحث عن البريد في Firebase ($status): " . substr($body, 0, 200));
        fail(503, 'تعذّر إنشاء الحساب حالياً. أعد المحاولة بعد قليل.', 'UNAVAILABLE');
    }
    $data = json_decode($body, true);
    $uid = is_array($data) ? ($data['users'][0]['localId'] ?? null) : null;
    return is_string($uid) && $uid !== '' ? $uid : null;
}

/**
 * يضيف صف MySQL لحساب موجود في Firebase وما انتقل بعد (بدون كلمة مرور).
 * يرجع false لو البريد مربوط بمعرّف مختلف في MySQL — تعارض يحتاج تدخل يدوي.
 */
function bridge_import_account(string $uid, string $email): bool {
    $existing = q_one('SELECT id FROM users WHERE email = ?', [$email]);
    if ($existing !== null) {
        if ($existing['id'] === $uid) return true;
        error_log("api: تعارض — البريد مربوط بـ {$existing['id']} في MySQL و $uid في Firebase");
        return false;
    }
    try {
        q('INSERT INTO users (id, email) VALUES (?, ?)', [$uid, $email]);
    } catch (PDOException $e) {
        // المعرّف موجود ببريد ثاني — تعارض، مو نجاح صامت
        if ($e->getCode() === '23000') { error_log("api: تعارض — المعرّف $uid موجود ببريد آخر"); return false; }
        throw $e;
    }
    return true;
}

/** مستند users/{uid} من Firestore (مصدر الملف الشخصي في المرحلة 1) — null لو ما وُجد */
function bridge_profile(string $uid): ?array {
    if (!bridge_enabled()) {
        $row = q_one('SELECT data FROM users WHERE id = ?', [$uid]);
        return $row !== null && $row['data'] !== null ? (json_decode((string) $row['data'], true) ?: null) : null;
    }
    $doc = fs_get((string) app_config()['firebase_project_id'], bridge_admin_token(), 'users/' . rawurlencode($uid));
    if ($doc !== null) unset($doc['__updateTime']);
    return $doc;
}

/** ينسخ الحقول الحساسة من مستند Firestore لجدول users — يُستدعى مع كل دخول */
function bridge_sync_profile(string $uid, ?array $profile): array {
    $fields = [
        'name' => is_string($profile['name'] ?? null) ? usubstr($profile['name'], 255) : '',
        'role' => is_string($profile['role'] ?? null) && $profile['role'] !== '' ? substr($profile['role'], 0, 32) : 'PENDING',
        'lawyer_id' => is_string($profile['lawyerId'] ?? null) && $profile['lawyerId'] !== '' ? substr($profile['lawyerId'], 0, 64) : null,
        'status' => is_string($profile['status'] ?? null) && $profile['status'] !== '' ? substr($profile['status'], 0, 32) : 'ACTIVE',
        'deleted_at' => !empty($profile['deletedAt']) ? utc_now() : null,
    ];
    // data: نسخة من المستند (حقول الاشتراك يحتاجها office_writable). ما نكتب فوق
    // deleted_at الأصلي لو كان موجود — نحفظ أول وقت عرفناه
    $data = $profile === null ? null : json_encode($profile, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    q('UPDATE users SET name = ?, role = ?, lawyer_id = ?, status = ?, data = ?, profile_synced_at = ?,
              deleted_at = IF(? IS NULL, NULL, COALESCE(deleted_at, ?))
        WHERE id = ?',
        [$fields['name'], $fields['role'], $fields['lawyer_id'], $fields['status'], $data, utc_now(),
         $fields['deleted_at'], $fields['deleted_at'], $uid]);
    return $fields;
}

/** كل كم ثانية نعيد نسخ الدور/الحالة/الاشتراك من Firestore أثناء الجلسة */
const PROFILE_FRESH_SECONDS = 60;

/**
 * يحدّث صف المستخدم (ومالك مكتبه) من Firestore لو آخر نسخ أقدم من دقيقة.
 * بدونه: مالك يغيّر دور عضو، أو المنصة توقف مكتب، والجلسات المفتوحة تظل بالصلاحيات
 * القديمة لين تنتهي (القواعد القديمة كانت تقرأ users/* مع كل طلب).
 */
function bridge_refresh_if_stale(string $uid): void {
    $row = q_one('SELECT lawyer_id, profile_synced_at FROM users WHERE id = ?', [$uid]);
    if ($row === null) return;
    $stale = fn(?string $at) => $at === null || strtotime($at . ' UTC') < time() - PROFILE_FRESH_SECONDS;
    if ($stale($row['profile_synced_at'])) {
        $fields = bridge_sync_profile($uid, bridge_profile($uid));
        $row['lawyer_id'] = $fields['lawyer_id'];
    }
    $tenant = $row['lawyer_id'];
    if (!is_string($tenant) || $tenant === '' || $tenant === 'ALL' || $tenant === $uid) return;
    $owner = q_one('SELECT profile_synced_at FROM users WHERE id = ?', [$tenant]);
    if ($owner !== null && !$stale($owner['profile_synced_at'])) return;
    $profile = bridge_profile($tenant);
    if ($profile === null) return; // مكتب بلا ملف = غير نشط (account_active يرفض)
    if ($owner === null) {
        // مالك ما دخل النظام الجديد بعد — نضيف صفه عشان فريقه يشتغل
        $email = is_string($profile['email'] ?? null) ? strtolower(trim($profile['email'])) : '';
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) return;
        if (!bridge_import_account($tenant, $email)) return;
    }
    bridge_sync_profile($tenant, $profile);
}
