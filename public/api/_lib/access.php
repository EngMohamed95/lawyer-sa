<?php
/**
 * طبقة الصلاحيات — نقل مباشر لدوال firestore.rules إلى PHP.
 * أي endpoint يلمس بيانات مكتب لازم يمر من هنا. القاعدة: كل سجل يحمل lawyer_id
 * (المكتب)، والمستخدم ما يشوف/يعدّل إلا سجلات مكتبه، ومدير المنصة يشوف الكل.
 */

declare(strict_types=1);

require_once __DIR__ . '/session.php';

/** الأدوار اللي يقدر مالك المكتب ينشئها لفريقه — نفس القائمة في firestore.rules (users.create) */
const OFFICE_MEMBER_ROLES = ['PARTNER', 'OFFICE_LAWYER', 'CONSULTANT', 'SECRETARY', 'ACCOUNTANT', 'TRAINEE', 'CLIENT'];

function blocked_status(?string $status): bool {
    return in_array($status, ['SUSPENDED', 'DISABLED'], true);
}

function is_super_admin(array $u): bool {
    return ($u['role'] ?? '') === 'SUPER_ADMIN';
}

/** مالك المكتب (myRole() == 'LAWYER' في القواعد) */
function is_office_owner(array $u): bool {
    return ($u['role'] ?? '') === 'LAWYER';
}

/** المكتب: lawyerId للعضو، وid للمالك (الاتفاق في القواعد: lawyerId = uid) */
function tenant_of(array $u): string {
    $lid = $u['lawyer_id'] ?? null;
    return is_string($lid) && $lid !== '' ? $lid : (string) $u['id'];
}

/** صف مالك المكتب — مرة واحدة لكل طلب */
function office_owner_row(string $tenant): ?array {
    static $cache = [];
    if (!array_key_exists($tenant, $cache)) {
        $cache[$tenant] = q_one('SELECT id, role, status, deleted_at, data FROM users WHERE id = ?', [$tenant]);
        if ($cache[$tenant] !== null) {
            $cache[$tenant]['data'] = $cache[$tenant]['data'] !== null ? (json_decode((string) $cache[$tenant]['data'], true) ?: []) : [];
        }
    }
    return $cache[$tenant];
}

/**
 * notSuspended() + officeActive(): الحساب نشط ومكتبه غير معطّل.
 * أشد من النسخة الأولى: حساب بلا ملف شخصي (PENDING) ما يعتبر عضو، ومكتب ما له صف
 * مالك ما يعتبر نشط — نفس القواعد (exists(userPath) و get() على المالك).
 */
function account_active(array $u): bool {
    if (($u['role'] ?? 'PENDING') === 'PENDING') return false;
    if (blocked_status($u['status'] ?? null) || !empty($u['deleted_at'])) return false;
    if (is_super_admin($u)) return true;
    $tenant = tenant_of($u);
    if ($tenant === (string) $u['id']) return true;
    if ($tenant === 'ALL') return false; // 'ALL' لمدير المنصة وحده
    $owner = office_owner_row($tenant);
    return $owner !== null && ($owner['role'] ?? '') === 'LAWYER' && !blocked_status($owner['status'] ?? null);
}

/** member(): داخل، نشط، ومن فريق المكتب (مو عميل بوابة) */
function is_member(array $u): bool {
    return account_active($u) && ($u['role'] ?? '') !== 'CLIENT';
}

function require_member(): array {
    $u = require_user();
    if (!is_member($u)) fail(403, 'ليس لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    return $u;
}

/**
 * officeWritable(): التجربة المجانية انتهت بدون اشتراك ← الكتابة مقفلة على المكتب كله
 * (القراءة تظل). يعتمد على حقول الاشتراك في data لمالك المكتب.
 */
function office_writable(array $u): bool {
    if (is_super_admin($u)) return true;
    $owner = office_owner_row(tenant_of($u));
    $data = $owner['data'] ?? [];
    if (($data['subscriptionBilling'] ?? '') !== 'trial') return true;
    $end = $data['trialEndsAt'] ?? null;
    if ($end === null || $end === '') return true;
    $t = is_numeric($end) ? (int) $end : strtotime((string) $end);
    // تاريخ تالف = مقفل (القاعدة القديمة كانت ترفض)، مو مفتوح
    return $t !== false && $t > time();
}

/* ─── صلاحيات السجلات (المرحلة 2 وما بعدها). $rowTenant = lawyer_id للسجل ─── */

function can_read(array $u, ?string $rowTenant): bool {
    return is_member($u) && (is_super_admin($u) || ($rowTenant !== null && $rowTenant === tenant_of($u)));
}

function can_create(array $u, ?string $incomingTenant): bool {
    return is_member($u) && (is_super_admin($u)
        || ($incomingTenant !== null && $incomingTenant === tenant_of($u) && office_writable($u)));
}

/** التعديل ما يقدر ينقل السجل لمكتب ثاني */
function can_update(array $u, ?string $rowTenant, ?string $incomingTenant): bool {
    return is_member($u) && (is_super_admin($u) || (
        office_writable($u) && $rowTenant !== null && $rowTenant === tenant_of($u) && $incomingTenant === $rowTenant
    ));
}

function can_delete(array $u, ?string $rowTenant): bool {
    return is_member($u) && (is_super_admin($u)
        || ($rowTenant !== null && $rowTenant === tenant_of($u) && office_writable($u)));
}

/** الحذف النهائي داخل المكتب — لمدير المكتب وحده */
function can_hard_delete(array $u, ?string $rowTenant): bool {
    return is_member($u) && (is_super_admin($u)
        || ($rowTenant !== null && $rowTenant === tenant_of($u) && is_office_owner($u) && office_writable($u)));
}
