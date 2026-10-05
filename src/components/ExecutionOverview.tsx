/**
 * «إحصائيات عامة لطلبات التنفيذ» بتصميم ناجز — دوائر إحصاء قابلة للنقر
 * تُرشِّح جدول ملفات التنفيذ تحتها، مع اختيار الصفة (طالب تنفيذ / منفذ ضده).
 */

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, UserPen, UserRound, UsersRound } from "lucide-react";

export type ExecutionFilter = "ALL" | "INCOMPLETE" | "FOR_REQUESTER" | "FOR_DEBTOR" | "OVERDUE" | "CLOSED";
export type ExecutionCapacity = "ANY" | "REQUESTER" | "DEBTOR";

/** الحقول التي بدونها لا يكتمل ملف التنفيذ */
export const isExecutionIncomplete = (c: any) =>
  !c.enforcementClosureReason && (!c.caseNumber || !c.enforcementIban || !c.enforcementNoticeDeadline);

export const isExecutionOverdue = (c: any) =>
  !!c.enforcementNoticeDeadline && !c.enforcementClosureReason &&
  new Date(c.enforcementNoticeDeadline).getTime() < Date.now();

/** العميل طالب التنفيذ ما لم تُسجَّل صفته مدعى عليه */
export const isForDebtor = (c: any) => c.clientRole === "DEFENDANT";

export function matchesExecution(c: any, filter: ExecutionFilter, capacity: ExecutionCapacity): boolean {
  if (capacity === "REQUESTER" && isForDebtor(c)) return false;
  if (capacity === "DEBTOR" && !isForDebtor(c)) return false;
  switch (filter) {
    case "INCOMPLETE": return isExecutionIncomplete(c);
    case "FOR_REQUESTER": return !isForDebtor(c);
    case "FOR_DEBTOR": return isForDebtor(c);
    case "OVERDUE": return isExecutionOverdue(c);
    case "CLOSED": return !!c.enforcementClosureReason;
    default: return true;
  }
}

const STATS: { key: ExecutionFilter; label: string; icon: ReactNode; note?: string }[] = [
  { key: "ALL", label: "طلباتي", icon: <FileText size={24} /> },
  { key: "INCOMPLETE", label: "مطلوب استكمال البيانات", icon: <UserPen size={24} />, note: "رقم الطلب أو الآيبان أو مهلة التنفيذ ناقصة" },
  { key: "FOR_REQUESTER", label: "طلبات بالنيابة عن طالب تنفيذ", icon: <UserRound size={24} /> },
  { key: "FOR_DEBTOR", label: "طلبات بالنيابة عن منفذ ضده", icon: <UsersRound size={24} /> },
  { key: "OVERDUE", label: "تجاوزت مهلة التنفيذ", icon: <AlertTriangle size={24} /> },
  { key: "CLOSED", label: "ملفات مغلقة", icon: <CheckCircle2 size={24} /> },
];

export default function ExecutionOverview({ cases, filter, capacity, onFilter, onCapacity, onShowDetails, onExport }: {
  cases: any[];
  filter: ExecutionFilter;
  capacity: ExecutionCapacity;
  onFilter: (f: ExecutionFilter) => void;
  onCapacity: (c: ExecutionCapacity) => void;
  onShowDetails: () => void;
  onExport: () => void;
}) {
  const countOf = (key: ExecutionFilter) => cases.filter((c) => matchesExecution(c, key, capacity)).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
      <section className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-gray-900">إحصائيات عامة لطلبات التنفيذ</h2>
          <div className="flex gap-2">
            <button onClick={onShowDetails}
              className="px-5 py-2 rounded-md bg-[#1a9a45] hover:bg-[#15803a] text-white text-sm font-bold transition">
              عرض التفاصيل
            </button>
            <button onClick={onExport}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-gray-300 text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
              <FileSpreadsheet size={15} className="text-green-600" /> تحميل
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {STATS.map((s) => {
            const active = filter === s.key;
            return (
              <button key={s.key} onClick={() => onFilter(active && s.key !== "ALL" ? "ALL" : s.key)}
                title={s.note}
                className={`group flex items-center gap-3 rounded-xl p-2 text-right transition ${active ? "bg-green-50" : "hover:bg-gray-50"}`}>
                <span className={`h-14 w-14 shrink-0 rounded-full border-2 flex items-center justify-center transition ${
                  active ? "border-[#1a9a45] text-[#1a9a45]" : "border-gray-700 text-gray-700 group-hover:border-[#1a9a45]"
                }`}>
                  {s.icon}
                </span>
                <span className="min-w-0">
                  <span className={`block text-lg font-bold ${s.key === "OVERDUE" && countOf(s.key) > 0 ? "text-red-600" : "text-[#1a9a45]"}`}>
                    {countOf(s.key)}
                  </span>
                  <span className="block text-xs text-gray-600 leading-snug">{s.label}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-blue-700">
          ملفات التنفيذ الناقصة تحتاج رقم الطلب والآيبان ومهلة التنفيذ حتى تكتمل متابعتها.
        </p>
      </section>

      <section className="p-6 space-y-3">
        <h3 className="text-base font-bold text-gray-900">الصفة في طلبات التنفيذ</h3>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-gray-700">
          <span>عرض ملفات التنفيذ بصفتك:</span>
          {([["ANY", "الكل"], ["REQUESTER", "طالب تنفيذ"], ["DEBTOR", "منفذ ضده"]] as [ExecutionCapacity, string][]).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="execution-capacity" checked={capacity === v} onChange={() => onCapacity(v)}
                className="h-5 w-5 accent-[#1a9a45]" />
              {label}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
