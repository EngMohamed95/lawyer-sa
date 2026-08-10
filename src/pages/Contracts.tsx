/**
 * إدارة العقود — الوثيقة §1.5 ودورة الاعتماد من §ثالثاً.
 *
 * ضابط §خامساً مطبَّق هنا: لا تُشارك العقود مع العميل قبل اعتمادها.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  FileSignature, Plus, Search, ShieldAlert, RefreshCw, AlertTriangle,
  Send, CheckCircle2, XCircle, Eye, Trash2, PenLine, Clock, Scale, X,
} from "lucide-react";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import AddContractModal from "../components/AddContractModal";
import { usePermissions } from "../lib/usePermissions";
import { writeAudit } from "../lib/audit";
import { excludeDeleted, softDelete } from "../lib/softDelete";
import {
  CONTRACT_STATUS_COLORS, CONTRACT_STATUS_LABELS_AR, CONTRACT_TYPE_LABELS_AR,
  canCreateContract, canShareWithClient, canTransition, contractActions,
  daysUntilExpiry, isExpiringSoon,
  type Contract, type ContractStatus,
} from "../lib/contracts";

export default function Contracts() {
  const perms = usePermissions();
  const canView = perms.can("contract.manage");
  // ?caseId= يأتي من ملف القضية — يفتح الصفحة مُرشَّحة على عقود تلك القضية
  const [params, setParams] = useSearchParams();
  const caseFilter = params.get("caseId");

  const [rows, setRows] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ContractStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Contract | null>(null);

  const fetchContracts = async () => {
    setLoading(true);
    setError("");
    try {
      if (!perms.lawyerId) { setRows([]); return; }
      const snap = await getDocs(
        query(collection(db, "contracts"), where("lawyerId", "==", perms.lawyerId)),
      );
      const data = excludeDeleted(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contract, "id">) })),
      ).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setRows(data);
    } catch (err) {
      console.error("Error fetching contracts:", err);
      setError("تعذّر تحميل العقود. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void fetchContracts();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.lawyerId, canView]);

  /** ينقل العقد لحالة جديدة بعد التحقق من آلة الحالات ومن صلاحية الدور */
  const move = async (c: Contract, to: ContractStatus, extra: Record<string, unknown> = {}) => {
    if (!canTransition(c.status, to)) {
      setError(`لا يمكن الانتقال من «${CONTRACT_STATUS_LABELS_AR[c.status]}» إلى «${CONTRACT_STATUS_LABELS_AR[to]}»`);
      return;
    }
    setBusy(c.id);
    setError("");
    try {
      const me = { uid: perms.userId ?? "", name: localStorage.getItem("userName") ?? "", at: new Date().toISOString() };
      const patch: Record<string, unknown> = { status: to, updatedAt: me.at, ...extra };
      if (to === "PENDING_APPROVAL" && c.status === "UNDER_REVIEW") patch.reviewedBy = me;
      if (to === "APPROVED") patch.approvedBy = me;

      await updateDoc(doc(db, "contracts", c.id), patch);
      await writeAudit({
        action: to === "APPROVED" ? "APPROVE" : to === "REJECTED" ? "REJECT" : "UPDATE",
        entity: "contract", entityId: c.id,
        entityLabel: `${c.contractNumber} — ${c.title}`,
        before: { الحالة: CONTRACT_STATUS_LABELS_AR[c.status] },
        after: { الحالة: CONTRACT_STATUS_LABELS_AR[to] },
      });
      await fetchContracts();
    } catch (err) {
      console.error(err);
      setError("تعذّر تحديث حالة العقد.");
    } finally { setBusy(null); }
  };

  const handleReject = async (c: Contract) => {
    const reason = prompt("سبب الرفض (يُسجَّل في سجل التدقيق):");
    if (reason === null) return;
    await move(c, "REJECTED", { rejectionReason: reason || null });
  };

  const handleDelete = async (c: Contract) => {
    if (!confirm(`سينتقل العقد «${c.title}» إلى سلة المحذوفات. متابعة؟`)) return;
    setBusy(c.id);
    try {
      await softDelete({ path: ["contracts", c.id], entity: "contract", label: `${c.contractNumber} — ${c.title}` });
      await fetchContracts();
    } catch (err) {
      console.error(err);
      setError("تعذّر الحذف.");
    } finally { setBusy(null); }
  };

  const toggleShare = async (c: Contract) => {
    if (!c.sharedWithClient && !canShareWithClient(c.status)) {
      setError("لا يمكن مشاركة عقد غير معتمد مع العميل — اعتمده أولاً.");
      return;
    }
    setBusy(c.id);
    try {
      await updateDoc(doc(db, "contracts", c.id), {
        sharedWithClient: !c.sharedWithClient,
        updatedAt: new Date().toISOString(),
      });
      await writeAudit({
        action: "UPDATE", entity: "contract", entityId: c.id,
        entityLabel: `${c.contractNumber} — ${c.title}`,
        after: { "مشاركة مع العميل": !c.sharedWithClient ? "مفعّلة" : "ملغاة" },
      });
      await fetchContracts();
    } catch (err) {
      console.error(err);
      setError("تعذّر تغيير المشاركة.");
    } finally { setBusy(null); }
  };

  const counts = useMemo(() => {
    const m = new Map<ContractStatus, number>();
    rows.forEach((r) => m.set(r.status, (m.get(r.status) ?? 0) + 1));
    return m;
  }, [rows]);

  const expiring = useMemo(() => rows.filter(isExpiringSoon), [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (caseFilter && r.caseId !== caseFilter) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!term) return true;
      return (
        r.title?.toLowerCase().includes(term) ||
        r.contractNumber?.toLowerCase().includes(term) ||
        (r.clientName ?? "").toLowerCase().includes(term) ||
        (r.caseTitle ?? "").toLowerCase().includes(term) ||
        (r.caseNumber ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, statusFilter, search, caseFilter]);

  /** اسم القضية المُرشَّح عليها — من أول عقد مطابق */
  const caseFilterLabel = useMemo(
    () => (caseFilter ? rows.find((r) => r.caseId === caseFilter)?.caseTitle ?? "القضية المحددة" : null),
    [rows, caseFilter],
  );

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center" dir="rtl">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <ShieldAlert size={26} />
        </div>
        <h2 className="text-xl font-bold text-[#133B2E]">لا تملك صلاحية الوصول للعقود</h2>
        <p className="text-sm text-gray-500">راجع مدير المكتب لمنحك الصلاحية.</p>
      </div>
    );
  }

  const currency = localStorage.getItem("sys_currency") || "SAR";

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <AddContractModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={fetchContracts} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">العقود</h1>
          <p className="text-gray-500 mt-1 text-sm">
            إنشاء العقود ومراجعتها واعتمادها ومتابعة تجديدها — {rows.length} عقد
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchContracts} disabled={loading} className="rounded-xl border-gray-200">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
          {canCreateContract(perms.role) && (
            <Button onClick={() => setIsAddOpen(true)} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white shadow-lg">
              <Plus className="ml-2 h-4 w-4" /> عقد جديد
            </Button>
          )}
        </div>
      </div>

      {caseFilter && (
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm">
          <Scale size={16} className="shrink-0" />
          <span>
            معروض فقط عقود القضية: <strong>{caseFilterLabel}</strong>
          </span>
          <Link to={`/app/cases/${caseFilter}`} className="text-xs font-bold underline hover:no-underline">
            فتح ملف القضية
          </Link>
          <button onClick={() => { params.delete("caseId"); setParams(params, { replace: true }); }}
            className="mr-auto flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg hover:bg-indigo-100 transition">
            <X size={13} /> إلغاء الترشيح
          </button>
        </div>
      )}

      {expiring.length > 0 && (
        <div className="flex items-start gap-2 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
          <Clock size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold">{expiring.length} عقد يقترب من الانتهاء</p>
            <p className="text-xs mt-0.5">
              {expiring.slice(0, 3).map((c) => `${c.title} (${daysUntilExpiry(c.endDate)} يوم)`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${statusFilter === "ALL" ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200"}`}>
            الكل ({rows.length})
          </button>
          {[...counts.entries()].map(([s, n]) => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "ALL" : s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${statusFilter === s ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200"}`}>
              {CONTRACT_STATUS_LABELS_AR[s]} ({n})
            </button>
          ))}
          <div className="relative mr-auto">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالرقم أو العنوان أو العميل..."
              className="pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:border-[#133B2E] w-full sm:w-64 bg-white" />
          </div>
        </div>
      )}

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <FileSignature className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-bold text-lg text-[#133B2E]">
            قائمة العقود <span className="text-sm font-normal text-gray-400">({filtered.length})</span>
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-2 text-gray-400">
              <FileSignature size={32} className="text-gray-300" />
              <p className="font-medium text-gray-500">
                {rows.length === 0 ? "لا توجد عقود بعد" : "لا نتائج مطابقة"}
              </p>
              {rows.length === 0 && canCreateContract(perms.role) && (
                <p className="text-xs">اضغط «عقد جديد» لإنشاء أول عقد</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((c) => {
                const a = contractActions(perms.role, c.status);
                const days = daysUntilExpiry(c.endDate);
                return (
                  <li key={c.id} className="p-4 hover:bg-gray-50/50">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-400" dir="ltr">{c.contractNumber}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${CONTRACT_STATUS_COLORS[c.status]}`}>
                            {CONTRACT_STATUS_LABELS_AR[c.status]}
                          </span>
                          {c.sharedWithClient && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">مشارَك مع العميل</span>
                          )}
                          {isExpiringSoon(c) && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">ينتهي خلال {days} يوم</span>
                          )}
                        </div>
                        <p className="font-bold text-[#133B2E] mt-1">{c.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {CONTRACT_TYPE_LABELS_AR[c.type]} · {c.clientName || "بلا عميل"}
                          {c.totalValue ? ` · ${c.totalValue.toLocaleString("ar-EG")} ${currency}` : ""}
                          {c.approvedBy ? ` · اعتمده ${c.approvedBy.name}` : ""}
                        </p>
                        {c.caseId && (
                          <Link to={`/app/cases/${c.caseId}`}
                            className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition">
                            <Scale size={12} />
                            {c.caseNumber ? `${c.caseNumber} — ` : ""}{c.caseTitle || "القضية المرتبطة"}
                          </Link>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-wrap shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => setPreview(c)} className="rounded-xl text-gray-600" title="عرض">
                          <Eye size={15} />
                        </Button>
                        {a.canSubmitForReview && (
                          <Button variant="outline" size="sm" disabled={busy === c.id} onClick={() => move(c, "UNDER_REVIEW")}
                            className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs">
                            <PenLine size={13} className="ml-1" /> إرسال للمراجعة
                          </Button>
                        )}
                        {a.canReview && (
                          <Button variant="outline" size="sm" disabled={busy === c.id} onClick={() => move(c, "PENDING_APPROVAL")}
                            className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50 text-xs">
                            تمت المراجعة
                          </Button>
                        )}
                        {a.canApprove && (
                          <Button variant="outline" size="sm" disabled={busy === c.id} onClick={() => move(c, "APPROVED")}
                            className="rounded-xl border-green-200 text-green-700 hover:bg-green-50 text-xs">
                            <CheckCircle2 size={13} className="ml-1" /> اعتماد
                          </Button>
                        )}
                        {a.canSend && (
                          <Button variant="outline" size="sm" disabled={busy === c.id} onClick={() => move(c, "SENT")}
                            className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 text-xs">
                            <Send size={13} className="ml-1" /> إرسال للعميل
                          </Button>
                        )}
                        {a.canMarkSigned && (
                          <Button variant="outline" size="sm" disabled={busy === c.id} onClick={() => move(c, "SIGNED")}
                            className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs">
                            تم التوقيع
                          </Button>
                        )}
                        {c.status === "SIGNED" && a.canEdit && (
                          <Button variant="outline" size="sm" disabled={busy === c.id} onClick={() => move(c, "ACTIVE")}
                            className="rounded-xl border-green-200 text-green-700 hover:bg-green-50 text-xs">
                            تفعيل
                          </Button>
                        )}
                        {a.canReject && (
                          <Button variant="ghost" size="sm" disabled={busy === c.id} onClick={() => handleReject(c)}
                            className="rounded-xl text-orange-600 hover:bg-orange-50 text-xs">
                            <XCircle size={13} className="ml-1" /> رفض
                          </Button>
                        )}
                        {a.canShare && (
                          <Button variant="ghost" size="sm" disabled={busy === c.id} onClick={() => toggleShare(c)}
                            className="rounded-xl text-blue-600 hover:bg-blue-50 text-xs">
                            {c.sharedWithClient ? "إلغاء المشاركة" : "مشاركة مع العميل"}
                          </Button>
                        )}
                        {a.canDelete && (
                          <Button variant="ghost" size="sm" disabled={busy === c.id} onClick={() => handleDelete(c)}
                            className="rounded-xl text-red-600 hover:bg-red-50" title="حذف العقد">
                            <Trash2 size={15} />
                          </Button>
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

      {preview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl"
          onClick={() => setPreview(null)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b bg-[#133B2E] text-white flex justify-between items-center sticky top-0">
              <div>
                <p className="font-mono text-xs text-[#D4AF37]" dir="ltr">{preview.contractNumber}</p>
                <h2 className="text-xl font-bold">{preview.title}</h2>
              </div>
              <button onClick={() => setPreview(null)} className="p-2 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-full">✕</button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["الحالة", CONTRACT_STATUS_LABELS_AR[preview.status]],
                  ["النوع", CONTRACT_TYPE_LABELS_AR[preview.type]],
                  ["العميل", preview.clientName || "—"],
                  ["الإجمالي", preview.totalValue ? `${preview.totalValue.toLocaleString("ar-EG")} ${preview.currency}` : "—"],
                  ["البداية", preview.startDate || "—"],
                  ["الانتهاء", preview.endDate || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500">{k}</p>
                    <p className="font-bold text-[#133B2E]">{v}</p>
                  </div>
                ))}
              </div>
              {preview.caseId ? (
                <Link to={`/app/cases/${preview.caseId}`} onClick={() => setPreview(null)}
                  className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 hover:bg-indigo-100 transition">
                  <Scale size={16} />
                  <span className="text-sm font-bold">
                    مرتبط بالقضية: {preview.caseNumber ? `${preview.caseNumber} — ` : ""}{preview.caseTitle || "—"}
                  </span>
                  <span className="mr-auto text-xs underline">فتح الملف</span>
                </Link>
              ) : (
                <p className="text-xs text-gray-400 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  هذا العقد غير مرتبط بقضية.
                </p>
              )}
              {preview.reviewedBy && (
                <p className="text-xs text-indigo-700 bg-indigo-50 p-3 rounded-xl">
                  راجعه {preview.reviewedBy.name} في {new Date(preview.reviewedBy.at).toLocaleDateString("ar-EG")}
                </p>
              )}
              {preview.approvedBy && (
                <p className="text-xs text-green-700 bg-green-50 p-3 rounded-xl">
                  اعتمده {preview.approvedBy.name} في {new Date(preview.approvedBy.at).toLocaleDateString("ar-EG")}
                </p>
              )}
              {preview.rejectionReason && (
                <p className="text-xs text-rose-700 bg-rose-50 p-3 rounded-xl">سبب الرفض: {preview.rejectionReason}</p>
              )}
              <div>
                <p className="font-bold text-[#133B2E] mb-2">بنود العقد</p>
                <div className="bg-gray-50 rounded-xl p-4 whitespace-pre-wrap leading-relaxed text-gray-700">
                  {preview.content || "— لم تُكتب البنود بعد —"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
