<?php
/**
 * /api/v1/signup/* — التسجيل الذاتي للمكاتب الجديدة (بديل public/signup.php على Firebase).
 *
 *   start  {email, password, profile} : يحفظ الطلب (كلمة المرور bcrypt) ويرسل رمز 6 أرقام للبريد
 *   resend {email}                    : يعيد الإرسال
 *   verify {email, code}              : يطابق الرمز، ينشئ حساب مالك المكتب (باقة تجريبية) ويدخله
 *
 * الحساب يُنشأ هنا (مو في الواجهة) لأنه يحمل الدور والباقة وتاريخ الانتهاء — لو أنشأته
 * الواجهة لاستطاع أي أحد تخطّي الرمز أو منح نفسه باقة أعلى.
 */

declare(strict_types=1);

require_once __DIR__ . '/store.php';
require_once __DIR__ . '/routes_auth.php';
require_once dirname(__DIR__, 2) . '/_mailer.php';

const OTP_TTL_SECONDS = 600;          // صلاحية الرمز: 10 دقائق
const OTP_MAX_ATTEMPTS = 5;           // محاولات خاطئة قبل إلغاء الرمز
const RESEND_COOLDOWN_SECONDS = 60;   // بين كل إرسالين
const MAX_SENDS_PER_HOUR = 5;         // لكل بريد
const MAX_SENDS_PER_IP_HOUR = 15;     // لكل عنوان IP
const MAX_VERIFY_PER_IP_HOUR = 60;    // محاولات التأكيد لكل عنوان IP
const DEFAULT_TRIAL_DAYS = 14;
const DEFAULT_TRIAL_TIER = 'PREMIUM';
const TRIAL_AI_QUOTA = 10;

/* ───────────────────────────── أدوات ───────────────────────────── */

/** مفتاح سري للرموز يُولَّد مرة ويُحفظ في app_cache — الرمز ما ينحفظ إلا HMAC */
function otp_secret(): string {
    $row = q_one("SELECT v FROM app_cache WHERE k = 'otp_secret'");
    if ($row !== null) return (string) $row['v'];
    q("INSERT IGNORE INTO app_cache (k, v, expires_at) VALUES ('otp_secret', ?, '2999-01-01 00:00:00')", [bin2hex(random_bytes(32))]);
    return (string) q_one("SELECT v FROM app_cache WHERE k = 'otp_secret'")['v'];
}

function otp_hash(string $email, string $code): string {
    return hash_hmac('sha256', "$email|$code", otp_secret());
}

/** حد لكل IP في الساعة — يُسجَّل في login_attempts بمفتاح خاص (ينظف نفسه مع جدول المحاولات) */
function signup_ip_limit(string $bucket, int $max): void {
    $key = "signup-$bucket";
    $n = (int) q('SELECT COUNT(*) FROM login_attempts WHERE email = ? AND ip = ? AND created_at > ?', [$key, client_ip(), utc_now(-3600)])->fetchColumn();
    if ($n >= $max) fail(429, 'طلبات كثيرة من هذا الجهاز. حاول بعد ساعة.', 'RATE_LIMIT', ['retryAfter' => 3600]);
    q('INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 0)', [$key, client_ip()]);
}

function signup_clean_text($v, int $min, int $max, string $label): string {
    $s = trim((string) preg_replace('/\s+/u', ' ', is_string($v) ? $v : ''));
    if (ulen($s) < $min || ulen($s) > $max) fail(400, "$label غير صالح.", 'INVALID_INPUT');
    return $s;
}

function signup_clean_count($v, string $label): int {
    if (!is_numeric($v) || (int) $v != $v || (int) $v < 0 || (int) $v > 1000) fail(400, "عدد $label غير صالح.", 'INVALID_INPUT');
    return (int) $v;
}

function signup_clean_profile($p): array {
    if (!is_array($p)) fail(400, 'بيانات المكتب ناقصة.', 'INVALID_INPUT');
    $phone = is_string($p['phone'] ?? null) ? $p['phone'] : '';
    // أرقام عربية/فارسية ← لاتينية، ثم حذف كل ما عدا الأرقام و+ (وعلامات الاتجاه المخفية)
    $phone = strtr($phone, ['٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9']);
    $phone = (string) preg_replace('/[^0-9+]/', '', $phone);
    if (!preg_match('/^\+?[0-9]{8,15}$/', $phone)) fail(400, 'رقم الجوال غير صالح.', 'INVALID_INPUT');
    $team = is_array($p['team'] ?? null) ? $p['team'] : [];
    return [
        'name' => signup_clean_text($p['name'] ?? '', 2, 100, 'الاسم'),
        'officeName' => signup_clean_text($p['officeName'] ?? '', 2, 150, 'اسم المكتب'),
        'phone' => $phone,
        'country' => in_array($p['country'] ?? '', ['SA', 'EG', 'OTHER'], true) ? $p['country'] : 'OTHER',
        'team' => [
            'lawyers' => signup_clean_count($team['lawyers'] ?? 0, 'المحامين'),
            'consultants' => signup_clean_count($team['consultants'] ?? 0, 'المستشارين'),
            'trainees' => signup_clean_count($team['trainees'] ?? 0, 'المتدربين'),
            'staff' => signup_clean_count($team['staff'] ?? 0, 'الموظفين'),
        ],
    ];
}

function otp_email_html(string $name, string $code): string {
    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $minutes = (int) (OTP_TTL_SECONDS / 60);
    return <<<HTML
<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f3f4f6;font-family:Tahoma,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#192a56;color:#ffffff;padding:24px;text-align:center;font-size:22px;font-weight:bold;">موازين</td></tr>
        <tr><td style="padding:28px 28px 8px;color:#192a56;font-size:16px;line-height:1.8;text-align:right;">
          مرحباً {$safeName}،<br>
          استخدم الرمز التالي لتأكيد بريدك الإلكتروني وتفعيل فترتك التجريبية:
        </td></tr>
        <tr><td style="padding:16px 28px;text-align:center;">
          <div style="display:inline-block;background:#f3f4f6;border-radius:12px;padding:14px 28px;font-size:34px;letter-spacing:10px;font-weight:bold;color:#192a56;direction:ltr;">{$code}</div>
        </td></tr>
        <tr><td style="padding:8px 28px 28px;color:#6b7280;font-size:13px;line-height:1.8;text-align:right;">
          الرمز صالح لمدة {$minutes} دقائق. إن لم تطلب إنشاء حساب في موازين فتجاهل هذه الرسالة.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
HTML;
}

/**
 * البريد متاح للتسجيل؟ حساب مفعّل ← سجّل الدخول. حساب سابق (مكتب محذوف، عضو فريق سابق،
 * أو له بيانات بمعرّفه) ← ما نعيد استخدامه بتجربة جديدة. يرجع المعرّف القديم لو حساب بلا ملف.
 */
function signup_check_email(string $email): ?string {
    $row = q_one('SELECT id, status, deleted_at FROM users WHERE email = ?', [$email]);
    if ($row === null) return null;
    $id = (string) $row['id'];
    if (bridge_profile($id) !== null) fail(409, 'هذا البريد لديه حساب مفعّل بالفعل. سجّل الدخول.', 'ALREADY_ACTIVE');
    $previous = $row['status'] === 'DISABLED' || $row['deleted_at'] !== null
        || q_one("SELECT 1 FROM docs WHERE parent_path = '' AND (lawyer_id = ? OR (collection = 'office_settings' AND id = ?)) LIMIT 1", [$id, $id]) !== null
        || q_one("SELECT 1 FROM docs WHERE collection = 'auditLogs' AND parent_path = '' AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.actorId')) = ? LIMIT 1", [$id]) !== null;
    if ($previous) fail(409, 'هذا البريد مرتبط بحساب سابق. تواصل مع الدعم الفني لإعادة تفعيله.', 'PREVIOUS_ACCOUNT');
    return $id; // تسجيل قديم ما اكتمل (حساب بلا ملف) — نكمله بنفس المعرّف
}

function signup_send(string $email, string $name, ?array $pending, callable $save): void {
    $now = time();
    if ($pending !== null) {
        $last = strtotime($pending['last_sent_at'] . ' UTC');
        if ($now - $last < RESEND_COOLDOWN_SECONDS) {
            $wait = RESEND_COOLDOWN_SECONDS - ($now - $last);
            fail(429, "انتظر $wait ثانية قبل طلب رمز جديد.", 'COOLDOWN', ['retryAfter' => $wait]);
        }
    }
    $windowStart = $pending !== null ? strtotime($pending['window_start'] . ' UTC') : $now;
    $sent = $pending !== null ? (int) $pending['sent_count'] : 0;
    if ($now - $windowStart >= 3600) { $windowStart = $now; $sent = 0; }
    if ($sent >= MAX_SENDS_PER_HOUR) fail(429, 'تجاوزت عدد مرات إرسال الرمز. حاول بعد ساعة.', 'RATE_LIMIT', ['retryAfter' => 3600 - ($now - $windowStart)]);
    signup_ip_limit('send', MAX_SENDS_PER_IP_HOUR);

    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $save(otp_hash($email, $code), gmdate('Y-m-d H:i:s', $now + OTP_TTL_SECONDS), gmdate('Y-m-d H:i:s', $windowStart), $sent + 1);
    if (!bridge_enabled()) {
        // وضع الاختبار (خادم التطوير المدمج فقط): الرمز يُحفظ بدل إرساله بالبريد
        q('REPLACE INTO app_cache (k, v, expires_at) VALUES (?, ?, ?)', ["test_otp:$email", $code, utc_now(600)]);
    } elseif (!send_mawazeen_email($email, $name, "رمز التأكيد: $code — موازين", otp_email_html($name, $code))) {
        fail(502, 'تعذّر إرسال البريد. تأكد من العنوان ثم أعد المحاولة.', 'MAIL_FAILED');
    }
    respond(200, ['ok' => true, 'email' => $email, 'resendIn' => RESEND_COOLDOWN_SECONDS, 'expiresIn' => OTP_TTL_SECONDS]);
}

/* ───────────────────────────── المسارات ───────────────────────────── */

function route_signup_start(): void {
    $email = normalize_email(body_str('email', 191));
    $password = body_password();
    assert_new_password($password);
    $profile = signup_clean_profile(json_body()['profile'] ?? null);
    signup_check_email($email);
    if (random_int(1, 20) === 1) q('DELETE FROM signup_pending WHERE created_at < ?', [utc_now(-86400)]);

    $pending = q_one('SELECT * FROM signup_pending WHERE email = ?', [$email]);
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $profileJson = json_encode($profile, JSON_UNESCAPED_UNICODE);
    // البيانات وكلمة المرور تتغير بس مع رمز جديد (الرمز القديم يبطل) — ما أحد يبدّلها على رمز
    // وصل لصاحب البريد. وverify يطلب نفس كلمة المرور، فاللي ما يعرفها ما يفعّل الحساب.
    signup_send($email, $profile['name'], $pending, function (string $codeHash, string $expires, string $window, int $sent) use ($email, $hash, $profileJson) {
        q('INSERT INTO signup_pending (email, password_hash, profile, code_hash, expires_at, attempts, last_sent_at, sent_count, window_start)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
           ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), profile = VALUES(profile), code_hash = VALUES(code_hash),
             expires_at = VALUES(expires_at), attempts = 0, last_sent_at = VALUES(last_sent_at), sent_count = VALUES(sent_count), window_start = VALUES(window_start)',
            [$email, $hash, $profileJson, $codeHash, $expires, utc_now(), $sent, $window]);
    });
}

function route_signup_resend(): void {
    $email = normalize_email(body_str('email', 191));
    $pending = q_one('SELECT * FROM signup_pending WHERE email = ?', [$email]);
    if ($pending === null) fail(404, 'بيانات التسجيل غير موجودة. أكمل البيانات من جديد.', 'NO_PENDING');
    $name = (string) (json_decode((string) $pending['profile'], true)['name'] ?? '');
    signup_send($email, $name, $pending, function (string $codeHash, string $expires, string $window, int $sent) use ($email) {
        q('UPDATE signup_pending SET code_hash = ?, expires_at = ?, attempts = 0, last_sent_at = ?, sent_count = ?, window_start = ? WHERE email = ?',
            [$codeHash, $expires, utc_now(), $sent, $window, $email]);
    });
}

function route_signup_verify(): void {
    $email = normalize_email(body_str('email', 191));
    $code = (string) preg_replace('/\D/', '', (string) (json_body()['code'] ?? ''));
    if (strlen($code) !== 6) fail(400, 'أدخل الرمز المكوّن من 6 أرقام.', 'INVALID_INPUT');
    signup_ip_limit('verify', MAX_VERIFY_PER_IP_HOUR);

    $pending = q_one('SELECT * FROM signup_pending WHERE email = ?', [$email]);
    if ($pending === null) fail(404, 'لا يوجد رمز نشط. اطلب رمزاً جديداً.', 'NO_PENDING');
    if (strtotime($pending['expires_at'] . ' UTC') < time()) fail(400, 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.', 'CODE_EXPIRED');
    // نحجز المحاولة قبل المقارنة (UPDATE مشروط) — الطلبات المتوازية ما تتجاوز الحد
    $reserved = q('UPDATE signup_pending SET attempts = attempts + 1 WHERE email = ? AND attempts < ?', [$email, OTP_MAX_ATTEMPTS])->rowCount();
    if ($reserved === 0) fail(400, 'تجاوزت عدد المحاولات. اطلب رمزاً جديداً.', 'TOO_MANY_ATTEMPTS');
    if (!hash_equals((string) $pending['code_hash'], otp_hash($email, $code))) {
        $left = OTP_MAX_ATTEMPTS - ((int) $pending['attempts'] + 1);
        $msg = $left > 0 ? "الرمز غير صحيح. متبقٍ $left " . ($left === 1 ? 'محاولة' : 'محاولات') . '.' : 'تجاوزت عدد المحاولات. اطلب رمزاً جديداً.';
        fail(400, $msg, $left > 0 ? 'INVALID_CODE' : 'TOO_MANY_ATTEMPTS', ['attemptsLeft' => max(0, $left)]);
    }
    // نفس كلمة المرور اللي انطلب بها الرمز — لو أحد ثاني طلب رمزاً جديداً لبريدك بكلمة مروره،
    // رمزك الجديد ما يفعّل حساباً بكلمة مرور غيرك
    if (!password_verify(body_password(), (string) $pending['password_hash'])) {
        fail(400, 'كلمة المرور لا تطابق المُدخلة عند طلب الرمز. ارجع وأدخل بياناتك من جديد.', 'PASSWORD_MISMATCH');
    }

    $existingId = signup_check_email($email); // تأكد ثاني: ما أحد فعّل البريد بين الطلبين
    $profile = json_decode((string) $pending['profile'], true) ?: [];

    // مدة التجربة ومستواها من «الباقة التجريبية» إن ضبطها مدير المنصة، وإلا 14 يوماً
    $trialRow = q_one("SELECT data FROM docs WHERE collection = 'subscriptionPlans' AND parent_path = '' AND id = 'trial'");
    $trial = $trialRow !== null ? (json_decode((string) $trialRow['data'], true) ?: []) : null;
    $days = DEFAULT_TRIAL_DAYS;
    $tier = DEFAULT_TRIAL_TIER;
    if ($trial && ($trial['active'] ?? true) !== false && ($trial['billing'] ?? '') === 'trial') {
        $d = (int) ($trial['durationDays'] ?? 0);
        if ($d > 0 && $d <= 90) $days = $d;
        if (in_array($trial['tier'] ?? '', ['BASIC', 'PROFESSIONAL', 'PREMIUM'], true)) $tier = $trial['tier'];
    }

    $now = time();
    $iso = fn(int $ts) => gmdate('Y-m-d\TH:i:s', $ts) . '.000Z';
    $id = $existingId ?? new_id();
    $team = is_array($profile['team'] ?? null) ? $profile['team'] : [];
    $user = [
        'name' => (string) ($profile['name'] ?? ''), 'email' => $email, 'phone' => (string) ($profile['phone'] ?? ''),
        'officeName' => (string) ($profile['officeName'] ?? ''), 'country' => (string) ($profile['country'] ?? 'OTHER'),
        'teamSize' => array_map('intval', array_intersect_key($team + ['lawyers' => 0, 'consultants' => 0, 'trainees' => 0, 'staff' => 0], array_flip(['lawyers', 'consultants', 'trainees', 'staff']))),
        'role' => 'LAWYER', 'status' => 'ACTIVE', 'plan' => $tier, 'planId' => 'trial',
        'subscriptionBilling' => 'trial', 'subscriptionStart' => $iso($now), 'subscriptionExpiry' => $iso($now + $days * 86400),
        // نهاية التجربة — office_writable يقفل الكتابة بعدها
        'trialEndsAt' => $iso($now + $days * 86400),
        'selfSignup' => true, 'onboardingCompleted' => false, 'emailVerifiedAt' => $iso($now), 'createdAt' => $iso($now),
    ];
    $office = [
        'lawyerId' => $id,
        'officeProfile' => ['name' => $user['officeName'], 'nameEn' => '', 'address' => '', 'phone' => $user['phone'], 'phone2' => '',
            'email' => $email, 'crNumber' => '', 'licenseNumber' => '', 'logoUrl' => null],
        'updatedAt' => $iso($now), 'updatedBy' => $id,
    ];

    $pdo = db();
    $pdo->beginTransaction();
    register_shutdown_function(function () use ($pdo): void { if ($pdo->inTransaction()) $pdo->rollBack(); });
    if ($existingId === null) {
        q('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [$id, $email, $pending['password_hash']]);
    } else {
        q('UPDATE users SET password_hash = ? WHERE id = ?', [$pending['password_hash'], $id]);
        // حساب قديم بلا ملف: أي جلسة أو رابط استعادة سابق له ما يورث المكتب الجديد
        q('DELETE FROM auth_sessions WHERE user_id = ?', [$id]);
        q('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [utc_now(), $id]);
    }
    $put = fn(string $coll, string $docId, array $data) => q('INSERT INTO docs (collection, parent_path, id, data) VALUES (?, \'\', ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
        [$coll, $docId, json_encode($data, JSON_UNESCAPED_UNICODE)]);
    $put('users', $id, $user);
    $put('office_settings', $id, $office);
    if ($trial === null) {
        // بلا مستند الباقة تُقرأ حصص المكتب «غير محدودة» — نزرع الباقة التجريبية الافتراضية
        q("INSERT IGNORE INTO docs (collection, parent_path, id, data) VALUES ('subscriptionPlans', '', 'trial', ?)", [json_encode([
            'name' => 'الباقة التجريبية', 'nameEn' => 'Free Trial', 'tier' => DEFAULT_TRIAL_TIER, 'billing' => 'trial',
            'durationDays' => DEFAULT_TRIAL_DAYS, 'quotas' => ['cases' => 20, 'clients' => 20, 'team' => 2, 'ai' => TRIAL_AI_QUOTA],
            'prices' => ['SAR' => 0, 'EGP' => 0, 'USD' => 0], 'active' => true, 'order' => 0, 'createdAt' => $iso($now), 'updatedAt' => $iso($now),
        ], JSON_UNESCAPED_UNICODE)]);
    }
    q('DELETE FROM signup_pending WHERE email = ?', [$email]);
    bridge_sync_profile($id, $user);
    q('UPDATE users SET last_login_at = ? WHERE id = ?', [utc_now(), $id]);
    $pdo->commit();

    session_create($id, true);
    respond(200, ['ok' => true, 'user' => public_user(load_user($id)), 'trialDays' => $days, 'subscriptionExpiry' => $user['subscriptionExpiry']]);
}
