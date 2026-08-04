# 010 — الموارد البشرية: الحضور والإجازات والكادر

**المرحلة:** 3 · **الأولوية:** 🟡 متوسطة · **يعتمد على:** 002, 003

يحقق: الوثيقة **§1.10 إدارة الموارد البشرية** (المحامون والمستشارون والسكرتارية والموظفون · الحضور والإجازات)

---

## الوضع الحالي

✅ يبقى: `Trainees.tsx` (متدربون + تقييمات) · `OfficeLawyers.tsx` (محامو المكتب) · `Lawyers.tsx` (SUPER_ADMIN).
🔴 ناقص: ملف موظف كامل · **الحضور** · **الإجازات** · الرواتب · الوثائق الوظيفية · الهيكل التنظيمي · التقييم الدوري.

---

## النموذج

```ts
// employees/{userId}         — ملف وظيفي يمتد للمستخدم (لا يستبدل users)
{ userId, lawyerId, employeeNumber,
  jobTitle, department,      // LEGAL | ADMIN | FINANCE | SUPPORT
  employmentType,            // FULL_TIME | PART_TIME | CONTRACT | INTERN
  hireDate, contractEndDate?, managerId?,
  nationalId, nationalIdExpiry, barLicenseNumber?, barLicenseExpiry?,
  salary?: { base, allowances, currency },   // ACCOUNTANT + LAWYER فقط
  bankAccount?: { iban, bankName },          // مقنّع في العرض
  emergencyContact: { name, phone, relation },
  documents: [{ type, name, storagePath, expiryDate }],
  annualLeaveBalance: number, sickLeaveBalance: number,
  status, deletedAt }

// attendance/{id}
{ id, lawyerId, userId, date,
  checkIn?, checkOut?, workedMinutes, breakMinutes,
  status,                    // PRESENT | ABSENT | LATE | HALF_DAY | ON_LEAVE | HOLIDAY | REMOTE
  method,                    // WEB | MOBILE | MANUAL | IMPORT
  location?: { lat, lng, accuracy },
  notes, approvedBy?, deletedAt }

// leave_requests/{id}
{ id, lawyerId, userId,
  type,                      // ANNUAL | SICK | UNPAID | EMERGENCY | MATERNITY | HAJJ | OTHER
  startDate, endDate, days, reason, attachmentPath?,
  status,                    // PENDING → APPROVED | REJECTED | CANCELLED
  approverId?, approvedAt, rejectionReason,
  coveringUserId?,           // من يغطي المهام أثناء الغياب
  createdAt, deletedAt }

// holidays/{id}
{ lawyerId, name, date, isRecurring }

// performance_reviews/{id}   — يعمّم منطق TraineeEvaluation القائم على كل الكادر
{ id, lawyerId, userId, reviewerId, period, scores: { … }, overallScore,
  strengths, improvements, goals, notes, date, deletedAt }
```

---

## المتطلبات

### R1 — ملف موظف موحّد يمتد ولا يستبدل
`employees/{userId}` يرتبط بـ `users/{userId}` القائم. **لا نقل بيانات ولا تعديل على `users`.**
`Trainees.tsx` و`OfficeLawyers.tsx` تبقيان تعملان كما هما، ويُضاف لهما زر "الملف الوظيفي".

### R2 — الحضور
تسجيل حضور/انصراف من الويب مع موقع اختياري · إدخال يدوي بموافقة · استيراد من ملف · حساب ساعات العمل والتأخير · تقويم شهري ملوّن.

### R3 — الإجازات
طلب ← موافقة المدير المباشر أو مدير المكتب ← خصم من الرصيد تلقائياً.
تعارض الإجازة مع جلسة أو موعد للموظف ⇒ تحذير للمعتمِد. تعيين موظف تغطية اختياري.

### R4 — الرواتب (نطاق محدود)
تسجيل الراتب وبدلاته وربطه بسندات الصرف (005). **بلا حساب ضرائب أو تأمينات** — خارج النطاق.
مرئي لـ `ACCOUNTANT` و`LAWYER` فقط.

### R5 — تنبيهات الوثائق
تنبيه قبل انتهاء: الهوية · رخصة المحاماة · عقد العمل (عبر 008).

### R6 — الصلاحيات
`LAWYER` كامل · `PARTNER` عرض بلا رواتب · `ACCOUNTANT` الرواتب فقط
الموظف: ملفه وحضوره وإجازاته فقط · باقي الأدوار: لا وصول

---

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | إنشاء ملف وظيفي لأي مستخدم دون تعديل مستنده في `users` |
| AC-2 | تسجيل الحضور يحسب الساعات والتأخير صحيحاً |
| AC-3 | الموافقة على إجازة تخصم من الرصيد تلقائياً ولا تسمح بالسالب |
| AC-4 | تعارض الإجازة مع جلسة يظهر تحذيراً للمعتمِد |
| AC-5 | الرواتب محجوبة عن كل الأدوار عدا `ACCOUNTANT` و`LAWYER` |
| AC-6 | الموظف يرى بياناته فقط ولا يرى زملاءه |
| AC-7 | تنبيه انتهاء الوثائق يصل في موعده |
| AC-8 | `Trainees.tsx` و`OfficeLawyers.tsx` تعملان كما كانتا |
| AC-9 | `npm run lint` = 0 أخطاء |

---

## المهام

- [ ] **T001** النماذج الخمسة + الفهارس `(lawyerId, userId, date)` · `(lawyerId, status)`
- [ ] **T002** `src/server/routes/employees.ts` — ملف وظيفي + وثائق + حجب الرواتب حسب الدور
- [ ] **T003** `src/server/routes/attendance.ts` — حضور/انصراف + حساب الساعات + إدخال يدوي بموافقة
- [ ] **T004** `src/server/routes/leaves.ts` — طلب · موافقة · رفض · خصم الرصيد في معاملة
- [ ] **T005** `src/server/lib/leaveConflicts.ts` — كشف تعارض الإجازة مع الجلسات والمواعيد
- [ ] **T006** `src/server/routes/holidays.ts` + العطل الرسمية الافتراضية
- [ ] **T007** تعميم `performance_reviews` على كل الكادر (منطق `TraineeEvaluation` القائم يبقى)
- [ ] **T008** `src/pages/HR.tsx` (`/app/hr`) بتبويبات: الكادر · الحضور · الإجازات · التقييمات · العطل
- [ ] **T009** `src/pages/MyAttendance.tsx` — شاشة الموظف: تسجيل حضور + رصيد الإجازات + طلب إجازة
- [ ] **T010** `src/components/EmployeeProfileModal.tsx` · `LeaveRequestModal.tsx` · `AttendanceCalendar.tsx`
- [ ] **T011** إضافة زر "الملف الوظيفي" في `Trainees.tsx` و`OfficeLawyers.tsx` و`Team.tsx`
- [ ] **T012** ربط الرواتب بسندات الصرف (005)
- [ ] **T013** تنبيهات انتهاء الوثائق (008)
- [ ] **T014** تقارير: نسبة الحضور · أيام الإجازات · معدلات التأخير (تُدمج في 013)
- [ ] **T015** الاختبارات: حساب الساعات · خصم الرصيد · التعارض · حجب الرواتب
- [ ] **T016** `npm run lint` = 0 أخطاء

**التقدير:** 8–10 أيام عمل
