/**
 * صفة العميل في القضية. القضايا القديمة قد لا تحمل حقل clientRole، فنستنتجه
 * من الأسماء: إن كان اسم المدعي هو اسم العميل فهو المدعي، وإلا فالمدعى عليه.
 */

import { isExecutionCase } from "./caseTypes";

export type ClientRole = "PLAINTIFF" | "DEFENDANT";

export function clientRoleOf(c: any): ClientRole {
  if (c?.clientRole === "PLAINTIFF" || c?.clientRole === "DEFENDANT") return c.clientRole;
  return c?.plaintiffName === c?.client?.fullName ? "PLAINTIFF" : "DEFENDANT";
}

export const CLIENT_ROLE_LABELS_AR: Record<ClientRole, string> = {
  PLAINTIFF: "وكيل المدعي",
  DEFENDANT: "وكيل المدعى عليه",
};

/** في طلبات التنفيذ: المدعي = طالب التنفيذ، والمدعى عليه = المنفذ ضده */
export const EXECUTION_ROLE_LABELS_AR: Record<ClientRole, string> = {
  PLAINTIFF: "وكيل طالب التنفيذ",
  DEFENDANT: "وكيل المنفذ ضده",
};

/** صفة العميل بالمسمّى المناسب لنوع القضية */
export function clientRoleLabelOf(c: any): string {
  const role = clientRoleOf(c);
  return isExecutionCase(c) ? EXECUTION_ROLE_LABELS_AR[role] : CLIENT_ROLE_LABELS_AR[role];
}

/** مسمّى الطرفين حسب نوع القضية */
export const partyLabels = (execution: boolean) => execution
  ? { PLAINTIFF: "طالب التنفيذ", DEFENDANT: "المنفذ ضده", plaintiffs: "طالبو التنفيذ", defendants: "المنفذ ضدهم" }
  : { PLAINTIFF: "المدعي", DEFENDANT: "المدعى عليه", plaintiffs: "المدعون", defendants: "المدعى عليهم" };
