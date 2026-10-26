/** تبويب «المظهر» — فاتح / داكن / حسب الجهاز. التفضيل محفوظ لهذا المتصفح. */

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePref } from "../../lib/theme";

const OPTIONS: { value: ThemePref; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "فاتح", hint: "خلفيات بيضاء — المظهر الافتراضي", icon: Sun },
  { value: "dark", label: "داكن", hint: "أريح للعين في الإضاءة الخافتة", icon: Moon },
  { value: "system", label: "حسب الجهاز", hint: "يتبع إعداد نظام التشغيل تلقائياً", icon: Monitor },
];

export default function AppearanceTab() {
  const { pref, setPref } = useTheme();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-ink">مظهر النظام</h3>
        <p className="mt-1 text-sm text-gray-500">يُحفظ اختيارك على هذا الجهاز، ويمكنك التبديل سريعاً من المفتاح بجانب التنبيهات.</p>
      </div>
      <div role="radiogroup" aria-label="مظهر النظام" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
          const selected = pref === value;
          return (
            <label key={value}
              className={`relative flex cursor-pointer flex-col gap-3 rounded-2xl border-2 p-4 transition ${
                selected ? "border-edge bg-navy/[0.04]" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}>
              <input type="radio" name="theme" value={value} checked={selected} onChange={() => setPref(value)} className="sr-only" />
              {/* معاينة مصغّرة للمظهر — بألوان ثابتة لا تتبع الوضع الحالي */}
              <div className="flex h-20 overflow-hidden rounded-xl ring-1 ring-black/10">
                {(value === "system" ? ["light", "dark"] : [value]).map((m) => (
                  <div key={m} className="flex flex-1 gap-1.5 p-2" style={{ background: m === "dark" ? "#0b1120" : "#F3F4F6" }}>
                    <div className="w-4 rounded" style={{ background: "#192a56" }} />
                    <div className="flex flex-1 flex-col gap-1.5 rounded p-1.5" style={{ background: m === "dark" ? "#111a2e" : "#ffffff" }}>
                      <div className="h-1.5 w-2/3 rounded" style={{ background: m === "dark" ? "#e6ebf7" : "#192a56" }} />
                      <div className="h-1.5 w-1/2 rounded" style={{ background: m === "dark" ? "#64738f" : "#cbd5e1" }} />
                    </div>
                  </div>
                ))}
              </div>
              <span className="flex items-center gap-2">
                <Icon size={16} className="text-ink-2" />
                <span className="font-bold text-ink">{label}</span>
                {selected && <Check size={16} className="mr-auto text-ink-2" />}
              </span>
              <span className="-mt-2 text-xs text-gray-500">{hint}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
