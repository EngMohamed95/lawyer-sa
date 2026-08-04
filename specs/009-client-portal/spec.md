# 009 — بوابة العميل

**المرحلة:** 3 · **الأولوية:** 🟡 متوسطة · **يعتمد على:** 002, 004, 005, 006, 008

يحقق: الوثيقة **§2.7 العميل — بوابة العميل** · §4 (بوابة العملاء وإدارة العلاقات) · §5 (إتاحة مستندات محددة فقط)

---

## المشكلة

**البوابة غير موجودة نهائياً.** العميل حالياً مجرد سجل بيانات في `clients`، بلا حساب دخول ولا أي واجهة.

الوثيقة تطلب للعميل: متابعة القضية والجلسات · تحميل المستندات المسموح بها · دفع الفواتير · إرسال الرسائل للمحامي · الاطلاع على العقود وبياناته الخاصة فقط.

---

## النموذج

```ts
// client_portal_accounts/{uid}
{ uid, lawyerId, clientId,        // ربط حساب Auth بسجل العميل
  email, name, phone,
  status: "INVITED" | "ACTIVE" | "SUSPENDED",
  invitedAt, invitedBy, activatedAt, lastLoginAt,
  allowedCaseIds: string[],       // فارغ = كل قضايا العميل
  permissions: { viewHearings, viewDocuments, viewInvoices, payOnline, sendMessages, requestAppointment },
  deletedAt }

// client_messages/{id}
{ id, lawyerId, clientId, caseId?,
  threadId, senderType: "CLIENT" | "OFFICE", senderId, senderName,
  body, attachments: [{ name, storagePath }],
  readAt?, createdAt, deletedAt }

// client_requests/{id}           // طلبات العميل
{ id, lawyerId, clientId, type: "APPOINTMENT" | "DOCUMENT" | "UPDATE" | "OTHER",
  subject, body, status: "NEW"|"IN_PROGRESS"|"RESOLVED"|"REJECTED",
  assignedTo?, resolvedAt, createdAt }
```

الدور `CLIENT` (من الميزة 002) مع `lawyerId` = مكتب العميل و`clientId` في الـ Custom Claims.

---

## نطاق البوابة

مسار منفصل `/portal/*` بتخطيط خاص (لا يستخدم `Layout` الإداري)، بنفس هوية العلامة.

| الشاشة | المسار | المحتوى |
|---|---|---|
| الدخول | `/portal/login` | دخول بالبريد + تفعيل بالدعوة |
| الرئيسية | `/portal` | ملخّص: قضاياي · الجلسة القادمة · فواتير مستحقة · رسائل جديدة |
| قضاياي | `/portal/cases` | قائمة قضايا العميل بحالتها وتقدّمها فقط — **بلا ملاحظات داخلية ولا استراتيجية** |
| تفاصيل القضية | `/portal/cases/:id` | البيانات العامة · الجلسات · المستندات المشاركة |
| الجلسات | `/portal/hearings` | عرض فقط (المصفوفة: العميل «عرض فقط») |
| المستندات | `/portal/documents` | `sharedWithClient == true` حصراً |
| العقود | `/portal/contracts` | عرض + توقيع إلكتروني (من 004) |
| الفواتير | `/portal/invoices` | عرض + دفع أونلاين |
| الرسائل | `/portal/messages` | محادثة مع المكتب |
| المواعيد | `/portal/appointments` | مواعيده + طلب موعد جديد |
| الملف الشخصي | `/portal/profile` | بياناته وتغيير كلمة المرور |

---

## الحواجز الأمنية (حرجة)

هذه أخطر واجهة في النظام — مستخدم خارجي يصل لبيانات المكتب.

1. **قائمة بيضاء للحقول:** استجابة البوابة تُبنى من قائمة حقول مسموحة صراحة، لا بحذف حقول من الكائن الكامل.
   محجوب دائماً: `internalNotes` · `summary` الداخلي · `strategy` · بيانات الخصم الحساسة · هوامش الربح · بيانات المستخدمين الداخليين.
2. **`clientId` من التوكن حصراً** — يُتجاهل أي معرّف في المسار أو جسم الطلب.
3. **مسارات API منفصلة** `/api/portal/*` بـ middleware خاص `requirePortalAuth` — **ولا تُشارك مسارات الإدارة إطلاقاً**.
4. **قواعد Firestore منفصلة** للدور `CLIENT` (منع القراءة الافتراضية، سماح صريح فقط).
5. **حد معدل مشدّد** + reCAPTCHA على الدخول والرسائل.
6. **كل وصول مسجَّل** في `auditLogs` بـ `actorRole: "CLIENT"`.
7. **رفع الملفات من العميل** في مسار حجر صحي `tenants/{lawyerId}/quarantine/`، بامتدادات محدودة، ولا تُنشر إلا بعد قبول من المكتب.
8. **لا وصول للبوابة** إذا كان اشتراك المكتب منتهياً أو الحساب موقوفاً.

---

## الدفع الأونلاين

- بوابة دفع (Stripe / Moyasar / Tap) خلف مفتاح إعدادات — قابلة للتعطيل.
- المكتب لا يخزّن بيانات البطاقة إطلاقاً — Tokenization لدى المزوّد.
- Webhook مُوقَّع للتأكيد ← إنشاء سند قبض تلقائي (005) ← تحديث حالة الفاتورة ← تنبيه (008).

---

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | العميل يرى قضاياه فقط، ولا بايت واحد من قضايا عميل آخر أو مكتب آخر |
| AC-2 | `internalNotes` وحقول الاستراتيجية غير موجودة في أي استجابة بوابة (اختبار آلي على شكل الاستجابة) |
| AC-3 | العميل يرى المستندات المشاركة فقط |
| AC-4 | العميل يوقّع عقداً وتُسجَّل الشهادة صحيحة |
| AC-5 | الدفع الناجح ينشئ سند قبض ويحدّث الفاتورة والتنبيه |
| AC-6 | رسائل العميل تصل للمكتب وتظهر في `CaseDetails` |
| AC-7 | تعديل `clientId` في الطلب لا يمنح وصولاً لبيانات أخرى |
| AC-8 | البوابة لا تعمل عند انتهاء اشتراك المكتب |
| AC-9 | كل نشاط بوابة مسجَّل في التدقيق |
| AC-10 | البوابة متجاوبة بالكامل وRTL |
| AC-11 | `npm run lint` = 0 أخطاء |

---

## المهام

- [ ] **T001** نماذج `client_portal_accounts` · `client_messages` · `client_requests`
- [ ] **T002** `src/server/middleware/portalAuth.ts` — تحقق منفصل + فحص اشتراك المكتب
- [ ] **T003** `src/server/lib/portalSerializer.ts` — قائمة الحقول البيضاء لكل كيان (AC-2)
- [ ] **T004** `src/server/routes/portal/` — `cases` `hearings` `documents` `contracts` `invoices` `messages` `appointments` `profile`
- [ ] **T005** قواعد Firestore خاصة بالدور `CLIENT`
- [ ] **T006** دعوة العميل من `Clients.tsx` (زر جديد "دعوة للبوابة") + إنشاء حساب Auth + claims
- [ ] **T007** تخطيط البوابة `src/portal/PortalLayout.tsx` + التوجيه `/portal/*`
- [ ] **T008** `PortalLogin.tsx` · `PortalHome.tsx` · `PortalCases.tsx` · `PortalCaseDetails.tsx`
- [ ] **T009** `PortalHearings.tsx` · `PortalDocuments.tsx` · `PortalContracts.tsx`
- [ ] **T010** `PortalInvoices.tsx` + تدفق الدفع
- [ ] **T011** `PortalMessages.tsx` (محادثة لحظية) + `PortalAppointments.tsx` + `PortalProfile.tsx`
- [ ] **T012** تكامل بوابة الدفع + Webhook مُوقَّع + إنشاء سند القبض
- [ ] **T013** واجهة المكتب: تبويب "رسائل العميل" في `CaseDetails.tsx` وصفحة `/app/client-requests`
- [ ] **T014** رفع ملفات العميل في مسار الحجر + شاشة موافقة للمكتب
- [ ] **T015** حد المعدل + reCAPTCHA على الدخول والرسائل
- [ ] **T016** اختبار أمني مخصص: محاولة تجاوز `clientId` · تسريب حقول · وصول عبر المستأجرين
- [ ] **T017** الاختبارات الوظيفية الكاملة
- [ ] **T018** `npm run lint` = 0 أخطاء

**التقدير:** 12–14 يوم عمل
