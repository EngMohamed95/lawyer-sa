/** اختيار أكثر من محامٍ مسؤول عن القضية — أزرار تبديل بدل قائمة منسدلة مفردة */

import { Check } from "lucide-react";

export default function LawyerMultiSelect({ lawyers, value, onChange }: {
  lawyers: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  if (!lawyers.length) {
    return <p className="text-xs text-gray-400">لا يوجد محامون في المكتب بعد.</p>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {lawyers.map((l) => {
          const on = value.includes(l.id);
          return (
            <button key={l.id} type="button" onClick={() => toggle(l.id)} aria-pressed={on}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                on ? "border-[#133B2E] bg-[#133B2E] text-white" : "border-gray-200 bg-gray-50 text-gray-700 hover:border-[#133B2E]/40 hover:bg-white"
              }`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-[#D4AF37] bg-[#D4AF37] text-[#133B2E]" : "border-gray-300 bg-white"}`}>
                {on && <Check size={12} strokeWidth={3} />}
              </span>
              {l.name}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-400">
        {value.length === 0 ? "لم يُحدَّد محامٍ — اختر واحداً أو أكثر." : `تم اختيار ${value.length} ${value.length === 1 ? "محامٍ" : "محامين"}.`}
      </p>
    </div>
  );
}
