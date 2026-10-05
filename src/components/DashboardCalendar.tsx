/**
 * تقويم لوحة التحكم — شبكة الشهر مع قائمة أحداث اليوم المختار.
 * يعرض الجلسات و«الجلسة القادمة» وطلبات القاضي والمواعيد والمهام والاستحقاقات
 * من المصدر الموحّد نفسه الذي يبني صفحة التقويم الكاملة.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Gavel } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { usePermissions } from "../lib/usePermissions";
import {
  SOURCE_DOT, SOURCE_LABELS_AR, WEEKDAYS_AR,
  addDays, aggregateCalendar, dayKey, endOfMonth, groupByDay, monthGrid, monthLabel,
  startOfDay, startOfMonth, timeLabel, type CalendarEvent,
} from "../lib/calendar";

const dayTitle = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });

export default function DashboardCalendar() {
  const perms = usePermissions();
  const canView = perms.can("appointment.manage");

  const todayKey = dayKey(new Date());
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canView || !perms.lawyerId) { setLoading(false); return; }
    const lawyerId = perms.lawyerId;
    let cancelled = false;
    setLoading(true);

    // مؤجَّل قليلاً حتى تنتهي استعلامات بطاقات الإحصاء أولاً
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await aggregateCalendar(lawyerId, {
            windowStart: addDays(startOfMonth(anchor), -7),
            windowEnd: addDays(endOfMonth(anchor), 45),
          });
          if (!cancelled) setEvents(rows);
        } catch (err) {
          console.warn("تعذّر تحميل تقويم اللوحة:", err);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 1200);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [perms.lawyerId, canView, anchor.getFullYear(), anchor.getMonth()]);

  const byDay = useMemo(() => groupByDay(events), [events]);
  const days = useMemo(() => monthGrid(anchor), [anchor]);
  const selected = byDay.get(selectedKey) ?? [];

  // حين يخلو اليوم المختار: أقرب الأحداث القادمة حتى لا تبقى اللوحة فارغة
  const upcoming = useMemo(() => {
    const from = startOfDay(new Date()).getTime();
    return events.filter((e) => new Date(e.start).getTime() >= from).slice(0, 5);
  }, [events]);

  if (!canView) return null;

  const step = (dir: 1 | -1) => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  const goToday = () => { setAnchor(startOfMonth(new Date())); setSelectedKey(todayKey); };

  return (
    <Card className="overflow-hidden border border-slate-200/80 bg-white shadow-xs rounded-2xl" dir="rtl">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D4AF37] text-[#133B2E] shadow-xs">
              <CalendarDays size={18} />
            </div>
            <CardTitle className="text-lg font-bold text-[#133B2E]">التقويم</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} aria-label="الشهر السابق"
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-[#133B2E]">
              <ChevronRight size={16} />
            </button>
            <span className="min-w-[120px] text-center text-sm font-bold text-[#133B2E]">{monthLabel(anchor)}</span>
            <button onClick={() => step(1)} aria-label="الشهر التالي"
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-[#133B2E]">
              <ChevronLeft size={16} />
            </button>
            <button onClick={goToday}
              className="mr-1 px-3 h-8 rounded-lg border border-slate-200 text-xs font-bold text-[#133B2E] hover:bg-slate-100">
              اليوم
            </button>
            <Link to="/app/calendar"
              className="mr-2 text-xs font-bold text-[#133B2E] hover:text-[#D4AF37] flex items-center gap-1">
              التقويم الكامل <ChevronLeft size={14} />
            </Link>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 grid grid-cols-1 lg:grid-cols-3">
        {/* شبكة الشهر */}
        <div className="lg:col-span-2 border-b lg:border-b-0 lg:border-l border-slate-100">
          <div className="grid grid-cols-7 bg-slate-50/60 border-b border-slate-100">
            {WEEKDAYS_AR.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-bold text-slate-500">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const key = dayKey(d);
              const list = byDay.get(key) ?? [];
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = key === todayKey;
              const isSelected = key === selectedKey;
              const hasHearing = list.some((e) => e.source === "hearing");
              return (
                <button key={key} onClick={() => setSelectedKey(key)}
                  className={`h-16 border-b border-l border-slate-100 p-1.5 flex flex-col items-center gap-1 transition ${
                    isSelected ? "bg-[#133B2E]/5 ring-2 ring-inset ring-[#133B2E]"
                    : inMonth ? "bg-white hover:bg-slate-50" : "bg-slate-50/60 hover:bg-slate-100/60"
                  }`}>
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? "bg-[#133B2E] text-[#D4AF37]"
                    : inMonth ? "text-slate-700" : "text-slate-300"
                  }`}>
                    {d.getDate()}
                  </span>
                  {list.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      {hasHearing && <Gavel size={11} className="text-cyan-600" />}
                      {[...new Set(list.map((e) => e.source))].filter((s) => s !== "hearing").slice(0, 3).map((s) => (
                        <span key={s} className={`w-1.5 h-1.5 rounded-full ${SOURCE_DOT[s]}`} />
                      ))}
                      {list.length > 1 && <span className="text-[9px] text-slate-400 mr-0.5">{list.length}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* أحداث اليوم المختار */}
        <div className="flex flex-col min-h-[240px]">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-[#133B2E]">{selectedKey === todayKey ? "اليوم — " : ""}{dayTitle(selectedKey)}</p>
          </div>
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400">جاري التحميل...</p>
          ) : selected.length > 0 ? (
            <EventList events={selected} />
          ) : (
            <div>
              <p className="px-4 pt-4 pb-2 text-sm text-slate-400">لا أحداث في هذا اليوم</p>
              {upcoming.length > 0 && (
                <>
                  <p className="px-4 pt-2 text-xs font-bold text-slate-500">القادم</p>
                  <EventList events={upcoming} showDate />
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EventList({ events, showDate = false }: { events: CalendarEvent[]; showDate?: boolean }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-y-auto max-h-[340px]">
      {events.map((e) => (
        <li key={e.id}>
          <Link to={e.href || "/app/calendar"} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50/70 transition">
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SOURCE_DOT[e.source]}`} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-[#133B2E] truncate">{e.title}</span>
              {e.subtitle && <span className="block text-xs text-slate-500 line-clamp-2 whitespace-pre-line">{e.subtitle}</span>}
              <span className="block text-[11px] text-slate-400 mt-0.5">
                {SOURCE_LABELS_AR[e.source]}
                {showDate && ` · ${new Date(e.start).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}`}
                {!e.allDay && ` · ${timeLabel(e.start)}`}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
