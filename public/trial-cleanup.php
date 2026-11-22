<?php
/**
 * حذف المكاتب التجريبية المنتهية — يُشغَّل من Cron على الاستضافة مرة يومياً (سطر الأوامر فقط).
 *
 * الجدول الزمني لمكتب سجّل ذاتياً (selfSignup) ولم يشترك:
 *   اليوم 0 ........ التسجيل — 14 يوماً تجربة كاملة
 *   اليوم 14 ....... تنتهي التجربة: البرنامج يُقفل ويعرض الباقات (البيانات محفوظة)
 *                    → بريد «انتهت التجربة، بياناتك تُحذف يوم كذا»
 *   اليوم 21 ....... بريد تحذير أخير (قبل الحذف بـ 3 أيام)
 *   اليوم 24 ....... حذف المكتب نهائياً: كل بياناته، حسابات فريقه، ملفاته المرفوعة
 *
 * ضمانات:
 *   - لا حذف قبل إرسال بريد انتهاء التجربة، وبين البريد والحذف 7 أيام على الأقل
 *     (فلا يُحذف مكتب فجأة عند أول تشغيل أو إن تعطّل البريد).
 *   - لا يُلمس مكتب فُعّل له اشتراك (subscriptionBilling ≠ 'trial')، ولا مكتب أنشأه مدير
 *     المنصة يدوياً (بلا selfSignup)، ولا مكتب عنده طلب اشتراك معلّق.
 *   - لا يُحذف إلا ما يخص هذا المكتب: البحث بـ userId/ownerId يتخطّى أي مستند يحمل
 *     lawyerId مكتب آخر. وطلبات الاشتراك سجل مدفوعات المنصة — لا تُحذف.
 *   - علامة trialDeletionStartedAt تُكتب بشرط أن المالك لم يتغيّر منذ قرأناه، ومستند المالك
 *     يُحذف أخيراً بنفس الشرط — فإن فُعّل اشتراكه أثناء الحذف يبقى حسابه ويظهر في التقرير.
 *
 * التشغيل:
 *   php trial-cleanup.php            ← تجربة: يطبع ما سيُحذف ولا يلمس شيئاً ولا يرسل بريداً
 *   php trial-cleanup.php --execute  ← تنفيذ فعلي (هذا ما يوضع في Cron)
 *
 * الترتيب: البيانات ← الملفات ← حسابات الدخول ← مستندات الفريق ← مستند المالك.
 * لو توقّف في المنتصف يكمله التشغيل التالي (المالك والفريق ما زالوا موجودين).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/_firebase.php';
require_once __DIR__ . '/_mailer.php';
// اتصال MySQL (db-config.php) — للمجموعات المنقولة وبيانات الدخول
require_once __DIR__ . '/api/_lib/core.php';

const TRIAL_GRACE_DAYS = 10;           // أيام الاحتفاظ بالبيانات بعد انتهاء التجربة
const MIN_NOTICE_DAYS = 7;             // أقل مدة بين بريد الانتهاء والحذف
const FINAL_WARNING_DAYS = 3;          // التحذير الأخير قبل الحذف بكم يوم
const DEFAULT_MAIL_DOMAIN = 'mawazzen.com';
const DEFAULT_STORAGE_BUCKET = 'lawyer-sa.firebasestorage.app';
const PAGE = 300;
/** مجموعات على مستوى المنصة — لا تُمسح أبداً بالبحث العام */
const PROTECTED_COLLECTIONS = ['users', 'subscriptionPlans', 'subscriptionRequests', 'platform_status', 'platform_settings', 'signup_otps'];

$execute = in_array('--execute', $argv, true);
// معاينة: يعرض ما سيُحذف لكل مكتب منتهٍ حتى لو لم يحن موعده (بلا تنفيذ)
$previewAll = !$execute && in_array('--preview-all', $argv, true);

$configFile = __DIR__ . '/ai-config.php';
$config = is_file($configFile) ? require $configFile : [];
if (!is_array($config)) $config = [];
$GLOBALS['config'] = $config;
$projectId = !empty($config['firebase_project_id']) ? $config['firebase_project_id'] : 'lawyer-sa';
$bucket = !empty($config['firebase_storage_bucket']) ? $config['firebase_storage_bucket'] : DEFAULT_STORAGE_BUCKET;

function out(string $line): void {
    echo gmdate('Y-m-d H:i:s') . "  $line\n";
}

function die_with(string $line): void {
    out("خطأ: $line");
    exit(1);
}

// تشغيل واحد في كل مرة
$lock = fopen(sys_get_temp_dir() . '/mawazeen_trial_cleanup.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    out('تشغيل آخر قيد التنفيذ — خروج.');
    exit(0);
}

$sa = service_account();
$base = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents";

/** توكن حساب الخدمة — يُجدَّد قبل انتهاء ساعته (الحذف الكبير قد يطول) */
function tok(): string {
    static $token = '', $at = 0;
    if ($token === '' || time() - $at > 45 * 60) {
        global $sa;
        $token = admin_access_token($sa);
        $at = time();
    }
    return $token;
}

/* ────────────────────────── Firestore ────────────────────────── */

function api(string $method, string $url, ?array $body = null, string $contentType = 'application/json'): array {
    [$status, $resp] = http_request($method, $url,
        ['Authorization: Bearer ' . tok(), "Content-Type: $contentType"],
        $body === null ? null : json_encode($body, JSON_UNESCAPED_UNICODE));
    return [$status, json_decode($resp, true), $resp];
}

/**
 * صفحة من مستندات مجموعة جذرية حيث field == value، مرتبة بالمعرّف وتبدأ بعد $after.
 * المؤشّر يمنع إعادة نفس الصفحة للأبد حين نتخطّى مستندات لا تخص المكتب.
 */
function query_eq(string $collection, string $field, string $value, int $limit = PAGE, string $after = ''): array {
    global $base;
    $q = [
        'from' => [['collectionId' => $collection]],
        'where' => ['fieldFilter' => ['field' => ['fieldPath' => $field], 'op' => 'EQUAL', 'value' => ['stringValue' => $value]]],
        'orderBy' => [['field' => ['fieldPath' => '__name__'], 'direction' => 'ASCENDING']],
        'limit' => $limit,
    ];
    if ($after !== '') $q['startAt'] = ['values' => [['referenceValue' => $after]], 'before' => false];
    [$status, $rows, $raw] = api('POST', "$base:runQuery", ['structuredQuery' => $q]);
    if ($status !== 200 || !is_array($rows)) die_with("استعلام $collection.$field ($status): " . substr($raw, 0, 300));
    $docs = [];
    foreach ($rows as $row) if (!empty($row['document'])) $docs[] = $row['document'];
    return $docs;
}

function list_collection_ids(string $parentName): array {
    $ids = [];
    $pageToken = '';
    do {
        $body = ['pageSize' => 100];
        if ($pageToken !== '') $body['pageToken'] = $pageToken;
        [$status, $data, $raw] = api('POST', "https://firestore.googleapis.com/v1/$parentName:listCollectionIds", $body);
        if ($status !== 200 || !is_array($data)) die_with("listCollectionIds ($status): " . substr($raw, 0, 300));
        foreach ($data['collectionIds'] ?? [] as $id) $ids[] = $id;
        $pageToken = (string) ($data['nextPageToken'] ?? '');
    } while ($pageToken !== '');
    return $ids;
}

function list_docs(string $collectionName, string $pageToken = ''): array {
    $url = "https://firestore.googleapis.com/v1/$collectionName?pageSize=" . PAGE
        . ($pageToken !== '' ? '&pageToken=' . rawurlencode($pageToken) : '');
    [$status, $data, $raw] = api('GET', $url);
    if ($status !== 200 || !is_array($data)) die_with("قراءة $collectionName ($status): " . substr($raw, 0, 300));
    return [$data['documents'] ?? [], (string) ($data['nextPageToken'] ?? '')];
}

/** أسماء ملفات uploads/ المذكورة في أي نص داخل المستند (يُستدعى للمحذوف فقط) */
function collect_uploads($value, array &$files): void {
    if (is_array($value)) {
        foreach ($value as $v) collect_uploads($v, $files);
        return;
    }
    if (is_string($value) && preg_match_all('~/uploads/([^/?#"<>]+)~u', $value, $m)) {
        foreach ($m[1] as $name) $files[rawurldecode(trim($name))] = true;
    }
}

function doc_fields(array $doc): array {
    $out = [];
    foreach ($doc['fields'] ?? [] as $k => $f) $out[$k] = fs_decode($f);
    return $out;
}

/**
 * يحذف المستند ومجموعاته الفرعية (مثل cases/{id}/hearings) — من الأعمق للأعلى.
 * $counts يجمع عدد المحذوف لكل مجموعة للتقرير، و$files الملفات المرفوعة المذكورة فيه.
 */
function delete_tree(array $doc, array &$counts, array &$files, bool $execute): void {
    static $seen = [];
    $name = $doc['name'];
    // المستند قد يطابق أكثر من بحث (lawyerId و userId معاً) — يُعدّ ويُحذف مرة واحدة
    if (isset($seen[$name])) return;
    $seen[$name] = true;
    collect_uploads(doc_fields($doc), $files);
    foreach (list_collection_ids($name) as $sub) {
        $pageToken = '';
        do {
            [$children, $pageToken] = list_docs("$name/$sub", $pageToken);
            foreach ($children as $child) delete_tree($child, $counts, $files, $execute);
        } while ($pageToken !== '');
    }
    $parts = explode('/documents/', $name, 2);
    $segments = explode('/', $parts[1] ?? '');
    $collection = $segments[count($segments) - 2] ?? '?';
    $counts[$collection] = ($counts[$collection] ?? 0) + 1;
    if ($execute) {
        [$status, , $raw] = api('DELETE', "https://firestore.googleapis.com/v1/$name");
        if ($status !== 200 && $status !== 404) die_with("حذف $name ($status): " . substr($raw, 0, 300));
    }
}

/**
 * يحذف مستندات $collection حيث $field == $value.
 * بحث userId/ownerId (لا lawyerId): يتخطّى أي مستند يحمل lawyerId مكتب آخر — عضو سابق
 * في مكتب مدفوع قد يحمل نفس المعرّف على بيانات ذلك المكتب.
 */
function delete_where(string $collection, string $field, string $value, string $officeId, array &$counts, array &$files, bool $execute): void {
    $after = '';
    do {
        $docs = query_eq($collection, $field, $value, PAGE, $after);
        foreach ($docs as $doc) {
            $after = $doc['name'];
            $f = doc_fields($doc);
            // تأكيد إضافي: الحقل يطابق فعلاً (لا نحذف شيئاً بخطأ استعلام)
            if (($f[$field] ?? null) !== $value) die_with("نتيجة غير متوقعة في $collection");
            if (array_key_exists('lawyerId', $f) && $f['lawyerId'] !== $officeId) continue;
            delete_tree($doc, $counts, $files, $execute);
        }
    } while (count($docs) === PAGE);
}

/* ────────────────────────── MySQL (المجموعات المنقولة) ────────────────────────── */

/**
 * بيانات المكتب في جدول docs — نفس منطق delete_where: كل ما يحمل lawyerId المكتب، أو
 * userId/ownerId لعضو منه بشرط ما يحمل lawyerId مكتب ثاني. ومعه كل ما تحته (cases/{id}/**).
 * يرجع عدد المحذوف لكل مجموعة في $counts ويجمع الملفات المرفوعة المذكورة في $files.
 */
function delete_mysql_office(string $officeId, array $members, array &$counts, array &$files, bool $execute): void {
    $ph = implode(',', array_fill(0, count($members), '?'));
    $rows = q("SELECT collection, parent_path, id, data FROM docs
                WHERE lawyer_id = ?
                   OR (parent_path = '' AND (lawyer_id IS NULL OR lawyer_id = ?) AND (
                        JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) IN ($ph)
                     OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.ownerId')) IN ($ph)))",
        array_merge([$officeId, $officeId], $members, $members))->fetchAll();

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
        // المستندات الفرعية تحت السجل حتى لو ما تحمل lawyerId
        $path = ($r['parent_path'] !== '' ? $r['parent_path'] . '/' : '') . $r['collection'] . '/' . $r['id'];
        foreach (q("SELECT collection, parent_path, id, data FROM docs WHERE parent_path = ? OR parent_path LIKE ?",
            [$path, str_replace(['%', '_'], ['\%', '\_'], $path) . '/%'])->fetchAll() as $child) $add($child);
    }
    if (!$execute || !$keys) return;
    $pdo = db();
    $pdo->beginTransaction();
    $del = $pdo->prepare('DELETE FROM docs WHERE collection = ? AND parent_path = ? AND id = ?');
    foreach ($keys as $k) $del->execute($k);
    $pdo->commit();
}

/* ────────────────────────── Storage + Auth ────────────────────────── */

/** ملفات المكتبة القانونية الشخصية في Firebase Storage: legalLibrary/{uid}/ */
function delete_storage_prefix(string $bucket, string $prefix, bool $execute): int {
    $n = 0;
    $pageToken = '';
    $b = 'https://storage.googleapis.com/storage/v1/b/' . rawurlencode($bucket) . '/o';
    do {
        $url = "$b?prefix=" . rawurlencode($prefix) . ($pageToken !== '' ? '&pageToken=' . rawurlencode($pageToken) : '');
        [$status, $data, $raw] = api('GET', $url);
        if ($status === 404) return 0;
        if ($status !== 200 || !is_array($data)) die_with("سرد ملفات $prefix ($status): " . substr($raw, 0, 300));
        foreach ($data['items'] ?? [] as $item) {
            $n++;
            if ($execute) {
                [$st, , $r] = api('DELETE', "$b/" . rawurlencode($item['name']));
                if ($st !== 204 && $st !== 200 && $st !== 404) die_with("حذف ملف {$item['name']} ($st): " . substr($r, 0, 200));
            }
        }
        $pageToken = (string) ($data['nextPageToken'] ?? '');
    } while ($pageToken !== '');
    return $n;
}

function delete_auth_users(string $projectId, array $uids): void {
    foreach (array_chunk($uids, 1000) as $chunk) {
        [$status, $data, $raw] = api('POST',
            "https://identitytoolkit.googleapis.com/v1/projects/$projectId/accounts:batchDelete",
            ['localIds' => $chunk, 'force' => true]);
        if ($status !== 200) die_with("حذف حسابات الدخول ($status): " . substr($raw, 0, 300));
        foreach ($data['errors'] ?? [] as $e) {
            // حساب غير موجود أصلاً ليس خطأ — غيره يوقف التشغيل قبل حذف مستندات الفريق
            if (stripos((string) ($e['message'] ?? ''), 'USER_NOT_FOUND') === false) {
                die_with('حذف حساب دخول: ' . json_encode($e, JSON_UNESCAPED_UNICODE));
            }
        }
    }
}

/* ────────────────────────── البريد ────────────────────────── */

function mail_domain(): string {
    $configured = strtolower((string) ($GLOBALS['config']['mail_domain'] ?? ''));
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

/** يكتب حقولاً على مستند المالك — بشرط اختياري على وقت آخر تعديل. يرجع وقت التعديل الجديد أو '' */
function mark_owner(string $uid, array $fields, string $ifUpdateTime = ''): string {
    global $projectId;
    $pre = $ifUpdateTime !== '' ? ['updateTime' => $ifUpdateTime] : ['exists' => true];
    [$status, $body] = fs_commit($projectId, tok(), [fs_set_write($projectId, "users/$uid", $fields, array_keys($fields), $pre)]);
    if ($status !== 200) return '';
    $res = json_decode($body, true);
    return (string) ($res['writeResults'][0]['updateTime'] ?? '');
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

function has_pending_request(string $uid): bool {
    foreach (query_eq('subscriptionRequests', 'userId', $uid, 200) as $d) {
        if ((doc_fields($d)['status'] ?? '') === 'pending') return true;
    }
    return false;
}

/* ────────────────────────── التنفيذ ────────────────────────── */

out($execute ? '— تشغيل فعلي —' : '— تجربة فقط (لن يُحذف شيء ولن يُرسل بريد). أضف --execute للتنفيذ —');

$now = time();
$owners = query_eq('users', 'subscriptionBilling', 'trial', 1000);
if (count($owners) === 1000) out('تنبيه: 1000 مكتب تجريبي أو أكثر — يُعالج أول 1000 فقط في هذا التشغيل.');
$rootCollections = array_values(array_diff(list_collection_ids("projects/$projectId/databases/(default)/documents"), PROTECTED_COLLECTIONS));

$summary = ['expired' => 0, 'deleted' => 0, 'pending' => 0, 'notified' => 0, 'waiting' => 0];

foreach ($owners as $ownerDoc) {
    $uid = basename($ownerDoc['name']);
    $owner = doc_fields($ownerDoc);
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
        if ($ok && mark_owner($uid, ['trialExpiredNoticeAt' => iso_ms($now)]) !== '') $summary['notified']++;
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
            if ($ok && mark_owner($uid, ['trialFinalWarningAt' => iso_ms($now)]) !== '') $summary['notified']++;
        }
        continue;
    }

    // ── موعد الحذف حان: نعيد قراءة المالك أولاً — ربما فُعّل اشتراكه أو طلب باقة الآن ──
    $fresh = fs_get($projectId, tok(), "users/$uid");
    if (!$fresh || ($fresh['subscriptionBilling'] ?? '') !== 'trial') {
        out("تخطّي: $label — تغيّر اشتراكه.");
        continue;
    }
    if (has_pending_request($uid)) {
        $summary['pending']++;
        out("مؤجَّل: $label — عنده طلب اشتراك معلّق. وافق عليه أو ارفضه من «طلبات الاشتراك».");
        continue;
    }

    out(($execute ? 'حذف' : 'سيُحذف') . ": $label — انتهت التجربة " . day($endsAt));

    // علامة بدء الحذف بشرط ألا يكون المالك تغيّر منذ قرأناه — أي تعديل بينهما يوقف الحذف
    $ownerVersion = '';
    if ($execute) {
        $ownerVersion = mark_owner($uid, ['trialDeletionStartedAt' => iso_ms($now)], (string) $fresh['__updateTime']);
        if ($ownerVersion === '') {
            out('  تخطّي: تغيّر مستند المالك لحظة الحذف — يُعاد فحصه في التشغيل التالي');
            continue;
        }
    }

    $counts = [];
    $files = [];

    // أعضاء المكتب: المالك + كل من يحمل lawyerId = المالك (محامون، مستشارون، متدربون، عملاء البوابة...)
    $members = [$uid];
    $memberDocs = [];
    foreach (query_eq('users', 'lawyerId', $uid, 1000) as $m) {
        if ((doc_fields($m)['role'] ?? '') === 'SUPER_ADMIN') die_with("عضو بدور SUPER_ADMIN داخل $uid — توقف للمراجعة اليدوية");
        $members[] = basename($m['name']);
        $memberDocs[] = $m;
    }

    // 1) كل بيانات المكتب في كل المجموعات (والمجموعات الفرعية تحتها)
    foreach ($rootCollections as $collection) {
        delete_where($collection, 'lawyerId', $uid, $uid, $counts, $files, $execute);
        foreach ($members as $m) {
            delete_where($collection, 'userId', $m, $uid, $counts, $files, $execute);
            delete_where($collection, 'ownerId', $m, $uid, $counts, $files, $execute);
        }
    }
    // القضايا والعملاء والمهام (وما تحتها) انتقلت لـ MySQL
    delete_mysql_office($uid, $members, $counts, $files, $execute);
    foreach (["office_settings/$uid", "signup_otps/$uid"] as $path) {
        // بالمعرّف — قد لا يحمل lawyerId. ما سبق حذفه في البحث العام يتخطّاه delete_tree
        [$status, $doc] = api('GET', "$base/$path");
        if ($status === 200 && is_array($doc)) delete_tree($doc, $counts, $files, $execute);
    }

    // 2) الملفات: المكتبة القانونية في Storage + المرفوعات على هذا الخادم
    $storageFiles = 0;
    foreach ($members as $m) $storageFiles += delete_storage_prefix($bucket, "legalLibrary/$m/", $execute);
    $localFiles = 0;
    foreach (array_keys($files) as $file) {
        $file = basename($file);
        $path = __DIR__ . '/uploads/' . $file;
        if ($file === '' || $file[0] === '.' || !is_file($path)) continue;
        $localFiles++;
        if ($execute) @unlink($path);
    }

    // 3) حسابات الدخول أولاً (فلا يبقى حساب يتيم إن توقّف التشغيل)، ثم مستندات الفريق، ثم المالك
    if ($execute) {
        delete_auth_users($projectId, $members);
        // بيانات الدخول في MySQL — الفريق الآن، والمالك بعد حذف مستنده بنجاح (تحت)
        $team = array_values(array_diff($members, [$uid]));
        if ($team) q('DELETE FROM users WHERE id IN (' . implode(',', array_fill(0, count($team), '?')) . ')', $team);
    }
    foreach ($memberDocs as $m) {
        $counts['users'] = ($counts['users'] ?? 0) + 1;
        if ($execute) {
            [$status, , $raw] = api('DELETE', 'https://firestore.googleapis.com/v1/' . $m['name']);
            if ($status !== 200 && $status !== 404) die_with("حذف عضو {$m['name']} ($status): " . substr($raw, 0, 300));
        }
    }
    $counts['users'] = ($counts['users'] ?? 0) + 1;
    if ($execute) {
        // بشرط أن المالك لم يتغيّر منذ علامة البدء — فُعّل اشتراكه أثناء الحذف؟ يبقى حسابه
        [$status, $body] = fs_commit($projectId, tok(), [[
            'delete' => fs_doc_name($projectId, "users/$uid"),
            'currentDocument' => ['updateTime' => $ownerVersion],
        ]]);
        if ($status !== 200) {
            out("  تنبيه: تغيّر مستند المالك أثناء الحذف ($status) — بقي حسابه. راجعه يدوياً في «المكاتب».");
        } else {
            q('DELETE FROM users WHERE id = ?', [$uid]);
        }
    }

    ksort($counts);
    $parts = [];
    foreach ($counts as $c => $n) $parts[] = "$c=$n";
    out('  ' . implode(' · ', $parts) . " · ملفات الخادم=$localFiles · ملفات المكتبة=$storageFiles · حسابات دخول=" . count($members));
    $summary['deleted']++;
}

out("انتهى — مكاتب منتهية: {$summary['expired']} · " . ($execute ? 'حُذف' : 'سيُحذف') . ": {$summary['deleted']}"
    . " · مؤجَّل لطلب معلّق: {$summary['pending']} · بانتظار بريد الانتهاء: {$summary['waiting']} · إشعارات أُرسلت: {$summary['notified']}");
