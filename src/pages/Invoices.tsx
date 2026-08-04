/**
 * الفواتير — الوثيقة §1.9.
 *
 * ضابط مطبَّق: لا تُشارك فاتورة مع العميل قبل اعتمادها.
 * تسجيل سند قبض هنا يُنقص المتبقي ويُحدّث الحالة تلقائياً (AC-5).
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Receipt, Plus, Search, ShieldAlert, RefreshCw, AlertTriangle, Scale, X,
  Send, CheckCircle2, XCircle, Eye, Trash2, Banknote, Clock,
} from "lucide-react";
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import AddInvoiceModal from "../components/AddInvoiceModal";
import { usePermissions } from "../lib/usePermissions";
import { writeAudit } from "../lib/audit";
import { excludeDeleted, softDelete } from "../lib/softDelete";
import {
  INVOICE_STATUS_COLORS, INVOICE_STATUS_LABELS_AR, PAYMENT_METHOD_LABELS_AR,
  canCreateInvoice, canShareWithClient, canTransition, displayStatus,
  invoiceActions, nextNumber, statusAfterPayment, daysOverdue,
  type Invoice, type InvoiceStatus, type PaymentMethod,
} from "../lib/billing";

export default function Invoices() {
  const perms = usePermissions();
  const canView = perms.can("invoice.manage");
  const [params, setParams] = useSearchParams();
  const caseFilter = params.get("caseId");

  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [payFor, setPayFor] = useState<Invoice | null>(null);

  const currency = localStorage.getItem("sys_currency") || "SAR";
  const money = (n: number) =>
    (Number(n) || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fetchInvoices = async () => {
    setLoading(true);
    setError("");
    try {
      if (!perms.lawyerId) { setRows([]); return; }
      const snap = await getDocs(
        query(collection(db, "invoices"), where("lawyerId", "==", perms.lawyerId)),
      );
      const data = excludeDeleted(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Invoice, "id">) })),
      ).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setRows(data);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      setError("تعذّر تحميل الفواتير. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void fetchInvoices();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.lawyerId, canView]);

  /** ينقل الفاتورة لحالة جديدة بعد التحقق من آلة الحالات */
  const move = async (inv: Invoice, to: InvoiceStatus, extra: Record<string, unknown> = {}) => {
    if (!canTransition(inv.status, to)) {
      setError(`لا يمكن الانتقال من «${INVOICE_STATUS_LABELS_AR[inv.status]}» إلى «${INVOICE_STATUS_LABELS_AR[to]}»`);
      return;
    }
    setBusy(inv.id);
    setError("");
    try {
      const at = new Date().toISOString();
      const patch: Record<string, unknown> = { status: to, updatedAt: at, ...extra };
      if (to === "APPROVED") {
        patch.approvedBy = { uid: perms.userId ?? "", name: localStorage.getItem("userName") ?? "", at };
      }
      await updateDoc(doc(db, "invoices", inv.id), patch);
      await writeAudit({
        action: to === "APPROVED" ? "APPROVE" : to === "CANCELLED" ? "REJECT" : "UPDATE",
        entity: "invoice", entityId: inv.id,
        entityLabel: `${inv.invoiceNumber} — ${inv.clientName ?? ""}`,
        before: { الحالة: INVOICE_STATUS_LABELS_AR[inv.status] },
        after: { الحالة: INVOICE_STATUS_LABELS_AR[to] },
      });
      await fetchInvoices();
    } catch (err) {
      console.error(err);
      setError("تعذّر تحديث حالة الفاتورة.");
    } finally { setBusy(null); }
  };

  const handleCancel = async (inv: Invoice) => {
    const reason = prompt("سبب الإلغاء (يُسجَّل في سجل التدقيق):");
    if (reason === null) return;
    await move(inv, "CANCELLED", { cancelReason: reason || null });
  };

  const handleDelete = async (inv: Invoice) => {
    if (!confirm(`ستنتقل الفاتورة «${inv.invoiceNumber}» إلى سلة المحذوفات. متابعة؟`)) return;
    setBusy(inv.id);
    try {
      await softDelete({
        path: ["invoices", inv.id], entity: "invoice",
        label: `${inv.invoiceNumber} — ${inv.clientName ?? ""}`,
      });
      await fetchInvoices();
    } catch (err) {
      console.error(err);
      setError("تعذّر الحذف.");
    } finally { setBusy(null); }
  };

  const toggleShare = async (inv: Invoice) => {
    if (!inv.sharedWithClient && !canShareWithClient(inv.status)) {
      setError("لا يمكن مشاركة فاتورة غير معتمدة مع العميل — اعتمدها أولاً.");
      return;
    }
    setBusy(inv.id);
    try {
      await updateDoc(doc(db, "invoices", inv.id), {
        sharedWithClient: !inv.sharedWithClient,
        updatedAt: new Date().toISOString(),
      });
      await fetchInvoices();
    } catch (err) {
      console.error(err);
      setError("تعذّر تغيير المشاركة.");
    } finally { setBusy(null); }
  };

  const counts = useMemo(() => {
    const m = new Map<InvoiceStatus, number>();
    rows.forEach((r) => {
      const s = displayStatus(r);
      m.set(s, (m.get(s) ?? 0) + 1);
    });
    return m;
  }, [rows]);

  const summary = useMemo(() => {
    const live = rows.filter((r) => r.status !== "CANCELLED" && r.status !== "DRAFT");
    const billed = live.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const collected = live.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0);
    const outstanding = live.reduce((s, r) => s + (Number(r.remainingAmount) || 0), 0);
    const overdue = live
      .filter((r) => displayStatus(r) === "OVERDUE")
      .reduce((s, r) => s + (Number(r.remainingAmount) || 0), 0);
    return { billed, collected, outstanding, overdue };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (caseFilter && r.caseId !== caseFilter) return false;
      if (statusFilter !== "ALL" && displayStatus(r) !== statusFilter) return false;
      if (!term) return true;
      return (
        r.invoiceNumber?.toLowerCase().includes(term) ||
        (r.clientName ?? "").toLowerCase().includes(term) ||
        (r.caseTitle ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, statusFilter, search, caseFilter]);

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
        <h2 className="text-xl font-bold text-[#133B2E]">لا تملك صلاحية الوصول للفواتير</h2>
        <p className="text-sm text-gray-500">راجع مدير المكتب لمنحك الصلاحية.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <AddInvoiceModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={fetchInvoices} />
      {payFor && (
        <RecordPaymentModal
          invoice={payFor}
          onClose={() => setPayFor(null)}
          onDone={async () => { setPayFor(null); await fetchInvoices(); }}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">الفواتير</h1>
          <p className="text-gray-500 mt-1 text-sm">
            إصدار الفواتير واعتمادها ومتابعة تحصيلها — {rows.length} فاتورة
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchInvoices} disabled={loading} className="rounded-xl border-gray-200">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
          {canCreateInvoice(perms.role) && (
            <Button onClick={() => setIsAddOpen(true)} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white shadow-lg">
              <Plus className="ml-2 h-4 w-4" /> فاتورة جديدة
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["إجمالي المفوتر", summary.billed, "text-[#133B2E]"],
          ["المحصَّل", summary.collected, "text-green-600"],
          ["المستحق", summary.outstanding, "text-amber-600"],
          ["المتأخر", summary.overdue, "text-red-600"],
        ].map(([label, value, cls]) => (
          <div key={label as string} className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">{label as string}</p>
            <p className={`text-xl font-black mt-1 ${cls as string}`}>
              {money(value as number)} <span className="text-xs font-normal text-gray-400">{currency}</span>
            </p>
          </div>
        ))}
      </div>

      {caseFilter && (
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm">
          <Scale size={16} className="shrink-0" />
          <span>معروض فقط فواتير القضية: <strong>{caseFilterLabel}</strong></span>
          <Link to={`/app/cases/${caseFilter}`} className="text-xs font-bold underline hover:no-underline">
            فتح ملف القضية
          </Link>
          <button onClick={() => { params.delete("caseId"); setParams(params, { replace: true }); }}
            className="mr-auto flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg hover:bg-indigo-100">
            <X size={13} /> إلغاء الترشيح
          </button>
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
              {INVOICE_STATUS_LABELS_AR[s]} ({n})
            </button>
          ))}
          <div className="relative mr-auto">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالرقم أو العميل أو القضية..."
              className="pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:border-[#133B2E] w-full sm:w-64 bg-white" />
          </div>
        </div>
      )}

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <Receipt className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-bold text-lg text-[#133B2E]">
            قائمة الفواتير <span className="text-sm font-normal text-gray-400">({filtered.length})</span>
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-2 text-gray-400">
              <Receipt size={32} className="text-gray-300" />
              <p className="font-medium text-gray-500">
                {rows.length === 0 ? "لا توجد فواتير بعد" : "لا نتائج مطابقة"}
              </p>
              {rows.length === 0 && canCreateInvoice(perms.role) && (
                <p className="text-xs">اضغط «فاتورة جديدة» لإصدار أول فاتورة</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((inv) => {
                const shown = displayStatus(inv);
                const a = invoiceActions(perms.role, shown);
                const late = daysOverdue(inv.dueDate);
                return (
                  <li key={inv.id} className="p-4 hover:bg-gray-50/50">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-400" dir="ltr">{inv.invoiceNumber}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${INVOICE_STATUS_COLORS[shown]}`}>
                            {INVOICE_STATUS_LABELS_AR[shown]}
                          </span>
                          {inv.sharedWithClient && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">مشارَكة مع العميل</span>
                          )}
                          {shown === "OVERDUE" && late > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                              متأخرة {late} يوم
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-[#133B2E] mt-1">{inv.clientName || "بلا عميل"}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {money(inv.total)} {inv.currency || currency}
                          {inv.paidAmount > 0 ? ` · محصَّل ${money(inv.paidAmount)}` : ""}
                          {inv.remainingAmount > 0 ? ` · متبقٍ ${money(inv.remainingAmount)}` : ""}
                          {inv.dueDate ? ` · تستحق ${inv.dueDate}` : ""}
                        </p>
                        {inv.caseId && (
                          <Link to={`/app/cases/${inv.caseId}`}
                            className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition">
                            <Scale size={12} />
                            {inv.caseNumber ? `${inv.caseNumber} — ` : ""}{inv.caseTitle || "القضية المرتبطة"}
                          </Link>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-wrap shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => setPreview(inv)} className="rounded-xl text-gray-600" title="عرض">
                          <Eye size={15} />
                        </Button>
                        {a.canSubmitForApproval && (
                          <Button variant="outline" size="sm" disabled={busy === inv.id} onClick={() => move(inv, "PENDING_APPROVAL")}
                            className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50 text-xs">
                            إرسال للاعتماد
                          </Button>
                        )}
                        {a.canApprove && (
                          <Button variant="outline" size="sm" disabled={busy === inv.id} onClick={() => move(inv, "APPROVED")}
                            className="rounded-xl border-green-200 text-green-700 hover:bg-green-50 text-xs">
                            <CheckCircle2 size={13} className="ml-1" /> اعتماد
                          </Button>
                        )}
                        {a.canSend && (
                          <Button variant="outline" size="sm" disabled={busy === inv.id} onClick={() => move(inv, "SENT")}
                            className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 text-xs">
                            <Send size={13} className="ml-1" /> إرسال للعميل
                          </Button>
                        )}
                        {a.canRecordPayment && (
                          <Button variant="outline" size="sm" disabled={busy === inv.id} onClick={() => setPayFor(inv)}
                            className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs">
                            <Banknote size={13} className="ml-1" /> سند قبض
                          </Button>
                        )}
                        {a.canShare && (
                          <Button variant="ghost" size="sm" disabled={busy === inv.id} onClick={() => toggleShare(inv)}
                            className="rounded-xl text-blue-600 hover:bg-blue-50 text-xs">
                            {inv.sharedWithClient ? "إلغاء المشاركة" : "مشاركة"}
                          </Button>
                        )}
                        {a.canCancel && (
                          <Button variant="ghost" size="sm" disabled={busy === inv.id} onClick={() => handleCancel(inv)}
                            className="rounded-xl text-orange-600 hover:bg-orange-50 text-xs" title="إلغاء الفاتورة">
                            <XCircle size={13} className="ml-1" /> إلغاء
                          </Button>
                        )}
                        {a.canDelete && (
                          <Button variant="ghost" size="sm" disabled={busy === inv.id} onClick={() => handleDelete(inv)}
                            className="rounded-xl text-red-600 hover:bg-red-50" title="حذف الفاتورة">
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
                <p className="font-mono text-xs text-[#D4AF37]" dir="ltr">{preview.invoiceNumber}</p>
                <h2 className="text-xl font-bold">{preview.clientName || "—"}</h2>
              </div>
              <button onClick={() => setPreview(null)} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["الحالة", INVOICE_STATUS_LABELS_AR[displayStatus(preview)]],
                  ["تاريخ الإصدار", preview.issueDate || "—"],
                  ["تاريخ الاستحقاق", preview.dueDate || "—"],
                  ["المحصَّل", `${money(preview.paidAmount)} ${preview.currency}`],
                  ["المتبقي", `${money(preview.remainingAmount)} ${preview.currency}`],
                  ["الإجمالي", `${money(preview.total)} ${preview.currency}`],
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
                    مرتبطة بالقضية: {preview.caseNumber ? `${preview.caseNumber} — ` : ""}{preview.caseTitle || "—"}
                  </span>
                  <span className="mr-auto text-xs underline">فتح الملف</span>
                </Link>
              ) : (
                <p className="text-xs text-gray-400 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  هذه الفاتورة غير مرتبطة بقضية.
                </p>
              )}

              {preview.approvedBy && (
                <p className="text-xs text-green-700 bg-green-50 p-3 rounded-xl">
                  اعتمدها {preview.approvedBy.name} في {new Date(preview.approvedBy.at).toLocaleDateString("ar-EG")}
                </p>
              )}

              <div>
                <p className="font-bold text-[#133B2E] mb-2">البنود</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-xs font-bold text-gray-600">
                    <div className="col-span-6">الوصف</div>
                    <div className="col-span-2">الكمية</div>
                    <div className="col-span-2">السعر</div>
                    <div className="col-span-2">المبلغ</div>
                  </div>
                  {(preview.items ?? []).map((it, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-gray-100 text-xs">
                      <div className="col-span-6">
                        {it.description}
                        {!it.taxable && <span className="mr-1 text-[10px] text-amber-700 bg-amber-50 px-1 rounded">معفى</span>}
                      </div>
                      <div className="col-span-2">{it.quantity}</div>
                      <div className="col-span-2">{money(it.unitPrice)}</div>
                      <div className="col-span-2 font-bold">{money(it.amount)}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">المجموع</span><span className="font-bold">{money(preview.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">الضريبة ({preview.vatRate}%)</span><span className="font-bold">{money(preview.vatAmount)}</span></div>
                  <div className="flex justify-between text-sm pt-1 border-t"><span className="font-bold text-[#133B2E]">الإجمالي</span><span className="font-black text-[#D4AF37]">{money(preview.total)} {preview.currency}</span></div>
                </div>
              </div>

              {preview.zatca?.qrCode && (
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-xs font-bold text-gray-600 mb-1">الفوترة الإلكترونية (ZATCA)</p>
                  <p className="text-[10px] font-mono text-gray-400 break-all" dir="ltr">{preview.zatca.qrCode.slice(0, 90)}…</p>
                </div>
              )}

              {preview.notes && (
                <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded-xl">{preview.notes}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── سند القبض ────────────────────────── */

function RecordPaymentModal({
  invoice, onClose, onDone,
}: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const perms = usePermissions();
  const [amount, setAmount] = useState(String(invoice.remainingAmount ?? 0));
  const [method, setMethod] = useState<PaymentMethod>("BANK");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const money = (n: number) =>
    (Number(n) || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) { setErr("أدخل مبلغاً أكبر من صفر"); return; }
    if (value > Number(invoice.remainingAmount) + 0.001) {
      setErr(`المبلغ يتجاوز المتبقي (${money(invoice.remainingAmount)})`);
      return;
    }
    if (!perms.lawyerId) { setErr("تعذّر تحديد المكتب."); return; }

    setBusy(true);
    setErr("");
    try {
      const lawyerId = perms.lawyerId;
      const receiptNumber = await nextNumber(lawyerId, "receipts");
      const now = new Date().toISOString();

      await addDoc(collection(db, "receipts"), {
        lawyerId,
        receiptNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId,
        clientName: invoice.clientName ?? null,
        caseId: invoice.caseId ?? null,
        caseTitle: invoice.caseTitle ?? null,
        amount: value,
        currency: invoice.currency,
        method,
        reference: reference || null,
        date,
        receivedBy: localStorage.getItem("userName") ?? null,
        notes: notes || null,
        paymentId: null,
        createdAt: now,
        createdBy: perms.userId,
        deletedAt: null,
      });

      const paidAmount = Math.round((Number(invoice.paidAmount) + value) * 100) / 100;
      const remainingAmount = Math.round((Number(invoice.total) - paidAmount) * 100) / 100;
      const nextStatus = statusAfterPayment(invoice.status, invoice.total, paidAmount, invoice.dueDate);

      await updateDoc(doc(db, "invoices", invoice.id), {
        paidAmount, remainingAmount, status: nextStatus, updatedAt: now,
      });

      await writeAudit({
        action: "CREATE", entity: "invoice", entityId: invoice.id,
        entityLabel: `${receiptNumber} — سند قبض على ${invoice.invoiceNumber}`,
        after: {
          المبلغ: value,
          الطريقة: PAYMENT_METHOD_LABELS_AR[method],
          "المتبقي بعد السداد": remainingAmount,
          الحالة: INVOICE_STATUS_LABELS_AR[nextStatus],
        },
      });

      onDone();
    } catch (e2) {
      console.error(e2);
      setErr("تعذّر تسجيل السند. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { setBusy(false); }
  };

  const field = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#133B2E] text-sm";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-[#133B2E] text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <Banknote size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">سند قبض</h2>
              <p className="text-xs text-[#D4AF37]">
                {invoice.invoiceNumber} · المتبقي {money(invoice.remainingAmount)} {invoice.currency}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {err && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertCircleIcon /> <span>{err}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">المبلغ *</label>
              <input type="number" min="0" step="0.01" value={amount} className={field}
                onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">طريقة الدفع</label>
              <select value={method} className={field} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT_METHOD_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">التاريخ</label>
              <input type="date" value={date} className={field} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">المرجع</label>
              <input value={reference} className={field} placeholder="رقم الحوالة أو الشيك"
                onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">ملاحظات</label>
            <input value={notes} className={field} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs">
            <Clock size={14} className="shrink-0" />
            بعد الحفظ سينخفض المتبقي إلى{" "}
            <strong>{money(Number(invoice.remainingAmount) - Number(amount || 0))} {invoice.currency}</strong>
            {" "}وتتحدّث حالة الفاتورة تلقائياً.
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={busy}
              className="flex-1 py-6 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90">
              {busy ? "جاري الحفظ..." : "حفظ السند"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}
              className="flex-1 py-6 border-gray-200 text-gray-500 rounded-2xl hover:bg-gray-50">
              إلغاء
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AlertCircleIcon() {
  return <AlertTriangle size={16} className="shrink-0 mt-0.5" />;
}
