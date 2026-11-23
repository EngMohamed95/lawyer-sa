-- ─────────────────────────────────────────────────────────────────────────────
-- سكيمة MySQL لموازين — تُطبَّق كما هي على قاعدة فاضية أو موجودة (IF NOT EXISTS).
--
-- مبادئ الأداء (الموقع ما يتأثر بحجم البيانات):
--   • كل جدول بيانات مكتب يبدأ فهرسه المركّب بـ lawyer_id — كل استعلام محصور بمكتب واحد
--   • المعرّفات VARCHAR(64) تحفظ معرّفات Firestore كما هي فالروابط ما تنكسر عند النقل
--   • الحقول اللي نفلتر ونرتب بها أعمدة حقيقية مفهرسة، والباقي في عمود data (JSON)
--   • InnoDB + utf8mb4_unicode_ci للعربي
--
-- المرحلة 0/1: الحسابات والجلسات. جداول المراحل التالية تُضاف هنا مرحلةً مرحلة.
-- ─────────────────────────────────────────────────────────────────────────────

SET NAMES utf8mb4;

-- جدول التجربة من database/check_db.sql (لو انشغّل قبل السكيمة)
DROP TABLE IF EXISTS zz_compat_docs;

-- الحسابات. في المرحلة 1 مصدر الحقيقة للملف الشخصي ما زال Firestore (users/{id}) لأن
-- firestore.rules تعتمد عليه، وهذا الجدول يحمل بيانات الدخول + نسخة من الحقول الحساسة
-- تتحدث عند كل دخول. في المرحلة 2 يصير هذا الجدول هو المصدر.
CREATE TABLE IF NOT EXISTS users (
  id                     VARCHAR(64)  NOT NULL,
  email                  VARCHAR(191) NOT NULL,              -- بحروف صغيرة دائماً
  password_hash          VARCHAR(255) NULL,                  -- NULL = لم يُنقل بعد (يُنقل عند أول دخول)
  name                   VARCHAR(255) NOT NULL DEFAULT '',
  role                   VARCHAR(32)  NOT NULL DEFAULT 'PENDING',
  lawyer_id              VARCHAR(64)  NULL,                  -- المكتب؛ المالك NULL أو = id، مدير المنصة 'ALL'
  status                 VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
  deleted_at             DATETIME     NULL,
  data                   JSON         NULL,                  -- باقي حقول الملف الشخصي (المرحلة 2)
  firebase_pw_rotated_at DATETIME     NULL,                  -- كلمة مرور Firebase استُبدلت بقيمة عشوائية
  profile_synced_at      DATETIME     NULL,                  -- آخر نسخ للدور/الحالة/الاشتراك من Firestore
  last_login_at          DATETIME     NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_tenant_role (lawyer_id, role),
  KEY ix_users_role_status (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- الجلسات: الكوكي يحمل توكن عشوائي، والجدول يخزن SHA-256 له فقط
-- (تسريب الجدول ما يعطي جلسات صالحة).
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash   CHAR(64)     NOT NULL,
  user_id      VARCHAR(64)  NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME     NOT NULL,
  persistent   TINYINT(1)   NOT NULL DEFAULT 0,         -- «تذكرني»: 30 يوم ويتجدد مع الاستخدام
  ip           VARCHAR(45)  NULL,
  user_agent   VARCHAR(255) NULL,
  PRIMARY KEY (token_hash),
  KEY ix_sessions_user (user_id),
  KEY ix_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- استعادة كلمة المرور: التوكن يُرسل بالبريد، والجدول يخزن الـ hash فقط. صالح لمرة وحدة.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash CHAR(64)    NOT NULL,
  user_id    VARCHAR(64) NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME    NOT NULL,
  used_at    DATETIME    NULL,
  PRIMARY KEY (token_hash),
  KEY ix_resets_user (user_id, created_at),
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- محاولات الدخول للحد من التخمين. تُنظَّف تلقائياً (أقدم من يوم) فما يكبر الجدول.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email      VARCHAR(191)    NOT NULL,
  ip         VARCHAR(45)     NOT NULL,
  success    TINYINT(1)      NOT NULL DEFAULT 0,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_attempts_email (email, created_at),
  KEY ix_attempts_ip (ip, created_at),
  KEY ix_attempts_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- متوافق مع MySQL 8 و MariaDB 10.6+ (Hostinger): ما نستخدم CAST(.. AS JSON) ولا MEMBER OF ولا ->>.
-- بيانات المكاتب (المرحلة 2 وما بعدها): جدول واحد بنفس شكل مستندات Firestore.
--   collection  : اسم المجموعة (cases، clients، tasks، hearings، documents…)
--   parent_path : '' للمجموعة الرئيسية، و'cases/{id}' للمجموعة الفرعية
--   data        : المستند كاملاً (JSON) — مصدر الحقيقة الوحيد
-- الأعمدة المولّدة (lawyer_id، case_id…) نسخ مفهرسة من data تتحدث تلقائياً، فكل
-- استعلام مكتب يمر من الفهرس مهما كبر الجدول. المجموعات اللي انتقلت تُحدَّد في
-- public/api/_lib/store.php (STORE_ROOTS) وsrc/lib/store.ts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS docs (
  collection  VARCHAR(64)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  parent_path VARCHAR(400) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  id          VARCHAR(64)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  data        JSON NOT NULL,
  lawyer_id   VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
              AS (CASE WHEN JSON_TYPE(JSON_EXTRACT(data, '$.lawyerId')) = 'STRING' THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$.lawyerId')) END) STORED,
  case_id     VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
              AS (CASE WHEN JSON_TYPE(JSON_EXTRACT(data, '$.caseId')) = 'STRING' THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$.caseId')) END) STORED,
  client_id   VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
              AS (CASE WHEN JSON_TYPE(JSON_EXTRACT(data, '$.clientId')) = 'STRING' THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$.clientId')) END) STORED,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (collection, parent_path, id),
  KEY ix_docs_tenant (collection, lawyer_id, created_at),
  KEY ix_docs_case (collection, lawyer_id, case_id),
  KEY ix_docs_client (collection, lawyer_id, client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- التسجيل الذاتي قبل تأكيد البريد: الرمز (HMAC فقط) وبيانات المكتب وكلمة المرور (bcrypt).
-- يُحذف الصف عند التأكيد؛ الصفوف القديمة تنظف نفسها (أقدم من يوم) مع كل طلب.
CREATE TABLE IF NOT EXISTS signup_pending (
  email        VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  profile      JSON         NOT NULL,
  code_hash    CHAR(64)     NOT NULL,
  expires_at   DATETIME     NOT NULL,
  attempts     INT          NOT NULL DEFAULT 0,
  last_sent_at DATETIME     NOT NULL,
  sent_count   INT          NOT NULL DEFAULT 1,
  window_start DATETIME     NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (email),
  KEY ix_signup_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ملفات المكاتب (مرفقات القضايا، المحاضر، الأحكام، المذكرات، الشعار، الختم):
-- المحتوى مشفّر AES-256-GCM في private_files/office/{tenant}/{id} خارج مجلد الموقع،
-- وهنا بياناته فقط. legacy_name = اسم الملف القديم في uploads/ لو انتقل منه.
CREATE TABLE IF NOT EXISTS office_files (
  id           CHAR(32)     NOT NULL,
  tenant       VARCHAR(64)  NOT NULL,
  name         VARCHAR(255) NOT NULL,
  content_type VARCHAR(127) NOT NULL,
  size         BIGINT       NOT NULL,
  sha256       CHAR(64)     NOT NULL,
  created_by   VARCHAR(64)  NULL,
  legacy_name  VARCHAR(255) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_files_tenant (tenant, created_at),
  UNIQUE KEY ux_files_legacy (tenant, legacy_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- روابط مشاركة مؤقتة (للعميل عبر واتساب مثلاً): التوكن يُرسل، والجدول يخزن الـ hash فقط
CREATE TABLE IF NOT EXISTS file_shares (
  token_hash   CHAR(64)     NOT NULL,
  file_id      CHAR(32)     NOT NULL,
  tenant       VARCHAR(64)  NOT NULL,
  created_by   VARCHAR(64)  NOT NULL,
  note         VARCHAR(255) NULL,
  expires_at   DATETIME     NOT NULL,
  revoked_at   DATETIME     NULL,
  uses         INT          NOT NULL DEFAULT 0,
  last_used_at DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY ix_shares_tenant (tenant, created_at),
  KEY ix_shares_file (file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- سجل الاطلاع على ملفات المكتب: مين فتح أي ملف ومتى ومن أي جهاز (أو برابط مشاركة)
CREATE TABLE IF NOT EXISTS file_access_log (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  file_id    CHAR(32)     NOT NULL,
  tenant     VARCHAR(64)  NOT NULL,
  user_id    VARCHAR(64)  NULL,
  via_share  TINYINT(1)   NOT NULL DEFAULT 0,
  ip         VARCHAR(45)  NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_access_tenant (tenant, created_at),
  KEY ix_access_file (file_id, user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- تخزين مؤقت صغير (مثل توكن وصول حساب الخدمة) — بدل ملفات مؤقتة على استضافة مشتركة.
CREATE TABLE IF NOT EXISTS app_cache (
  k          VARCHAR(128) NOT NULL,
  v          MEDIUMTEXT   NOT NULL,
  expires_at DATETIME     NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
