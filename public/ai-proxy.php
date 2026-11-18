<?php
/**
 * وسيط الذكاء الاصطناعي على الاستضافة الثابتة (Hostinger) — بديل POST /api/ai/generate
 * في خادم Node، لأن الاستضافة الحالية تشغّل PHP ولا تشغّل Node.
 *
 * .htaccess يوجّه /api/ai/generate إلى هذا الملف، فالواجهة لا تتغيّر.
 *
 * - المفتاح يبقى على الخادم في ai-config.php (يُنشأ وقت النشر من أسرار GitHub، ولا يُرفع للمستودع).
 * - كل طلب يجب أن يحمل توكن Firebase صالحاً لمستخدم مسجّل — يُتحقق من توقيعه
 *   بشهادات Google العامة، فلا حاجة لملف حساب الخدمة.
 * - حد 20 طلباً في الدقيقة لكل مستخدم.
 *
 * عقد الرد مطابق لخادم Node: رد Gemini/Groq يُمرَّر كما هو، والأخطاء { error: "..." }.
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const RATE_LIMIT_PER_MINUTE = 20;
// المرفقات (PDF/صور) تُرسل مضمّنة بـ base64 — الواجهة تحدّها بـ 10MB خام (~14MB مرمّزة)
const MAX_BODY_BYTES = 20 * 1024 * 1024;
/** نماذج احتياطية عند ضغط مؤقت على النموذج المطلوب — نفس القائمة في src/server/api.ts */
const GEMINI_FALLBACK_MODELS = ['gemini-flash-lite-latest', 'gemini-3.5-flash'];
/** حد «التفكير» قبل الكتابة — يكفي لصياغة قانونية منظمة ويُبقي الرد خلال ثوانٍ معدودة */
const THINKING_BUDGET = 1024;
/** ميزانية الطلب كله (أقل من مهلة الاستضافة ~120 ث) ومهلة المحاولة الواحدة قبل الانتقال للبديل */
const AI_TOTAL_BUDGET_SECONDS = 105;
const AI_FIRST_ATTEMPT_SECONDS = 45;
const CERTS_URL ='https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

/** $code يميّز الأخطاء للواجهة: RATE_LIMIT · OFFICE_QUOTA · PLATFORM_UNAVAILABLE · PROVIDER_BUSY */
function fail(int $status, string $message, ?string $code = null): void {
    // بعد بدء إبقاء الاتصال حياً تكون الحالة 200 قد أُرسلت — الخطأ يصل في الجسم
    if (empty($GLOBALS['keepalive_started'])) http_response_code($status);
    $out = ['error' => $message];
    if ($code !== null) $out['code'] = $code;
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

function b64url_decode(string $s): string {
    $decoded = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    return $decoded === false ? '' : $decoded;
}

/**
 * إبقاء الاتصال حياً أثناء انتظار ردود الذكاء الاصطناعي الطويلة.
 *
 * الخادم الأمامي (nginx) يقطع الطلب بـ 504 إن لم يصله شيء خلال ~60 ثانية، وصياغة
 * مذكرة كاملة بمرفقاتها قد تتجاوز ذلك. بعد KEEPALIVE_AFTER ثانية نرسل الحالة 200
 * ثم مسافة كل KEEPALIVE_EVERY ثوانٍ — المسافات قبل JSON لا تؤثر على تحليله،
 * والأخطاء بعدها تصل في الجسم { error: ... } فتعرضها الواجهة كما هي.
 */
const KEEPALIVE_AFTER = 8;
const KEEPALIVE_EVERY = 5;
$GLOBALS['keepalive_started'] = false;

function keepalive_tick(float $startedAt, float &$lastPing): void {
    $now = microtime(true);
    if ($now - $startedAt < KEEPALIVE_AFTER || $now - $lastPing < KEEPALIVE_EVERY) return;
    if (!$GLOBALS['keepalive_started']) {
        $GLOBALS['keepalive_started'] = true;
        http_response_code(200);
        header('X-Accel-Buffering: no');
        while (ob_get_level() > 0) @ob_end_flush();
    }
    echo ' ';
    @flush();
    $lastPing = $now;
}

/** طلب HTTP يرجع [الحالة, الترويسات, الجسم] — curl إن وُجد، وإلا streams */
function http_request(string $method, string $url, array $headers = [], ?string $body = null, bool $keepalive = false, int $timeout = 0): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $respHeaders = [];
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $timeout > 0 ? $timeout : ($keepalive ? 170 : 120),
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$respHeaders) {
                $parts = explode(':', $line, 2);
                if (count($parts) === 2) $respHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
                return strlen($line);
            },
        ]);
        if ($keepalive) {
            $startedAt = microtime(true);
            $lastPing = 0.0;
            curl_setopt($ch, CURLOPT_NOPROGRESS, false);
            curl_setopt($ch, CURLOPT_XFERINFOFUNCTION, function () use ($startedAt, &$lastPing) {
                keepalive_tick($startedAt, $lastPing);
                return 0;
            });
        }
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $resp = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [$resp === false ? 0 : $status, $respHeaders, $resp === false ? '' : $resp];
    }
    $ctx = stream_context_create(['http' => [
        'method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body ?? '',
        'timeout' => 120, 'ignore_errors' => true,
    ]]);
    $resp = @file_get_contents($url, false, $ctx);
    $status = 0;
    $respHeaders = [];
    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) $status = (int) $m[1];
        $parts = explode(':', $line, 2);
        if (count($parts) === 2) $respHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
    }
    return [$status, $respHeaders, $resp === false ? '' : $resp];
}

/** شهادات Google العامة لتوكنات Firebase — مخزّنة مؤقتاً حسب Cache-Control */
function google_certs(): array {
    $cacheFile = sys_get_temp_dir() . '/lawyer_sa_firebase_certs.json';
    if (is_file($cacheFile)) {
        $cached = json_decode((string) @file_get_contents($cacheFile), true);
        if (is_array($cached) && ($cached['expires'] ?? 0) > time() && is_array($cached['certs'] ?? null)) {
            return $cached['certs'];
        }
    }
    [$status, $headers, $body] = http_request('GET', CERTS_URL);
    $certs = json_decode($body, true);
    if ($status !== 200 || !is_array($certs) || !$certs) fail(503, 'تعذّر التحقق من الجلسة حالياً. أعد المحاولة بعد قليل.');
    $maxAge = 3600;
    if (preg_match('/max-age=(\d+)/', $headers['cache-control'] ?? '', $m)) $maxAge = (int) $m[1];
    @file_put_contents($cacheFile, json_encode(['expires' => time() + $maxAge, 'certs' => $certs]), LOCK_EX);
    return $certs;
}

/** يتحقق من توكن Firebase ويرجع معرّف المستخدم (uid) */
function verify_firebase_token(string $token, string $projectId): string {
    $parts = explode('.', $token);
    if (count($parts) !== 3) fail(401, 'مطلوب تسجيل الدخول.');
    [$h64, $p64, $s64] = $parts;
    $header = json_decode(b64url_decode($h64), true);
    $payload = json_decode(b64url_decode($p64), true);
    if (!is_array($header) || !is_array($payload) || ($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) {
        fail(401, 'مطلوب تسجيل الدخول.');
    }
    $certs = google_certs();
    $cert = $certs[$header['kid']] ?? null;
    if (!$cert) fail(401, 'انتهت الجلسة. سجّل الدخول من جديد.');
    if (openssl_verify("$h64.$p64", b64url_decode($s64), $cert, OPENSSL_ALGO_SHA256) !== 1) {
        fail(401, 'مطلوب تسجيل الدخول.');
    }
    $now = time();
    $skew = 300;
    $valid = ($payload['aud'] ?? '') === $projectId
        && ($payload['iss'] ?? '') === "https://securetoken.google.com/$projectId"
        && is_string($payload['sub'] ?? null) && $payload['sub'] !== '' && strlen($payload['sub']) <= 128
        && (int) ($payload['exp'] ?? 0) > $now - $skew
        && (int) ($payload['iat'] ?? PHP_INT_MAX) <= $now + $skew
        && (int) ($payload['auth_time'] ?? PHP_INT_MAX) <= $now + $skew;
    if (!$valid) fail(401, 'انتهت الجلسة. سجّل الدخول من جديد.');
    return $payload['sub'];
}

/** حد الطلبات لكل مستخدم — نافذة دقيقة واحدة في ملف مؤقت */
function rate_limit(string $uid): void {
    $file = sys_get_temp_dir() . '/lawyer_sa_ai_rl_' . hash('sha256', $uid);
    $fh = @fopen($file, 'c+');
    if (!$fh) return; // لا نمنع الخدمة إن تعذّر إنشاء الملف المؤقت
    flock($fh, LOCK_EX);
    $state = json_decode((string) stream_get_contents($fh), true);
    $now = time();
    if (!is_array($state) || ($state['reset'] ?? 0) <= $now) $state = ['count' => 0, 'reset' => $now + 60];
    $state['count']++;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($state));
    flock($fh, LOCK_UN);
    fclose($fh);
    if ($state['count'] > RATE_LIMIT_PER_MINUTE) {
        header('Retry-After: ' . max(1, $state['reset'] - $now));
        fail(429, 'أرسلت طلبات كثيرة خلال دقيقة واحدة. انتظر دقيقة ثم أعد المحاولة.', 'RATE_LIMIT');
    }
}

/* ────────────────────────── حصة المكتب الشهرية ────────────────────────── */

/**
 * الحصة تُقرأ من Firestore عبر REST بتوكن المستخدم نفسه — فتسري قواعد الأمان،
 * ولا حاجة لحساب خدمة على الاستضافة.
 *
 * العدّاد ai_usage/{مكتب}_{YYYY-MM}: يزيد 1 بعد كل رد ناجح فقط. القواعد لا تسمح
 * إلا بزيادة 1 بالضبط، فلا يستطيع أحد إنقاصه أو تصفيره.
 * الحصة 0 = غير محدود (نفس اتفاق حصص القضايا والعملاء). مدير المنصة مستثنى.
 *
 * أي تعذّر في قراءة Firestore لا يوقف الخدمة (fail-open) — الحصة حماية للرصيد
 * وليست سبباً لتعطيل المساعد عند خلل عابر.
 */

const OFFICE_CTX_TTL = 300;

function fs_base(string $projectId): string {
    return "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents";
}

function fs_value($v) {
    if (!is_array($v)) return null;
    if (array_key_exists('stringValue', $v)) return $v['stringValue'];
    if (array_key_exists('integerValue', $v)) return (int) $v['integerValue'];
    if (array_key_exists('doubleValue', $v)) return (float) $v['doubleValue'];
    if (array_key_exists('booleanValue', $v)) return (bool) $v['booleanValue'];
    if (array_key_exists('timestampValue', $v)) return $v['timestampValue'];
    if (isset($v['mapValue'])) {
        $out = [];
        foreach ($v['mapValue']['fields'] ?? [] as $k => $f) $out[$k] = fs_value($f);
        return $out;
    }
    if (isset($v['arrayValue'])) return array_map('fs_value', $v['arrayValue']['values'] ?? []);
    return null;
}

/** مستند Firestore كمصفوفة — null إن لم يوجد، false عند أي خطأ آخر */
function fs_get(string $projectId, string $token, string $path) {
    [$status, , $body] = http_request('GET', fs_base($projectId) . '/' . $path, ["Authorization: Bearer $token"]);
    if ($status === 404) return null;
    $doc = json_decode($body, true);
    if ($status !== 200 || !is_array($doc)) return false;
    $out = [];
    foreach ($doc['fields'] ?? [] as $k => $f) $out[$k] = fs_value($f);
    return $out;
}

/** كتابة بحقول ثابتة + تحويلات خادم (زيادة/وقت الخادم) — عبر :commit */
function fs_commit_write(string $projectId, string $token, string $path, array $fields, array $transforms): bool {
    $name = "projects/$projectId/databases/(default)/documents/$path";
    $write = [
        'update' => ['name' => $name, 'fields' => $fields ?: new stdClass()],
        'updateMask' => ['fieldPaths' => array_keys($fields)],
        'updateTransforms' => $transforms,
    ];
    [$status] = http_request(
        'POST',
        fs_base($projectId) . ':commit',
        ['Content-Type: application/json', "Authorization: Bearer $token"],
        json_encode(['writes' => [$write]])
    );
    return $status === 200;
}

/**
 * مكتب المستخدم وحصته — مخزّنة مؤقتاً 5 دقائق لكل مستخدم.
 * يرجع ['exempt' => bool, 'tenant' => string, 'quota' => int] أو null إن تعذّر التحديد.
 */
function ai_office_context(string $uid, string $token, string $projectId): ?array {
    $cacheFile = sys_get_temp_dir() . '/lawyer_sa_ai_ctx_' . hash('sha256', $uid);
    if (is_file($cacheFile)) {
        $cached = json_decode((string) @file_get_contents($cacheFile), true);
        if (is_array($cached) && ($cached['expires'] ?? 0) > time()) return $cached['ctx'];
    }
    $user = fs_get($projectId, $token, 'users/' . rawurlencode($uid));
    if (!is_array($user)) return null;

    if (($user['role'] ?? '') === 'SUPER_ADMIN') {
        $ctx = ['exempt' => true, 'tenant' => '', 'quota' => 0];
    } else {
        $tenant = is_string($user['lawyerId'] ?? null) && $user['lawyerId'] !== '' ? $user['lawyerId'] : $uid;
        if (!preg_match('/^[A-Za-z0-9_-]{1,128}$/', $tenant)) return null;
        $owner = $tenant === $uid ? $user : fs_get($projectId, $token, 'users/' . rawurlencode($tenant));
        if ($owner === false) return null;
        $owner = is_array($owner) ? $owner : [];

        $quota = 0;
        $override = $owner['quotaOverrides']['ai'] ?? null;
        if (is_numeric($override) && $override >= 0) {
            $quota = (int) $override;
        } elseif (is_string($owner['planId'] ?? null) && $owner['planId'] !== '') {
            $plan = fs_get($projectId, $token, 'subscriptionPlans/' . rawurlencode($owner['planId']));
            if ($plan === false) return null;
            $q = is_array($plan) ? ($plan['quotas']['ai'] ?? 0) : 0;
            $quota = is_numeric($q) && $q > 0 ? (int) $q : 0;
        }
        // تجربة التسجيل الذاتي انتهت بلا اشتراك — نفس قفل قواعد Firestore (officeWritable)
        $trialEnd = ($owner['subscriptionBilling'] ?? '') === 'trial' ? strtotime((string) ($owner['subscriptionExpiry'] ?? '')) : false;
        $locked = $trialEnd !== false && $trialEnd <= time();
        $ctx = ['exempt' => false, 'tenant' => $tenant, 'quota' => $quota, 'locked' => $locked];
    }
    @file_put_contents($cacheFile, json_encode(['expires' => time() + OFFICE_CTX_TTL, 'ctx' => $ctx]), LOCK_EX);
    return $ctx;
}

/** يمنع الطلب إن استنفد المكتب حصته الشهرية */
function ai_enforce_quota(?array $ctx, string $token, string $projectId): void {
    if ($ctx && !empty($ctx['locked'])) {
        fail(403, 'انتهت الفترة التجريبية لمكتبك. اختر باقة لمتابعة استخدام المساعد الذكي.', 'TRIAL_EXPIRED');
    }
    if (!$ctx || $ctx['exempt'] || $ctx['quota'] <= 0) return;
    $usage = fs_get($projectId, $token, 'ai_usage/' . $ctx['tenant'] . '_' . gmdate('Y-m'));
    if (!is_array($usage)) return;
    $used = (int) ($usage['count'] ?? 0);
    if ($used >= $ctx['quota']) {
        fail(429,
            "استنفد مكتبك حصته الشهرية من طلبات المساعد الذكي ($used من {$ctx['quota']}). "
            . 'تتجدد الحصة أول الشهر القادم، ولزيادتها تواصل مع مدير المكتب أو إدارة المنصة لترقية الباقة.',
            'OFFICE_QUOTA');
    }
}

/** يحسب طلباً ناجحاً على المكتب — يُستدعى بعد رد ناجح فقط */
function ai_count_usage(?array $ctx, string $token, string $projectId): void {
    if (!$ctx || $ctx['exempt']) return;
    $month = gmdate('Y-m');
    fs_commit_write($projectId, $token, 'ai_usage/' . $ctx['tenant'] . '_' . $month,
        ['lawyerId' => ['stringValue' => $ctx['tenant']], 'month' => ['stringValue' => $month]],
        [
            ['fieldPath' => 'count', 'increment' => ['integerValue' => '1']],
            ['fieldPath' => 'updatedAt', 'setToServerValue' => 'REQUEST_TIME'],
        ]);
}

/* ────────────────────────── حالة خدمة المنصة ────────────────────────── */

/**
 * حين يرفض المزوّد مفتاح المنصة (نفاد الرصيد/الحد، أو مشكلة في المفتاح أو الحساب)
 * يتوقف المساعد عند كل المكاتب معاً — فنسجّل ذلك في platform_status/ai ليظهر
 * لمدير المنصة تنبيه فوري، ونعيده OK عند أول رد ناجح.
 * ملف مؤقت يمنع تكرار الكتابة مع كل طلب فاشل.
 */
function ai_platform_state(string $projectId, string $token, string $state, string $reason = '', int $httpStatus = 0): void {
    $flag = sys_get_temp_dir() . '/lawyer_sa_ai_platform_down';
    $isDown = is_file($flag);
    if ($state === 'DOWN' && $isDown) return;
    if ($state === 'OK' && !$isDown) return;
    $ok = fs_commit_write($projectId, $token, 'platform_status/ai', [
        'state' => ['stringValue' => $state],
        'reason' => ['stringValue' => $reason],
        'httpStatus' => ['integerValue' => (string) $httpStatus],
    ], [['fieldPath' => 'at', 'setToServerValue' => 'REQUEST_TIME']]);
    if (!$ok) return;
    if ($state === 'DOWN') @touch($flag); else @unlink($flag);
}

/** يصنّف رد المزوّد الفاشل: QUOTA · ACCOUNT · BUSY · null (خطأ في الطلب نفسه) */
function provider_failure(int $status, string $body): ?string {
    if ($status === 429) return 'QUOTA';
    if ($status === 401 || $status === 403) return 'ACCOUNT';
    if ($status === 400 && preg_match('/API[_ ]?key/i', $body)) return 'ACCOUNT';
    if ($status === 500 || $status === 502 || $status === 503) return 'BUSY';
    return null;
}

/** يرد على فشل المزوّد برسالة واضحة، ويبلغ الإدارة إن كان الخلل على مستوى المنصة */
function handle_provider_failure(int $status, string $body, string $token, string $projectId): void {
    $kind = provider_failure($status, $body);
    if ($kind === null) return;
    if ($kind === 'BUSY') {
        fail(503, 'خدمة الذكاء الاصطناعي مشغولة مؤقتاً لدى المزوّد. أعد المحاولة بعد دقيقة.', 'PROVIDER_BUSY');
    }
    ai_platform_state($projectId, $token, 'DOWN', $kind, $status);
    fail(503, $kind === 'QUOTA'
        ? 'خدمة الذكاء الاصطناعي متوقفة مؤقتاً على مستوى المنصة (نفاد رصيد أو ضغط لدى المزوّد). تم إبلاغ إدارة المنصة، أعد المحاولة لاحقاً.'
        : 'خدمة الذكاء الاصطناعي متوقفة مؤقتاً بسبب مشكلة في إعداد المنصة. تم إبلاغ إدارة المنصة.',
        'PLATFORM_UNAVAILABLE');
}

/* ────────────────────────── الطلب ────────────────────────── */

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'طريقة غير مسموحة.');

$configFile = __DIR__ . '/ai-config.php';
$config = is_file($configFile) ? require $configFile : [];
if (!is_array($config)) $config = [];
$projectId = $config['firebase_project_id'] ?? 'lawyer-sa';

// المصادقة أولاً — قبل أي عمل آخر
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if ($auth === '' && function_exists('getallheaders')) {
    foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $auth = $v;
}
if (!preg_match('/^Bearer\s+(\S+)$/', $auth, $m)) fail(401, 'مطلوب تسجيل الدخول.');
$idToken = $m[1];
$uid = verify_firebase_token($idToken, $projectId);
rate_limit($uid);
$officeCtx = ai_office_context($uid, $idToken, $projectId);
ai_enforce_quota($officeCtx, $idToken, $projectId);

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
if ($raw === false || strlen($raw) > MAX_BODY_BYTES) fail(413, 'حجم الطلب كبير جداً.');
$req = json_decode($raw, true);
if (!is_array($req)) fail(400, 'صيغة الطلب غير صحيحة.');

$provider = $req['provider'] ?? 'GEMINI';
$model = $req['model'] ?? '';

if ($provider === 'GEMINI') {
    $key = $config['gemini_key'] ?? '';
    if ($key === '') fail(501, 'مفتاح الذكاء الاصطناعي غير مضبوط على الخادم.');
    $contents = $req['contents'] ?? null;
    if (!is_array($contents) || !$contents) fail(400, 'محتوى الطلب مفقود.');
    $modelName = is_string($model) && $model !== '' ? $model : 'gemini-flash-lite-latest';
    if (!preg_match('/^[A-Za-z0-9._-]{1,80}$/', $modelName)) fail(400, 'اسم النموذج غير صالح.');
    $generationConfig = is_array($req['generationConfig'] ?? null) ? $req['generationConfig'] : ['temperature' => 0.7, 'maxOutputTokens' => 2048];
    @set_time_limit(0);
    @ini_set('zlib.output_compression', '0');

    // «التفكير» غير المحدود في نماذج Gemini الحديثة يجعل صياغة مذكرة كاملة تتجاوز الدقيقة،
    // فتقطعها الاستضافة. نحدّه بميزانية صغيرة — والنموذج الذي يرفض الإعداد يُعاد بدونه.
    $withThinking = $generationConfig;
    if (!isset($withThinking['thinkingConfig'])) $withThinking['thinkingConfig'] = ['thinkingBudget' => THINKING_BUDGET];
    $payloadFor = function (array $cfg) use ($contents) {
        return json_encode(['contents' => $contents, 'generationConfig' => $cfg], JSON_UNESCAPED_UNICODE);
    };

    // ضغط مؤقت على نموذج Google (503/429/500) أو تعليقه بلا رد — نعيد المحاولة بنماذج احتياطية.
    // الاستضافة تقطع الطلب قرب 120 ثانية، فلكل محاولة مهلة من ميزانية إجمالية أقل منها:
    // النموذج المعلَّق يُترك بعد AI_FIRST_ATTEMPT_SECONDS فيبقى وقت للبديل.
    $deadline = time() + AI_TOTAL_BUDGET_SECONDS;
    $models = array_values(array_unique(array_merge([$modelName], GEMINI_FALLBACK_MODELS)));
    foreach ($models as $i => $m) {
        if ($i > 0) usleep(800000);
        $left = $deadline - time();
        if ($left < 10) break;
        $isLast = $i === count($models) - 1;
        $timeout = $isLast ? $left : min($left, AI_FIRST_ATTEMPT_SECONDS);
        $url = "https://generativelanguage.googleapis.com/v1beta/models/$m:generateContent";
        $headers = ['Content-Type: application/json', "x-goog-api-key: $key"];
        [$status, , $body] = http_request('POST', $url, $headers, $payloadFor($withThinking), true, $timeout);
        if ($status === 400 && stripos($body, 'thinking') !== false) {
            [$status, , $body] = http_request('POST', $url, $headers, $payloadFor($generationConfig), true, max(10, min($timeout, $deadline - time())));
        }
        // 0 = انتهت المهلة بلا رد · 404 = النموذج لم يعد متاحاً — كلاهما ينتقل للبديل
        if (!in_array($status, [0, 404, 429, 500, 503], true)) break;
    }
    if ($status === 0 || json_decode($body) === null) {
        fail(504, 'استغرقت الصياغة وقتاً أطول من المسموح. أعد المحاولة، أو قلّل المرفقات أو اطلب جزءاً من المذكرة.');
    }
    handle_provider_failure($status, $body, $idToken, $projectId);
    if ($status >= 200 && $status < 300) {
        ai_count_usage($officeCtx, $idToken, $projectId);
        ai_platform_state($projectId, $idToken, 'OK');
    }
    if (empty($GLOBALS['keepalive_started'])) http_response_code($status >= 200 && $status < 300 ? 200 : $status);
    echo $body;
    exit;
}

if ($provider === 'GROQ') {
    $key = $config['groq_key'] ?? '';
    if ($key === '') fail(501, 'مفتاح Groq غير مضبوط على الخادم.');
    if (!is_string($model) || !preg_match('/^[A-Za-z0-9._\/-]{1,100}$/', $model)) fail(400, 'اسم النموذج غير صالح.');
    $messages = $req['messages'] ?? null;
    if (!is_array($messages) || !$messages) fail(400, 'محتوى الطلب مفقود.');
    $temperature = is_numeric($req['temperature'] ?? null) ? (float) $req['temperature'] : 0.7;

    [$status, , $body] = http_request(
        'POST',
        'https://api.groq.com/openai/v1/chat/completions',
        ['Content-Type: application/json', "Authorization: Bearer $key"],
        json_encode(['model' => $model, 'messages' => $messages, 'temperature' => $temperature], JSON_UNESCAPED_UNICODE)
    );
    if ($status === 0 || json_decode($body) === null) fail(502, 'تعذّر تنفيذ طلب الذكاء الاصطناعي.');
    handle_provider_failure($status, $body, $idToken, $projectId);
    if ($status >= 200 && $status < 300) {
        ai_count_usage($officeCtx, $idToken, $projectId);
        ai_platform_state($projectId, $idToken, 'OK');
    }
    http_response_code($status >= 200 && $status < 300 ? 200 : $status);
    echo $body;
    exit;
}

fail(400, 'مزوّد غير مدعوم.');
