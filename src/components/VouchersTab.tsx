/**
 * تبويبا سندات القبض والصرف داخل صفحة الحسابات — الوثيقة §1.9.
 *
 * سندات القبض تُنشأ تلقائياً من صفحة الفواتير عند تسجيل دفعة، وتُعرض هنا
 * للقراءة. سندات الصرف تُنشأ من هنا مباشرة.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Plus, Banknote, Scale, RefreshCw, AlertTriangle, X, Trash2 } from "lucide-react";
import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { usePermissions } from "../lib/usePermissions";
import { writeAudit } from "../lib/audit";
import { excludeDeleted, softDelete } from "../lib/softDelete";
import { fetchCaseOptions, type CaseOption } from "../lib/links";
import {
  PAYMENT_METHOD_LABELS_AR, VOUCHER_CATEGORY_LABELS_AR, canCreateInvoice, nextNumber,
  type PaymentMethod, type Receipt, type Voucher, type VoucherCategory,
} from "../lib/billing";

const money = (n: unknown) =>
  (Number(n) || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ────────────────────────── سندات القبض ────────────────────────── */

export function ReceiptsTab({ currencySymbol }: { currencySymbol: string }) {
  const perms = usePermissions();
  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      if (!perms.lawyerId) { setRows([]); return; }
      const snap = await getDocs(
        query(collection(db, "receipts"), where("lawyerId", "==", perms.lawyerId)),
      );
      setRows(
        excludeDeleted(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Receipt, "id">) })))
          .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
      );
    } catch (err) {
      console.error("Error fetching receipts:", err);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [perms.lawyerId]);

  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/40">
        <p className="text-sm text-gray-600">
          {rows.length} سند قبض · إجمالي <strong className="text-green-700">{money(total)} {currencySymbol}</strong>
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-xl border-gray-200">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>
      <Table>
        <TableHeader className="bg-white">
          <TableRow>
            <TableHead className="text-right font-bold text-[#133B2E]">الرقم</TableHead>
            <TableHead className="text-right font-bold text-[#133B2E]">التاريخ</TableHead>
            <TableHead className="text-right font-bold text-[#133B2E]">العميل / الفاتورة</TableHead>
            <TableHead className="text-right font-bold text-[#133B2E]">المبلغ</TableHead>
            <TableHead className="text-right font-bold text-[#133B2E] hidden sm:table-cell">الطريقة</TableHead>
            <TableHead className="text-right font-bold text-[#133B2E] hidden md:table-cell">المرجع</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="text-center py-10 text-gray-500">جاري التحميل...</TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-10 text-gray-500">
                لا توجد سندات قبض — تُنشأ تلقائياً عند تسجيل دفعة على فاتورة
              </TableCell>
            </TableRow>
          ) : rows.map((r) => (
            <TableRow key={r.id} className="hover:bg-gray-50/50">
              <TableCell className="font-mono text-xs text-gray-500" dir="ltr">{r.receiptNumber}</TableCell>
              <TableCell dir="ltr" className="text-right">{r.date}</TableCell>
              <TableCell>
                <div className="font-semibold text-[#133B2E]">{r.clientName || "—"}</div>
                {r.invoiceNumber && (
                  <Link to="/app/invoices" className="text-xs text-indigo-600 hover:underline font-mono" dir="ltr">
                    {r.invoiceNumber}
                  </Link>
                )}
                {r.caseId && (
                  <Link to={`/app/cases/${r.caseId}`}
                    className="flex items-center gap-1 text-xs text-indigo-700 hover:underline mt-0.5">
                    <Scale size={11} /> {(r as Receipt & { caseTitle?: string }).caseTitle || "القضية"}
                  </Link>
                )}
              </TableCell>
              <TableCell className="font-bold text-green-600">{money(r.amount)} {currencySymbol}</TableCell>
              <TableCell className="hidden sm:table-cell text-sm">
                {PAYMENT_METHOD_LABELS_AR[r.method] ?? r.method}
              </TableCell>
              <TableCell className="hidden md:table-cell text-sm text-gray-500">{r.reference || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ────────────────────────── سندات الصرف ────────────────────────── */

export function VouchersTab({ currencySymbol }: { currencySymbol: string }) {
  const perms = usePermissions();
  const canManage = canCreateInvoice(perms.role);
  const [rows, setRows] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      if (!perms.lawyerId) { setRows([]); return; }
      const snap = await getDocs(
        query(collection(db, "vouchers"), where("lawyerId", "==", perms.lawyerId)),
      );
      setRows(
        excludeDeleted(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Voucher, "id">) })))
          .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
      );
    } catch (err) {
      console.error("Error fetching vouchers:", err);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [perms.lawyerId]);

  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);

  const remove = async (v: Voucher) => {
    if (!confirm(`سينتقل السند «${v.voucherNumber}» إلى سلة المحذوفات. متابعة؟`)) return;
    setBusy(v.id);
    try {
      await softDelete({ path: ["vouchers", v.id], entity: "expense", label: `${v.voucherNumber} — ${v.payeeName}` });
      await load();
    } finally { setBusy(null); }
  };

  return (
    <div>
      {isAddOpen && (
        <AddVoucherModal onClose={() => setIsAddOpen(false)} onDone={async () => { setIsAddOpen(false); await load(); }} />
      )}

      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/40">
        <p className="text-sm text-gray-600">
          {rows.length} سند صرف · إجمالي <strong className="text-red-700">{money(total)} {currencySymbol}</strong>
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-xl border-gray-200">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setIsAddOpen(true)} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white rounded-xl">
              <Plus size={14} className="ml-1" /> سند صرف
            </Button>
          )}
        </div>
      </div>

      <Table>
        <TableHeader className="bg-white">
          <TableRow>
            <TableHead className="text-right font-bold text-[#133B2E]">الرقم</TableHead>
            <TableHead className="text-right font-bold text-[#133B2E]">التاريخ</TableHead>
            <TableHead className="text-right font-bold text-[#133B2E]">المستفيد / البند</TableHead>
            <TableHead className="text-right font-bold text-[#133B2E]">المبلغ</TableHead>
            <TableHead className="text-right font-bold text-[#133B2E] hidden sm:table-cell">الطريقة</TableHead>
            {canManage && <TableHead className="text-center font-bold text-[#133B2E]">إجراءات</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center py-10 text-gray-500">جاري التحميل...</TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 6 : 5} className="text-center py-10 text-gray-500">
                لا توجد سندات صرف مسجلة
              </TableCell>
            </TableRow>
          ) : rows.map((v) => (
            <TableRow key={v.id} className="hover:bg-gray-50/50">
              <TableCell className="font-mono text-xs text-gray-500" dir="ltr">{v.voucherNumber}</TableCell>
              <TableCell dir="ltr" className="text-right">{v.date}</TableCell>
              <TableCell>
                <div className="font-semibold text-[#133B2E]">{v.payeeName}</div>
                <div className="text-xs text-gray-500">{VOUCHER_CATEGORY_LABELS_AR[v.category] ?? v.category}</div>
                {v.caseId && (
                  <Link to={`/app/cases/${v.caseId}`}
                    className="flex items-center gap-1 text-xs text-indigo-700 hover:underline mt-0.5">
                    <Scale size={11} /> {v.caseTitle || "القضية"}
                  </Link>
                )}
              </TableCell>
              <TableCell className="font-bold text-red-600">{money(v.amount)} {currencySymbol}</TableCell>
              <TableCell className="hidden sm:table-cell text-sm">
                {PAYMENT_METHOD_LABELS_AR[v.method] ?? v.method}
              </TableCell>
              {canManage && (
                <TableCell className="text-center">
                  <Button variant="ghost" size="sm" disabled={busy === v.id} onClick={() => remove(v)}
                    className="rounded-xl text-red-600 hover:bg-red-50" title="حذف السند">
                    <Trash2 size={14} />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ────────────────────────── نموذج سند الصرف ────────────────────────── */

function AddVoucherModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const perms = usePermissions();
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const currency = localStorage.getItem("sys_currency") || "SAR";

  const [form, setForm] = useState({
    payeeName: "", amount: "", category: "COURT_FEE" as VoucherCategory,
    method: "CASH" as PaymentMethod, reference: "",
    date: new Date().toISOString().slice(0, 10), caseId: "", notes: "",
  });

  useEffect(() => {
    if (!perms.lawyerId) return;
    void fetchCaseOptions(perms.lawyerId).then(setCases);
  }, [perms.lawyerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.payeeName.trim()) { setErr("اسم المستفيد مطلوب"); return; }
    if (!(Number(form.amount) > 0)) { setErr("أدخل مبلغاً أكبر من صفر"); return; }
    if (!perms.lawyerId) { setErr("تعذّر تحديد المكتب."); return; }

    setBusy(true);
    setErr("");
    try {
      const lawyerId = perms.lawyerId;
      const voucherNumber = await nextNumber(lawyerId, "vouchers");
      const linked = form.caseId ? cases.find((c) => c.id === form.caseId) : undefined;
      const now = new Date().toISOString();

      await addDoc(collection(db, "vouchers"), {
        lawyerId,
        voucherNumber,
        payeeType: "OTHER",
        payeeId: null,
        payeeName: form.payeeName.trim(),
        amount: Number(form.amount),
        currency,
        category: form.category,
        method: form.method,
        reference: form.reference || null,
        date: form.date,
        caseId: form.caseId || null,
        caseTitle: linked?.label ?? null,
        approvedBy: null,
        expenseId: null,
        notes: form.notes || null,
        createdAt: now,
        createdBy: perms.userId,
        deletedAt: null,
      });

      await writeAudit({
        action: "CREATE", entity: "expense", entityId: null,
        entityLabel: `${voucherNumber} — ${form.payeeName.trim()}`,
        after: {
          المبلغ: Number(form.amount),
          البند: VOUCHER_CATEGORY_LABELS_AR[form.category],
          القضية: linked?.label ?? "غير مرتبط",
        },
      });

      onDone();
    } catch (e2) {
      console.error(e2);
      setErr("تعذّر حفظ السند. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { setBusy(false); }
  };

  const field = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#133B2E] text-sm";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-[#133B2E] text-white flex justify-between items-center sticky top-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <Banknote size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">سند صرف</h2>
              <p className="text-xs text-[#D4AF37]">يُرقَّم تلقائياً VCH-YYYY-NNNN</p>
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
            <label className="text-sm font-bold text-gray-700">المستفيد *</label>
            <input value={form.payeeName} className={field} placeholder="اسم الجهة أو الشخص"
              onChange={(e) => setForm({ ...form, payeeName: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">المبلغ ({currency}) *</label>
              <input type="number" min="0" step="0.01" value={form.amount} className={field}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">البند</label>
              <select value={form.category} className={field}
                onChange={(e) => setForm({ ...form, category: e.target.value as VoucherCategory })}>
                {Object.entries(VOUCHER_CATEGORY_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">طريقة الصرف</label>
              <select value={form.method} className={field}
                onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
                {Object.entries(PAYMENT_METHOD_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">التاريخ</label>
              <input type="date" value={form.date} className={field}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">
              القضية <span className="font-normal text-gray-400">(اختياري)</span>
            </label>
            <select value={form.caseId} className={field}
              onChange={(e) => setForm({ ...form, caseId: e.target.value })}>
              <option value="">— مصروف عام —</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber ? `${c.caseNumber} — ${c.label}` : c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">المرجع / ملاحظات</label>
            <input value={form.reference} className={field} placeholder="رقم الإيصال أو الحوالة"
              onChange={(e) => setForm({ ...form, reference: e.target.value })} />
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
