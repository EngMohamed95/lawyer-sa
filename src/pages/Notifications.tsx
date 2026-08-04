/**
 * مركز التنبيهات — الوثيقة §1.1 و§1.4.
 * يقرأ من `notifications` بتحديث لحظي (onSnapshot) بدل الاستقصاء الدوري.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Bell, BellOff, CheckCheck, RefreshCw, AlertTriangle, Filter, ExternalLink, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { usePermissions } from "../lib/usePermissions";
import {
  EVENT_LABELS_AR, PRIORITY_COLORS, PRIORITY_LABELS_AR,
  generateNotifications, loadPreferences, markAllRead, markRead,
  sortForDisplay, subscribeNotifications, unreadCount,
  type AppNotification, type NotificationEvent, type Priority,
} from "../lib/notifications";

export default function Notifications() {
  const perms = usePermissions();
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [eventFilter, setEventFilter] = useState<NotificationEvent | "ALL">("ALL");
  const [onlyUnread, setOnlyUnread] = useState(false);

  // اشتراك لحظي — يُحدَّث فوراً عند وصول تنبيه جديد
  useEffect(() => {
    if (!perms.userId) { setLoading(false); return; }
    const unsub = subscribeNotifications(
      perms.userId,
      (list) => { setRows(list); setLoading(false); },
      () => { setError("تعذّر الاشتراك في التنبيهات — قد يحتاج فهرساً في Firestore."); setLoading(false); },
    );
    return unsub;
  }, [perms.userId]);

  const refresh = async () => {
    if (!perms.lawyerId || !perms.userId) return;
    setBusy(true);
    setError("");
    try {
      const prefs = await loadPreferences(perms.userId);
      const n = await generateNotifications(perms.lawyerId, perms.userId, prefs);
      if (n === 0 && rows.length === 0) setError("لا توجد أحداث تستدعي تنبيهاً حالياً.");
    } catch {
      setError("تعذّر فحص التنبيهات.");
    } finally { setBusy(false); }
  };

  const counts = useMemo(() => {
    const m = new Map<NotificationEvent, number>();
    rows.forEach((r) => m.set(r.event, (m.get(r.event) ?? 0) + 1));
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (eventFilter !== "ALL") list = list.filter((r) => r.event === eventFilter);
    if (onlyUnread) list = list.filter((r) => !r.readAt);
    return sortForDisplay(list);
  }, [rows, eventFilter, onlyUnread]);

  const unread = unreadCount(rows);

  const when = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const mins = Math.round((Date.now() - d.getTime()) / 60_000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `قبل ${mins} دقيقة`;
    if (mins < 1440) return `قبل ${Math.floor(mins / 60)} ساعة`;
    return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
  };

  return (
    <div className="space-y-5 font-['Tajawal']" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">التنبيهات</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {rows.length} تنبيه · {unread} غير مقروء
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={busy} className="rounded-xl border-gray-200">
            <RefreshCw size={16} className={busy ? "animate-spin ml-1" : "ml-1"} /> فحص الآن
          </Button>
          {unread > 0 && (
            <Button variant="outline" onClick={() => void markAllRead(rows)}
              className="rounded-xl border-green-200 text-green-700 hover:bg-green-50">
              <CheckCheck size={16} className="ml-1" /> تعليم الكل كمقروء
            </Button>
          )}
          <Link to="/app/settings">
            <Button className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
              إعدادات التنبيهات
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setEventFilter("ALL")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              eventFilter === "ALL" ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200"
            }`}>
            الكل ({rows.length})
          </button>
          {[...counts.entries()].map(([e, n]) => (
            <button key={e} onClick={() => setEventFilter(eventFilter === e ? "ALL" : e)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                eventFilter === e ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200"
              }`}>
              {EVENT_LABELS_AR[e]} ({n})
            </button>
          ))}
          <button onClick={() => setOnlyUnread(!onlyUnread)}
            className={`mr-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              onlyUnread ? "bg-[#D4AF37] text-[#133B2E] border-[#D4AF37]" : "bg-white text-gray-600 border-gray-200"
            }`}>
            <Filter size={13} /> غير المقروء فقط
          </button>
        </div>
      )}

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <Bell className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-bold text-lg text-[#133B2E]">
            القائمة <span className="text-sm font-normal text-gray-400">({filtered.length})</span>
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-2 text-gray-400">
              <BellOff size={32} className="text-gray-300" />
              <p className="font-medium text-gray-500">
                {rows.length === 0 ? "لا تنبيهات — كل شيء تحت السيطرة" : "لا نتائج بهذا الترشيح"}
              </p>
              {rows.length === 0 && (
                <p className="text-xs">اضغط «فحص الآن» لمراجعة الجلسات والمهام والاستحقاقات</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((n) => (
                <li key={n.id} className={`p-4 transition hover:bg-gray-50/60 ${!n.readAt ? "bg-[#D4AF37]/5" : ""}`}>
                  <div className="flex items-start gap-3">
                    {!n.readAt && <span className="w-2 h-2 rounded-full bg-[#D4AF37] shrink-0 mt-2" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[n.priority as Priority]}`}>
                          {PRIORITY_LABELS_AR[n.priority as Priority]}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {EVENT_LABELS_AR[n.event]}
                        </span>
                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock size={11} /> {when(n.createdAt)}
                        </span>
                      </div>
                      <p className={`mt-1 ${!n.readAt ? "font-bold text-[#133B2E]" : "font-medium text-gray-700"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {n.link && (
                        <Link to={n.link} onClick={() => { if (!n.readAt) void markRead(n.id); }}>
                          <Button variant="ghost" size="sm" className="rounded-xl text-indigo-600 hover:bg-indigo-50 text-xs">
                            <ExternalLink size={13} className="ml-1" /> فتح
                          </Button>
                        </Link>
                      )}
                      {!n.readAt && (
                        <Button variant="ghost" size="sm" onClick={() => void markRead(n.id)}
                          className="rounded-xl text-gray-500 hover:bg-gray-100 text-xs" title="تعليم كمقروء">
                          <CheckCheck size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400 leading-relaxed">
        التنبيهات تُفحص عند فتح التطبيق وعند الضغط على «فحص الآن». وصولها والتطبيق مغلق
        (بريد · واتساب · إشعار فوري) يحتاج تفعيل المزوّدين ومهمة مجدولة على الخادم.
      </p>
    </div>
  );
}
