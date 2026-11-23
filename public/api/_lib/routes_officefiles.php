<?php
/**
 * ملفات المكاتب المشفّرة: مرفقات القضايا والجلسات والأحكام والمذكرات والشعار والختم.
 *
 *  - التخزين: private_files/office/{tenant}/{id} — خارج مجلد الموقع ومشفّر (filecrypt.php).
 *  - الفتح:   GET files/view?p=office/{tenant}/{id} — لأعضاء نفس المكتب فقط (ولا مدير المنصة).
 *             الرابط لو تسرّب ما يفتح لأحد من برّا المكتب.
 *  - المشاركة: POST files/share ← رابط مؤقت (files/shared?t=...) للعميل، يقدر المكتب يلغيه.
 *  - السجل:   كل فتح ينسجل (مين، متى، أي جهاز، أو برابط مشاركة) — مالك المكتب يراجعه.
 *  - النقل:   files/migrate-legacy ينقل ملفات uploads/ القديمة ويشفّرها ويحدّث روابطها (مدير المنصة).
 */

declare(strict_types=1);

require_once __DIR__ . '/routes_files.php';
require_once __DIR__ . '/filecrypt.php';

/** أنواع تنعرض داخل الصفحة (عارض PDF والصور) — غيرها ينزل كملف */
const OFFICE_INLINE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'application/pdf'];
const OFFICE_EXT_TYPES = [
    'pdf' => 'application/pdf', 'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt' => 'application/vnd.ms-powerpoint', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'odt' => 'application/vnd.oasis.opendocument.text', 'ods' => 'application/vnd.oasis.opendocument.spreadsheet',
    'rtf' => 'application/rtf', 'txt' => 'text/plain', 'csv' => 'text/csv',
    'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp',
    'bmp' => 'image/bmp', 'heic' => 'image/heic', 'heif' => 'image/heif', 'tif' => 'image/tiff', 'tiff' => 'image/tiff',
    'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'mp4' => 'video/mp4', 'mov' => 'video/quicktime',
    'zip' => 'application/zip', 'rar' => 'application/vnd.rar', '7z' => 'application/x-7z-compressed',
    'eml' => 'message/rfc822', 'msg' => 'application/vnd.ms-outlook',
];
const OFFICE_SHARE_MAX_DAYS = 30;

/** DATETIME (UTC) ← ISO مثل toISOString() */
function office_iso(string $dt): string {
    return str_replace(' ', 'T', $dt) . '.000Z';
}

/** نوع الملف للحفظ: من المحتوى للصور وPDF (ما نثق بالامتداد للعرض داخل الصفحة)، وإلا من الامتداد */
function office_file_type(string $tmp, string $ext): string {
    $sniffed = files_detect_type($tmp);
    if (in_array($sniffed, OFFICE_INLINE_TYPES, true)) return $sniffed;
    $byExt = OFFICE_EXT_TYPES[$ext] ?? 'application/octet-stream';
    // امتداد صورة/PDF لكن المحتوى غير ذلك ← ما ينعرض كصورة/PDF
    return in_array($byExt, OFFICE_INLINE_TYPES, true) ? 'application/octet-stream' : $byExt;
}

function office_file_path(string $tenant, string $id): string {
    return files_root() . "/office/$tenant/$id";
}

/** رابط الفتح (نفس النطاق — الكوكي يمشي معه في <img> و<iframe> و fetch) */
function office_file_url(array $row): string {
    $base = rtrim((string) (app_config()['app_url'] ?? ''), '/');
    return "$base/api/v1/files/view?p=office/{$row['tenant']}/{$row['id']}&n=" . rawurlencode((string) $row['name']);
}

/** يشفّر الملف ويحفظه للمكتب. يرجع صف office_files */
function office_file_store(string $tenant, string $src, string $name, string $type, ?string $createdBy, ?string $legacy = null): array {
    filecrypt_require_key();
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $tenant)) throw new InvalidArgumentException('tenant');
    $id = bin2hex(random_bytes(16));
    $dest = office_file_path($tenant, $id);
    if (!is_dir(dirname($dest)) && !@mkdir(dirname($dest), 0750, true)) fail(503, 'تخزين الملفات غير متاح حالياً.', 'UNAVAILABLE');
    $meta = filecrypt_encrypt_file($src, $dest, $id);
    $row = ['id' => $id, 'tenant' => $tenant, 'name' => usubstr($name, 255), 'content_type' => $type,
        'size' => $meta['size'], 'sha256' => $meta['sha256'], 'created_by' => $createdBy, 'legacy_name' => $legacy];
    try {
        q('INSERT INTO office_files (id, tenant, name, content_type, size, sha256, created_by, legacy_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            array_values($row));
    } catch (Throwable $e) {
        @unlink($dest); // ما يبقى ملف مشفّر بلا سجل
        throw $e;
    }
    return $row;
}

function office_file_by_path(string $p): ?array {
    if (!preg_match('#^office/([A-Za-z0-9_-]{1,64})/([a-f0-9]{32})$#', $p, $m)) return null;
    return q_one('SELECT * FROM office_files WHERE id = ? AND tenant = ?', [$m[2], $m[1]]);
}

/** عضو نشط في نفس المكتب — مدير المنصة ما يفتح ملفات المكاتب (سرية المحامي) */
function office_file_member(array $row): array {
    $u = require_fresh_member();
    if (is_super_admin($u) || tenant_of($u) !== $row['tenant']) fail(404, 'الملف غير موجود.', 'NOT_FOUND');
    return $u;
}

function office_file_log(array $row, ?string $userId, bool $viaShare): void {
    // فتح نفس الملف من نفس الشخص خلال 10 دقائق = اطلاع واحد (الصور تتحمل مع كل صفحة)
    if ($userId !== null && q_one('SELECT 1 FROM file_access_log WHERE file_id = ? AND user_id = ? AND created_at > ? LIMIT 1',
        [$row['id'], $userId, utc_now(-600)]) !== null) return;
    q('INSERT INTO file_access_log (file_id, tenant, user_id, via_share, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
        [$row['id'], $row['tenant'], $userId, $viaShare ? 1 : 0, client_ip(), usubstr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 255)]);
    if (random_int(1, 200) === 1) q('DELETE FROM file_access_log WHERE created_at < ? LIMIT 5000', [utc_now(-365 * 86400)]);
}

/** يرسل الملف بعد فكه. PDF والصور داخل الصفحة؛ الباقي تنزيل */
function office_file_send(array $row, bool $shared): void {
    $path = office_file_path((string) $row['tenant'], (string) $row['id']);
    if (!is_file($path)) fail(404, 'الملف غير موجود.', 'NOT_FOUND');
    filecrypt_require_key();
    $type = (string) $row['content_type'];
    $inline = in_array($type, OFFICE_INLINE_TYPES, true);
    if (!$inline && str_starts_with($type, 'text/')) $type = 'application/octet-stream';
    $name = (string) $row['name'];
    $ascii = preg_replace('/[^A-Za-z0-9._-]+/', '_', $name) ?: 'file';

    while (ob_get_level() > 0) ob_end_clean(); // بدون gzip للملفات الثنائية
    header('Content-Type: ' . $type);
    header('Content-Length: ' . (int) $row['size']);
    header(($inline ? 'Content-Disposition: inline' : 'Content-Disposition: attachment') . "; filename=\"$ascii\"; filename*=UTF-8''" . rawurlencode($name));
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: no-referrer');
    // الصور ما تحتاج سكربت؛ عارض PDF في كروم يتعطل مع sandbox فنتركه
    if ($type !== 'application/pdf') header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    // ما يتخزن في المتصفح أبداً — جهاز المكتب المشترك ما يحتفظ بنسخة بعد تسجيل الخروج
    header('Cache-Control: no-store');
    try {
        filecrypt_decrypt_stream($path, (string) $row['id'], function (string $plain): void { echo $plain; flush(); });
    } catch (Throwable $e) {
        error_log("api: فك الملف {$row['id']}: " . $e->getMessage());
    }
    exit;
}

/* ───────────────────────────── المسارات ───────────────────────────── */

function route_office_file_view(): void {
    $row = office_file_by_path((string) ($_GET['p'] ?? ''));
    if ($row === null) { require_user(); fail(404, 'الملف غير موجود.', 'NOT_FOUND'); }
    $u = office_file_member($row);
    office_file_log($row, (string) $u['id'], false);
    office_file_send($row, false);
}

/** رابط مشاركة مؤقت — بدون دخول */
function route_office_file_shared(): void {
    $token = (string) ($_GET['t'] ?? '');
    $share = preg_match('/^[A-Za-z0-9_-]{43}$/', $token)
        ? q_one('SELECT * FROM file_shares WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?', [hash('sha256', $token), utc_now()])
        : null;
    $row = $share !== null ? q_one('SELECT * FROM office_files WHERE id = ? AND tenant = ?', [$share['file_id'], $share['tenant']]) : null;
    // المكتب موقوف، أو اللي أنشأ الرابط ما عاد عضواً نشطاً فيه ← الرابط يتوقف معه
    if ($row !== null) {
        $creator = q_one('SELECT id, email, name, role, lawyer_id, status, deleted_at, data FROM users WHERE id = ?', [$share['created_by']]);
        if ($creator === null || !is_member($creator) || tenant_of($creator) !== $share['tenant']) $row = null;
    }
    if ($row === null) {
        header('Content-Type: text/html; charset=utf-8');
        http_response_code(410);
        echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:Tahoma,Arial;direction:rtl;text-align:center;padding:48px;color:#192a56">'
            . '<h2>انتهت صلاحية هذا الرابط</h2><p>اطلب من مكتب المحاماة رابطاً جديداً.</p></body>';
        exit;
    }
    q('UPDATE file_shares SET uses = uses + 1, last_used_at = ? WHERE token_hash = ?', [utc_now(), $share['token_hash']]);
    office_file_log($row, null, true);
    office_file_send($row, true);
}

/** POST {url|path, days, note} ← رابط مؤقت لملف من ملفات مكتبي */
function route_office_file_share(): void {
    $body = json_body();
    $ref = (string) ($body['url'] ?? $body['path'] ?? '');
    if (preg_match('#[?&]p=(office/[A-Za-z0-9_-]{1,64}/[a-f0-9]{32})#', $ref, $m)) $ref = $m[1];
    $row = office_file_by_path($ref);
    if ($row === null) fail(404, 'الملف غير موجود.', 'NOT_FOUND');
    $u = office_file_member($row);
    $days = (int) ($body['days'] ?? 7);
    if ($days < 1 || $days > OFFICE_SHARE_MAX_DAYS) fail(422, 'مدة الرابط من يوم إلى 30 يوماً.', 'VALIDATION', ['field' => 'days']);
    $token = random_token(32);
    $expires = utc_now($days * 86400);
    q('INSERT INTO file_shares (token_hash, file_id, tenant, created_by, note, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [hash('sha256', $token), $row['id'], $row['tenant'], (string) $u['id'], usubstr((string) ($body['note'] ?? ''), 255) ?: null, $expires]);
    $base = rtrim((string) (app_config()['app_url'] ?? ''), '/');
    respond(200, ['url' => "$base/api/v1/files/shared?t=$token", 'expiresAt' => office_iso($expires), 'days' => $days]);
}

function office_is_owner(array $u): bool {
    return ($u['role'] ?? '') === 'LAWYER' && tenant_of($u) === (string) $u['id'];
}

/** روابط المشاركة: المالك يشوف روابط المكتب كلها، والعضو روابطه هو */
function route_office_file_shares(): void {
    $u = require_fresh_member();
    if (is_super_admin($u)) fail(403, 'ليس لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    $params = [tenant_of($u)];
    $sql = 'SELECT s.token_hash AS id, s.created_by, s.note, s.expires_at, s.revoked_at, s.uses, s.last_used_at, s.created_at,
                   f.name AS file_name, u.name AS created_by_name
              FROM file_shares s JOIN office_files f ON f.id = s.file_id LEFT JOIN users u ON u.id = s.created_by
             WHERE s.tenant = ?';
    if (!office_is_owner($u)) { $sql .= ' AND s.created_by = ?'; $params[] = (string) $u['id']; }
    $rows = q("$sql ORDER BY s.created_at DESC LIMIT 200", $params)->fetchAll();
    $now = utc_now();
    respond(200, ['shares' => array_map(fn($r) => [
        'id' => $r['id'], 'fileName' => $r['file_name'], 'note' => $r['note'], 'createdBy' => $r['created_by_name'] ?? $r['created_by'],
        'createdAt' => office_iso($r['created_at']), 'expiresAt' => office_iso($r['expires_at']), 'uses' => (int) $r['uses'],
        'lastUsedAt' => $r['last_used_at'] !== null ? office_iso($r['last_used_at']) : null,
        'active' => $r['revoked_at'] === null && $r['expires_at'] > $now, 'revoked' => $r['revoked_at'] !== null,
    ], $rows)]);
}

function route_office_file_share_revoke(): void {
    $u = require_fresh_member();
    $id = (string) (json_body()['id'] ?? '');
    $share = preg_match('/^[a-f0-9]{64}$/', $id) ? q_one('SELECT * FROM file_shares WHERE token_hash = ?', [$id]) : null;
    if ($share === null || $share['tenant'] !== tenant_of($u) || (!office_is_owner($u) && $share['created_by'] !== (string) $u['id'])) {
        fail(404, 'الرابط غير موجود.', 'NOT_FOUND');
    }
    q('UPDATE file_shares SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [utc_now(), $id]);
    respond(200, ['ok' => true]);
}

/** سجل الاطلاع — لمالك المكتب فقط */
function route_office_file_access_log(): void {
    $u = require_fresh_member();
    if (!office_is_owner($u)) fail(403, 'سجل الاطلاع لمالك المكتب فقط.', 'FORBIDDEN');
    $rows = q('SELECT l.created_at, l.via_share, l.ip, l.user_agent, f.name AS file_name, u.name AS user_name, u.email AS user_email
                 FROM file_access_log l JOIN office_files f ON f.id = l.file_id LEFT JOIN users u ON u.id = l.user_id
                WHERE l.tenant = ? ORDER BY l.id DESC LIMIT 300', [tenant_of($u)])->fetchAll();
    respond(200, ['entries' => array_map(fn($r) => [
        'at' => office_iso($r['created_at']), 'fileName' => $r['file_name'], 'viaShare' => (bool) $r['via_share'],
        'user' => $r['via_share'] ? null : ($r['user_name'] ?: $r['user_email']), 'ip' => $r['ip'], 'device' => $r['user_agent'],
    ], $rows)]);
}

/* ─────────────── نقل ملفات uploads/ القديمة (مدير المنصة، على دفعات) ─────────────── */

function legacy_upload_dirs(): array {
    $root = dirname(__DIR__, 2);
    return array_values(array_filter([$root . '/uploads', $root . '/dist/uploads'], 'is_dir'));
}

function legacy_upload_file(string $name): ?string {
    $name = basename($name);
    if ($name === '' || $name[0] === '.') return null;
    foreach (legacy_upload_dirs() as $d) if (is_file("$d/$name")) return "$d/$name";
    return null;
}

/** المكتب صاحب المستند — من lawyerId، أو المستخدم نفسه، أو إعدادات المكتب، أو السجل الأم */
function legacy_doc_tenant(array $doc): ?string {
    if ($doc['lawyer_id'] !== null && $doc['lawyer_id'] !== '' && $doc['lawyer_id'] !== 'ALL') return (string) $doc['lawyer_id'];
    if ($doc['parent_path'] === '' && $doc['collection'] === 'office_settings') return (string) $doc['id'];
    if ($doc['parent_path'] === '' && $doc['collection'] === 'users') {
        $usr = q_one('SELECT id, role, lawyer_id FROM users WHERE id = ?', [$doc['id']]);
        if ($usr === null || $usr['role'] === 'SUPER_ADMIN') return null;
        return $usr['lawyer_id'] !== null && $usr['lawyer_id'] !== '' ? (string) $usr['lawyer_id'] : (string) $usr['id'];
    }
    if ($doc['parent_path'] !== '') {
        $segs = explode('/', (string) $doc['parent_path']);
        $parent = q_one("SELECT lawyer_id FROM docs WHERE collection = ? AND parent_path = '' AND id = ?", [$segs[0], $segs[1] ?? '']);
        if ($parent !== null && $parent['lawyer_id'] !== null && $parent['lawyer_id'] !== '') return (string) $parent['lawyer_id'];
    }
    return null;
}

/**
 * كل المكاتب اللي لها صلة بملف قديم: مستنداتها تذكر اسمه (بأي صيغة) + اللي انتقل لها من قبل.
 * [tenant => true]
 */
function legacy_file_tenants(string $name): array {
    static $cache = [];
    if (isset($cache[$name])) return $cache[$name];
    $like = fn(string $s) => '%' . addcslashes($s, '%_\\') . '%';
    $out = [];
    $rows = q('SELECT collection, parent_path, id, lawyer_id FROM docs WHERE data LIKE ? OR data LIKE ? OR data LIKE ?',
        [$like($name), $like(rawurlencode($name)), $like(trim((string) json_encode($name), '"'))])->fetchAll();
    foreach ($rows as $doc) {
        $t = legacy_doc_tenant($doc);
        $out[$t ?? '?'] = true; // مستند ما نعرف مكتبه = طرف مجهول ← تعارض
    }
    foreach (q('SELECT tenant FROM office_files WHERE legacy_name = ?', [$name])->fetchAll() as $r) $out[(string) $r['tenant']] = true;
    return $cache[$name] = $out;
}

/** يمر على كل النصوص في القيمة ويستبدل روابط /uploads/ بروابط الملفات المشفرة */
function legacy_rewrite($value, callable $replace) {
    if (is_object($value)) { foreach ($value as $k => $v) $value->$k = legacy_rewrite($v, $replace); return $value; }
    if (is_array($value)) { foreach ($value as $k => $v) $value[$k] = legacy_rewrite($v, $replace); return $value; }
    if (!is_string($value) || !str_contains($value, 'uploads/')) return $value;
    return preg_replace_callback('~(?:https?://[^\s"\'<>/]+)?/(?:dist/)?uploads/([^/?#"\'<>\s]+)~u', $replace, $value);
}

/** POST {cursor?} ← دفعة مستندات فيها روابط uploads/. يكرر حتى done */
function route_office_files_migrate(): void {
    $u = require_fresh_member();
    if (!is_super_admin($u)) store_forbidden();
    filecrypt_require_key();
    @set_time_limit(120);
    $cur = json_body()['cursor'] ?? null;
    $c = is_array($cur) ? [(string) ($cur['c'] ?? ''), (string) ($cur['p'] ?? ''), (string) ($cur['i'] ?? '')] : ['', '', ''];
    $docs = q("SELECT collection, parent_path, id, lawyer_id, data FROM docs
                WHERE data LIKE '%uploads%' AND (collection, parent_path, id) > (?, ?, ?)
                ORDER BY collection, parent_path, id LIMIT 25", $c)->fetchAll();
    $stats = ['scanned' => count($docs), 'docsUpdated' => 0, 'filesMigrated' => 0, 'missing' => 0, 'unassigned' => 0];
    $conflicts = [];
    foreach ($docs as $doc) {
        $tenant = legacy_doc_tenant($doc);
        $data = json_decode((string) $doc['data'], false);
        if ($tenant === null || $data === null) { $stats['unassigned']++; continue; }
        $changed = false;
        $data = legacy_rewrite($data, function (array $m) use ($tenant, &$stats, &$changed, &$conflicts, $u): string {
            $name = basename(rawurldecode($m[1]));
            $row = q_one('SELECT * FROM office_files WHERE tenant = ? AND legacy_name = ?', [$tenant, $name]);
            if ($row === null) {
                // ملف يذكره أكثر من مكتب (أو انتقل لمكتب ثاني قبل) ما ينسخ لأحد: مكتب يقدر يحط رابط
                // ملف قديم لغيره في مستنداته فياخذ نسخة دائمة. يظل في المجلد المقفل للمراجعة اليدوية.
                $owners = legacy_file_tenants($name);
                if (count($owners) !== 1 || !isset($owners[$tenant])) {
                    $conflicts[$name] = array_keys($owners);
                    return $m[0];
                }
                $src = legacy_upload_file($name);
                if ($src === null) { $stats['missing']++; return $m[0]; }
                $ext = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
                // الاسم القديم: {وقت}_{عشوائي}_{الاسم}.ext — نرجّع الاسم المقروء
                $display = preg_replace('/^\d{9,}_(?:[a-f0-9]{8,12}_)?/', '', $name) ?: $name;
                $row = office_file_store($tenant, $src, $display, office_file_type($src, $ext), (string) $u['id'], $name);
                $stats['filesMigrated']++;
            }
            $changed = true;
            return office_file_url($row);
        });
        if ($changed) {
            q('UPDATE docs SET data = ? WHERE collection = ? AND parent_path = ? AND id = ?',
                [json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION), $doc['collection'], $doc['parent_path'], $doc['id']]);
            $stats['docsUpdated']++;
        }
    }
    $last = end($docs);
    respond(200, $stats + [
        'conflicts' => array_map(fn($n, $t) => ['file' => $n, 'offices' => $t], array_keys($conflicts), array_values($conflicts)),
        'done' => count($docs) < 25,
        'cursor' => $last ? ['c' => $last['collection'], 'p' => $last['parent_path'], 'i' => $last['id']] : $cur,
    ]);
}

/**
 * POST — بعد ما يخلص النقل: يتأكد إن كل نسخة مشفرة تنفك وتطابق الأصل، ثم يحذف الأصل،
 * ويقفل مجلد uploads/ بالكامل (حتى الملفات اللي ما يذكرها أي مستند).
 */
function route_office_files_migrate_finalize(): void {
    $u = require_fresh_member();
    if (!is_super_admin($u)) store_forbidden();
    filecrypt_require_key();
    @set_time_limit(300);
    $deleted = 0; $kept = 0;
    foreach (q('SELECT * FROM office_files WHERE legacy_name IS NOT NULL')->fetchAll() as $row) {
        $src = legacy_upload_file((string) $row['legacy_name']);
        if ($src === null) continue;
        // ملف ينذكر عند أكثر من مكتب: كل نسخة لازم تكون سليمة قبل حذف الأصل
        $copies = q('SELECT * FROM office_files WHERE legacy_name = ?', [$row['legacy_name']])->fetchAll();
        $ok = true;
        foreach ($copies as $copy) {
            $ok = $ok && filecrypt_verify(office_file_path((string) $copy['tenant'], (string) $copy['id']), (string) $copy['id'], (string) $copy['sha256'])
                && hash_equals((string) $copy['sha256'], (string) hash_file('sha256', $src));
        }
        if ($ok && @unlink($src)) $deleted++; else $kept++;
    }
    $remaining = 0;
    foreach (legacy_upload_dirs() as $d) {
        foreach (scandir($d) ?: [] as $f) if ($f[0] !== '.' && is_file("$d/$f")) $remaining++;
        @file_put_contents("$d/.htaccess", "# مقفل — ملفات المكاتب صارت مشفّرة في private_files (api/_lib/routes_officefiles.php)\nRequire all denied\n");
    }
    respond(200, ['deleted' => $deleted, 'keptUnverified' => $kept, 'unreferencedLocked' => $remaining]);
}
