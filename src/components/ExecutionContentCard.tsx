/** عرض «مضمون الطلب» لطلب التنفيذ — بيانات المبلغ وبيانات السند كما في ناجز */

import type { ReactNode } from "react";
import { formatGregorian } from "../lib/calendar";
import { executionDetailsOf, formatMoney, remainingAmount } from "../lib/execution";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

function Item({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`mt-1 text-base ${strong ? "font-extrabold text-[#133B2E]" : "font-bold text-gray-900"}`}>{children || "—"}</dd>
    </div>
  );
}

export default function ExecutionContentCard({ caseData }: { caseData: any }) {
  const d = executionDetailsOf(caseData);
  const remaining = remainingAmount(d);

  return (
    <Card className="shadow-sm md:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">مضمون الطلب</CardTitle>
        {caseData.enforcementDeedType && <p className="text-base font-bold text-[#1a9a45]">{caseData.enforcementDeedType}</p>}
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <h4 className="mb-2 text-sm font-bold text-[#1a9a45]">بيانات المبلغ</h4>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Item label="المبلغ المدون في السند / المحكوم به">{d.deedAmount && formatMoney(d.deedAmount)}</Item>
            <Item label="المبلغ المستلم">{formatMoney(d.receivedAmount || 0)}</Item>
            <Item label="المبلغ المتبقي">{remaining === null ? "—" : formatMoney(remaining)}</Item>
            <Item label="المبلغ المطلوب تنفيذه" strong>{d.requestedAmount && formatMoney(d.requestedAmount)}</Item>
          </dl>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-bold text-[#1a9a45]">بيانات السند</h4>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Item label="تاريخ تحرير السند">{d.deedDate && formatGregorian(d.deedDate)}</Item>
            <Item label="مكان تحرير / صدور السند">{d.deedPlace}</Item>
            <Item label="المدينة">{d.deedCity}</Item>
            <Item label="مكان الوفاء">{d.paymentPlace}</Item>
            <Item label="حالة الاستحقاق">{d.maturityStatus}</Item>
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}
