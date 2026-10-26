/**
 * بطاقة الجلسة بتصميم ناجز — تُستخدم في صفحة الجلسات وتبويب جلسات القضية.
 * الأزرار الإضافية (مثل التعديل) تُمرَّر عبر `actions`.
 */

import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeft, Gavel } from "lucide-react";
import { formatGregorian } from "../lib/calendar";

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
  upcoming: "text-ink-2 font-bold",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 items-baseline">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="text-sm text-gray-900 truncate" title={typeof children === "string" ? children : undefined}>{children}</dd>
    </div>
  );
}

/** يوم وشهر وسنة منفصلة لعمود التاريخ في صف الجلسة */
function dateParts(value?: string) {
  const d = value ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", o).format(d);
  return { day: part({ day: "numeric" }), month: part({ month: "long" }), year: part({ year: "numeric" }) };
}

/**
 * صف جلسة في قائمة — الصف كله رابط يفتح تفاصيل الجلسة.
 * الحالة هنا تفرّق بين المنتهية بقرار والتي لم تُسجَّل نتيجتها بعد.
 */
export function HearingListRow({ h, caseId }: { h: any; caseId: string }) {
  const status = hearingStatus(h.hearingDate);
  const date = dateParts(h.hearingDate);
  const awaiting = status === "past" && !h.result;
  const pill = status === "today" ? "bg-amber-100 text-amber-800"
    : status === "upcoming" ? "bg-navy-2/10 text-ink-2"
    : awaiting ? "bg-orange-100 text-orange-800" : "bg-emerald-50 text-emerald-700";
  const label = awaiting ? "بانتظار النتيجة" : STATUS_LABEL[status];
  const place = [h.court, h.circuit].filter(Boolean).join(" • ");
  const detail = h.result ? `القرار: ${h.result}` : h.judgeRequests ? `الإجراء القادم: ${h.judgeRequests}` : h.requiredActions ? `ملخص الجلسة: ${h.requiredActions}` : "";

  return (
    <Link to={`/app/hearings/${caseId}/${h.id}`}
      className={`group flex items-center gap-4 rounded-xl border px-4 py-3.5 shadow-[0_1px_3px_rgba(25,42,86,0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(25,42,86,0.12)] ${
        status === "today" ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-surface hover:border-edge-2/30"
      }`}>
      {/* التاريخ */}
      <div className={`flex w-16 shrink-0 flex-col items-center rounded-lg border py-1.5 text-center ${status === "today" ? "border-amber-300 bg-surface" : "border-slate-200 bg-surface"}`}>
        {date ? (<>
          <span className="text-xl font-black leading-none text-ink">{date.day}</span>
          <span className="mt-1 text-[11px] font-bold text-slate-600">{date.month}</span>
          <span className="text-[10px] text-slate-400">{date.year}</span>
        </>) : <span className="text-xs text-slate-400">بلا تاريخ</span>}
      </div>

      {/* القضية والمكان */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="truncate font-bold text-gray-900">{h.caseTitle || "جلسة"}</h3>
          {h.caseNumber && h.caseNumber !== "---" && <span className="text-xs text-gray-500" dir="ltr">{h.caseNumber}</span>}
        </div>
        <p className="mt-0.5 truncate text-sm text-slate-600">
          {place || "—"}{h.hearingTime && <span className="text-slate-400"> · الساعة <bdi dir="ltr">{h.hearingTime}</bdi></span>}
        </p>
        {detail && <p className="mt-0.5 truncate text-xs text-slate-500" title={detail}>{detail}</p>}
      </div>

      {/* الحالة */}
      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${pill}`}>{label}</span>
      <ChevronLeft size={18} className="shrink-0 text-slate-300 transition group-hover:-translate-x-0.5 group-hover:text-ink-2" />
    </Link>
  );
}

export default function HearingCard({ h, caseId, showCase = true, actions }: {
  h: any;
  caseId: string;
  /** اسم القضية كعنوان — يُخفى داخل صفحة القضية نفسها */
  showCase?: boolean;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const status = hearingStatus(h.hearingDate);
  const title = showCase ? (h.caseTitle || "جلسة") : "جلسة";
  const href = `/app/hearings/${caseId}/${h.id}`;

  // الضغط في أي مكان بالبطاقة يفتح الجلسة — عدا الأزرار والروابط، وعدا تحديد نص للنسخ
  const openHearing = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button, input, select, textarea, [role=dialog]")) return;
    if (window.getSelection()?.toString()) return;
    navigate(href);
  };

  return (
    <div onClick={openHearing} className={`flex cursor-pointer flex-col bg-surface rounded-lg border-2 transition hover:shadow-md ${
      status === "today" ? "border-amber-300" : "border-indigo-200"
    }`}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-navy-2/10 text-ink-2 flex items-center justify-center">
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
          <p className="text-base font-bold text-gray-700">{formatGregorian(h.hearingDate)}</p>
          {h.hearingTime && <p className="text-sm text-gray-500" dir="ltr">{h.hearingTime}</p>}
        </div>
      </div>

      <dl className="px-4 py-3 space-y-2 flex-1">
        <Row label="حالة الجلسة"><span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span></Row>
        <Row label="المحكمة">{h.court || "-"}</Row>
        <Row label="الدائرة">{h.circuit || "-"}</Row>
        {h.judgeRequests
          ? <Row label="الإجراء القادم">{h.judgeRequests}</Row>
          : <Row label="ملخص الجلسة">{h.requiredActions || "-"}</Row>}
        {h.result && <Row label="القرار">{h.result}</Row>}
      </dl>

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Link to={href}
            className="px-5 py-1.5 rounded-md bg-navy-2 hover:bg-navy text-white text-sm font-bold transition">
            عرض
          </Link>
          {actions}
        </div>
        {h.nextHearingDate && (
          <span className="text-xs text-gray-400">الجلسة القادمة: {formatGregorian(h.nextHearingDate)}</span>
        )}
      </div>
    </div>
  );
}
