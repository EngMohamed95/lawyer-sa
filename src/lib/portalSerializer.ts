/**
 * قائمة الحقول البيضاء لبوابة العميل — الوثيقة §2.7 و§خامساً.
 *
 * المبدأ الحاكم (المعيار AC-2): الاستجابة **تُبنى** من حقول مسموحة صراحة،
 * ولا تُشتق بحذف حقول من الكائن الكامل. الفرق جوهري: الحذف ينسى الحقل
 * الجديد الذي يُضاف غداً، والبناء يتجاهله تلقائياً.
 *
 * أي حقل غير مذكور هنا لا يصل للعميل أبداً — بما فيه الملاحظات الداخلية
 * والاستراتيجية وبيانات الخصم الحساسة وبيانات المستخدمين الداخليين.
 */

/** حقول يُمنع ظهورها مهما حدث — طبقة تحقّق ثانية فوق القائمة البيضاء */
export const FORBIDDEN_KEYS = [
  "internalNotes", "notes", "summary", "strategy", "aiSummary",
  "opponentLawyer", "opponentPhone", "opponentNationalId",
  "assignedLawyerId", "createdBy", "uploadedBy", "lawyerId",
  "cost", "margin", "profit", "commission",
  "allowedUserIds", "allowedRoles", "checksum", "storagePath",
  "password", "apiKey", "token", "secret",
] as const;

type Row = Record<string, unknown>;

const pick = (src: Row, keys: string[]): Row => {
  const out: Row = {};
  for (const k of keys) {
    if (src[k] !== undefined) out[k] = src[k];
  }
  return out;
};

/* ────────────────────────── القوائم البيضاء ────────────────────────── */

const CASE_FIELDS = [
  "id", "caseNumber", "title", "type", "status",
  "courtName", "courtCircle", "startDate", "clientRole",
];

const HEARING_FIELDS = [
  "id", "caseId", "hearingDate", "court", "circuit", "nextHearingDate",
];

const DOCUMENT_FIELDS = [
  "id", "name", "type", "fileUrl", "fileType", "uploadDate", "version",
];

const CONTRACT_FIELDS = [
  "id", "contractNumber", "title", "type", "status",
  "startDate", "endDate", "totalValue", "currency", "content",
];

const INVOICE_FIELDS = [
  "id", "invoiceNumber", "issueDate", "dueDate", "items",
  "subtotal", "vatRate", "vatAmount", "total",
  "paidAmount", "remainingAmount", "currency", "status",
];

const APPOINTMENT_FIELDS = [
  "id", "title", "type", "startAt", "endAt", "allDay",
  "location", "isOnline", "meetingUrl", "status",
];

const INVOICE_ITEM_FIELDS = ["description", "quantity", "unitPrice", "amount"];

/* ────────────────────────── المُسلسِلات ────────────────────────── */

/** القضية: البيانات العامة وحالتها فقط — بلا ملاحظات داخلية ولا استراتيجية */
export function serializeCase(c: Row): Row {
  return pick(c, CASE_FIELDS);
}

/** الجلسة: الموعد والمحكمة فقط — بلا محضر ولا نتيجة داخلية */
export function serializeHearing(h: Row): Row {
  return pick(h, HEARING_FIELDS);
}

/**
 * المستند: لا يُسلسَل أصلاً ما لم يكن مشارَكاً صراحة.
 * الإرجاع null يعني «لا يُعرض» ويجب على المُستدعي استبعاده.
 */
export function serializeDocument(d: Row): Row | null {
  if (d.sharedWithClient !== true) return null;
  if (d.deletedAt) return null;
  if (d.status === "ARCHIVED") return null;
  return pick(d, DOCUMENT_FIELDS);
}

/** العقد: لا يُعرض قبل اعتماده — نفس ضابط الوثيقة §خامساً */
const CLIENT_VISIBLE_CONTRACT_STATUS = ["APPROVED", "SENT", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED"];

export function serializeContract(c: Row): Row | null {
  if (c.deletedAt) return null;
  if (!CLIENT_VISIBLE_CONTRACT_STATUS.includes(String(c.status))) return null;
  if (c.sharedWithClient !== true) return null;
  return pick(c, CONTRACT_FIELDS);
}

/** الفاتورة: لا تُعرض إلا بعد الاعتماد والمشاركة */
const CLIENT_VISIBLE_INVOICE_STATUS = ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"];

export function serializeInvoice(i: Row): Row | null {
  if (i.deletedAt) return null;
  if (!CLIENT_VISIBLE_INVOICE_STATUS.includes(String(i.status))) return null;
  if (i.sharedWithClient !== true) return null;
  const out = pick(i, INVOICE_FIELDS);
  // البنود تُنظَّف بدورها — لا تمرّ كما هي
  if (Array.isArray(i.items)) {
    out.items = (i.items as Row[]).map((it) => pick(it, INVOICE_ITEM_FIELDS));
  }
  return out;
}

export function serializeAppointment(a: Row): Row | null {
  if (a.deletedAt) return null;
  if (a.status === "CANCELLED") return null;
  return pick(a, APPOINTMENT_FIELDS);
}

/* ────────────────────────── التحقّق ────────────────────────── */

export interface LeakReport {
  clean: boolean;
  leaked: string[];
}

/**
 * يفحص كائناً (أو مصفوفة) بحثاً عن أي حقل ممنوع — بما في ذلك المتداخل.
 * يُستخدم في الاختبار الآلي على شكل الاستجابة (المعيار AC-2).
 */
export function auditForLeaks(value: unknown, pathPrefix = ""): LeakReport {
  const leaked: string[] = [];
  const walk = (v: unknown, p: string, depth: number) => {
    if (depth > 8 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${p}[${i}]`, depth + 1));
      return;
    }
    for (const [k, val] of Object.entries(v as Row)) {
      const here = p ? `${p}.${k}` : k;
      if ((FORBIDDEN_KEYS as readonly string[]).includes(k)) leaked.push(here);
      walk(val, here, depth + 1);
    }
  };
  walk(value, pathPrefix, 0);
  return { clean: leaked.length === 0, leaked };
}

/**
 * الحارس الأخير قبل إرسال أي حزمة للعميل.
 * يرمي عند التسريب — الفشل الصاخب أأمن من تسريب صامت.
 */
export function assertNoLeaks(payload: unknown, label = "portal payload"): void {
  const report = auditForLeaks(payload);
  if (!report.clean) {
    throw new Error(`تسريب حقول محجوبة في ${label}: ${report.leaked.join(", ")}`);
  }
}

/* ────────────────────────── حدود الوصول ────────────────────────── */

export interface PortalIdentity {
  /** يأتي من التوكن حصراً — لا من المسار ولا من جسم الطلب (المعيار AC-7) */
  clientId: string;
  lawyerId: string;
  allowedCaseIds?: string[];
}

/** هل هذا السجل يخص هذا العميل وهذا المكتب؟ */
export function belongsToClient(row: Row, id: PortalIdentity): boolean {
  if (String(row.lawyerId ?? "") !== id.lawyerId) return false;
  const rowClient = String(row.clientId ?? "");
  return rowClient !== "" && rowClient === id.clientId;
}

/** ترشيح قضايا العميل مع احترام قائمة القضايا المسموحة إن وُجدت */
export function visibleCases(cases: Row[], id: PortalIdentity): Row[] {
  const allow = id.allowedCaseIds ?? [];
  return cases.filter((c) => {
    if (c.deletedAt) return false;
    if (!belongsToClient(c, id)) return false;
    // قائمة فارغة تعني كل قضايا العميل
    return allow.length === 0 || allow.includes(String(c.id));
  });
}
