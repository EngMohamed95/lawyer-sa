<?php
/**
 * مخزن المستندات على MySQL — بديل Firestore للمجموعات اللي انتقلت.
 *
 * الواجهة (src/lib/store.ts) ترسل نفس عمليات Firestore (query/get/write/count) بمسارات
 * مثل "cases" أو "cases/{id}/hearings"، وهنا نطبّق نفس قواعد firestore.rules حرفياً:
 *   - السجل يخص مكتب (lawyerId)، والمستخدم ما يشوف/يكتب إلا مكتبه، ومدير المنصة الكل
 *   - المحامي المكلّف (OFFICE_LAWYER) يشوف قضاياه المكلّف بها فقط
 *   - المجموعات الفرعية ترث حدود السجل الأم (القضية/العميل)
 * أي مجموعة تنتقل لازم تنضاف هنا (STORE_ROOTS) وفي store.ts بنفس الوقت.
 */

declare(strict_types=1);

require_once __DIR__ . '/access.php';

/**
 * المجموعات الرئيسية اللي انتقلت، وسياسة كل وحدة (منقولة من firestore.rules). المفاتيح:
 *   write    'member' (canCreate/canUpdate — الافتراضي) · 'owner' (مدير المكتب وحده) ·
 *            'append' (إضافة فقط: سجلات ما تنعدّل)
 *   delete   'soft' (canDelete — الافتراضي) · 'hard' (canHardDelete) · 'super' · 'never'
 *   assigned المحامي المكلّف يشوف المكلّف به فقط (القضايا)
 *   self     حقل المستخدم: صاحب السجل يقرأه حتى لو ما يحمل lawyerId (الإشعارات)
 *   tenantId المستند اللي معرّفه = المكتب يُقرأ حتى قبل وجوده (إعدادات المكتب)
 */
const STORE_ROOTS = [
    'cases' => ['delete' => 'hard', 'assigned' => true],
    'clients' => ['delete' => 'hard'],
    'tasks' => [],
    // المرحلة 3 — المالية وبيانات المكتب العادية
    'payments' => [], 'expenses' => [], 'contracts' => [], 'invoices' => [], 'receipts' => [],
    'vouchers' => [], 'fee_agreements' => [], 'time_entries' => [], 'appointments' => [],
    'client_messages' => [], 'client_requests' => [], 'template_folders' => [],
    'custom_templates' => [], 'general_memos' => [],
    'notifications' => ['self' => 'userId'],
    'notification_preferences' => ['self' => 'userId'],
    'office_settings' => ['write' => 'owner', 'delete' => 'super', 'tenantId' => true],
    'client_portal_accounts' => ['write' => 'owner', 'delete' => 'hard'],
    'auditLogs' => ['write' => 'append', 'delete' => 'never'],
    'documents_access_log' => ['write' => 'append', 'delete' => 'never'],
];

function store_policy(string $root): array {
    return (STORE_ROOTS[$root] ?? []) + ['write' => 'member', 'delete' => 'soft', 'assigned' => false, 'self' => null, 'tenantId' => false];
}

/** شرط SQL: صاحب السجل (حقل self) يقرأه حتى بلا lawyerId — مثل قاعدة الإشعارات */
function store_self_sql(array $pol, array $u, array &$params): string {
    if ($pol['self'] === null) return '';
    $params[] = (string) $u['id'];
    return " OR (lawyer_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(data, '" . store_json_path($pol['self']) . "')) = ?)";
}
/** مجموعات فرعية لها مجموعات رئيسية تحتها مسموحة (cases/{id}/** و clients/{id}/**) */
const STORE_PARENT_ROOTS = ['cases', 'clients'];
/** استعلامات collectionGroup — كلها مجموعات فرعية تحت cases/clients فقط */
const STORE_GROUPS = ['hearings', 'documents', 'requests', 'memos'];

const STORE_PAGE_MAX = 1000;
const STORE_DOC_MAX_BYTES = 1_048_576; // حد Firestore للمستند

/* ───────────────────────────── المسارات ───────────────────────────── */

/**
 * يفكك مسار مستند أو مجموعة: ['collection', 'parent_path', 'id'|null, 'root', 'root_id'|null]
 * "cases" ← مجموعة رئيسية · "cases/a" ← مستند · "cases/a/hearings" ← مجموعة فرعية · "cases/a/hearings/h" ← مستند فرعي
 */
function store_parse_path(string $path, bool $expectDoc): array {
    $segs = explode('/', trim($path, '/'));
    $n = count($segs);
    // 6 أجزاء كحد أقصى (cases/a/hearings/h/x/y) — parent_path يتسع لها (VARCHAR 400)
    if ($n === 0 || $n > 6 || ($expectDoc ? $n % 2 !== 0 : $n % 2 !== 1)) {
        fail(400, 'مسار غير صالح.', 'BAD_PATH');
    }
    foreach ($segs as $i => $s) {
        $ok = $i % 2 === 0 ? preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,63}$/', $s) : preg_match('/^[A-Za-z0-9_-]{1,64}$/', $s);
        if (!$ok) fail(400, 'مسار غير صالح.', 'BAD_PATH');
    }
    $root = $segs[0];
    if (!isset(STORE_ROOTS[$root])) fail(400, 'هذه البيانات غير متاحة من هذا المسار.', 'NOT_MIGRATED');
    if ($n > 2 && !in_array($root, STORE_PARENT_ROOTS, true)) fail(400, 'مسار غير صالح.', 'BAD_PATH');

    $id = $expectDoc ? $segs[$n - 1] : null;
    $collIndex = $expectDoc ? $n - 2 : $n - 1;
    return [
        'collection' => $segs[$collIndex],
        'parent_path' => implode('/', array_slice($segs, 0, $collIndex)),
        'id' => $id,
        'root' => $root,
        'root_id' => $n >= 2 ? $segs[1] : null,
        'is_child' => $collIndex > 0,
    ];
}

/** "a.b.c" ← '$."a"."b"."c"' — كل جزء بين علامتي اقتباس، فما في حقن في مسار JSON */
function store_json_path(string $field): string {
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){0,9}$/', $field)) {
        fail(400, 'اسم حقل غير صالح.', 'BAD_FIELD', ['field' => $field]);
    }
    return '$' . implode('', array_map(fn($p) => '."' . $p . '"', explode('.', $field)));
}

/* ───────────────────────────── الصلاحيات ───────────────────────────── */

/** caseAssignedToMe(): المحامي المكلّف يشوف قضاياه فقط؛ باقي الأدوار ما يتقيدون */
function store_case_assigned(array $u, $caseData): bool {
    if (($u['role'] ?? '') !== 'OFFICE_LAWYER') return true;
    $me = (string) $u['id'];
    if (($caseData->assignedLawyerId ?? null) === $me) return true;
    $ids = $caseData->assignedLawyerIds ?? [];
    return is_array($ids) && in_array($me, $ids, true);
}

/** شرط SQL مكافئ لـ caseAssignedToMe على صفوف القضايا */
function store_case_assigned_sql(array $u, array &$params, string $col = "data"): string {
    if (($u['role'] ?? '') !== 'OFFICE_LAWYER') return '1=1';
    $params[] = (string) $u['id'];
    $params[] = json_encode((string) $u['id']);
    // نفس شروط store_case_assigned حرفياً: النص نص، والقائمة قائمة (وإلا تظهر القضية في القائمة وترفض عند فتحها)
    return "((JSON_TYPE(JSON_EXTRACT($col, '$.assignedLawyerId')) = 'STRING' AND JSON_UNQUOTE(JSON_EXTRACT($col, '$.assignedLawyerId')) = ?)"
        . " OR (JSON_TYPE(JSON_EXTRACT($col, '$.assignedLawyerIds')) = 'ARRAY' AND JSON_CONTAINS(JSON_EXTRACT($col, '$.assignedLawyerIds'), ?)))";
}

function store_row(string $collection, string $parent, string $id, bool $lock = false): ?array {
    $row = q_one('SELECT data, lawyer_id FROM docs WHERE collection = ? AND parent_path = ? AND id = ?' . ($lock ? ' FOR UPDATE' : ''),
        [$collection, $parent, $id]);
    if ($row === null) return null;
    $row['data'] = json_decode((string) $row['data'], false);
    return $row;
}

/**
 * parentCaseOk() / parentClientOk(): السجل الأم في مكتبي (والقضية مكلّف بها لو محامي مكلّف).
 * يرجع lawyer_id للأم (يُستخدم كمكتب افتراضي للمستند الفرعي)، أو يوقف الطلب بـ 403.
 */
function store_require_parent(array $u, array $p): ?string {
    $parent = store_row($p['root'], '', (string) $p['root_id']);
    if (is_super_admin($u)) return $parent['lawyer_id'] ?? null;
    if ($parent === null || $parent['lawyer_id'] !== tenant_of($u)
        || ($p['root'] === 'cases' && !store_case_assigned($u, $parent['data']))) {
        fail(403, 'ليس لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    }
    return $parent['lawyer_id'];
}

function store_forbidden(): never {
    fail(403, 'ليس لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
}

/* ───────────────────────────── الاستعلام ───────────────────────────── */

const STORE_OPS = ['==', '!=', '<', '<=', '>', '>=', 'in', 'not-in', 'array-contains', 'array-contains-any'];
const STORE_NUMERIC_TYPES = "('INTEGER','DOUBLE','DECIMAL','UNSIGNED INTEGER')";

/**
 * مقارنة قيمة JSON بقيمة PHP بنفس قواعد Firestore: الأنواع ما تختلط (نص ≠ رقم)،
 * والحقل المفقود ما يطابق شي. بدون CAST(.. AS JSON) — يشتغل على MySQL و MariaDB.
 */
function store_compare_sql(string $expr, string $op, $value, array &$params): string {
    $sqlOp = $op === '==' ? '=' : ($op === '!=' ? '<>' : $op);
    if (is_string($value)) {
        $params[] = $value;
        return "(JSON_TYPE($expr) = 'STRING' AND JSON_UNQUOTE($expr) $sqlOp ?)";
    }
    if (is_int($value) || is_float($value)) {
        $params[] = $value;
        return "(JSON_TYPE($expr) IN " . STORE_NUMERIC_TYPES . " AND (JSON_UNQUOTE($expr) + 0) $sqlOp ?)";
    }
    if (is_bool($value)) {
        if (!in_array($op, ['==', '!='], true)) fail(400, 'مقارنة غير مدعومة.', 'BAD_QUERY');
        $params[] = $value ? 'true' : 'false';
        return "(JSON_TYPE($expr) = 'BOOLEAN' AND JSON_UNQUOTE($expr) $sqlOp ?)";
    }
    if ($value === null) {
        if ($op === '==') return "(JSON_TYPE($expr) = 'NULL')";
        if ($op === '!=') return "(JSON_TYPE($expr) IS NOT NULL AND JSON_TYPE($expr) <> 'NULL')";
    }
    fail(400, 'نوع قيمة غير مدعوم في الاستعلام.', 'BAD_QUERY');
}

/**
 * يبني WHERE من شروط الواجهة (مدمجة بـ AND). كل عنصر إما شرط [field, op, value]،
 * أو {"or": [...]} / {"and": [...]} (and()/or() في Firestore) — متداخلة لعمق 3.
 */
function store_where_sql(array $where, array &$params): string {
    $budget = 30; // مجموع الشروط في الاستعلام كله
    $parts = [];
    foreach ($where as $w) $parts[] = store_pred_sql($w, $params, 0, $budget);
    return $parts ? implode(' AND ', $parts) : '1=1';
}

function store_pred_sql($w, array &$params, int $depth, int &$budget): string {
    if (--$budget < 0) fail(400, 'شروط كثيرة.', 'BAD_QUERY');
    if (is_array($w) && (isset($w['or']) || isset($w['and'])) && count($w) === 1) {
        $kind = isset($w['or']) ? 'or' : 'and';
        $children = $w[$kind];
        if ($depth >= 3 || !is_array($children) || count($children) === 0) fail(400, 'شرط استعلام غير صالح.', 'BAD_QUERY');
        // حلقة عادية مو fn(): الدوال المختصرة تاخذ نسخة من $params فتضيع القيم المضافة
        $sql = [];
        foreach (array_values($children) as $c) $sql[] = store_pred_sql($c, $params, $depth + 1, $budget);
        return '(' . implode($kind === 'or' ? ' OR ' : ' AND ', $sql) . ')';
    }
    return store_cond_sql($w, $params);
}

/** شرط واحد [field, op, value]. الحقول المفهرسة تستخدم أعمدتها، والباقي مقارنة JSON مع النوع */
function store_cond_sql($w, array &$params): string {
    $indexed = ['lawyerId' => 'lawyer_id', 'caseId' => 'case_id', 'clientId' => 'client_id'];
    if (!is_array($w) || count($w) !== 3 || !array_is_list($w) || !is_string($w[0]) || !in_array($w[1], STORE_OPS, true)) {
        fail(400, 'شرط استعلام غير صالح.', 'BAD_QUERY');
    }
    [$field, $op, $value] = $w;
    $expr = "JSON_EXTRACT(data, '" . store_json_path($field) . "')";

    if (in_array($op, ['in', 'not-in', 'array-contains-any'], true)) {
        if (!is_array($value) || count($value) === 0 || count($value) > 30) fail(400, 'قائمة القيم غير صالحة.', 'BAD_QUERY');
    }
    if ($op === '==' && isset($indexed[$field]) && is_string($value)) {
        $params[] = $value;
        return $indexed[$field] . ' = ?';
    }
    if ($op === 'in' && isset($indexed[$field]) && count(array_filter($value, 'is_string')) === count($value)) {
        array_push($params, ...$value);
        return $indexed[$field] . ' IN (' . implode(',', array_fill(0, count($value), '?')) . ')';
    }
    if (in_array($op, ['==', '!=', '<', '<=', '>', '>='], true)) {
        return store_compare_sql($expr, $op, $value, $params);
    }
    if ($op === 'in' || $op === 'not-in') {
        $ors = [];
        foreach ($value as $v) $ors[] = store_compare_sql($expr, '==', $v, $params);
        // not-in: الحقل لازم يكون موجود وغير null (مثل Firestore)
        return $op === 'in' ? '(' . implode(' OR ', $ors) . ')'
            : "(JSON_TYPE($expr) IS NOT NULL AND JSON_TYPE($expr) <> 'NULL' AND NOT (" . implode(' OR ', $ors) . '))';
    }
    // array-contains(-any): الحقل لازم قائمة، والقيمة عنصر كامل فيها (مو جزء منه)
    $values = $op === 'array-contains' ? [$value] : $value;
    $ors = [];
    foreach ($values as $v) {
        if (!is_scalar($v)) fail(400, 'نوع قيمة غير مدعوم في الاستعلام.', 'BAD_QUERY');
        $ors[] = "JSON_CONTAINS($expr, ?)";
        $params[] = json_encode($v, JSON_UNESCAPED_UNICODE);
    }
    return "(JSON_TYPE($expr) = 'ARRAY' AND (" . implode(' OR ', $ors) . '))';
}

/**
 * ترتيب بنفس ترتيب أنواع Firestore (null ← منطقي ← أرقام ← نصوص)، والأرقام كأرقام
 * (MariaDB يرتب JSON كنص فيصير "10" قبل "9" لو ما حوّلناها).
 */
function store_order_sql(array $orderBy): string {
    if (count($orderBy) > 3) fail(400, 'ترتيب غير صالح.', 'BAD_QUERY');
    $parts = [];
    foreach ($orderBy as $o) {
        if (!is_array($o) || !is_string($o[0] ?? null) || !in_array($o[1] ?? 'asc', ['asc', 'desc'], true)) fail(400, 'ترتيب غير صالح.', 'BAD_QUERY');
        $e = "JSON_EXTRACT(data, '" . store_json_path($o[0]) . "')";
        $dir = strtoupper($o[1] ?? 'asc');
        $parts[] = "CASE WHEN JSON_TYPE($e) IS NULL THEN 0 WHEN JSON_TYPE($e) = 'NULL' THEN 1 WHEN JSON_TYPE($e) = 'BOOLEAN' THEN 2"
            . " WHEN JSON_TYPE($e) IN " . STORE_NUMERIC_TYPES . " THEN 3 WHEN JSON_TYPE($e) = 'STRING' THEN 4 ELSE 5 END $dir";
        $parts[] = "CASE WHEN JSON_TYPE($e) IN " . STORE_NUMERIC_TYPES . " THEN JSON_UNQUOTE($e) + 0 END $dir";
        $parts[] = "CASE WHEN JSON_TYPE($e) IN ('STRING','BOOLEAN') THEN JSON_UNQUOTE($e) END $dir";
    }
    // ترتيب ثابت بين الصفحات
    $parts[] = 'parent_path ASC, id ASC';
    return implode(', ', $parts);
}

/**
 * الحد الأمني لكل استعلام: يرجع [WHERE, params]. هنا تنطبق قواعد القراءة.
 * $p من store_parse_path (مجموعة)، أو null لاستعلام collectionGroup ($group = الاسم).
 */
function store_scope(array $u, ?array $p, ?string $group, array &$params): string {
    if (!is_member($u)) store_forbidden();

    if ($group !== null) {
        if (!in_array($group, STORE_GROUPS, true)) fail(400, 'هذه البيانات غير متاحة من هذا المسار.', 'NOT_MIGRATED');
        $params[] = $group;
        // كل المستندات الفرعية تحت cases/ أو clients/ فقط
        $base = "collection = ? AND parent_path <> '' AND (parent_path LIKE 'cases/%' OR parent_path LIKE 'clients/%')";
        if (is_super_admin($u)) return $base;
        // كل مكتب يستعلم مستنداته الفرعية دفعة وحدة (بدل طلب لكل قضية) — المستند الفرعي يحمل
        // lawyer_id مكتب أمه دائماً (store_apply + migrate_store يضمنون ذلك)
        $params[] = tenant_of($u);
        $sql = "$base AND lawyer_id = ?";
        if (($u['role'] ?? '') === 'OFFICE_LAWYER') {
            // المحامي المكلّف: تحت القضايا المكلّف بها فقط (وتحت العملاء — مثل القواعد المتداخلة)
            $params[] = tenant_of($u);
            $assigned = store_case_assigned_sql($u, $params, 'c.data');
            $sql .= " AND (parent_path LIKE 'clients/%' OR parent_path IN (SELECT CONCAT('cases/', c.id) FROM docs c"
                . " WHERE c.collection = 'cases' AND c.parent_path = '' AND c.lawyer_id = ? AND " . $assigned . '))';
        }
        return $sql;
    }

    $params[] = $p['collection'];
    $params[] = $p['parent_path'];
    $base = 'collection = ? AND parent_path = ?';
    if ($p['is_child']) {
        store_require_parent($u, $p);
        return $base;
    }
    if (is_super_admin($u)) return $base;
    $pol = store_policy($p['root']);
    $params[] = tenant_of($u);
    $sql = "$base AND (lawyer_id = ?" . store_self_sql($pol, $u, $params) . ')';
    if ($pol['assigned']) $sql .= ' AND ' . store_case_assigned_sql($u, $params);
    return $sql;
}

/** قراءة سجل رئيسي واحد حسب السياسة (canRead + التكليف + صاحب السجل) */
function store_can_read_root(array $u, array $p, array $row): bool {
    if (is_super_admin($u)) return true;
    $pol = store_policy($p['root']);
    if ($row['lawyer_id'] === tenant_of($u)) return !$pol['assigned'] || store_case_assigned($u, $row['data']);
    if ($pol['self'] !== null && $row['lawyer_id'] === null) {
        $field = $pol['self'];
        return ($row['data']->$field ?? null) === (string) $u['id'];
    }
    return $pol['tenantId'] && $p['id'] === tenant_of($u);
}

function store_doc_out(array $row): array {
    $path = ($row['parent_path'] !== '' ? $row['parent_path'] . '/' : '') . $row['collection'] . '/' . $row['id'];
    return ['path' => $path, 'id' => $row['id'], 'data' => json_decode((string) $row['data'], false)];
}

function store_query(array $u, array $req): array {
    $group = isset($req['group']) && $req['group'] !== null ? (string) $req['group'] : null;
    $p = $group === null ? store_parse_path((string) ($req['path'] ?? ''), false) : null;
    $params = [];
    $scope = store_scope($u, $p, $group, $params);
    $where = store_where_sql(is_array($req['where'] ?? null) ? $req['where'] : [], $params);
    $order = store_order_sql(is_array($req['orderBy'] ?? null) ? $req['orderBy'] : []);
    $limit = max(1, min(STORE_PAGE_MAX, (int) ($req['limit'] ?? STORE_PAGE_MAX)));
    $offset = max(0, (int) ($req['offset'] ?? 0));

    // نطلب صف زيادة عشان نعرف هل في صفحة بعدها
    $rows = q("SELECT collection, parent_path, id, data FROM docs WHERE $scope AND $where ORDER BY $order LIMIT " . ($limit + 1) . " OFFSET $offset", $params)->fetchAll();
    $hasMore = count($rows) > $limit;
    return ['docs' => array_map('store_doc_out', array_slice($rows, 0, $limit)), 'hasMore' => $hasMore];
}

function store_count(array $u, array $req): int {
    $group = isset($req['group']) && $req['group'] !== null ? (string) $req['group'] : null;
    $p = $group === null ? store_parse_path((string) ($req['path'] ?? ''), false) : null;
    $params = [];
    $scope = store_scope($u, $p, $group, $params);
    $where = store_where_sql(is_array($req['where'] ?? null) ? $req['where'] : [], $params);
    return (int) q("SELECT COUNT(*) FROM docs WHERE $scope AND $where", $params)->fetchColumn();
}

function store_get(array $u, string $path): array {
    if (!is_member($u)) store_forbidden();
    $p = store_parse_path($path, true);
    if ($p['is_child']) store_require_parent($u, $p);
    $row = store_row($p['collection'], $p['parent_path'], (string) $p['id']);
    if ($row === null) {
        // سجل رئيسي غير موجود: نفس رد «مكتب ثاني» (Firestore كان يرفض الاثنين) — ما نكشف وجود المعرّفات.
        // إلا مستند المكتب نفسه (إعدادات المكتب قبل أول حفظ)
        $ownTenantDoc = store_policy($p['root'])['tenantId'] && $p['id'] === tenant_of($u);
        if (!$p['is_child'] && !is_super_admin($u) && !$ownTenantDoc) store_forbidden();
        return ['exists' => false, 'id' => $p['id'], 'path' => $path];
    }
    if (!$p['is_child'] && !store_can_read_root($u, $p, $row)) store_forbidden();
    return ['exists' => true, 'id' => $p['id'], 'path' => $path, 'data' => $row['data']];
}

/* ───────────────────────────── الكتابة ───────────────────────────── */

/** المسار الكامل لمستند من نتيجة store_parse_path */
function store_path_of(array $p): string {
    return ($p['parent_path'] !== '' ? $p['parent_path'] . '/' : '') . $p['collection'] . '/' . $p['id'];
}

/** "cases/a" ← "cases/a/%" لـ LIKE مع تهريب % و _ (المعرّفات فيها _) */
function store_like_prefix(string $path): string {
    return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $path) . '/%';
}

/** نسخ عميق لـ stdClass/مصفوفات */
function store_clone($v) {
    return json_decode(json_encode($v), false);
}

/** يضبط قيمة على مسار "a.b.c" داخل كائن، وينشئ الكائنات الوسيطة */
function store_set_path(object $obj, string $field, $value): void {
    store_json_path($field); // تحقق من الاسم
    $parts = explode('.', $field);
    $last = array_pop($parts);
    $cur = $obj;
    foreach ($parts as $k) {
        if (!isset($cur->$k) || !is_object($cur->$k)) $cur->$k = new stdClass();
        $cur = $cur->$k;
    }
    $cur->$last = $value;
}

function store_unset_path(object $obj, string $field): void {
    store_json_path($field);
    $parts = explode('.', $field);
    $last = array_pop($parts);
    $cur = $obj;
    foreach ($parts as $k) {
        if (!isset($cur->$k) || !is_object($cur->$k)) return;
        $cur = $cur->$k;
    }
    unset($cur->$last);
}

/** دمج set(..., {merge: true}): الكائنات تندمج بعمق، والباقي يُستبدل */
function store_deep_merge(object $base, object $patch): object {
    foreach (get_object_vars($patch) as $k => $v) {
        $base->$k = is_object($v) && isset($base->$k) && is_object($base->$k) ? store_deep_merge($base->$k, $v) : $v;
    }
    return $base;
}

/**
 * يطبّق عملية كتابة واحدة داخل معاملة. op:
 *   set    {path, data, merge?}     — استبدال، أو دمج عميق مع merge
 *   update {path, data, deletes?}   — data مفاتيحها مسارات "a.b"؛ deletes حقول تنحذف. لازم المستند موجود
 *   delete {path}
 *   create {path, data}             — addDoc: لازم المستند ما يكون موجود
 */
function store_apply(array $u, array $op): void {
    $type = $op['op'] ?? '';
    if (!in_array($type, ['set', 'update', 'delete', 'create'], true)) fail(400, 'عملية غير صالحة.', 'BAD_WRITE');
    if (!is_member($u)) store_forbidden();
    $p = store_parse_path((string) ($op['path'] ?? ''), true);
    $super = is_super_admin($u);
    $tenant = tenant_of($u);
    $parentTenant = $p['is_child'] ? store_require_parent($u, $p) : null;

    $existing = store_row($p['collection'], $p['parent_path'], (string) $p['id'], true);

    // ─── الحذف ───
    if ($type === 'delete') {
        if ($existing === null) return; // Firestore: حذف غير موجود = نجاح
        $pol = store_policy($p['root']);
        // سجلات التدقيق ما تنحذف أبداً — ولا حتى مدير المنصة (قيمتها كدليل)
        if (!$p['is_child'] && $pol['delete'] === 'never') store_forbidden();
        if (!$super) {
            if ($p['is_child']) {
                if (!office_writable($u)) store_forbidden();
            } else {
                $ok = match ($pol['delete']) {
                    'hard' => can_hard_delete($u, $existing['lawyer_id']),
                    'super' => false,
                    default => can_delete($u, $existing['lawyer_id']),
                };
                if (!$ok || ($pol['assigned'] && !store_case_assigned($u, $existing['data']))) store_forbidden();
            }
        }
        q('DELETE FROM docs WHERE collection = ? AND parent_path = ? AND id = ?', [$p['collection'], $p['parent_path'], $p['id']]);
        // المستندات تحته تنحذف معه — وإلا تظل يتيمة ويقدر مكتب ثاني «يتبناها» بإنشاء سجل بنفس المعرّف
        $self = store_path_of($p);
        q('DELETE FROM docs WHERE parent_path = ? OR parent_path LIKE ?', [$self, store_like_prefix($self)]);
        return;
    }

    // ─── بناء المستند الجديد ───
    $incoming = $op['data'] ?? null;
    if (!is_object($incoming)) fail(400, 'بيانات المستند غير صالحة.', 'BAD_WRITE');
    // سجل مكتب ثاني (أو غير موجود لمن ما يحق له): نفس الرد 403 — ما نكشف المعرّفات
    $ownsExisting = $existing !== null && ($super || $p['is_child'] || $existing['lawyer_id'] === $tenant);
    if ($type === 'create' && $existing !== null) {
        if (!$ownsExisting) store_forbidden();
        fail(409, 'السجل موجود مسبقاً.', 'ALREADY_EXISTS');
    }
    if ($type === 'update' && $existing === null) {
        if (!$super && !$p['is_child']) store_forbidden();
        fail(404, 'السجل غير موجود.', 'NOT_FOUND');
    }

    if ($type === 'update') {
        $new = store_clone($existing['data']);
        foreach (get_object_vars($incoming) as $field => $value) store_set_path($new, (string) $field, $value);
        foreach ((array) ($op['deletes'] ?? []) as $field) store_unset_path($new, (string) $field);
    } elseif ($type === 'set' && !empty($op['merge']) && $existing !== null) {
        $new = store_deep_merge(store_clone($existing['data']), $incoming);
        foreach ((array) ($op['deletes'] ?? []) as $field) store_unset_path($new, (string) $field);
    } else {
        $new = $incoming;
    }

    // المستند الفرعي بلا lawyerId ياخذ مكتب الأم — عشان يظهر في استعلامات المكتب (collectionGroup)
    if ($p['is_child'] && !isset($new->lawyerId) && $parentTenant !== null) $new->lawyerId = $parentTenant;
    $newTenant = isset($new->lawyerId) && is_string($new->lawyerId) ? $new->lawyerId : null;

    // ─── صلاحيات الإنشاء/التعديل ───
    $pol = store_policy($p['root']);
    // سجلات الإضافة فقط (التدقيق): ما تنعدّل بعد إنشائها — ولا حتى مدير المنصة
    if (!$p['is_child'] && $pol['write'] === 'append' && $existing !== null) store_forbidden();
    if (!$super) {
        if ($p['is_child']) {
            // incomingSameOffice() + officeWritable()
            if ($newTenant !== $tenant || !office_writable($u)) store_forbidden();
        } elseif ($pol['write'] === 'append') {
            // ownsIncoming() فقط — السجل يُكتب حتى لو التجربة انتهت (تسجيل الدخول نفسه يكتب تدقيق)
            if ($newTenant !== $tenant) store_forbidden();
        } elseif ($pol['write'] === 'owner') {
            // مدير المكتب وحده، ولمكتبه (ولو السجل موجود: لازم يكون لمكتبه أصلاً)
            if (!is_office_owner($u) || $newTenant !== $tenant || ($existing !== null && $existing['lawyer_id'] !== $tenant)) store_forbidden();
        } elseif ($existing === null) {
            if (!can_create($u, $newTenant)) store_forbidden();
            // سجل رئيسي جديد فوق مستندات قديمة لمكتب ثاني بنفس المسار ← مرفوض (ما يتبناها)
            $self = store_path_of($p);
            if (q_one('SELECT 1 FROM docs WHERE (parent_path = ? OR parent_path LIKE ?) AND (lawyer_id IS NULL OR lawyer_id <> ?) LIMIT 1',
                [$self, store_like_prefix($self), (string) $newTenant]) !== null) store_forbidden();
        } else {
            if (!can_update($u, $existing['lawyer_id'], $newTenant)) store_forbidden();
            if ($pol['assigned'] && !store_case_assigned($u, $existing['data'])) store_forbidden();
        }
    }

    $json = json_encode($new, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    if ($json === false || strlen($json) > STORE_DOC_MAX_BYTES) fail(413, 'السجل أكبر من الحد المسموح.', 'DOC_TOO_LARGE');
    if ($existing === null) {
        q('INSERT INTO docs (collection, parent_path, id, data) VALUES (?, ?, ?, ?)', [$p['collection'], $p['parent_path'], $p['id'], $json]);
    } else {
        q('UPDATE docs SET data = ? WHERE collection = ? AND parent_path = ? AND id = ?', [$json, $p['collection'], $p['parent_path'], $p['id']]);
    }
}

/** دفعة عمليات ذرّية (writeBatch) — كلها تنجح أو ولا وحدة */
function store_write(array $u, array $ops): void {
    if (count($ops) === 0) return;
    if (count($ops) > 500) fail(400, 'عمليات كثيرة في دفعة واحدة.', 'BAD_WRITE'); // حد Firestore
    $pdo = db();
    $pdo->beginTransaction();
    // fail() ينهي الطلب بـ exit داخل المعاملة — نتراجع صراحة بدل الاعتماد على إغلاق الاتصال
    register_shutdown_function(function () use ($pdo): void { if ($pdo->inTransaction()) $pdo->rollBack(); });
    try {
        foreach ($ops as $op) store_apply($u, (array) $op);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
