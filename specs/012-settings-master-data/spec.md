# 012 — الإعدادات والبيانات المرجعية

**المرحلة:** 3 · **الأولوية:** 🟡 متوسطة · **يعتمد على:** 002

يحقق: الوثيقة **§1.12 الإعدادات** (المحاكم · أنواع القضايا · أنواع العقود · الصلاحيات · القوالب · التنبيهات)

---

## المشكلة الجوهرية

**كل الإعدادات تُحفظ في `localStorage` فقط** (`Settings.tsx:199-227`):
- لا تُشارك بين مستخدمي المكتب — كل موظف له إعداداته المنفصلة.
- تضيع عند مسح المتصفح أو تغيير الجهاز.
- إعدادات حساسة (`sys_aiApiKey`) مخزّنة في متصفح كل مستخدم.

وبيانات مرجعية أساسية **غير موجودة**: قوائم المحاكم · أنواع القضايا · أنواع العقود · بنود المصروفات · العطل.
وأنواع القضايا مكتوبة يدوياً داخل `AddCaseModal.tsx` بلا إمكانية تخصيص.

---

## الحل

### R1 — نقل الإعدادات إلى Firestore

```ts
// office_settings/{lawyerId}
{
  lawyerId,
  office: { name, logoPath, stampPath, address, phone, email, website,
            taxNumber, commercialRegNumber, letterheadPath },
  regional: { currency, currencySymbol, vatRate, zatcaEnabled,
              locale: "ar-SA", hijriCalendar: boolean, timezone, weekStart },
  ai: { provider, model, analysisEnabled, draftingEnabled, risksEnabled },
              // ← المفتاح نفسه في secrets/{lawyerId} لا هنا
  najiz: { mode, clientId, syncFreq },
  numbering: { casePrefix, invoicePrefix, contractPrefix, receiptPrefix,
               voucherPrefix, resetYearly: boolean },
  permissions: { …تجاوزات المصفوفة لكل دور… },   // من الميزة 002
  notifications: { …قواعد المكتب… },              // من الميزة 008
  appearance: { primaryColor, accentColor, theme, fontSize },
  security: { sessionTimeoutMinutes, require2FA, passwordPolicy, ipAllowlist: string[] },
  updatedAt, updatedBy
}

// secrets/{lawyerId}   — قواعد Firestore تمنع القراءة من العميل نهائياً
{ aiApiKey?, najizApiKey?, smtpPassword?, whatsappToken?, paymentSecretKey? }
```

**`localStorage` يبقى** كذاكرة تخزين مؤقت (cache) للقراءة السريعة — المصدر الحقيقي هو Firestore.

### R2 — البيانات المرجعية

```ts
// ref_courts/{id}       { lawyerId|"SYSTEM", name, type, city, region, circuits: string[], address, phone, active, order }
// ref_case_types/{id}   { lawyerId|"SYSTEM", nameAr, code, category, defaultDurationDays, color, icon, active, order }
// ref_contract_types/{id} { lawyerId|"SYSTEM", nameAr, code, defaultTemplateId, active, order }
// ref_expense_types/{id}  { lawyerId|"SYSTEM", nameAr, code, billableToClient, accountCode, active }
// ref_document_types/{id} { lawyerId|"SYSTEM", nameAr, code, defaultConfidentiality, active }
// ref_hearing_types/{id}  { lawyerId|"SYSTEM", nameAr, code, active }
```

- `lawyerId: "SYSTEM"` = قوائم افتراضية يراها الجميع (محاكم السعودية، أنواع القضايا القياسية).
- كل مكتب يضيف قوائمه الخاصة أو يُخفي الافتراضية دون حذفها.
- **القيم المكتوبة يدوياً في الكود تبقى كقيم احتياطية (fallback)** إن كانت القائمة فارغة — ضمان عدم الكسر.

### R3 — القوالب
توحيد القوالب في `templates/{id}` مع `category: "CONTRACT"|"MEMO"|"LAWSUIT"|"INVOICE"|"EMAIL"|"LETTER"|"POA"`
ومحرّك متغيرات مشترك: `{{client.name}}` `{{case.number}}` `{{office.name}}` `{{date.today}}` …
**`custom_templates` و`template_folders` القائمان يبقيان ويُقرآن ضمن النظام الموحّد.**

### R4 — استكمال تبويبات `Settings.tsx`
| التبويب | الحالة | العمل |
|---|---|---|
| عام | 🟡 يعمل بـ localStorage | نقل إلى Firestore + إضافة الشعار والختم والترويسة |
| الملف الشخصي | 🟡 حقول لا تُحفظ | تفعيل الحفظ الفعلي |
| الأمان | ✅ يعمل | إضافة 2FA · مهلة الجلسة · قائمة IP |
| الربط والأنظمة | 🟡 يعمل | نقل المفاتيح إلى `secrets/` على الخادم |
| الصلاحيات | 🔴 HTML ثابت | ← الميزة 002 |
| التنبيهات | 🔴 فارغ | ← الميزة 008 |
| المظهر | 🔴 فارغ | ألوان · وضع ليلي · حجم الخط |
| **البيانات المرجعية** | ➕ جديد | المحاكم · أنواع القضايا · العقود · المصروفات · العطل |
| **القوالب** | ➕ جديد | إدارة موحّدة |
| **الترقيم** | ➕ جديد | بادئات وتسلسل المستندات |

### R5 — أمان الأسرار
`sys_aiApiKey` و`sys_najizApiKey` تنتقل من `localStorage` إلى `secrets/{lawyerId}` بقواعد `allow read: if false`،
وتُستخدم من الخادم فقط. الواجهة تعرض `••••••••` وتسمح بالاستبدال لا بالقراءة.

---

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | الإعدادات تُحفظ في Firestore وتظهر لكل مستخدمي المكتب على كل الأجهزة |
| AC-2 | المفاتيح السرية غير قابلة للقراءة من العميل (اختبار قواعد) |
| AC-3 | إضافة محكمة أو نوع قضية مخصص يظهر فوراً في نماذج الإدخال |
| AC-4 | إخفاء عنصر افتراضي لا يحذفه ولا يؤثر على السجلات التي تستخدمه |
| AC-5 | القيم الاحتياطية المكتوبة في الكود تعمل إن كانت القوائم فارغة |
| AC-6 | كل تبويبات `Settings.tsx` القائمة تعمل كما كانت أو أفضل |
| AC-7 | تغيير الإعدادات مسجَّل في التدقيق |
| AC-8 | ترحيل الإعدادات من `localStorage` إلى Firestore يتم تلقائياً عند أول دخول |
| AC-9 | `npm run lint` = 0 أخطاء |

---

## المهام

- [ ] **T001** نموذج `office_settings` و`secrets` + قواعد Firestore (منع قراءة `secrets`)
- [ ] **T002** `src/server/routes/settings.ts` — قراءة/كتابة + `permit("settings.manage")` + تدقيق
- [ ] **T003** `src/lib/settingsStore.ts` — قراءة من Firestore مع cache في localStorage + `useSettings()` Hook
- [ ] **T004** ترحيل تلقائي: عند أول دخول، نقل قيم `sys_*` من localStorage إلى Firestore (مرة واحدة، idempotent)
- [ ] **T005** نقل المفاتيح السرية إلى `secrets/` وتعديل مسارات الخادم لقراءتها من هناك
- [ ] **T006** النماذج الستة للبيانات المرجعية + بيانات `SYSTEM` الافتراضية (محاكم السعودية وأنواع القضايا)
- [ ] **T007** `src/server/routes/reference-data.ts` — CRUD للقوائم المخصّصة
- [ ] **T008** `src/components/settings/ReferenceDataManager.tsx` — واجهة موحّدة لكل القوائم
- [ ] **T009** ربط `AddCaseModal` و`EditCaseModal` و`AddHearingModal` و`AddExpenseModal` بالقوائم المرجعية مع fallback للقيم المكتوبة
- [ ] **T010** توحيد القوالب في `templates/` مع قراءة `custom_templates` القائم
- [ ] **T011** محرّك المتغيرات المشترك `src/lib/templateEngine.ts`
- [ ] **T012** تبويب "المظهر": ألوان · وضع ليلي · حجم الخط
- [ ] **T013** تبويب "الترقيم": بادئات وتسلسل (يغذّي 004 و005)
- [ ] **T014** تفعيل حفظ تبويب "الملف الشخصي"
- [ ] **T015** رفع شعار وختم وترويسة المكتب (تُستخدم في PDF الفواتير والعقود)
- [ ] **T016** إعدادات الأمان: 2FA · مهلة الجلسة · قائمة IP المسموحة
- [ ] **T017** الاختبارات: الترحيل · منع قراءة الأسرار · fallback القوائم
- [ ] **T018** `npm run lint` = 0 أخطاء

**التقدير:** 7–9 أيام عمل
