/**
 * اختيار صفة العميل — خياران بعلامة اختيار، لكل منهما شرح بسيط،
 * وتحتهما ملخص يوضّح من هو العميل ومن هو الخصم بعد الاختيار.
 */

import { Check, UserRound, Swords } from "lucide-react";
import { partyLabels } from "../lib/clientRole";

type Role = "PLAINTIFF" | "DEFENDANT";

const DESCRIPTIONS: Record<"exec" | "case", Record<Role, string>> = {
  exec: {
    PLAINTIFF: "نطالب بتنفيذ الحكم أو السند لصالح العميل ضد الطرف الآخر.",
    DEFENDANT: "التنفيذ مطلوب ضد العميل، ونحن نمثّله في مواجهته.",
  },
  case: {
    PLAINTIFF: "العميل هو من رفع الدعوى ويطالب بحقه.",
    DEFENDANT: "الدعوى مرفوعة ضد العميل، ونحن ندافع عنه.",
  },
};

export default function ClientRoleChoice({ value, onChange, isExec, clientName }: {
  value: string;
  onChange: (role: Role) => void;
  isExec: boolean;
  /** اسم العميل المختار — يظهر في الملخص إن وُجد */
  clientName?: string;
}) {
  const P = partyLabels(isExec);
  const opponentRole: Role = value === "PLAINTIFF" ? "DEFENDANT" : "PLAINTIFF";

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={`صفة العميل في ${isExec ? "الطلب" : "القضية"}`} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["PLAINTIFF", "DEFENDANT"] as Role[]).map((role) => {
          const selected = value === role;
          return (
            <label key={role}
              className={`relative flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition ${
                selected ? "border-edge bg-navy/[0.04] shadow-sm" : "border-slate-200 bg-surface hover:border-slate-300 hover:bg-slate-50"
              }`}>
              <input type="radio" name="clientRole" value={role} checked={selected} onChange={() => onChange(role)} className="sr-only" />
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${
                selected ? "border-edge bg-navy text-white" : "border-slate-300 bg-surface text-transparent"
              }`}>
                <Check size={14} strokeWidth={3} />
              </span>
              <span className="min-w-0">
                <span className={`block text-[15px] font-bold ${selected ? "text-ink" : "text-slate-700"}`}>
                  العميل هو {P[role]}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{DESCRIPTIONS[isExec ? "exec" : "case"][role]}</span>
              </span>
            </label>
          );
        })}
      </div>

      {/* ملخص الاختيار */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm">
        <span className="font-bold text-slate-500">النتيجة:</span>
        <span className="flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 font-bold text-ink ring-1 ring-slate-200">
          <UserRound size={14} /> {clientName || "العميل"} = {P[value as Role] || P.PLAINTIFF}
        </span>
        <span className="flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 font-bold text-rose-700 ring-1 ring-slate-200">
          <Swords size={14} /> الخصم = {P[opponentRole]}
        </span>
      </div>
    </div>
  );
}
