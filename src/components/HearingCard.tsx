/**
 * بطاقة الجلسة بتصميم ناجز — تُستخدم في صفحة الجلسات وتبويب جلسات القضية.
 * الأزرار الإضافية (مثل التعديل) تُمرَّر عبر `actions`.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";
import { Gavel } from "lucide-react";
import { formatHijri } from "../lib/calendar";

type HearingStatus = "today" | "past" | "upcoming";

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function hearingStatus(hearingDate?: string): HearingStatus {
  const date = (hearingDate || "").slice(0, 10);
  const today = localToday();
  if (date === today) return "today";
  return date < today ? "past" : "upcoming";
}

const STATUS_LABEL: Record<HearingStatus, string> = { today: "اليوم", past: "منتهية", upcoming: "قادمة" };
const STATUS_CLASS: Record<HearingStatus, string> = {
  today: "text-amber-700 font-bold",
  past: "text-gray-900",
  upcoming: "text-[#1a9a45] font-bold",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 items-baseline">
      <dt className="text-sm text-[#1a9a45]">{label}</dt>
      <dd className="text-sm text-gray-900 truncate" title={typeof children === "string" ? children : undefined}>{children}</dd>
    </div>
  );
}

export default function HearingCard({ h, caseId, showCase = true, actions }: {
  h: any;
  caseId: string;
  /** اسم القضية كعنوان — يُخفى داخل صفحة القضية نفسها */
  showCase?: boolean;
  actions?: ReactNode;
}) {
  const status = hearingStatus(h.hearingDate);
  const title = showCase ? (h.caseTitle || "جلسة") : "جلسة";

  return (
    <div className={`flex flex-col bg-white rounded-lg border-2 transition hover:shadow-md ${
      status === "today" ? "border-amber-300" : "border-[#bfe3d6]"
    }`}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-[#1a9a45]/10 text-[#1a9a45] flex items-center justify-center">
            <Gavel size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 leading-snug line-clamp-2">{title}</h3>
            {showCase && h.caseNumber && h.caseNumber !== "---" && (
              <p className="text-xs text-gray-500 mt-0.5" dir="ltr" style={{ textAlign: "right" }}>{h.caseNumber}</p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-left">
          <p className="text-base font-bold text-gray-700">{formatHijri(h.hearingDate)}</p>
          {h.hearingTime && <p className="text-sm text-gray-500" dir="ltr">{h.hearingTime}</p>}
        </div>
      </div>

      <dl className="px-4 py-3 space-y-2 flex-1">
        <Row label="حالة الجلسة"><span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span></Row>
        <Row label="المحكمة">{h.court || "-"}</Row>
        <Row label="الدائرة">{h.circuit || "-"}</Row>
        {h.judgeRequests
          ? <Row label="طلبات القاضي">{h.judgeRequests}</Row>
          : <Row label="الالتماسات">{h.requiredActions || "-"}</Row>}
        {h.result && <Row label="القرار">{h.result}</Row>}
      </dl>

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Link to={`/app/hearings/${caseId}/${h.id}`}
            className="px-5 py-1.5 rounded-md bg-[#1a9a45] hover:bg-[#15803a] text-white text-sm font-bold transition">
            عرض
          </Link>
          {actions}
        </div>
        {h.nextHearingDate && (
          <span className="text-xs text-gray-400">الجلسة القادمة: {formatHijri(h.nextHearingDate)}</span>
        )}
      </div>
    </div>
  );
}
