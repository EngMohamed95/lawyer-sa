<?php
/**
 * نقطة دخول الـ API: /api/v1/{route}
 * Apache (.htaccess) يحوّل /api/v1/xxx إلى api/index.php?__route=xxx، ومحلياً server.ts يمرّر بنفس الشكل.
 */

declare(strict_types=1);

// ضغط gzip للردود (JSON يصغر 5-10 مرات) — لو الخادم ما يضغط أصلاً ولو المتصفح يقبل
if (!ini_get('zlib.output_compression') && extension_loaded('zlib')
    && str_contains((string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip')) {
    ob_start('ob_gzhandler');
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/_lib/core.php';

set_exception_handler(function (Throwable $e): void {
    error_log('api: ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) http_response_code(500);
    echo json_encode(['error' => 'حدث خطأ غير متوقع. أعد المحاولة.', 'code' => 'INTERNAL'], JSON_UNESCAPED_UNICODE);
});

$route = trim((string) ($_GET['__route'] ?? ''), '/');
$method = request_method();

/** [METHOD, نمط] => [ملف, دالة]. {id} يطابق معرّف واحد */
$routes = [
    ['POST', 'auth/login', 'routes_auth.php', 'route_auth_login'],
    ['POST', 'auth/logout', 'routes_auth.php', 'route_auth_logout'],
    ['GET', 'auth/me', 'routes_auth.php', 'route_auth_me'],
    ['POST', 'auth/firebase-token', 'routes_auth.php', 'route_auth_firebase_token'],
    ['POST', 'auth/change-password', 'routes_auth.php', 'route_auth_change_password'],
    ['POST', 'auth/password-reset/request', 'routes_auth.php', 'route_auth_reset_request'],
    ['POST', 'auth/password-reset/confirm', 'routes_auth.php', 'route_auth_reset_confirm'],
    ['POST', 'accounts', 'routes_accounts.php', 'route_accounts_create'],
    ['DELETE', 'accounts/{id}', 'routes_accounts.php', 'route_accounts_delete'],
    ['POST', 'data/query', 'routes_data.php', 'route_data_query'],
    ['POST', 'data/count', 'routes_data.php', 'route_data_count'],
    ['POST', 'data/get', 'routes_data.php', 'route_data_get'],
    ['POST', 'data/write', 'routes_data.php', 'route_data_write'],
    ['POST', 'counters/next', 'routes_data.php', 'route_counters_next'],
    ['POST', 'support/reply', 'routes_support.php', 'route_support_reply'],
    ['POST', 'files/upload', 'routes_files.php', 'route_files_upload'],
    ['GET', 'files/download', 'routes_files.php', 'route_files_download'],
    ['POST', 'files/delete', 'routes_files.php', 'route_files_delete'],
];
/** مسارات POST بجسم غير JSON (رفع ملفات multipart) — لها حماية CSRF خاصة بها */
$nonJsonPost = ['files/upload'];

$pathMatched = false;
foreach ($routes as [$m, $pattern, $file, $handler]) {
    $regex = '#^' . str_replace('\{id\}', '([A-Za-z0-9_-]{1,64})', preg_quote($pattern, '#')) . '$#';
    if (!preg_match($regex, $route, $params)) continue;
    $pathMatched = true;
    if ($m !== $method) continue;
    // الطلبات اللي تغيّر بيانات: JSON فقط (حماية CSRF) — DELETE بدون جسم مستثنى بالـ SameSite
    if ($method === 'POST' && !in_array($pattern, $nonJsonPost, true)) json_body();
    require_once __DIR__ . '/_lib/' . $file;
    $handler(...array_slice($params, 1));
    exit;
}

fail($pathMatched ? 405 : 404, $pathMatched ? 'الطريقة غير مسموحة.' : 'المسار غير موجود.', $pathMatched ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND');
