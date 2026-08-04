# 003 — قائمة المهام

## المجموعة أ — البنية التحتية للحسابات

- [ ] **T001** إنشاء `src/server/lib/seats.ts` مع `PLAN_SEAT_LIMITS` و`assertSeatAvailable()`
- [ ] **T002** إنشاء `src/server/lib/accountLifecycle.ts` (`suspend` `activate` `softDelete` `restore` `purge` `cascadeToMembers`)
- [ ] **T003** إنشاء `src/server/lib/invites.ts` (إنشاء رمز دعوة صالح 72 ساعة + إرسال بريد + استهلاك لمرة واحدة)
- [ ] **T004** إنشاء `src/server/lib/transfer.ts` لنقل قضايا ومهام مستخدم إلى آخر (batched + idempotent)
- [ ] **T005** إضافة `generateStrongPassword()` (16 حرفاً، مزيج) في `src/server/lib/`

## المجموعة ب — مسارات SUPER_ADMIN

- [ ] **T006** إنشاء `src/server/routes/admin-tenants.ts` مع `requireRole("SUPER_ADMIN")` على كل المسارات
- [ ] **T007** `POST /api/admin/tenants` — إنشاء حساب عميل + Custom Claims + مستند Firestore + تدقيق
- [ ] **T008** `PUT /api/admin/tenants/:uid` — تعديل البيانات والباقة + مزامنة الـ claims
- [ ] **T009** `POST /api/admin/tenants/:uid/renew` — تجديد الاشتراك + تدقيق
- [ ] **T010** `POST /api/admin/tenants/:uid/suspend` و`/activate` — يشمل تعطيل/تفعيل Auth لكل مستخدمي المكتب
- [ ] **T011** `DELETE /api/admin/tenants/:uid` — حذف ناعم + `disabled:true` + تتالٍ على المستخدمين والبيانات (**يغلق B2 و B3**)
- [ ] **T012** `POST /api/admin/tenants/:uid/restore` — عكس كامل خلال 30 يوماً
- [ ] **T013** `GET /api/admin/tenants` — قائمة مع إحصاءات (عدد المستخدمين، القضايا، آخر دخول، حالة الاشتراك) + Pagination
- [ ] **T014** `POST /api/admin/tenants/:uid/impersonate` — Custom Token 30 دقيقة + تدقيق `CROSS_TENANT_ACCESS`
- [ ] **T015** ربط تسجيل `lastLoginAt` عند كل دخول ناجح

## المجموعة ج — مسارات مدير المكتب

- [ ] **T016** إنشاء `src/server/routes/office-users.ts` مع `permit("users.manage")`
- [ ] **T017** `POST /api/office/users` — إنشاء بأي دور من السبعة، `lawyerId` من التوكن، رفض `SUPER_ADMIN`/`LAWYER`، فحص المقاعد
- [ ] **T018** `PUT /api/office/users/:uid` — تعديل البيانات والدور + مزامنة الـ claims + تدقيق
- [ ] **T019** `POST /api/office/users/:uid/suspend` و`/activate`
- [ ] **T020** `DELETE /api/office/users/:uid` — حذف ناعم + `disabled:true` + طلب اختياري لنقل الملفات
- [ ] **T021** `POST /api/office/users/:uid/transfer` — نقل القضايا والمهام
- [ ] **T022** `POST /api/office/invites` و`POST /api/invites/accept` (عام برمز)
- [ ] **T023** `GET /api/office/seats` — استهلاك المقاعد الحالي مقابل حدود الباقة

## المجموعة د — واجهة SUPER_ADMIN

- [ ] **T024** تحويل `Lawyers.tsx:102-136` (`handleAddLawyer`) إلى `POST /api/admin/tenants` — النموذج يبقى كما هو
- [ ] **T025** تحويل `handleUpdateLawyer` و`handleRenew` و`handleChangeCredentials` إلى المسارات الجديدة
- [ ] **T026** تحويل `handleDeleteLawyer:227-233` إلى `DELETE` مع نافذة تأكيد تطلب كتابة اسم المكتب + شرح التتالي
- [ ] **T027** إضافة أعمدة: الحالة · آخر دخول · عدد المستخدمين · عدد القضايا
- [ ] **T028** إضافة أزرار: إيقاف · تفعيل · استرجاع · دخول دعم فني
- [ ] **T029** إنشاء `src/components/ImpersonationBanner.tsx` وعرضه في `Layout` عند وجود جلسة دعم
- [ ] **T030** التأكد أن كل قدرات `SUPER_ADMIN` الحالية باقية بلا نقصان (AC-1)

## المجموعة هـ — واجهة مدير المكتب

- [ ] **T031** تحويل `AddOfficeLawyerModal.tsx:39-48` إلى `POST /api/office/users` — النموذج والمظهر يبقيان
- [ ] **T032** تحويل `AddTraineeModal.tsx` بنفس الطريقة
- [ ] **T033** استبدال `alert()` في `AddOfficeLawyerModal.tsx:55` بنافذة عرض كلمة مرور لمرة واحدة مع زر نسخ
- [ ] **T034** إضافة خيار "إرسال دعوة بالبريد" كافتراضي، مع الإبقاء على خيار تعيين كلمة المرور يدوياً
- [ ] **T035** إنشاء `src/components/AddTeamMemberModal.tsx` — إنشاء بأي من الأدوار السبعة
- [ ] **T036** إنشاء `src/components/EditTeamMemberModal.tsx` — تعديل الدور والحالة
- [ ] **T037** إنشاء `src/components/TransferOwnershipModal.tsx`
- [ ] **T038** إنشاء `src/components/SeatUsageCard.tsx` وعرضه في `OfficeLawyers.tsx` و`Trainees.tsx` و`Team.tsx`
- [ ] **T039** إنشاء صفحة `src/pages/Team.tsx` (`/app/team`) — كل الأدوار في مكان واحد مع فلترة وبحث
- [ ] **T040** إضافة المسار وعنصر القائمة في `App.tsx` (بلا حذف `/app/office-lawyers` أو `/app/trainees`)
- [ ] **T041** إنشاء صفحة `src/pages/AcceptInvite.tsx` (`/accept-invite`) لتعيين كلمة المرور
- [ ] **T042** تعديل `Login.tsx` لرفض الحسابات الموقوفة/المحذوفة برسالة عربية واضحة

## المجموعة و — الاختبارات والتحقق

- [ ] **T043** `tests/accounts.lifecycle.test.ts` — إنشاء · إيقاف · حذف · استرجاع · التأكد أن المحذوف لا يستطيع الدخول
- [ ] **T044** `tests/accounts.isolation.test.ts` — مكتب (أ) لا ينشئ ولا يرى ولا يعدّل مستخدمي مكتب (ب)
- [ ] **T045** `tests/accounts.seats.test.ts` — تجاوز الحد يرد 409 · PREMIUM بلا حد
- [ ] **T046** اختبار: `LAWYER` يحاول إنشاء `SUPER_ADMIN` → 403
- [ ] **T047** اختبار: حذف مكتب يعطّل كل مستخدميه، والاسترجاع يعيدهم
- [ ] **T048** سكربت فحص الحسابات القائمة التي تتجاوز حدود باقتها + إعفاؤها (grandfather)
- [ ] **T049** جولة اختبار يدوية لصفحات `/app/lawyers` `/app/office-lawyers` `/app/trainees` `/app/team`
- [ ] **T050** `npm run lint` = 0 أخطاء

---

**إجمالي المهام:** 50 · **المدة التقديرية:** 7–9 أيام عمل
