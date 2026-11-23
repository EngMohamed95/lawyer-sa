<?php
/**
 * الملف الشخصي للمستخدمين (docs: users/{id}) ونسخته في جدول users (الدور، المكتب، الحالة).
 *
 * بعد إزالة Firebase: الملف الشخصي في MySQL وحده. جدول users يحمل بيانات الدخول + نسخة من
 * الحقول الحساسة تتحدث مع كل كتابة على الملف (store_rules.php) — access.php يعتمد عليها.
 *
 * بقي اتصال واحد بـ Firebase (على السيرفر فقط، اختياري): التحقق من كلمة مرور قديمة لمستخدم ما
 * دخل النظام الجديد بعد (password_hash = NULL). يُطفأ بـ 'firebase_password_fallback' => false
 * في db-config.php — وقتها هالمستخدمين يستخدمون «نسيت كلمة المرور».
 */

declare(strict_types=1);

require_once __DIR__ . '/core.php';

/** ملف المستخدم users/{uid} من MySQL — null لو ما وُجد */
function bridge_profile(string $uid): ?array {
    $row = q_one("SELECT data FROM docs WHERE collection = 'users' AND parent_path = '' AND id = ?", [$uid]);
    return $row === null ? null : (json_decode((string) $row['data'], true) ?: []);
}

/** ينسخ الحقول الحساسة من الملف لجدول users — بعد كل كتابة على الملف، ومع كل دخول */
function bridge_sync_profile(string $uid, ?array $profile): array {
    $fields = [
        'name' => is_string($profile['name'] ?? null) ? usubstr($profile['name'], 255) : '',
        'role' => is_string($profile['role'] ?? null) && $profile['role'] !== '' ? substr($profile['role'], 0, 32) : 'PENDING',
        'lawyer_id' => is_string($profile['lawyerId'] ?? null) && $profile['lawyerId'] !== '' ? substr($profile['lawyerId'], 0, 64) : null,
        'status' => is_string($profile['status'] ?? null) && $profile['status'] !== '' ? substr($profile['status'], 0, 32) : 'ACTIVE',
        'deleted_at' => !empty($profile['deletedAt']) ? utc_now() : null,
    ];
    // data: نسخة من الملف (حقول الاشتراك يحتاجها office_writable). ما نكتب فوق
    // deleted_at الأصلي لو كان موجود — نحفظ أول وقت عرفناه
    $data = $profile === null ? null : json_encode($profile, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    q('UPDATE users SET name = ?, role = ?, lawyer_id = ?, status = ?, data = ?, profile_synced_at = ?,
              deleted_at = IF(? IS NULL, NULL, COALESCE(deleted_at, ?))
        WHERE id = ?',
        [$fields['name'], $fields['role'], $fields['lawyer_id'], $fields['status'], $data, utc_now(),
         $fields['deleted_at'], $fields['deleted_at'], $uid]);
    return $fields;
}

/**
 * احتياط: لو جدول users طلع عن الملف (تعديل يدوي في القاعدة مثلاً) نعيد النسخ كل دقيقة.
 * الكتابة العادية على الملف تحدّث الجدول فوراً (store_rules.php: rule_user)، فهذا نادر.
 */
const PROFILE_FRESH_SECONDS = 60;

function bridge_refresh_if_stale(string $uid): void {
    $row = q_one('SELECT profile_synced_at FROM users WHERE id = ?', [$uid]);
    if ($row === null) return;
    if ($row['profile_synced_at'] !== null && strtotime($row['profile_synced_at'] . ' UTC') >= time() - PROFILE_FRESH_SECONDS) return;
    $profile = bridge_profile($uid);
    // ما نمسح الدور لحساب نُقل بدون ملف (يظل PENDING) — بس نحدّث لو الملف موجود
    if ($profile !== null) bridge_sync_profile($uid, $profile);
    else q('UPDATE users SET profile_synced_at = ? WHERE id = ?', [utc_now(), $uid]);
}

/**
 * يتحقق من كلمة مرور قديمة عند Firebase Auth (REST، على السيرفر فقط) — لمستخدم ما دخل النظام
 * الجديد بعد. يرجع uid عند النجاح، أو null. مطفأ = null دائماً (المستخدم يستعيد كلمة المرور).
 */
function bridge_firebase_password_uid(string $email, string $password): ?string {
    if (!bridge_enabled()) {
        // وضع الاختبار: حسابات Firebase وهمية من الإعداد [email => [uid, password]]
        $fake = app_config()['test_firebase_accounts'][$email] ?? null;
        return is_array($fake) && hash_equals((string) $fake[1], $password) ? (string) $fake[0] : null;
    }
    if (!(app_config()['firebase_password_fallback'] ?? true)) return null;
    $key = (string) app_config()['firebase_web_api_key'];
    [$status, $body] = http_request('POST',
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' . rawurlencode($key),
        ['Content-Type: application/json'],
        json_encode(['email' => $email, 'password' => $password, 'returnSecureToken' => false]));
    $data = json_decode($body, true);
    if ($status === 200 && is_array($data) && !empty($data['localId'])) return (string) $data['localId'];
    $code = is_array($data) ? (string) ($data['error']['message'] ?? '') : '';
    if ($status === 400 && preg_match('/^(INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED)/', $code)) return null;
    if ($status === 400 && str_starts_with($code, 'TOO_MANY_ATTEMPTS')) {
        fail(429, 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.', 'RATE_LIMITED');
    }
    // Firebase مو متاح: ما نوقف الدخول بخطأ تقني — نرجع «بيانات غلط» ويقدر يستعيد كلمة المرور
    error_log("api: تعذّر التحقق القديم عند Firebase ($status): " . substr($body, 0, 300));
    return null;
}
