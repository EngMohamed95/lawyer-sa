/**
 * عدّاد استهلاك المكتب من المساعد الذكي هذا الشهر.
 * يتحدّث بعد كل رد ناجح (AI_USAGE_EVENT). لا يظهر لمدير المنصة.
 */

import { useEffect, useState } from "react";
import { AI_USAGE_EVENT, loadMyAiUsage, type AiUsage } from "../lib/aiUsage";

const fmt = (n: number) => n.toLocaleString("ar-EG");

export default function AiUsageMeter({ className = "" }: { className?: string }) {
  const [usage, setUsage] = useState<AiUsage | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => { void loadMyAiUsage().then((u) => { if (alive) setUsage(u); }); };
    refresh();
    window.addEventListener(AI_USAGE_EVENT, refresh);
    return () => { alive = false; window.removeEventListener(AI_USAGE_EVENT, refresh); };
  }, []);

  if (!usage) return null;
  const { used, quota } = usage;
  const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const tone = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className={`text-xs ${className}`} title="طلبات المساعد الذكي لمكتبك هذا الشهر">
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-500">استهلاك المكتب هذا الشهر</span>
        <span className={`font-bold tabular-nums ${pct >= 100 ? "text-red-600" : pct >= 80 ? "text-amber-600" : "text-ink"}`}>
          {quota ? `${fmt(used)} / ${fmt(quota)}` : `${fmt(used)} طلب`}
        </span>
      </div>
      {quota > 0 && (
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-200">
          <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${Math.max(pct, used ? 2 : 0)}%` }} />
        </div>
      )}
      {quota > 0 && pct >= 100 && (
        <p className="mt-1.5 text-[11px] leading-5 text-red-600">انتهت حصة هذا الشهر. تتجدد أول الشهر القادم.</p>
      )}
    </div>
  );
}
