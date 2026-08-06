/**
 * سلة المحذوفات — الوثيقة §خامساً:
 * «منع الحذف النهائي واستبداله بالأرشفة أو سلة المحذوفات».
 */

import { useEffect, useMemo, useState } from "react";
import { Trash2, RotateCcw, ShieldAlert, RefreshCw, AlertTriangle, Info } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { usePermissions } from "../lib/usePermissions";
import { RECYCLABLE, purgePermanently, restoreDeleted } from "../lib/softDelete";
import type { AuditEntity } from "../lib/audit";

interface DeletedRow {
  id: string;
  collection: string;
  entity: AuditEntity;
  groupLabel: string;
  title: string;
  deletedAt: string;
  deletedByName?: string | null;
  deleteReason?: string | null;
}

/** embedded: معروضة داخل تبويب في الإعدادات لا كصفحة مستقلة */
export default function RecycleBin({ embedded = false }: { embedded?: boolean } = {}) {
  const perms = usePermissions();
  const canManage = perms.can("recyclebin.manage");

  const [rows, setRows] = useState<DeletedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [group, setGroup] = useState<string>("ALL");

  const fetchDeleted = async () => {
    setLoading(true);
    setError("");
    try {
      const lawyerId = perms.lawyerId;
      if (!lawyerId) { setRows([]); return; }

      const results = await Promise.all(
        RECYCLABLE.map(async (def) => {
          try {
            const snap = await getDocs(
              query(collection(db, def.collection), where("lawyerId", "==", lawyerId)),
            );
            return snap.docs
              .map((d): Record<string, unknown> & { id: string } => ({ id: d.id, ...d.data() }))
              .filter((r) => !!r.deletedAt)
              .map<DeletedRow>((r) => ({
                id: r.id,
                collection: def.collection,
                entity: def.entity,
                groupLabel: def.label,
                title: (r[def.titleField] as string) || "بلا عنوان",
                deletedAt: r.deletedAt as string,
                deletedByName: (r.deletedByName as string) ?? null,
                deleteReason: (r.deleteReason as string) ?? null,
              }));
          } catch (err) {
            console.error(`تعذّر قراءة ${def.collection}:`, err);
            return [];
          }
        }),
      );

      setRows(
        results.flat().sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()),
      );
    } catch (err) {
      console.error(err);
      setError("تعذّر تحميل سلة المحذوفات. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) void fetchDeleted();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.lawyerId, canManage]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.groupLabel, (m.get(r.groupLabel) ?? 0) + 1));
    return m;
  }, [rows]);

  const filtered = group === "ALL" ? rows : rows.filter((r) => r.groupLabel === group);

  const handleRestore = async (row: DeletedRow) => {
    setBusy(row.id);
    try {
      await restoreDeleted({ path: [row.collection, row.id], entity: row.entity, label: row.title });
      await fetchDeleted();
    } catch (err) {
      console.error(err);
      setError("تعذّر الاسترجاع. أعد المحاولة.");
    } finally { setBusy(null); }
  };

  const handlePurge = async (row: DeletedRow) => {
    if (!confirm(`حذف نهائي لا رجعة فيه:\n\n«${row.title}»\n\nمتأكد؟`)) return;
    setBusy(row.id);
    try {
      await purgePermanently({ path: [row.collection, row.id], entity: row.entity, label: row.title });
      await fetchDeleted();
    } catch (err) {
      console.error(err);
      setError("تعذّر الحذف النهائي. أعد المحاولة.");
    } finally { setBusy(null); }
  };

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center" dir="rtl">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <ShieldAlert size={26} />
        </div>
        <h2 className="text-xl font-bold text-[#133B2E]">لا تملك صلاحية سلة المحذوفات</h2>
        <p className="text-sm text-gray-500">هذه الصفحة متاحة لمدير المكتب فقط.</p>
      </div>
    );
  }

  const daysSince = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          {/* داخل الإعدادات يوجد عنوان الصفحة أصلاً، فلا نكرّره بحجم كامل */}
          <h1 className={`font-bold text-[#133B2E] tracking-tight ${embedded ? "text-xl" : "text-3xl"}`}>
            سلة المحذوفات
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            السجلات المحذوفة قابلة للاسترجاع — {rows.length} عنصر
          </p>
        </div>
        <Button variant="outline" onClick={fetchDeleted} disabled={loading} className="rounded-xl border-gray-200">
          <RefreshCw size={16} className={`ml-2 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      <div className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-100 p-3 rounded-xl">
        <Info size={15} className="shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          لا يُحذف شيء نهائياً من النظام تلقائياً. كل حذف يُنقل هنا ويبقى قابلاً للاسترجاع،
          وكل عملية استرجاع أو حذف نهائي تُسجَّل في سجل التدقيق.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setGroup("ALL")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              group === "ALL" ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            الكل ({rows.length})
          </button>
          {[...counts.entries()].map(([label, n]) => (
            <button
              key={label}
              onClick={() => setGroup(group === label ? "ALL" : label)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                group === label ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {label} ({n})
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <Trash2 className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-bold text-lg text-[#133B2E]">
            المحذوفات <span className="text-sm font-normal text-gray-400">({filtered.length})</span>
          </h2>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-2 text-gray-400">
              <Trash2 size={32} className="text-gray-300" />
              <p className="font-medium text-gray-500">
                {rows.length === 0 ? "سلة المحذوفات فارغة" : "لا نتائج في هذا التصنيف"}
              </p>
              {rows.length === 0 && <p className="text-xs">كل شيء في مكانه — لم يُحذف أي سجل</p>}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((row) => (
                <li key={`${row.collection}-${row.id}`} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50/50">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#133B2E] text-sm flex items-center gap-2 flex-wrap">
                      {row.title}
                      <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {row.groupLabel}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      حُذف {daysSince(row.deletedAt) === 0 ? "اليوم" : `منذ ${daysSince(row.deletedAt)} يوماً`}
                      {row.deletedByName ? ` بواسطة ${row.deletedByName}` : ""}
                      {row.deleteReason ? ` — ${row.deleteReason}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline" size="sm"
                      disabled={busy === row.id}
                      onClick={() => handleRestore(row)}
                      className="rounded-xl border-green-200 text-green-700 hover:bg-green-50"
                    >
                      <RotateCcw size={14} className="ml-1" /> استرجاع
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      disabled={busy === row.id}
                      onClick={() => handlePurge(row)}
                      className="rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 size={14} className="ml-1" /> حذف نهائي
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
