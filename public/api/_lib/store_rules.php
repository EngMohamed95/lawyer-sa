<?php
/**
 * قواعد المجموعات ذات التحقق الخاص (write: 'custom' في STORE_ROOTS) — منقولة من firestore.rules.
 *
 * كل دالة تستقبل السجل الجديد بعد الدمج، وترجعه (ممكن معدّل: السيرفر يضع الأوقات بنفسه بدل
 * request.time)، أو توقف الطلب بـ 403/422. $existing = null عند الإنشاء.
 */

declare(strict_types=1);

function store_custom_rule(string $root, array $u, array $p, ?array $existing, object $new): object {
    return match ($root) {
        'supportTickets' => rule_support_ticket($u, $p, $existing, $new),
        'productSuggestions' => rule_suggestion($u, $existing, $new),
        'legal_library' => rule_legal_library($u, $existing, $new),
        'ai_conversations' => rule_ai_conversation($u, $existing, $new),
        'users' => rule_user($u, $p, $existing, $new),
        default => store_forbidden(),
    };
}

/** حذف بقاعدة خاصة (delete: 'custom') — يرجع true لو مسموح */
function store_custom_delete(string $root, array $u, array $p, array $existing): bool {
    return match ($root) {
        'users' => rule_user_delete($u, $p, $existing),
        default => false,
    };
}

/* ───────────────────────────── ملفات المستخدمين ───────────────────────────── */

/** حقول الاشتراك — يكتبها مدير المنصة (أو التسجيل الذاتي) وحده، ولا يغيّرها مالك المكتب لنفسه */
const SUBSCRIPTION_FIELDS = ['plan', 'planId', 'status', 'subscriptionExpiry', 'subscriptionStart',
    'subscriptionBilling', 'quotaOverrides', 'selfSignup', 'emailVerifiedAt', 'trialEndsAt'];

/** مكتب ملف المستخدم: lawyerId، وإلا هو نفسه (مالك المكتب) */
function rule_profile_tenant(object $d, string $id): string {
    return is_string($d->lawyerId ?? null) && $d->lawyerId !== '' ? $d->lawyerId : $id;
}

/** users/{id} — نفس قاعدة firestore.rules (الترقية الذاتية ممنوعة: الثغرتان V5 و V7) */
function rule_user(array $u, array $p, ?array $existing, object $new): object {
    $me = (string) $u['id'];
    $id = (string) $p['id'];
    if (is_super_admin($u)) return $new;
    $tenant = tenant_of($u);
    $newTenant = rule_profile_tenant($new, $id);

    if ($existing === null) {
        // إنشاء: مالك المكتب لعضو في فريقه، بعد إنشاء حسابه (POST /accounts) بنفس الدور والمكتب
        if (!is_office_owner($u) || ($new->lawyerId ?? null) !== $tenant || !in_array($new->role ?? null, OFFICE_MEMBER_ROLES, true)) store_forbidden();
        $account = q_one('SELECT role, lawyer_id FROM users WHERE id = ?', [$id]);
        if ($account === null || $account['lawyer_id'] !== $tenant || $account['role'] !== $new->role) store_forbidden();
        return $new;
    }

    $old = $existing['data'];
    $changed = rule_changed_keys($old, $new);
    $oldTenant = rule_profile_tenant($old, $id);
    if ($newTenant !== $oldTenant) store_forbidden(); // المكتب ما يتغير

    if (is_office_owner($u) && $oldTenant === $tenant) {
        // المالك لنفسه: كل شي إلا حقول الاشتراك
        if ($id === $me && array_intersect($changed, SUBSCRIPTION_FIELDS)) store_forbidden();
        // تغيير الدور: لعضو غيره (مو مدير منصة) وإلى دور فريق
        if (in_array('role', $changed, true)
            && ($id === $me || ($old->role ?? '') === 'SUPER_ADMIN' || !in_array($new->role ?? null, OFFICE_MEMBER_ROLES, true))) store_forbidden();
        return $new;
    }
    // أي عضو لملفه: البيانات الشخصية فقط
    if ($id !== $me) store_forbidden();
    if (array_intersect($changed, array_merge(['role', 'lawyerId', 'plan', 'status', 'deletedAt'], SUBSCRIPTION_FIELDS))) store_forbidden();
    return $new;
}

/** حذف ملف: مدير المنصة، أو مالك المكتب لعضو فريقه (مو نفسه) */
function rule_user_delete(array $u, array $p, array $existing): bool {
    if (is_super_admin($u)) return true;
    $d = $existing['data'];
    return is_office_owner($u) && $p['id'] !== (string) $u['id']
        && ($d->lawyerId ?? null) === tenant_of($u)
        && in_array($d->role ?? null, OFFICE_MEMBER_ROLES, true);
}

/* ───────────────────────────── أدوات تحقق ───────────────────────────── */

function rule_invalid(string $field): never {
    fail(422, 'بيانات غير صالحة.', 'VALIDATION', ['field' => $field]);
}

/** المفاتيح ضمن القائمة فقط (hasOnly) */
function rule_only_keys(object $d, array $allowed): void {
    foreach (array_keys(get_object_vars($d)) as $k) if (!in_array($k, $allowed, true)) rule_invalid((string) $k);
}

/** نص بطول (بالحروف) بين $min و $max؛ $optional = الحقل ممكن يغيب */
function rule_str(object $d, string $k, int $min, int $max, bool $optional = false): void {
    if (!property_exists($d, $k)) { if ($optional) return; rule_invalid($k); }
    $v = $d->$k;
    if (!is_string($v)) rule_invalid($k);
    $len = ulen($v);
    if ($len < $min || $len > $max) rule_invalid($k);
}

function rule_in(object $d, string $k, array $values): void {
    if (!in_array($d->$k ?? null, $values, true)) rule_invalid($k);
}

/** المفاتيح اللي تغيّرت قيمتها بين نسختين (diff().affectedKeys()) */
function rule_changed_keys(object $old, object $new): array {
    $keys = array_unique(array_merge(array_keys(get_object_vars($old)), array_keys(get_object_vars($new))));
    return array_values(array_filter($keys, fn($k) => json_encode($old->$k ?? null) !== json_encode($new->$k ?? null)
        || property_exists($old, $k) !== property_exists($new, $k)));
}

function rule_now(): string {
    return gmdate('Y-m-d\TH:i:s.v\Z');
}

/* ───────────────────────────── الدعم الفني ───────────────────────────── */

const SUPPORT_CATEGORIES = ['مشكلة تقنية أو عطل في النظام', 'الحساب والصلاحيات', 'الاشتراكات والفواتير والمدفوعات', 'اقتراح وتطوير', 'استفسار عام أو مساعدة'];
const SUPPORT_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'];

/** مرفقات الدعم: حتى 4، كل واحد في supportAttachments/{التذكرة}/{المرسل}/ ونوعه وحجمه مسموح */
function rule_support_attachments($list, string $ticketId, string $uid): void {
    if (!is_array($list) || count($list) > 4) rule_invalid('attachments');
    foreach ($list as $a) {
        if (!is_object($a)) rule_invalid('attachments');
        rule_only_keys($a, ['name', 'path', 'size', 'type']);
        rule_str($a, 'name', 1, 200);
        if (!is_string($a->path ?? null) || !preg_match('#^supportAttachments/' . preg_quote($ticketId, '#') . '/' . preg_quote($uid, '#') . '/[^/]+$#', $a->path)) rule_invalid('attachments');
        if (!is_int($a->size ?? null) || $a->size <= 0 || $a->size > 5_242_880) rule_invalid('attachments');
        if (!in_array($a->type ?? null, ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'], true)) rule_invalid('attachments');
    }
}

function rule_support_ticket(array $u, array $p, ?array $existing, object $new): object {
    $me = (string) $u['id'];
    if ($existing === null) {
        // إنشاء: عضو (مو مدير المنصة)، باسمه ولمكتبه، وبالحالة الابتدائية بالضبط
        if (is_super_admin($u)) store_forbidden();
        rule_only_keys($new, ['subject', 'description', 'category', 'priority', 'status', 'createdBy', 'requesterName', 'lawyerId',
            'createdAt', 'updatedAt', 'lastMessageId', 'lastReplyBy', 'messageCount', 'attachments']);
        if (($new->createdBy ?? null) !== $me || ($new->lawyerId ?? null) !== tenant_of($u)) store_forbidden();
        rule_str($new, 'requesterName', 0, 200);
        rule_str($new, 'subject', 3, 200);
        rule_str($new, 'description', 10, 3000);
        rule_in($new, 'category', SUPPORT_CATEGORIES);
        rule_in($new, 'priority', SUPPORT_PRIORITIES);
        if (($new->status ?? null) !== 'OPEN' || ($new->lastMessageId ?? null) !== '' || ($new->lastReplyBy ?? null) !== ''
            || ($new->messageCount ?? null) !== 1) rule_invalid('status');
        rule_support_attachments($new->attachments ?? [], (string) $p['id'], $me);
        $new->createdAt = $new->updatedAt = rule_now();
        return $new;
    }
    // تعديل: طرفا التذكرة، وتغيير الحالة فقط (الردود من endpoint الرد)
    $super = is_super_admin($u);
    if (!$super && ($existing['data']->createdBy ?? null) !== $me) store_forbidden();
    $changed = array_diff(rule_changed_keys($existing['data'], $new), ['status', 'updatedAt']);
    if ($changed) store_forbidden();
    rule_in($new, 'status', SUPPORT_STATUSES);
    $old = $existing['data']->status ?? '';
    // صاحب التذكرة: يعيد فتح المحلولة/المغلقة، أو يغلق — مدير المنصة: أي حالة
    if (!$super && !(in_array($old, ['RESOLVED', 'CLOSED'], true) && $new->status === 'OPEN') && $new->status !== 'CLOSED') store_forbidden();
    $new->updatedAt = rule_now();
    return $new;
}

/* ───────────────────────────── الاقتراحات ───────────────────────────── */

const SUGGESTION_CATEGORIES = ['واجهة وتجربة المستخدم', 'إدارة القضايا والجلسات', 'الحسابات والتقارير', 'المستندات والعقود', 'الذكاء الاصطناعي', 'ميزة جديدة أخرى'];
const SUGGESTION_STATUSES = ['RECEIVED', 'UNDER_REVIEW', 'PLANNED', 'IMPLEMENTED', 'DECLINED'];

function rule_suggestion(array $u, ?array $existing, object $new): object {
    if ($existing === null) {
        if (is_super_admin($u)) store_forbidden();
        rule_only_keys($new, ['title', 'details', 'category', 'status', 'createdBy', 'requesterName', 'lawyerId', 'adminResponse', 'createdAt', 'updatedAt', 'respondedAt']);
        if (($new->createdBy ?? null) !== (string) $u['id'] || ($new->lawyerId ?? null) !== tenant_of($u)) store_forbidden();
        rule_str($new, 'requesterName', 0, 200);
        rule_str($new, 'title', 3, 200);
        rule_str($new, 'details', 10, 4000);
        rule_in($new, 'category', SUGGESTION_CATEGORIES);
        // respondedAt لازم موجود وقيمته null بالضبط (?? يعامل null كغائب، فنفحص بـ property_exists)
        if (($new->status ?? null) !== 'RECEIVED' || ($new->adminResponse ?? null) !== ''
            || !property_exists($new, 'respondedAt') || $new->respondedAt !== null) rule_invalid('status');
        $new->createdAt = $new->updatedAt = rule_now();
        return $new;
    }
    // الرد والمراجعة لمدير المنصة وحده، وعلى هالحقول فقط
    if (!is_super_admin($u)) store_forbidden();
    if (array_diff(rule_changed_keys($existing['data'], $new), ['status', 'adminResponse', 'updatedAt', 'respondedAt'])) store_forbidden();
    rule_in($new, 'status', SUGGESTION_STATUSES);
    rule_str($new, 'adminResponse', 0, 4000);
    $new->updatedAt = rule_now();
    $new->respondedAt = $new->adminResponse === '' ? null : rule_now();
    return $new;
}

/* ───────────────────────────── المكتبة القانونية ───────────────────────────── */

function rule_legal_library(array $u, ?array $existing, object $new): object {
    $me = (string) $u['id'];
    // ملك صاحبها فقط — ولا مدير المكتب ولا مدير المنصة يكتب فيها
    if (($new->ownerId ?? null) !== $me) store_forbidden();
    if ($existing !== null && ($existing['data']->ownerId ?? null) !== $me) store_forbidden();
    rule_only_keys($new, ['type', 'title', 'number', 'issueDate', 'issuer', 'summary', 'content', 'sourceUrl', 'file', 'ownerId', 'createdAt', 'updatedAt']);
    rule_in($new, 'type', ['REGULATION', 'DECISION', 'CIRCULAR', 'ROYAL_ORDER']);
    rule_str($new, 'title', 1, 300);
    rule_str($new, 'number', 0, 100, true);
    rule_str($new, 'issueDate', 0, 50, true);
    rule_str($new, 'issuer', 0, 200, true);
    rule_str($new, 'summary', 0, 2000, true);
    rule_str($new, 'content', 0, 300000, true);
    rule_str($new, 'sourceUrl', 0, 1000, true);
    $file = $new->file ?? null;
    if ($file !== null) {
        if (!is_object($file)) rule_invalid('file');
        rule_only_keys($file, ['path', 'name', 'size', 'contentType']);
        if (!is_string($file->path ?? null) || !preg_match('#^legalLibrary/' . preg_quote($me, '#') . '/[A-Za-z0-9-]+$#', $file->path)) rule_invalid('file');
        rule_str($file, 'name', 1, 200);
        if (!is_int($file->size ?? null) || $file->size <= 0 || $file->size > 52_428_800) rule_invalid('file');
        rule_in($file, 'contentType', ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
    }
    $new->createdAt = $existing !== null ? ($existing['data']->createdAt ?? rule_now()) : rule_now();
    $new->updatedAt = rule_now();
    return $new;
}

/* ───────────────────────────── محادثات المساعد الذكي ───────────────────────────── */

function rule_ai_conversation(array $u, ?array $existing, object $new): object {
    $me = (string) $u['id'];
    if (($new->userId ?? null) !== $me) store_forbidden();
    if (!is_array($new->messages ?? null)) rule_invalid('messages');
    if ($existing === null) {
        // مكتب المستخدم الحالي (مدير المنصة يحمل "ALL")
        if (!is_super_admin($u) && ($new->lawyerId ?? null) !== tenant_of($u)) store_forbidden();
        return $new;
    }
    $old = $existing['data'];
    if (($old->userId ?? null) !== $me) store_forbidden();
    if (!is_super_admin($u) && $existing['lawyer_id'] !== null && $existing['lawyer_id'] !== tenant_of($u)) store_forbidden();
    // المالك والمكتب ما يتغيرون بعد الإنشاء
    if (json_encode($old->lawyerId ?? null) !== json_encode($new->lawyerId ?? null)) store_forbidden();
    return $new;
}
