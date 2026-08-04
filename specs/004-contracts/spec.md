# 004 — وحدة العقود والتوقيع الإلكتروني

**المرحلة:** 2 · **الأولوية:** 🟠 عالية · **يعتمد على:** 002

يحقق: الوثيقة **§1.5 إدارة العقود** · §2 (صلاحيات العقود لكل دور) · §5 (اعتماد العقود قبل مشاركتها مع العميل)

---

## المشكلة

**الوحدة غير موجودة نهائياً.** لا كولكشن، لا صفحة، لا مسار، لا نموذج.
الموجود فقط: حقل `eSignatureMode` في `Settings.tsx:196` بلا أي تنفيذ، و`Document.type` يقبل قيمة `CONTRACT` كتصنيف ملف مرفوع فقط.

الوثيقة تطلب: إنشاء العقود · قوالب جاهزة · التوقيع الإلكتروني · إدارة النسخ والمرفقات والتجديد.
والمصفوفة تطلب: مدير المكتب **كامل** · الشريك **اعتماد** · المحامي **إنشاء** · المستشار **مراجعة** · العميل **عرض**.

---

## نموذج البيانات

```ts
// contracts/{id}
{
  id, lawyerId,                          // العزل
  contractNumber: string,                // ترقيم تلقائي: CT-2026-0001
  title, type,                           // RETAINER | SERVICE | NDA | SETTLEMENT | EMPLOYMENT | OTHER
  clientId, caseId?,
  templateId?,
  content: string,                       // HTML من RichTextEditor القائم
  value: number, currency: string,
  vatRate: number, vatAmount: number, totalValue: number,
  startDate, endDate, renewalType,       // NONE | AUTO | MANUAL
  renewalNoticeDays: number,             // تنبيه قبل الانتهاء
  status,                                // DRAFT → UNDER_REVIEW → PENDING_APPROVAL
                                         // → APPROVED → SENT → SIGNED → ACTIVE
                                         // → EXPIRED | TERMINATED | REJECTED
  version: number,                       // يزيد مع كل تعديل بعد الاعتماد
  parentVersionId?: string,
  reviewedBy?: { uid, name, at, notes }, // المستشار
  approvedBy?: { uid, name, at },        // الشريك أو مدير المكتب
  signatures: [{ partyType, partyId, name, email, method, signedAt, ip, otpHash, certificateUrl }],
  attachments: [{ name, storagePath, uploadedBy, at }],
  sharedWithClient: boolean,             // ضابط الوثيقة §5
  deletedAt, deletedBy, createdAt, createdBy, updatedAt
}

// contract_templates/{id}   — قوالب المكتب
{ id, lawyerId, name, type, content, variables: string[], isSystem: boolean, deletedAt }

// contracts/{id}/history/{n} — سجل الإصدارات (append-only)
{ version, content, changedBy, changedAt, changeSummary }
```

---

## دورة الاعتماد (ضابط الوثيقة §5)

```
DRAFT ──(المحامي يرسل)──→ UNDER_REVIEW ──(المستشار يراجع)──→ PENDING_APPROVAL
                                │                                     │
                          (يعيد للتعديل)                     (الشريك/المدير يعتمد)
                                ↓                                     ↓
                              DRAFT                              APPROVED
                                                                      │
                                                        (إرسال للعميل — مسموح فقط بعد الاعتماد)
                                                                      ↓
                                                                    SENT
                                                                      ↓
                                                          (توقيع كل الأطراف)
                                                                      ↓
                                                              SIGNED → ACTIVE
```

**قاعدة صارمة:** `sharedWithClient = true` مرفوضة على الخادم إن كانت `status ∉ {APPROVED, SENT, SIGNED, ACTIVE}`.

---

## التوقيع الإلكتروني

| الوضع | الوصف | المرحلة |
|---|---|---|
| `OTP_NATIVE` (افتراضي) | رمز لمرة واحدة للبريد/الجوال + تسجيل IP والوقت + بصمة SHA-256 للمستند | 004 |
| `DRAW` | توقيع بالرسم على Canvas يُحفظ كصورة داخل الـ PDF | 004 |
| `EXTERNAL` | ربط مزوّد خارجي (تكامل لاحق) | خارج النطاق |

كل توقيع يُنتج **شهادة توقيع** PDF تتضمن: هوية الموقّع · الوقت (UTC + محلي) · IP · بصمة المستند · طريقة التحقق. وتُسجَّل العملية في `auditLogs`.

---

## الشاشات الجديدة

| الشاشة | المسار | الوصف |
|---|---|---|
| قائمة العقود | `/app/contracts` | جدول + فلترة بالحالة/النوع/العميل + بحث + Pagination |
| تفاصيل العقد | `/app/contracts/:id` | المحتوى · الأطراف · التوقيعات · المرفقات · سجل الإصدارات · شريط الاعتماد |
| قوالب العقود | `/app/contracts/templates` | إدارة القوالب مع متغيرات `{{clientName}}` `{{caseNumber}}` … |
| توقيع العقد (عام) | `/sign/:token` | صفحة توقيع للعميل بلا حساب، برمز صالح 7 أيام |

> `RichTextEditor.tsx` القائم يُعاد استخدامه · نظام `custom_templates`/`template_folders` القائم في `Documents.tsx` يبقى ولا يُمَس.

---

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | إنشاء عقد من قالب مع استبدال المتغيرات تلقائياً من بيانات العميل والقضية |
| AC-2 | `OFFICE_LAWYER` ينشئ ولا يعتمد · `CONSULTANT` يراجع ولا يعتمد · `PARTNER` يعتمد · `LAWYER` كامل |
| AC-3 | محاولة مشاركة عقد غير معتمد مع العميل تُرفض بـ 403 |
| AC-4 | كل تعديل بعد الاعتماد ينشئ إصدارًا جديدًا ويحتفظ بالسابق |
| AC-5 | التوقيع بـ OTP ينتج شهادة PDF فيها بصمة المستند وIP والوقت |
| AC-6 | تنبيه تلقائي قبل انتهاء العقد بعدد الأيام المحدد |
| AC-7 | العقود المنتهية تظهر في لوحة التحكم (يستهلكها 013) |
| AC-8 | كل عمليات العقد مسجّلة في `auditLogs` |
| AC-9 | الحذف ناعم وقابل للاسترجاع |
| AC-10 | `npm run lint` = 0 أخطاء |

---

## المهام

- [ ] **T001** نموذج البيانات + فهارس Firestore `(lawyerId, status, endDate)` · `(lawyerId, clientId)` · `(lawyerId, deletedAt, createdAt desc)`
- [ ] **T002** قواعد Firestore للعقود والقوالب حسب المصفوفة
- [ ] **T003** `src/server/routes/contracts.ts` — CRUD + `permit()` + `writeAudit()`
- [ ] **T004** ترقيم تلقائي `CT-YYYY-NNNN` عبر معاملة (transaction) لضمان عدم التكرار
- [ ] **T005** آلة الحالات (State Machine) وحراسة الانتقالات على الخادم
- [ ] **T006** مسارات: `/submit-review` `/review` `/approve` `/reject` `/send` `/terminate` `/renew`
- [ ] **T007** حراسة `sharedWithClient` (AC-3)
- [ ] **T008** نظام الإصدارات: كتابة `contracts/{id}/history/{n}` عند كل تعديل بعد الاعتماد
- [ ] **T009** `src/server/lib/signing.ts` — إنشاء رمز توقيع · إرسال OTP · تحقق · بصمة SHA-256
- [ ] **T010** توليد شهادة التوقيع PDF
- [ ] **T011** `src/pages/Contracts.tsx` — القائمة
- [ ] **T012** `src/pages/ContractDetails.tsx` — التفاصيل + شريط الاعتماد + سجل الإصدارات
- [ ] **T013** `src/pages/ContractTemplates.tsx` + محرّك المتغيرات
- [ ] **T014** `src/pages/SignContract.tsx` (`/sign/:token`) — عام، RTL، متجاوب
- [ ] **T015** `src/components/AddContractModal.tsx` · `SignaturePad.tsx` · `ContractStatusBadge.tsx`
- [ ] **T016** إضافة المسارات وعنصر القائمة "العقود" في `App.tsx`
- [ ] **T017** تبويب "العقود" داخل `CaseDetails.tsx` و`Clients.tsx` (إضافة تبويب، بلا مساس بالقائم)
- [ ] **T018** تصدير العقد إلى PDF بالعربية RTL
- [ ] **T019** مهمة يومية: وسم العقود المنتهية `EXPIRED` + إطلاق تنبيهات التجديد
- [ ] **T020** الاختبارات: آلة الحالات · الصلاحيات · حراسة المشاركة · الإصدارات · التوقيع
- [ ] **T021** `npm run lint` = 0 أخطاء

**التقدير:** 8–10 أيام عمل
