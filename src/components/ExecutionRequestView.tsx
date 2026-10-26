/**
 * صفحة طلب التنفيذ — نفس أقسام نموذج «إضافة طلب تنفيذ» وبنفس ترتيبها،
 * فكل حقل يُكتب في النموذج له مكانه هنا ويظهر فور الحفظ.
 */

import type { ReactNode } from "react";
import { Banknote, FileText, Gavel, Landmark, Pencil, ScrollText, UserCog, UsersRound } from "lucide-react";
import { formatGregorian } from "../lib/calendar";
import { clientRoleLabelOf, clientRoleOf, partyLabels } from "../lib/clientRole";
import { assignedLawyersLabel } from "../lib/assignedLawyers";
import {
  enforcementProgressOf, executionDetailsOf, executionStatusOf, formatMoney, remainingAmount,
} from "../lib/execution";

function Section({ icon, title, onEdit, className = "", children }: {
  icon: ReactNode; title: string; onEdit?: () => void; className?: string; children: ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-surface shadow-[0_1px_3px_rgba(25,42,86,0.06)] ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <h2 className="flex items-center gap-2.5 text-base font-bold text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy/10 text-ink">{icon}</span>
          {title}
        </h2>
        {onEdit && (
          <button type="button" onClick={onEdit}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-ink-2 transition hover:bg-slate-100 print:hidden">
            <Pencil size={12} /> تعديل
          </button>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ label, children, ltr = false, wide = false }: { label: string; children: ReactNode; ltr?: boolean; wide?: boolean }) {
  const empty = children === null || children === undefined || children === "" || children === false;
  return (
    <div className={`min-w-0 rounded-xl bg-slate-50 px-4 py-3 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words text-[15px] font-bold ${empty ? "font-normal text-slate-400" : "text-gray-900"}`}
        dir={ltr && !empty ? "ltr" : undefined} style={ltr && !empty ? { textAlign: "right" } : undefined}>
        {empty ? "غير محدد" : children}
      </dd>
    </div>
  );
}

function TextBlock({ children, empty, tone = "slate" }: { children?: string; empty: string; tone?: "slate" | "amber" }) {
  const box = tone === "amber" ? "border-amber-100 bg-amber-50/60" : "border-slate-100 bg-slate-50";
  return (
    <p className={`whitespace-pre-wrap rounded-xl border p-4 leading-relaxed ${box} ${children ? "font-medium text-gray-800" : "text-slate-400"}`}>
      {children || empty}
    </p>
  );
}

export default function ExecutionRequestView({ caseData: c, onEdit, attachments }: {
  caseData: any;
  onEdit: () => void;
  /** بطاقة المرفقات — تُدار من صفحة القضية (رفع وحذف) */
  attachments?: ReactNode;
}) {
  const d = executionDetailsOf(c);
  const remaining = remainingAmount(d);
  const status = executionStatusOf(c);
  const progress = enforcementProgressOf(c);
  const P = partyLabels(true);
  const clientIsPlaintiff = clientRoleOf(c) === "PLAINTIFF";
  const deed = Number(String(d.deedAmount).replace(/[^\d.]/g, "")) || 0;
  const received = Number(String(d.receivedAmount).replace(/[^\d.]/g, "")) || 0;
  const collectedPct = deed > 0 ? Math.min(100, Math.round((received / deed) * 100)) : null;

  return (
    <div className="space-y-5">
      {/* شريط الملخص */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-[0_1px_3px_rgba(25,42,86,0.06)]">
          <p className="text-xs text-slate-500">حالة الطلب</p>
          <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${status.pill}`}>
            <span className={`h-2 w-2 rounded-full ${status.dot}`} /> {status.label}
          </span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-[0_1px_3px_rgba(25,42,86,0.06)]">
          <p className="text-xs text-slate-500">نسبة إنجاز التنفيذ</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-ink">{progress}%</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${status.progress}`} style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-[0_1px_3px_rgba(25,42,86,0.06)]">
          <p className="text-xs text-slate-500">المبلغ المدون في السند</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-ink">{d.deedAmount ? formatMoney(d.deedAmount) : "—"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-[0_1px_3px_rgba(25,42,86,0.06)]">
          <p className="text-xs text-slate-500">المبلغ المتبقي</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-ink">{remaining === null ? "—" : formatMoney(remaining)}</p>
          {collectedPct !== null && <p className="mt-0.5 text-xs text-slate-500">حُصّل {collectedPct}% من المدون في السند</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section icon={<FileText size={16} />} title="بيانات الطلب" onEdit={onEdit}>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="عنوان الطلب" wide>{c.title}</Field>
            <Field label="رقم الطلب" ltr>{c.caseNumber}</Field>
            <Field label="تصنيف الطلب">{c.enforcementRequestType}</Field>
            <Field label="نوع الطلب">{c.enforcementRequestKind}</Field>
            <Field label="تاريخ تقديم الطلب">{c.startDate && formatGregorian(c.startDate)}</Field>
            <Field label="الوقت" ltr>{c.startTime}</Field>
          </dl>
        </Section>

        <Section icon={<UsersRound size={16} />} title="أطراف الطلب" onEdit={onEdit}>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="العميل">{c.client?.fullName}</Field>
            <Field label="صفة العميل في الطلب">{clientRoleLabelOf(c)}</Field>
            <Field label={`${P.PLAINTIFF}${clientIsPlaintiff ? " (العميل)" : ""}`}>{c.plaintiffName}</Field>
            <Field label={`${P.DEFENDANT}${clientIsPlaintiff ? "" : " (العميل)"}`}>{c.defendantName}</Field>
            <Field label={`محامي ${clientIsPlaintiff ? P.DEFENDANT : P.PLAINTIFF}`} wide>{c.opponentLawyer}</Field>
          </dl>
        </Section>

        <Section icon={<Landmark size={16} />} title="المحكمة" onEdit={onEdit} className="xl:col-span-2">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="المحكمة">{c.courtName}</Field>
            <Field label="الدائرة القضائية">{c.courtCircle}</Field>
          </dl>
        </Section>

        <Section icon={<Gavel size={16} />} title="منطوق الحكم" onEdit={onEdit}>
          <TextBlock empty="لم يُكتب منطوق الحكم بعد.">{d.judgmentText}</TextBlock>
        </Section>

        <Section icon={<FileText size={16} />} title="مضمون الطلب" onEdit={onEdit}>
          <TextBlock empty="لم يُكتب مضمون الطلب بعد.">{d.requestContent}</TextBlock>
        </Section>

        <Section icon={<Banknote size={16} />} title="المبالغ المالية" onEdit={onEdit}>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="المبلغ المدون في السند / المحكوم به">{d.deedAmount && formatMoney(d.deedAmount)}</Field>
            <Field label={d.payments.length ? `المبلغ المستلم (${d.payments.length} دفعات)` : "المبلغ المستلم"}>{formatMoney(d.receivedAmount || 0)}</Field>
            <Field label="المبلغ المتبقي" wide>{remaining !== null && formatMoney(remaining)}</Field>
          </dl>
          {d.payments.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold text-slate-500">الدفعات المستلمة</p>
              <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {d.payments.map((p, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{i + 1}</span>
                    <span className="font-bold tabular-nums text-gray-900">{formatMoney(p.amount || 0)}</span>
                    <span className="text-slate-500">{p.date ? formatGregorian(p.date) : "بلا تاريخ"}</span>
                    {p.note && <span className="min-w-0 flex-1 truncate text-xs text-slate-400" title={p.note}>{p.note}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Section>

        <Section icon={<ScrollText size={16} />} title="بيانات السند" onEdit={onEdit}>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="تاريخ تحرير السند">{d.deedDate && formatGregorian(d.deedDate)}</Field>
            <Field label="مكان تحرير / صدور السند">{d.deedPlace}</Field>
            <Field label="المدينة">{d.deedCity}</Field>
            <Field label="مكان الوفاء">{d.paymentPlace}</Field>
            <Field label="حالة الاستحقاق" wide>{d.maturityStatus}</Field>
          </dl>
        </Section>

        <Section icon={<UserCog size={16} />} title="المسؤولون والملاحظات" onEdit={onEdit} className="xl:col-span-2">
          <dl className="mb-3 grid grid-cols-1 gap-3">
            <Field label="الأشخاص المسؤولون">{assignedLawyersLabel(c, "")}</Field>
          </dl>
          <p className="mb-1.5 text-xs text-slate-500">ملاحظات</p>
          <TextBlock tone="amber" empty="لا توجد ملاحظات.">{c.notes}</TextBlock>
        </Section>
      </div>

      {attachments}
    </div>
  );
}
