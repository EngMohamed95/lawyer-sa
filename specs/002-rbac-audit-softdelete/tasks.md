# 002 — قائمة المهام

## المجموعة أ — نموذج الأدوار

- [ ] **T001** إنشاء `src/lib/roles.ts` بالأدوار التسعة وتسمياتها العربية (القيم الأربع القائمة بلا تغيير)
- [ ] **T002** إنشاء `src/lib/permissions.ts` بمصفوفة الوثيقة كاملة + دالة `can()`
- [ ] **T003** إنشاء `tests/permissions.matrix.test.ts` — اختبار لكل خلية من الـ70 خلية
- [ ] **T004** إنشاء `src/lib/usePermissions.ts` (Hook يقرأ الدور من Custom Claims)
- [ ] **T005** إنشاء `src/components/PermissionGate.tsx` و`RoleBadge.tsx`
- [ ] **T006** تحديث `ROLE_LABELS_AR` في `App.tsx:129` و`Settings.tsx:427` لتغطي الأدوار التسعة (بدل السلاسل الثلاث المكتوبة يدوياً)

## المجموعة ب — فرض الصلاحيات على الخادم

- [ ] **T007** إنشاء `src/server/middleware/permit.ts` يستورد نفس `PERMISSION_MATRIX`
- [ ] **T008** تركيب `permit()` على كل مسارات `src/server/api.ts`
- [ ] **T009** تنفيذ منطق `ASSIGNED`: القضية مقروءة إن `assignedLawyerId == uid` أو `uid ∈ teamIds`
- [ ] **T010** تنفيذ منطق `DRAFT`: `SECRETARY`/`TRAINEE` ينشئان قضية `status:"DRAFT"` + طابور اعتماد لمدير المكتب
- [ ] **T011** تنفيذ منطق `LIMITED`: السكرتارية تعدّل `courtName` `circuit` `nextHearingDate` فقط
- [ ] **T012** تنفيذ فصل المالي: حجب `payments`/`expenses`/`invoices` عن `OFFICE_LAWYER` `CONSULTANT` `SECRETARY` `TRAINEE`، وحجب محتوى القضايا عن `ACCOUNTANT`
- [ ] **T013** تحديث `firestore.rules` بدوال صلاحية لكل دور مطابقة للمصفوفة
- [ ] **T014** اختبار قواعد يثبت تطابق `firestore.rules` مع `PERMISSION_MATRIX`

## المجموعة ج — الواجهة

- [ ] **T015** تحويل شروط `App.tsx:37-58` إلى `can()` — **مع الإبقاء على كل عناصر القائمة الحالية وسلوكها**
- [ ] **T016** إضافة عنصري قائمة: "سلة المحذوفات" و"سجل التدقيق" (يظهران بالصلاحية)
- [ ] **T017** تغليف أزرار الإنشاء/التعديل/الحذف في الصفحات الـ15 بـ `<PermissionGate>` (بلا حذف أي زر)
- [ ] **T018** إعادة كتابة تبويب "الصلاحيات" في `Settings.tsx:479-504`: نفس المظهر + حالة حقيقية + حفظ في `officeSettings/{lawyerId}` + رسالة نجاح
- [ ] **T019** إضافة شاشة "مصفوفة الصلاحيات" للعرض داخل نفس التبويب (جدول الوثيقة قابل للتخصيص لكل مكتب)

## المجموعة د — سجل التدقيق

- [ ] **T020** إنشاء `src/server/lib/audit.ts` مع `writeAudit()` وتقنيع الحقول الحساسة
- [ ] **T021** إضافة قواعد `auditLogs` (create من الخادم فقط · لا update · لا delete)
- [ ] **T022** ربط `writeAudit` بكل عمليات: إنشاء/تعديل/حذف/استرجاع/اعتماد/رفض
- [ ] **T023** تسجيل `LOGIN` و`LOGIN_FAILED` و`CREDENTIALS_CHANGE` و`PERMISSION_CHANGE`
- [ ] **T024** تسجيل `CROSS_TENANT_ACCESS` تلقائياً عند وصول `SUPER_ADMIN` لبيانات مكتب
- [ ] **T025** تسجيل `EXPORT` عند كل تصدير Excel/PDF/طباعة
- [ ] **T026** إنشاء `src/server/routes/audit.ts` — `GET /api/audit` بمرشحات (فاعل، كيان، إجراء، مدى تاريخ) و Pagination
- [ ] **T027** إنشاء صفحة `src/pages/AuditLog.tsx` + المسار في `App.tsx`
- [ ] **T028** فهارس Firestore المركّبة: `(lawyerId, at desc)` · `(lawyerId, entity, at desc)` · `(lawyerId, actorId, at desc)`
- [ ] **T029** مهمة أرشفة شهرية للسجلات الأقدم من 24 شهراً إلى Storage
- [ ] **T030** `tests/audit.test.ts` — العملية تنتج سطراً · السطر غير قابل للتعديل أو الحذف

## المجموعة هـ — الحذف الناعم

- [ ] **T031** سكربت `scripts/backfill-deletedAt.mjs` — إضافة `deletedAt: null` لكل المستندات القائمة (idempotent)
- [ ] **T032** إنشاء `src/server/routes/entities.ts` — `DELETE /api/:entity/:id` و`POST /api/:entity/:id/restore`
- [ ] **T033** تحويل مواضع `deleteDoc` الثمانية إلى النداء الجديد: `Tasks.tsx:98` · `Lawyers.tsx:230` · `Documents.tsx:552,600,627` · `ClientDocumentsModal.tsx:55` · `EditHearingModal.tsx:130` · `AiChat.tsx:165`
- [ ] **T034** إضافة `where("deletedAt","==",null)` لكل استعلامات القراءة في الصفحات والمكوّنات
- [ ] **T035** إنشاء صفحة `src/pages/RecycleBin.tsx` مع تبويب لكل نوع كيان + زر استرجاع + عرض من حذف ومتى
- [ ] **T036** مهمة مجدولة `POST /api/admin/purge` — حذف نهائي بعد 30 يوماً، `SUPER_ADMIN` فقط، مع تسجيل تدقيق
- [ ] **T037** الفهارس المركّبة اللازمة: `(lawyerId, deletedAt, createdAt desc)` لكل كولكشن
- [ ] **T038** `tests/softdelete.test.ts` — الحذف يخفي · السجل موجود · الاسترجاع يعيد · القواعد تمنع الحذف المباشر

## المجموعة و — التحقق

- [ ] **T039** جولة اختبار الشاشات الـ15 بالأدوار التسعة (جدول تحقق موثّق)
- [ ] **T040** التأكد أن الأدوار الأربعة القائمة تسلك تماماً كما كانت قبل التغيير
- [ ] **T041** `npm run lint` = 0 أخطاء
- [ ] **T042** تحديث `README.md` بجدول الأدوار والصلاحيات

---

**إجمالي المهام:** 42 · **المدة التقديرية:** 8–10 أيام عمل
