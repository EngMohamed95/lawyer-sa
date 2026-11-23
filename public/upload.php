<?php
/**
 * رفع ملفات المكاتب: مرفقات القضايا والمستندات والمحاضر والأحكام والمذكرات والشعار والختم.
 *
 * الملف ينحفظ مشفّراً (AES-256-GCM) في private_files/office/{مكتبك}/ خارج مجلد الموقع،
 * والرابط الراجع (fileUrl) يمر على /api/v1/files/view — يفتح لأعضاء مكتبك فقط، فلو تسرب
 * الرابط ما يفتح لأحد ثاني. نفس شكل الرد القديم { success, fileUrl, fileName } فالواجهة ما تتغير.
 *
 * محمي: جلسة عضو مكتب نشط + ترويسة X-Mz-Upload (حماية CSRF). الامتداد من قائمة بيضاء،
 * والمحتوى ما يكون صفحة ويب متنكرة.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/api/_lib/routes_data.php';
require_once __DIR__ . '/api/_lib/routes_officefiles.php';

// خطأ غير متوقع: رسالة عامة فقط (بدون مسارات السيرفر أو تفاصيل القاعدة)
set_exception_handler(function (Throwable $e): void {
    error_log('upload: ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) http_response_code(500);
    echo json_encode(['error' => 'تعذّر حفظ الملف. أعد المحاولة.', 'code' => 'INTERNAL'], JSON_UNESCAPED_UNICODE);
});

const UPLOAD_MAX_BYTES = 52_428_800; // 50MB

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'طريقة غير مسموحة.', 'METHOD_NOT_ALLOWED');
if (($_SERVER['HTTP_X_MZ_UPLOAD'] ?? '') !== '1') fail(403, 'طلب غير مسموح.', 'FORBIDDEN');

$u = require_fresh_member();
if (is_super_admin($u)) fail(403, 'رفع ملفات المكاتب لأعضاء المكتب فقط.', 'FORBIDDEN');
if (!office_writable($u)) fail(403, 'انتهت الفترة التجريبية — الرفع متوقف حتى تفعيل الاشتراك.', 'TRIAL_EXPIRED');

$file = $_FILES['file'] ?? null;
if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
    fail(422, 'تعذّر استلام الملف.', 'VALIDATION', ['field' => 'file']);
}
$tmp = (string) $file['tmp_name'];
$size = (int) $file['size'];
if ($size <= 0 || $size > UPLOAD_MAX_BYTES) fail(422, 'حجم الملف أكبر من المسموح (50MB).', 'VALIDATION', ['field' => 'file']);

$original = basename(str_replace('\\', '/', (string) $file['name']));
$ext = strtolower((string) pathinfo($original, PATHINFO_EXTENSION));
if (!isset(OFFICE_EXT_TYPES[$ext])) fail(422, 'نوع الملف غير مسموح برفعه.', 'VALIDATION', ['field' => 'file']);
// المحتوى نفسه مو صفحة ويب متنكرة بامتداد آخر (x.heic فيه <script>)
$head = ltrim((string) @file_get_contents($tmp, false, null, 0, 1024), "\xEF\xBB\xBF \t\r\n\f");
if (str_starts_with($head, '<') || preg_match('~^(text/html|text/xml|application/xml|application/xhtml|image/svg)~i', files_detect_type($tmp))) {
    fail(422, 'محتوى الملف غير مسموح برفعه.', 'VALIDATION', ['field' => 'file']);
}

$name = trim((string) preg_replace('/[\x00-\x1F\x7F"\\\\\/]+/u', '_', $original)) ?: "file.$ext";
$row = office_file_store(tenant_of($u), $tmp, $name, office_file_type($tmp, $ext), (string) $u['id']);
respond(200, ['success' => true, 'fileUrl' => office_file_url($row), 'fileName' => $row['name']]);
