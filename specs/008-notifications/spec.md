# 008 — محرك التنبيهات (بريد · واتساب · Push · داخل التطبيق)

**المرحلة:** 3 · **الأولوية:** 🟡 متوسطة · **يعتمد على:** 002, 007

يحقق: الوثيقة **§1.4** (إشعارات تلقائية للجلسات) · **§1.1** (إشعارات النظام) · **§5** (تنبيهات الجلسات والمواعيد والتكاليف المتأخرة)

---

## الوضع الحالي

✅ يبقى ويُعاد استخدامه: منطق التنبيهات في `App.tsx:177-346` (جلسات اليوم/الغد/خلال 3 أيام + مهام متأخرة/مستحقة) + الجرس + النغمة + `sendWhatsAppNotification` في `api.ts:296-306` (CallMeBot لإشعار المالك بطلبات الاشتراك).

🔴 ناقص:
- استقصاء (Polling) كل 5 دقائق من كل متصفح — مكلف وغير موثوق، ولا يعمل والتطبيق مغلق.
- لا بريد إلكتروني · لا واتساب للمستخدمين · لا Push.
- لا تفضيلات لكل مستخدم · لا سجل تنبيهات · لا "مقروء/غير مقروء".
- تبويب "التنبيهات" في `Settings.tsx` فارغ.

---

## المعمارية

```
مصدر الحدث (جلسة · مهمة · عقد · فاتورة · موعد · حساب)
        ↓
  قواعد التنبيه (notification_rules)  ← قابلة للتخصيص لكل مكتب
        ↓
  طابور الإرسال (notification_queue)  ← مع إعادة محاولة وتراجع أُسّي
        ↓
  ┌────────┬────────┬─────────┬──────┐
  │ داخلي  │ بريد   │ واتساب  │ Push │   ← حسب تفضيلات المستخدم
  └────────┴────────┴─────────┴──────┘
        ↓
  سجل التسليم (notifications) + حالة القراءة
```

## نموذج البيانات

```ts
// notifications/{id}
{ id, lawyerId, userId, type, title, body, link, entity, entityId,
  priority: "LOW"|"NORMAL"|"HIGH"|"URGENT",
  channels: string[], readAt?, deliveredAt: { inApp?, email?, whatsapp?, push? },
  createdAt, expiresAt }

// notification_preferences/{userId}
{ lawyerId, userId,
  channels: { HEARING_REMINDER: ["IN_APP","EMAIL","WHATSAPP"],
              TASK_DUE: ["IN_APP"], INVOICE_OVERDUE: ["IN_APP","EMAIL"], … },
  quietHours: { from: "22:00", to: "07:00" },
  digestMode: "OFF" | "DAILY" | "WEEKLY", digestTime: "08:00" }

// notification_rules/{id}     — قواعد المكتب
{ lawyerId, event, enabled, offsets: number[], recipients: ("ASSIGNEE"|"TEAM"|"OWNER"|"CLIENT")[],
  templateId, channels }

// notification_queue/{id}
{ lawyerId, notificationId, channel, payload, attempts, nextAttemptAt, status, lastError }
```

## الأحداث المدعومة

| الحدث | التوقيت الافتراضي | المستقبل |
|---|---|---|
| `HEARING_REMINDER` | 3 أيام · يوم · 3 ساعات قبل | المحامي المسؤول + الفريق |
| `HEARING_RESULT_MISSING` | يوم بعد الجلسة | المحامي المسؤول |
| `TASK_DUE` / `TASK_OVERDUE` | يوم قبل · يوم الاستحقاق · بعد التأخر | المسنَد إليه + مسنِد المهمة |
| `TASK_ASSIGNED` | فوري | المسنَد إليه |
| `CONTRACT_EXPIRING` | 30 · 14 · 7 أيام قبل | مدير المكتب + المحامي |
| `CONTRACT_PENDING_APPROVAL` | فوري | الشريك/مدير المكتب |
| `INVOICE_DUE` / `INVOICE_OVERDUE` | 3 أيام قبل · يوم الاستحقاق · +7 أيام | المحاسب + مدير المكتب + العميل |
| `APPOINTMENT_REMINDER` | حسب `reminders` | الحضور |
| `CASE_STATUS_CHANGED` | فوري | الفريق |
| `DOCUMENT_SHARED` | فوري | العميل |
| `SUBSCRIPTION_EXPIRING` | 14 · 7 · 3 · 1 يوم قبل | مدير المكتب + `SUPER_ADMIN` |
| `NEW_SUBSCRIPTION_REQUEST` | فوري | `SUPER_ADMIN` (يستبدل CallMeBot القائم ويُبقيه كخيار) |

---

## المتطلبات

### R1 — التوليد على الخادم لا في المتصفح
مهمة مجدولة (Cron / Cloud Scheduler) كل 15 دقيقة تُنتج التنبيهات المستحقة.
**منطق `App.tsx` القائم يبقى يعمل** كطبقة عرض فورية، لكنه يقرأ من `notifications` بدل حساب كل شيء بنفسه.

### R2 — تحديث لحظي
`onSnapshot` على `notifications` الخاصة بالمستخدم بدل الاستقصاء كل 5 دقائق (توفير قراءات Firestore كبير).

### R3 — القنوات
| القناة | التنفيذ |
|---|---|
| داخل التطبيق | Firestore + `onSnapshot` (قائم — يُوسَّع) |
| البريد | مزوّد SMTP/Resend + قوالب HTML عربية RTL |
| واتساب | WhatsApp Business Cloud API (مع الإبقاء على CallMeBot كخيار) |
| Push | Firebase Cloud Messaging + Service Worker |

### R4 — منع الإزعاج
عدم التكرار (Deduplication) بمفتاح `userId+event+entityId+offset` · ساعات هدوء · ملخّص يومي/أسبوعي اختياري.

### R5 — تبويب التنبيهات في الإعدادات
`Settings.tsx` تبويب "التنبيهات" الفارغ يُملأ: مصفوفة قناة×حدث · ساعات الهدوء · وضع الملخّص · اختبار الإرسال.

---

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | تنبيه الجلسة يصل في المواعيد الثلاثة عبر القنوات المفعّلة |
| AC-2 | التنبيهات تُولَّد على الخادم وتصل حتى والتطبيق مغلق |
| AC-3 | لا تكرار: نفس الحدث لا يُرسل مرتين لنفس المستخدم |
| AC-4 | ساعات الهدوء تؤجل غير العاجل ولا تؤجل `URGENT` |
| AC-5 | فشل قناة يعيد المحاولة 3 مرات بتراجع أُسّي ولا يُسقط باقي القنوات |
| AC-6 | جرس التنبيهات القائم في `App.tsx` يعمل كما كان مع تحديث لحظي |
| AC-7 | استهلاك قراءات Firestore ينخفض مقارنة بالاستقصاء الحالي |
| AC-8 | تبويب التنبيهات يحفظ ويطبّق التفضيلات فعلياً |
| AC-9 | `npm run lint` = 0 أخطاء |

---

## المهام

- [ ] **T001** نماذج البيانات الأربعة + الفهارس `(userId, readAt, createdAt desc)`
- [ ] **T002** `src/server/lib/notifications/engine.ts` — التوليد والتوجيه ومنع التكرار
- [ ] **T003** `src/server/lib/notifications/queue.ts` — الطابور وإعادة المحاولة بتراجع أُسّي
- [ ] **T004** قناة داخل التطبيق (كتابة Firestore)
- [ ] **T005** قناة البريد + قوالب HTML عربية RTL
- [ ] **T006** قناة واتساب (WhatsApp Cloud API) مع الإبقاء على `sendWhatsAppNotification` القائم
- [ ] **T007** قناة Push (FCM + Service Worker + إدارة الرموز)
- [ ] **T008** مهمة مجدولة كل 15 دقيقة لتوليد التنبيهات المستحقة
- [ ] **T009** ربط الأحداث الاثني عشر بمصادرها
- [ ] **T010** تحويل `Header` في `App.tsx:177-346` إلى `onSnapshot` على `notifications` (الجرس والنغمة والمظهر تبقى)
- [ ] **T011** `src/pages/Notifications.tsx` — مركز التنبيهات الكامل مع فلترة و"تعليم الكل كمقروء"
- [ ] **T012** ملء تبويب "التنبيهات" في `Settings.tsx` + زر اختبار إرسال
- [ ] **T013** `notification_rules` قابلة للتخصيص لكل مكتب
- [ ] **T014** الملخّص اليومي/الأسبوعي
- [ ] **T015** الاختبارات: التوليد · منع التكرار · إعادة المحاولة · ساعات الهدوء · التفضيلات
- [ ] **T016** `npm run lint` = 0 أخطاء

**التقدير:** 8–10 أيام عمل
