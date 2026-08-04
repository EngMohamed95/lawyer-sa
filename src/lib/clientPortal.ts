/**
 * بوابة العميل — النماذج والجانب المكتبي (الوثيقة §2.7).
 *
 * ⚠️ حالة البوابة الخارجية: **غير مفعّلة**.
 *    فتح مسار /portal لمستخدم خارجي يتطلب قواعد Firestore منفصلة للدور
 *    CLIENT ومسارات خادم مستقلة — وهي ضمن الميزة 001 المؤجَّلة. بدونها
 *    يستطيع أي حساب عميل قراءة قاعدة البيانات كاملة عبر Firebase SDK
 *    مهما ضيّقنا الواجهة. لذلك:
 *      - الدعوة تُسجَّل بحالة INVITED ولا يُنشأ حساب دخول.
 *      - PORTAL_ENABLED يبقى false حتى تكتمل 001.
 *    ما يعمل الآن: الرسائل والطلبات من جانب المكتب، ومُسلسِلات الحقول
 *    البيضاء (portalSerializer) المُختبَرة والجاهزة للحظة التفعيل.
 */

import { addDoc, collection, getDocs, query, updateDoc, doc, where } from "firebase/firestore";
import { db } from "./firebase";
import { excludeDeleted } from "./softDelete";
import { writeAudit } from "./audit";

/** المفتاح الذي يفتح البوابة الخارجية — يبقى مغلقاً حتى تكتمل قواعد الأمان */
export const PORTAL_ENABLED = false;

/* ────────────────────────── الأنواع ────────────────────────── */

export type PortalAccountStatus = "INVITED" | "ACTIVE" | "SUSPENDED";

export interface PortalPermissions {
  viewHearings: boolean;
  viewDocuments: boolean;
  viewInvoices: boolean;
  payOnline: boolean;
  sendMessages: boolean;
  requestAppointment: boolean;
}

export const DEFAULT_PORTAL_PERMISSIONS: PortalPermissions = {
  viewHearings: true,
  viewDocuments: true,
  viewInvoices: true,
  payOnline: false,
  sendMessages: true,
  requestAppointment: true,
};

export const PORTAL_PERMISSION_LABELS_AR: Record<keyof PortalPermissions, string> = {
  viewHearings: "عرض الجلسات",
  viewDocuments: "عرض المستندات المشارَكة",
  viewInvoices: "عرض الفواتير",
  payOnline: "الدفع الإلكتروني",
  sendMessages: "إرسال رسائل للمكتب",
  requestAppointment: "طلب موعد",
};

export interface PortalAccount {
  id: string;
  lawyerId: string;
  clientId: string;
  clientName?: string | null;
  email: string;
  phone?: string | null;
  status: PortalAccountStatus;
  invitedAt: string;
  invitedBy: string | null;
  activatedAt?: string | null;
  lastLoginAt?: string | null;
  allowedCaseIds: string[];
  permissions: PortalPermissions;
  deletedAt?: string | null;
}

export const PORTAL_STATUS_LABELS_AR: Record<PortalAccountStatus, string> = {
  INVITED: "مدعو — بانتظار التفعيل",
  ACTIVE: "مفعَّل",
  SUSPENDED: "موقوف",
};

export const PORTAL_STATUS_COLORS: Record<PortalAccountStatus, string> = {
  INVITED: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-green-100 text-green-800",
  SUSPENDED: "bg-rose-100 text-rose-900",
};

export type RequestType = "APPOINTMENT" | "DOCUMENT" | "UPDATE" | "OTHER";
export type RequestStatus = "NEW" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";

export const REQUEST_TYPE_LABELS_AR: Record<RequestType, string> = {
  APPOINTMENT: "طلب موعد",
  DOCUMENT: "طلب مستند",
  UPDATE: "طلب تحديث عن القضية",
  OTHER: "طلب آخر",
};

export const REQUEST_STATUS_LABELS_AR: Record<RequestStatus, string> = {
  NEW: "جديد",
  IN_PROGRESS: "قيد المعالجة",
  RESOLVED: "منجز",
  REJECTED: "مرفوض",
};

export const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  NEW: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  RESOLVED: "bg-green-100 text-green-800",
  REJECTED: "bg-rose-100 text-rose-900",
};

export interface ClientRequest {
  id: string;
  lawyerId: string;
  clientId: string | null;
  clientName?: string | null;
  caseId?: string | null;
  caseTitle?: string | null;
  type: RequestType;
  subject: string;
  body: string;
  status: RequestStatus;
  assignedTo?: string | null;
  resolvedAt?: string | null;
  resolution?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export interface ClientMessage {
  id: string;
  lawyerId: string;
  clientId: string;
  clientName?: string | null;
  caseId?: string | null;
  threadId: string;
  senderType: "CLIENT" | "OFFICE";
  senderId: string | null;
  senderName: string | null;
  body: string;
  readAt?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

/* ────────────────────────── الحسابات ────────────────────────── */

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function listPortalAccounts(lawyerId: string): Promise<PortalAccount[]> {
  if (!lawyerId) return [];
  try {
    const snap = await getDocs(
      query(collection(db, "client_portal_accounts"), where("lawyerId", "==", lawyerId)),
    );
    return excludeDeleted(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PortalAccount, "id">) })),
    );
  } catch (err) {
    console.warn("تعذّر قراءة حسابات البوابة:", err);
    return [];
  }
}

/** بريد صالح شكلاً — تحقّق بسيط يمنع الأخطاء المطبعية */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/**
 * يسجّل دعوة عميل للبوابة.
 * لا يُنشئ حساب دخول — إنشاء المستخدم وضبط الـ claims يحتاجان Admin SDK
 * على الخادم، ويبقيان معطّلين حتى تكتمل قواعد الأمان (001).
 */
export async function invitePortalAccount(input: {
  lawyerId: string;
  clientId: string;
  clientName: string;
  email: string;
  phone?: string | null;
  invitedBy: string | null;
  allowedCaseIds?: string[];
  permissions?: PortalPermissions;
}): Promise<{ id: string }> {
  if (!input.lawyerId || !input.clientId) throw new Error("بيانات ناقصة");
  if (!isValidEmail(input.email)) throw new Error("البريد الإلكتروني غير صالح");

  const existing = await getDocs(
    query(
      collection(db, "client_portal_accounts"),
      where("lawyerId", "==", input.lawyerId),
      where("clientId", "==", input.clientId),
    ),
  );
  const live = existing.docs.filter((d) => !d.data().deletedAt);
  if (live.length > 0) throw new Error("لهذا العميل دعوة مسجّلة بالفعل");

  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "client_portal_accounts"), {
    lawyerId: input.lawyerId,
    clientId: input.clientId,
    clientName: input.clientName,
    email: input.email.trim().toLowerCase(),
    phone: input.phone ?? null,
    status: "INVITED" as PortalAccountStatus,
    invitedAt: now,
    invitedBy: input.invitedBy,
    activatedAt: null,
    lastLoginAt: null,
    allowedCaseIds: input.allowedCaseIds ?? [],
    permissions: input.permissions ?? DEFAULT_PORTAL_PERMISSIONS,
    createdAt: now,
    deletedAt: null,
  });

  await writeAudit({
    action: "CREATE", entity: "user", entityId: ref.id,
    entityLabel: `دعوة بوابة — ${input.clientName}`,
    after: { البريد: input.email, الحالة: "مدعو", "قضايا محددة": (input.allowedCaseIds ?? []).length || "الكل" },
  });

  return { id: ref.id };
}

export async function setPortalAccountStatus(
  account: PortalAccount, status: PortalAccountStatus,
): Promise<void> {
  await updateDoc(doc(db, "client_portal_accounts", account.id), {
    status, updatedAt: new Date().toISOString(),
  });
  await writeAudit({
    action: "UPDATE", entity: "user", entityId: account.id,
    entityLabel: `حساب بوابة — ${account.clientName ?? account.email}`,
    before: { الحالة: PORTAL_STATUS_LABELS_AR[account.status] },
    after: { الحالة: PORTAL_STATUS_LABELS_AR[status] },
  });
}

export async function updatePortalPermissions(
  account: PortalAccount, permissions: PortalPermissions,
): Promise<void> {
  await updateDoc(doc(db, "client_portal_accounts", account.id), {
    permissions, updatedAt: new Date().toISOString(),
  });
  const changed = (Object.keys(permissions) as (keyof PortalPermissions)[])
    .filter((k) => permissions[k] !== account.permissions?.[k])
    .map((k) => `${PORTAL_PERMISSION_LABELS_AR[k]}: ${permissions[k] ? "مسموح" : "ممنوع"}`);
  await writeAudit({
    action: "PERMISSION_CHANGE", entity: "user", entityId: account.id,
    entityLabel: `حساب بوابة — ${account.clientName ?? account.email}`,
    after: { التغييرات: changed.join(" · ") || "لا تغيير" },
  });
}

/* ────────────────────────── الطلبات والرسائل ────────────────────────── */

export async function listClientRequests(lawyerId: string): Promise<ClientRequest[]> {
  if (!lawyerId) return [];
  try {
    const snap = await getDocs(
      query(collection(db, "client_requests"), where("lawyerId", "==", lawyerId)),
    );
    return excludeDeleted(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClientRequest, "id">) })),
    ).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  } catch (err) {
    console.warn("تعذّر قراءة طلبات العملاء:", err);
    return [];
  }
}

export async function setRequestStatus(
  req: ClientRequest, status: RequestStatus, resolution?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, "client_requests", req.id), {
    status,
    resolution: resolution ?? req.resolution ?? null,
    resolvedAt: ["RESOLVED", "REJECTED"].includes(status) ? now : null,
    updatedAt: now,
  });
  await writeAudit({
    action: status === "REJECTED" ? "REJECT" : "UPDATE",
    entity: "client", entityId: req.id,
    entityLabel: `طلب عميل — ${req.subject}`,
    before: { الحالة: REQUEST_STATUS_LABELS_AR[req.status] },
    after: { الحالة: REQUEST_STATUS_LABELS_AR[status], الرد: resolution || "—" },
  });
}

export async function listMessages(lawyerId: string, clientId?: string): Promise<ClientMessage[]> {
  if (!lawyerId) return [];
  try {
    const base = [where("lawyerId", "==", lawyerId)];
    if (clientId) base.push(where("clientId", "==", clientId));
    const snap = await getDocs(query(collection(db, "client_messages"), ...base));
    return excludeDeleted(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClientMessage, "id">) })),
    ).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  } catch (err) {
    console.warn("تعذّر قراءة رسائل العملاء:", err);
    return [];
  }
}

/** رد المكتب على العميل */
export async function sendOfficeMessage(input: {
  lawyerId: string;
  clientId: string;
  clientName?: string | null;
  caseId?: string | null;
  body: string;
  senderId: string | null;
  senderName: string | null;
}): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new Error("الرسالة فارغة");
  if (body.length > 4000) throw new Error("الرسالة أطول من المسموح");
  const now = new Date().toISOString();
  await addDoc(collection(db, "client_messages"), {
    lawyerId: input.lawyerId,
    clientId: input.clientId,
    clientName: input.clientName ?? null,
    caseId: input.caseId ?? null,
    threadId: `${input.lawyerId}_${input.clientId}`,
    senderType: "OFFICE" as const,
    senderId: input.senderId,
    senderName: input.senderName,
    body,
    readAt: null,
    createdAt: now,
    deletedAt: null,
  });
}

/** الرسائل الواردة غير المقروءة — للشارة في الواجهة */
export function unreadFromClients(msgs: ClientMessage[]): number {
  return msgs.filter((m) => m.senderType === "CLIENT" && !m.readAt).length;
}

export function groupByClient(msgs: ClientMessage[]): Map<string, ClientMessage[]> {
  const map = new Map<string, ClientMessage[]>();
  for (const m of msgs) {
    const k = str(m.clientId);
    if (!k) continue;
    const list = map.get(k) ?? [];
    list.push(m);
    map.set(k, list);
  }
  return map;
}
