/** إنشاء عقد جديد — الوثيقة §1.5 */

import { useEffect, useState } from "react";
import { X, FileSignature, AlertCircle, Save } from "lucide-react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Button } from "./ui/button";
import { usePermissions } from "../lib/usePermissions";
import { writeAudit } from "../lib/audit";
import {
  fetchCaseOptions, fetchClientOptions,
  type CaseOption, type ClientOption,
} from "../lib/links";
import {
  CONTRACT_TYPE_LABELS_AR, RENEWAL_LABELS_AR, computeTotals, nextContractNumber,
  type ContractType, type RenewalType,
} from "../lib/contracts";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** ربط مُسبق — يُستخدم عند الإنشاء من داخل ملف القضية */
  defaultCaseId?: string | null;
  defaultClientId?: string | null;
  /** يمنع تغيير القضية عند الإنشاء من داخلها */
  lockCase?: boolean;
}

export default function AddContractModal({
  isOpen, onClose, onSuccess,
  defaultCaseId = null, defaultClientId = null, lockCase = false,
}: Props) {
  const perms = usePermissions();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currency = localStorage.getItem("sys_currency") || "SAR";
  const defaultVat = Number(localStorage.getItem("sys_vatRate") || "15");

  const blank = () => ({
    title: "", type: "RETAINER" as ContractType,
    clientId: defaultClientId ?? "", caseId: defaultCaseId ?? "",
    value: "", vatRate: String(defaultVat),
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "", renewalType: "NONE" as RenewalType, renewalNoticeDays: "30",
    content: "", notes: "",
  });

  const [form, setForm] = useState(blank);

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
      // عند الفتح من داخل قضية: نستنتج العميل من القضية إن لم يُمرَّر
      if (defaultCaseId && !defaultClientId) {
        const linked = cs.find((c) => c.id === defaultCaseId);
        if (linked?.clientId) setForm((f) => ({ ...f, clientId: linked.clientId }));
      }
    })();
  }, [isOpen, perms.lawyerId, defaultCaseId, defaultClientId]);

  if (!isOpen) return null;

  /** القضايا المعروضة تتبع العميل المختار — نفس سلوك سند القبض */
  const casesForClient = form.clientId
    ? cases.filter((c) => c.clientId === form.clientId)
    : cases;

  const totals = computeTotals(Number(form.value), Number(form.vatRate));

  const validate = (): string => {
    if (!form.title.trim()) return "عنوان العقد مطلوب";
    if (!form.clientId) return "اختر العميل";
    if (form.value && Number(form.value) < 0) return "قيمة العقد لا تكون سالبة";
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      return "تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية";
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
      const contractNumber = await nextContractNumber(perms.lawyerId);
      const now = new Date().toISOString();
      const client = clients.find((c) => c.id === form.clientId);
      const linkedCase = form.caseId ? cases.find((c) => c.id === form.caseId) : undefined;

      const payload = {
        lawyerId: perms.lawyerId,
        contractNumber,
        title: form.title.trim(),
        type: form.type,
        clientId: form.clientId,
        clientName: client?.label ?? null,
        // الربط بالقضية — نخزّن الاسم والرقم معه ليظهر بلا استعلام إضافي
        caseId: form.caseId || null,
        caseTitle: linkedCase?.label ?? null,
        caseNumber: linkedCase?.caseNumber || null,
        content: form.content,
        value: Number(form.value) || 0,
        currency,
        vatRate: Number(form.vatRate) || 0,
        vatAmount: totals.vatAmount,
        totalValue: totals.totalValue,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        renewalType: form.renewalType,
        renewalNoticeDays: Number(form.renewalNoticeDays) || 30,
        status: "DRAFT" as const,
        version: 1,
        reviewedBy: null,
        approvedBy: null,
        rejectionReason: null,
        sharedWithClient: false,
        notes: form.notes || null,
        createdAt: now,
        createdBy: perms.userId,
        createdByName: localStorage.getItem("userName") ?? null,
        updatedAt: now,
        deletedAt: null,
      };

      const ref = await addDoc(collection(db, "contracts"), payload);

      await writeAudit({
        action: "CREATE", entity: "contract", entityId: ref.id,
        entityLabel: `${contractNumber} — ${payload.title}`,
        after: {
          العنوان: payload.title,
          النوع: CONTRACT_TYPE_LABELS_AR[form.type],
          القيمة: payload.totalValue,
          العميل: payload.clientName,
          القضية: payload.caseTitle ?? "غير مرتبط",
        },
      });

      setForm(blank());
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setError("تعذّر إنشاء العقد. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  };

  const field = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#133B2E]/10 focus:border-[#133B2E] transition-all text-sm";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b flex justify-between items-center bg-[#133B2E] text-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <FileSignature size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">عقد جديد</h2>
              <p className="text-xs text-[#D4AF37]">يُنشأ كمسودة ثم يمرّ بدورة المراجعة والاعتماد</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-full"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertCircle size={18} className="shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-gray-700">عنوان العقد *</label>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={field} placeholder="مثال: اتفاقية أتعاب — قضية تجارية" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">نوع العقد</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ContractType })} className={field}>
                {Object.entries(CONTRACT_TYPE_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">العميل *</label>
              <select required value={form.clientId} disabled={lockCase}
                onChange={(e) => setForm({ ...form, clientId: e.target.value, caseId: "" })}
                className={`${field} ${lockCase ? "opacity-60 cursor-not-allowed" : ""}`}>
                <option value="">— اختر العميل —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {clients.length === 0 && <p className="text-xs text-amber-600">لا يوجد عملاء — أضف عميلاً أولاً</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-gray-700">
                القضية المرتبطة <span className="font-normal text-gray-400">(اختياري)</span>
              </label>
              <select value={form.caseId} disabled={lockCase}
                onChange={(e) => setForm({ ...form, caseId: e.target.value })}
                className={`${field} ${lockCase ? "opacity-60 cursor-not-allowed" : ""}`}>
                <option value="">— بلا قضية (عقد عام) —</option>
                {casesForClient.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caseNumber ? `${c.caseNumber} — ${c.label}` : c.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400">
                {lockCase
                  ? "العقد سيُربط بهذه القضية تلقائياً."
                  : form.clientId
                    ? `${casesForClient.length} قضية لهذا العميل — سيظهر العقد داخل ملف القضية.`
                    : "اختر العميل أولاً لتظهر قضاياه."}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">قيمة العقد ({currency})</label>
              <input type="number" min="0" step="0.01" value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })} className={field} placeholder="0.00" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">نسبة الضريبة (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={form.vatRate}
                onChange={(e) => setForm({ ...form, vatRate: e.target.value })} className={field} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">تاريخ البداية</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={field} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">تاريخ الانتهاء</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={field} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">التجديد</label>
              <select value={form.renewalType} onChange={(e) => setForm({ ...form, renewalType: e.target.value as RenewalType })} className={field}>
                {Object.entries(RENEWAL_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">التنبيه قبل الانتهاء (أيام)</label>
              <input type="number" min="0" value={form.renewalNoticeDays}
                onChange={(e) => setForm({ ...form, renewalNoticeDays: e.target.value })} className={field} />
            </div>
          </div>

          {Number(form.value) > 0 && (
            <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 text-center">
              <div><p className="text-xs text-gray-500">القيمة</p><p className="font-bold text-[#133B2E]">{Number(form.value).toLocaleString("ar-EG")}</p></div>
              <div><p className="text-xs text-gray-500">الضريبة</p><p className="font-bold text-[#133B2E]">{totals.vatAmount.toLocaleString("ar-EG")}</p></div>
              <div><p className="text-xs text-gray-500">الإجمالي</p><p className="font-black text-[#D4AF37]">{totals.totalValue.toLocaleString("ar-EG")} {currency}</p></div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">بنود العقد</label>
            <textarea rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              className={field} placeholder="اكتب بنود العقد هنا..." />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">ملاحظات داخلية</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={field} placeholder="لا تظهر للعميل" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}
              className="flex-1 py-6 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90">
              <Save size={16} className="ml-2" />
              {loading ? "جاري الحفظ..." : "حفظ كمسودة"}
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
