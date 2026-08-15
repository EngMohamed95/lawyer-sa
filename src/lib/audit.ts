/**
 * سجل التدقيق — من فعل ماذا ومتى.
 *
 * الوثيقة §خامساً: «تسجيل جميع العمليات في سجل تدقيق يوضح المستخدم والتاريخ والإجراء».
 *
 * ⚠️ حدّ معروف في هذه المرحلة: الكتابة تتم من المتصفح لأن مسارات الخادم
 *    ما زالت بلا مصادقة (تُعالَج في الميزتين 001 و003). هذا يكفي لمساءلة
 *    العمليات العادية، لكنه لا يمنع مستخدماً خبيثاً من تخطّي التسجيل.
 *    عند اكتمال 001 تنتقل الكتابة للخادم ويصبح السجل غير قابل للتخطّي.
 *
 * قاعدة ثابتة: فشل التدقيق لا يُفشل عملية المستخدم أبداً.
 */

import { addDoc, collection } from "firebase/firestore";
import { db } from "./firebase";
import { normalizeRole } from "./roles";

export type AuditAction =
  | "CREATE" | "UPDATE" | "DELETE" | "RESTORE"
  | "APPROVE" | "REJECT"
  | "LOGIN" | "LOGIN_FAILED" | "LOGOUT"
  | "EXPORT" | "VIEW_SENSITIVE"
  | "PERMISSION_CHANGE" | "CREDENTIALS_CHANGE"
  | "CROSS_TENANT_ACCESS";

export type AuditEntity =
  | "case" | "client" | "hearing" | "document" | "task"
  | "payment" | "expense" | "user" | "settings" | "permissions"
  | "report" | "session" | "tenant"
  | "contract" | "invoice" | "appointment" | "memo";

export interface AuditEntry {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  /** وصف مقروء للسجل — مثل اسم القضية أو العميل */
  entityLabel?: string | null;
  /** الحقول قبل التغيير — المتغيّرة فقط */
  before?: Record<string, unknown> | null;
  /** الحقول بعد التغيير — المتغيّرة فقط */
  after?: Record<string, unknown> | null;
}

export const AUDIT_ACTION_LABELS_AR: Record<AuditAction, string> = {
  CREATE: "إنشاء",
  UPDATE: "تعديل",
  DELETE: "حذف",
  RESTORE: "استرجاع",
  APPROVE: "اعتماد",
  REJECT: "رفض",
  LOGIN: "تسجيل دخول",
  LOGIN_FAILED: "محاولة دخول فاشلة",
  LOGOUT: "تسجيل خروج",
  EXPORT: "تصدير",
  VIEW_SENSITIVE: "اطلاع على بيانات حساسة",
  PERMISSION_CHANGE: "تغيير صلاحيات",
  CREDENTIALS_CHANGE: "تغيير بيانات دخول",
  CROSS_TENANT_ACCESS: "وصول عبر المكاتب",
};

export const AUDIT_ENTITY_LABELS_AR: Record<AuditEntity, string> = {
  case: "قضية",
  client: "عميل",
  hearing: "جلسة",
  document: "مستند",
  task: "مهمة",
  payment: "دفعة",
  expense: "مصروف",
  user: "مستخدم",
  settings: "إعدادات",
  permissions: "صلاحيات",
  report: "تقرير",
  session: "جلسة دخول",
  tenant: "مكتب",
  contract: "عقد",
  invoice: "فاتورة",
  appointment: "موعد",
  memo: "مذكرة",
};

/** ألوان الشارات حسب خطورة الإجراء */
export const AUDIT_ACTION_COLORS: Record<AuditAction, string> = {
  CREATE: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
  RESTORE: "bg-emerald-100 text-emerald-800",
  APPROVE: "bg-teal-100 text-teal-800",
  REJECT: "bg-orange-100 text-orange-800",
  LOGIN: "bg-gray-100 text-gray-700",
  LOGIN_FAILED: "bg-rose-100 text-rose-800",
  LOGOUT: "bg-gray-100 text-gray-500",
  EXPORT: "bg-amber-100 text-amber-800",
  VIEW_SENSITIVE: "bg-yellow-100 text-yellow-800",
  PERMISSION_CHANGE: "bg-purple-100 text-purple-800",
  CREDENTIALS_CHANGE: "bg-fuchsia-100 text-fuchsia-800",
  CROSS_TENANT_ACCESS: "bg-red-200 text-red-900",
};

/** حقول لا تُكتب في السجل أبداً حتى لو مُرّرت بالخطأ */
const SENSITIVE_KEYS = [
  "password", "newPassword", "currentPassword", "confirm",
  "apiKey", "aiApiKey", "najizApiKey", "token", "secret",
  "privateKey", "serviceAccount",
];

function maskSensitive(
  obj: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase()))
      ? "***"
      : v;
  }
  return out;
}

/** يبقي الحقول المتغيّرة فقط — يمنع تضخّم السجل */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}

/**
 * يكتب سطراً في سجل التدقيق. لا يرمي أبداً.
 * @param overrides لتمرير هوية الفاعل صراحة (مثلاً عند تسجيل الدخول قبل تعبئة localStorage)
 */
export async function writeAudit(
  entry: AuditEntry,
  overrides?: { lawyerId?: string | null; actorId?: string | null; actorName?: string | null; actorRole?: string | null },
): Promise<void> {
  try {
    const lawyerId = overrides?.lawyerId ?? localStorage.getItem("lawyerId");
    if (!lawyerId) return; // بلا مكتب لا يوجد سجل ننتمي إليه

    await addDoc(collection(db, "auditLogs"), {
      lawyerId,
      actorId: overrides?.actorId ?? localStorage.getItem("userId") ?? null,
      actorName: overrides?.actorName ?? localStorage.getItem("userName") ?? null,
      actorRole: normalizeRole(overrides?.actorRole ?? localStorage.getItem("userRole")),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      entityLabel: entry.entityLabel ?? null,
      before: maskSensitive(entry.before),
      after: maskSensitive(entry.after),
      userAgent: navigator.userAgent.slice(0, 200),
      at: new Date().toISOString(),
    });
  } catch (err) {
    // التدقيق مساعد وليس حرجاً — لا نُفشل عملية المستخدم بسببه
    console.warn("تعذّر كتابة سجل التدقيق:", err);
  }
}
