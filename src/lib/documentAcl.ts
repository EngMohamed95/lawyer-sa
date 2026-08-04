/**
 * خزنة المستندات — التصنيف والصلاحيات والإصدارات والأرشفة (الوثيقة §1.7 و§5).
 *
 * ⚠️ حدّ معروف: الفحص هنا يجري في المتصفح لأن قواعد Firestore وStorage
 *    ما زالت ضمن الميزة 001. هذا يمنع الوصول العَرَضي ويوثّقه، لكنه لا
 *    يمنع مستخدماً خبيثاً من قراءة المستند مباشرة من قاعدة البيانات.
 *    عند اكتمال 001 تنتقل هذه القواعد للخادم وتصير غير قابلة للتخطّي.
 *
 * توافق للخلف: المستندات القائمة لا تحمل الحقول الجديدة، وتُعامَل
 * بقيم افتراضية آمنة (داخلي · نشط · إصدار ١) بلا أي ترحيل للبيانات.
 */

import { addDoc, collection } from "firebase/firestore";
import { db } from "./firebase";
import { ROLES, type Role } from "./roles";
import { scopeOf } from "./permissions";

/* ────────────────────────── التصنيف ────────────────────────── */

export type Confidentiality = "PUBLIC_INTERNAL" | "RESTRICTED" | "CONFIDENTIAL" | "SECRET";

export const CONFIDENTIALITY_LABELS_AR: Record<Confidentiality, string> = {
  PUBLIC_INTERNAL: "داخلي — كل المكتب",
  RESTRICTED: "مقيَّد — فريق القضية",
  CONFIDENTIAL: "سري — المحامي المسؤول والإدارة",
  SECRET: "سري للغاية — مدير المكتب فقط",
};

export const CONFIDENTIALITY_SHORT_AR: Record<Confidentiality, string> = {
  PUBLIC_INTERNAL: "داخلي",
  RESTRICTED: "مقيَّد",
  CONFIDENTIAL: "سري",
  SECRET: "سري للغاية",
};

export const CONFIDENTIALITY_COLORS: Record<Confidentiality, string> = {
  PUBLIC_INTERNAL: "bg-gray-100 text-gray-700 border-gray-200",
  RESTRICTED: "bg-amber-50 text-amber-800 border-amber-200",
  CONFIDENTIAL: "bg-orange-100 text-orange-800 border-orange-200",
  SECRET: "bg-red-100 text-red-900 border-red-300",
};

/** ترتيب الحساسية — يُستخدم في المقارنات */
const LEVEL: Record<Confidentiality, number> = {
  PUBLIC_INTERNAL: 0, RESTRICTED: 1, CONFIDENTIAL: 2, SECRET: 3,
};

/** أعلى تصنيف يستطيع الدور رؤيته افتراضياً — جدول الوثيقة §1.7 */
const MAX_LEVEL_BY_ROLE: Record<Role, number> = {
  [ROLES.LAWYER]: 3,        // مدير المكتب — كل شيء
  [ROLES.PARTNER]: 2,       // الشريك — حتى السري
  [ROLES.OFFICE_LAWYER]: 2, // المحامي المسؤول — حتى السري لقضاياه
  [ROLES.CONSULTANT]: 1,    // المستشار — حتى المقيَّد
  [ROLES.SECRETARY]: 0,     // السكرتارية — رفع فقط + الداخلي
  [ROLES.TRAINEE]: 0,       // المتدرب — رفع فقط + الداخلي
  [ROLES.ACCOUNTANT]: -1,   // المحاسب — لا وصول للمستندات القانونية إطلاقاً
  [ROLES.CLIENT]: -1,       // العميل — المشارَك معه حصراً، لا شيء غيره
  [ROLES.SUPER_ADMIN]: -1,  // لا يطّلع على محتوى المكاتب
};

/* ────────────────────────── نموذج المستند ────────────────────────── */

export type DocumentStatus = "ACTIVE" | "ARCHIVED";

export interface VaultDocument {
  id: string;
  name?: string;
  fileUrl?: string | null;
  fileType?: string | null;
  type?: string;
  content?: string | null;
  notes?: string | null;
  lawyerId?: string;
  uploadDate?: string;
  /** الحقول الجديدة — كلها اختيارية للتوافق مع المستندات القائمة */
  version?: number;
  isLatest?: boolean;
  parentDocumentId?: string | null;
  fileSize?: number;
  checksum?: string | null;
  confidentiality?: Confidentiality;
  allowedRoles?: Role[];
  allowedUserIds?: string[];
  sharedWithClient?: boolean;
  sharedAt?: string | null;
  sharedBy?: string | null;
  status?: DocumentStatus;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;
  extractedText?: string | null;
  tags?: string[];
  uploadedBy?: string | null;
  assignedLawyerId?: string | null;
  deletedAt?: string | null;
}

/** القيم الافتراضية الآمنة للمستندات التي رُفعت قبل هذه الميزة */
export function confidentialityOf(d: VaultDocument): Confidentiality {
  const c = d.confidentiality;
  return c && c in LEVEL ? c : "PUBLIC_INTERNAL";
}

export function statusOf(d: VaultDocument): DocumentStatus {
  return d.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
}

export function versionOf(d: VaultDocument): number {
  const v = Number(d.version);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

export function isArchived(d: VaultDocument): boolean {
  return statusOf(d) === "ARCHIVED";
}

/* ────────────────────────── فحص الوصول (R3) ────────────────────────── */

export interface AccessContext {
  role: Role | null;
  userId: string | null;
  /** المحامي المسؤول عن القضية التي ينتمي إليها المستند */
  caseAssignedLawyerId?: string | null;
}

export interface AccessResult {
  allowed: boolean;
  reason: string;
}

/**
 * ترتيب الفحص كما تنص الوثيقة:
 *   المحذوف ← الصلاحية العامة ← العميل ← الاستثناء الصريح ← التصنيف مقابل الدور
 */
export function canReadDocument(d: VaultDocument, ctx: AccessContext): AccessResult {
  if (d.deletedAt) return { allowed: false, reason: "المستند محذوف" };
  const role = ctx.role;
  if (!role) return { allowed: false, reason: "جلسة غير معروفة" };

  // العميل: المشارَك معه حصراً — لا استثناءات ولا تصنيفات
  if (role === ROLES.CLIENT) {
    return d.sharedWithClient === true
      ? { allowed: true, reason: "مشارَك مع العميل" }
      : { allowed: false, reason: "غير مشارَك مع العميل" };
  }

  // المحاسب محجوب عن المستندات القانونية (فصل المالي عن القانوني §خامساً)
  if (role === ROLES.ACCOUNTANT) {
    return { allowed: false, reason: "المحاسب لا يصل للمستندات القانونية" };
  }

  if (scopeOf(role, "document.manage") === "NONE") {
    return { allowed: false, reason: "لا تملك صلاحية المستندات" };
  }

  const level = LEVEL[confidentialityOf(d)];

  // استثناء صريح على مستوى المستند — يعلو على جدول الأدوار
  if (ctx.userId && (d.allowedUserIds ?? []).includes(ctx.userId)) {
    return { allowed: true, reason: "مصرَّح له صراحة" };
  }
  if ((d.allowedRoles ?? []).includes(role)) {
    return { allowed: true, reason: "دوره ضمن المصرَّح لهم" };
  }

  // المحامي المسؤول عن القضية يرى مستنداتها حتى المصنّفة سرية
  if (
    level <= LEVEL.CONFIDENTIAL &&
    ctx.userId &&
    ctx.caseAssignedLawyerId &&
    ctx.userId === ctx.caseAssignedLawyerId
  ) {
    return { allowed: true, reason: "المحامي المسؤول عن القضية" };
  }

  const max = MAX_LEVEL_BY_ROLE[role] ?? -1;
  if (max < 0) return { allowed: false, reason: "دوره لا يصل للمستندات" };
  if (level > max) {
    return {
      allowed: false,
      reason: `التصنيف «${CONFIDENTIALITY_SHORT_AR[confidentialityOf(d)]}» أعلى من صلاحية دورك`,
    };
  }
  return { allowed: true, reason: "ضمن تصنيف دوره" };
}

/** الرفع مسموح لأدوار أوسع من القراءة — السكرتارية والمتدرب يرفعان */
export function canUploadDocument(role: Role | null): boolean {
  if (!role) return false;
  if (role === ROLES.ACCOUNTANT || role === ROLES.CLIENT || role === ROLES.SUPER_ADMIN) return false;
  return scopeOf(role, "document.manage") !== "NONE";
}

/** تغيير التصنيف والمشاركة والأرشفة — للإدارة فقط */
export function canManageDocument(role: Role | null): boolean {
  if (!role) return false;
  return ["FULL", "YES"].includes(scopeOf(role, "document.manage"));
}

/** أعلى تصنيف يستطيع هذا الدور إسناده عند الرفع */
export function assignableConfidentialities(role: Role | null): Confidentiality[] {
  const all: Confidentiality[] = ["PUBLIC_INTERNAL", "RESTRICTED", "CONFIDENTIAL", "SECRET"];
  if (!role) return [];
  const max = MAX_LEVEL_BY_ROLE[role] ?? -1;
  if (max < 0) return [];
  return all.filter((c) => LEVEL[c] <= max);
}

/** يرشّح قائمة المستندات على ما يحقّ للمستخدم رؤيته */
export function filterReadable<T extends VaultDocument>(docs: T[], ctx: AccessContext): T[] {
  return docs.filter((d) => canReadDocument(d, ctx).allowed);
}

/* ────────────────────────── سجل الوصول (R5) ────────────────────────── */

export type AccessAction = "VIEW" | "DOWNLOAD" | "PRINT" | "SHARE";

/** التصنيفات التي يُسجَّل كل وصول إليها */
const LOGGED_FROM: number = LEVEL.CONFIDENTIAL;

/**
 * يسجّل الوصول للمستندات السرية فما فوق. لا يرمي أبداً —
 * فشل التسجيل لا يُفشل عملية المستخدم.
 */
export async function logDocumentAccess(
  d: VaultDocument,
  action: AccessAction,
  ctx: AccessContext,
): Promise<void> {
  try {
    if (LEVEL[confidentialityOf(d)] < LOGGED_FROM) return;
    const lawyerId = d.lawyerId ?? localStorage.getItem("lawyerId");
    if (!lawyerId) return;
    await addDoc(collection(db, "documents_access_log"), {
      lawyerId,
      documentId: d.id,
      documentName: d.name ?? null,
      confidentiality: confidentialityOf(d),
      userId: ctx.userId,
      userName: localStorage.getItem("userName") ?? null,
      userRole: ctx.role,
      action,
      at: new Date().toISOString(),
      userAgent: navigator.userAgent.slice(0, 200),
    });
  } catch (err) {
    console.warn("تعذّر تسجيل الوصول للمستند:", err);
  }
}

/* ────────────────────────── الإصدارات (R1) ────────────────────────── */

/**
 * يرتّب إصدارات مستند من الأحدث للأقدم.
 * الإصدارات مستندات مستقلة يربطها parentDocumentId بالأصل.
 */
export function versionChain<T extends VaultDocument>(all: T[], root: T): T[] {
  const rootId = root.parentDocumentId ?? root.id;
  return all
    .filter((d) => d.id === rootId || d.parentDocumentId === rootId)
    .sort((a, b) => versionOf(b) - versionOf(a));
}

/** الإصدار الأحدث في السلسلة */
export function latestVersion<T extends VaultDocument>(chain: T[]): T | undefined {
  return chain.find((d) => d.isLatest) ?? chain[0];
}

/** يستبعد الإصدارات القديمة من القوائم — يُبقي الأحدث فقط */
export function onlyLatest<T extends VaultDocument>(docs: T[]): T[] {
  const superseded = new Set(
    docs.filter((d) => d.parentDocumentId && d.isLatest !== false).map((d) => d.parentDocumentId!),
  );
  return docs.filter((d) => {
    if (d.isLatest === false) return false;
    if (superseded.has(d.id)) return false;
    return true;
  });
}

/* ────────────────────────── البصمة (T005) ────────────────────────── */

/** SHA-256 للملف — يكشف تغيّر المحتوى بين الإصدارات */
export async function fileChecksum(file: File): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const buf = await file.arrayBuffer();
    const hash = await subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (err) {
    console.warn("تعذّر حساب بصمة الملف:", err);
    return null;
  }
}

export function formatBytes(n: number | undefined): string {
  const size = Number(n) || 0;
  if (size <= 0) return "—";
  const units = ["بايت", "كيلوبايت", "ميجابايت", "جيجابايت"];
  let i = 0, v = size;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* ────────────────────────── البحث (R6) ────────────────────────── */

/** بحث في الاسم والوسوم والملاحظات والمحتوى المستخرج */
export function matchesSearch(d: VaultDocument, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    d.name, d.notes, d.extractedText, d.content,
    ...(d.tags ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}
