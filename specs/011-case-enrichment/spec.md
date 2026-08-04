# 011 — إثراء القضايا والجلسات والعملاء والمهام

**المرحلة:** 3 · **الأولوية:** 🟡 متوسطة · **يعتمد على:** 002

يحقق: الوثيقة **§1.2 العملاء** · **§1.3 القضايا** · **§1.4 الجلسات** · **§1.6 المهام** · §5 (ربط كل قضية بمحامٍ مسؤول وفريق عمل محدد)

> كل ما في هذه الميزة **إضافة حقول وتبويبات** على شاشات قائمة. لا يُحذف ولا يُعاد تسمية أي حقل موجود.

---

## 1) العملاء — الناقص من §1.2

| الناقص | الإضافة |
|---|---|
| السجل التجاري | `commercialRegNumber` · `crIssueDate` · `crExpiryDate` · `crDocumentPath` |
| **الأشخاص المفوضون** | كولكشن فرعي `clients/{id}/authorized_persons`: `{ name, nationalId, position, phone, email, powerOfAttorneyNumber, poaExpiryDate, poaDocumentPath, isPrimary, active }` |
| العقود والفواتير المرتبطة | تبويبات جديدة في `Clients.tsx` تقرأ من 004 و005 |
| تصنيف العميل | `category: "VIP"|"REGULAR"|"PROSPECT"` · `source` · `rating` |
| جهات اتصال متعددة | `contacts: [{ name, role, phone, email, isPrimary }]` |
| الجنسية والكيان | `nationality` · `entityType` للشركات |

**تنبيه تلقائي** قبل انتهاء السجل التجاري أو التوكيل (عبر 008).

---

## 2) القضايا — الناقص من §1.3

| الناقص | الإضافة |
|---|---|
| **القاضي** | `judgeName` · `judgePosition` |
| **الفريق المشارك** | `teamIds: string[]` + `teamRoles: [{ userId, role, assignedAt, assignedBy }]` |
| المحامي المسؤول | `assignedLawyerId` (يُوثَّق ويُفرض — قائم جزئياً) |
| أطراف الدعوى الكاملة | كولكشن فرعي `cases/{id}/parties`: `{ partyType: "PLAINTIFF"|"DEFENDANT"|"THIRD_PARTY"|"WITNESS"|"EXPERT", name, nationalId, phone, address, lawyerName, lawyerPhone, isOurClient }` |
| **الأحكام** | كولكشن فرعي `cases/{id}/judgments`: `{ judgmentDate, court, degree: "FIRST"|"APPEAL"|"CASSATION", type: "FOR"|"AGAINST"|"PARTIAL"|"DISMISSED", summary, fullText, amount?, appealDeadline, appealed, documentPath }` |
| **التنفيذ** | كولكشن فرعي `cases/{id}/executions`: `{ executionNumber, court, requestDate, amount, collectedAmount, status, procedures: [{ date, type, result, notes }] }` |
| درجة التقاضي | `courtDegree` · `parentCaseId` (لربط الاستئناف بالابتدائي) |
| القيمة والمخاطر | `claimValue` · `riskLevel` · `successProbability` |
| المواعيد النظامية | `statuteOfLimitations` · `appealDeadline` مع تنبيهات |
| رقم نجز | `najizCaseNumber` (يستخدم إعداد `sys_najizMode` القائم) |

---

## 3) الجلسات — الناقص من §1.4

| الناقص | الإضافة |
|---|---|
| **القاعة** | `hallNumber` |
| **القاضي** | `judgeName` |
| **نوع الجلسة** | `hearingType: "FIRST"|"PLEADING"|"EVIDENCE"|"EXPERT"|"JUDGMENT"|"POSTPONED"|"EXECUTION"` |
| الحاضر عن المكتب | `attendedBy` · `attendanceConfirmed` |
| القرار والسبب | `decision` · `postponementReason` |
| الوقت | `hearingTime` (الحالي تاريخ فقط) |
| التذكير | `reminderSent` · ربط بمحرك 008 |
| محضر الجلسة | `minutesPath` · `minutesText` |

---

## 4) المهام — الناقص من §1.6

| الناقص | الإضافة |
|---|---|
| **نسبة الإنجاز** | `progressPercent: 0..100` مع شريط تقدم |
| **التعليقات** | كولكشن فرعي `tasks/{id}/comments` (`TaskComment` موجود في Prisma وغير مستخدم في Firestore) |
| المهام الفرعية | `subtasks: [{ title, done }]` |
| المرفقات | `attachments: [{ name, storagePath }]` |
| التكرار | `recurrence` للمهام الدورية |
| تتبع الوقت | `estimatedHours` · `actualHours` (يغذّي `time_entries` في 005) |
| الاعتماد | `blockedBy: string[]` |
| المشاهدون | `watcherIds: string[]` |

---

## 5) الضابط §5 — ربط القضية بفريق محدد

- كل قضية **يجب** أن يكون لها `assignedLawyerId`.
- الوصول للقضية للأدوار `ASSIGNED` يُفحص عبر `assignedLawyerId` أو `teamIds` (منفَّذ في 002، ويُغذّى هنا).
- تغيير المحامي المسؤول أو الفريق يُسجَّل في التدقيق ويُنبّه المعنيين.

---

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | كل الحقول الجديدة اختيارية، والسجلات القائمة تعمل بلا هجرة |
| AC-2 | لا حقل قائم أُعيدت تسميته أو حُذف |
| AC-3 | إضافة شخص مفوّض وربطه بتوكيل مع تنبيه انتهاء |
| AC-4 | تسجيل حكم وربط استئناف بالقضية الأصلية |
| AC-5 | ملف تنفيذ يتتبع المبالغ المحصّلة والإجراءات |
| AC-6 | فريق القضية يتحكم فعلياً في وصول `OFFICE_LAWYER` و`CONSULTANT` |
| AC-7 | نسبة إنجاز المهمة تظهر في القائمة والتقارير |
| AC-8 | تعليقات المهام تعمل مع إشعار للمعنيين |
| AC-9 | كل الشاشات القائمة تعمل كما كانت |
| AC-10 | `npm run lint` = 0 أخطاء |

---

## المهام

- [ ] **T001** توسيع نموذج العميل + كولكشن `authorized_persons`
- [ ] **T002** إضافة الحقول في `AddClientModal.tsx` و`EditClientModal.tsx` (بلا مساس بالحقول القائمة)
- [ ] **T003** تبويبات جديدة في `Clients.tsx`: المفوضون · العقود · الفواتير
- [ ] **T004** توسيع نموذج القضية: `judgeName` `teamIds` `courtDegree` `parentCaseId` `claimValue` …
- [ ] **T005** كولكشن `cases/{id}/parties` + واجهة إدارة الأطراف
- [ ] **T006** كولكشن `cases/{id}/judgments` + واجهة الأحكام ومواعيد الاستئناف
- [ ] **T007** كولكشن `cases/{id}/executions` + واجهة التنفيذ والإجراءات
- [ ] **T008** إضافة الحقول في `AddCaseModal.tsx` و`EditCaseModal.tsx`
- [ ] **T009** تبويبات جديدة في `CaseDetails.tsx`: الأطراف · الأحكام · التنفيذ · الفريق
- [ ] **T010** مُنتقي الفريق (Multi-select) + تسجيل تدقيق عند التغيير
- [ ] **T011** توسيع نموذج الجلسة: `hallNumber` `judgeName` `hearingType` `hearingTime` `decision` …
- [ ] **T012** إضافة الحقول في `AddHearingModal.tsx` و`EditHearingModal.tsx` و`Hearings.tsx`
- [ ] **T013** توسيع نموذج المهمة + `progressPercent` وشريط التقدم
- [ ] **T014** كولكشن `tasks/{id}/comments` + واجهة التعليقات مع إشعار
- [ ] **T015** المهام الفرعية والمرفقات والتكرار وتتبع الوقت
- [ ] **T016** تنبيهات: انتهاء السجل التجاري · انتهاء التوكيل · موعد الاستئناف · التقادم (عبر 008)
- [ ] **T017** سكربتات backfill للقيم الافتراضية الآمنة
- [ ] **T018** الاختبارات + التحقق من التوافق الرجعي
- [ ] **T019** `npm run lint` = 0 أخطاء

**التقدير:** 9–11 يوم عمل
