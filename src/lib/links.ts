/**
 * طبقة الربط بين المديولات — «كلهم يسمعوا في بعض».
 *
 * الفكرة: كل سجل في النظام (قضية، عميل، عقد، مهمة، دفعة...) يعرف
 * السجلات المرتبطة به، ويُظهرها كروابط قابلة للنقر. هذا الملف هو
 * المصدر الوحيد لهذه العلاقات حتى لا تتكرر الاستعلامات في كل صفحة.
 *
 * قاعدة أمنية ثابتة: كل استعلام هنا مقيَّد بـ lawyerId — لا يخرج
 * أي ربط خارج حدود المكتب مهما كان المُعرَّف المُمرَّر.
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { excludeDeleted } from "./softDelete";
import { CONTRACT_STATUS_COLORS, CONTRACT_STATUS_LABELS_AR, type ContractStatus } from "./contracts";

export type LinkKind =
  | "case" | "client" | "contract" | "task"
  | "hearing" | "document" | "payment" | "expense";

export interface LinkedItem {
  kind: LinkKind;
  id: string;
  label: string;
  sublabel?: string | null;
  badge?: string | null;
  badgeClass?: string | null;
  /** مسار قابل للنقر — null يعني عرض فقط بلا انتقال */
  href?: string | null;
  /** تاريخ للترتيب */
  at?: string | null;
  amount?: number | null;
}

export const LINK_KIND_LABELS_AR: Record<LinkKind, string> = {
  case: "قضية",
  client: "عميل",
  contract: "عقد",
  task: "مهمة",
  hearing: "جلسة",
  document: "مستند",
  payment: "دفعة",
  expense: "مصروف",
};

export const LINK_KIND_COLORS: Record<LinkKind, string> = {
  case: "bg-indigo-50 text-indigo-700 border-indigo-100",
  client: "bg-sky-50 text-sky-700 border-sky-100",
  contract: "bg-amber-50 text-amber-800 border-amber-100",
  task: "bg-purple-50 text-purple-700 border-purple-100",
  hearing: "bg-cyan-50 text-cyan-700 border-cyan-100",
  document: "bg-rose-50 text-rose-700 border-rose-100",
  payment: "bg-emerald-50 text-emerald-700 border-emerald-100",
  expense: "bg-orange-50 text-orange-700 border-orange-100",
};

type Row = Record<string, unknown> & { id: string };

/** يقرأ مجموعة مقيَّدة بالمكتب + شرط مساواة اختياري، ويستبعد المحذوف ناعماً */
async function fetchWhere(
  col: string,
  lawyerId: string,
  field?: string,
  value?: string,
): Promise<Row[]> {
  if (!lawyerId) return [];
  try {
    const base = [where("lawyerId", "==", lawyerId)];
    if (field && value) base.push(where(field, "==", value));
    const snap = await getDocs(query(collection(db, col), ...base));
    return excludeDeleted(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row));
  } catch (err) {
    console.warn(`تعذّر قراءة العلاقات من ${col}:`, err);
    return [];
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

/** اسم معروض للقضية مهما اختلفت تسمية الحقول عبر النسخ القديمة */
export function caseLabel(c: Record<string, unknown>): string {
  return str(c.title) || str(c.caseTitle) || str(c.subject) || str(c.caseNumber) || "قضية بلا عنوان";
}

/** اسم معروض للعميل */
export function clientLabel(c: Record<string, unknown>): string {
  return str(c.fullName) || str(c.name) || str(c.clientName) || "عميل بلا اسم";
}

/* ────────────────────────── قوائم الاختيار ────────────────────────── */

export interface CaseOption { id: string; label: string; caseNumber: string; clientId: string }
export interface ClientOption { id: string; label: string }

/** قضايا المكتب — مع إمكانية القصر على عميل واحد */
export async function fetchCaseOptions(lawyerId: string, clientId?: string): Promise<CaseOption[]> {
  const rows = await fetchWhere("cases", lawyerId);
  return rows
    .filter((c) => !clientId || str(c.clientId) === clientId)
    .map((c) => ({
      id: c.id,
      label: caseLabel(c),
      caseNumber: str(c.caseNumber),
      clientId: str(c.clientId),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

/** عملاء المكتب */
export async function fetchClientOptions(lawyerId: string): Promise<ClientOption[]> {
  const rows = await fetchWhere("clients", lawyerId);
  return rows
    .map((c) => ({ id: c.id, label: clientLabel(c) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

/* ────────────────────────── محوّلات إلى LinkedItem ────────────────────────── */

const currency = (): string => localStorage.getItem("sys_currency") || "SAR";

function contractToLink(c: Row): LinkedItem {
  const status = str(c.status) as ContractStatus;
  return {
    kind: "contract",
    id: c.id,
    label: `${str(c.contractNumber)} — ${str(c.title) || "عقد"}`,
    sublabel: [
      str(c.clientName) || null,
      num(c.totalValue) ? `${num(c.totalValue).toLocaleString("ar-EG")} ${str(c.currency) || currency()}` : null,
    ].filter(Boolean).join(" · ") || null,
    badge: CONTRACT_STATUS_LABELS_AR[status] ?? status,
    badgeClass: CONTRACT_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700",
    href: "/app/contracts",
    at: str(c.createdAt) || null,
    amount: num(c.totalValue) || null,
  };
}

function caseToLink(c: Row): LinkedItem {
  return {
    kind: "case",
    id: c.id,
    label: caseLabel(c),
    sublabel: [str(c.caseNumber) || null, str(c.court) || null].filter(Boolean).join(" · ") || null,
    badge: str(c.status) || null,
    badgeClass: "bg-indigo-100 text-indigo-800",
    href: `/app/cases/${c.id}`,
    at: str(c.createdAt) || null,
  };
}

function taskToLink(t: Row): LinkedItem {
  const done = str(t.status) === "COMPLETED" || t.completed === true;
  return {
    kind: "task",
    id: t.id,
    label: str(t.title) || "مهمة",
    sublabel: str(t.assignedToName) || str(t.description).slice(0, 60) || null,
    badge: done ? "مكتملة" : str(t.dueDate) ? `تستحق ${str(t.dueDate)}` : "قيد التنفيذ",
    badgeClass: done ? "bg-green-100 text-green-800" : "bg-purple-100 text-purple-800",
    href: "/app/tasks",
    at: str(t.dueDate) || str(t.createdAt) || null,
  };
}

function moneyToLink(kind: "payment" | "expense", r: Row): LinkedItem {
  return {
    kind,
    id: r.id,
    label: `${num(r.amount).toLocaleString("ar-EG")} ${currency()}`,
    sublabel: str(r.notes) || str(r.description) || str(r.category) || null,
    badge: str(r.date) || null,
    badgeClass: kind === "payment" ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800",
    href: "/app/accounting",
    at: str(r.date) || str(r.createdAt) || null,
    amount: num(r.amount),
  };
}

const byDateDesc = (a: LinkedItem, b: LinkedItem) => (b.at ?? "").localeCompare(a.at ?? "");

/* ────────────────────────── العلاقات ────────────────────────── */

/** كل ما يرتبط بقضية: عقود · مهام · دفعات · مصروفات */
export async function relatedToCase(lawyerId: string, caseId: string): Promise<LinkedItem[]> {
  if (!lawyerId || !caseId) return [];
  const [contracts, tasks, payments, expenses] = await Promise.all([
    fetchWhere("contracts", lawyerId, "caseId", caseId),
    fetchWhere("tasks", lawyerId, "caseId", caseId),
    fetchWhere("payments", lawyerId, "caseId", caseId),
    fetchWhere("expenses", lawyerId, "caseId", caseId),
  ]);
  return [
    ...contracts.map(contractToLink),
    ...tasks.map(taskToLink),
    ...payments.map((p) => moneyToLink("payment", p)),
    ...expenses.map((e) => moneyToLink("expense", e)),
  ].sort(byDateDesc);
}

/** كل ما يرتبط بعميل: قضايا · عقود · دفعات */
export async function relatedToClient(lawyerId: string, clientId: string): Promise<LinkedItem[]> {
  if (!lawyerId || !clientId) return [];
  const [cases, contracts, payments] = await Promise.all([
    fetchWhere("cases", lawyerId, "clientId", clientId),
    fetchWhere("contracts", lawyerId, "clientId", clientId),
    fetchWhere("payments", lawyerId, "clientId", clientId),
  ]);
  return [
    ...cases.map(caseToLink),
    ...contracts.map(contractToLink),
    ...payments.map((p) => moneyToLink("payment", p)),
  ].sort(byDateDesc);
}

/** عقود قضية بعينها — يستخدمها تبويب العقود داخل ملف القضية */
export async function contractsOfCase(lawyerId: string, caseId: string): Promise<Row[]> {
  return fetchWhere("contracts", lawyerId, "caseId", caseId);
}

/** عقود عميل بعينه */
export async function contractsOfClient(lawyerId: string, clientId: string): Promise<Row[]> {
  return fetchWhere("contracts", lawyerId, "clientId", clientId);
}

/** ملخّص عددي سريع للعلاقات — للشارات في القوائم */
export function summarize(items: LinkedItem[]): Partial<Record<LinkKind, number>> {
  const out: Partial<Record<LinkKind, number>> = {};
  for (const it of items) out[it.kind] = (out[it.kind] ?? 0) + 1;
  return out;
}
