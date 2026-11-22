<?php
/**
 * /api/v1/accounts — إنشاء حسابات الفريق ومديري المنصة.
 * يحل محل createUserWithEmailAndPassword على تطبيق Firebase ثانوي في الواجهة.
 *
 * المرحلة 1: هنا ننشئ بيانات الدخول فقط، والواجهة تكتب مستند users/{id} في Firestore
 * كما كانت (firestore.rules تتحقق منه). لو فشلت كتابة المستند، الواجهة تحذف الحساب
 * بـ DELETE /accounts/{id} عشان البريد ما يظل محجوز.
 */

declare(strict_types=1);

require_once __DIR__ . '/access.php';
require_once __DIR__ . '/bridge.php';
require_once __DIR__ . '/routes_auth.php';

/** المستدعي بحالته الحالية في Firestore — مو النسخة المخزنة من آخر دخول */
function fresh_caller(): array {
    $u = require_user();
    bridge_sync_profile((string) $u['id'], bridge_profile((string) $u['id']));
    $u = load_user((string) $u['id']);
    if (!is_member($u)) fail(403, 'ليس لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    return $u;
}

function route_accounts_create(): void {
    $caller = fresh_caller();
    $email = normalize_email(body_str('email', 191));
    $password = body_password();
    assert_new_password($password);
    $name = body_str('name', 255, false);
    $role = body_str('role', 32);

    if (is_super_admin($caller)) {
        // مدير المنصة: مكاتب جديدة، مديرين، أو عضو في مكتب محدد
        if ($role === 'SUPER_ADMIN') $lawyerId = 'ALL';
        elseif ($role === 'LAWYER') $lawyerId = null;
        elseif (in_array($role, OFFICE_MEMBER_ROLES, true)) {
            $lawyerId = body_str('lawyerId', 64);
            $office = q_one('SELECT role FROM users WHERE id = ?', [$lawyerId]);
            if ($office === null || $office['role'] !== 'LAWYER') fail(422, 'المكتب غير موجود.', 'VALIDATION', ['field' => 'lawyerId']);
        } else {
            fail(422, 'الدور غير صحيح.', 'VALIDATION', ['field' => 'role']);
        }
    } elseif (is_office_owner($caller)) {
        if (!in_array($role, OFFICE_MEMBER_ROLES, true)) fail(403, 'ليس لديك صلاحية لإنشاء هذا النوع من الحسابات.', 'FORBIDDEN');
        if (!office_writable($caller)) fail(403, 'انتهت الفترة التجريبية. فعّل الاشتراك لإضافة أعضاء.', 'TRIAL_EXPIRED');
        // المكتب دائماً مكتب المستدعي — ما نقبل lawyerId من الطلب
        $lawyerId = tenant_of($caller);
    } else {
        fail(403, 'ليس لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    }

    // البريد لازم يكون فريد في MySQL وفي Firebase (حسابات ما انتقلت بعد)
    if (q_one('SELECT 1 FROM users WHERE email = ?', [$email]) !== null || bridge_firebase_uid_by_email($email) !== null) {
        fail(409, 'البريد الإلكتروني مستخدم بالفعل.', 'EMAIL_EXISTS', ['field' => 'email']);
    }

    $id = new_id();
    try {
        q('INSERT INTO users (id, email, password_hash, name, role, lawyer_id, status, firebase_pw_rotated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            // الحساب الجديد ما عنده كلمة مرور في Firebase أصلاً — ما يحتاج تدوير
            $id, $email, password_hash($password, PASSWORD_DEFAULT), $name, $role, $lawyerId, 'ACTIVE', utc_now(),
        ]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail(409, 'البريد الإلكتروني مستخدم بالفعل.', 'EMAIL_EXISTS', ['field' => 'email']);
        throw $e;
    }
    respond(201, ['id' => $id, 'email' => $email]);
}

/** تراجع عن إنشاء حساب فشلت كتابة ملفه في Firestore — فقط لحساب بلا ملف شخصي */
function route_accounts_delete(string $id): void {
    $caller = fresh_caller();
    $target = q_one('SELECT id, role, lawyer_id FROM users WHERE id = ?', [$id]);
    if ($target === null) respond(200, ['ok' => true]);

    $allowed = is_super_admin($caller)
        || (is_office_owner($caller) && $target['lawyer_id'] === tenant_of($caller) && in_array($target['role'], OFFICE_MEMBER_ROLES, true));
    if (!$allowed) fail(403, 'ليس لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    if (bridge_profile($id) !== null) fail(409, 'الحساب مفعّل بالفعل — عطّله من إدارة الفريق.', 'HAS_PROFILE');

    q('DELETE FROM users WHERE id = ?', [$id]);
    respond(200, ['ok' => true]);
}
