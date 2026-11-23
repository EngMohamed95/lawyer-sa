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

/**
 * مستخدم طلبات البيانات: العضو بحالته الحالية، أو الزائر (STORE_ANON) لو ما في دخول.
 * store.php يسمح للزائر فقط بقراءة 'public' (الباقات) وإنشاء 'publicCreate' (طلبات الاشتراك).
 */
function data_user(): array {
    $session = session_user();
    if ($session === null) return STORE_ANON;
    bridge_refresh_if_stale((string) $session['id']);
    return load_user((string) $session['id']);
}

function route_data_query(): void {
    $u = data_user();
    respond(200, store_query($u, data_query_req(data_body())));
}

function route_data_count(): void {
    $u = data_user();
    respond(200, ['count' => store_count($u, data_query_req(data_body()))]);
}

function route_data_get(): void {
    $u = data_user();
    $b = data_body();
    respond(200, store_get($u, (string) ($b->path ?? '')));
}

/** أنواع الترقيم — تطابق PREFIX في src/lib/billing.ts + العقود (src/lib/contracts.ts) */
const COUNTER_SCOPES = ['invoices', 'receipts', 'vouchers', 'fee_agreements', 'contracts'];

/**
 * الرقم التسلسلي التالي لمكتب/نوع/سنة — بديل runTransaction على counters في Firestore.
 * قفل الصف (FOR UPDATE) داخل معاملة يضمن عدم التكرار حتى مع طلبين بنفس اللحظة.
 * المستند counters/{lawyerId}_{scope}_{year} بنفس شكل Firestore (فالقيم المنقولة تكمل منها).
 */
function route_counters_next(): void {
    $u = require_fresh_member();
    $b = json_body();
    $scope = (string) ($b['scope'] ?? '');
    $year = (int) ($b['year'] ?? 0);
    if (!in_array($scope, COUNTER_SCOPES, true)) fail(422, 'نوع الترقيم غير صحيح.', 'VALIDATION', ['field' => 'scope']);
    // سنة الجهاز (قد تسبق UTC بساعات حول رأس السنة) — نقبل ±1 فقط
    $utcYear = (int) gmdate('Y');
    if ($year < $utcYear - 1 || $year > $utcYear + 1) fail(422, 'السنة غير صحيحة.', 'VALIDATION', ['field' => 'year']);

    // canCreate: مكتب المستخدم، والكتابة مفتوحة (التجربة ما انتهت). مدير المنصة يحدد المكتب
    $tenant = is_super_admin($u) ? (string) ($b['lawyerId'] ?? '') : tenant_of($u);
    if ($tenant === '' || $tenant === 'ALL' || !can_create($u, $tenant)) store_forbidden();

    $id = "{$tenant}_{$scope}_{$year}";
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) fail(422, 'معرّف المكتب غير صالح.', 'VALIDATION');
    $pdo = db();
    for ($attempt = 0; ; $attempt++) {
        $pdo->beginTransaction();
        try {
            $row = q_one("SELECT data FROM docs WHERE collection = 'counters' AND parent_path = '' AND id = ? FOR UPDATE", [$id]);
            $current = $row !== null ? (int) (json_decode((string) $row['data'], true)['value'] ?? 0) : 0;
            $next = $current + 1;
            $data = json_encode(['lawyerId' => $tenant, 'scope' => $scope, 'year' => $year, 'value' => $next]);
            if ($row === null) {
                q("INSERT INTO docs (collection, parent_path, id, data) VALUES ('counters', '', ?, ?)", [$id, $data]);
            } else {
                q("UPDATE docs SET data = ? WHERE collection = 'counters' AND parent_path = '' AND id = ?", [$data, $id]);
            }
            $pdo->commit();
            respond(200, ['value' => $next]);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            // أول رقم في السنة من جهازين بنفس اللحظة: واحد يكسب الإدراج، والثاني يعيد ويلقى الصف
            if ($e->getCode() === '23000' && $attempt < 3) continue;
            throw $e;
        }
    }
}

function route_data_write(): void {
    $u = data_user();
    $b = data_body();
    $ops = $b->ops ?? null;
    if (!is_array($ops)) fail(400, 'صيغة الطلب غير صحيحة.', 'BAD_REQUEST');
    store_write($u, array_map(fn($o) => is_object($o) ? (array) $o : [], $ops));
    respond(200, ['ok' => true]);
}
