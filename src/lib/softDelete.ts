/**
 * الحذف الناعم — الوثيقة §خامساً:
 * «منع الحذف النهائي واستبداله بالأرشفة أو سلة المحذوفات».
 *
 * بدل حذف المستند فعلياً نضع عليه علامة، فيختفي من القوائم ويبقى
 * قابلاً للاسترجاع. كل عملية تُسجَّل في سجل التدقيق.
 *
 * التوافق الرجعي: المستندات القديمة لا تحمل الحقل `deletedAt` إطلاقاً،
 * ولذلك نعتبر «غير محذوف» = (الحقل غائب) أو (الحقل = null). راجع isDeleted.
 */

import { deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { writeAudit, type AuditEntity } from "./audit";

export interface SoftDeleteTarget {
  /** مسار المستند: ["tasks", id] أو ["cases", caseId, "hearings", id] */
  path: string[];
  entity: AuditEntity;
  /** اسم مقروء يظهر في السجل وسلة المحذوفات */
  label?: string | null;
}

/** هل هذا السجل محذوف؟ يتعامل مع المستندات القديمة التي لا تحمل الحقل */
export function isDeleted(record: { deletedAt?: unknown } | null | undefined): boolean {
  return !!record?.deletedAt;
}

/**
 * يُرشّح المحذوفات من أي مصفوفة سجلات.
 * النوع عام بلا قيود لأن مخرجات Firestore تُستنتج كأشكال مختلفة حسب الاستعلام.
 */
export function excludeDeleted<T>(rows: T[]): T[] {
  return rows.filter((r) => !isDeleted(r as { deletedAt?: unknown }));
}

function docRef(path: string[]) {
  const [first, ...rest] = path;
  return doc(db, first, ...rest);
}

/**
 * حذف ناعم: يضع العلامة ويكتب سجل تدقيق.
 * @returns true عند النجاح
 */
export async function softDelete(target: SoftDeleteTarget, reason?: string): Promise<boolean> {
  const ref = docRef(target.path);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  const data = snap.data();

  await updateDoc(ref, {
    deletedAt: new Date().toISOString(),
    deletedBy: localStorage.getItem("userId") ?? null,
    deletedByName: localStorage.getItem("userName") ?? null,
    deleteReason: reason ?? null,
    // نحفظ المسار كاملاً ليتمكّن الاسترجاع من إيجاد المستند مهما كان عمقه
    deletedPath: target.path,
  });

  await writeAudit({
    action: "DELETE",
    entity: target.entity,
    entityId: target.path[target.path.length - 1],
    entityLabel: target.label ?? (data.title as string) ?? (data.name as string) ?? null,
    before: { deletedAt: null },
    after: { deletedAt: "محذوف", السبب: reason ?? "—" },
  });

  return true;
}

/** استرجاع سجل محذوف */
export async function restoreDeleted(target: SoftDeleteTarget): Promise<boolean> {
  const ref = docRef(target.path);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  await updateDoc(ref, {
    deletedAt: null,
    deletedBy: null,
    deletedByName: null,
    deleteReason: null,
    deletedPath: null,
  });

  await writeAudit({
    action: "RESTORE",
    entity: target.entity,
    entityId: target.path[target.path.length - 1],
    entityLabel: target.label ?? null,
  });

  return true;
}

/**
 * الحذف النهائي — لا رجعة فيه.
 * مقصور على مدير المكتب، ويُستخدم من سلة المحذوفات فقط بعد تأكيد صريح.
 */
export async function purgePermanently(target: SoftDeleteTarget): Promise<boolean> {
  const ref = docRef(target.path);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  await writeAudit({
    action: "DELETE",
    entity: target.entity,
    entityId: target.path[target.path.length - 1],
    entityLabel: `${target.label ?? ""} (حذف نهائي)`,
    before: snap.data() as Record<string, unknown>,
  });

  await deleteDoc(ref);
  return true;
}

/**
 * الكولكشنات التي تدعم الحذف الناعم وتظهر في سلة المحذوفات.
 *
 * ⚠️ قاعدة: أي كولكشن يُحذف منه بـ softDelete **يجب** أن يُدرج هنا،
 *    وإلا اختفى المحذوف من السلة فلا يستطيع أحد استرجاعه — وهو ما حدث
 *    فعلاً مع العقود والفواتير قبل إضافتهما.
 */
export const RECYCLABLE = [
  { collection: "tasks", entity: "task" as AuditEntity, label: "المهام", titleField: "title" },
  { collection: "clients", entity: "client" as AuditEntity, label: "العملاء", titleField: "fullName" },
  { collection: "cases", entity: "case" as AuditEntity, label: "القضايا", titleField: "title" },
  { collection: "payments", entity: "payment" as AuditEntity, label: "الدفعات", titleField: "notes" },
  { collection: "expenses", entity: "expense" as AuditEntity, label: "المصروفات", titleField: "notes" },
  { collection: "users", entity: "user" as AuditEntity, label: "المستخدمون", titleField: "name" },
  { collection: "contracts", entity: "contract" as AuditEntity, label: "العقود", titleField: "title" },
  { collection: "invoices", entity: "invoice" as AuditEntity, label: "الفواتير", titleField: "invoiceNumber" },
  { collection: "appointments", entity: "appointment" as AuditEntity, label: "المواعيد", titleField: "title" },
  { collection: "fee_agreements", entity: "invoice" as AuditEntity, label: "اتفاقيات الأتعاب", titleField: "agreementNumber" },
  { collection: "vouchers", entity: "expense" as AuditEntity, label: "سندات الصرف", titleField: "payeeName" },
  { collection: "time_entries", entity: "invoice" as AuditEntity, label: "سجلات الساعات", titleField: "description" },
] as const;
