/**
 * حدود رؤية القضايا داخل المكتب.
 *
 * المحامي (OFFICE_LAWYER) يرى القضايا المكلَّف بها فقط (assignedLawyerId = معرّفه).
 * قواعد Firestore تفرض الشرط نفسه، لذلك يجب أن يحمل كل استعلام قضايا يشغّله
 * المحامي شرط assignedLawyerId — وإلا رفضت Firestore الاستعلام كاملاً.
 * استخدم visibleCasesQuery بدل بناء استعلام القضايا يدوياً.
 */

import { collection, query, where, type Query, type DocumentData, type QueryConstraint } from "firebase/firestore";
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

/** استعلام قضايا المكتب التي يحق للمستخدم الحالي رؤيتها، مع قيود إضافية اختيارية */
export function visibleCasesQuery(lawyerId: string, ...extra: QueryConstraint[]): Query<DocumentData> {
  const { role, userId } = currentViewer();
  const scope: QueryConstraint[] = [where("lawyerId", "==", lawyerId)];
  if (isAssignedOnly(role)) scope.push(where("assignedLawyerId", "==", userId));
  return query(collection(db, "cases"), ...scope, ...extra);
}

/** فحص قضية مقروءة مسبقاً — للبيانات التي لم تأتِ من visibleCasesQuery */
export function canSeeCase(c: { assignedLawyerId?: unknown } | null | undefined, viewer: Viewer = currentViewer()): boolean {
  if (!c) return false;
  if (!isAssignedOnly(viewer.role)) return true;
  return c.assignedLawyerId === viewer.userId;
}
