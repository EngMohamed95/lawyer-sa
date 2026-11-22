<?php
/**
 * /api/v1/data/* — عمليات مخزن المستندات (store.php) للواجهة (src/lib/store.ts).
 */

declare(strict_types=1);

require_once __DIR__ . '/store.php';
require_once __DIR__ . '/bridge.php';
require_once __DIR__ . '/routes_auth.php';

/** العضو بدوره وحالته الحالية (مو نسخة آخر دخول) — كل طلبات البيانات تمر من هنا */
function require_fresh_member(): array {
    $u = require_user();
    bridge_refresh_if_stale((string) $u['id']);
    $u = load_user((string) $u['id']);
    if (!is_member($u)) store_forbidden();
    return $u;
}

/**
 * الجسم ككائنات (مو مصفوفات): json_body() يحوّل {} إلى [] وهذا يخرب الخرائط الفاضية
 * في المستندات. نقرأ نفس الجسم مرة ثانية ككائنات.
 */
function data_body(): object {
    json_body(); // تحقق نوع المحتوى والحجم
    $decoded = json_decode((string) file_get_contents('php://input'), false, 64);
    if (!is_object($decoded)) fail(400, 'صيغة الطلب غير صحيحة.', 'BAD_REQUEST');
    return $decoded;
}

/** شروط/ترتيب الاستعلام كمصفوفات عادية (القيم ممكن تكون كائنات — نحوّلها لمصفوفات للمقارنة) */
function data_query_req(object $b): array {
    return json_decode(json_encode($b), true);
}

function route_data_query(): void {
    $u = require_fresh_member();
    respond(200, store_query($u, data_query_req(data_body())));
}

function route_data_count(): void {
    $u = require_fresh_member();
    respond(200, ['count' => store_count($u, data_query_req(data_body()))]);
}

function route_data_get(): void {
    $u = require_fresh_member();
    $b = data_body();
    respond(200, store_get($u, (string) ($b->path ?? '')));
}

function route_data_write(): void {
    $u = require_fresh_member();
    $b = data_body();
    $ops = $b->ops ?? null;
    if (!is_array($ops)) fail(400, 'صيغة الطلب غير صحيحة.', 'BAD_REQUEST');
    store_write($u, array_map(fn($o) => is_object($o) ? (array) $o : [], $ops));
    respond(200, ['ok' => true]);
}
