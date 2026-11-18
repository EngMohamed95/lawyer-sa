<?php
/**
 * أدوات Firebase المشتركة بين signup.php و trial-cleanup.php:
 * HTTP · التحقق من توكن المستخدم · توكن حساب الخدمة · Firestore عبر REST.
 * لا يُنفَّذ شيء عند تضمينه — دوال فقط. .htaccess يمنع طلبه من المتصفح.
 */

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

/* ────────────────────────── أدوات عامة ────────────────────────── */

function respond(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    // من سطر الأوامر (Cron): الخطأ يُرجع رمز خروج غير صفري فيُسجَّل فشلاً
    exit(PHP_SAPI === 'cli' && $status >= 400 ? 1 : 0);
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

/** هل في المجموعة مستند واحد على الأقل بهذا lawyerId (أو بحقل آخر $field)؟ */
function fs_any_with_lawyer(string $projectId, string $token, string $collection, string $lawyerId, string $field = 'lawyerId'): bool {
    [$status, $body] = http_request('POST',
        "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:runQuery",
        ["Authorization: Bearer $token", 'Content-Type: application/json'],
        json_encode(['structuredQuery' => [
            'from' => [['collectionId' => $collection]],
            'where' => ['fieldFilter' => ['field' => ['fieldPath' => $field], 'op' => 'EQUAL', 'value' => ['stringValue' => $lawyerId]]],
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
