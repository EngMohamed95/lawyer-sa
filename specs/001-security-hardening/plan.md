# 001 — خطة التنفيذ التقنية

## الملفات الجديدة

```
src/server/
├── middleware/
│   ├── auth.ts            requireAuth · requireRole · requireTenant
│   ├── rateLimit.ts       حدّ المعدل بالذاكرة (ثم Redis لاحقاً)
│   └── errorHandler.ts    معالج أخطاء موحّد يمنع تسريب Stack Traces
├── lib/
│   ├── claims.ts          setUserClaims · syncClaimsFromFirestore
│   ├── storage.ts         uploadToStorage · getSignedUrl · deleteFromStorage
│   └── validate.ts        مدقّقات مدخلات (zod)
└── routes/
    ├── files.ts           POST /api/files/upload · GET /api/files/:id/url
    └── ai.ts              POST /api/ai/generate · POST /api/ai/extract-text

src/lib/
├── session.ts             getIdToken · authFetch (يرفق Authorization تلقائياً)
└── uploadClient.ts        غلاف موحّد للرفع (يختار المسار الجديد أولاً)

firestore.rules            ← ملف قواعد حقيقي (يُنشر عبر CLI)
storage.rules              ← جديد
firebase.json              ← جديد (نشر القواعد)
scripts/
├── backfill-lawyerId.mjs  سكربت idempotent لملء lawyerId الناقص
├── sync-all-claims.mjs    منح Custom Claims لكل المستخدمين الحاليين
└── rotate-secrets.md      دليل تدوير المفاتيح
tests/
├── rules/firestore.rules.test.ts
└── api/auth.test.ts
```

> `firestore.rules.txt` القديم **يبقى** كمرجع تاريخي (المبدأ 1)، ويُضاف في أعلاه سطر `DEPRECATED — انظر firestore.rules`.

---

## الملفات المعدَّلة (تحصين فقط، بلا حذف)

| الملف | التعديل |
|---|---|
| `src/server/api.ts` | إضافة `requireAuth` قبل كل المسارات + حراس أدوار + `zod` للمدخلات. لا يُحذف أي مسار |
| `public/upload.php` | إضافة توكن + قائمة امتدادات بيضاء + حد حجم + `.htaccess` منع التنفيذ |
| `server.ts` | تركيب `helmet` · `rateLimit` · `errorHandler` · تسجيل مسارات `files`/`ai` |
| `src/lib/firebase.ts` | تفعيل App Check + إزالة قيم الـ fallback المكتوبة في الكود |
| `src/pages/Login.tsx` | بعد الدخول: `getIdTokenResult()` وقراءة الدور من الـ claims. `localStorage` يبقى للعرض |
| `src/pages/AiChat.tsx`, `AiAssistant.tsx`, `AiMemoDrafterModal.tsx`, `CaseDetails.tsx` | استبدال نداء Gemini المباشر بـ `authFetch("/api/ai/generate")` |
| `AddDocumentModal.tsx`, `AddHearingModal.tsx`, `EditHearingModal.tsx`, `Documents.tsx`, `CaseDetails.tsx` | استبدال `fetch("/upload.php")` بـ `uploadClient.upload()` |
| `.env.example` | توثيق المتغيرات الجديدة وإزالة `VITE_GEMINI_API_KEY` من القائمة المطلوبة |

---

## التصاميم الأساسية

### 1) قواعد Firestore

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function auth()      { return request.auth; }
    function claims()    { return request.auth.token; }
    function signedIn()  { return auth() != null && claims().status != 'SUSPENDED'; }
    function isSuper()   { return signedIn() && claims().role == 'SUPER_ADMIN'; }
    function tenant()    { return claims().lawyerId; }
    function sameTenant(d) { return signedIn() && d.lawyerId == tenant(); }
    function isOwner()   { return signedIn() && claims().role == 'LAWYER'; }

    // الحقول التي لا يجوز للعميل تعديلها أبداً
    function immutable() {
      return !request.resource.data.diff(resource.data)
              .affectedKeys()
              .hasAny(['role','lawyerId','plan','status','subscriptionExpiry']);
    }

    match /users/{userId} {
      allow read:   if isSuper() || userId == auth().uid || sameTenant(resource.data);
      allow update: if (userId == auth().uid && immutable()) || isSuper();
      allow create, delete: if false;          // عبر Admin SDK فقط
    }

    match /auditLogs/{logId} {
      allow create: if false;                  // الخادم فقط
      allow read:   if isSuper() || isOwner();
      allow update, delete: if false;          // append-only (المبدأ 5)
    }

    match /subscriptionRequests/{docId} {
      allow create: if true;                   // نموذج عام — يبقى كما هو
      allow read, update: if isSuper();
      allow delete: if false;
    }

    // كل كولكشنات المستأجر
    match /{col}/{docId} {
      allow read:   if isSuper() || sameTenant(resource.data);
      allow create: if signedIn() && request.resource.data.lawyerId == tenant();
      allow update: if sameTenant(resource.data)
                    && request.resource.data.lawyerId == resource.data.lawyerId;
      allow delete: if false;                  // الحذف الناعم عبر الخادم — الميزة 002
      match /{sub=**} {
        allow read:  if isSuper() || sameTenant(get(/databases/$(database)/documents/$(col)/$(docId)).data);
        allow write: if sameTenant(get(/databases/$(database)/documents/$(col)/$(docId)).data);
      }
    }
  }
}
```

> ملاحظة: `allow delete: if false` لا يعطّل أزرار الحذف القائمة — تُحوَّل في نفس المهمة إلى نداء
> `DELETE /api/{entity}/:id` الذي ينفّذ حذفاً ناعماً بالخادم. الميزة تبقى، والسلوك يصبح آمناً.

### 2) قواعد Storage

```js
service firebase.storage {
  match /b/{bucket}/o {
    match /tenants/{lawyerId}/{allPaths=**} {
      allow read, write: if request.auth != null
        && (request.auth.token.lawyerId == lawyerId
            || request.auth.token.role == 'SUPER_ADMIN');
    }
    match /{allPaths=**} { allow read, write: if false; }
  }
}
```

### 3) Middleware المصادقة

```ts
// src/server/middleware/auth.ts
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "غير مصرح" });
  try {
    const decoded = await admin.auth().verifyIdToken(header.slice(7), true);
    if (decoded.status === "SUSPENDED") return res.status(403).json({ error: "الحساب موقوف" });
    req.user = {
      uid: decoded.uid, role: decoded.role ?? "TRAINEE",
      lawyerId: decoded.lawyerId ?? null, plan: decoded.plan ?? "BASIC",
    };
    next();
  } catch { return res.status(401).json({ error: "جلسة غير صالحة" }); }
}

export const requireRole = (...roles: Role[]) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: "صلاحية غير كافية" });
```

### 4) حراسة المسارات الحالية

| المسار | الحارس بعد التعديل |
|---|---|
| `GET /api/dashboard` `clients` `cases` `tasks` … | `requireAuth` + تقييد الاستعلام بـ `req.user.lawyerId` |
| `POST/PUT` على `clients` `cases` `tasks` | `requireAuth` + فرض `lawyerId = req.user.lawyerId` على الخادم |
| `PUT /api/users/:uid/password` | `requireAuth` + (`SUPER_ADMIN`) أو (`LAWYER` والمستخدم الهدف من مكتبه) |
| `PUT /api/users/:uid/email` | نفس الشرط |
| `GET /api/subscriptions`, `PUT .../approve`, `.../reject` | `requireAuth` + `requireRole("SUPER_ADMIN")` |
| `POST /api/subscribe` | عام (نموذج تسويقي) + `rateLimit` مشدّد + CAPTCHA |
| `POST /api/extract-text` | `requireAuth` + `rateLimit` |

### 5) تحصين `upload.php` (يبقى ولا يُحذف)

```php
$ALLOWED = ['pdf','doc','docx','xls','xlsx','png','jpg','jpeg','webp','txt'];
$MAX     = 20 * 1024 * 1024;
// 1) توكن مشترك في هيدر X-Upload-Token يُقارن بـ hash_equals
// 2) فحص الامتداد + finfo_file لنوع MIME الحقيقي
// 3) رفض إن كان الحجم > MAX
// 4) اسم عشوائي bin2hex(random_bytes(16)) بلا اسم المستخدم الأصلي
// 5) mkdir($uploadDir, 0755) بدل 0777
// 6) Access-Control-Allow-Origin: النطاق المحدد بدل *
// 7) كتابة uploads/.htaccess:  php_flag engine off  +  Options -ExecCGI
```

### 6) `authFetch` للواجهة

```ts
// src/lib/session.ts
export async function authFetch(url: string, init: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...init,
    headers: { ...init.headers, "Content-Type": "application/json",
               ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}
```

---

## المخاطر والتخفيف

| الخطر | التخفيف |
|---|---|
| القواعد الجديدة تكسر شاشة قائمة | نشر `SHADOW` أولاً + جولة اختبار الشاشات الـ15 (AC-11) |
| مستندات قديمة بلا `lawyerId` تصبح غير مقروءة | `scripts/backfill-lawyerId.mjs` يُشغَّل قبل التفعيل |
| مستخدمون حاليون بلا Custom Claims يُطردون | `scripts/sync-all-claims.mjs` + إجبار تحديث التوكن عند أول دخول |
| تعطّل الذكاء الاصطناعي بعد نقله للخادم | مرحلة انتقالية يعمل فيها المساران، ثم إزالة المفتاح من `.env` |
| فقدان الوصول للخادم بعد تدوير مفتاح SSH | إضافة المفتاح الجديد والتحقق من الدخول **قبل** إزالة القديم |
