<?php
/**
 * حذف المكاتب التجريبية المنتهية — يُشغَّل من Cron على الاستضافة مرة يومياً (سطر الأوامر فقط).
 *
 * الجدول الزمني لمكتب سجّل ذاتياً (selfSignup) ولم يشترك:
 *   اليوم 0 ........ التسجيل — 14 يوماً تجربة كاملة
 *   اليوم 14 ....... تنتهي التجربة: البرنامج يُقفل ويعرض الباقات (البيانات محفوظة)
 *                    → بريد «انتهت التجربة، بياناتك تُحذف يوم كذا»
 *   اليوم 21 ....... بريد تحذير أخير (قبل الحذف بـ 3 أيام)
 *   اليوم 24 ....... حذف المكتب نهائياً: كل بياناته، حسابات فريقه، ملفاته
 *
 * ضمانات:
 *   - لا حذف قبل إرسال بريد انتهاء التجربة، وبين البريد والحذف 7 أيام على الأقل
 *     (فلا يُحذف مكتب فجأة عند أول تشغيل أو إن تعطّل البريد).
 *   - لا يُلمس مكتب فُعّل له اشتراك (subscriptionBilling ≠ 'trial')، ولا مكتب أنشأه مدير
 *     المنصة يدوياً (بلا selfSignup)، ولا مكتب عنده طلب اشتراك معلّق.
 *   - لا يُحذف إلا ما يخص هذا المكتب: السجلات الرئيسية بـ lawyerId المكتب، أو userId/ownerId
 *     لعضو فيه بشرط ما تحمل lawyerId مكتب آخر — ومعها ما تحتها. طلبات الاشتراك لا تُحذف.
 *   - كل الحذف داخل معاملة واحدة بعد التأكد أن ملف المالك ما تغيّر منذ قرأناه (updated_at)،
 *     فإن فُعّل اشتراكه أثناء التشغيل يبقى كل شيء.
 *
 * التشغيل:
 *   php trial-cleanup.php                ← تجربة: يطبع ما سيُحذف ولا يلمس شيئاً ولا يرسل بريداً
 *   php trial-cleanup.php --preview-all  ← معاينة كل المكاتب المنتهية حتى لو لم يحن موعدها
 *   php trial-cleanup.php --execute      ← تنفيذ فعلي (هذا ما يوضع في Cron)
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/_mailer.php';
require_once __DIR__ . '/api/_lib/core.php';

const TRIAL_GRACE_DAYS = 10;           // أيام الاحتفاظ بالبيانات بعد انتهاء التجربة
const MIN_NOTICE_DAYS = 7;             // أقل مدة بين بريد الانتهاء والحذف
const FINAL_WARNING_DAYS = 3;          // التحذير الأخير قبل الحذف بكم يوم
const DEFAULT_MAIL_DOMAIN = 'mawazzen.com';
/** مجموعات على مستوى المنصة — لا تُحذف بالبحث العام */
const PROTECTED_COLLECTIONS = ['users', 'subscriptionPlans', 'subscriptionRequests', 'platform_status', 'platform_settings'];

$execute = in_array('--execute', $argv, true);
$previewAll = !$execute && in_array('--preview-all', $argv, true);

function out(string $line): void {
    echo gmdate('Y-m-d H:i:s') . "  $line\n";
}

function iso_ms(int $ts): string {
    return gmdate('Y-m-d\TH:i:s', $ts) . '.000Z';
}

function day(int $ts): string {
    return gmdate('Y/m/d', $ts);
}

/** نهاية التجربة = الأبعد من trialEndsAt و subscriptionExpiry (لو مُدّدت التجربة في أحدهما) */
function trial_end(array $owner): int {
    $end = 0;
    foreach (['trialEndsAt', 'subscriptionExpiry'] as $k) {
        $t = is_string($owner[$k] ?? null) ? strtotime($owner[$k]) : false;
        if ($t && $t > $end) $end = $t;
    }
    return $end;
}

/** موعد الحذف: بعد مهلة الاحتفاظ، وبعد بريد الانتهاء بأسبوع على الأقل. 0 = لم يُرسل البريد بعد */
function deletion_time(array $owner, int $endsAt): int {
    $noticeAt = is_string($owner['trialExpiredNoticeAt'] ?? null) ? strtotime($owner['trialExpiredNoticeAt']) : false;
    if (!$noticeAt) return 0;
    return max($endsAt + TRIAL_GRACE_DAYS * 86400, $noticeAt + MIN_NOTICE_DAYS * 86400);
}

function owner_row(string $uid): ?array {
    $row = q_one("SELECT data, updated_at FROM docs WHERE collection = 'users' AND parent_path = '' AND id = ?", [$uid]);
    if ($row === null) return null;
    return ['data' => json_decode((string) $row['data'], true) ?: [], 'updated_at' => $row['updated_at']];
}

/** يكتب حقولاً على ملف المالك (ونسخته في جدول users) */
function mark_owner(string $uid, array $fields): bool {
    $row = owner_row($uid);
    if ($row === null) return false;
    $data = $fields + $row['data'];
    q("UPDATE docs SET data = ? WHERE collection = 'users' AND parent_path = '' AND id = ?", [json_encode($data, JSON_UNESCAPED_UNICODE), $uid]);
    q('UPDATE users SET data = ? WHERE id = ?', [json_encode($data, JSON_UNESCAPED_UNICODE), $uid]);
    return true;
}

function has_pending_request(string $uid): bool {
    return q_one("SELECT 1 FROM docs WHERE collection = 'subscriptionRequests' AND parent_path = ''
                   AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) = 'pending' LIMIT 1", [$uid]) !== null;
}

function mail_domain(): string {
    $configured = strtolower((string) (app_config()['mail_domain'] ?? ''));
    return preg_match('/^[a-z0-9-]+(\.[a-z0-9-]+)+$/', $configured) ? $configured : DEFAULT_MAIL_DOMAIN;
}

function send_notice(string $email, string $name, string $subject, string $text): bool {
    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $safeText = nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8'));
    $site = 'https://' . mail_domain();
    $html = <<<HTML
<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f6fa;font-family:Tahoma,Arial,sans-serif">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;padding:28px;color:#1e293b;line-height:1.9">
<h2 style="margin:0 0 12px;color:#0b1f4b">موازين</h2>
<p>مرحباً $safeName،</p><p>$safeText</p>
<p style="margin:24px 0"><a href="$site/login" style="background:#c9a227;color:#0b1f4b;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:bold">اختر باقتك الآن</a></p>
<p style="font-size:12px;color:#64748b">للمساعدة: واتساب 01094040671</p>
</div></body></html>
HTML;
    return send_mawazeen_email($email, $name, $subject, $html);
}

/** أسماء الملفات المرفوعة (/uploads/...) المذكورة في أي قيمة — تُحذف مع المكتب */
function collect_uploads($value, array &$files): void {
    if (is_array($value)) {
        foreach ($value as $v) collect_uploads($v, $files);
        return;
    }
    if (is_string($value) && preg_match_all('~/uploads/([^/?#"<>]+)~u', $value, $m)) {
        foreach ($m[1] as $name) $files[rawurldecode(trim($name))] = true;
    }
}

/**
 * سجلات المكتب في docs: الرئيسية بـ lawyerId المكتب، أو userId/ownerId/createdBy لعضو منه بشرط
 * ما تحمل lawyerId مكتب ثاني (المكتبة القانونية، المحادثات…) — ومعها كل ما تحتها. يرجع المفاتيح.
 */
function office_rows(string $officeId, array $members, array &$counts, array &$files): array {
    $ph = implode(',', array_fill(0, count($members), '?'));
    $ownerFields = array_map(fn($f) => "JSON_UNQUOTE(JSON_EXTRACT(data, '$.$f')) IN ($ph)", ['userId', 'ownerId', 'createdBy']);
    $rows = q("SELECT collection, parent_path, id, data FROM docs
                WHERE parent_path = '' AND collection NOT IN ('" . implode("','", PROTECTED_COLLECTIONS) . "')
                  AND (lawyer_id = ? OR ((lawyer_id IS NULL OR lawyer_id = ?) AND (" . implode(' OR ', $ownerFields) . ')))',
        array_merge([$officeId, $officeId], $members, $members, $members))->fetchAll();
    $keys = [];
    $add = function (array $r) use (&$keys, &$counts, &$files): void {
        $k = "{$r['collection']}|{$r['parent_path']}|{$r['id']}";
        if (isset($keys[$k])) return;
        $keys[$k] = [$r['collection'], $r['parent_path'], $r['id']];
        $counts[$r['collection']] = ($counts[$r['collection']] ?? 0) + 1;
        collect_uploads(json_decode((string) $r['data'], true), $files);
    };
    foreach ($rows as $r) {
        $add($r);
        $path = $r['collection'] . '/' . $r['id'];
        foreach (q('SELECT collection, parent_path, id, data FROM docs WHERE parent_path = ? OR parent_path LIKE ?',
            [$path, str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $path) . '/%'])->fetchAll() as $child) $add($child);
    }
    return array_values($keys);
}

/** ملفات المكتبة القانونية الخاصة (private_files/legalLibrary/{uid}) — يرجع عددها */
function private_files_of(string $uid, bool $execute, string $area = 'legalLibrary'): int {
    $root = (string) (app_config()['files_dir'] ?? '');
    if ($root === '') $root = dirname(__DIR__) . '/private_files';
    $dir = rtrim($root, '/\\') . "/$area/" . $uid;
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $uid) || !is_dir($dir)) return 0;
    $count = 0;
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) {
        if ($f->isFile()) $count++;
        if ($execute) $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    }
    if ($execute) @rmdir($dir);
    return $count;
}

/* ────────────────────────── التنفيذ ────────────────────────── */

out($execute ? '— تشغيل فعلي —' : '— تجربة فقط (لن يُحذف شيء ولن يُرسل بريد). أضف --execute للتنفيذ —');

$now = time();
$owners = q("SELECT id, data FROM docs WHERE collection = 'users' AND parent_path = ''
              AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.subscriptionBilling')) = 'trial'")->fetchAll();
$summary = ['expired' => 0, 'deleted' => 0, 'pending' => 0, 'notified' => 0, 'waiting' => 0];

foreach ($owners as $ownerRow) {
    $uid = (string) $ownerRow['id'];
    $owner = json_decode((string) $ownerRow['data'], true) ?: [];
    if (($owner['selfSignup'] ?? false) !== true || ($owner['role'] ?? '') !== 'LAWYER' || !empty($owner['lawyerId'])) continue;
    $endsAt = trial_end($owner);
    if (!$endsAt || $endsAt > $now) continue;  // التجربة ما زالت سارية
    $summary['expired']++;

    $label = ($owner['officeName'] ?? '?') . ' <' . ($owner['email'] ?? '?') . "> [$uid]";
    $email = (string) ($owner['email'] ?? '');
    $name = (string) ($owner['name'] ?? '');
    $office = (string) ($owner['officeName'] ?? '');
    $deleteAt = deletion_time($owner, $endsAt);

    // ── لم يصله بريد الانتهاء بعد: نرسله ونحدد موعد الحذف من وقته ──
    if ($deleteAt === 0 && !$previewAll) {
        $planned = max($endsAt + TRIAL_GRACE_DAYS * 86400, $now + MIN_NOTICE_DAYS * 86400);
        out("مقفل: $label — بريد الانتهاء لم يُرسل بعد؛ الحذف المتوقع " . day($planned));
        if (!$execute || $email === '') { $summary['waiting']++; continue; }
        $ok = send_notice($email, $name, 'انتهت الفترة التجريبية — موازين',
            "انتهت الفترة التجريبية لمكتب «{$office}».\n"
            . 'بياناتك محفوظة حتى ' . day($planned) . "، وبعدها تُحذف نهائياً ولا يمكن استرجاعها.\n"
            . 'اشترك في إحدى الباقات قبل هذا التاريخ لتستكمل العمل ببياناتك كما هي.');
        if ($ok && mark_owner($uid, ['trialExpiredNoticeAt' => iso_ms($now)])) $summary['notified']++;
        else out('  تحذير: تعذّر إرسال البريد أو تسجيله — لن يُحذف المكتب قبل نجاحه');
        continue;
    }

    // ── قبل موعد الحذف: التحذير الأخير فقط ──
    if ($deleteAt > $now && !$previewAll) {
        $daysLeft = (int) ceil(($deleteAt - $now) / 86400);
        out("مقفل: $label — يُحذف بعد $daysLeft يوم (" . day($deleteAt) . ')');
        if ($execute && $email !== '' && $daysLeft <= FINAL_WARNING_DAYS && empty($owner['trialFinalWarningAt'])) {
            $ok = send_notice($email, $name, "تحذير أخير: حذف بيانات مكتبك بعد $daysLeft " . ($daysLeft === 1 ? 'يوم' : 'أيام') . ' — موازين',
                "بيانات مكتب «{$office}» ستُحذف نهائياً يوم " . day($deleteAt) . ".\n"
                . 'القضايا والعملاء والمستندات وحسابات فريقك — كلها. اشترك الآن للاحتفاظ بها.');
            if ($ok && mark_owner($uid, ['trialFinalWarningAt' => iso_ms($now)])) $summary['notified']++;
        }
        continue;
    }

    // ── موعد الحذف حان: نعيد قراءة المالك — ربما فُعّل اشتراكه أو طلب باقة الآن ──
    $fresh = owner_row($uid);
    if ($fresh === null || ($fresh['data']['subscriptionBilling'] ?? '') !== 'trial') {
        out("تخطّي: $label — تغيّر اشتراكه.");
        continue;
    }
    if (has_pending_request($uid)) {
        $summary['pending']++;
        out("مؤجَّل: $label — عنده طلب اشتراك معلّق. وافق عليه أو ارفضه من «طلبات الاشتراك».");
        continue;
    }
    out(($execute ? 'حذف' : 'سيُحذف') . ": $label — انتهت التجربة " . day($endsAt));

    // أعضاء المكتب: المالك + كل من يحمل lawyerId = المالك
    $members = [$uid];
    foreach (q("SELECT id, data FROM docs WHERE collection = 'users' AND parent_path = '' AND lawyer_id = ?", [$uid])->fetchAll() as $m) {
        if ((json_decode((string) $m['data'], true)['role'] ?? '') === 'SUPER_ADMIN') { out("  توقف: عضو بدور SUPER_ADMIN داخل $uid — مراجعة يدوية"); continue 2; }
        $members[] = (string) $m['id'];
    }
    foreach (q('SELECT id FROM users WHERE lawyer_id = ?', [$uid])->fetchAll() as $m) $members[] = (string) $m['id'];
    $members = array_values(array_unique($members));

    $counts = [];
    $files = [];
    $keys = office_rows($uid, $members, $counts, $files);
    $libraryFiles = 0;
    foreach ($members as $m) $libraryFiles += private_files_of($m, false);
    // ملفات المكتب المشفّرة (مرفقات القضايا وغيرها)
    $officeFiles = (int) q('SELECT COUNT(*) FROM office_files WHERE tenant = ?', [$uid])->fetchColumn();
    $counts['users'] = count($members);

    if ($execute) {
        $pdo = db();
        $pdo->beginTransaction();
        // بشرط أن ملف المالك ما تغيّر منذ قرأناه — فُعّل اشتراكه أثناء التشغيل؟ يبقى كل شيء
        $still = q_one("SELECT 1 FROM docs WHERE collection = 'users' AND parent_path = '' AND id = ? AND updated_at = ? FOR UPDATE", [$uid, $fresh['updated_at']]);
        if ($still === null) {
            $pdo->rollBack();
            out('  تخطّي: تغيّر ملف المالك لحظة الحذف — يُعاد فحصه في التشغيل التالي');
            continue;
        }
        $del = $pdo->prepare('DELETE FROM docs WHERE collection = ? AND parent_path = ? AND id = ?');
        foreach ($keys as $k) $del->execute($k);
        foreach (['file_access_log', 'file_shares', 'office_files'] as $table) q("DELETE FROM $table WHERE tenant = ?", [$uid]);
        $ph = implode(',', array_fill(0, count($members), '?'));
        q("DELETE FROM docs WHERE collection = 'users' AND parent_path = '' AND id IN ($ph)", $members);
        // حسابات الدخول (والجلسات وروابط الاستعادة تنحذف معها بالمفاتيح الأجنبية)
        q("DELETE FROM users WHERE id IN ($ph)", $members);
        $pdo->commit();
        foreach ($members as $m) private_files_of($m, true);
        private_files_of($uid, true, 'office');
    }

    $localFiles = 0;
    foreach (array_keys($files) as $file) {
        $file = basename($file);
        $path = __DIR__ . '/uploads/' . $file;
        if ($file === '' || $file[0] === '.' || !is_file($path)) continue;
        // ملف يذكره مستند مكتب ثاني ما ينحذف — مكتب تجريبي يقدر يحط روابط ملفات غيره في مستنداته
        // بالاسم وحده (فريد: وقت + جزء عشوائي) — json_encode يخزن الرابط بـ \/ فـ "/uploads/" ما يطابق
        $like = fn(string $s) => '%' . addcslashes($s, '%_\\') . '%';
        // ثلاث صيغ: كما هو، مرمّز في رابط، وبحروف \uXXXX (سجلات منقولة بدون JSON_UNESCAPED_UNICODE)
        if (q_one('SELECT 1 FROM docs WHERE (lawyer_id IS NULL OR lawyer_id <> ?) AND (data LIKE ? OR data LIKE ? OR data LIKE ?) LIMIT 1',
            [$uid, $like($file), $like(rawurlencode($file)), $like(trim((string) json_encode($file), '"'))]) !== null) continue;
        $localFiles++;
        if ($execute) @unlink($path);
    }

    ksort($counts);
    $parts = [];
    foreach ($counts as $c => $n) $parts[] = "$c=$n";
    out('  ' . implode(' · ', $parts) . " · ملفات الخادم=$localFiles · ملفات المكتبة=$libraryFiles · ملفات المكتب المشفّرة=$officeFiles");
    $summary['deleted']++;
}

out("انتهى — مكاتب منتهية: {$summary['expired']} · " . ($execute ? 'حُذف' : 'سيُحذف') . ": {$summary['deleted']}"
    . " · مؤجَّل لطلب معلّق: {$summary['pending']} · بانتظار بريد الانتهاء: {$summary['waiting']} · إشعارات أُرسلت: {$summary['notified']}");
