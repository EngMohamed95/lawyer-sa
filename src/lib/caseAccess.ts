/**
 * حدود رؤية القضايا داخل المكتب.
 *
 * المحامي (OFFICE_LAWYER) يرى القضايا المكلَّف بها فقط — معرّفه في assignedLawyerIds
 * أو في الحقل القديم assignedLawyerId. قواعد Firestore تفرض الشرط نفسه، لذلك يجب
 * أن يحمل كل استعلام قضايا يشغّله المحامي هذا الشرط — وإلا رفضت Firestore الاستعلام كاملاً.
 * استخدم visibleCasesQuery بدل بناء استعلام القضايا يدوياً.
 */

import {
  and, collection, getDocs, or, query, where,
  type DocumentData, type Query, type QueryDocumentSnapshot, type QueryCompositeFilterConstraint, type QueryConstraint,
  type QueryFieldFilterConstraint, type QueryNonFilterConstraint,
} from "firebase/firestore";
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
 * مستندات القضايا المكلَّف بها المحامي، ومستندات عملاء تلك القضايا.
 * المحامي لا يستعلم مستندات المكتب كله (collectionGroup) — القواعد تمنعه منها لأن
 * فيها مستندات قضايا غير مكلَّف بها. نقرأ مجموعة documents تحت كل قضية/عميل مرئي.
 */
export async function assignedDocuments(
  cases: { id: string; clientId?: unknown }[],
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const clientIds = [...new Set(cases.map((c) => c.clientId).filter((id): id is string => typeof id === "string" && id !== ""))];
  const snaps = await Promise.all([
    ...cases.map((c) => getDocs(collection(db, "cases", c.id, "documents"))),
    ...clientIds.map((id) => getDocs(collection(db, "clients", id, "documents"))),
  ]);
  return snaps.flatMap((s) => s.docs);
}
