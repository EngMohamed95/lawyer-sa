/**
 * أمان ملفات المكتب — روابط المشاركة المؤقتة (مع الإلغاء) وسجل الاطلاع.
 *
 * ملفات المكتب مشفّرة على السيرفر ولا تفتح إلا لأعضائه. العميل يأخذ رابطاً مؤقتاً
 * (من «إرسال عبر واتساب» مثلاً)، والمكتب يقدر يلغيه هنا. السجل لمالك المكتب فقط.
 */

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Link2, Ban, Loader2, Eye, RefreshCw, AlertCircle } from "lucide-react";
import { usePermissions } from "../../lib/usePermissions";
import { listShareLinks, revokeShareLink, fileAccessLog, type ShareInfo, type FileAccessEntry } from "../../lib/files";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" }) : "—");

/** وصف مختصر للجهاز من User-Agent */
function deviceLabel(ua: string | null): string {
  if (!ua) return "—";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /WhatsApp/i.test(ua) ? "WhatsApp" : "";
  return [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

export default function FileSecurityCard() {
  const perms = usePermissions();
  const isOwner = perms.role === "LAWYER" && !!perms.userId && perms.userId === perms.lawyerId;
  const [shares, setShares] = useState<ShareInfo[] | null>(null);
  const [log, setLog] = useState<FileAccessEntry[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, l] = await Promise.all([listShareLinks(), isOwner ? fileAccessLog() : Promise.resolve(null)]);
      setShares(s);
      setLog(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل بيانات أمان الملفات.");
    }
  }, [isOwner]);

  useEffect(() => { void load(); }, [load]);

  const revoke = async (id: string) => {
    if (!confirm("إلغاء هذا الرابط؟ لن يفتح للعميل بعد الآن.")) return;
    setBusyId(id);
    try {
      await revokeShareLink(id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذّر إلغاء الرابط.");
    } finally {
      setBusyId("");
    }
  };

  const visibleShares = (shares || []).filter((s) => showAll || s.active);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-600" /> أمان ملفات المكتب
          </h3>
          <p className="text-xs text-gray-500 mt-1 leading-6">
            ملفات القضايا والمستندات محفوظة مشفّرة، ولا تفتح إلا لأعضاء مكتبك — حتى لو وصل رابطها لشخص آخر.
            العميل يستلم رابطاً مؤقتاً تقدر تلغيه من هنا.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500" title="تحديث">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-ink flex items-center gap-2"><Link2 size={16} /> روابط المشاركة{isOwner ? " (كل المكتب)" : " (روابطك)"}</h4>
          <label className="text-xs text-gray-500 flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> إظهار المنتهية والملغاة
          </label>
        </div>
        {shares === null && !error ? (
          <div className="flex justify-center py-6 text-gray-400"><Loader2 className="animate-spin" size={20} /></div>
        ) : visibleShares.length === 0 ? (
          <p className="text-sm text-gray-400 py-3">لا توجد روابط {showAll ? "" : "سارية "}حالياً.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-right p-2">الملف</th>
                  <th className="text-right p-2">أنشأه</th>
                  <th className="text-right p-2">ينتهي</th>
                  <th className="text-right p-2">مرات الفتح</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {visibleShares.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="p-2">
                      <div className="font-bold text-ink break-all">{s.fileName}</div>
                      {s.note && <div className="text-xs text-gray-500">{s.note}</div>}
                    </td>
                    <td className="p-2 whitespace-nowrap">{s.createdBy}</td>
                    <td className="p-2 whitespace-nowrap">{s.revoked ? <span className="text-red-600">ملغى</span> : s.active ? fmt(s.expiresAt) : <span className="text-gray-400">منتهي</span>}</td>
                    <td className="p-2 whitespace-nowrap">{s.uses}{s.lastUsedAt ? <span className="text-xs text-gray-400"> · آخر فتح {fmt(s.lastUsedAt)}</span> : null}</td>
                    <td className="p-2 text-left">
                      {s.active && (
                        <button type="button" disabled={busyId === s.id} onClick={() => void revoke(s.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg disabled:opacity-50">
                          {busyId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />} إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isOwner && (
        <section className="space-y-2">
          <h4 className="text-sm font-bold text-ink flex items-center gap-2"><Eye size={16} /> سجل الاطلاع على الملفات (آخر 300)</h4>
          {log === null && !error ? (
            <div className="flex justify-center py-6 text-gray-400"><Loader2 className="animate-spin" size={20} /></div>
          ) : !log || log.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">لم يُفتح أي ملف بعد.</p>
          ) : (
            <div className="overflow-x-auto border border-gray-100 rounded-xl max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs sticky top-0">
                  <tr>
                    <th className="text-right p-2">الوقت</th>
                    <th className="text-right p-2">الملف</th>
                    <th className="text-right p-2">من</th>
                    <th className="text-right p-2">الجهاز</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((e, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="p-2 whitespace-nowrap">{fmt(e.at)}</td>
                      <td className="p-2 break-all">{e.fileName}</td>
                      <td className="p-2 whitespace-nowrap">{e.viaShare ? <span className="text-amber-700">رابط مشاركة</span> : e.user || "—"}</td>
                      <td className="p-2 whitespace-nowrap text-xs text-gray-500" title={`${e.ip || ""} ${e.device || ""}`}>{deviceLabel(e.device)}{e.ip ? ` · ${e.ip}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
