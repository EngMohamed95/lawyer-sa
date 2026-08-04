/**
 * تسجيل الساعات — الوثيقة §1.9 (نموذج الأتعاب بالساعة).
 *
 * كل سجل ساعات مرتبط بقضية وبمن قام بالعمل. الساعات القابلة للفوترة
 * وغير المفوترة بعد تُحوَّل إلى بنود فاتورة بضغطة واحدة.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Timer, Plus, ShieldAlert, RefreshCw, AlertTriangle, Scale, X, Trash2, Save, Receipt,
} from "lucide-react";
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { usePermissions } from "../lib/usePermissions";
import { writeAudit } from "../lib/audit";
import { excludeDeleted, softDelete } from "../lib/softDelete";
import { fetchCaseOptions, type CaseOption } from "../lib/links";
import {
  buildZatcaBlock, canCreateInvoice, computeInvoiceTotals, nextNumber,
  summarizeTime, timeEntriesToItems, timeEntryAmount,
  type TimeEntry,
} from "../lib/billing";

const money = (n: unknown) =>
  (Number(n) || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TimeEntries() {
  const perms = usePermissions();
  const canView = perms.can("invoice.manage");
  const canManage = canCreateInvoice(perms.role);

  const [rows, setRows] = useState<TimeEntry[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [caseFilter, setCaseFilter] = useState("ALL");
  const [invoicing, setInvoicing] = useState(false);
  const currency = localStorage.getItem("sys_currency") || "SAR";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (!perms.lawyerId) { setRows([]); return; }
      const lawyerId = perms.lawyerId;
      const [snap, cs] = await Promise.all([
        getDocs(query(collection(db, "time_entries"), where("lawyerId", "==", lawyerId))),
        fetchCaseOptions(lawyerId),
      ]);
      setCases(cs);
      setRows(
        excludeDeleted(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TimeEntry, "id">) })))
          .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
      );
    } catch (err) {
      console.error("Error fetching time entries:", err);
      setError("تعذّر تحميل سجلات الساعات. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (canView) void load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.lawyerId, canView]);

  const filtered = useMemo(
    () => (caseFilter === "ALL" ? rows : rows.filter((r) => r.caseId === caseFilter)),
    [rows, caseFilter],
  );
  const summary = useMemo(() => summarizeTime(filtered), [filtered]);
  const pendingItems = useMemo(() => timeEntriesToItems(filtered), [filtered]);

  const remove = async (e: TimeEntry) => {
    if (e.invoiceId) { setError("لا يمكن حذف سجل مفوتَر بالفعل."); return; }
    if (!confirm(`سينتقل السجل (${e.hours} ساعة) إلى سلة المحذوفات. متابعة؟`)) return;
    setBusy(e.id);
    try {
      await softDelete({
        path: ["time_entries", e.id], entity: "invoice",
        label: `${e.hours} ساعة — ${e.caseTitle ?? "أعمال عامة"}`,
      });
      await load();
    } finally { setBusy(null); }
  };

  /** يحوّل الساعات القابلة للفوترة غير المفوترة إلى فاتورة مسودة */
  const invoiceUnbilled = async () => {
    const eligible = filtered.filter((e) => e.billable && !e.invoiceId);
    if (eligible.length === 0) { setError("لا توجد ساعات قابلة للفوترة غير مفوترة."); return; }

    // كل السجلات يجب أن تكون لعميل واحد حتى تصلح لفاتورة واحدة
    const clientIds = [...new Set(eligible.map((e) => e.clientId).filter(Boolean))];
    if (clientIds.length > 1) {
      setError("السجلات تخص أكثر من عميل — رشِّح بقضية واحدة أولاً ثم أصدر الفاتورة.");
      return;
    }
    if (!perms.lawyerId) { setError("تعذّر تحديد المكتب."); return; }
    if (!confirm(`سيتم إصدار فاتورة مسودة بـ ${summary.unbilledAmount.toLocaleString("ar-EG")} ${currency} من ${eligible.length} سجل. متابعة؟`)) return;

    setInvoicing(true);
    setError("");
    try {
      const lawyerId = perms.lawyerId;
      const items = timeEntriesToItems(eligible);
      const vatRate = Number(localStorage.getItem("sys_vatRate") || "15");
      const totals = computeInvoiceTotals(items, vatRate, 0, "AMOUNT");
      const invoiceNumber = await nextNumber(lawyerId, "invoices");
      const now = new Date().toISOString();
      const first = eligible[0];

      const invoiceRef = await addDoc(collection(db, "invoices"), {
        lawyerId,
        invoiceNumber,
        clientId: first.clientId ?? null,
        clientName: first.clientName ?? null,
        caseId: first.caseId ?? null,
        caseTitle: first.caseTitle ?? null,
        caseNumber: first.caseNumber ?? null,
        contractId: null,
        feeAgreementId: first.feeAgreementId ?? null,
        issueDate: now.slice(0, 10),
        dueDate: null,
        items,
        subtotal: totals.subtotal,
        discount: 0,
        discountType: "AMOUNT",
        vatRate,
        vatAmount: totals.vatAmount,
        total: totals.total,
        paidAmount: 0,
        remainingAmount: totals.total,
        currency,
        status: "DRAFT",
        approvedBy: null,
        zatca: buildZatcaBlock(totals.total, totals.vatAmount),
        notes: `مُولَّدة من ${eligible.length} سجل ساعات`,
        sharedWithClient: false,
        createdAt: now,
        createdBy: perms.userId,
        createdByName: localStorage.getItem("userName") ?? null,
        updatedAt: now,
        deletedAt: null,
      });

      // نوسم السجلات بأنها فُوترت حتى لا تُفوتر مرتين
      await Promise.all(eligible.map((e) =>
        updateDoc(doc(db, "time_entries", e.id), { invoiceId: invoiceRef.id, invoiceNumber })));

      await writeAudit({
        action: "CREATE", entity: "invoice", entityId: invoiceRef.id,
        entityLabel: `${invoiceNumber} — من سجلات الساعات`,
        after: { "عدد السجلات": eligible.length, الإجمالي: totals.total, "عدد البنود": items.length },
      });

      await load();
      alert(`أُصدرت الفاتورة ${invoiceNumber} كمسودة — راجعها من صفحة الفواتير.`);
    } catch (err) {
      console.error(err);
      setError("تعذّر إصدار الفاتورة من الساعات.");
    } finally { setInvoicing(false); }
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center" dir="rtl">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <ShieldAlert size={26} />
        </div>
        <h2 className="text-xl font-bold text-[#133B2E]">لا تملك صلاحية الوصول لتسجيل الساعات</h2>
        <p className="text-sm text-gray-500">راجع مدير المكتب لمنحك الصلاحية.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      {isAddOpen && (
        <AddTimeEntryModal cases={cases} onClose={() => setIsAddOpen(false)}
          onDone={async () => { setIsAddOpen(false); await load(); }} />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">تسجيل الساعات</h1>
          <p className="text-gray-500 mt-1 text-sm">
            ساعات العمل القابلة للفوترة — {rows.length} سجل
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading} className="rounded-xl border-gray-200">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
          {canManage && summary.unbilledAmount > 0 && (
            <Button variant="outline" onClick={invoiceUnbilled} disabled={invoicing}
              className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50">
              <Receipt className="ml-2 h-4 w-4" />
              {invoicing ? "جاري الإصدار..." : "فوترة غير المفوتر"}
            </Button>
          )}
          {canManage && (
            <Button onClick={() => setIsAddOpen(true)} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white shadow-lg">
              <Plus className="ml-2 h-4 w-4" /> تسجيل ساعات
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["إجمالي الساعات", `${summary.totalHours}`, "text-[#133B2E]", ""],
          ["ساعات قابلة للفوترة", `${summary.billableHours}`, "text-indigo-600", ""],
          ["قيمة قابلة للفوترة", money(summary.billableAmount), "text-green-600", currency],
          ["غير مفوتر بعد", money(summary.unbilledAmount), "text-amber-600", currency],
        ].map(([label, value, cls, unit]) => (
          <div key={label as string} className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">{label as string}</p>
            <p className={`text-xl font-black mt-1 ${cls as string}`}>
              {value as string} {unit ? <span className="text-xs font-normal text-gray-400">{unit as string}</span> : null}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {pendingItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <p className="font-bold">جاهز للفوترة — {pendingItems.length} بند</p>
          <p className="text-xs mt-1">
            {pendingItems.map((it) => `${it.description} = ${money(it.amount)}`).join(" · ")}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-gray-600">القضية:</label>
          <select value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#133B2E]">
            <option value="ALL">كل القضايا</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber ? `${c.caseNumber} — ${c.label}` : c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <Timer className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-bold text-lg text-[#133B2E]">
            السجلات <span className="text-sm font-normal text-gray-400">({filtered.length})</span>
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-white">
              <TableRow>
                <TableHead className="text-right font-bold text-[#133B2E]">التاريخ</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E]">الوصف / القضية</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E]">الساعات</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E] hidden sm:table-cell">السعر</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E]">القيمة</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E]">الحالة</TableHead>
                {canManage && <TableHead className="text-center font-bold text-[#133B2E]">إجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center py-10 text-gray-500">جاري التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 7 : 6} className="text-center py-10 text-gray-500">
                    {rows.length === 0 ? "لا توجد سجلات ساعات بعد" : "لا سجلات لهذه القضية"}
                  </TableCell>
                </TableRow>
              ) : filtered.map((e) => (
                <TableRow key={e.id} className="hover:bg-gray-50/50">
                  <TableCell dir="ltr" className="text-right text-sm">{e.date}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-[#133B2E] text-sm">{e.description || "—"}</div>
                    {e.caseId ? (
                      <Link to={`/app/cases/${e.caseId}`}
                        className="flex items-center gap-1 text-xs text-indigo-700 hover:underline mt-0.5">
                        <Scale size={11} /> {e.caseNumber ? `${e.caseNumber} — ` : ""}{e.caseTitle || "القضية"}
                      </Link>
                    ) : (
                      <div className="text-xs text-gray-400 mt-0.5">أعمال عامة</div>
                    )}
                    {e.userName && <div className="text-[10px] text-gray-400 mt-0.5">{e.userName}</div>}
                  </TableCell>
                  <TableCell className="font-bold text-[#133B2E]">{e.hours}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-gray-600">{money(e.rate)}</TableCell>
                  <TableCell className="font-bold text-green-700">{money(e.amount)}</TableCell>
                  <TableCell>
                    {!e.billable ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">غير قابل للفوترة</span>
                    ) : e.invoiceId ? (
                      <Link to="/app/invoices"
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 hover:bg-green-200">
                        {(e as TimeEntry & { invoiceNumber?: string }).invoiceNumber || "مفوتَر"}
                      </Link>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">غير مفوتر</span>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-center">
                      <Button variant="ghost" size="sm" disabled={busy === e.id || !!e.invoiceId}
                        onClick={() => remove(e)} title={e.invoiceId ? "مفوتَر — لا يُحذف" : "حذف السجل"}
                        className="rounded-xl text-red-600 hover:bg-red-50 disabled:opacity-30">
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ────────────────────────── نموذج التسجيل ────────────────────────── */

function AddTimeEntryModal({
  cases, onClose, onDone,
}: { cases: CaseOption[]; onClose: () => void; onDone: () => void }) {
  const perms = usePermissions();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const currency = localStorage.getItem("sys_currency") || "SAR";

  const [form, setForm] = useState({
    caseId: "", date: new Date().toISOString().slice(0, 10),
    hours: "1", rate: localStorage.getItem("sys_hourlyRate") || "500",
    description: "", billable: true,
  });

  const amount = timeEntryAmount(Number(form.hours), Number(form.rate));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(Number(form.hours) > 0)) { setErr("أدخل عدد ساعات أكبر من صفر"); return; }
    if (Number(form.hours) > 24) { setErr("عدد الساعات في اليوم لا يتجاوز ٢٤"); return; }
    if (!form.description.trim()) { setErr("اكتب وصف العمل المنجز"); return; }
    if (!perms.lawyerId) { setErr("تعذّر تحديد المكتب."); return; }

    setBusy(true);
    setErr("");
    try {
      const lawyerId = perms.lawyerId;
      const linked = form.caseId ? cases.find((c) => c.id === form.caseId) : undefined;
      const now = new Date().toISOString();

      // نقرأ العميل من القضية ليصلح السجل لفاتورة لاحقاً
      let clientId: string | null = linked?.clientId ?? null;
      let clientName: string | null = null;
      if (clientId) {
        try {
          const { getDoc } = await import("firebase/firestore");
          const snap = await getDoc(doc(db, "clients", clientId));
          if (snap.exists()) {
            const c = snap.data();
            clientName = (c.fullName as string) || (c.name as string) || null;
          }
        } catch { /* الاسم تحسيني فقط */ }
      }

      await addDoc(collection(db, "time_entries"), {
        lawyerId,
        userId: perms.userId,
        userName: localStorage.getItem("userName") ?? null,
        caseId: form.caseId || null,
        caseTitle: linked?.label ?? null,
        caseNumber: linked?.caseNumber || null,
        clientId,
        clientName,
        feeAgreementId: null,
        date: form.date,
        hours: Number(form.hours),
        rate: Number(form.rate),
        amount,
        description: form.description.trim(),
        billable: form.billable,
        invoiceId: null,
        currency,
        createdAt: now,
        deletedAt: null,
      });

      await writeAudit({
        action: "CREATE", entity: "invoice", entityId: null,
        entityLabel: `${form.hours} ساعة — ${linked?.label ?? "أعمال عامة"}`,
        after: { الساعات: Number(form.hours), القيمة: amount, "قابل للفوترة": form.billable ? "نعم" : "لا" },
      });

      onDone();
    } catch (e2) {
      console.error(e2);
      setErr("تعذّر حفظ السجل. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { setBusy(false); }
  };

  const field = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#133B2E] text-sm";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-[#133B2E] text-white flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <Timer size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">تسجيل ساعات</h2>
              <p className="text-xs text-[#D4AF37]">تُضاف للفاتورة عند الفوترة</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {err && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{err}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">القضية</label>
            <select value={form.caseId} className={field}
              onChange={(e) => setForm({ ...form, caseId: e.target.value })}>
              <option value="">— أعمال عامة —</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber ? `${c.caseNumber} — ${c.label}` : c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">التاريخ</label>
              <input type="date" value={form.date} className={field}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">الساعات *</label>
              <input type="number" min="0.25" max="24" step="0.25" value={form.hours} className={field}
                onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">السعر/ساعة</label>
              <input type="number" min="0" step="0.01" value={form.rate} className={field}
                onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">وصف العمل *</label>
            <textarea rows={3} value={form.description} className={field}
              placeholder="مثال: مراجعة مذكرة الدفاع وإعداد الرد"
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100">
            <div className="flex items-center gap-2">
              <input id="billable" type="checkbox" checked={form.billable}
                onChange={(e) => setForm({ ...form, billable: e.target.checked })}
                className="w-5 h-5 accent-[#133B2E]" />
              <label htmlFor="billable" className="text-sm font-bold text-gray-700 cursor-pointer">قابل للفوترة</label>
            </div>
            <p className="font-black text-lg text-[#D4AF37]">{money(amount)} {currency}</p>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={busy}
              className="flex-1 py-6 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90">
              <Save size={16} className="ml-2" />
              {busy ? "جاري الحفظ..." : "حفظ السجل"}
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
