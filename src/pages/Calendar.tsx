/**
 * التقويم الموحّد — الوثيقة §1.8.
 *
 * يجمع المواعيد والجلسات والمهام والاستحقاقات في عرض واحد.
 * أربعة أوضاع: شهري · أسبوعي · يومي · أجندة — بلا أي مكتبة تقويم خارجية،
 * فالتحكم في RTL والخط العربي يبقى كاملاً.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  CalendarDays, Plus, ShieldAlert, RefreshCw, AlertTriangle,
  ChevronRight, ChevronLeft, Download, Trash2, CheckCircle2, XCircle,
} from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import AddAppointmentModal from "../components/AddAppointmentModal";
import { usePermissions } from "../lib/usePermissions";
import { writeAudit } from "../lib/audit";
import { softDelete } from "../lib/softDelete";
import {
  APPOINTMENT_STATUS_COLORS, APPOINTMENT_STATUS_LABELS_AR, SOURCE_COLORS, SOURCE_DOT,
  SOURCE_LABELS_AR, WEEKDAYS_AR,
  addDays, aggregateCalendar, dayKey, downloadIcs, groupByDay, monthGrid, monthLabel,
  startOfDay, startOfMonth, endOfMonth, startOfWeek, timeLabel,
  type CalendarEvent, type EventSource,
} from "../lib/calendar";

type ViewMode = "month" | "week" | "day" | "agenda";

const VIEW_LABELS: Record<ViewMode, string> = {
  month: "شهري", week: "أسبوعي", day: "يومي", agenda: "أجندة",
};

const ALL_SOURCES: EventSource[] = ["appointment", "hearing", "task", "contract", "invoice"];

export default function Calendar() {
  const perms = usePermissions();
  const canView = perms.can("appointment.manage");
  const canCreate = ["FULL", "ASSIGNED"].includes(perms.scopeOf("appointment.manage"));

  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<ViewMode>("month");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sources, setSources] = useState<EventSource[]>(ALL_SOURCES);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [busy, setBusy] = useState(false);

  /** نافذة أوسع من الشهر المعروض حتى تظهر التكرارات القادمة في الأجندة */
  const windowStart = useMemo(() => addDays(startOfMonth(anchor), -45), [anchor]);
  const windowEnd = useMemo(() => addDays(endOfMonth(anchor), 120), [anchor]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (!perms.lawyerId) { setEvents([]); return; }
      setEvents(await aggregateCalendar(perms.lawyerId, { windowStart, windowEnd }));
    } catch (err) {
      console.error("Error building calendar:", err);
      setError("تعذّر بناء التقويم. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (canView) void load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.lawyerId, canView, anchor.getFullYear(), anchor.getMonth()]);

  const visible = useMemo(
    () => events.filter((e) => sources.includes(e.source)),
    [events, sources],
  );
  const byDay = useMemo(() => groupByDay(visible), [visible]);

  const counts = useMemo(() => {
    const m = new Map<EventSource, number>();
    events.forEach((e) => m.set(e.source, (m.get(e.source) ?? 0) + 1));
    return m;
  }, [events]);

  const toggleSource = (s: EventSource) =>
    setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const step = (dir: 1 | -1) => {
    setAnchor((a) => {
      if (view === "month") return new Date(a.getFullYear(), a.getMonth() + dir, 1);
      if (view === "week") return addDays(a, 7 * dir);
      if (view === "day") return addDays(a, dir);
      return new Date(a.getFullYear(), a.getMonth() + dir, 1);
    });
  };

  const openAdd = (date?: string) => {
    setAddDate(date ?? dayKey(anchor));
    setIsAddOpen(true);
  };

  /** إجراءات الموعد — تعمل على المواعيد فقط لا على الجلسات والمهام */
  const setStatus = async (ev: CalendarEvent, status: "CONFIRMED" | "COMPLETED" | "CANCELLED") => {
    const id = ev.occurrenceOf ?? ev.id;
    setBusy(true);
    try {
      await updateDoc(doc(db, "appointments", id), { status, updatedAt: new Date().toISOString() });
      await writeAudit({
        action: status === "CANCELLED" ? "REJECT" : "UPDATE",
        entity: "appointment", entityId: id, entityLabel: ev.title,
        after: { الحالة: APPOINTMENT_STATUS_LABELS_AR[status] },
      });
      setSelected(null);
      await load();
    } catch (err) {
      console.error(err);
      setError("تعذّر تحديث حالة الموعد.");
    } finally { setBusy(false); }
  };

  const removeAppointment = async (ev: CalendarEvent) => {
    const id = ev.occurrenceOf ?? ev.id;
    if (!confirm(`سينتقل الموعد «${ev.title}» إلى سلة المحذوفات. متابعة؟`)) return;
    setBusy(true);
    try {
      await softDelete({ path: ["appointments", id], entity: "appointment", label: ev.title });
      setSelected(null);
      await load();
    } finally { setBusy(false); }
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center" dir="rtl">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <ShieldAlert size={26} />
        </div>
        <h2 className="text-xl font-bold text-[#133B2E]">لا تملك صلاحية الوصول للتقويم</h2>
        <p className="text-sm text-gray-500">راجع مدير المكتب لمنحك الصلاحية.</p>
      </div>
    );
  }

  const todayKey = dayKey(new Date());

  return (
    <div className="space-y-5 font-['Tajawal']" dir="rtl">
      {isAddOpen && (
        <AddAppointmentModal
          existing={events}
          defaultDate={addDate}
          onClose={() => setIsAddOpen(false)}
          onDone={async () => { setIsAddOpen(false); await load(); }}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">المواعيد والتقويم</h1>
          <p className="text-gray-500 mt-1 text-sm">
            المواعيد والجلسات والمهام والاستحقاقات في مكان واحد — {visible.length} حدث
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading} className="rounded-xl border-gray-200">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
          {visible.length > 0 && (
            <Button variant="outline" onClick={() => downloadIcs(visible)}
              className="rounded-xl border-green-200 text-green-700 hover:bg-green-50" title="تصدير iCal">
              <Download size={16} className="ml-1" /> تصدير
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => openAdd()} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white shadow-lg">
              <Plus className="ml-2 h-4 w-4" /> موعد جديد
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {/* شريط التنقّل والفلاتر */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => step(1)} className="rounded-xl border-gray-200" title="التالي">
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(startOfDay(new Date()))}
            className="rounded-xl border-gray-200 text-xs font-bold">
            اليوم
          </Button>
          <Button variant="outline" size="sm" onClick={() => step(-1)} className="rounded-xl border-gray-200" title="السابق">
            <ChevronRight size={16} />
          </Button>
          <span className="mr-2 font-bold text-[#133B2E]">
            {view === "day"
              ? anchor.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
              : monthLabel(anchor)}
          </span>
        </div>

        <div className="flex gap-1 lg:mr-4">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                view === v ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}>
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 lg:mr-auto">
          {ALL_SOURCES.map((s) => {
            const on = sources.includes(s);
            return (
              <button key={s} onClick={() => toggleSource(s)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition ${
                  on ? "bg-white border-gray-300 text-gray-700" : "bg-gray-50 border-gray-200 text-gray-300 line-through"
                }`}>
                <span className={`w-2 h-2 rounded-full ${on ? SOURCE_DOT[s] : "bg-gray-300"}`} />
                {SOURCE_LABELS_AR[s]} ({counts.get(s) ?? 0})
              </button>
            );
          })}
        </div>
      </div>

      <Card className="shadow-sm border-gray-200 overflow-hidden">
        <CardHeader className="border-b bg-gray-50/50 py-3 flex flex-row items-center gap-2">
          <CalendarDays className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-bold text-[#133B2E]">{VIEW_LABELS[view]}</h2>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">جاري بناء التقويم...</div>
          ) : view === "month" ? (
            <MonthView anchor={anchor} byDay={byDay} todayKey={todayKey}
              onPick={(k) => canCreate && openAdd(k)} onOpen={setSelected} />
          ) : view === "week" ? (
            <WeekView anchor={anchor} byDay={byDay} todayKey={todayKey}
              onPick={(k) => canCreate && openAdd(k)} onOpen={setSelected} />
          ) : view === "day" ? (
            <DayView anchor={anchor} byDay={byDay} onOpen={setSelected} />
          ) : (
            <AgendaView events={visible} onOpen={setSelected} />
          )}
        </CardContent>
      </Card>

      {selected && (
        <EventDetails
          ev={selected} busy={busy}
          canManage={canCreate}
          onClose={() => setSelected(null)}
          onStatus={setStatus}
          onDelete={removeAppointment}
        />
      )}
    </div>
  );
}

/* ────────────────────────── شريحة الحدث ────────────────────────── */

function Chip({ ev, onOpen }: { ev: CalendarEvent; onOpen: (e: CalendarEvent) => void }) {
  return (
    <button onClick={() => onOpen(ev)}
      className={`w-full text-right px-1.5 py-1 rounded-lg border text-[10px] leading-tight truncate hover:opacity-80 transition ${SOURCE_COLORS[ev.source]}`}
      title={`${SOURCE_LABELS_AR[ev.source]} — ${ev.title}`}>
      {!ev.allDay && <span className="opacity-70 ml-1">{timeLabel(ev.start)}</span>}
      {ev.title}
    </button>
  );
}

/* ────────────────────────── العرض الشهري ────────────────────────── */

function MonthView({
  anchor, byDay, todayKey, onPick, onOpen,
}: {
  anchor: Date;
  byDay: Map<string, CalendarEvent[]>;
  todayKey: string;
  onPick: (k: string) => void;
  onOpen: (e: CalendarEvent) => void;
}) {
  const days = monthGrid(anchor);
  const month = anchor.getMonth();

  return (
    <div>
      <div className="grid grid-cols-7 bg-gray-50 border-b">
        {WEEKDAYS_AR.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-bold text-gray-600">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = dayKey(d);
          const list = byDay.get(key) ?? [];
          const inMonth = d.getMonth() === month;
          const isToday = key === todayKey;
          return (
            <div key={key}
              className={`min-h-[104px] border-b border-l border-gray-100 p-1.5 space-y-1 transition ${
                inMonth ? "bg-white" : "bg-gray-50/60"
              } ${isToday ? "ring-2 ring-inset ring-[#D4AF37]" : ""}`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${
                  isToday ? "bg-[#133B2E] text-[#D4AF37] rounded-full w-6 h-6 flex items-center justify-center"
                  : inMonth ? "text-gray-700" : "text-gray-300"
                }`}>
                  {d.getDate()}
                </span>
                <button onClick={() => onPick(key)}
                  className="text-gray-300 hover:text-[#133B2E] transition text-xs" title="إضافة موعد في هذا اليوم">
                  <Plus size={13} />
                </button>
              </div>
              {list.slice(0, 3).map((e) => <Chip key={e.id} ev={e} onOpen={onOpen} />)}
              {list.length > 3 && (
                <p className="text-[10px] text-gray-400 px-1">+{list.length - 3} أخرى</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────── العرض الأسبوعي ────────────────────────── */

function WeekView({
  anchor, byDay, todayKey, onPick, onOpen,
}: {
  anchor: Date;
  byDay: Map<string, CalendarEvent[]>;
  todayKey: string;
  onPick: (k: string) => void;
  onOpen: (e: CalendarEvent) => void;
}) {
  const first = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-7">
      {days.map((d) => {
        const key = dayKey(d);
        const list = byDay.get(key) ?? [];
        const isToday = key === todayKey;
        return (
          <div key={key} className={`border-b sm:border-l border-gray-100 min-h-[260px] p-2 space-y-1.5 ${
            isToday ? "bg-[#D4AF37]/5 ring-2 ring-inset ring-[#D4AF37]" : "bg-white"
          }`}>
            <div className="flex items-center justify-between pb-1 border-b border-gray-100">
              <div>
                <p className="text-[11px] text-gray-500">{WEEKDAYS_AR[(d.getDay() + 1) % 7]}</p>
                <p className={`text-sm font-bold ${isToday ? "text-[#133B2E]" : "text-gray-700"}`}>{d.getDate()}</p>
              </div>
              <button onClick={() => onPick(key)} className="text-gray-300 hover:text-[#133B2E]" title="إضافة موعد">
                <Plus size={14} />
              </button>
            </div>
            {list.length === 0
              ? <p className="text-[10px] text-gray-300 pt-2">لا أحداث</p>
              : list.map((e) => <Chip key={e.id} ev={e} onOpen={onOpen} />)}
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────── العرض اليومي ────────────────────────── */

function DayView({
  anchor, byDay, onOpen,
}: { anchor: Date; byDay: Map<string, CalendarEvent[]>; onOpen: (e: CalendarEvent) => void }) {
  const key = dayKey(anchor);
  const list = byDay.get(key) ?? [];
  const allDay = list.filter((e) => e.allDay);
  const timed = list.filter((e) => !e.allDay);
  const hours = Array.from({ length: 15 }, (_, i) => i + 7); // ٧ صباحاً — ٩ مساءً

  return (
    <div>
      {allDay.length > 0 && (
        <div className="p-3 border-b bg-gray-50/60 space-y-1">
          <p className="text-xs font-bold text-gray-600 mb-1">طوال اليوم</p>
          <div className="flex flex-wrap gap-1.5">
            {allDay.map((e) => (
              <div key={e.id} className="max-w-xs"><Chip ev={e} onOpen={onOpen} /></div>
            ))}
          </div>
        </div>
      )}
      {timed.length === 0 && allDay.length === 0 ? (
        <div className="p-12 text-center text-gray-400 text-sm">لا أحداث في هذا اليوم</div>
      ) : (
        <div>
          {hours.map((h) => {
            const inHour = timed.filter((e) => new Date(e.start).getHours() === h);
            return (
              <div key={h} className="flex border-b border-gray-100 min-h-[52px]">
                <div className="w-16 shrink-0 p-2 text-xs text-gray-400 border-l border-gray-100 text-center">
                  {String(h).padStart(2, "0")}:00
                </div>
                <div className="flex-1 p-1.5 space-y-1">
                  {inHour.map((e) => (
                    <button key={e.id} onClick={() => onOpen(e)}
                      className={`w-full text-right px-2 py-1.5 rounded-xl border text-xs hover:opacity-80 transition ${SOURCE_COLORS[e.source]}`}>
                      <span className="opacity-70 ml-2">{timeLabel(e.start)}–{timeLabel(e.end)}</span>
                      <span className="font-bold">{e.title}</span>
                      {e.subtitle && <span className="block opacity-70 text-[10px] mt-0.5">{e.subtitle}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── الأجندة ────────────────────────── */

function AgendaView({
  events, onOpen,
}: { events: CalendarEvent[]; onOpen: (e: CalendarEvent) => void }) {
  const upcoming = useMemo(() => {
    const from = startOfDay(new Date()).getTime();
    return events.filter((e) => new Date(e.start).getTime() >= from).slice(0, 60);
  }, [events]);

  const grouped = useMemo(() => groupByDay(upcoming), [upcoming]);
  const keys = [...grouped.keys()].sort();

  if (keys.length === 0) {
    return <div className="p-12 text-center text-gray-400 text-sm">لا أحداث قادمة</div>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {keys.map((k) => {
        const d = new Date(`${k}T00:00:00`);
        return (
          <li key={k} className="p-4">
            <p className="text-sm font-bold text-[#133B2E] mb-2">
              {d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <div className="space-y-1.5">
              {(grouped.get(k) ?? []).map((e) => (
                <button key={e.id} onClick={() => onOpen(e)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50/70 transition text-right">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${SOURCE_DOT[e.source]}`} />
                  <span className="text-xs text-gray-400 shrink-0 w-16">
                    {e.allDay ? "طوال اليوم" : timeLabel(e.start)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-[#133B2E] truncate">{e.title}</span>
                    {e.subtitle && <span className="block text-xs text-gray-500 truncate">{e.subtitle}</span>}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
                    {SOURCE_LABELS_AR[e.source]}
                  </span>
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ────────────────────────── تفاصيل الحدث ────────────────────────── */

function EventDetails({
  ev, busy, canManage, onClose, onStatus, onDelete,
}: {
  ev: CalendarEvent;
  busy: boolean;
  canManage: boolean;
  onClose: () => void;
  onStatus: (e: CalendarEvent, s: "CONFIRMED" | "COMPLETED" | "CANCELLED") => void;
  onDelete: (e: CalendarEvent) => void;
}) {
  const isAppointment = ev.source === "appointment";
  const d = new Date(ev.start);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-[#133B2E] text-white">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <p className="text-xs text-[#D4AF37] font-bold">{SOURCE_LABELS_AR[ev.source]}</p>
              <h2 className="text-xl font-bold mt-0.5">{ev.title}</h2>
            </div>
            <button onClick={onClose} className="p-2 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-full shrink-0">
              <XCircle size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">التاريخ</p>
              <p className="font-bold text-[#133B2E]">
                {d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">الوقت</p>
              <p className="font-bold text-[#133B2E]">
                {ev.allDay ? "طوال اليوم" : `${timeLabel(ev.start)} – ${timeLabel(ev.end)}`}
              </p>
            </div>
          </div>

          {ev.subtitle && (
            <p className="text-gray-600 bg-gray-50 rounded-xl p-3 text-xs leading-relaxed">{ev.subtitle}</p>
          )}

          {ev.status && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">الحالة:</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                APPOINTMENT_STATUS_COLORS[ev.status as keyof typeof APPOINTMENT_STATUS_COLORS] ?? "bg-gray-100 text-gray-700"
              }`}>
                {APPOINTMENT_STATUS_LABELS_AR[ev.status as keyof typeof APPOINTMENT_STATUS_LABELS_AR] ?? ev.status}
              </span>
              {ev.occurrenceOf && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  مثيل متكرر
                </span>
              )}
            </div>
          )}

          {ev.href && (
            <Link to={ev.href} onClick={onClose}
              className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 hover:bg-indigo-100 transition">
              <span className="text-sm font-bold">فتح السجل المرتبط</span>
              <ChevronLeft size={16} />
            </Link>
          )}

          {isAppointment && canManage && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {ev.occurrenceOf ? (
                <p className="text-xs text-gray-500">
                  هذا مثيل مولَّد من موعد متكرر — الإجراءات تُطبَّق على الموعد الأصلي كاملاً.
                </p>
              ) : null}
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onStatus(ev, "CONFIRMED")}
                className="rounded-xl border-green-200 text-green-700 hover:bg-green-50 text-xs">
                <CheckCircle2 size={13} className="ml-1" /> تأكيد
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onStatus(ev, "COMPLETED")}
                className="rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50 text-xs">
                تم
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onStatus(ev, "CANCELLED")}
                className="rounded-xl text-orange-600 hover:bg-orange-50 text-xs">
                إلغاء الموعد
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDelete(ev)}
                className="rounded-xl text-red-600 hover:bg-red-50 mr-auto" title="حذف">
                <Trash2 size={14} />
              </Button>
            </div>
          )}

          {!isAppointment && (
            <p className="text-xs text-gray-400 pt-2 border-t">
              هذا الحدث مصدره {SOURCE_LABELS_AR[ev.source]} — يُدار من صفحته الأصلية.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
