# 005 — الفواتير والسندات واتفاقيات الأتعاب

**المرحلة:** 2 · **الأولوية:** 🟠 عالية · **يعتمد على:** 002

يحقق: الوثيقة **§1.9 الفواتير والحسابات** · §2.6 (المحاسب) · §5 (فصل الصلاحيات المالية عن القانونية)

---

## الوضع الحالي

✅ موجود ويبقى: `Accounting.tsx` بتبويبَي المدفوعات والمصروفات · `payments` · `expenses` · `AddPaymentModal` · `AddExpenseModal` · تصدير Excel · `sys_currency` و`sys_vatRate` و`sys_zatcaEnabled` في الإعدادات.

🔴 ناقص: **إصدار الفواتير** · **سندات القبض والصرف** · **اتفاقيات الأتعاب** · **المتأخرات وأعمار الديون** · دور المحاسب · الضريبة والفوترة الإلكترونية.

---

## نموذج البيانات (كولكشنات جديدة — لا مساس بالقائم)

```ts
// invoices/{id}
{
  id, lawyerId, invoiceNumber,           // INV-2026-0001 (تسلسل بمعاملة)
  clientId, caseId?, contractId?, feeAgreementId?,
  issueDate, dueDate,
  items: [{ description, quantity, unitPrice, amount, taxable: boolean }],
  subtotal, discount, discountType,      // AMOUNT | PERCENT
  vatRate, vatAmount, total,
  paidAmount, remainingAmount,
  currency,
  status,                                // DRAFT → PENDING_APPROVAL → APPROVED → SENT
                                         // → PARTIALLY_PAID → PAID | OVERDUE | CANCELLED
  approvedBy?: { uid, name, at },        // الشريك/المدير (المصفوفة: الشريك "اعتماد")
  zatca?: { uuid, hash, qrCode, xmlPath, status },
  notes, sharedWithClient: boolean,
  deletedAt, deletedBy, createdAt, createdBy
}

// receipts/{id}          سند قبض
{ id, lawyerId, receiptNumber, invoiceId?, clientId, caseId?, amount, currency,
  method,                                // CASH | BANK | CHEQUE | CARD | ONLINE
  reference, date, receivedBy, notes, paymentId?, deletedAt, createdAt }

// vouchers/{id}          سند صرف
{ id, lawyerId, voucherNumber, payeeType, payeeId, payeeName, amount, currency,
  category,                              // COURT_FEE | EXPERT | TRANSPORT | SALARY | OFFICE | OTHER
  method, reference, date, caseId?, approvedBy?, expenseId?, deletedAt, createdAt }

// fee_agreements/{id}    اتفاقية أتعاب
{ id, lawyerId, agreementNumber, clientId, caseId?, contractId?,
  model,                                 // FIXED | HOURLY | RETAINER | CONTINGENCY | MILESTONE | MIXED
  fixedAmount?, hourlyRate?, retainerMonthly?, contingencyPercent?,
  milestones?: [{ title, amount, dueDate, status, invoiceId? }],
  totalAgreed, totalInvoiced, totalCollected,
  startDate, endDate, status, deletedAt, createdAt }

// time_entries/{id}      لنموذج الساعات
{ id, lawyerId, userId, caseId, date, hours, rate, description, billable, invoiceId?, deletedAt }
```

> `payments` و`expenses` القائمان **يبقيان كما هما**. الفواتير تربطهما اختيارياً عبر `paymentId`/`expenseId`
> ليعمل التقرير المالي القديم والجديد معاً (المبدأ 7).

---

## المتطلبات

### R1 — دورة الفاتورة
`DRAFT → PENDING_APPROVAL → APPROVED → SENT → PARTIALLY_PAID → PAID`
مع `OVERDUE` تلقائياً بعد `dueDate`، و`CANCELLED` بإذن مدير المكتب فقط.
حسب المصفوفة: المحاسب **كامل** · الشريك **اعتماد** · المحامي **عرض** · العميل **دفع**.

### R2 — الترقيم التسلسلي الآمن
`INV-YYYY-NNNN` · `RCP-YYYY-NNNN` · `VCH-YYYY-NNNN` · `FA-YYYY-NNNN`
عبر Firestore transaction على مستند عدّاد لكل مكتب لكل سنة — **لا تكرار ولا فجوات**.

### R3 — الضريبة والفوترة الإلكترونية
- حساب ضريبة القيمة المضافة على مستوى البند وليس الإجمالي (لدعم بنود معفاة).
- بنية `zatca` جاهزة (UUID · Hash · QR TLV Base64) خلف مفتاح `sys_zatcaEnabled` القائم.
- الربط الفعلي مع هيئة الزكاة والضريبة = مرحلة لاحقة، لكن البيانات تُخزَّن من الآن.

### R4 — المتأخرات وأعمار الديون
تقرير Aging: `0-30` · `31-60` · `61-90` · `+90` يوماً، لكل عميل ولكل قضية، مع إجمالي المستحق.

### R5 — فصل المالي عن القانوني
- `ACCOUNTANT`: وصول كامل لـ `invoices` `receipts` `vouchers` `payments` `expenses` `fee_agreements`، ووصول للقراءة فقط لبيانات القضية التعريفية (الرقم والعنوان والعميل) — **بلا محتوى قانوني ولا مستندات**.
- `OFFICE_LAWYER` `CONSULTANT` `SECRETARY` `TRAINEE`: لا يرون الأرقام المالية الكلية للمكتب.

### R6 — الشاشات
| الشاشة | المسار |
|---|---|
| الفواتير | `/app/invoices` |
| تفاصيل فاتورة | `/app/invoices/:id` |
| سندات القبض والصرف | تبويبان جديدان داخل `Accounting.tsx` (**التبويبان القائمان يبقيان**) |
| اتفاقيات الأتعاب | `/app/fee-agreements` |
| تسجيل الساعات | `/app/time-entries` |
| المتأخرات | تبويب داخل `Reports.tsx` |

---

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | إصدار فاتورة من اتفاقية أتعاب أو من عقد أو يدوياً، مع حساب ضريبة صحيح على مستوى البند |
| AC-2 | 1000 فاتورة متزامنة تُنتج 1000 رقم فريد بلا تكرار (اختبار تزامن) |
| AC-3 | `ACCOUNTANT` لا يستطيع فتح محتوى قضية أو مستند قانوني (403) |
| AC-4 | `OFFICE_LAWYER` يرى الفاتورة ولا يعدّلها ولا يعتمدها |
| AC-5 | سند قبض يُنقص `remainingAmount` تلقائياً ويحدّث حالة الفاتورة |
| AC-6 | تقرير أعمار الديون يطابق الحسابات اليدوية على بيانات اختبار |
| AC-7 | تبويبا `Accounting.tsx` القائمان يعملان كما كانا تماماً |
| AC-8 | طباعة/تصدير الفاتورة PDF بالعربية RTL مع ختم المكتب و QR |
| AC-9 | كل عملية مالية مسجّلة في `auditLogs` |
| AC-10 | `npm run lint` = 0 أخطاء |

---

## المهام

- [ ] **T001** نماذج البيانات + الفهارس المركّبة
- [ ] **T002** `src/server/lib/sequence.ts` — ترقيم تسلسلي بمعاملة + اختبار تزامن (AC-2)
- [ ] **T003** `src/server/lib/tax.ts` — حساب الضريبة على مستوى البند + الخصومات
- [ ] **T004** `src/server/routes/invoices.ts` — CRUD + آلة الحالات + اعتماد + إلغاء
- [ ] **T005** `src/server/routes/receipts.ts` و`vouchers.ts`
- [ ] **T006** `src/server/routes/fee-agreements.ts` + المعالم (milestones) وتوليد الفواتير منها
- [ ] **T007** `src/server/routes/time-entries.ts` + تحويل الساعات إلى بنود فاتورة
- [ ] **T008** ربط سند القبض بتحديث `paidAmount`/`remainingAmount`/`status` في معاملة واحدة
- [ ] **T009** قواعد Firestore: فصل المالي عن القانوني (R5)
- [ ] **T010** بنية ZATCA (UUID · Hash · QR TLV) خلف `sys_zatcaEnabled`
- [ ] **T011** `src/pages/Invoices.tsx` و`InvoiceDetails.tsx`
- [ ] **T012** `src/pages/FeeAgreements.tsx` و`TimeEntries.tsx`
- [ ] **T013** إضافة تبويبَي "سندات القبض" و"سندات الصرف" في `Accounting.tsx` (بلا حذف القائم)
- [ ] **T014** `src/components/AddInvoiceModal.tsx` · `AddReceiptModal.tsx` · `AddVoucherModal.tsx` · `AddFeeAgreementModal.tsx`
- [ ] **T015** قالب فاتورة PDF عربي RTL + شعار المكتب + QR
- [ ] **T016** تقرير أعمار الديون في `Reports.tsx` (تبويب جديد)
- [ ] **T017** تبويب "المالية" داخل `CaseDetails.tsx` و`Clients.tsx`
- [ ] **T018** مهمة يومية: وسم الفواتير المتأخرة `OVERDUE` + إطلاق تنبيهات
- [ ] **T019** إضافة المسارات وعناصر القائمة في `App.tsx`
- [ ] **T020** الاختبارات: الترقيم · الضريبة · التسويات · الصلاحيات · الفصل المالي
- [ ] **T021** `npm run lint` = 0 أخطاء

**التقدير:** 10–12 يوم عمل
