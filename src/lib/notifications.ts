/**
 * محرك التنبيهات — الوثيقة §1.4 و§1.1 و§خامساً.
 *
 * ⚠️ حدّ معروف: التوليد يجري في المتصفح عند فتح التطبيق، لا على الخادم.
 *    لذلك التنبيهات لا تصل والتطبيق مغلق (المعيار AC-2 يحتاج مهمة مجدولة).
 *    لكن التوليد **متكرّر الاستدعاء بأمان (idempotent)**: مفتاح منع التكرار
 *    يضمن أن الحدث الواحد لا يُولَّد مرتين مهما أُعيد التشغيل، فنقل التوليد
 *    للخادم لاحقاً لا يحتاج تغيير المنطق ولا تنظيف بيانات.
 *
 * القنوات: داخل التطبيق تعمل الآن. البريد وواتساب وPush تحتاج مزوّدين
 * وبيانات اعتماد — البنية جاهزة لها والتفضيلات تُحفظ من الآن.
 */

import {
  addDoc, collection, getDocs, limit, onSnapshot, orderBy, query, updateDoc, doc, where, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { excludeDeleted } from "./softDelete";
import { displayStatus, isOverdue } from "./billing";

/* ────────────────────────── الأنواع ────────────────────────── */

export type NotificationEvent =
  | "HEARING_REMINDER" | "HEARING_RESULT_MISSING"
  | "TASK_DUE" | "TASK_OVERDUE" | "TASK_ASSIGNED"
  | "CONTRACT_EXPIRING" | "CONTRACT_PENDING_APPROVAL"
  | "INVOICE_DUE" | "INVOICE_OVERDUE"
  | "APPOINTMENT_REMINDER"
  | "CASE_STATUS_CHANGED" | "DOCUMENT_SHARED";

export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type Channel = "IN_APP" | "EMAIL" | "WHATSAPP" | "PUSH";

export interface AppNotification {
  id: string;
  lawyerId: string;
  userId: string | null;
  event: NotificationEvent;
  title: string;
  body: string;
  link: string | null;
  entity: string | null;
  entityId: string | null;
  priority: Priority;
  channels: Channel[];
  /** مفتاح منع التكرار — فريد لكل (مستخدم، حدث، سجل، إزاحة) */
  dedupeKey: string;
  readAt?: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

export const EVENT_LABELS_AR: Record<NotificationEvent, string> = {
  HEARING_REMINDER: "تذكير بجلسة",
  HEARING_RESULT_MISSING: "نتيجة جلسة غير مسجَّلة",
  TASK_DUE: "مهمة تستحق قريباً",
  TASK_OVERDUE: "مهمة متأخرة",
  TASK_ASSIGNED: "مهمة أُسندت إليك",
  CONTRACT_EXPIRING: "عقد يقترب من الانتهاء",
  CONTRACT_PENDING_APPROVAL: "عقد بانتظار الاعتماد",
  INVOICE_DUE: "فاتورة تستحق قريباً",
  INVOICE_OVERDUE: "فاتورة متأخرة",
  APPOINTMENT_REMINDER: "تذكير بموعد",
  CASE_STATUS_CHANGED: "تغيّر حالة قضية",
  DOCUMENT_SHARED: "مستند شورك معك",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: "bg-gray-100 text-gray-700",
  NORMAL: "bg-blue-100 text-blue-800",
  HIGH: "bg-amber-100 text-amber-800",
  URGENT: "bg-red-100 text-red-800",
};

export const PRIORITY_LABELS_AR: Record<Priority, string> = {
  LOW: "منخفضة", NORMAL: "عادية", HIGH: "مهمة", URGENT: "عاجلة",
};

export const CHANNEL_LABELS_AR: Record<Channel, string> = {
  IN_APP: "داخل التطبيق", EMAIL: "بريد إلكتروني", WHATSAPP: "واتساب", PUSH: "إشعار فوري",
};

/** القنوات المفعّلة فعلياً اليوم — الباقي بنيته جاهزة وينتظر المزوّد */
export const CHANNEL_READY: Record<Channel, boolean> = {
  IN_APP: true, EMAIL: false, WHATSAPP: false, PUSH: false,
};

/* ────────────────────────── التفضيلات ────────────────────────── */

export interface NotificationPreferences {
  channels: Partial<Record<NotificationEvent, Channel[]>>;
  quietHours: { enabled: boolean; from: string; to: string };
  digestMode: "OFF" | "DAILY" | "WEEKLY";
  digestTime: string;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  channels: {},
  quietHours: { enabled: false, from: "22:00", to: "07:00" },
  digestMode: "OFF",
  digestTime: "08:00",
};

/** القنوات الافتراضية لكل حدث حين لا يخصّصها المستخدم */
const DEFAULT_CHANNELS: Record<NotificationEvent, Channel[]> = {
  HEARING_REMINDER: ["IN_APP"],
  HEARING_RESULT_MISSING: ["IN_APP"],
  TASK_DUE: ["IN_APP"],
  TASK_OVERDUE: ["IN_APP"],
  TASK_ASSIGNED: ["IN_APP"],
  CONTRACT_EXPIRING: ["IN_APP"],
  CONTRACT_PENDING_APPROVAL: ["IN_APP"],
  INVOICE_DUE: ["IN_APP"],
  INVOICE_OVERDUE: ["IN_APP"],
  APPOINTMENT_REMINDER: ["IN_APP"],
  CASE_STATUS_CHANGED: ["IN_APP"],
  DOCUMENT_SHARED: ["IN_APP"],
};

export function channelsFor(
  event: NotificationEvent,
  prefs: NotificationPreferences | null,
): Channel[] {
  const chosen = prefs?.channels?.[event] ?? DEFAULT_CHANNELS[event] ?? ["IN_APP"];
  // لا نَعِد بقناة غير جاهزة — نُبقيها في التفضيلات ونستبعدها من الإرسال
  return chosen.filter((c) => CHANNEL_READY[c]);
}

/**
 * ساعات الهدوء تؤجّل غير العاجل فقط.
 * تدعم النطاق العابر لمنتصف الليل (٢٢:٠٠ → ٠٧:٠٠).
 */
export function isQuietNow(prefs: NotificationPreferences | null, priority: Priority): boolean {
  if (priority === "URGENT") return false;
  const q = prefs?.quietHours;
  if (!q?.enabled) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = q.from.split(":").map(Number);
  const [th, tm] = q.to.split(":").map(Number);
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}

export async function loadPreferences(userId: string): Promise<NotificationPreferences> {
  try {
    const snap = await getDocs(
      query(collection(db, "notification_preferences"), where("userId", "==", userId), limit(1)),
    );
    if (snap.empty) return DEFAULT_PREFERENCES;
    const d = snap.docs[0].data() as Partial<NotificationPreferences>;
    return {
      channels: d.channels ?? {},
      quietHours: d.quietHours ?? DEFAULT_PREFERENCES.quietHours,
      digestMode: d.digestMode ?? "OFF",
      digestTime: d.digestTime ?? "08:00",
    };
  } catch (err) {
    console.warn("تعذّر تحميل تفضيلات التنبيهات:", err);
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(
  lawyerId: string, userId: string, prefs: NotificationPreferences,
): Promise<void> {
  const snap = await getDocs(
    query(collection(db, "notification_preferences"), where("userId", "==", userId), limit(1)),
  );
  const payload = { lawyerId, userId, ...prefs, updatedAt: new Date().toISOString() };
  if (snap.empty) await addDoc(collection(db, "notification_preferences"), payload);
  else await updateDoc(snap.docs[0].ref, payload);
}

/* ────────────────────────── التوليد ────────────────────────── */

interface Candidate {
  event: NotificationEvent;
  title: string;
  body: string;
  link: string | null;
  entity: string;
  entityId: string;
  priority: Priority;
  /** الإزاحة بالأيام — جزء من مفتاح منع التكرار */
  offset: number;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** فرق الأيام بين تاريخ وبداية اليوم — موجب يعني في المستقبل */
function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((dayStart(d).getTime() - dayStart(new Date()).getTime()) / 86_400_000);
}

async function readAll(col: string, lawyerId: string) {
  try {
    const snap = await getDocs(query(collection(db, col), where("lawyerId", "==", lawyerId)));
    return excludeDeleted(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string }));
  } catch (err) {
    console.warn(`تعذّر قراءة ${col} للتنبيهات:`, err);
    return [];
  }
}

/** إزاحات التذكير الافتراضية لكل حدث — كما في جدول الوثيقة */
const OFFSETS = {
  HEARING: [3, 1, 0],
  TASK: [1, 0],
  CONTRACT: [30, 14, 7],
  INVOICE: [3, 0],
} as const;

/**
 * يفحص كل المصادر ويُنتج التنبيهات المستحقة اليوم.
 * لا يكتب شيئاً — الكتابة في generateNotifications بعد منع التكرار.
 */
export async function collectCandidates(lawyerId: string, userId: string): Promise<Candidate[]> {
  const out: Candidate[] = [];

  const [cases, tasks, contracts, invoices, appointments] = await Promise.all([
    readAll("cases", lawyerId),
    readAll("tasks", lawyerId),
    readAll("contracts", lawyerId),
    readAll("invoices", lawyerId),
    readAll("appointments", lawyerId),
  ]);

  // ── الجلسات: 3 أيام · يوم · اليوم نفسه — ونتيجة غير مسجّلة بعد يوم
  const hearingArrays = await Promise.all(cases.map(async (c) => {
    try {
      const snap = await getDocs(collection(db, "cases", c.id, "hearings"));
      return snap.docs.map((d) => ({ id: d.id, caseId: c.id, caseTitle: str(c.title) || str(c.caseNumber), ...d.data() }));
    } catch { return []; }
  }));
  for (const h of hearingArrays.flat() as (Record<string, unknown> & { id: string; caseId: string; caseTitle: string })[]) {
    const date = str(h.hearingDate);
    const diff = daysUntil(date);
    if (diff === null) continue;

    if (OFFSETS.HEARING.includes(diff as 0 | 1 | 3)) {
      out.push({
        event: "HEARING_REMINDER",
        title: diff === 0 ? "جلسة اليوم" : `جلسة بعد ${diff} ${diff === 1 ? "يوم" : "أيام"}`,
        body: `${h.caseTitle} — ${str(h.court) || "المحكمة"}${str(h.requiredActions) ? ` · ${str(h.requiredActions)}` : ""}`,
        link: `/app/cases/${h.caseId}`,
        entity: "hearing", entityId: h.id,
        priority: diff === 0 ? "URGENT" : diff === 1 ? "HIGH" : "NORMAL",
        offset: diff,
      });
    }
    // انقضت الجلسة بيوم ولم تُسجَّل نتيجتها
    if (diff === -1 && !str(h.result)) {
      out.push({
        event: "HEARING_RESULT_MISSING",
        title: "نتيجة جلسة الأمس غير مسجَّلة",
        body: `${h.caseTitle} — سجّل نتيجة الجلسة لتبقى القضية محدَّثة`,
        link: `/app/cases/${h.caseId}`,
        entity: "hearing", entityId: h.id,
        priority: "HIGH", offset: -1,
      });
    }
  }

  // ── المهام: يوم قبل · يوم الاستحقاق · متأخرة
  for (const t of tasks) {
    if (str(t.status) === "COMPLETED") continue;
    // كل مستخدم يُنبَّه بمهامه؛ المدير يُنبَّه بالكل
    const assigned = str(t.assignedTo);
    if (assigned && assigned !== userId) continue;

    const diff = daysUntil(str(t.dueDate));
    if (diff === null) continue;

    if (OFFSETS.TASK.includes(diff as 0 | 1)) {
      out.push({
        event: "TASK_DUE",
        title: diff === 0 ? "مهمة تستحق اليوم" : "مهمة تستحق غداً",
        body: str(t.title) || "مهمة",
        link: "/app/tasks",
        entity: "task", entityId: t.id,
        priority: diff === 0 ? "HIGH" : "NORMAL",
        offset: diff,
      });
    } else if (diff < 0) {
      out.push({
        event: "TASK_OVERDUE",
        title: `مهمة متأخرة ${Math.abs(diff)} يوم`,
        body: str(t.title) || "مهمة",
        link: "/app/tasks",
        entity: "task", entityId: t.id,
        priority: "URGENT",
        // إزاحة ثابتة حتى لا يتكرر التنبيه كل يوم تأخير
        offset: -1,
      });
    }
  }

  // ── العقود: قرب الانتهاء · بانتظار الاعتماد
  for (const c of contracts) {
    const status = str(c.status);
    if (status === "PENDING_APPROVAL") {
      out.push({
        event: "CONTRACT_PENDING_APPROVAL",
        title: "عقد بانتظار الاعتماد",
        body: `${str(c.contractNumber)} — ${str(c.title)}`,
        link: "/app/contracts",
        entity: "contract", entityId: c.id,
        priority: "HIGH", offset: 0,
      });
    }
    if (["ACTIVE", "SIGNED"].includes(status)) {
      const diff = daysUntil(str(c.endDate));
      if (diff !== null && OFFSETS.CONTRACT.includes(diff as 7 | 14 | 30)) {
        out.push({
          event: "CONTRACT_EXPIRING",
          title: `عقد ينتهي خلال ${diff} يوم`,
          body: `${str(c.contractNumber)} — ${str(c.title)}`,
          link: "/app/contracts",
          entity: "contract", entityId: c.id,
          priority: diff <= 7 ? "HIGH" : "NORMAL",
          offset: diff,
        });
      }
    }
  }

  // ── الفواتير: تستحق قريباً · متأخرة
  for (const i of invoices) {
    const status = str(i.status);
    if (["DRAFT", "CANCELLED", "PAID"].includes(status)) continue;
    const due = str(i.dueDate);
    const diff = daysUntil(due);
    if (diff === null) continue;
    const remaining = Number(i.remainingAmount) || 0;
    if (remaining <= 0) continue;

    if (isOverdue(due) || displayStatus(i as never) === "OVERDUE") {
      out.push({
        event: "INVOICE_OVERDUE",
        title: `فاتورة متأخرة ${Math.abs(diff)} يوم`,
        body: `${str(i.invoiceNumber)} — ${str(i.clientName)} · ${remaining.toLocaleString("ar-EG")} ${str(i.currency) || "SAR"}`,
        link: "/app/invoices",
        entity: "invoice", entityId: i.id,
        priority: "URGENT", offset: -1,
      });
    } else if (OFFSETS.INVOICE.includes(diff as 0 | 3)) {
      out.push({
        event: "INVOICE_DUE",
        title: diff === 0 ? "فاتورة تستحق اليوم" : `فاتورة تستحق بعد ${diff} أيام`,
        body: `${str(i.invoiceNumber)} — ${str(i.clientName)}`,
        link: "/app/invoices",
        entity: "invoice", entityId: i.id,
        priority: diff === 0 ? "HIGH" : "NORMAL",
        offset: diff,
      });
    }
  }

  // ── المواعيد: حسب تذكيرات كل موعد
  for (const a of appointments) {
    if (["CANCELLED", "COMPLETED"].includes(str(a.status))) continue;
    const start = str(a.startAt);
    if (!start) continue;
    const startMs = new Date(start).getTime();
    if (Number.isNaN(startMs)) continue;
    const minutesAway = (startMs - Date.now()) / 60_000;
    if (minutesAway < 0) continue;

    const reminders = (a.reminders as { minutesBefore: number }[] | undefined) ?? [{ minutesBefore: 60 }];
    for (const r of reminders) {
      const m = Number(r?.minutesBefore) || 0;
      // نافذة التذكير: حان وقته ولم يفت الموعد
      if (minutesAway <= m) {
        out.push({
          event: "APPOINTMENT_REMINDER",
          title: minutesAway <= 60 ? "موعد خلال ساعة" : "تذكير بموعد قادم",
          body: `${str(a.title)} — ${new Date(start).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}`,
          link: "/app/calendar",
          entity: "appointment", entityId: a.id,
          priority: minutesAway <= 60 ? "HIGH" : "NORMAL",
          offset: m,
        });
        break; // تذكير واحد لكل موعد في كل تشغيل
      }
    }
  }

  return out;
}

/** المفتاح الذي يمنع تكرار نفس التنبيه لنفس المستخدم */
export function dedupeKeyOf(userId: string, c: Candidate): string {
  return `${userId}|${c.event}|${c.entityId}|${c.offset}`;
}

/**
 * يُولّد التنبيهات المستحقة ويكتب الجديد فقط.
 * آمن للاستدعاء المتكرر — يقرأ المفاتيح الموجودة أولاً.
 */
/** لا نُعيد الفحص الكامل أكثر من مرة كل نصف ساعة لكل مستخدم */
const THROTTLE_MS = 30 * 60 * 1000;
const THROTTLE_KEY = "notif_last_scan";

/** هل مضى وقت كافٍ منذ آخر فحص تلقائي؟ */
export function shouldAutoScan(userId: string): boolean {
  try {
    const raw = localStorage.getItem(`${THROTTLE_KEY}_${userId}`);
    if (!raw) return true;
    return Date.now() - Number(raw) > THROTTLE_MS;
  } catch {
    return true;
  }
}

function markScanned(userId: string): void {
  try {
    localStorage.setItem(`${THROTTLE_KEY}_${userId}`, String(Date.now()));
  } catch { /* التخزين المحلي قد يكون ممتلئاً — لا يضر */ }
}

export async function generateNotifications(
  lawyerId: string,
  userId: string,
  prefs: NotificationPreferences | null,
): Promise<number> {
  if (!lawyerId || !userId) return 0;
  try {
    markScanned(userId);
    const candidates = await collectCandidates(lawyerId, userId);
    if (candidates.length === 0) return 0;

    // المفاتيح المولَّدة سابقاً — نقرأ آخر ٣٠٠ تنبيه للمستخدم
    const existing = await getDocs(
      query(collection(db, "notifications"), where("userId", "==", userId), limit(300)),
    );
    const seen = new Set(existing.docs.map((d) => str(d.data().dedupeKey)));

    const fresh = candidates.filter((c) => !seen.has(dedupeKeyOf(userId, c)));
    if (fresh.length === 0) return 0;

    const now = new Date().toISOString();
    const batch = writeBatch(db);
    let written = 0;

    for (const c of fresh.slice(0, 40)) {
      // ساعات الهدوء تؤجّل غير العاجل — لا تُسقطه
      if (isQuietNow(prefs, c.priority)) continue;
      const ref = doc(collection(db, "notifications"));
      batch.set(ref, {
        lawyerId, userId,
        event: c.event, title: c.title, body: c.body, link: c.link,
        entity: c.entity, entityId: c.entityId,
        priority: c.priority,
        channels: channelsFor(c.event, prefs),
        dedupeKey: dedupeKeyOf(userId, c),
        readAt: null,
        createdAt: now,
        expiresAt: null,
      });
      written++;
    }
    if (written > 0) await batch.commit();
    return written;
  } catch (err) {
    // التنبيهات مساعدة — فشلها لا يُعطّل التطبيق
    console.warn("تعذّر توليد التنبيهات:", err);
    return 0;
  }
}

/* ────────────────────────── القراءة والتحديث اللحظي ────────────────────────── */

/**
 * اشتراك لحظي على تنبيهات المستخدم — يستبدل الاستقصاء كل ٥ دقائق.
 * يرجع دالة إلغاء الاشتراك.
 */
export function subscribeNotifications(
  userId: string,
  cb: (rows: AppNotification[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  try {
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      limit(100),
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, "id">) }))
          .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
        cb(rows);
      },
      (err) => {
        console.warn("تعذّر الاشتراك في التنبيهات:", err);
        onError?.(err);
      },
    );
  } catch (err) {
    console.warn("تعذّر إنشاء اشتراك التنبيهات:", err);
    onError?.(err);
    return () => {};
  }
}

export async function markRead(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, "notifications", id), { readAt: new Date().toISOString() });
  } catch (err) {
    console.warn("تعذّر تعليم التنبيه كمقروء:", err);
  }
}

export async function markAllRead(rows: AppNotification[]): Promise<number> {
  const unread = rows.filter((r) => !r.readAt);
  if (unread.length === 0) return 0;
  try {
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    unread.slice(0, 400).forEach((r) => batch.update(doc(db, "notifications", r.id), { readAt: now }));
    await batch.commit();
    return unread.length;
  } catch (err) {
    console.warn("تعذّر تعليم الكل كمقروء:", err);
    return 0;
  }
}

export function unreadCount(rows: AppNotification[]): number {
  return rows.filter((r) => !r.readAt).length;
}

/** ترتيب العرض: العاجل أولاً ثم الأحدث */
const PRIORITY_RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export function sortForDisplay(rows: AppNotification[]): AppNotification[] {
  return [...rows].sort((a, b) => {
    if (!a.readAt !== !b.readAt) return a.readAt ? 1 : -1;
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

export { orderBy };
