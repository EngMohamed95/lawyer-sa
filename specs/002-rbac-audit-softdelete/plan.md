# 002 — خطة التنفيذ التقنية

## الملفات الجديدة

```
src/lib/
├── roles.ts               ROLES · ROLE_LABELS_AR · ROLE_HIERARCHY
├── permissions.ts         PERMISSION_MATRIX (مصدر الحقيقة) + can()
└── usePermissions.ts      Hook للواجهة

src/server/
├── lib/audit.ts           writeAudit() · withAudit() wrapper
├── middleware/permit.ts   permit(action, entity) — حارس مشتق من نفس المصفوفة
└── routes/
    ├── entities.ts        DELETE/RESTORE موحّد لكل الكيانات (حذف ناعم)
    └── audit.ts           GET /api/audit  (مرشّحات + Pagination)

src/pages/
├── RecycleBin.tsx         /app/recycle-bin
└── AuditLog.tsx           /app/audit-log

src/components/
├── PermissionGate.tsx     <PermissionGate action="delete" entity="case">…
└── RoleBadge.tsx

tests/
├── permissions.matrix.test.ts   ← 70 حالة من الوثيقة
├── audit.test.ts
└── softdelete.test.ts
```

## الملفات المعدَّلة (إضافة/تحصين فقط)

| الملف | التعديل |
|---|---|
| `src/App.tsx` | عناصر القائمة تستخدم `can()` بدل شروط `userRole !==` المكتوبة يدوياً. **لا يُحذف أي عنصر**، وتُضاف عناصر `/app/recycle-bin` و`/app/audit-log` (تظهر حسب الصلاحية) |
| `src/pages/Settings.tsx` | تبويب "الصلاحيات" يبقى مكانه ويُربط بحالة حقيقية + حفظ في `officeSettings/{lawyerId}` |
| المواضع الثمانية لـ `deleteDoc` | تُحوّل إلى `authFetch("/api/{entity}/:id", {method:"DELETE"})`. الأزرار تبقى |
| كل استعلامات القراءة | تُضاف `where("deletedAt","==",null)` |
| `firestore.rules` | إضافة دوال `can*()` لكل دور + منع تعديل `auditLogs` |
| `src/server/api.ts` | تركيب `permit()` على كل مسار + `withAudit()` على العمليات الحساسة |

---

## التصاميم

### 1) `src/lib/roles.ts`

```ts
export const ROLES = {
  SUPER_ADMIN:   "SUPER_ADMIN",
  LAWYER:        "LAWYER",          // مدير المكتب — القيمة القائمة تبقى
  PARTNER:       "PARTNER",
  OFFICE_LAWYER: "OFFICE_LAWYER",
  CONSULTANT:    "CONSULTANT",
  SECRETARY:     "SECRETARY",
  ACCOUNTANT:    "ACCOUNTANT",
  TRAINEE:       "TRAINEE",
  CLIENT:        "CLIENT",
} as const;
export type Role = typeof ROLES[keyof typeof ROLES];

export const ROLE_LABELS_AR: Record<Role, string> = {
  SUPER_ADMIN: "مدير المنصة",  LAWYER: "مدير المكتب",   PARTNER: "شريك",
  OFFICE_LAWYER: "محامي",      CONSULTANT: "مستشار قانوني",
  SECRETARY: "سكرتارية",       ACCOUNTANT: "محاسب",
  TRAINEE: "متدرب",            CLIENT: "عميل",
};
```

### 2) `src/lib/permissions.ts` — مصدر الحقيقة

```ts
export type Scope = "FULL" | "YES" | "ASSIGNED" | "LIMITED" | "DRAFT"
                  | "UPLOAD_ONLY" | "SHARED_ONLY" | "APPROVE" | "CREATE"
                  | "REVIEW" | "VIEW" | "PAY" | "OWN" | "FINANCIAL" | "NONE";

export const PERMISSION_MATRIX: Record<string, Record<Role, Scope>> = {
  "users.manage":     { LAWYER:"FULL", PARTNER:"NONE", OFFICE_LAWYER:"NONE", CONSULTANT:"NONE", SECRETARY:"NONE", ACCOUNTANT:"NONE", CLIENT:"NONE", TRAINEE:"NONE", SUPER_ADMIN:"FULL" },
  "case.create":      { LAWYER:"YES",  PARTNER:"YES",  OFFICE_LAWYER:"YES",  CONSULTANT:"NONE", SECRETARY:"DRAFT", ACCOUNTANT:"NONE", CLIENT:"NONE", TRAINEE:"DRAFT", SUPER_ADMIN:"NONE" },
  "case.update":      { LAWYER:"FULL", PARTNER:"FULL", OFFICE_LAWYER:"ASSIGNED", CONSULTANT:"ASSIGNED", SECRETARY:"LIMITED", ACCOUNTANT:"NONE", CLIENT:"NONE", TRAINEE:"ASSIGNED", SUPER_ADMIN:"NONE" },
  "case.delete":      { LAWYER:"YES",  PARTNER:"NONE", OFFICE_LAWYER:"NONE", CONSULTANT:"NONE", SECRETARY:"NONE", ACCOUNTANT:"NONE", CLIENT:"NONE", TRAINEE:"NONE", SUPER_ADMIN:"FULL" },
  "hearing.manage":   { LAWYER:"FULL", PARTNER:"FULL", OFFICE_LAWYER:"YES",  CONSULTANT:"YES",  SECRETARY:"YES",   ACCOUNTANT:"NONE", CLIENT:"VIEW", TRAINEE:"ASSIGNED", SUPER_ADMIN:"NONE" },
  "document.manage":  { LAWYER:"FULL", PARTNER:"FULL", OFFICE_LAWYER:"YES",  CONSULTANT:"YES",  SECRETARY:"UPLOAD_ONLY", ACCOUNTANT:"NONE", CLIENT:"SHARED_ONLY", TRAINEE:"UPLOAD_ONLY", SUPER_ADMIN:"NONE" },
  "contract.manage":  { LAWYER:"FULL", PARTNER:"APPROVE", OFFICE_LAWYER:"CREATE", CONSULTANT:"REVIEW", SECRETARY:"NONE", ACCOUNTANT:"NONE", CLIENT:"VIEW", TRAINEE:"NONE", SUPER_ADMIN:"NONE" },
  "invoice.manage":   { LAWYER:"FULL", PARTNER:"APPROVE", OFFICE_LAWYER:"VIEW", CONSULTANT:"NONE", SECRETARY:"NONE", ACCOUNTANT:"FULL", CLIENT:"PAY", TRAINEE:"NONE", SUPER_ADMIN:"NONE" },
  "report.view":      { LAWYER:"FULL", PARTNER:"FULL", OFFICE_LAWYER:"OWN", CONSULTANT:"OWN", SECRETARY:"LIMITED", ACCOUNTANT:"FINANCIAL", CLIENT:"OWN", TRAINEE:"OWN", SUPER_ADMIN:"FULL" },
  "settings.manage":  { LAWYER:"FULL", PARTNER:"NONE", OFFICE_LAWYER:"NONE", CONSULTANT:"NONE", SECRETARY:"NONE", ACCOUNTANT:"NONE", CLIENT:"NONE", TRAINEE:"NONE", SUPER_ADMIN:"FULL" },
};

export function can(role: Role, permission: string, ctx?: {
  assignedTo?: string; teamIds?: string[]; uid?: string; sharedWithClient?: boolean;
}): boolean { /* يفسّر Scope مع السياق */ }
```

> نفس الملف يُستورد في الخادم — **لا نُكرر المصفوفة في مكانين**.

### 3) سجل التدقيق

```ts
// src/server/lib/audit.ts
export async function writeAudit(req, e: {
  action: AuditAction; entity: string; entityId: string;
  entityLabel?: string; before?: object; after?: object;
}) {
  await db.collection("auditLogs").add({
    lawyerId: req.user.lawyerId ?? "PLATFORM",
    actorId: req.user.uid, actorRole: req.user.role, actorName: req.user.name ?? "",
    ...e,
    ip: req.ip, userAgent: req.get("user-agent") ?? "",
    at: new Date().toISOString(),
  });
}
```
- `before`/`after` يحفظان **الحقول المتغيرة فقط** لتقليل الحجم.
- الحقول الحساسة (كلمات المرور) تُقنَّع بـ `"***"` قبل الكتابة.
- سياسة الاحتفاظ: 24 شهراً ثم أرشفة إلى Storage.

### 4) الحذف الناعم — مسار موحّد

```ts
// DELETE /api/:entity/:id
router.delete("/:entity/:id",
  requireAuth, permit("delete"),
  async (req, res) => {
    const before = await getDoc(req.params.entity, req.params.id, req.user.lawyerId);
    await update(req.params.entity, req.params.id, {
      deletedAt: new Date().toISOString(),
      deletedBy: req.user.uid,
      deleteReason: req.body.reason ?? null,
    });
    await writeAudit(req, { action:"DELETE", entity:req.params.entity, entityId:req.params.id, before });
    res.json({ success:true, restorable:true });
  });

// POST /api/:entity/:id/restore  → LAWYER فقط
// POST /api/admin/purge          → SUPER_ADMIN فقط، بعد 30 يوماً
```

الكيانات المشمولة: `clients` `cases` `hearings` `documents` `tasks` `payments` `expenses` `users` `contracts` `invoices` `appointments`.

### 5) `PermissionGate` للواجهة

```tsx
<PermissionGate permission="case.delete" ctx={{ assignedTo: c.assignedLawyerId }}>
  <Button onClick={handleDelete}>حذف</Button>
</PermissionGate>
```
> يخفي الزر للراحة — والحماية الفعلية على الخادم (المبدأ 2).

---

## استراتيجية عدم الكسر

1. الأدوار الأربعة القائمة تُطابق مصفوفتها سلوكها الحالي بالضبط قبل أي تشديد.
2. تُضاف `deletedAt: null` لكل المستندات القائمة عبر سكربت backfill قبل تفعيل شرط الفلترة.
3. تبويب الصلاحيات يُنشر أولاً في وضع "عرض فقط" مع قيمه الفعلية، ثم يُفعَّل التعديل.
4. جولة اختبار الشاشات الـ15 بعد كل مجموعة مهام.
