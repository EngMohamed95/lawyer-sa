/**
 * سجل التدقيق — من فعل ماذا ومتى.
 * الوثيقة §خامساً: «تسجيل جميع العمليات في سجل تدقيق يوضح المستخدم والتاريخ والإجراء».
 */

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, ScrollText, RefreshCw, Search, ChevronDown, Info } from "lucide-react";
import { collection, getDocs, limit as fsLimit, orderBy, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import RoleBadge from "../components/RoleBadge";
import { usePermissions } from "../lib/usePermissions";
import {
  AUDIT_ACTION_COLORS, AUDIT_ACTION_LABELS_AR, AUDIT_ENTITY_LABELS_AR,
  type AuditAction, type AuditEntity,
} from "../lib/audit";

interface LogRow {
  id: string;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action?: AuditAction;
  entity?: AuditEntity;
  entityId?: string | null;
  entityLabel?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  at?: string;
}

const PAGE_SIZE = 100;

/** embedded: معروضة داخل تبويب في الإعدادات لا كصفحة مستقلة */
export default function AuditLog({ embedded = false }: { embedded?: boolean } = {}) {
  const perms = usePermissions();
  const canView = perms.can("audit.view");

  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [indexUrl, setIndexUrl] = useState("");
  const [actionFilter, setActionFilter] = useState<AuditAction | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    setIndexUrl("");
    try {
      const lawyerId = perms.lawyerId;
      if (!lawyerId) { setRows([]); return; }

      const q = query(
        collection(db, "auditLogs"),
        where("lawyerId", "==", lawyerId),
        orderBy("at", "desc"),
        fsLimit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LogRow, "id">) })));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error fetching audit logs:", err);
      // Firestore يطلب فهرساً مركّباً لأول مرة ويُرفق رابط إنشائه في الرسالة
      const url = message.match(/https:\/\/console\.firebase\.google\.com\S+/)?.[0];
      if (url) {
        setIndexUrl(url);
        setError("يحتاج سجل التدقيق فهرساً مركّباً في Firestore. اضغط الزر أدناه لإنشائه (مرة واحدة).");
      } else {
        setError("تعذّر تحميل سجل التدقيق. تحقق من الاتصال ثم أعد المحاولة.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void fetchLogs();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.lawyerId, canView]);

  const actionsPresent = useMemo(() => {
    const set = new Set<AuditAction>();
    rows.forEach((r) => r.action && set.add(r.action));
    return [...set];
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter !== "ALL" && r.action !== actionFilter) return false;
      if (!term) return true;
      return (
        (r.actorName ?? "").toLowerCase().includes(term) ||
        (r.entityLabel ?? "").toLowerCase().includes(term) ||
        (r.entityId ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, actionFilter, search]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center" dir="rtl">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <ShieldAlert size={26} />
        </div>
        <h2 className="text-xl font-bold text-[#133B2E]">لا تملك صلاحية الاطلاع على سجل التدقيق</h2>
        <p className="text-sm text-gray-500">هذه الصفحة متاحة لمدير المكتب فقط.</p>
      </div>
    );
  }

  const fmt = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${d.toLocaleDateString("ar-EG")} — ${d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          {/* داخل الإعدادات يوجد عنوان الصفحة أصلاً، فلا نكرّره */}
          <h1 className={`font-bold text-[#133B2E] tracking-tight ${embedded ? "text-xl" : "text-3xl"}`}>
            سجل التدقيق
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            كل عملية حساسة في مكتبك — من نفّذها ومتى وماذا تغيّر
          </p>
        </div>
        <Button variant="outline" onClick={fetchLogs} disabled={loading} className="rounded-xl border-gray-200">
          <RefreshCw size={16} className={`ml-2 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      <div className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-100 p-3 rounded-xl">
        <Info size={15} className="shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          السجل غير قابل للتعديل أو الحذف. يعرض آخر {PAGE_SIZE} عملية.
          كلمات المرور والمفاتيح تُقنَّع تلقائياً ولا تُحفظ أبداً.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActionFilter("ALL")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              actionFilter === "ALL" ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            الكل ({rows.length})
          </button>
          {actionsPresent.map((a) => (
            <button
              key={a}
              onClick={() => setActionFilter(actionFilter === a ? "ALL" : a)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                actionFilter === a ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {AUDIT_ACTION_LABELS_AR[a]} ({rows.filter((r) => r.action === a).length})
            </button>
          ))}
          <div className="relative mr-auto">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالمستخدم أو السجل..."
              className="pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:border-[#133B2E] w-full sm:w-64 bg-white"
            />
          </div>
        </div>
      )}

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <ScrollText className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-bold text-lg text-[#133B2E]">
            العمليات <span className="text-sm font-normal text-gray-400">({filtered.length})</span>
          </h2>
        </CardHeader>

        <CardContent className="p-0">
          {error ? (
            <div className="p-8 text-center space-y-4">
              <p className="text-sm text-gray-700 max-w-lg mx-auto leading-relaxed">{error}</p>
              {indexUrl ? (
                <a href={indexUrl} target="_blank" rel="noreferrer"
                  className="inline-block px-6 py-3 bg-[#133B2E] text-[#D4AF37] rounded-2xl font-bold text-sm">
                  إنشاء الفهرس في Firebase
                </a>
              ) : (
                <Button variant="outline" onClick={fetchLogs} className="rounded-xl">إعادة المحاولة</Button>
              )}
            </div>
          ) : loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-2 text-gray-400">
              <ScrollText size={32} className="text-gray-300" />
              <p className="font-medium text-gray-500">
                {rows.length === 0 ? "لا توجد عمليات مسجّلة بعد" : "لا نتائج مطابقة"}
              </p>
              {rows.length === 0 && (
                <p className="text-xs">ستظهر هنا عمليات الدخول وإنشاء المستخدمين وتغيير الصلاحيات والحذف</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((r) => {
                const isOpen = expanded === r.id;
                const hasDetail = !!(r.before || r.after);
                return (
                  <li key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <div className="p-4 flex items-start gap-3">
                      <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${r.action ? AUDIT_ACTION_COLORS[r.action] : "bg-gray-100 text-gray-600"}`}>
                        {r.action ? AUDIT_ACTION_LABELS_AR[r.action] : "—"}
                      </span>

                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm text-[#133B2E]">
                          <span className="font-bold">{r.actorName || "مستخدم غير معروف"}</span>
                          <span className="text-gray-500"> — </span>
                          <span className="text-gray-600">
                            {r.entity ? AUDIT_ENTITY_LABELS_AR[r.entity] : "سجل"}
                            {r.entityLabel ? `: ${r.entityLabel}` : ""}
                          </span>
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <RoleBadge role={r.actorRole} />
                          <span className="text-xs text-gray-400">{fmt(r.at)}</span>
                          {hasDetail && (
                            <button
                              onClick={() => setExpanded(isOpen ? null : r.id)}
                              className="text-xs text-[#D4AF37] hover:underline flex items-center gap-1"
                            >
                              {isOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                              <ChevronDown size={12} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                            </button>
                          )}
                        </div>

                        {isOpen && hasDetail && (
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {r.before && Object.keys(r.before).length > 0 && (
                              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                                <p className="font-bold text-red-800 mb-1">قبل</p>
                                {Object.entries(r.before).map(([k, v]) => (
                                  <p key={k} className="text-red-700 break-all">{k}: {String(v)}</p>
                                ))}
                              </div>
                            )}
                            {r.after && Object.keys(r.after).length > 0 && (
                              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                                <p className="font-bold text-green-800 mb-1">بعد</p>
                                {Object.entries(r.after).map(([k, v]) => (
                                  <p key={k} className="text-green-700 break-all">{k}: {String(v)}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
