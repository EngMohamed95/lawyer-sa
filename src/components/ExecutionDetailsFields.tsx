/**
 * حقول طلب التنفيذ في نموذج إضافة/تعديل القضية — نوع الطلب والسند، و«مضمون الطلب»
 * (بيانات المبلغ وبيانات السند) كما في ناجز.
 */

import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  EXECUTION_REQUEST_KINDS, EXECUTION_REQUEST_TYPES, MATURITY_STATUSES, formatMoney, paymentsTotal, remainingAmount,
  type ExecutionDetails, type ExecutionPayment,
} from "../lib/execution";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

const label = "text-sm font-bold text-ink";
const select = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export const SectionTitle = ({ children }: { children: string }) => (
  <div className="md:col-span-2 mt-2 flex items-center gap-2 border-t border-gray-200 pt-4 text-base font-bold text-ink">
    <span className="h-5 w-1.5 rounded-full bg-navy-2" />{children}
  </div>
);

// حقل «نوع السند» أُزيل من النموذج؛ القيم المحفوظة سابقاً تبقى كما هي في القضايا القديمة
/** تصنيف الطلب، ثم «نوع الطلب» يظهر بعد اختيار التصنيف */
export function ExecutionTypeFields({ requestType, requestKind, onChange }: {
  requestType: string;
  requestKind: string;
  onChange: (patch: { enforcementRequestType?: string; enforcementRequestKind?: string }) => void;
}) {
  const suggestions = EXECUTION_REQUEST_KINDS[requestType] || [];
  return (
    <>
    <div className="space-y-2">
      <label className={label}>تصنيف الطلب *</label>
      {/* تغيير التصنيف يفرّغ النوع — نوع تصنيف سابق لا يناسب الجديد */}
      <SearchableSelect required className={select} value={requestType}
        onChange={(e) => onChange({ enforcementRequestType: e.target.value, ...(e.target.value !== requestType ? { enforcementRequestKind: "" } : {}) })}>
        <option value="">— اختر —</option>
        {/* الطلبات القديمة قد تحمل نوعاً من القائمة السابقة — يبقى ظاهراً عند تعديلها */}
        {requestType && !EXECUTION_REQUEST_TYPES.includes(requestType) && <option value={requestType}>{requestType}</option>}
        {EXECUTION_REQUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </SearchableSelect>
    </div>
    {requestType && (
      <div className="space-y-2">
        <label className={label}>نوع الطلب *</label>
        <Input required value={requestKind} list="execution-request-kinds"
          onChange={(e) => onChange({ enforcementRequestKind: e.target.value })}
          placeholder={suggestions.length ? `مثال: ${suggestions[0]}` : "اكتب نوع الطلب"} />
        <datalist id="execution-request-kinds">
          {suggestions.map((k) => <option key={k} value={k} />)}
        </datalist>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((k) => (
              <button key={k} type="button" onClick={() => onChange({ enforcementRequestKind: k })}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold transition ${requestKind === k ? "border-edge bg-navy text-white" : "border-slate-200 text-slate-600 hover:border-edge-2 hover:text-ink"}`}>
                {k}
              </button>
            ))}
          </div>
        )}
      </div>
    )}
    </>
  );
}

export function ExecutionContentFields({ value, onChange }: {
  value: ExecutionDetails;
  onChange: (v: ExecutionDetails) => void;
}) {
  const set = <K extends keyof ExecutionDetails>(k: K, v: ExecutionDetails[K]) => onChange({ ...value, [k]: v });
  const amountOnly = (v: string) => v.replace(/[^\d.,]/g, "");
  const remaining = remainingAmount(value);
  const hasPayments = value.payments.length > 0;

  // أي تعديل في الدفعات يعيد حساب المستلم = مجموعها
  const setPayments = (payments: ExecutionPayment[]) =>
    onChange({ ...value, payments, receivedAmount: payments.length ? paymentsTotal(payments) : value.receivedAmount });
  const addPayment = () =>
    setPayments([...value.payments, { amount: "", date: new Date().toISOString().slice(0, 10), note: "" }]);
  const updatePayment = (i: number, patch: Partial<ExecutionPayment>) =>
    setPayments(value.payments.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <>
      <div className="space-y-2">
        <label className={label}>منطوق الحكم</label>
        <Textarea rows={4} value={value.judgmentText} onChange={(e) => set("judgmentText", e.target.value)}
          placeholder="اكتب منطوق الحكم كما ورد..." />
      </div>
      <div className="space-y-2">
        <label className={label}>مضمون الطلب</label>
        <Textarea rows={4} value={value.requestContent} onChange={(e) => set("requestContent", e.target.value)}
          placeholder="اكتب مضمون طلب التنفيذ..." />
      </div>

      <SectionTitle>المبالغ المالية</SectionTitle>
      <div className="space-y-2">
        <label className={label}>المبلغ المدون في السند / المحكوم به</label>
        <Input inputMode="decimal" dir="ltr" placeholder="0" value={value.deedAmount}
          onChange={(e) => set("deedAmount", amountOnly(e.target.value))} />
      </div>
      <div className="space-y-2">
        <label className={label}>المبلغ المستلم</label>
        <div className="flex gap-2">
          <Input inputMode="decimal" dir="ltr" placeholder="0" value={value.receivedAmount} readOnly={hasPayments}
            className={hasPayments ? "bg-gray-100 font-bold text-gray-700" : ""}
            onChange={(e) => set("receivedAmount", amountOnly(e.target.value))} />
          <button type="button" onClick={addPayment} title="إضافة دفعة"
            className="flex h-10 shrink-0 items-center gap-1 rounded-md border border-edge-2 px-3 text-sm font-bold text-ink transition hover:bg-navy hover:text-white">
            <Plus size={16} /> دفعة
          </button>
        </div>
        <p className="text-xs text-gray-400">
          {hasPayments ? "مجموع الدفعات أدناه — يتحدّث تلقائياً" : "اكتب المبلغ مباشرة، أو اضغط «+ دفعة» إن كان الاستلام على دفعات"}
        </p>
      </div>
      <div className="space-y-2">
        <label className={label}>المبلغ المتبقي</label>
        <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-100 px-3 text-sm font-bold text-gray-700">
          {remaining === null ? "—" : formatMoney(remaining)}
        </div>
        <p className="text-xs text-gray-400">يُحسب تلقائياً: المدون في السند − المستلم</p>
      </div>

      {hasPayments && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:col-span-2">
          <p className="text-sm font-bold text-ink">الدفعات المستلمة ({value.payments.length})</p>
          {value.payments.map((p, i) => (
            <div key={i} className="grid grid-cols-[2rem_1fr_9.5rem_1.4fr_2.25rem] items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-surface text-xs font-bold text-slate-500 ring-1 ring-slate-200">{i + 1}</span>
              <Input inputMode="decimal" dir="ltr" placeholder="المبلغ" value={p.amount} className="bg-surface"
                onChange={(e) => updatePayment(i, { amount: amountOnly(e.target.value) })} />
              <Input type="date" value={p.date} className="bg-surface" onChange={(e) => updatePayment(i, { date: e.target.value })} />
              <Input placeholder="ملاحظة (اختياري)" value={p.note} className="bg-surface" onChange={(e) => updatePayment(i, { note: e.target.value })} />
              <button type="button" title="حذف الدفعة" onClick={() => setPayments(value.payments.filter((_, j) => j !== i))}
                className="grid h-9 w-9 place-items-center rounded-md text-red-500 transition hover:bg-red-50">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addPayment}
            className="flex items-center gap-1 text-xs font-bold text-ink-2 hover:underline">
            <Plus size={14} /> إضافة دفعة أخرى
          </button>
        </div>
      )}

      <SectionTitle>بيانات السند</SectionTitle>
      <div className="space-y-2">
        <label className={label}>تاريخ تحرير السند</label>
        <Input type="date" value={value.deedDate} onChange={(e) => set("deedDate", e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className={label}>مكان تحرير / صدور السند</label>
        <Input value={value.deedPlace} onChange={(e) => set("deedPlace", e.target.value)} placeholder="مثال: السعودية" />
      </div>
      <div className="space-y-2">
        <label className={label}>المدينة</label>
        <Input value={value.deedCity} onChange={(e) => set("deedCity", e.target.value)} placeholder="مثال: الرياض" />
      </div>
      <div className="space-y-2">
        <label className={label}>مكان الوفاء</label>
        <Input value={value.paymentPlace} onChange={(e) => set("paymentPlace", e.target.value)} placeholder="مثال: الرياض" />
      </div>
      <div className="space-y-2">
        <label className={label}>حالة الاستحقاق</label>
        <SearchableSelect className={select} value={value.maturityStatus} onChange={(e) => set("maturityStatus", e.target.value)}>
          {MATURITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </SearchableSelect>
      </div>
    </>
  );
}
