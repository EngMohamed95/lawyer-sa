# 003 — خطة التنفيذ التقنية

## الملفات الجديدة

```
src/server/
├── routes/
│   ├── admin-tenants.ts    مسارات SUPER_ADMIN لحسابات العملاء
│   └── office-users.ts     مسارات LAWYER لمستخدمي مكتبه
└── lib/
    ├── seats.ts            PLAN_SEAT_LIMITS · assertSeatAvailable()
    ├── accountLifecycle.ts  suspend · activate · softDelete · restore · purge · cascade
    ├── invites.ts          إنشاء دعوة + إرسال بريد + استهلاك رمز
    └── transfer.ts         نقل قضايا ومهام مستخدم إلى آخر

src/pages/
├── Team.tsx                /app/team — شاشة فريق المكتب الموحّدة
└── AcceptInvite.tsx        /accept-invite?token=… (عام)

src/components/
├── AddTeamMemberModal.tsx  إنشاء/دعوة بأي دور
├── EditTeamMemberModal.tsx تعديل الدور والحالة
├── TransferOwnershipModal.tsx
├── SeatUsageCard.tsx       عدّاد "5/10 مقاعد"
└── ImpersonationBanner.tsx شريط تحذير أثناء دخول الدعم

tests/
├── accounts.lifecycle.test.ts
├── accounts.isolation.test.ts
└── accounts.seats.test.ts
```

## الملفات المعدَّلة (تحويل نداءات فقط — الشاشات تبقى)

| الملف | التعديل |
|---|---|
| `src/pages/Lawyers.tsx` | `handleAddLawyer` → `POST /api/admin/tenants` · `handleUpdateLawyer` → `PUT` · `handleRenew` → `/renew` · `handleDeleteLawyer` → `DELETE` (حذف ناعم + تعطيل Auth). إضافة أعمدة: الحالة · آخر دخول · عدد المستخدمين · أزرار إيقاف/تفعيل/دخول دعم |
| `src/components/AddOfficeLawyerModal.tsx` | `createUserWithEmailAndPassword` → `POST /api/office/users`. النموذج ومظهره يبقيان + خيار الدعوة |
| `src/components/AddTraineeModal.tsx` | نفس التحويل بدور `TRAINEE` |
| `src/pages/OfficeLawyers.tsx` · `Trainees.tsx` | إضافة `SeatUsageCard` + أزرار إيقاف/نقل ملفات. الجداول تبقى |
| `src/App.tsx` | إضافة مسار `/app/team` وعنصر قائمة (يظهر لمن يملك `users.manage`) |
| `src/pages/Login.tsx` | رفض الدخول إذا `disabled` أو `status === "SUSPENDED"` برسالة عربية |

---

## التصاميم

### 1) إنشاء حساب عميل (SUPER_ADMIN)

```ts
// POST /api/admin/tenants
router.post("/tenants", requireAuth, requireRole("SUPER_ADMIN"), async (req,res) => {
  const { name, email, phone, officeName, plan, billing, password } = parse(TenantSchema, req.body);

  const user = await admin.auth().createUser({
    email, displayName: name,
    password: password ?? generateStrongPassword(),
    emailVerified: false, disabled: false,
  });

  await admin.auth().setCustomUserClaims(user.uid, {
    role: "LAWYER", lawyerId: user.uid, plan, status: "ACTIVE",
  });                                        // ← المكتب هو مستأجر نفسه

  const expiry = addMonths(new Date(), billing === "annual" ? 12 : 1);
  await db.collection("users").doc(user.uid).set({
    name, email, phone, officeName, plan, role: "LAWYER",
    status: "ACTIVE", lawyerId: user.uid,
    subscriptionBilling: billing, subscriptionExpiry: expiry.toISOString(),
    createdAt: new Date().toISOString(), createdBy: req.user.uid, deletedAt: null,
  });

  await writeAudit(req, { action:"CREATE", entity:"tenant", entityId:user.uid, entityLabel:officeName });
  if (!password) await sendInviteEmail(email, user.uid);
  res.json({ id: user.uid, expiry: expiry.toISOString() });
});
```

### 2) حذف حساب عميل — يغلق B2 و B3

```ts
// DELETE /api/admin/tenants/:uid
const now = new Date().toISOString();

// 1) تعطيل حساب المكتب في Auth  ← الثغرة B2
await admin.auth().updateUser(uid, { disabled: true });

// 2) تعطيل كل مستخدمي المكتب     ← الثغرة B3
const members = await db.collection("users").where("lawyerId","==",uid).get();
await Promise.all(members.docs.map(async d => {
  if (d.id !== uid) await admin.auth().updateUser(d.id, { disabled: true }).catch(()=>{});
  await d.ref.update({ deletedAt: now, deletedBy: req.user.uid, status: "DELETED" });
}));

// 3) وسم بيانات المكتب بالحذف الناعم (لا حذف فعلي)
for (const col of ["clients","cases","tasks","payments","expenses","contracts","invoices","appointments"]) {
  await softDeleteWhere(col, "lawyerId", uid, { deletedAt: now, deletedBy: req.user.uid });
}

// 4) تدقيق
await writeAudit(req, { action:"DELETE", entity:"tenant", entityId:uid,
                        after:{ cascadeUsers: members.size, restorableUntil: addDays(now,30) } });
```
`POST /api/admin/tenants/:uid/restore` يعكس كل الخطوات خلال 30 يوماً.

### 3) إنشاء مستخدم مكتب (LAWYER)

```ts
// POST /api/office/users
const ALLOWED_BY_OFFICE = ["PARTNER","OFFICE_LAWYER","CONSULTANT",
                           "SECRETARY","ACCOUNTANT","TRAINEE","CLIENT"];

router.post("/users", requireAuth, permit("users.manage"), async (req,res) => {
  const { name, email, phone, role, password, sendInvite } = parse(OfficeUserSchema, req.body);

  if (!ALLOWED_BY_OFFICE.includes(role))
    return res.status(403).json({ error: "لا يمكنك إنشاء حساب بهذا الدور" });

  const lawyerId = req.user.lawyerId;                 // ← من التوكن حصراً (R2)
  await assertSeatAvailable(lawyerId, role);          // ← يرمي 409 عند التجاوز

  const user = await admin.auth().createUser({
    email, displayName: name,
    password: password ?? generateStrongPassword(), disabled: false,
  });
  await admin.auth().setCustomUserClaims(user.uid, {
    role, lawyerId, plan: req.user.plan, status: "ACTIVE",
  });
  await db.collection("users").doc(user.uid).set({
    name, email, phone, role, lawyerId, status: "ACTIVE",
    createdAt: new Date().toISOString(), createdBy: req.user.uid, deletedAt: null,
  });

  await writeAudit(req, { action:"CREATE", entity:"user", entityId:user.uid, after:{ role } });
  if (sendInvite) await sendInviteEmail(email, user.uid);
  res.json({ id: user.uid });
});
```

### 4) حدود المقاعد

```ts
// src/server/lib/seats.ts
export const PLAN_SEAT_LIMITS = {
  BASIC:   { OFFICE_LAWYER:2,  TRAINEE:2,  SECRETARY:1,  ACCOUNTANT:0, PARTNER:0, CONSULTANT:0, CLIENT:0  },
  PRO:     { OFFICE_LAWYER:10, TRAINEE:10, SECRETARY:3,  ACCOUNTANT:1, PARTNER:3, CONSULTANT:3, CLIENT:25 },
  PREMIUM: { OFFICE_LAWYER:Infinity, TRAINEE:Infinity, SECRETARY:Infinity,
             ACCOUNTANT:Infinity, PARTNER:Infinity, CONSULTANT:Infinity, CLIENT:Infinity },
} as const;

export async function assertSeatAvailable(lawyerId: string, role: string) {
  const owner = await db.collection("users").doc(lawyerId).get();
  const limit = PLAN_SEAT_LIMITS[owner.data()?.plan ?? "BASIC"][role] ?? 0;
  if (limit === Infinity) return;
  const used = await db.collection("users")
    .where("lawyerId","==",lawyerId).where("role","==",role)
    .where("deletedAt","==",null).count().get();
  if (used.data().count >= limit)
    throw httpError(409, `وصلت للحد الأقصى (${limit}) لهذا الدور في باقتك. رقّ باقتك لإضافة المزيد.`);
}
```

### 5) نقل ملفات مستخدم مغادر

```ts
// POST /api/office/users/:uid/transfer   { toUserId }
// ينقل: cases.assignedLawyerId · cases.teamIds · tasks.assignedTo
//        · hearings.responsibleId · documents.uploadedBy (مرجع فقط)
// يعمل على دفعات batched writes، idempotent، ويكتب سجل تدقيق واحد يلخّص الأعداد
```

### 6) دخول الدعم الفني (Impersonation)

```ts
// POST /api/admin/tenants/:uid/impersonate  → SUPER_ADMIN فقط
const token = await admin.auth().createCustomToken(uid, {
  impersonatedBy: req.user.uid, impersonationExpiry: Date.now() + 30*60*1000,
});
await writeAudit(req, { action:"CROSS_TENANT_ACCESS", entity:"tenant", entityId:uid });
```
الواجهة تعرض `<ImpersonationBanner />` ثابتاً في أعلى الشاشة مع زر "إنهاء الجلسة".

---

## المخاطر

| الخطر | التخفيف |
|---|---|
| حذف مكتب بالخطأ يعطّل عشرات المستخدمين | تأكيد مزدوج بكتابة اسم المكتب + استرجاع كامل خلال 30 يوماً |
| حدود المقاعد تمنع مكاتب قائمة تجاوزتها فعلاً | فحص قبل التفعيل + إعفاء (grandfather) للحسابات الحالية |
| فشل جزئي في التتالي يترك حالة غير متسقة | تنفيذ على دفعات + سجل تقدّم + إعادة تشغيل idempotent |
| إساءة استخدام Impersonation | 30 دقيقة · شريط ظاهر · تدقيق إجباري · إشعار لمدير المكتب |
