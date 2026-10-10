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
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function fail(int $status, string $message): void {
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function b64url_decode(string $s): string {
    $decoded = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    return $decoded === false ? '' : $decoded;
}

/** طلب HTTP يرجع [الحالة, الترويسات, الجسم] — curl إن وُجد، وإلا streams */
function http_request(string $method, string $url, array $headers = [], ?string $body = null): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $respHeaders = [];
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$respHeaders) {
                $parts = explode(':', $line, 2);
                if (count($parts) === 2) $respHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
                return strlen($line);
            },
        ]);
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
        fail(429, 'تجاوزت حد الطلبات المسموح. حاول بعد قليل.');
    }
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
$uid = verify_firebase_token($m[1], $projectId);
rate_limit($uid);

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
    $modelName = is_string($model) && $model !== '' ? $model : 'gemini-flash-latest';
    if (!preg_match('/^[A-Za-z0-9._-]{1,80}$/', $modelName)) fail(400, 'اسم النموذج غير صالح.');
    $generationConfig = is_array($req['generationConfig'] ?? null) ? $req['generationConfig'] : ['temperature' => 0.7, 'maxOutputTokens' => 2048];

    [$status, , $body] = http_request(
        'POST',
        "https://generativelanguage.googleapis.com/v1beta/models/$modelName:generateContent",
        ['Content-Type: application/json', "x-goog-api-key: $key"],
        json_encode(['contents' => $contents, 'generationConfig' => $generationConfig], JSON_UNESCAPED_UNICODE)
    );
    if ($status === 0 || json_decode($body) === null) fail(502, 'تعذّر تنفيذ طلب الذكاء الاصطناعي.');
    http_response_code($status >= 200 && $status < 300 ? 200 : $status);
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
    http_response_code($status >= 200 && $status < 300 ? 200 : $status);
    echo $body;
    exit;
}

fail(400, 'مزوّد غير مدعوم.');
