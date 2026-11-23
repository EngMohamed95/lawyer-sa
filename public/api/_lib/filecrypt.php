<?php
/**
 * تشفير ملفات المكاتب على القرص — AES-256-GCM على أجزاء (1MB) عشان ملف 50MB ما يحتاج ذاكرة كبيرة.
 *
 * الصيغة: "MZF1" + معرّف المفتاح (8) + بادئة nonce (8) ثم أجزاء:
 *   [علم آخر جزء: 1 بايت][طول النص المشفر: 4][النص المشفر][وسم GCM: 16]
 * nonce كل جزء = البادئة + رقم الجزء. والبيانات الإضافية (AAD) فيها معرّف الملف ورقم الجزء وعلم
 * النهاية — فما أحد يبدّل أجزاء بين ملفين، ولا يعيد ترتيبها، ولا يقص آخر الملف بدون ما ننتبه.
 *
 * المفتاح من الإعداد 'files_key' (32 بايت base64) — من GitHub Secrets وقت النشر، ما يدخل المستودع.
 * مفاتيح قديمة (بعد التدوير) في 'files_keys_old' تظل تفك الملفات القديمة.
 */

declare(strict_types=1);

const FILECRYPT_MAGIC = 'MZF1';
const FILECRYPT_CHUNK = 1_048_576;

/** [معرّف => مفتاح خام]؛ الأول هو الحالي. فاضي = التشفير غير مضبوط */
function filecrypt_keys(): array {
    $cfg = app_config();
    $out = [];
    foreach (array_merge([(string) ($cfg['files_key'] ?? '')], array_map('strval', (array) ($cfg['files_keys_old'] ?? []))) as $b64) {
        $raw = base64_decode(trim($b64), true);
        if ($raw !== false && strlen($raw) === 32) $out[substr(hash('sha256', "mz-files|$raw"), 0, 8)] = $raw;
    }
    return $out;
}

function filecrypt_require_key(): void {
    if (filecrypt_keys() === [] || !in_array('aes-256-gcm', openssl_get_cipher_methods(), true)) {
        error_log('api: مفتاح تشفير الملفات (files_key) غير مضبوط');
        fail(503, 'تخزين الملفات غير متاح حالياً.', 'UNAVAILABLE');
    }
}

function filecrypt_aad(string $fileId, int $i, bool $last): string {
    return FILECRYPT_MAGIC . "|$fileId|$i|" . ($last ? '1' : '0');
}

/**
 * يشفّر $src إلى $dest (يكتب ملفاً مؤقتاً ثم يعيد تسميته). يرجع ['size' => ..., 'sha256' => ...] للنص الأصلي.
 */
function filecrypt_encrypt_file(string $src, string $dest, string $fileId): array {
    $keys = filecrypt_keys();
    $kid = (string) array_key_first($keys);
    $key = $keys[$kid];
    $prefix = random_bytes(8);
    $in = fopen($src, 'rb');
    $tmp = $dest . '.part';
    $out = fopen($tmp, 'wb');
    if ($in === false || $out === false) throw new RuntimeException('filecrypt: تعذّر فتح الملفات');
    $hash = hash_init('sha256');
    $size = 0;
    try {
        fwrite($out, FILECRYPT_MAGIC . $kid . $prefix);
        $i = 0;
        $chunk = (string) fread($in, FILECRYPT_CHUNK);
        while (true) {
            $next = feof($in) ? '' : (string) fread($in, FILECRYPT_CHUNK);
            $last = $next === '' && feof($in);
            hash_update($hash, $chunk);
            $size += strlen($chunk);
            $tag = '';
            $ct = openssl_encrypt($chunk, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $prefix . pack('N', $i), $tag, filecrypt_aad($fileId, $i, $last), 16);
            if ($ct === false) throw new RuntimeException('filecrypt: فشل التشفير');
            fwrite($out, ($last ? "\x01" : "\x00") . pack('N', strlen($ct)) . $ct . $tag);
            if ($last) break;
            $chunk = $next;
            $i++;
        }
    } catch (Throwable $e) {
        fclose($in); fclose($out); @unlink($tmp);
        throw $e;
    }
    fclose($in);
    fclose($out);
    if (!@rename($tmp, $dest)) { @unlink($tmp); throw new RuntimeException('filecrypt: تعذّر حفظ الملف'); }
    @chmod($dest, 0640);
    return ['size' => $size, 'sha256' => hash_final($hash)];
}

/**
 * يفك $path ويمرر النص الأصلي جزءاً جزءاً لـ $emit. يرمي استثناء لو الملف معدّل أو ناقص
 * (أي جزء ما يطابق وسمه) أو المفتاح مو موجود.
 */
function filecrypt_decrypt_stream(string $path, string $fileId, callable $emit): void {
    $in = @fopen($path, 'rb');
    if ($in === false) throw new RuntimeException('filecrypt: الملف غير موجود');
    try {
        $head = (string) fread($in, 20);
        if (strlen($head) !== 20 || substr($head, 0, 4) !== FILECRYPT_MAGIC) throw new RuntimeException('filecrypt: صيغة غير معروفة');
        $kid = substr($head, 4, 8);
        $prefix = substr($head, 12, 8);
        $key = filecrypt_keys()[$kid] ?? null;
        if ($key === null) throw new RuntimeException("filecrypt: مفتاح $kid غير متوفر");
        for ($i = 0; ; $i++) {
            $meta = (string) fread($in, 5);
            if (strlen($meta) !== 5) throw new RuntimeException('filecrypt: الملف ناقص');
            $last = $meta[0] === "\x01";
            $len = unpack('N', substr($meta, 1))[1];
            if ($len > FILECRYPT_CHUNK + 32) throw new RuntimeException('filecrypt: جزء غير صالح');
            $ct = $len > 0 ? (string) fread($in, $len) : '';
            $tag = (string) fread($in, 16);
            if (strlen($ct) !== $len || strlen($tag) !== 16) throw new RuntimeException('filecrypt: الملف ناقص');
            $plain = openssl_decrypt($ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $prefix . pack('N', $i), $tag, filecrypt_aad($fileId, $i, $last));
            if ($plain === false) throw new RuntimeException('filecrypt: فشل التحقق من سلامة الملف');
            $emit($plain);
            if ($last) {
                if (fread($in, 1) !== '') throw new RuntimeException('filecrypt: بيانات زائدة بعد نهاية الملف');
                return;
            }
        }
    } finally {
        fclose($in);
    }
}

/** sha256 للنص الأصلي بعد الفك — للتأكد إن النسخة المشفرة سليمة قبل حذف الأصل */
function filecrypt_verify(string $path, string $fileId, string $sha256): bool {
    try {
        $h = hash_init('sha256');
        filecrypt_decrypt_stream($path, $fileId, function (string $p) use ($h) { hash_update($h, $p); });
        return hash_equals($sha256, hash_final($h));
    } catch (Throwable $e) {
        error_log('api: ' . $e->getMessage());
        return false;
    }
}
