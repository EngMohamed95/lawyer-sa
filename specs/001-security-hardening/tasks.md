# 001 — قائمة المهام

الترتيب إلزامي. `[P]` = قابلة للتوازي مع سابقتها.

---

## المجموعة أ — الأسرار (فوري، قبل أي كود)

- [ ] **T001** تدوير مفتاح SSH: توليد زوج جديد ← إضافة العام للخادم ← التحقق من الدخول ← إزالة القديم ← تحديث `HOSTINGER_SSH_KEY` في GitHub Secrets
- [ ] **T002** حذف `KEYS_FOR_GITHUB.txt` من القرص بعد نقل قيمه إلى GitHub Secrets (تأكيد أنه غير متتبع في git — تم التحقق: غير متتبع)
- [ ] **T003** [P] تدوير `GEMINI_API_KEY` من Google AI Studio + تقييده بـ HTTP referrer/IP
- [ ] **T004** [P] تقييد `VITE_FIREBASE_API_KEY` في Google Cloud Console بنطاقات التطبيق فقط
- [ ] **T005** إزالة قيم الـ fallback المكتوبة داخل `src/lib/firebase.ts:7-13` والاعتماد على `import.meta.env` فقط، مع رسالة خطأ واضحة عند غيابها
- [ ] **T006** كتابة `scripts/rotate-secrets.md` لتوثيق الإجراء

## المجموعة ب — الهوية و Custom Claims

- [ ] **T007** إنشاء `src/server/lib/claims.ts` مع `setUserClaims(uid, {role, lawyerId, plan, status})`
- [ ] **T008** إنشاء `scripts/sync-all-claims.mjs` — يمر على كل مستندات `users` ويمنح كل مستخدم claims مطابقة لبياناته (idempotent)
- [ ] **T009** إنشاء `scripts/backfill-lawyerId.mjs` — يملأ `lawyerId` الناقص في `clients` `cases` `tasks` `payments` `expenses` من القضية/المالك المرتبط، ويطبع تقريراً بالمستندات اليتيمة
- [ ] **T010** تشغيل T008 و T009 على بيئة اختبار ثم الإنتاج والتحقق من التقرير
- [ ] **T011** تعطيل التسجيل الذاتي في Firebase Console (Authentication → Settings → إيقاف Email/Password sign-up العام)
- [ ] **T012** تعديل `src/pages/Login.tsx`: بعد `signInWithEmailAndPassword` استدعاء `getIdTokenResult(true)` واعتماد الدور/المكتب/الباقة من `claims`. الكتابة في `localStorage` **تبقى** للعرض
- [ ] **T013** إنشاء `src/lib/session.ts` مع `authFetch` و`getCurrentClaims()`
- [ ] **T014** رفض الدخول برسالة عربية واضحة إذا كان `claims.status === "SUSPENDED"` أو الاشتراك منتهٍ

## المجموعة ج — قواعد Firestore و Storage

- [ ] **T015** إنشاء `firebase.json` + `.firebaserc` لنشر القواعد عبر CLI
- [ ] **T016** كتابة `firestore.rules` كاملة حسب `plan.md §1`
- [ ] **T017** [P] كتابة `storage.rules` حسب `plan.md §2`
- [ ] **T018** إضافة سطر `# DEPRECATED — انظر firestore.rules` في أعلى `firestore.rules.txt` (يبقى الملف — المبدأ 1)
- [ ] **T019** كتابة `tests/rules/firestore.rules.test.ts` بـ `@firebase/rules-unit-testing`، وتغطية: عزل المستأجر · منع تعديل `role` · منع الحذف · `auditLogs` append-only · وصول SUPER_ADMIN
- [ ] **T020** نشر القواعد في وضع مراقبة ومتابعة سجلات الرفض 48 ساعة
- [ ] **T021** تفعيل القواعد بشكل نهائي + إعادة جولة اختبار الشاشات الـ15

## المجموعة د — تأمين الـ API

- [ ] **T022** إنشاء `src/server/middleware/auth.ts` (`requireAuth`, `requireRole`, `requireSameTenant`)
- [ ] **T023** [P] إنشاء `src/server/middleware/rateLimit.ts` — 100 طلب/دقيقة للـ IP، و10/دقيقة للمسارات العامة
- [ ] **T024** [P] إنشاء `src/server/middleware/errorHandler.ts` — لا يُرجع Stack Trace في الإنتاج
- [ ] **T025** إضافة `helmet` + CORS مقيّد بالنطاق في `server.ts`
- [ ] **T026** تركيب `requireAuth` على كل مسارات `src/server/api.ts` (لا يُحذف أي مسار)
- [ ] **T027** تقييد كل استعلام Firestore داخل الـ API بـ `req.user.lawyerId` (باستثناء `SUPER_ADMIN`)
- [ ] **T028** فرض `lawyerId` من التوكن على كل `POST`/`PUT` — وتجاهل أي `lawyerId` قادم من جسم الطلب
- [ ] **T029** حماية `PUT /api/users/:uid/password` و`/email` بـ: `SUPER_ADMIN` أو (`LAWYER` والهدف من مكتبه). كتابة سجل تدقيق للعملية
- [ ] **T030** حماية `/api/subscriptions*` بـ `requireRole("SUPER_ADMIN")`
- [ ] **T031** إضافة تدقيق مدخلات بـ `zod` لكل مسار (`src/server/lib/validate.ts`)
- [ ] **T032** كتابة `tests/api/auth.test.ts` — كل مسار يرد 401 بلا توكن و403 بدور غير كافٍ

## المجموعة هـ — الملفات والرفع

- [ ] **T033** إنشاء `src/server/lib/storage.ts` (رفع إلى Firebase Storage + Signed URL 15 دقيقة)
- [ ] **T034** إنشاء `src/server/routes/files.ts`: `POST /api/files/upload` (multer، حد 20MB، قائمة امتدادات بيضاء، فحص MIME حقيقي) و`GET /api/files/:id/url`
- [ ] **T035** إنشاء `src/lib/uploadClient.ts` — واجهة موحّدة `upload(file, {scope, caseId})`
- [ ] **T036** تحويل نقاط الرفع الستة إلى `uploadClient`: `AddDocumentModal.tsx:82` · `AddHearingModal.tsx:160,174` · `EditHearingModal.tsx:73,87` · `Documents.tsx:723` · `CaseDetails.tsx:405,2050`
- [ ] **T037** تحصين `public/upload.php` حسب `plan.md §5` (الملف يبقى)
- [ ] **T038** إنشاء `public/uploads/.htaccess` بـ `php_flag engine off` و`Options -ExecCGI`
- [ ] **T039** اختبار: رفض `.php` · رفض `.exe` · رفض > 20MB · رفض بلا توكن · انتهاء صلاحية الرابط

## المجموعة و — الذكاء الاصطناعي

- [ ] **T040** إنشاء `src/server/routes/ai.ts`: `POST /api/ai/generate` و`POST /api/ai/extract-text` — مصادَق عليهما + محدودا المعدل + مقيّدان بباقة `PREMIUM`
- [ ] **T041** تحويل `AiChat.tsx:352` · `AiAssistant.tsx:332` · `AiMemoDrafterModal.tsx:42` · `CaseDetails.tsx:240` إلى `authFetch("/api/ai/generate")`
- [ ] **T042** الإبقاء على خيار "استخدام مفتاحي الخاص" في الإعدادات، بشرط تمريره في جسم الطلب للخادم لا استخدامه في المتصفح
- [ ] **T043** إزالة `VITE_GEMINI_API_KEY` من `.env` و`.env.example`
- [ ] **T044** التحقق: `npm run build` ثم البحث عن `AIza` داخل `dist/assets/*.js` → صفر نتائج

## المجموعة ز — التصلّب العام

- [ ] **T045** تفعيل Firebase App Check (reCAPTCHA v3) في `src/lib/firebase.ts` وفرضه على Firestore و Storage
- [ ] **T046** [P] إضافة CAPTCHA على `POST /api/subscribe`
- [ ] **T047** [P] فرض سياسة كلمات مرور (8+ أحرف، مزيج) في كل نقاط إنشاء/تغيير كلمة المرور
- [ ] **T048** إضافة رؤوس أمان: `Content-Security-Policy` · `X-Frame-Options` · `Referrer-Policy` في `server.ts` و`dist/.htaccess`
- [ ] **T049** تفعيل مسار "نسيت كلمة المرور؟" المعطّل في `Login.tsx:228` عبر `sendPasswordResetEmail`

## المجموعة ح — التحقق النهائي

- [ ] **T050** جولة اختبار يدوية موثّقة للشاشات الـ15 بكل الأدوار الأربعة القائمة
- [ ] **T051** محاولة اختراق داخلية: حساب مكتب (أ) يحاول قراءة بيانات مكتب (ب) من Console — يجب أن تفشل
- [ ] **T052** محاولة ترقية ذاتية: `localStorage.setItem("userRole","SUPER_ADMIN")` — يجب ألا تمنح أي وصول فعلي
- [ ] **T053** `npm run lint` = 0 أخطاء
- [ ] **T054** توثيق كل التغييرات في `README.md` قسم "الأمان"

---

**إجمالي المهام:** 54 · **المدة التقديرية:** 5–7 أيام عمل
