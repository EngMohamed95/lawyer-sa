/**
 * حقول طلب التنفيذ في نموذج إضافة/تعديل القضية — نوع الطلب والسند، و«مضمون الطلب»
 * (بيانات المبلغ وبيانات السند) كما في ناجز.
 */

import {
  EXECUTION_DEED_TYPES, EXECUTION_REQUEST_TYPES, MATURITY_STATUSES, formatMoney, remainingAmount,
  type ExecutionDetails,
} from "../lib/execution";
import { Input } from "./ui/input";

const label = "text-sm font-bold text-[#133B2E]";
const select = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export const SectionTitle = ({ children }: { children: string }) => (
  <div className="md:col-span-2 mt-2 flex items-center gap-2 border-t border-gray-200 pt-4 text-base font-bold text-[#133B2E]">
    <span className="h-5 w-1.5 rounded-full bg-[#D4AF37]" />{children}
  </div>
);

export function ExecutionTypeFields({ requestType, deedType, onChange }: {
  requestType: string;
  deedType: string;
  onChange: (patch: { enforcementRequestType?: string; enforcementDeedType?: string }) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <label className={label}>نوع الطلب *</label>
        <select required className={select} value={requestType} onChange={(e) => onChange({ enforcementRequestType: e.target.value })}>
          <option value="">— اختر —</option>
          {EXECUTION_REQUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label className={label}>نوع السند *</label>
        <select required className={select} value={deedType} onChange={(e) => onChange({ enforcementDeedType: e.target.value })}>
          <option value="">— اختر —</option>
          {EXECUTION_DEED_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </>
  );
}

export function ExecutionContentFields({ value, onChange }: {
  value: ExecutionDetails;
  onChange: (v: ExecutionDetails) => void;
}) {
  const set = <K extends keyof ExecutionDetails>(k: K, v: ExecutionDetails[K]) => onChange({ ...value, [k]: v });
  const money = (k: "deedAmount" | "receivedAmount" | "requestedAmount", text: string) => (
    <div className="space-y-2">
      <label className={label}>{text}</label>
      <Input inputMode="decimal" dir="ltr" placeholder="0" value={value[k]}
        onChange={(e) => set(k, e.target.value.replace(/[^\d.,]/g, ""))} />
    </div>
  );
  const remaining = remainingAmount(value);

  return (
    <>
      <SectionTitle>مضمون الطلب — بيانات المبلغ</SectionTitle>
      {money("deedAmount", "المبلغ المدون في السند / المحكوم به")}
      {money("receivedAmount", "المبلغ المستلم")}
      <div className="space-y-2">
        <label className={label}>المبلغ المتبقي</label>
        <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-100 px-3 text-sm font-bold text-gray-700">
          {remaining === null ? "—" : formatMoney(remaining)}
        </div>
        <p className="text-xs text-gray-400">يُحسب تلقائياً: المدون في السند − المستلم</p>
      </div>
      {money("requestedAmount", "المبلغ المطلوب تنفيذه")}

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
        <select className={select} value={value.maturityStatus} onChange={(e) => set("maturityStatus", e.target.value)}>
          {MATURITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </>
  );
}
