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
 *   read     'tenant' (canRead — الافتراضي) · 'owner' (صاحب السجل بحقل ownerField + مدير المنصة) ·
 *            'super' (مدير المنصة) · 'member' (أي عضو) · 'public' (بدون دخول)
 *   write    'member' (canCreate/canUpdate — الافتراضي) · 'owner' (مدير المكتب وحده) ·
 *            'append' (إضافة فقط: سجلات ما تنعدّل) · 'super' · 'custom' (تحقق خاص في store_rules.php) ·
 *            'none' (السيرفر وحده يكتب) · 'publicCreate' (أي أحد ينشئ، والباقي لمدير المنصة)
 *   delete   'soft' (canDelete — الافتراضي) · 'hard' (canHardDelete) · 'super' · 'never' · 'ownerOrSuper'
 *   assigned المحامي المكلّف يشوف المكلّف به فقط (القضايا)
 *   self     حقل المستخدم: صاحب السجل يقرأه حتى لو ما يحمل lawyerId (الإشعارات)
 *   tenantId المستند اللي معرّفه = المكتب يُقرأ حتى قبل وجوده (إعدادات المكتب)
 *   ownerField  حقل صاحب السجل لـ read/delete 'owner' (createdBy، ownerId، userId)
 *   ownerTenant صاحب السجل يشوفه بس داخل مكتبه الحالي (محادثات المساعد)
 *   tenantPrefix المستند {مكتبي}_* يُقرأ بالمعرّف (عدّاد استهلاك الذكاء)
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
    // الدفعة 2 — المنصة وسير العمل الخاص (التحقق في store_rules.php)
    'supportTickets' => ['read' => 'owner', 'ownerField' => 'createdBy', 'write' => 'custom', 'delete' => 'never'],
    'productSuggestions' => ['read' => 'owner', 'ownerField' => 'createdBy', 'write' => 'custom', 'delete' => 'never'],
    'legal_library' => ['read' => 'owner', 'ownerField' => 'ownerId', 'write' => 'custom', 'delete' => 'ownerOrSuper'],
    'ai_conversations' => ['read' => 'owner', 'ownerField' => 'userId', 'ownerTenant' => true, 'write' => 'custom', 'delete' => 'ownerOrSuper'],
    'ai_usage' => ['read' => 'super', 'tenantPrefix' => true, 'write' => 'none', 'delete' => 'never'],
    'platform_status' => ['read' => 'super', 'write' => 'super', 'delete' => 'super'],
    'platform_settings' => ['read' => 'member', 'write' => 'super', 'delete' => 'super'],
    'subscriptionPlans' => ['read' => 'public', 'write' => 'super', 'delete' => 'super'],
    'subscriptionRequests' => ['read' => 'super', 'write' => 'publicCreate', 'delete' => 'super'],
    // الدفعة 3 — ملفات المستخدمين (القراءة: فريق مكتبي + ملفي + مالك مكتبي؛ الكتابة في store_rules.php)
    'users' => ['read' => 'users', 'write' => 'custom', 'delete' => 'custom'],
];

function store_policy(string $root): array {
    return (STORE_ROOTS[$root] ?? []) + ['read' => 'tenant', 'write' => 'member', 'delete' => 'soft', 'assigned' => false,
        'self' => null, 'tenantId' => false, 'ownerField' => null, 'ownerTenant' => false, 'tenantPrefix' => false];
}

/** زائر بلا دخول — يُسمح له فقط بقراءة 'public' وإنشاء 'publicCreate' */
const STORE_ANON = ['id' => '', 'role' => 'ANON', 'lawyer_id' => null, 'status' => 'ACTIVE', 'deleted_at' => null, 'data' => []];

function store_is_anon(array $u): bool {
    return ($u['role'] ?? '') === 'ANON';
}

/** صاحب السجل حسب ownerField */
function store_is_owner(array $u, array $pol, $data): bool {
    $field = $pol['ownerField'];
    return $field !== null && !store_is_anon($u) && is_object($data) && ($data->$field ?? null) === (string) $u['id'];
}

/** شرط SQL: صاحب السجل (حقل self) يقرأه حتى بلا lawyerId — مثل قاعدة الإشعارات */
function store_self_sql(array $pol, array $u, array &$params): string {
    if ($pol['self'] === null) return '';
    $params[] = (string) $u['id'];
    return " OR (lawyer_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(data, '" . store_json_path($pol['self']) . "')) = ?)";
}
/** مجموعات فرعية لها مجموعات رئيسية تحتها مسموحة (cases/{id}/** و clients/{id}/** و supportTickets/{id}/messages) */
const STORE_PARENT_ROOTS = ['cases', 'clients', 'supportTickets'];
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
    if (store_is_anon($u)) store_forbidden();
    $parent = store_row($p['root'], '', (string) $p['root_id']);
    if (is_super_admin($u)) return $parent['lawyer_id'] ?? null;
    // رسائل تذكرة الدعم: لطرفيها فقط (صاحب التذكرة ومدير المنصة) — مو لباقي المكتب
    if (store_policy($p['root'])['read'] === 'owner') {
        if ($parent === null || !store_is_owner($u, store_policy($p['root']), $parent['data'])) store_forbidden();
        return $parent['lawyer_id'];
    }
    if ($parent === null || $parent['lawyer_id'] !== tenant_of($u)
        || ($p['root'] === 'cases' && !store_case_assigned($u, $parent['data']))) {
        fail(403, 'ليس لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    }
    return $parent['lawyer_id'];
}

function store_forbidden(): never {
    fail(403, 'ليس لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
}

/** رفض لغير العضو: الزائر بلا دخول ← 401 (الواجهة تطلب دخول من جديد)، والباقي ← 403 */
function store_require_member(array $u): void {
    if (store_is_anon($u)) fail(401, 'انتهت الجلسة. سجّل الدخول مرة أخرى.', 'UNAUTHENTICATED');
    if (!is_member($u)) store_forbidden();
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
    // القراءة العامة (الباقات) بدون دخول — قبل فحص العضوية
    if ($p !== null && !$p['is_child'] && store_policy($p['root'])['read'] === 'public') {
        $params[] = $p['collection'];
        $params[] = $p['parent_path'];
        return 'collection = ? AND parent_path = ?';
    }
    store_require_member($u);

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
    switch ($pol['read']) {
        case 'member':
            return $base;
        case 'super':
            store_forbidden();
        case 'users':
            // فريق مكتبي، وملفي، وملف مالك المكتب (ما يحمل lawyerId)
            array_push($params, tenant_of($u), tenant_of($u), (string) $u['id']);
            return "$base AND (lawyer_id = ? OR id = ? OR id = ?)";
        case 'owner':
            // صاحب السجل فقط (ولو ownerTenant: داخل مكتبه الحالي)
            $params[] = (string) $u['id'];
            $sql = "$base AND JSON_UNQUOTE(JSON_EXTRACT(data, '" . store_json_path($pol['ownerField']) . "')) = ?";
            if ($pol['ownerTenant']) { $params[] = tenant_of($u); $sql .= ' AND (lawyer_id = ? OR lawyer_id IS NULL)'; }
            return $sql;
    }
    $params[] = tenant_of($u);
    $sql = "$base AND (lawyer_id = ?" . store_self_sql($pol, $u, $params) . ')';
    if ($pol['assigned']) $sql .= ' AND ' . store_case_assigned_sql($u, $params);
    return $sql;
}

/** قراءة سجل رئيسي واحد حسب السياسة (canRead + التكليف + صاحب السجل) */
function store_can_read_root(array $u, array $p, array $row): bool {
    $pol = store_policy($p['root']);
    if ($pol['read'] === 'public') return true;
    if (!is_member($u)) return false;
    if (is_super_admin($u)) return true;
    switch ($pol['read']) {
        case 'member':
            return true;
        case 'users':
            return $row['lawyer_id'] === tenant_of($u) || $p['id'] === tenant_of($u) || $p['id'] === (string) $u['id'];
        case 'super':
            return $pol['tenantPrefix'] && str_starts_with($p['id'], tenant_of($u) . '_');
        case 'owner':
            return store_is_owner($u, $pol, $row['data'])
                && (!$pol['ownerTenant'] || $row['lawyer_id'] === null || $row['lawyer_id'] === tenant_of($u));
    }
    if ($row['lawyer_id'] === tenant_of($u)) return !$pol['assigned'] || store_case_assigned($u, $row['data']);
    if ($pol['self'] !== null && $row['lawyer_id'] === null) {
        $field = $pol['self'];
        return ($row['data']->$field ?? null) === (string) $u['id'];
    }
    // مستند مكتبي بمعرّفي بس بلا lawyerId (سجل قديم) — مو مستند مكتب ثاني يحمل معرّفي
    return $pol['tenantId'] && $p['id'] === tenant_of($u) && $row['lawyer_id'] === null;
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
    $p = store_parse_path($path, true);
    $pol = store_policy($p['root']);
    $public = !$p['is_child'] && $pol['read'] === 'public';
    // أي مستخدم داخل (حتى عميل البوابة اللي مو عضو فريق) يقرأ ملفه وملف مكتبه — مثل قاعدة users/{id}
    $ownProfile = $p['root'] === 'users' && !$p['is_child'] && !store_is_anon($u)
        && ($p['id'] === (string) $u['id'] || $p['id'] === tenant_of($u));
    if ($ownProfile) {
        $row = store_row('users', '', (string) $p['id']);
        return $row === null ? ['exists' => false, 'id' => $p['id'], 'path' => $path]
            : ['exists' => true, 'id' => $p['id'], 'path' => $path, 'data' => $row['data']];
    }
    if (!$public) store_require_member($u);
    if ($p['is_child']) store_require_parent($u, $p);
    $row = store_row($p['collection'], $p['parent_path'], (string) $p['id']);
    if ($row === null) {
        // سجل رئيسي غير موجود: نفس رد «مكتب ثاني» (Firestore كان يرفض الاثنين) — ما نكشف وجود المعرّفات.
        // إلا اللي القواعد تسمح بقراءته قبل وجوده: مستند المكتب نفسه، عدّاد مكتبي، والقراءة العامة/للأعضاء
        $allowedMissing = $public || is_super_admin($u) || $pol['read'] === 'member'
            || ($pol['tenantId'] && $p['id'] === tenant_of($u))
            || ($pol['tenantPrefix'] && str_starts_with($p['id'], tenant_of($u) . '_'));
        if (!$p['is_child'] && !$allowedMissing) store_forbidden();
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
    $p = store_parse_path((string) ($op['path'] ?? ''), true);
    $pol = store_policy($p['root']);
    // الزائر (أو غير العضو) يقدر بس ينشئ سجل في مجموعة 'publicCreate' (طلبات الاشتراك)
    $publicCreate = !$p['is_child'] && $pol['write'] === 'publicCreate' && $type === 'create';
    if (!$publicCreate) store_require_member($u);
    $anon = !is_member($u);
    $super = !$anon && is_super_admin($u);
    $tenant = $anon ? '' : tenant_of($u);
    // رسائل الدعم تنكتب من endpoint الرد وحده (يحدّث التذكرة معها بنفس المعاملة)
    if ($p['is_child'] && $pol['read'] === 'owner') store_forbidden();
    $parentTenant = $p['is_child'] ? store_require_parent($u, $p) : null;

    // مستند معرّفه = المكتب (إعدادات المكتب): ما يكتبه إلا مكتبه — وإلا مكتب ثاني ينشئه قبله
    // ببياناته (اسم، جوال، بيانات بنك تطلع في الفواتير) والمكتب الحقيقي ما يقدر يعدّله
    if ($pol['tenantId'] && !$p['is_child'] && !$super && $p['id'] !== $tenant) store_forbidden();

    $existing = store_row($p['collection'], $p['parent_path'], (string) $p['id'], true);

    // ─── الحذف ───
    if ($type === 'delete') {
        if ($existing === null) return; // Firestore: حذف غير موجود = نجاح
        // سجلات التدقيق ما تنحذف أبداً — ولا حتى مدير المنصة (قيمتها كدليل)
        if (!$p['is_child'] && $pol['delete'] === 'never') store_forbidden();
        if (!$super) {
            if ($p['is_child']) {
                if (!office_writable($u)) store_forbidden();
            } else {
                $ok = match ($pol['delete']) {
                    'hard' => can_hard_delete($u, $existing['lawyer_id']),
                    'super' => false,
                    'ownerOrSuper' => store_is_owner($u, $pol, $existing['data']),
                    'custom' => (function () use ($u, $p, $existing) {
                        require_once __DIR__ . '/store_rules.php';
                        return store_custom_delete($p['root'], $u, $p, $existing);
                    })(),
                    default => can_delete($u, $existing['lawyer_id']),
                };
                if (!$ok || ($pol['assigned'] && !store_case_assigned($u, $existing['data']))) store_forbidden();
            }
        }
        q('DELETE FROM docs WHERE collection = ? AND parent_path = ? AND id = ?', [$p['collection'], $p['parent_path'], $p['id']]);
        // المستندات تحته تنحذف معه — وإلا تظل يتيمة ويقدر مكتب ثاني «يتبناها» بإنشاء سجل بنفس المعرّف
        $self = store_path_of($p);
        q('DELETE FROM docs WHERE parent_path = ? OR parent_path LIKE ?', [$self, store_like_prefix($self)]);
        // حذف ملف مستخدم = حسابه يتعطل وجلساته تنتهي (بيانات الدخول تظل لسجل التدقيق)
        if ($p['root'] === 'users' && !$p['is_child']) {
            q("UPDATE users SET role = 'PENDING', status = 'DISABLED', deleted_at = COALESCE(deleted_at, ?), data = NULL WHERE id = ?", [utc_now(), $p['id']]);
            q('DELETE FROM auth_sessions WHERE user_id = ?', [$p['id']]);
        }
        return;
    }

    // ─── بناء المستند الجديد ───
    $incoming = $op['data'] ?? null;
    if (!is_object($incoming)) fail(400, 'بيانات المستند غير صالحة.', 'BAD_WRITE');
    // سجل ما يحق له يشوفه (مكتب ثاني، أو غير موجود): نفس الرد 403 — ما نكشف المعرّفات
    $seesExisting = $existing !== null && !$anon && ($super || $p['is_child'] || store_can_read_root($u, $p, $existing));
    if ($type === 'create' && $existing !== null) {
        if (!$seesExisting) store_forbidden();
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
    $write = $p['is_child'] ? 'child' : $pol['write'];
    switch ($write) {
        case 'none': // السيرفر وحده يكتب (عدّاد استهلاك الذكاء) — ولا حتى مدير المنصة من الواجهة
            store_forbidden();
        case 'super':
            if (!$super) store_forbidden();
            break;
        case 'publicCreate':
            // أي أحد ينشئ؛ التعديل لمدير المنصة
            if ($existing !== null && !$super) store_forbidden();
            if (!$super) {
                // الطلب الجديد «قيد المراجعة» وصاحبه من الجلسة (ما أحد يعلّق طلباً على مكتب غيره —
                // trial-cleanup يتجاوز المكتب اللي عنده طلب معلّق)، وعدد محدود لكل جهاز
                $new->status = 'pending';
                $new->userId = $anon ? null : (string) $u['id'];
                $ip = client_ip();
                $recent = (int) q('SELECT COUNT(*) FROM login_attempts WHERE email = ? AND ip = ? AND created_at > ?', ['public-create', $ip, utc_now(-3600)])->fetchColumn();
                if ($recent >= 10) fail(429, 'طلبات كثيرة من هذا الجهاز. حاول بعد ساعة.', 'RATE_LIMIT', ['retryAfter' => 3600]);
                q('INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 0)', ['public-create', $ip]);
            }
            break;
        case 'custom':
            require_once __DIR__ . '/store_rules.php';
            $new = store_custom_rule($p['root'], $u, $p, $existing, $new);
            break;
        case 'append':
            // سجلات الإضافة فقط (التدقيق): ما تنعدّل بعد إنشائها — ولا حتى مدير المنصة.
            // ownsIncoming() فقط — السجل يُكتب حتى لو التجربة انتهت (تسجيل الدخول نفسه يكتب تدقيق)
            if ($existing !== null || (!$super && $newTenant !== $tenant)) store_forbidden();
            break;
        default:
            if ($super) break;
            if ($write === 'child') {
                // incomingSameOffice() + officeWritable()
                if ($newTenant !== $tenant || !office_writable($u)) store_forbidden();
            } elseif ($write === 'owner') {
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

    store_put($p, $existing !== null, $new);
    // ملف المستخدم: جدول users (الدور، المكتب، الحالة — اللي تعتمد عليه الصلاحيات) يتحدث فوراً
    if ($p['root'] === 'users' && !$p['is_child']) {
        require_once __DIR__ . '/bridge.php';
        bridge_sync_profile((string) $p['id'], json_decode(json_encode($new), true));
    }
}

/** يكتب المستند (إدراج أو تحديث) بعد التحقق من الحجم */
function store_put(array $p, bool $exists, object $new): void {
    $json = json_encode($new, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    if ($json === false || strlen($json) > STORE_DOC_MAX_BYTES) fail(413, 'السجل أكبر من الحد المسموح.', 'DOC_TOO_LARGE');
    if (!$exists) {
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
