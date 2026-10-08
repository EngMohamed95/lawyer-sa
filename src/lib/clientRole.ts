/**
 * صفة العميل في القضية. القضايا القديمة قد لا تحمل حقل clientRole، فنستنتجه
 * من الأسماء: إن كان اسم المدعي هو اسم العميل فهو المدعي، وإلا فالمدعى عليه.
 */

export type ClientRole = "PLAINTIFF" | "DEFENDANT";

export function clientRoleOf(c: any): ClientRole {
  if (c?.clientRole === "PLAINTIFF" || c?.clientRole === "DEFENDANT") return c.clientRole;
  return c?.plaintiffName === c?.client?.fullName ? "PLAINTIFF" : "DEFENDANT";
}

export const CLIENT_ROLE_LABELS_AR: Record<ClientRole, string> = {
  PLAINTIFF: "وكيل المدعي",
  DEFENDANT: "وكيل المدعى عليه",
};
