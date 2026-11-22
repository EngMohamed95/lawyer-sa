/**
 * حدود رؤية القضايا داخل المكتب.
 *
 * المحامي (OFFICE_LAWYER) يرى القضايا المكلَّف بها فقط — معرّفه في assignedLawyerIds
 * أو في الحقل القديم assignedLawyerId. قواعد Firestore تفرض الشرط نفسه، لذلك يجب
 * أن يحمل كل استعلام قضايا يشغّله المحامي هذا الشرط — وإلا رفضت Firestore الاستعلام كاملاً.
 * استخدم visibleCasesQuery بدل بناء استعلام القضايا يدوياً.
 */

import {
  and, collection, collectionGroup, getDocs, or, query, where,
  type DocumentData, type Query, type QueryDocumentSnapshot, type QueryCompositeFilterConstraint, type QueryConstraint,
  type QueryFieldFilterConstraint, type QueryNonFilterConstraint,
} from "@/lib/store";
import { db } from "./firebase";

export interface Viewer {
  role: string;
  userId: string;
}

export function currentViewer(): Viewer {
  try {
    return {
      role: localStorage.getItem("userRole") || "",
      userId: localStorage.getItem("userId") || "",
    };
  } catch {
    return { role: "", userId: "" };
  }
}

/** الأدوار التي تُقصَر على القضايا المكلَّفة بها */
export const isAssignedOnly = (role: string) => role === "OFFICE_LAWYER";

/**
 * استعلام قضايا المكتب التي يحق للمستخدم الحالي رؤيتها، مع قيود إضافية اختيارية.
 * القضية قد يتولاها أكثر من محامٍ (assignedLawyerIds) — والقضايا القديمة تحمل
 * assignedLawyerId فقط، فيرى المحامي القضية إن كان في أيٍّ منهما.
 */
export function visibleCasesQuery(lawyerId: string, ...extra: QueryConstraint[]): Query<DocumentData> {
  const { role, userId } = currentViewer();
  const extraFilters = extra.filter((c) => c.type === "where") as QueryFieldFilterConstraint[];
  const extraOthers = extra.filter((c) => c.type !== "where") as QueryNonFilterConstraint[];
  const filters: (QueryFieldFilterConstraint | QueryCompositeFilterConstraint)[] = [where("lawyerId", "==", lawyerId), ...extraFilters];
  if (isAssignedOnly(role)) {
    filters.push(or(where("assignedLawyerId", "==", userId), where("assignedLawyerIds", "array-contains", userId)));
  }
  return query(collection(db, "cases"), and(...filters), ...extraOthers);
}

/** فحص قضية مقروءة مسبقاً — للبيانات التي لم تأتِ من visibleCasesQuery */
export function canSeeCase(c: { assignedLawyerId?: unknown; assignedLawyerIds?: unknown } | null | undefined, viewer: Viewer = currentViewer()): boolean {
  if (!c) return false;
  if (!isAssignedOnly(viewer.role)) return true;
  return c.assignedLawyerId === viewer.userId
    || (Array.isArray(c.assignedLawyerIds) && c.assignedLawyerIds.includes(viewer.userId));
}

/**
 * المستندات الفرعية (جلسات/طلبات/مستندات) تحت مجموعة سجلات رئيسية، باستعلام واحد للمكتب
 * بدل طلب لكل قضية (مكتب بـ 1000 قضية كان يرسل 1000 طلب لفتح لوحة التحكم).
 * السيرفر يحصر المحامي المكلّف في قضاياه (public/api/_lib/store.php). يرجع اللقطات
 * اللي أمها ضمن $parents فقط — بالمفتاح "cases/{id}" أو "clients/{id}".
 */
export async function childrenOf(
  sub: "hearings" | "requests" | "documents",
  lawyerId: string,
  parents: Iterable<string>,
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const wanted = new Set(parents);
  if (wanted.size === 0) return [];
  // مدير المنصة (lawyerId = ALL أو فاضي) يشوف الكل — بدون شرط مكتب
  const base = collectionGroup(db, sub);
  const snap = await getDocs(lawyerId && lawyerId !== "ALL" ? query(base, where("lawyerId", "==", lawyerId)) : base);
  return snap.docs.filter((d) => {
    const parent = d.ref.parent.parent;
    return parent !== null && wanted.has(parent.path);
  });
}

/** معرّف القضية/العميل الأم لمستند فرعي */
export const parentIdOf = (d: QueryDocumentSnapshot<DocumentData>): string => d.ref.parent.parent?.id ?? "";

/**
 * مستندات القضايا المكلَّف بها المحامي، ومستندات عملاء تلك القضايا — استعلام واحد.
 */
export async function assignedDocuments(
  cases: { id: string; clientId?: unknown }[],
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const clientIds = [...new Set(cases.map((c) => c.clientId).filter((id): id is string => typeof id === "string" && id !== ""))];
  return childrenOf("documents", localStorage.getItem("lawyerId") || "", [
    ...cases.map((c) => `cases/${c.id}`),
    ...clientIds.map((id) => `clients/${id}`),
  ]);
}
