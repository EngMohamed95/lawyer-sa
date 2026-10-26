/**
 * المظهر: فاتح / داكن / حسب الجهاز — يُحفظ في المتصفح ويُطبَّق بالفئة .dark على <html>.
 * سكربت صغير في index.html يطبّقه قبل تحميل React فلا يومض الفاتح عند الفتح؛
 * يجب أن يبقى مفتاح التخزين ومنطقه مطابقين لما هنا.
 */

import { useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "system";

const KEY = "los-theme";
const listeners = new Set<() => void>();
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

const isDark = (pref: ThemePref) => pref === "dark" || (pref === "system" && media().matches);

function apply(pref: ThemePref) {
  const dark = isDark(pref);
  const html = document.documentElement;
  html.classList.toggle("dark", dark);
  html.style.colorScheme = dark ? "dark" : "light";
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // التخزين محظور (تصفح خاص) — يُطبَّق للجلسة الحالية فقط
  }
  apply(pref);
  listeners.forEach((l) => l());
}

// مستمع واحد لمظهر الجهاز — يكفي لكل المكوّنات، ويعمل فقط عند اختيار «حسب الجهاز»
let watchingDevice = false;
const subscribe = (l: () => void) => {
  if (!watchingDevice && typeof window !== "undefined") {
    watchingDevice = true;
    media().addEventListener("change", () => {
      if (getThemePref() !== "system") return;
      apply("system");
      listeners.forEach((fn) => fn());
    });
  }
  listeners.add(l);
  return () => listeners.delete(l);
};

// اللقطة تجمع المختار والفعلي — تغيّر مظهر الجهاز وحده (والمختار «حسب الجهاز») يجب أن يعيد الرسم
const snapshot = () => {
  const pref = getThemePref();
  return `${pref}|${isDark(pref) ? "dark" : "light"}`;
};

/** المظهر المختار والمظهر الفعلي (resolved) — ويتابع تغيّر مظهر الجهاز عند اختيار «حسب الجهاز» */
export function useTheme() {
  const [pref, resolved] = useSyncExternalStore(subscribe, snapshot, () => "light|light").split("|") as [ThemePref, "light" | "dark"];
  return { pref, resolved, setPref: setThemePref };
}
