/**
 * بطاقة «أجندة اليوم» في لوحة التحكم — الوثيقة §1.8 (T012).
 * إضافة فوق القائم بلا حذف أي بطاقة موجودة.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarDays, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { usePermissions } from "../lib/usePermissions";
import {
  SOURCE_DOT, SOURCE_LABELS_AR, addDays, aggregateCalendar, dayKey,
  startOfDay, timeLabel, type CalendarEvent,
} from "../lib/calendar";

export default function TodayAgenda() {
  const perms = usePermissions();
  const canView = perms.can("appointment.manage");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canView || !perms.lawyerId) { setLoading(false); return; }
    const lawyerId = perms.lawyerId;
    const from = startOfDay(new Date());
    let cancelled = false;

    // نؤجّل قليلاً حتى تنتهي استعلامات اللوحة الأساسية أولاً، فلا تتزاحم
    // قراءات الجلسات (استعلام لكل قضية) مع بطاقات الإحصاءات.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await aggregateCalendar(lawyerId, {
            windowStart: from,
            windowEnd: addDays(from, 8),
          });
          if (!cancelled) setEvents(rows);
        } catch (err) {
          console.warn("تعذّر تحميل أجندة اليوم:", err);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 1200);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [perms.lawyerId, canView]);

  const { today, soon } = useMemo(() => {
    const key = dayKey(new Date());
    const from = startOfDay(new Date()).getTime();
    const limit = addDays(startOfDay(new Date()), 8).getTime();
    const upcoming = events.filter((e) => {
      const t = new Date(e.start).getTime();
      return t >= from && t < limit;
    });
    return {
      today: upcoming.filter((e) => dayKey(e.start) === key),
      soon: upcoming.filter((e) => dayKey(e.start) !== key).slice(0, 5),
    };
  }, [events]);

  if (!canView) return null;

  return (
    <Card className="overflow-hidden border border-slate-200/80 bg-white shadow-xs rounded-2xl" dir="rtl">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37] text-[#133B2E] shadow-xs">
              <CalendarDays size={20} />
            </div>
            <CardTitle className="text-xl font-bold text-[#133B2E]">أجندة اليوم</CardTitle>
          </div>
          <Link to="/app/calendar" className="text-xs font-bold text-[#133B2E] hover:text-[#D4AF37] flex items-center gap-1">
            التقويم الكامل <ChevronLeft size={14} />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">جاري التحميل...</div>
        ) : today.length === 0 && soon.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">لا مواعيد اليوم ولا هذا الأسبوع</div>
        ) : (
          <div>
            {today.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {today.map((e) => (
                  <li key={e.id}>
                    <Link to={e.href || "/app/calendar"}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/70 transition">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${SOURCE_DOT[e.source]}`} />
                      <span className="text-xs text-slate-400 w-16 shrink-0">
                        {e.allDay ? "اليوم" : timeLabel(e.start)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-[#133B2E] truncate">{e.title}</span>
                        {e.subtitle && <span className="block text-xs text-slate-500 truncate">{e.subtitle}</span>}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                        {SOURCE_LABELS_AR[e.source]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-slate-400">لا مواعيد اليوم</p>
            )}

            {soon.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50/40">
                <p className="px-5 pt-3 pb-1 text-xs font-bold text-slate-500">خلال الأيام القادمة</p>
                <ul className="pb-2">
                  {soon.map((e) => (
                    <li key={e.id}>
                      <Link to={e.href || "/app/calendar"}
                        className="flex items-center gap-3 px-5 py-2 hover:bg-white/70 transition">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SOURCE_DOT[e.source]}`} />
                        <span className="text-[11px] text-slate-400 w-24 shrink-0">
                          {new Date(e.start).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                        <span className="flex-1 text-xs text-slate-700 truncate">{e.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
