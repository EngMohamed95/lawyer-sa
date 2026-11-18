<?php
/**
 * التسجيل الذاتي للمكاتب الجديدة — تأكيد البريد برمز OTP ثم إنشاء حساب المكتب بفترة تجريبية.
 *
 * التسلسل:
 *   1. الواجهة تنشئ مستخدم Firebase Auth (البريد + كلمة المرور) ثم ترسل توكنه هنا.
 *   2. action=start  : يحفظ بيانات المكتب ويرسل رمزاً من 6 أرقام إلى البريد (mail()).
 *      action=resend : يعيد الإرسال ببيانات المكتب المحفوظة.
 *   3. action=verify : يطابق الرمز، ثم بحساب الخدمة:
 *        - يعلّم البريد «مؤكَّداً» في Firebase Auth
 *        - ينشئ users/{uid} (مالك مكتب LAWYER) بالباقة التجريبية + office_settings/{uid}
 *
 * لماذا على الخادم؟ مستند المستخدم يحمل الدور والباقة وتاريخ الانتهاء. لو أنشأته الواجهة
 * لاستطاع أي أحد تخطّي الرمز أو منح نفسه باقة أعلى. هنا يُكتب بحساب الخدمة، وقواعد
 * Firestore لا تسمح للعميل بإنشاء مالك مكتب ولا بقراءة signup_otps إطلاقاً.
 *
 * المتطلبات على الاستضافة: serviceAccountKey.json بجوار هذا الملف (يكتبه النشر من سرّ
 * FIREBASE_SERVICE_ACCOUNT_KEY، و.htaccess يمنع تقديمه للمتصفح)، و mail() مفعّلة.
 *
 * محلياً: php -S 127.0.0.1:8090 -t public  — وخادم التطوير يمرّر /signup.php إليه.
 * ضع serviceAccountKey.json في جذر المشروع (لا في public/ — Vite يقدّم public/ للمتصفح).
 * إن فشل mail() على الخادم المدمج يُكتب الرمز في سجل الطرفية بدل إرساله.
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const OTP_TTL_SECONDS = 600;          // صلاحية الرمز: 10 دقائق
const OTP_MAX_ATTEMPTS = 5;           // محاولات خاطئة قبل إلغاء الرمز
const RESEND_COOLDOWN_SECONDS = 60;   // بين كل إرسالين
const MAX_SENDS_PER_HOUR = 5;         // لكل حساب
const MAX_SENDS_PER_IP_HOUR = 15;     // لكل عنوان IP
const MAX_VERIFY_PER_IP_HOUR = 60;    // محاولات التأكيد لكل عنوان IP
/** نطاق المرسل ثابت — لا نأخذه من ترويسة Host التي يتحكم بها الطالب */
const DEFAULT_MAIL_DOMAIN = 'lawyr-sa.smartcodix.com';
const DEFAULT_TRIAL_DAYS = 14;
const DEFAULT_TRIAL_TIER = 'PROFESSIONAL';
const MAX_BODY_BYTES = 20000;
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

/* ────────────────────────── أدوات عامة ────────────────────────── */

function respond(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/** $code يميّز الحالة للواجهة — الرسالة للعرض كما هي */
function fail(int $status, string $message, string $code = 'ERROR', array $extra = []): void {
    respond($status, ['error' => $message, 'code' => $code] + $extra);
}

function b64url_decode(string $s): string {
    $decoded = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    return $decoded === false ? '' : $decoded;
}

function b64url_encode(string $s): string {
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

/** طول النص بالحروف لا بالبايتات — لا نعتمد على mbstring */
function ulen(string $s): int {
    $n = preg_match_all('/./us', $s);
    return $n === false ? strlen($s) : $n;
}

/** طلب HTTP يرجع [الحالة, الجسم] */
function http_request(string $method, string $url, array $headers = [], ?string $body = null): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $resp = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [$resp === false ? 0 : $status, $resp === false ? '' : (string) $resp];
    }
    $ctx = stream_context_create(['http' => [
        'method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body ?? '',
        'timeout' => 25, 'ignore_errors' => true,
    ]]);
    $resp = @file_get_contents($url, false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) $status = (int) $m[1];
    }
    return [$status, $resp === false ? '' : $resp];
}

/* ────────────────────────── توكن المستخدم ────────────────────────── */

function google_certs(): array {
    $cacheFile = sys_get_temp_dir() . '/lawyer_sa_firebase_certs.json';
    if (is_file($cacheFile)) {
        $cached = json_decode((string) @file_get_contents($cacheFile), true);
        if (is_array($cached) && ($cached['expires'] ?? 0) > time() && is_array($cached['certs'] ?? null)) {
            return $cached['certs'];
        }
    }
    [$status, $body] = http_request('GET', CERTS_URL);
    $certs = json_decode($body, true);
    if ($status !== 200 || !is_array($certs) || !$certs) fail(503, 'تعذّر التحقق من الجلسة حالياً. أعد المحاولة بعد قليل.', 'UNAVAILABLE');
    @file_put_contents($cacheFile, json_encode(['expires' => time() + 3600, 'certs' => $certs]), LOCK_EX);
    return $certs;
}

/** يتحقق من توكن Firebase ويرجع محتواه (sub · email ...) */
function verify_firebase_token(string $token, string $projectId): array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) fail(401, 'انتهت الجلسة. ابدأ التسجيل من جديد.', 'UNAUTHENTICATED');
    [$h64, $p64, $s64] = $parts;
    $header = json_decode(b64url_decode($h64), true);
    $payload = json_decode(b64url_decode($p64), true);
    if (!is_array($header) || !is_array($payload) || ($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) {
        fail(401, 'انتهت الجلسة. ابدأ التسجيل من جديد.', 'UNAUTHENTICATED');
    }
    $cert = google_certs()[$header['kid']] ?? null;
    if (!$cert || openssl_verify("$h64.$p64", b64url_decode($s64), $cert, OPENSSL_ALGO_SHA256) !== 1) {
        fail(401, 'انتهت الجلسة. ابدأ التسجيل من جديد.', 'UNAUTHENTICATED');
    }
    $now = time();
    $skew = 300;
    $valid = ($payload['aud'] ?? '') === $projectId
        && ($payload['iss'] ?? '') === "https://securetoken.google.com/$projectId"
        && is_string($payload['sub'] ?? null) && $payload['sub'] !== '' && strlen($payload['sub']) <= 128
        && (int) ($payload['exp'] ?? 0) > $now - 30
        && (int) ($payload['iat'] ?? PHP_INT_MAX) <= $now + $skew;
    if (!$valid) fail(401, 'انتهت الجلسة. ابدأ التسجيل من جديد.', 'UNAUTHENTICATED');
    return $payload;
}

/* ────────────────────────── حساب الخدمة ────────────────────────── */

function service_account(): array {
    // الاستضافة: بجوار الملف (محمي بـ .htaccess). التطوير: جذر المشروع خارج public/
    $file = '';
    foreach ([__DIR__ . '/serviceAccountKey.json', dirname(__DIR__) . '/serviceAccountKey.json'] as $candidate) {
        if (is_file($candidate)) { $file = $candidate; break; }
    }
    $sa = $file !== '' ? json_decode((string) file_get_contents($file), true) : null;
    if (!is_array($sa) || empty($sa['client_email']) || empty($sa['private_key']) || empty($sa['private_key_id'])) {
        error_log('signup.php: serviceAccountKey.json مفقود أو غير صالح');
        fail(503, 'التسجيل غير متاح حالياً. تواصل مع الدعم الفني.', 'NOT_CONFIGURED');
    }
    return $sa;
}

/** توكن وصول OAuth بحساب الخدمة (JWT موقّع RS256) — لا يُخزَّن على القرص */
function admin_access_token(array $sa): string {
    $now = time();
    $header = b64url_encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT', 'kid' => $sa['private_key_id']]));
    $claims = b64url_encode(json_encode([
        'iss' => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600,
    ]));
    $signature = '';
    if (!openssl_sign("$header.$claims", $signature, $sa['private_key'], OPENSSL_ALGO_SHA256)) {
        error_log('signup.php: تعذّر توقيع JWT بمفتاح حساب الخدمة');
        fail(503, 'التسجيل غير متاح حالياً. تواصل مع الدعم الفني.', 'NOT_CONFIGURED');
    }
    $assertion = "$header.$claims." . b64url_encode($signature);
    [$status, $body] = http_request('POST', 'https://oauth2.googleapis.com/token',
        ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $assertion]));
    $data = json_decode($body, true);
    if ($status !== 200 || empty($data['access_token'])) {
        error_log("signup.php: فشل الحصول على توكن حساب الخدمة ($status): " . substr($body, 0, 300));
        fail(503, 'تعذّر الاتصال بالخادم. أعد المحاولة بعد قليل.', 'UNAVAILABLE');
    }
    return $data['access_token'];
}

/* ────────────────────────── Firestore عبر REST ────────────────────────── */

function fs_doc_name(string $projectId, string $path): string {
    return "projects/$projectId/databases/(default)/documents/$path";
}

function fs_encode($v): array {
    if ($v === null) return ['nullValue' => null];
    if (is_bool($v)) return ['booleanValue' => $v];
    if (is_int($v)) return ['integerValue' => (string) $v];
    if (is_float($v)) return ['doubleValue' => $v];
    if (is_string($v)) return ['stringValue' => $v];
    if (is_array($v)) {
        if (count($v) === 1 && isset($v['__timestamp'])) return ['timestampValue' => (string) $v['__timestamp']];
        if ($v !== [] && array_keys($v) === range(0, count($v) - 1)) {
            return ['arrayValue' => ['values' => array_map('fs_encode', $v)]];
        }
        return ['mapValue' => ['fields' => fs_fields($v)]];
    }
    return ['stringValue' => (string) $v];
}

function fs_fields(array $data) {
    if (!$data) return new stdClass();
    $out = [];
    foreach ($data as $k => $v) $out[$k] = fs_encode($v);
    return $out;
}

function fs_decode($v) {
    if (!is_array($v)) return null;
    if (array_key_exists('stringValue', $v)) return $v['stringValue'];
    if (array_key_exists('integerValue', $v)) return (int) $v['integerValue'];
    if (array_key_exists('doubleValue', $v)) return (float) $v['doubleValue'];
    if (array_key_exists('booleanValue', $v)) return (bool) $v['booleanValue'];
    if (array_key_exists('timestampValue', $v)) return $v['timestampValue'];
    if (isset($v['mapValue'])) {
        $out = [];
        foreach ($v['mapValue']['fields'] ?? [] as $k => $f) $out[$k] = fs_decode($f);
        return $out;
    }
    if (isset($v['arrayValue'])) return array_map('fs_decode', $v['arrayValue']['values'] ?? []);
    return null;
}

/** مستند كمصفوفة، أو null إن لم يوجد — أي خطأ آخر يوقف الطلب */
function fs_get(string $projectId, string $token, string $path): ?array {
    [$status, $body] = http_request('GET',
        'https://firestore.googleapis.com/v1/' . fs_doc_name($projectId, $path),
        ["Authorization: Bearer $token"]);
    if ($status === 404) return null;
    $doc = json_decode($body, true);
    if ($status !== 200 || !is_array($doc)) {
        error_log("signup.php: فشل قراءة $path ($status): " . substr($body, 0, 300));
        fail(503, 'تعذّر الاتصال بقاعدة البيانات. أعد المحاولة بعد قليل.', 'UNAVAILABLE');
    }
    $out = [];
    foreach ($doc['fields'] ?? [] as $k => $f) $out[$k] = fs_decode($f);
    // وقت آخر تعديل — شرط مسبق للكتابة المتزامنة (عدّاد المحاولات)
    $out['__updateTime'] = (string) ($doc['updateTime'] ?? '');
    return $out;
}

/** هل في المجموعة مستند واحد على الأقل بهذا lawyerId؟ */
function fs_any_with_lawyer(string $projectId, string $token, string $collection, string $lawyerId): bool {
    [$status, $body] = http_request('POST',
        "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:runQuery",
        ["Authorization: Bearer $token", 'Content-Type: application/json'],
        json_encode(['structuredQuery' => [
            'from' => [['collectionId' => $collection]],
            'where' => ['fieldFilter' => ['field' => ['fieldPath' => 'lawyerId'], 'op' => 'EQUAL', 'value' => ['stringValue' => $lawyerId]]],
            'limit' => 1,
        ]]));
    $rows = json_decode($body, true);
    if ($status !== 200 || !is_array($rows)) {
        error_log("signup.php: فشل الاستعلام في $collection ($status): " . substr($body, 0, 300));
        fail(503, 'تعذّر الاتصال بقاعدة البيانات. أعد المحاولة بعد قليل.', 'UNAVAILABLE');
    }
    foreach ($rows as $row) if (!empty($row['document'])) return true;
    return false;
}

/** كتابة ذرّية لعدة مستندات — ترجع [الحالة, الجسم] ليقرر المستدعي */
function fs_commit(string $projectId, string $token, array $writes): array {
    return http_request('POST',
        "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:commit",
        ["Authorization: Bearer $token", 'Content-Type: application/json'],
        json_encode(['writes' => $writes], JSON_UNESCAPED_UNICODE));
}

function fs_set_write(string $projectId, string $path, array $data, ?array $mask = null, ?array $precondition = null): array {
    $w = ['update' => ['name' => fs_doc_name($projectId, $path), 'fields' => fs_fields($data)]];
    if ($mask !== null) $w['updateMask'] = ['fieldPaths' => $mask];
    if ($precondition !== null) $w['currentDocument'] = $precondition;
    return $w;
}

/* ────────────────────────── حدود الإرسال ────────────────────────── */

function client_ip(): string {
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/** حد لكل IP في الساعة — ملف مؤقت، ولا يمنع الخدمة إن تعذّر الملف */
function ip_rate_limit(string $bucket, int $max): void {
    $file = sys_get_temp_dir() . '/lawyer_sa_signup_' . $bucket . '_' . hash('sha256', client_ip());
    $fh = @fopen($file, 'c+');
    if (!$fh) return;
    flock($fh, LOCK_EX);
    $state = json_decode((string) stream_get_contents($fh), true);
    $now = time();
    if (!is_array($state) || ($state['reset'] ?? 0) <= $now) $state = ['count' => 0, 'reset' => $now + 3600];
    $state['count']++;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($state));
    flock($fh, LOCK_UN);
    fclose($fh);
    if ($state['count'] > $max) {
        fail(429, 'طلبات كثيرة من هذا الجهاز. حاول بعد ساعة.', 'RATE_LIMIT', ['retryAfter' => max(1, $state['reset'] - $now)]);
    }
}

/* ────────────────────────── البريد ────────────────────────── */

function mail_domain(): string {
    $configured = strtolower((string) ($GLOBALS['config']['mail_domain'] ?? ''));
    return preg_match('/^[a-z0-9-]+(\.[a-z0-9-]+)+$/', $configured) ? $configured : DEFAULT_MAIL_DOMAIN;
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

function send_otp_mail(string $email, string $name, string $code): bool {
    $from = 'no-reply@' . mail_domain();
    $subject = '=?UTF-8?B?' . base64_encode("رمز التأكيد: $code — موازين") . '?=';
    $headers = implode("\r\n", [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        'From: =?UTF-8?B?' . base64_encode('موازين') . "?= <$from>",
        "Reply-To: $from",
    ]);
    $body = chunk_split(base64_encode(otp_email_html($name, $code)));
    $sent = @mail($email, $subject, $body, $headers, "-f$from");
    if (!$sent) $sent = @mail($email, $subject, $body, $headers);

    // الخادم المدمج (php -S) للتطوير فقط — لا بريد محلياً، فنطبع الرمز في الطرفية
    if (!$sent && PHP_SAPI === 'cli-server') {
        error_log("[signup.php dev] رمز التأكيد لـ $email: $code");
        return true;
    }
    if (!$sent) error_log("signup.php: فشل mail() إلى $email");
    return $sent;
}

/* ────────────────────────── بيانات المكتب ────────────────────────── */

function clean_text($v, int $min, int $max, string $label): string {
    $s = trim(preg_replace('/\s+/u', ' ', is_string($v) ? $v : ''));
    if (ulen($s) < $min || ulen($s) > $max) fail(400, "$label غير صالح.", 'INVALID_INPUT');
    return $s;
}

function clean_count($v, string $label): int {
    if (!is_numeric($v) || (int) $v != $v || (int) $v < 0 || (int) $v > 1000) {
        fail(400, "عدد $label غير صالح.", 'INVALID_INPUT');
    }
    return (int) $v;
}

function clean_profile($p): array {
    if (!is_array($p)) fail(400, 'بيانات المكتب ناقصة.', 'INVALID_INPUT');
    $phone = preg_replace('/[\s\-()]/', '', is_string($p['phone'] ?? null) ? $p['phone'] : '');
    if (!preg_match('/^\+?[0-9]{8,15}$/', $phone)) fail(400, 'رقم الجوال غير صالح.', 'INVALID_INPUT');
    $country = in_array($p['country'] ?? '', ['SA', 'EG', 'OTHER'], true) ? $p['country'] : 'OTHER';
    $team = is_array($p['team'] ?? null) ? $p['team'] : [];
    return [
        'name' => clean_text($p['name'] ?? '', 2, 100, 'الاسم'),
        'officeName' => clean_text($p['officeName'] ?? '', 2, 150, 'اسم المكتب'),
        'phone' => $phone,
        'country' => $country,
        'team' => [
            'lawyers' => clean_count($team['lawyers'] ?? 0, 'المحامين'),
            'consultants' => clean_count($team['consultants'] ?? 0, 'المستشارين'),
            'trainees' => clean_count($team['trainees'] ?? 0, 'المتدربين'),
            'staff' => clean_count($team['staff'] ?? 0, 'الموظفين'),
        ],
    ];
}

/* ────────────────────────── الإرسال والتأكيد ────────────────────────── */

/** المفتاح مشتق من المفتاح الخاص لحساب الخدمة (سرّي)، والرمز مربوط بالمستخدم وبريده معاً */
function otp_hash(array $sa, string $uid, string $email, string $code): string {
    $secret = hash('sha256', 'mawazeen-signup-otp|' . $sa['private_key'], true);
    return hash_hmac('sha256', "$uid|$email|$code", $secret);
}

function send_code(string $projectId, string $token, array $sa, string $uid, string $email, array $profile, ?array $existing, bool $profileChanged = false): void {
    $now = time();
    $windowStart = (int) ($existing['windowStart'] ?? 0);
    $sentCount = (int) ($existing['sentCount'] ?? 0);
    $lastSentAt = (int) ($existing['lastSentAt'] ?? 0);

    if ($lastSentAt && $now - $lastSentAt < RESEND_COOLDOWN_SECONDS) {
        $wait = RESEND_COOLDOWN_SECONDS - ($now - $lastSentAt);
        // البيانات الجديدة تُحفظ حتى أثناء الانتظار — الرمز المرسَل يُنشئ المكتب بآخر بيانات أدخلها صاحب البريد
        if ($profileChanged) {
            fs_commit($projectId, $token, [fs_set_write($projectId, "signup_otps/$uid", ['profile' => $profile], ['profile'])]);
        }
        fail(429, "انتظر $wait ثانية قبل طلب رمز جديد.", 'COOLDOWN', ['retryAfter' => $wait]);
    }
    if ($now - $windowStart >= 3600) {
        $windowStart = $now;
        $sentCount = 0;
    }
    if ($sentCount >= MAX_SENDS_PER_HOUR) {
        fail(429, 'تجاوزت عدد مرات إرسال الرمز. حاول بعد ساعة.', 'RATE_LIMIT', ['retryAfter' => 3600 - ($now - $windowStart)]);
    }
    ip_rate_limit('send', MAX_SENDS_PER_IP_HOUR);

    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $doc = [
        'uid' => $uid,
        'email' => $email,
        'profile' => $profile,
        'codeHash' => otp_hash($sa, $uid, $email, $code),
        'expiresAt' => $now + OTP_TTL_SECONDS,
        'attempts' => 0,
        'lastSentAt' => $now,
        'sentCount' => $sentCount + 1,
        'windowStart' => $windowStart,
        'createdAt' => gmdate('Y-m-d\TH:i:s\Z', $now),
    ];
    [$status, $body] = fs_commit($projectId, $token, [fs_set_write($projectId, "signup_otps/$uid", $doc)]);
    if ($status !== 200) {
        error_log("signup.php: فشل حفظ الرمز ($status): " . substr($body, 0, 300));
        fail(503, 'تعذّر الاتصال بقاعدة البيانات. أعد المحاولة بعد قليل.', 'UNAVAILABLE');
    }
    if (!send_otp_mail($email, $profile['name'], $code)) {
        fail(502, 'تعذّر إرسال البريد. تأكد من العنوان ثم أعد المحاولة.', 'MAIL_FAILED');
    }
    respond(200, ['ok' => true, 'email' => $email, 'resendIn' => RESEND_COOLDOWN_SECONDS, 'expiresIn' => OTP_TTL_SECONDS]);
}

function iso_ms(int $ts): string {
    return gmdate('Y-m-d\TH:i:s', $ts) . '.000Z';
}

function verify_code(string $projectId, string $token, array $sa, string $uid, string $email, string $code, ?array $pending): void {
    if (!$pending || empty($pending['codeHash'])) {
        fail(404, 'لا يوجد رمز نشط. اطلب رمزاً جديداً.', 'NO_PENDING');
    }
    if ((int) ($pending['expiresAt'] ?? 0) < time()) {
        fail(400, 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.', 'CODE_EXPIRED');
    }
    if (($pending['email'] ?? '') !== $email) {
        fail(400, 'الرمز لا يخص هذا البريد. اطلب رمزاً جديداً.', 'NO_PENDING');
    }
    $attempts = (int) ($pending['attempts'] ?? 0);
    if ($attempts >= OTP_MAX_ATTEMPTS) {
        fail(400, 'تجاوزت عدد المحاولات. اطلب رمزاً جديداً.', 'TOO_MANY_ATTEMPTS');
    }
    ip_rate_limit('verify', MAX_VERIFY_PER_IP_HOUR);

    // نحجز المحاولة قبل المقارنة، بشرط ألا يكون المستند تغيّر منذ قرأناه — فالطلبات المتوازية
    // لا تقرأ كلها attempts=0؛ واحد فقط ينجح والباقي يُرفض. أي فشل في الكتابة = رفض.
    $attempts++;
    [$status] = fs_commit($projectId, $token, [fs_set_write($projectId, "signup_otps/$uid", ['attempts' => $attempts], ['attempts'],
        ['updateTime' => (string) ($pending['__updateTime'] ?? '')])]);
    if ($status !== 200) {
        fail(409, 'تعذّر التحقق الآن. أعد المحاولة بعد لحظات.', 'RETRY');
    }

    if (!hash_equals((string) $pending['codeHash'], otp_hash($sa, $uid, $email, $code))) {
        $left = OTP_MAX_ATTEMPTS - $attempts;
        $msg = $left > 0 ? "الرمز غير صحيح. متبقٍ $left " . ($left === 1 ? 'محاولة' : 'محاولات') . '.' : 'تجاوزت عدد المحاولات. اطلب رمزاً جديداً.';
        fail(400, $msg, $left > 0 ? 'INVALID_CODE' : 'TOO_MANY_ATTEMPTS', ['attemptsLeft' => $left]);
    }

    $profile = is_array($pending['profile'] ?? null) ? $pending['profile'] : null;
    if (!$profile) fail(404, 'بيانات التسجيل غير موجودة. ابدأ من جديد.', 'NO_PENDING');

    // مدة التجربة ومستواها من «الباقة التجريبية» إن ضبطها مدير المنصة، وإلا الافتراضي 14 يوماً
    $trial = fs_get($projectId, $token, 'subscriptionPlans/trial');
    $days = DEFAULT_TRIAL_DAYS;
    $tier = DEFAULT_TRIAL_TIER;
    if ($trial && ($trial['active'] ?? true) !== false && ($trial['billing'] ?? '') === 'trial') {
        $d = (int) ($trial['durationDays'] ?? 0);
        if ($d > 0 && $d <= 90) $days = $d;
        if (in_array($trial['tier'] ?? '', ['BASIC', 'PROFESSIONAL', 'PREMIUM'], true)) $tier = $trial['tier'];
    }

    if (!$trial) {
        // بلا مستند الباقة تُقرأ حصص المكتب «غير محدودة» — نزرع الباقة التجريبية الافتراضية
        // (نفس DEFAULT_PLANS في src/lib/subscriptionPlans.ts). فشلها لا يوقف التسجيل.
        $seedAt = iso_ms(time());
        fs_commit($projectId, $token, [fs_set_write($projectId, 'subscriptionPlans/trial', [
            'name' => 'الباقة التجريبية', 'nameEn' => 'Free Trial', 'tier' => DEFAULT_TRIAL_TIER, 'billing' => 'trial',
            'durationDays' => DEFAULT_TRIAL_DAYS,
            'quotas' => ['cases' => 20, 'clients' => 20, 'team' => 2, 'ai' => 50],
            'prices' => ['SAR' => 0, 'EGP' => 0, 'USD' => 0],
            'active' => true, 'order' => 0, 'createdAt' => $seedAt, 'updatedAt' => $seedAt,
        ], null, ['exists' => false])]);
    }

    // حساب المكتب + ترويسته + حذف الرمز — كتابة واحدة ذرّية
    $now = time();
    $nowIso = iso_ms($now);
    $team = is_array($profile['team'] ?? null) ? $profile['team'] : [];
    $user = [
        'name' => (string) $profile['name'],
        'email' => $email,
        'phone' => (string) $profile['phone'],
        'officeName' => (string) $profile['officeName'],
        'country' => (string) ($profile['country'] ?? 'OTHER'),
        'teamSize' => [
            'lawyers' => (int) ($team['lawyers'] ?? 0),
            'consultants' => (int) ($team['consultants'] ?? 0),
            'trainees' => (int) ($team['trainees'] ?? 0),
            'staff' => (int) ($team['staff'] ?? 0),
        ],
        'role' => 'LAWYER',
        'status' => 'ACTIVE',
        'plan' => $tier,
        'planId' => 'trial',
        'subscriptionBilling' => 'trial',
        'subscriptionStart' => $nowIso,
        'subscriptionExpiry' => iso_ms($now + $days * 86400),
        // نسخة Timestamp من الانتهاء — تقرؤها قواعد Firestore لقفل الكتابة بعد التجربة
        'trialEndsAt' => ['__timestamp' => iso_ms($now + $days * 86400)],
        'selfSignup' => true,
        'onboardingCompleted' => false,
        'emailVerifiedAt' => $nowIso,
        'createdAt' => $nowIso,
    ];
    $officeProfile = [
        'name' => (string) $profile['officeName'], 'nameEn' => '', 'address' => '',
        'phone' => (string) $profile['phone'], 'phone2' => '', 'email' => $email,
        'crNumber' => '', 'licenseNumber' => '', 'logoUrl' => null,
    ];
    [$status, $body] = fs_commit($projectId, $token, [
        fs_set_write($projectId, "users/$uid", $user, null, ['exists' => false]),
        fs_set_write($projectId, "office_settings/$uid",
            ['lawyerId' => $uid, 'officeProfile' => $officeProfile, 'updatedAt' => $nowIso, 'updatedBy' => $uid],
            ['lawyerId', 'officeProfile', 'updatedAt', 'updatedBy']),
        ['delete' => fs_doc_name($projectId, "signup_otps/$uid")],
    ]);
    if ($status === 400 || $status === 409) {
        // الشرط exists:false فشل — الحساب أُنشئ في طلب سابق
        if (fs_get($projectId, $token, "users/$uid")) respond(200, ['ok' => true, 'alreadyActive' => true]);
    }
    if ($status !== 200) {
        error_log("signup.php: فشل إنشاء حساب المكتب ($status): " . substr($body, 0, 300));
        fail(503, 'تعذّر إنشاء الحساب. أعد المحاولة بعد قليل.', 'UNAVAILABLE');
    }

    // البريد «مؤكَّد» في Firebase Auth — بعد إنشاء الحساب حتى لا يبقى مستخدم مؤكَّد بلا مكتب.
    // فشله لا يُلغي التفعيل: لا شيء في النظام يشترط email_verified، والحساب أصبح قائماً.
    [$status, $body] = http_request('POST',
        "https://identitytoolkit.googleapis.com/v1/projects/$projectId/accounts:update",
        ["Authorization: Bearer $token", 'Content-Type: application/json'],
        json_encode(['localId' => $uid, 'emailVerified' => true]));
    if ($status !== 200) error_log("signup.php: فشل تأكيد البريد في Auth ($status): " . substr($body, 0, 300));

    respond(200, ['ok' => true, 'trialDays' => $days, 'subscriptionExpiry' => $user['subscriptionExpiry']]);
}

/* ────────────────────────── نقطة الدخول ────────────────────────── */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'طريقة غير مسموحة.', 'METHOD');

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
if ($raw === false || strlen($raw) > MAX_BODY_BYTES) fail(413, 'حجم الطلب كبير جداً.', 'INVALID_INPUT');
$req = json_decode($raw ?: '{}', true);
if (!is_array($req)) fail(400, 'صيغة الطلب غير صحيحة.', 'INVALID_INPUT');
$action = (string) ($req['action'] ?? '');
if (!in_array($action, ['start', 'resend', 'verify'], true)) fail(400, 'إجراء غير معروف.', 'INVALID_INPUT');

$configFile = __DIR__ . '/ai-config.php';
$config = is_file($configFile) ? require $configFile : [];
if (!is_array($config)) $config = [];
$GLOBALS['config'] = $config;
$projectId = !empty($config['firebase_project_id']) ? $config['firebase_project_id'] : 'lawyer-sa';

$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if ($auth === '' && function_exists('getallheaders')) {
    foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $auth = $v;
}
if (!preg_match('/^Bearer\s+(\S+)$/', $auth, $m)) fail(401, 'انتهت الجلسة. ابدأ التسجيل من جديد.', 'UNAUTHENTICATED');
$claims = verify_firebase_token($m[1], $projectId);
$uid = $claims['sub'];
$email = strtolower(trim((string) ($claims['email'] ?? '')));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'البريد الإلكتروني غير صالح.', 'INVALID_INPUT');

$sa = service_account();
$token = admin_access_token($sa);

// حساب مفعّل مسبقاً — لا رموز ولا إعادة إنشاء
if (fs_get($projectId, $token, "users/$uid")) {
    fail(409, 'هذا الحساب مفعّل بالفعل. سجّل الدخول.', 'ALREADY_ACTIVE');
}

// مكتب حذفه مدير المنصة يبقى حسابه في Auth وبياناته بنفس المعرّف. لا نسمح بإعادة التسجيل
// به — وإلا استعاد كل قضاياه وعملائه بتجربة مجانية جديدة.
if (fs_get($projectId, $token, "office_settings/$uid")
    || fs_any_with_lawyer($projectId, $token, 'cases', $uid)
    || fs_any_with_lawyer($projectId, $token, 'clients', $uid)) {
    fail(409, 'هذا البريد مرتبط بحساب سابق. تواصل مع الدعم الفني لإعادة تفعيله.', 'PREVIOUS_ACCOUNT');
}

$pending = fs_get($projectId, $token, "signup_otps/$uid");

if ($action === 'start') {
    send_code($projectId, $token, $sa, $uid, $email, clean_profile($req['profile'] ?? null), $pending, true);
}
if ($action === 'resend') {
    if (!$pending || !is_array($pending['profile'] ?? null)) fail(404, 'بيانات التسجيل غير موجودة. أكمل البيانات من جديد.', 'NO_PENDING');
    send_code($projectId, $token, $sa, $uid, $email, $pending['profile'], $pending);
}
// verify
$code = preg_replace('/\D/', '', (string) ($req['code'] ?? ''));
if (strlen($code) !== 6) fail(400, 'أدخل الرمز المكوّن من 6 أرقام.', 'INVALID_INPUT');
verify_code($projectId, $token, $sa, $uid, $email, $code, $pending);
