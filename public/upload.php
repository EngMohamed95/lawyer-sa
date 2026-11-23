<?php
/**
 * رفع ملفات القضايا والمستندات والشعار والختم إلى uploads/ (روابط عامة تُحفظ في المستندات).
 *
 * محمي: لازم جلسة عضو مكتب نشط + ترويسة X-Mz-Upload (حماية CSRF — نموذج من موقع ثاني
 * ما يقدر يضيفها). الامتداد من قائمة بيضاء والاسم يُبنى من جديد، فما ينكتب على الخادم
 * ملف يتنفذ (php) أو يشتغل في المتصفح (html/svg). public/.htaccess يمنع تشغيل أي سكربت
 * داخل uploads/ احتياطاً.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/api/_lib/routes_data.php';

const UPLOAD_MAX_BYTES = 52_428_800; // 50MB
const UPLOAD_EXTENSIONS = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'rtf', 'txt', 'csv',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif', 'tif', 'tiff',
    'mp3', 'm4a', 'wav', 'ogg', 'mp4', 'mov', 'zip', 'rar', '7z', 'eml', 'msg',
];

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'طريقة غير مسموحة.', 'METHOD_NOT_ALLOWED');
if (($_SERVER['HTTP_X_MZ_UPLOAD'] ?? '') !== '1') fail(403, 'طلب غير مسموح.', 'FORBIDDEN');

$u = require_fresh_member();
if (!office_writable($u)) fail(403, 'انتهت الفترة التجريبية — الرفع متوقف حتى تفعيل الاشتراك.', 'TRIAL_EXPIRED');

$file = $_FILES['file'] ?? null;
if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
    fail(422, 'تعذّر استلام الملف.', 'VALIDATION', ['field' => 'file']);
}
$size = (int) $file['size'];
if ($size <= 0 || $size > UPLOAD_MAX_BYTES) fail(422, 'حجم الملف أكبر من المسموح (50MB).', 'VALIDATION', ['field' => 'file']);

$original = basename(str_replace('\\', '/', (string) $file['name']));
$ext = strtolower((string) pathinfo($original, PATHINFO_EXTENSION));
if (!in_array($ext, UPLOAD_EXTENSIONS, true)) fail(422, 'نوع الملف غير مسموح برفعه.', 'VALIDATION', ['field' => 'file']);
// المحتوى نفسه مو صفحة ويب متنكرة بامتداد آخر (x.heic فيه <script>) — المتصفح يخمّن النوع
// لو الخادم ما يعرف الامتداد، فيشغّل الصفحة على نطاق الموقع بجلسة من يفتح الرابط
$head = ltrim((string) @file_get_contents((string) $file['tmp_name'], false, null, 0, 1024), "\xEF\xBB\xBF \t\r\n\f");
$sniffed = function_exists('finfo_open') ? (string) finfo_file($fi = finfo_open(FILEINFO_MIME_TYPE), (string) $file['tmp_name']) : '';
if (str_starts_with($head, '<') || preg_match('~^(text/html|text/xml|application/xml|application/xhtml|image/svg)~i', $sniffed)) {
    fail(422, 'محتوى الملف غير مسموح برفعه.', 'VALIDATION', ['field' => 'file']);
}

// الاسم الأصلي يظل مقروءاً (حروف وأرقام فقط، بدون نقاط — ما في امتداد مزدوج مثل x.php.pdf)
$base = preg_replace('/[^\p{L}\p{N}_-]+/u', '_', (string) pathinfo($original, PATHINFO_FILENAME));
$base = trim(usubstr((string) $base, 80), '_');
if ($base === '') $base = 'file';
$fileName = time() . '_' . bin2hex(random_bytes(6)) . '_' . $base . '.' . $ext;

$uploadDir = __DIR__ . '/uploads';
if (!is_dir($uploadDir) && !@mkdir($uploadDir, 0755, true)) fail(503, 'تخزين الملفات غير متاح حالياً.', 'UNAVAILABLE');
// حماية إضافية داخل المجلد نفسه (لو انتقل المجلد أو تغيّر .htaccess الرئيسي)
// (يُعاد كتابته لو تغيّر محتواه — النسخ القديمة تتحدث مع أول رفع)
$guard = $uploadDir . '/.htaccess';
$guardRules = <<<'HT'
# يكتبه public/upload.php — ملفات المستخدمين بيانات فقط: ما يتشغل فيها سكربت ولا تُعرض كصفحة
RemoveHandler .php .phtml .phar .pht .phps .shtml .cgi .pl .py
RemoveType .php .phtml .phar .pht .phps
<FilesMatch "\.(?i:php\d?|phtml|phar|pht|phps|shtml|cgi|pl|py|html?|svg|xml|js)(\.|$)">
  Require all denied
</FilesMatch>
# امتدادات ما يعرفها الخادم دائماً: تنزيل بدل ما يخمّن المتصفح نوعها
AddType application/octet-stream .heic .heif .msg .eml .7z .rar .zip .m4a .odt .ods .rtf .csv
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
</IfModule>

HT;
if (@file_get_contents($guard) !== $guardRules) @file_put_contents($guard, $guardRules);
if (!move_uploaded_file((string) $file['tmp_name'], "$uploadDir/$fileName")) fail(503, 'تعذّر حفظ الملف.', 'UNAVAILABLE');

$appUrl = rtrim((string) (app_config()['app_url'] ?? ''), '/');
if ($appUrl === '') {
    $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $appUrl = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}
respond(200, ['success' => true, 'fileUrl' => "$appUrl/uploads/$fileName", 'fileName' => $fileName]);
