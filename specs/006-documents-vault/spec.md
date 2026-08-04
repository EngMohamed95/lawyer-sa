# 006 — خزنة المستندات: الإصدارات والأرشفة والصلاحيات

**المرحلة:** 2 · **الأولوية:** 🟠 عالية · **يعتمد على:** 001, 002

يحقق: الوثيقة **§1.7 إدارة المستندات** (رفع وتصنيف · **إدارة الإصدارات** · **الأرشفة** · **التحكم في الصلاحيات**) · §5 (إتاحة مستندات محددة فقط للعميل)

---

## الوضع الحالي

✅ يبقى: `Documents.tsx` (140KB — رفع وتصنيف ومجلدات وقوالب) · `DocumentViewerModal` · `AddDocumentModal` · `ClientDocumentsModal` · `custom_templates` · `template_folders` · تحويل من `upload.php` إلى Storage الآمن (تم في 001).

🔴 ناقص: **الإصدارات** · **الأرشفة** · **صلاحيات على مستوى المستند** · التصنيف السري · العلامة المائية · مشاركة محددة مع العميل · البحث داخل المحتوى.

---

## نموذج البيانات (إضافات على المستند القائم)

```ts
// حقول جديدة تُضاف إلى مستندات cases/{id}/documents و clients/{id}/documents
{
  // … الحقول القائمة كما هي (name, fileUrl, type, uploadedBy, uploadDate, notes)

  storagePath: string,           // المسار الآمن الجديد tenants/{lawyerId}/…
  version: number,               // 1, 2, 3…
  isLatest: boolean,
  parentDocumentId?: string,     // يربط الإصدارات ببعضها
  fileSize: number, mimeType: string, checksum: string,   // SHA-256 لكشف التغيير

  confidentiality: "PUBLIC_INTERNAL" | "RESTRICTED" | "CONFIDENTIAL" | "SECRET",
  allowedRoles: Role[],          // تجاوز على مستوى المستند
  allowedUserIds: string[],
  sharedWithClient: boolean,     // ضابط الوثيقة §5
  sharedAt?, sharedBy?,

  status: "ACTIVE" | "ARCHIVED",
  archivedAt?, archivedBy?, archiveReason?,
  retentionUntil?: string,       // سياسة الاحتفاظ

  extractedText?: string,        // من OCR القائم — للبحث داخل المحتوى
  tags: string[],
  deletedAt, deletedBy
}

// documents_access_log/{id}   — من فتح أي مستند سري ومتى
{ lawyerId, documentId, userId, userRole, action: "VIEW"|"DOWNLOAD"|"PRINT"|"SHARE", at, ip }
```

---

## المتطلبات

### R1 — الإصدارات
- رفع ملف بنفس الاسم على نفس المستند ⇒ إصدار جديد، والقديم يبقى قابلاً للعرض والتنزيل والاستعادة.
- شريط "سجل الإصدارات" في `DocumentViewerModal` (المكوّن القائم يُوسَّع ولا يُستبدل).
- الإصدار السابق لا يُحذف أبداً.

### R2 — الأرشفة
- الأرشفة ≠ الحذف: المستند يخرج من القوائم النشطة ويبقى مفهرساً وقابلاً للبحث والاسترجاع.
- أرشفة تلقائية للمستندات المرتبطة بقضية مغلقة منذ أكثر من سنة (قابل للتعطيل).
- تبويب "الأرشيف" في `Documents.tsx` (إضافة تبويب — القائم يبقى).

### R3 — صلاحيات على مستوى المستند
ترتيب الفحص: `deletedAt` → المستأجر → `confidentiality` مقابل الدور → `allowedUserIds`/`allowedRoles` → صلاحية المصفوفة.

| التصنيف | من يراه افتراضياً |
|---|---|
| `PUBLIC_INTERNAL` | كل مستخدمي المكتب |
| `RESTRICTED` | فريق القضية + الشريك + مدير المكتب |
| `CONFIDENTIAL` | المحامي المسؤول + الشريك + مدير المكتب |
| `SECRET` | مدير المكتب فقط + من يُصرَّح له صراحة |

`SECRETARY` = رفع فقط (لا قراءة للمصنّف `CONFIDENTIAL` فما فوق).
`TRAINEE` = رفع فقط + قراءة `PUBLIC_INTERNAL`.
`ACCOUNTANT` = لا وصول للمستندات القانونية إطلاقاً.
`CLIENT` = `sharedWithClient == true` حصراً.

### R4 — المشاركة المحكومة مع العميل
- تفعيل `sharedWithClient` يتطلب صلاحية `document.manage: FULL/YES` وتُسجَّل في التدقيق.
- رابط المشاركة = Signed URL محدود المدة، قابل للإلغاء، مع خيار كلمة مرور.
- علامة مائية اختيارية على PDF المشارك (اسم العميل + التاريخ).

### R5 — الوصول مسجَّل
كل `VIEW`/`DOWNLOAD`/`PRINT`/`SHARE` لمستند `CONFIDENTIAL` أو `SECRET` يُكتب في `documents_access_log` و`auditLogs`.

### R6 — البحث داخل المحتوى
إعادة استخدام `POST /api/ai/extract-text` القائم لتعبئة `extractedText` عند الرفع، وإتاحة بحث نصي في الاسم والوسوم والمحتوى.

---

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | رفع نسخة جديدة ينشئ إصدارًا ويُبقي السابق قابلاً للاستعادة |
| AC-2 | الأرشفة تُخفي من النشط وتُبقي في الأرشيف والبحث |
| AC-3 | `SECRETARY` يرفع ولا يقرأ `CONFIDENTIAL` (403) |
| AC-4 | `ACCOUNTANT` لا يصل لأي مستند قانوني (403) |
| AC-5 | `CLIENT` لا يرى إلا `sharedWithClient == true` |
| AC-6 | رابط المشاركة ينتهي في موعده ويمكن إلغاؤه فوراً |
| AC-7 | كل فتح لمستند سري مسجَّل مع الهوية والوقت والـ IP |
| AC-8 | البحث يجد مستنداً بكلمة من داخل محتواه |
| AC-9 | `Documents.tsx` وكل مكوّناته القائمة تعمل كما كانت |
| AC-10 | `npm run lint` = 0 أخطاء |

---

## المهام

- [ ] **T001** إضافة الحقول الجديدة + سكربت backfill يضع قيماً افتراضية آمنة للمستندات القائمة
- [ ] **T002** `src/server/lib/documentAcl.ts` — منطق التصنيف والصلاحيات (R3)
- [ ] **T003** `src/server/routes/documents.ts` — رفع بإصدار · أرشفة · استعادة · مشاركة · إلغاء مشاركة
- [ ] **T004** منطق الإصدارات (`version` · `isLatest` · `parentDocumentId`) + استعادة إصدار سابق
- [ ] **T005** حساب `checksum` SHA-256 عند الرفع
- [ ] **T006** قواعد Firestore و Storage للتصنيف والمشاركة
- [ ] **T007** روابط مشاركة موقّعة قابلة للإلغاء + كلمة مرور اختيارية
- [ ] **T008** علامة مائية على PDF المشارك
- [ ] **T009** `documents_access_log` + الكتابة عند كل وصول لمستند سري
- [ ] **T010** ملء `extractedText` عبر مسار OCR القائم + فهرس بحث
- [ ] **T011** توسيع `DocumentViewerModal.tsx` بشريط الإصدارات (بلا تغيير سلوكه الحالي)
- [ ] **T012** إضافة تبويب "الأرشيف" في `Documents.tsx`
- [ ] **T013** إضافة حقول التصنيف والمشاركة في `AddDocumentModal.tsx`
- [ ] **T014** `src/components/DocumentPermissionsModal.tsx` و`ShareDocumentModal.tsx`
- [ ] **T015** مهمة أرشفة تلقائية للقضايا المغلقة منذ سنة
- [ ] **T016** الاختبارات: الإصدارات · الأرشفة · ACL لكل دور · انتهاء الروابط · سجل الوصول
- [ ] **T017** `npm run lint` = 0 أخطاء

**التقدير:** 7–9 أيام عمل
