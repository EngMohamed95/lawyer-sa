<?php
/**
 * أدوات مشتركة لملفات PHP (الـ API، trial-cleanup): الردود JSON، طلبات HTTP، base64url، طول النص.
 * لا يُنفَّذ شيء عند تضمينه — دوال فقط. .htaccess يمنع طلبه من المتصفح.
 */

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
