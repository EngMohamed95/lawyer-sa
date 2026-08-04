/** إصدار فاتورة — الوثيقة §1.9. الضريبة تُحسب على مستوى البند. */

import { useEffect, useState } from "react";
import { X, Receipt, AlertCircle, Save, Plus, Trash2 } from "lucide-react";
import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Button } from "./ui/button";
import { usePermissions } from "../lib/usePermissions";
import { writeAudit } from "../lib/audit";
import { excludeDeleted } from "../lib/softDelete";
import {
  fetchCaseOptions, fetchClientOptions,
  type CaseOption, type ClientOption,
} from "../lib/links";
import {
  buildZatcaBlock, computeInvoiceTotals, emptyItem, nextNumber,
  type DiscountType, type InvoiceItem,
} from "../lib/billing";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultClientId?: string | null;
  defaultCaseId?: string | null;
}

interface ContractOption { id: string; label: string; clientId: string; caseId: string | null }

export default function AddInvoiceModal({
  isOpen, onClose, onSuccess, defaultClientId = null, defaultCaseId = null,
}: Props) {
  const perms = usePermissions();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currency = localStorage.getItem("sys_currency") || "SAR";
  const defaultVat = Number(localStorage.getItem("sys_vatRate") || "15");

  const blank = () => ({
    clientId: defaultClientId ?? "",
    caseId: defaultCaseId ?? "",
    contractId: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    vatRate: String(defaultVat),
    discount: "0",
    discountType: "AMOUNT" as DiscountType,
    notes: "",
  });

  const [form, setForm] = useState(blank);
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);

  useEffect(() => {
    if (!isOpen || !perms.lawyerId) return;
    const lawyerId = perms.lawyerId;
    void (async () => {
      const [cl, cs] = await Promise.all([
        fetchClientOptions(lawyerId),
        fetchCaseOptions(lawyerId),
      ]);
      setClients(cl);
      setCases(cs);

      // العقود المعتمدة فقط تصلح أساساً لفاتورة
      try {
        const snap = await getDocs(
          query(collection(db, "contracts"), where("lawyerId", "==", lawyerId)),
        );
        const rows = excludeDeleted(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string }),
        );
        setContracts(
          rows
            .filter((c) => ["APPROVED", "SIGNED", "ACTIVE"].includes(String(c.status)))
            .map((c) => ({
              id: c.id,
              label: `${String(c.contractNumber ?? "")} — ${String(c.title ?? "عقد")}`,
              clientId: String(c.clientId ?? ""),
              caseId: (c.caseId as string) ?? null,
            })),
        );
      } catch (err) {
        console.warn("تعذّر تحميل العقود:", err);
      }
    })();
  }, [isOpen, perms.lawyerId]);

  if (!isOpen) return null;

  const casesForClient = form.clientId ? cases.filter((c) => c.clientId === form.clientId) : cases;
  const contractsForClient = form.clientId
    ? contracts.filter((c) => c.clientId === form.clientId)
    : contracts;

  const totals = computeInvoiceTotals(
    items, Number(form.vatRate), Number(form.discount), form.discountType,
  );

  const setItem = (i: number, patch: Partial<InvoiceItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const validate = (): string => {
    if (!form.clientId) return "اختر العميل";
    const filled = items.filter((it) => it.description.trim());
    if (filled.length === 0) return "أضف بنداً واحداً على الأقل بوصف";
    if (filled.some((it) => Number(it.quantity) <= 0)) return "الكمية يجب أن تكون أكبر من صفر";
    if (filled.some((it) => Number(it.unitPrice) < 0)) return "سعر الوحدة لا يكون سالباً";
    if (form.dueDate && form.dueDate < form.issueDate)
      return "تاريخ الاستحقاق يجب أن يكون بعد تاريخ الإصدار";
    if (totals.total <= 0) return "إجمالي الفاتورة يجب أن يكون أكبر من صفر";
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    if (!perms.lawyerId) { setError("تعذّر تحديد المكتب."); return; }

    setLoading(true);
    setError("");
    try {
      const lawyerId = perms.lawyerId;
      const invoiceNumber = await nextNumber(lawyerId, "invoices");
      const now = new Date().toISOString();
      const client = clients.find((c) => c.id === form.clientId);
      const linkedCase = form.caseId ? cases.find((c) => c.id === form.caseId) : undefined;
      const linkedContract = form.contractId ? contracts.find((c) => c.id === form.contractId) : undefined;

      const cleanItems = items
        .filter((it) => it.description.trim())
        .map((it) => ({
          description: it.description.trim(),
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
          amount: Math.round((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) * 100) / 100,
          taxable: !!it.taxable,
        }));

      const payload = {
        lawyerId,
        invoiceNumber,
        clientId: form.clientId,
        clientName: client?.label ?? null,
        caseId: form.caseId || null,
        caseTitle: linkedCase?.label ?? null,
        caseNumber: linkedCase?.caseNumber || null,
        contractId: form.contractId || null,
        contractLabel: linkedContract?.label ?? null,
        feeAgreementId: null,
        issueDate: form.issueDate,
        dueDate: form.dueDate || null,
        items: cleanItems,
        subtotal: totals.subtotal,
        discount: Number(form.discount) || 0,
        discountType: form.discountType,
        vatRate: Number(form.vatRate) || 0,
        vatAmount: totals.vatAmount,
        total: totals.total,
        paidAmount: 0,
        remainingAmount: totals.total,
        currency,
        status: "DRAFT" as const,
        approvedBy: null,
        zatca: buildZatcaBlock(totals.total, totals.vatAmount),
        notes: form.notes || null,
        sharedWithClient: false,
        createdAt: now,
        createdBy: perms.userId,
        createdByName: localStorage.getItem("userName") ?? null,
        updatedAt: now,
        deletedAt: null,
      };

      const ref = await addDoc(collection(db, "invoices"), payload);

      await writeAudit({
        action: "CREATE", entity: "invoice", entityId: ref.id,
        entityLabel: `${invoiceNumber} — ${payload.clientName ?? ""}`,
        after: {
          الإجمالي: totals.total,
          الضريبة: totals.vatAmount,
          البنود: cleanItems.length,
          القضية: payload.caseTitle ?? "غير مرتبطة",
        },
      });

      setForm(blank());
      setItems([emptyItem()]);
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setError("تعذّر إصدار الفاتورة. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  };

  const field = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#133B2E]/10 focus:border-[#133B2E] transition-all text-sm";
  const money = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b flex justify-between items-center bg-[#133B2E] text-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <Receipt size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">فاتورة جديدة</h2>
              <p className="text-xs text-[#D4AF37]">تُصدر كمسودة ثم تمرّ بالاعتماد قبل إرسالها للعميل</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertCircle size={18} className="shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">العميل *</label>
              <select required value={form.clientId} className={field}
                onChange={(e) => setForm({ ...form, clientId: e.target.value, caseId: "", contractId: "" })}>
                <option value="">— اختر العميل —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">
                القضية <span className="font-normal text-gray-400">(اختياري)</span>
              </label>
              <select value={form.caseId} className={field}
                onChange={(e) => setForm({ ...form, caseId: e.target.value })}>
                <option value="">— بلا قضية —</option>
                {casesForClient.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caseNumber ? `${c.caseNumber} — ${c.label}` : c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-gray-700">
                العقد المرتبط <span className="font-normal text-gray-400">(المعتمدة فقط)</span>
              </label>
              <select value={form.contractId} className={field}
                onChange={(e) => {
                  const c = contracts.find((x) => x.id === e.target.value);
                  setForm({ ...form, contractId: e.target.value, caseId: c?.caseId || form.caseId });
                }}>
                <option value="">— بلا عقد —</option>
                {contractsForClient.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {form.clientId && contractsForClient.length === 0 && (
                <p className="text-xs text-gray-400">لا توجد عقود معتمدة لهذا العميل.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">تاريخ الإصدار</label>
              <input type="date" value={form.issueDate} className={field}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">تاريخ الاستحقاق</label>
              <input type="date" value={form.dueDate} className={field}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>

          {/* البنود */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-700">بنود الفاتورة *</label>
              <Button type="button" variant="outline" size="sm"
                onClick={() => setItems((p) => [...p, emptyItem()])}
                className="rounded-xl border-gray-200 text-[#133B2E]">
                <Plus size={14} className="ml-1" /> بند
              </Button>
            </div>

            <div className="border border-gray-200 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-xs font-bold text-gray-600">
                <div className="col-span-5">الوصف</div>
                <div className="col-span-2">الكمية</div>
                <div className="col-span-2">سعر الوحدة</div>
                <div className="col-span-2">المبلغ</div>
                <div className="col-span-1 text-center">ضريبة</div>
              </div>
              {items.map((it, i) => {
                const amount = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-t border-gray-100">
                    <input value={it.description} placeholder="أتعاب مرافعة..."
                      onChange={(e) => setItem(i, { description: e.target.value })}
                      className="col-span-5 px-2 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#133B2E]" />
                    <input type="number" min="0" step="0.01" value={it.quantity}
                      onChange={(e) => setItem(i, { quantity: Number(e.target.value) })}
                      className="col-span-2 px-2 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#133B2E]" />
                    <input type="number" min="0" step="0.01" value={it.unitPrice}
                      onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })}
                      className="col-span-2 px-2 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#133B2E]" />
                    <div className="col-span-2 text-sm font-bold text-[#133B2E] px-1">{money(amount)}</div>
                    <div className="col-span-1 flex items-center justify-center gap-1">
                      <input type="checkbox" checked={it.taxable} title="خاضع للضريبة"
                        onChange={(e) => setItem(i, { taxable: e.target.checked })}
                        className="w-4 h-4 accent-[#133B2E]" />
                      {items.length > 1 && (
                        <button type="button" title="حذف البند"
                          onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
                          className="text-red-500 hover:bg-red-50 rounded p-0.5">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400">
              أزل علامة «ضريبة» عن البنود المعفاة — الضريبة تُحسب على وعاء البنود الخاضعة فقط.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">نسبة الضريبة (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={form.vatRate} className={field}
                onChange={(e) => setForm({ ...form, vatRate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">الخصم</label>
              <input type="number" min="0" step="0.01" value={form.discount} className={field}
                onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">نوع الخصم</label>
              <select value={form.discountType} className={field}
                onChange={(e) => setForm({ ...form, discountType: e.target.value as DiscountType })}>
                <option value="AMOUNT">مبلغ ثابت</option>
                <option value="PERCENT">نسبة مئوية</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 text-center">
            <div><p className="text-xs text-gray-500">المجموع</p><p className="font-bold text-[#133B2E]">{money(totals.subtotal)}</p></div>
            <div><p className="text-xs text-gray-500">الخصم</p><p className="font-bold text-rose-600">{money(totals.discountAmount)}</p></div>
            <div><p className="text-xs text-gray-500">الضريبة</p><p className="font-bold text-[#133B2E]">{money(totals.vatAmount)}</p></div>
            <div><p className="text-xs text-gray-500">الإجمالي</p><p className="font-black text-[#D4AF37]">{money(totals.total)} {currency}</p></div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">ملاحظات</label>
            <input value={form.notes} className={field} placeholder="شروط الدفع أو أي بيان إضافي..."
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}
              className="flex-1 py-6 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90">
              <Save size={16} className="ml-2" />
              {loading ? "جاري الإصدار..." : "حفظ كمسودة"}
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
