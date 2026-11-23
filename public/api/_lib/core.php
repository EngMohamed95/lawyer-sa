<?php
/**
 * أساس الـ API: الإعداد، اتصال MySQL، قراءة الطلب، والردود.
 * respond() و fail() وأدوات HTTP تأتي من _common.php المشترك مع trial-cleanup.php.
 */

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/_common.php';

/**
 * db-config.php: على الاستضافة في جذر الموقع (محمي بـ .htaccess). محلياً في جذر المشروع
 * خارج public/ — لأن Vite يقدّم ملفات public/ كما هي ويَنسخها لـ dist عند البناء.
 */
function app_config(): array {
    static $config = null;
    if ($config !== null) return $config;
    $file = '';
    foreach ([dirname(__DIR__, 2) . '/db-config.php', dirname(__DIR__, 3) . '/db-config.php'] as $candidate) {
        if (is_file($candidate)) { $file = $candidate; break; }
    }
    // اختبارات التكامل تشغّل php -S بإعداد قاعدة اختبار منفصلة — مسموح فقط على خادم التطوير المدمج
    $override = getenv('MZ_DB_CONFIG');
    if (PHP_SAPI === 'cli-server' && is_string($override) && $override !== '') $file = $override;
    $loaded = is_file($file) ? require $file : null;
    if (!is_array($loaded) || empty($loaded['name']) || empty($loaded['user'])) {
        error_log('api: db-config.php مفقود أو ناقص');
        fail(503, 'الخدمة غير متاحة حالياً. تواصل مع الدعم الفني.', 'NOT_CONFIGURED');
    }
    return $config = $loaded + [
        'host' => '127.0.0.1',
        'port' => 3306,
        'pass' => '',
        'rotate_firebase_passwords' => true,
        'firebase_project_id' => 'lawyer-sa',
        // مفتاح الويب العام لـ Firebase (نفسه اللي في src/lib/firebase.ts — ليس سراً)
        'firebase_web_api_key' => 'AIzaSyDsWX_Lp3FSQVx1zpYSrdlFvKX0AC8gc7U',
        'cookie_secure' => true,
        'app_url' => '',
        'firebase_bridge' => true,
    ];
}

/**
 * false = وضع الاختبار: الملف الشخصي يُقرأ من MySQL وما في أي اتصال بـ Firebase.
 * يُتجاهل خارج خادم التطوير المدمج — الإنتاج دائماً يستخدم الجسر.
 */
function bridge_enabled(): bool {
    return PHP_SAPI !== 'cli-server' || (bool) app_config()['firebase_bridge'];
}

function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $c = app_config();
    try {
        $pdo = new PDO(
            sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], (int) $c['port'], $c['name']),
            (string) $c['user'],
            (string) $c['pass'],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ],
        );
        // كل الأوقات UTC في القاعدة — الواجهة تحوّل للتوقيت المحلي
        $pdo->exec("SET time_zone = '+00:00'");
    } catch (PDOException $e) {
        error_log('api: تعذّر الاتصال بـ MySQL: ' . $e->getMessage());
        fail(503, 'تعذّر الاتصال بقاعدة البيانات. أعد المحاولة بعد قليل.', 'UNAVAILABLE');
    }
    return $pdo;
}

/** استعلام بمعاملات — يرجع PDOStatement */
function q(string $sql, array $params = []): PDOStatement {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function q_one(string $sql, array $params = []): ?array {
    $row = q($sql, $params)->fetch();
    return $row === false ? null : $row;
}

function utc_now(int $offsetSeconds = 0): string {
    return gmdate('Y-m-d H:i:s', time() + $offsetSeconds);
}

function request_method(): string {
    return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
}

/**
 * جسم الطلب JSON. الطلبات اللي تغيّر بيانات لازم تكون application/json:
 * نموذج HTML من موقع ثاني ما يقدر يرسل JSON بدون CORS، فهذا يمنع CSRF مع SameSite.
 */
function json_body(): array {
    static $body = null;
    if ($body !== null) return $body;
    $type = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
    if (!str_starts_with($type, 'application/json')) {
        fail(415, 'نوع الطلب غير مدعوم.', 'UNSUPPORTED_MEDIA_TYPE');
    }
    $raw = (string) file_get_contents('php://input');
    if (strlen($raw) > 1_000_000) fail(413, 'الطلب كبير جداً.', 'PAYLOAD_TOO_LARGE');
    $decoded = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($decoded)) fail(400, 'صيغة الطلب غير صحيحة.', 'BAD_REQUEST');
    return $body = $decoded;
}

/** نص من الجسم بعد التنظيف؛ $max بالحروف */
function body_str(string $key, int $max = 255, bool $required = true): string {
    $v = json_body()[$key] ?? null;
    if (!is_string($v)) {
        if ($required) fail(422, 'بيانات ناقصة.', 'VALIDATION', ['field' => $key]);
        return '';
    }
    $v = trim($v);
    if ($required && $v === '') fail(422, 'بيانات ناقصة.', 'VALIDATION', ['field' => $key]);
    if (ulen($v) > $max) fail(422, 'القيمة أطول من المسموح.', 'VALIDATION', ['field' => $key]);
    return $v;
}

/** كلمة المرور كما هي بدون trim (المسافات جزء منها) */
function body_password(string $key = 'password'): string {
    $v = json_body()[$key] ?? null;
    if (!is_string($v) || $v === '') fail(422, 'أدخل كلمة المرور.', 'VALIDATION', ['field' => $key]);
    if (strlen($v) > 200) fail(422, 'كلمة المرور طويلة جداً.', 'VALIDATION', ['field' => $key]);
    return $v;
}

function normalize_email(string $email): string {
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 191) {
        fail(422, 'البريد الإلكتروني غير صحيح.', 'VALIDATION', ['field' => 'email']);
    }
    return $email;
}

/** نفس شرط Firebase Auth (6 أحرف) عشان ما تتغير تجربة المستخدم */
function assert_new_password(string $password, string $field = 'password'): void {
    if (strlen($password) < 6) {
        fail(422, 'كلمة المرور لازم تكون 6 أحرف على الأقل.', 'WEAK_PASSWORD', ['field' => $field]);
    }
    // bcrypt يتجاهل ما بعد 72 بايت — نرفض بدل ما نخزن كلمة مرور أقصر من اللي كتبها المستخدم
    if (strlen($password) > 72) {
        fail(422, 'كلمة المرور طويلة جداً (الحد 72 حرفاً إنجليزياً أو 36 عربياً).', 'VALIDATION', ['field' => $field]);
    }
}

/** أول $max حرف (لا بايت) — بدون mbstring */
function usubstr(string $s, int $max): string {
    return preg_match('/^.{0,' . $max . '}/us', $s, $m) ? $m[0] : substr($s, 0, $max);
}

function client_ip(): string {
    // على Hostinger الطلب يصل مباشرة لـ Apache — ما نثق بـ X-Forwarded-For (يقدر العميل يزوّره)
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

function random_token(int $bytes = 32): string {
    return b64url_encode(random_bytes($bytes));
}

function token_hash(string $token): string {
    return hash('sha256', $token);
}

/** يولّد معرّف بنفس شكل معرّفات Firebase (28 حرف) عشان يتوافق مع البيانات المنقولة */
function new_id(): string {
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    $id = '';
    for ($i = 0; $i < 28; $i++) $id .= $alphabet[random_int(0, 61)];
    return $id;
}
