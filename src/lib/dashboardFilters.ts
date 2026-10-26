/**
 * تصنيفات لوحة التحكم — نفس القاعدة تحسب الرقم في اللوحة وترشّح القائمة
 * في الصفحة التي يفتحها الضغط عليه (?status= / ?month= / ?range=)،
 * فلا يختلف الرقم عن عدد ما يظهر بعد الضغط.
 */

/** سجل Firestore مقروء — الحقول المستخدمة هنا: status, dueDate, hearingDate, result, createdAt, startDate */
type Rec = Record<string, any>;

/** مفتاح اليوم المحلي YYYY-MM-DD — يقبل نصاً أو Timestamp */
export function dayOf(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = typeof (v as any)?.toDate === "function" ? (v as any).toDate() : new Date(v as string);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const todayKey = () => dayOf(new Date());

/** آخر يوم في نافذة «هذا الأسبوع» — اليوم وستة أيام بعده */
export function weekEndKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 6);
  return dayOf(d);
}

/* ── القضايا ── */

export type CaseStatusKey = "open" | "closed" | "archived";
const CLOSED_CASE_STATUSES = new Set(["CLOSED", "DONE", "COMPLETED"]);

export function caseStatusKey(c: Rec): CaseStatusKey {
  const s = String(c.status || "OPEN");
  if (s === "ARCHIVED") return "archived";
  return CLOSED_CASE_STATUSES.has(s) ? "closed" : "open";
}

export const CASE_STATUS_FILTER_AR: Record<CaseStatusKey, string> = {
  open: "المفتوحة", closed: "المغلقة", archived: "المؤرشفة",
};

/** تاريخ إضافة القضية — للتجميع الشهري */
export const caseDay = (c: Rec) => dayOf(c.createdAt || c.startDate);

/* ── الجلسات ── */

export type HearingStatusKey = "upcoming" | "awaiting" | "done";

export function hearingStatusKey(h: Rec, today = todayKey()): HearingStatusKey {
  const day = dayOf(h.hearingDate);
  if (day >= today) return "upcoming";
  return h.result ? "done" : "awaiting";
}

export const HEARING_STATUS_FILTER_AR: Record<HearingStatusKey, string> = {
  upcoming: "القادمة", awaiting: "بانتظار تسجيل النتيجة", done: "المنتهية",
};

export type HearingRangeKey = "today" | "week";
export const HEARING_RANGE_FILTER_AR: Record<HearingRangeKey, string> = {
  today: "جلسات اليوم", week: "جلسات هذا الأسبوع",
};

export function inHearingRange(h: Rec, range: HearingRangeKey, today = todayKey()): boolean {
  const day = dayOf(h.hearingDate);
  return range === "today" ? day === today : day >= today && day <= weekEndKey();
}

/* ── المهام ── */

export type TaskStatusKey = "open" | "overdue" | "done";

export const isTaskDone = (t: Rec) => t.status === "COMPLETED" || t.status === "FINISHED";

export function taskStatusKey(t: Rec, today = todayKey()): TaskStatusKey {
  if (isTaskDone(t)) return "done";
  const due = dayOf(t.dueDate);
  return t.status === "OVERDUE" || (due && due < today) ? "overdue" : "open";
}

/** «unfinished» = المفتوحة والمتأخرة معاً — رابط بطاقة «المهام المفتوحة» */
export function matchesTaskFilter(t: Rec, filter: string): boolean {
  if (filter === "unfinished") return !isTaskDone(t);
  return taskStatusKey(t) === filter;
}

export const TASK_STATUS_FILTER_AR: Record<string, string> = {
  open: "قيد التنفيذ", overdue: "المتأخرة", done: "المكتملة", unfinished: "غير المكتملة",
};

/** اسم الشهر لشريط الترشيح: 2026-10 → أكتوبر 2026 */
export const monthFilterLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
