/**
 * المواعيد والتقويم الموحّد — الوثيقة §1.8.
 *
 * التقويم يجمع أربعة مصادر في نموذج حدث واحد:
 *   1. appointments — المواعيد الجديدة (تُنشأ من هنا)
 *   2. الجلسات داخل «cases/{id}/hearings» — قراءة فقط بلا مساس ببنيتها
 *   3. tasks.dueDate — مواعيد تسليم المهام
 *   4. contracts.endDate و invoices.dueDate — استحقاقات تعاقدية ومالية
 *
 * لا يُعدَّل أي مصدر قائم؛ الدمج يحدث في الذاكرة عند العرض فقط.
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { excludeDeleted } from "./softDelete";

/* ────────────────────────── الأنواع ────────────────────────── */

export type EventSource = "appointment" | "hearing" | "task" | "contract" | "invoice";

export type AppointmentType =
  | "CLIENT_MEETING" | "INTERNAL_MEETING" | "CONSULTATION"
  | "COURT_VISIT" | "DEADLINE" | "REMINDER" | "OTHER";

export type AppointmentStatus =
  | "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY";

export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number;
  count?: number | null;
  until?: string | null;
}

export interface Appointment {
  id: string;
  lawyerId: string;
  title: string;
  description?: string | null;
  type: AppointmentType;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location?: string | null;
  isOnline: boolean;
  meetingUrl?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  caseId?: string | null;
  caseTitle?: string | null;
  caseNumber?: string | null;
  organizerId: string | null;
  organizerName?: string | null;
  attendees?: { name: string; userId?: string | null; clientId?: string | null; status: string }[];
  reminders?: { minutesBefore: number; channels: string[] }[];
  recurrence?: Recurrence | null;
  status: AppointmentStatus;
  outcome?: string | null;
  color?: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  deletedAt?: string | null;
}

/** النموذج الموحّد الذي يعرضه التقويم مهما كان مصدر الحدث */
export interface CalendarEvent {
  id: string;
  source: EventSource;
  title: string;
  subtitle?: string | null;
  /** ISO datetime */
  start: string;
  end: string;
  allDay: boolean;
  /** مسار الانتقال عند النقر */
  href?: string | null;
  caseId?: string | null;
  clientName?: string | null;
  status?: string | null;
  /** مثيل مولَّد من تكرار — لا يوجد له مستند مستقل */
  occurrenceOf?: string | null;
}

/* ────────────────────────── التسميات والألوان ────────────────────────── */

export const APPOINTMENT_TYPE_LABELS_AR: Record<AppointmentType, string> = {
  CLIENT_MEETING: "اجتماع مع عميل",
  INTERNAL_MEETING: "اجتماع داخلي",
  CONSULTATION: "استشارة",
  COURT_VISIT: "زيارة محكمة",
  DEADLINE: "موعد نهائي",
  REMINDER: "تذكير",
  OTHER: "أخرى",
};

export const APPOINTMENT_STATUS_LABELS_AR: Record<AppointmentStatus, string> = {
  SCHEDULED: "مجدول",
  CONFIRMED: "مؤكَّد",
  COMPLETED: "تم",
  CANCELLED: "ملغى",
  NO_SHOW: "لم يحضر",
};

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  CONFIRMED: "bg-green-100 text-green-800",
  COMPLETED: "bg-gray-100 text-gray-700",
  CANCELLED: "bg-rose-100 text-rose-900",
  NO_SHOW: "bg-orange-100 text-orange-800",
};

export const SOURCE_LABELS_AR: Record<EventSource, string> = {
  appointment: "موعد",
  hearing: "جلسة",
  task: "مهمة",
  contract: "عقد",
  invoice: "فاتورة",
};

/** ألوان الشرائح داخل التقويم — لكل مصدر لون ثابت */
export const SOURCE_COLORS: Record<EventSource, string> = {
  appointment: "bg-[#133B2E] text-white border-[#133B2E]",
  hearing: "bg-cyan-100 text-cyan-900 border-cyan-200",
  task: "bg-purple-100 text-purple-900 border-purple-200",
  contract: "bg-amber-100 text-amber-900 border-amber-200",
  invoice: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

export const SOURCE_DOT: Record<EventSource, string> = {
  appointment: "bg-[#133B2E]",
  hearing: "bg-cyan-500",
  task: "bg-purple-500",
  contract: "bg-amber-500",
  invoice: "bg-emerald-500",
};

export const RECURRENCE_LABELS_AR: Record<RecurrenceFreq, string> = {
  DAILY: "يومي",
  WEEKLY: "أسبوعي",
  MONTHLY: "شهري",
};

/* ────────────────────────── أدوات التاريخ ────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");

/** مفتاح اليوم المحلي — لا يُستخدم toISOString لأنه يحوّل للتوقيت العالمي فيزيح اليوم */
export function dayKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** بداية الأسبوع بالسبت — التقويم الهجري/السعودي يبدأ الأسبوع بالسبت */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  // getDay: 0=الأحد … 6=السبت ⟵ نريد السبت بداية
  const shift = (x.getDay() + 1) % 7;
  return addDays(x, -shift);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export const WEEKDAYS_AR = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

export function monthLabel(d: Date): string {
  return d.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
}

/**
 * يبني شبكة الشهر بعدد الأسابيع الذي يحتاجه فعلاً (٤ إلى ٦).
 *
 * الشبكة الثابتة على ٦ أسابيع كانت تُلحق بالشهر أسبوعاً كاملاً من الشهر
 * التالي حين ينتهي الشهر في الصف الخامس — أغسطس ٢٠٢٦ مثلاً كان يعرض
 * صفاً كاملاً من سبتمبر. نحسب العدد المطلوب فلا يظهر إلا ما يكمل الأسبوع.
 */
export function monthGrid(anchor: Date): Date[] {
  const monthStart = startOfMonth(anchor);
  const first = startOfWeek(monthStart);
  const daysInMonth = endOfMonth(anchor).getDate();
  // كم يوماً من الشهر السابق نحتاجه لإكمال الأسبوع الأول
  const lead = Math.round((monthStart.getTime() - first.getTime()) / 86_400_000);
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i));
}

/* ────────────────────────── التكرار (R3) ────────────────────────── */

/** حد أقصى للمثيلات المولَّدة — يمنع حلقة لا نهائية لو غاب until وcount */
const MAX_OCCURRENCES = 200;

/**
 * يولّد مثيلات الموعد المتكرر داخل نافذة زمنية.
 * المثيلات محسوبة في الذاكرة ولا تُكتب في قاعدة البيانات.
 */
export function expandRecurrence(a: Appointment, windowStart: Date, windowEnd: Date): CalendarEvent[] {
  const base = appointmentToEvent(a);
  const rec = a.recurrence;
  if (!rec || !rec.freq) return [base];

  const interval = Math.max(1, Number(rec.interval) || 1);
  const startAt = new Date(a.startAt);
  const endAt = new Date(a.endAt);
  if (Number.isNaN(startAt.getTime())) return [base];
  const durationMs = Math.max(0, endAt.getTime() - startAt.getTime());

  const until = rec.until ? new Date(`${rec.until}T23:59:59`) : null;
  const maxCount = rec.count && rec.count > 0 ? Math.min(rec.count, MAX_OCCURRENCES) : MAX_OCCURRENCES;

  const out: CalendarEvent[] = [];
  const cursor = new Date(startAt);

  for (let i = 0; i < maxCount; i++) {
    if (i > 0) {
      if (rec.freq === "DAILY") cursor.setDate(cursor.getDate() + interval);
      else if (rec.freq === "WEEKLY") cursor.setDate(cursor.getDate() + 7 * interval);
      else cursor.setMonth(cursor.getMonth() + interval);
    }
    if (until && cursor > until) break;
    if (cursor > windowEnd) break;

    const end = new Date(cursor.getTime() + durationMs);
    if (end >= windowStart) {
      out.push({
        ...base,
        id: i === 0 ? base.id : `${base.id}__${i}`,
        start: cursor.toISOString(),
        end: end.toISOString(),
        occurrenceOf: i === 0 ? null : base.id,
      });
    }
  }
  return out;
}

/* ────────────────────────── المحوّلات ────────────────────────── */

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function appointmentToEvent(a: Appointment): CalendarEvent {
  return {
    id: a.id,
    source: "appointment",
    title: a.title,
    subtitle: [APPOINTMENT_TYPE_LABELS_AR[a.type] ?? null, a.clientName ?? null, a.location ?? null]
      .filter(Boolean).join(" · ") || null,
    start: a.startAt,
    end: a.endAt,
    allDay: !!a.allDay,
    href: a.caseId ? `/app/cases/${a.caseId}` : null,
    caseId: a.caseId ?? null,
    clientName: a.clientName ?? null,
    status: a.status,
    occurrenceOf: null,
  };
}

/** الجلسة لا تحمل وقتاً في البنية القائمة — تُعرض كحدث يوم كامل */
function hearingToEvent(h: Record<string, unknown> & { id: string }, caseTitle: string): CalendarEvent {
  const date = str(h.hearingDate);
  return {
    id: `h_${h.id}`,
    source: "hearing",
    title: `جلسة — ${caseTitle}`,
    subtitle: [str(h.court) || null, str(h.requiredActions) || null].filter(Boolean).join(" · ") || null,
    start: date ? `${date}T09:00:00` : "",
    end: date ? `${date}T10:00:00` : "",
    allDay: true,
    href: h.caseId ? `/app/cases/${str(h.caseId)}` : "/app/hearings",
    caseId: str(h.caseId) || null,
    clientName: null,
    status: str(h.result) ? "منتهية" : "قادمة",
  };
}

function taskToEvent(t: Record<string, unknown> & { id: string }): CalendarEvent {
  const date = str(t.dueDate);
  const done = str(t.status) === "COMPLETED";
  return {
    id: `t_${t.id}`,
    source: "task",
    title: `مهمة — ${str(t.title) || "بلا عنوان"}`,
    subtitle: [str(t.assigneeName) || null, done ? "مكتملة" : null].filter(Boolean).join(" · ") || null,
    start: `${date}T00:00:00`,
    end: `${date}T23:59:59`,
    allDay: true,
    href: "/app/tasks",
    caseId: str(t.caseId) || null,
    clientName: null,
    status: done ? "مكتملة" : "قيد التنفيذ",
  };
}

function contractToEvent(c: Record<string, unknown> & { id: string }): CalendarEvent {
  const date = str(c.endDate);
  return {
    id: `c_${c.id}`,
    source: "contract",
    title: `انتهاء عقد — ${str(c.title) || str(c.contractNumber)}`,
    subtitle: str(c.clientName) || null,
    start: `${date}T00:00:00`,
    end: `${date}T23:59:59`,
    allDay: true,
    href: "/app/contracts",
    caseId: str(c.caseId) || null,
    clientName: str(c.clientName) || null,
    status: str(c.status),
  };
}

function invoiceToEvent(i: Record<string, unknown> & { id: string }): CalendarEvent {
  const date = str(i.dueDate);
  return {
    id: `i_${i.id}`,
    source: "invoice",
    title: `استحقاق فاتورة — ${str(i.invoiceNumber)}`,
    subtitle: str(i.clientName) || null,
    start: `${date}T00:00:00`,
    end: `${date}T23:59:59`,
    allDay: true,
    href: "/app/invoices",
    caseId: str(i.caseId) || null,
    clientName: str(i.clientName) || null,
    status: str(i.status),
  };
}

/* ────────────────────────── الدمج (R1) ────────────────────────── */

type Row = Record<string, unknown> & { id: string };

async function readAll(col: string, lawyerId: string): Promise<Row[]> {
  try {
    const snap = await getDocs(query(collection(db, col), where("lawyerId", "==", lawyerId)));
    return excludeDeleted(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row));
  } catch (err) {
    console.warn(`تعذّر قراءة ${col} للتقويم:`, err);
    return [];
  }
}

export interface AggregateOptions {
  /** نافذة العرض — تُستخدم لتوسيع التكرار فقط */
  windowStart: Date;
  windowEnd: Date;
  /** المصادر المطلوبة */
  sources?: EventSource[];
}

/**
 * يجمع كل المصادر في قائمة أحداث موحّدة مرتّبة زمنياً.
 * كل استعلام مقيَّد بـ lawyerId — لا يخرج حدث خارج حدود المكتب.
 */
export async function aggregateCalendar(
  lawyerId: string,
  opts: AggregateOptions,
): Promise<CalendarEvent[]> {
  if (!lawyerId) return [];
  const want = (s: EventSource) => !opts.sources || opts.sources.includes(s);

  const [appointments, cases, tasks, contracts, invoices] = await Promise.all([
    want("appointment") ? readAll("appointments", lawyerId) : Promise.resolve([]),
    want("hearing") ? readAll("cases", lawyerId) : Promise.resolve([]),
    want("task") ? readAll("tasks", lawyerId) : Promise.resolve([]),
    want("contract") ? readAll("contracts", lawyerId) : Promise.resolve([]),
    want("invoice") ? readAll("invoices", lawyerId) : Promise.resolve([]),
  ]);

  const events: CalendarEvent[] = [];

  for (const a of appointments) {
    const appt = a as unknown as Appointment;
    if (!appt.startAt) continue;
    events.push(...expandRecurrence(appt, opts.windowStart, opts.windowEnd));
  }

  // الجلسات مجموعات فرعية — نقرأها لكل قضية دون تعديل بنيتها
  if (want("hearing") && cases.length > 0) {
    const perCase = await Promise.all(cases.map(async (c) => {
      try {
        const snap = await getDocs(collection(db, "cases", c.id, "hearings"));
        const title = str(c.title) || str(c.caseNumber) || "قضية";
        return snap.docs
          .map((d) => ({ id: d.id, caseId: c.id, ...d.data() }) as Row)
          .filter((h) => str(h.hearingDate))
          .map((h) => hearingToEvent(h, title));
      } catch {
        return [];
      }
    }));
    events.push(...perCase.flat());
  }

  for (const t of tasks) if (str(t.dueDate)) events.push(taskToEvent(t));
  for (const c of contracts) if (str(c.endDate)) events.push(contractToEvent(c));
  for (const i of invoices) if (str(i.dueDate)) events.push(invoiceToEvent(i));

  return events
    .filter((e) => e.start && !Number.isNaN(new Date(e.start).getTime()))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** يوزّع الأحداث على أيامها — مفتاح اليوم المحلي */
export function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = dayKey(e.start);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}

/* ────────────────────────── كشف التعارض (R2) ────────────────────────── */

export interface Conflict {
  event: CalendarEvent;
  reason: string;
}

/**
 * يرجع الأحداث المتعارضة زمنياً مع الفترة المطلوبة.
 * تحذير لا منع — القرار للمستخدم كما تنص الوثيقة.
 */
export function findConflicts(
  events: CalendarEvent[],
  startAt: string,
  endAt: string,
  ignoreId?: string,
): Conflict[] {
  const s = new Date(startAt).getTime();
  const e = new Date(endAt).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return [];

  const out: Conflict[] = [];
  for (const ev of events) {
    if (ignoreId && (ev.id === ignoreId || ev.occurrenceOf === ignoreId)) continue;
    if (ev.status === "CANCELLED" || ev.status === "ملغى") continue;
    const es = new Date(ev.start).getTime();
    const ee = new Date(ev.end).getTime();
    if (Number.isNaN(es) || Number.isNaN(ee)) continue;
    // تقاطع صارم: نهاية أحدهما بعد بداية الآخر تماماً
    if (s < ee && e > es) {
      out.push({
        event: ev,
        reason: ev.allDay
          ? `${SOURCE_LABELS_AR[ev.source]} في نفس اليوم`
          : `${SOURCE_LABELS_AR[ev.source]} من ${timeLabel(ev.start)} إلى ${timeLabel(ev.end)}`,
      });
    }
  }
  return out;
}

/* ────────────────────────── تصدير iCal (R5) ────────────────────────── */

function icsDate(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }
  // بالتوقيت العالمي حتى يُفسَّر صحيحاً في أي تقويم
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** الهروب وفق RFC 5545 — الفاصلة والفاصلة المنقوطة والشرطة المائلة وسطر جديد */
function icsEscape(text: string): string {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** طيّ السطور الطويلة عند ٧٥ بايت كما يشترط المعيار */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) parts.push(" " + rest);
  return parts.join("\r\n");
}

export function buildIcs(events: CalendarEvent[], calendarName = "LawyerOS"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LawyerOS//Calendar//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Riyadh",
  ];

  for (const e of events) {
    if (!e.start) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@lawyeros`);
    lines.push(`DTSTAMP:${stamp}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start, true)}`);
      // النهاية حصرية في أحداث اليوم الكامل — نضيف يوماً
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(new Date(e.start), 1).toISOString(), true)}`);
    } else {
      lines.push(`DTSTART:${icsDate(e.start, false)}`);
      lines.push(`DTEND:${icsDate(e.end || e.start, false)}`);
    }
    lines.push(fold(`SUMMARY:${icsEscape(e.title)}`));
    if (e.subtitle) lines.push(fold(`DESCRIPTION:${icsEscape(e.subtitle)}`));
    if (e.status) lines.push(`X-LAWYEROS-STATUS:${icsEscape(e.status)}`);
    lines.push(`CATEGORIES:${icsEscape(SOURCE_LABELS_AR[e.source])}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(events: CalendarEvent[], filename = "lawyeros-calendar.ics"): void {
  const blob = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
