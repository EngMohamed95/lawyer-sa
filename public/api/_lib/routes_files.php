<?php
/**
 * /api/v1/files/* — الملفات الخاصة (المكتبة القانونية ومرفقات الدعم) بدل Firebase Storage.
 *
 * الملفات تنحفظ خارج مجلد الموقع (private_files بجانب public_html)، فما في رابط مباشر لأي ملف:
 * التنزيل يمر من هنا بعد التحقق. المسارات بنفس شكل Firebase Storage عشان السجلات ما تتغير:
 *   legalLibrary/{uid}/{id}                     — ملك صاحبه فقط (ومدير المنصة يطّلع)
 *   supportAttachments/{ticket}/{uid}/{id}      — لطرفي التذكرة
 */

declare(strict_types=1);

require_once __DIR__ . '/store.php';
require_once __DIR__ . '/routes_data.php';

const FILE_KINDS = [
    'legal' => ['max' => 52_428_800, 'types' => ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
    'support' => ['max' => 5_242_880, 'types' => ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']],
];

/** مجلد الملفات الخاصة — من الإعداد، وإلا بجانب جذر الموقع (خارج public_html) */
function files_root(): string {
    $dir = (string) (app_config()['files_dir'] ?? '');
    if ($dir === '') $dir = dirname(__DIR__, 3) . '/private_files';
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        error_log("api: تعذّر إنشاء مجلد الملفات $dir");
        fail(503, 'تخزين الملفات غير متاح حالياً.', 'UNAVAILABLE');
    }
    return rtrim($dir, '/\\');
}

/**
 * يفكك مسار ملف ويتحقق من الصلاحية. يرجع المسار الكامل على القرص.
 * $write: رفع/حذف (لصاحب الملف فقط) — وإلا قراءة.
 */
function files_authorize(array $u, string $path, bool $write): string {
    $me = (string) $u['id'];
    if (preg_match('#^legalLibrary/([A-Za-z0-9_-]{1,64})/([A-Za-z0-9-]{1,64})$#', $path, $m)) {
        $ok = $m[1] === $me || (!$write && is_super_admin($u));
    } elseif (preg_match('#^supportAttachments/([A-Za-z0-9_-]{1,64})/([A-Za-z0-9_-]{1,64})/([A-Za-z0-9-]{1,64})$#', $path, $m)) {
        if ($write) {
            $ok = $m[2] === $me;
        } else {
            // طرفا التذكرة — أو المرسل نفسه (ملف رُفع والتذكرة ما انحفظت)
            $ticket = store_row('supportTickets', '', $m[1]);
            $ok = $m[2] === $me || is_super_admin($u) || ($ticket !== null && ($ticket['data']->createdBy ?? null) === $me);
        }
    } else {
        fail(400, 'مسار ملف غير صالح.', 'BAD_PATH');
    }
    if (!$ok) store_forbidden();
    return files_root() . '/' . $path;
}

/** نوع الملف من محتواه (مو من اسمه أو مما يقوله المتصفح) */
function files_detect_type(string $tmp): string {
    if (function_exists('finfo_open')) {
        $f = finfo_open(FILEINFO_MIME_TYPE);
        $t = (string) finfo_file($f, $tmp);
        finfo_close($f);
        // ملفات Word القديمة تطلع أحياناً كـ CDF عام
        if ($t === 'application/CDFV2' || $t === 'application/x-ole-storage') return 'application/msword';
        // docx = ملف ZIP؛ بعض إصدارات finfo تقول zip بس — نتأكد إنه Word من محتواه الداخلي
        if (in_array($t, ['application/zip', 'application/octet-stream'], true)) {
            $head = (string) @file_get_contents($tmp, false, null, 0, 65536);
            if (str_starts_with($head, "PK\x03\x04") && str_contains($head, 'word/')) {
                return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            }
        }
        return $t;
    }
    return 'application/octet-stream';
}

/**
 * POST multipart: kind=legal|support, ticketId (للدعم), file.
 * حماية CSRF: الطلب لازم يحمل ترويسة X-Mz-Upload — نموذج من موقع ثاني ما يقدر يضيفها بدون إذن CORS.
 */
function route_files_upload(): void {
    if (($_SERVER['HTTP_X_MZ_UPLOAD'] ?? '') !== '1') fail(403, 'طلب غير مسموح.', 'FORBIDDEN');
    $u = require_fresh_member();
    if (!office_writable($u)) fail(403, 'انتهت الفترة التجريبية — الرفع متوقف حتى تفعيل الاشتراك.', 'TRIAL_EXPIRED');
    $kind = (string) ($_POST['kind'] ?? '');
    if (!isset(FILE_KINDS[$kind])) fail(422, 'نوع الملف غير صحيح.', 'VALIDATION', ['field' => 'kind']);
    $f = $_FILES['file'] ?? null;
    if (!is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $f['tmp_name'])) {
        fail(422, 'تعذّر استلام الملف.', 'VALIDATION', ['field' => 'file']);
    }
    $size = (int) $f['size'];
    $type = files_detect_type((string) $f['tmp_name']);
    $rule = FILE_KINDS[$kind];
    if ($size <= 0 || $size > $rule['max'] || !in_array($type, $rule['types'], true)) {
        fail(422, 'نوع الملف أو حجمه غير مسموح.', 'VALIDATION', ['field' => 'file']);
    }

    $id = bin2hex(random_bytes(16));
    if ($kind === 'legal') {
        $path = 'legalLibrary/' . $u['id'] . '/' . $id;
    } else {
        $ticketId = (string) ($_POST['ticketId'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $ticketId)) fail(422, 'التذكرة غير صحيحة.', 'VALIDATION', ['field' => 'ticketId']);
        // تذكرة موجودة: لازم يكون من طرفيها. غير موجودة: مرفق لتذكرة جديدة باسمه هو
        $ticket = store_row('supportTickets', '', $ticketId);
        if ($ticket !== null && !is_super_admin($u) && ($ticket['data']->createdBy ?? null) !== (string) $u['id']) store_forbidden();
        $path = "supportAttachments/$ticketId/{$u['id']}/$id";
    }
    $dest = files_authorize($u, $path, true);
    if (!is_dir(dirname($dest)) && !@mkdir(dirname($dest), 0750, true)) fail(503, 'تخزين الملفات غير متاح حالياً.', 'UNAVAILABLE');
    if (!move_uploaded_file((string) $f['tmp_name'], $dest)) fail(503, 'تعذّر حفظ الملف.', 'UNAVAILABLE');
    respond(200, ['path' => $path, 'name' => usubstr((string) $f['name'], 200), 'size' => $size, 'contentType' => $type]);
}

/** GET ?path=... — يرسل الملف بعد التحقق */
function route_files_download(): void {
    $u = require_fresh_member();
    $file = files_authorize($u, (string) ($_GET['path'] ?? ''), false);
    if (!is_file($file)) fail(404, 'الملف غير موجود.', 'NOT_FOUND');
    while (ob_get_level() > 0) ob_end_clean(); // بدون ضغط gzip للملفات الثنائية
    header('Content-Type: ' . files_detect_type($file));
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: attachment');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    readfile($file);
    exit;
}

function route_files_delete(): void {
    $u = require_fresh_member();
    $file = files_authorize($u, (string) (json_body()['path'] ?? ''), true);
    if (is_file($file)) @unlink($file);
    respond(200, ['ok' => true]);
}
