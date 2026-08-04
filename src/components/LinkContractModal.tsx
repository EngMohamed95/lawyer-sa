/**
 * ربط عقد موجود مسبقاً بقضية.
 *
 * العقود التي أُنشئت قبل تفعيل الربط لا تحمل caseId، وهذه الشاشة
 * تسمح بإلحاقها بقضيتها دون إعادة إنشائها. الربط يُسجَّل في سجل التدقيق.
 */

import { useEffect, useState } from "react";
import { X, Link2, Search, AlertCircle } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Button } from "./ui/button";
import { writeAudit } from "../lib/audit";
import { contractsOfClient, contractsOfCase } from "../lib/links";
import {
  CONTRACT_STATUS_COLORS, CONTRACT_STATUS_LABELS_AR, CONTRACT_TYPE_LABELS_AR,
  type ContractStatus, type ContractType,
} from "../lib/contracts";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lawyerId: string;
  clientId: string;
  caseId: string;
  caseTitle: string;
  caseNumber?: string | null;
}

type Row = Record<string, unknown> & { id: string };

export default function LinkContractModal({
  isOpen, onClose, onSuccess, lawyerId, clientId, caseId, caseTitle, caseNumber,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen || !lawyerId) return;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        // عقود نفس العميل غير المرتبطة بأي قضية، مع استبعاد ما هو مرتبط بهذه القضية أصلاً
        const [ofClient, linked] = await Promise.all([
          contractsOfClient(lawyerId, clientId),
          contractsOfCase(lawyerId, caseId),
        ]);
        const linkedIds = new Set(linked.map((c) => c.id));
        setRows(ofClient.filter((c) => !c.caseId && !linkedIds.has(c.id)));
      } catch {
        setError("تعذّر تحميل العقود.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, lawyerId, clientId, caseId]);

  if (!isOpen) return null;

  const link = async (c: Row) => {
    setBusy(c.id);
    setError("");
    try {
      await updateDoc(doc(db, "contracts", c.id), {
        caseId,
        caseTitle,
        caseNumber: caseNumber || null,
        updatedAt: new Date().toISOString(),
      });
      await writeAudit({
        action: "UPDATE", entity: "contract", entityId: c.id,
        entityLabel: `${String(c.contractNumber ?? "")} — ${String(c.title ?? "")}`,
        before: { "القضية المرتبطة": "غير مرتبط" },
        after: { "القضية المرتبطة": caseNumber ? `${caseNumber} — ${caseTitle}` : caseTitle },
      });
      setRows((prev) => prev.filter((r) => r.id !== c.id));
      onSuccess();
    } catch {
      setError("تعذّر ربط العقد. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setBusy(null);
    }
  };

  const term = search.trim().toLowerCase();
  const shown = term
    ? rows.filter((r) =>
        String(r.title ?? "").toLowerCase().includes(term) ||
        String(r.contractNumber ?? "").toLowerCase().includes(term))
    : rows;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl"
      onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[88vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-[#133B2E] text-white flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <Link2 size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">ربط عقد موجود</h2>
              <p className="text-xs text-[#D4AF37]">
                عقود هذا العميل غير المرتبطة بأي قضية — اختر ما ينتمي لـ «{caseTitle}»
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          {rows.length > 3 && (
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالرقم أو العنوان..."
                className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#133B2E]" />
            </div>
          )}

          {loading ? (
            <p className="py-10 text-center text-sm text-gray-400">جاري التحميل...</p>
          ) : shown.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400 space-y-1">
              <p className="font-medium text-gray-500">لا توجد عقود قابلة للربط</p>
              <p className="text-xs">كل عقود هذا العميل مرتبطة بقضايا بالفعل، أو لا توجد عقود له بعد.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
              {shown.map((c) => (
                <li key={c.id} className="p-4 flex items-center gap-3 hover:bg-gray-50/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-gray-400" dir="ltr">{String(c.contractNumber ?? "")}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        CONTRACT_STATUS_COLORS[c.status as ContractStatus] ?? "bg-gray-100 text-gray-700"
                      }`}>
                        {CONTRACT_STATUS_LABELS_AR[c.status as ContractStatus] ?? String(c.status ?? "")}
                      </span>
                    </div>
                    <p className="font-bold text-[#133B2E] mt-1 truncate">{String(c.title ?? "عقد")}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {CONTRACT_TYPE_LABELS_AR[c.type as ContractType] ?? String(c.type ?? "")}
                      {Number(c.totalValue) ? ` · ${Number(c.totalValue).toLocaleString("ar-EG")} ${String(c.currency ?? "SAR")}` : ""}
                    </p>
                  </div>
                  <Button size="sm" disabled={busy === c.id} onClick={() => void link(c)}
                    className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white rounded-xl shrink-0">
                    <Link2 size={14} className="ml-1" /> {busy === c.id ? "جارٍ..." : "ربط"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
