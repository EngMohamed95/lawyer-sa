<?php
/**
 * جلسات الدخول: كوكي HttpOnly يحمل توكن عشوائي، والقاعدة تخزن SHA-256 له.
 * «تذكرني» = 30 يوم تتجدد مع الاستخدام؛ بدونها = كوكي جلسة المتصفح و12 ساعة كحد أقصى.
 */

declare(strict_types=1);

require_once __DIR__ . '/core.php';

const SESSION_PERSISTENT_TTL = 30 * 86400;
/** «تذكرني» تتجدد مع الاستخدام، لكن بحد أقصى مطلق — بعده دخول جديد */
const SESSION_ABSOLUTE_MAX = 90 * 86400;

/**
 * __Host- يمنع أي نطاق فرعي يكتب فوق الكوكي — يحتاج Secure، فمحلياً (HTTP) الاسم العادي
 */
function session_cookie_name(): string {
    return app_config()['cookie_secure'] ? '__Host-mz_session' : 'mz_session';
}
const SESSION_BROWSER_TTL = 12 * 3600;
/** ما نحدّث last_seen_at مع كل طلب — مرة كل 5 دقائق تكفي وتخفف الكتابة */
const SESSION_TOUCH_EVERY = 300;

function session_set_cookie(string $value, int $expires): void {
    setcookie(session_cookie_name(), $value, [
        'expires' => $expires,
        'path' => '/',
        'secure' => (bool) app_config()['cookie_secure'],
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function session_create(string $userId, bool $persistent): void {
    // تنظيف الجلسات المنتهية بين حين وآخر — فالجدول ما يكبر بلا حد
    if (random_int(1, 50) === 1) q('DELETE FROM auth_sessions WHERE expires_at < ? LIMIT 1000', [utc_now()]);

    $token = random_token();
    $ttl = $persistent ? SESSION_PERSISTENT_TTL : SESSION_BROWSER_TTL;
    q('INSERT INTO auth_sessions (token_hash, user_id, expires_at, persistent, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)', [
        token_hash($token), $userId, utc_now($ttl), $persistent ? 1 : 0, client_ip(),
        usubstr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 255),
    ]);
    session_set_cookie($token, $persistent ? time() + $ttl : 0);
}

function session_token(): ?string {
    $token = $_COOKIE[session_cookie_name()] ?? null;
    return is_string($token) && $token !== '' && strlen($token) <= 128 ? $token : null;
}

/** المستخدم الحالي من الكوكي، أو null. الحساب المحذوف ما يرجع حتى لو جلسته باقية. */
function session_user(): ?array {
    static $cached = false;
    if ($cached !== false) return $cached;
    $token = session_token();
    if ($token === null) return $cached = null;

    $row = q_one(
        'SELECT s.token_hash, s.expires_at, s.last_seen_at, s.persistent,
                u.id, u.email, u.name, u.role, u.lawyer_id, u.status, u.deleted_at, u.data
           FROM auth_sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > ? AND s.created_at > ?',
        [token_hash($token), utc_now(), utc_now(-SESSION_ABSOLUTE_MAX)],
    );
    if ($row === null) return $cached = null;

    if (strtotime($row['last_seen_at'] . ' UTC') < time() - SESSION_TOUCH_EVERY) {
        if ($row['persistent']) {
            q('UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?',
                [utc_now(), utc_now(SESSION_PERSISTENT_TTL), $row['token_hash']]);
            session_set_cookie($token, time() + SESSION_PERSISTENT_TTL);
        } else {
            q('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?', [utc_now(), $row['token_hash']]);
        }
    }
    unset($row['token_hash'], $row['expires_at'], $row['last_seen_at'], $row['persistent']);
    $row['data'] = $row['data'] !== null ? (json_decode((string) $row['data'], true) ?: []) : [];
    return $cached = $row;
}

function require_user(): array {
    $user = session_user();
    if ($user === null) fail(401, 'انتهت الجلسة. سجّل الدخول مرة أخرى.', 'UNAUTHENTICATED');
    return $user;
}

function session_destroy_current(): void {
    $token = session_token();
    if ($token !== null) q('DELETE FROM auth_sessions WHERE token_hash = ?', [token_hash($token)]);
    session_set_cookie('', time() - 3600);
}

/** بعد تغيير/استعادة كلمة المرور: كل الأجهزة الثانية تخرج */
function session_destroy_others(string $userId): void {
    $token = session_token();
    q('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash <> ?', [$userId, $token !== null ? token_hash($token) : '']);
}
