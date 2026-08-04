# 007 — المواعيد والتقويم الموحّد

**المرحلة:** 2 · **الأولوية:** 🟠 عالية · **يعتمد على:** 002

يحقق: الوثيقة **§1.8 إدارة المواعيد** (مواعيد العملاء والاجتماعات والجلسات · التقويم والتنبيهات)

---

## المشكلة

**الوحدة غير موجودة.** لا كولكشن `appointments`، ولا أي عرض تقويمي في النظام كله.
الجلسات موجودة في `Hearings.tsx` لكن كجدول فقط — لا تقويم شهري/أسبوعي/يومي، ولا مواعيد اجتماعات أو استشارات.

---

## نموذج البيانات

```ts
// appointments/{id}
{
  id, lawyerId,
  title, description,
  type,          // CLIENT_MEETING | INTERNAL_MEETING | CONSULTATION
                 // | COURT_VISIT | DEADLINE | REMINDER | OTHER
  startAt, endAt, allDay: boolean, timezone: "Asia/Riyadh",
  location, isOnline: boolean, meetingUrl?,
  clientId?, caseId?, contractId?,
  organizerId,
  attendees: [{ userId?, clientId?, name, email, status }],  // PENDING|ACCEPTED|DECLINED
  reminders: [{ minutesBefore: number, channels: ("IN_APP"|"EMAIL"|"WHATSAPP"|"PUSH")[] }],
  recurrence?: { freq: "DAILY"|"WEEKLY"|"MONTHLY", interval, until?, count?, byDay? },
  recurrenceParentId?,
  status,        // SCHEDULED | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW
  outcome?, followUpTaskId?,
  color?,
  deletedAt, deletedBy, createdAt, createdBy
}

// availability/{userId}   — ساعات العمل ومنع التعارض
{ lawyerId, userId, workDays: number[], workStart: "09:00", workEnd: "17:00",
  slotMinutes: 30, blockedRanges: [{ from, to, reason }] }
```

---

## المتطلبات

### R1 — تقويم موحّد
عرض واحد `/app/calendar` يجمع **أربعة مصادر** في تقويم واحد:
1. `appointments` (المواعيد الجديدة)
2. `cases/{id}/hearings` (الجلسات القائمة — **قراءة فقط، بلا تعديل بنيتها**)
3. `tasks.dueDate` (مواعيد تسليم المهام)
4. `contracts.endDate` و`invoices.dueDate` (مواعيد مالية وتعاقدية)

أوضاع العرض: شهري · أسبوعي · يومي · قائمة أجندة. مع فلترة بالمصدر والمستخدم والنوع.

### R2 — كشف التعارض
عند الحفظ، تحذير إن تعارض الموعد مع جلسة أو موعد آخر لنفس المستخدم — تحذير لا منع (المستخدم يقرر).

### R3 — التكرار
مواعيد متكررة (يومي/أسبوعي/شهري) مع تعديل "هذا الموعد فقط" أو "كل المواعيد التالية".

### R4 — التذكيرات
تُسلَّم عبر محرك التنبيهات (الميزة 008). الافتراضي: تذكير قبل يوم وقبل ساعة.

### R5 — التصدير والمزامنة
- تصدير `.ics` للموعد وللتقويم كاملاً.
- رابط اشتراك iCal للقراءة (Google/Outlook/Apple) بمفتاح خاص قابل للإلغاء.

### R6 — الصلاحيات
`SECRETARY` = جدولة كاملة (الوثيقة §2.5) · `CLIENT` = عرض مواعيده فقط + طلب موعد
`OFFICE_LAWYER`/`CONSULTANT` = مواعيدهم ومواعيد قضاياهم · `ACCOUNTANT` = لا وصول

---

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | التقويم يعرض المصادر الأربعة معاً بألوان مميزة وفلترة تعمل |
| AC-2 | الجلسات القائمة تظهر في التقويم دون أي تعديل على بنية `hearings` |
| AC-3 | التعارض يُكتشف ويُعرض تحذيراً واضحاً |
| AC-4 | الموعد المتكرر يُنشئ الحالات صحيحة، وتعديل حالة واحدة لا يؤثر على الباقي |
| AC-5 | ملف `.ics` المصدَّر يُستورد بنجاح في Google Calendar وOutlook |
| AC-6 | `SECRETARY` يجدول · `CLIENT` يرى مواعيده فقط · `ACCOUNTANT` محجوب |
| AC-7 | التقويم متجاوب مع الجوال وRTL بالكامل |
| AC-8 | `Hearings.tsx` القائمة تعمل كما كانت |
| AC-9 | `npm run lint` = 0 أخطاء |

---

## المهام

- [ ] **T001** نموذج `appointments` و`availability` + الفهارس `(lawyerId, startAt)` · `(lawyerId, organizerId, startAt)`
- [ ] **T002** `src/server/routes/appointments.ts` — CRUD + `permit()` + `writeAudit()`
- [ ] **T003** `src/server/lib/calendarAggregator.ts` — دمج المصادر الأربعة في نموذج حدث موحّد
- [ ] **T004** `src/server/lib/conflicts.ts` — كشف التعارض مع ساعات العمل والمواعيد الأخرى
- [ ] **T005** `src/server/lib/recurrence.ts` — توليد الحالات + قواعد التعديل الجزئي
- [ ] **T006** توليد `.ics` + مسار اشتراك iCal بمفتاح قابل للإلغاء
- [ ] **T007** `src/components/Calendar/` — `MonthView` · `WeekView` · `DayView` · `AgendaView` (RTL، بلا مكتبة ثقيلة)
- [ ] **T008** `src/pages/Calendar.tsx` (`/app/calendar`) مع الفلاتر
- [ ] **T009** `src/components/AddAppointmentModal.tsx` و`EditAppointmentModal.tsx`
- [ ] **T010** `src/components/AvailabilitySettings.tsx` (ساعات العمل ضمن الإعدادات)
- [ ] **T011** إضافة المسار وعنصر القائمة "المواعيد والتقويم" في `App.tsx`
- [ ] **T012** ويدجت "مواعيد اليوم" في `Dashboard.tsx` (إضافة بطاقة — بلا حذف القائم)
- [ ] **T013** تبويب "المواعيد" داخل `CaseDetails.tsx` و`Clients.tsx`
- [ ] **T014** ربط التذكيرات بمحرك التنبيهات (008)
- [ ] **T015** الاختبارات: الدمج · التعارض · التكرار · التصدير · الصلاحيات
- [ ] **T016** `npm run lint` = 0 أخطاء

**التقدير:** 7–9 أيام عمل
