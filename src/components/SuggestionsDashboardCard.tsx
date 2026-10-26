import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Lightbulb } from "lucide-react";
import { getSuggestionStats, loadSuggestionProfile, type SuggestionStats } from "../lib/suggestions";
import { useAuthSession } from "../lib/useAuthSession";

export default function SuggestionsDashboardCard() {
  const { state } = useAuthSession();
  const [stats, setStats] = useState<SuggestionStats | null>(null);
  useEffect(() => {
    if (state !== "authenticated") return;
    let active = true;
    loadSuggestionProfile().then(getSuggestionStats).then((data) => active && setStats(data)).catch(() => {});
    return () => { active = false; };
  }, [state]);
  return (
    <Link to="/app/suggestions" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-edge-2/25 bg-surface p-6 font-sans text-ink shadow-sm transition hover:border-edge-2 hover:shadow-md">
      <div className="flex items-center gap-4"><span className="rounded-xl bg-navy-2/15 p-3 text-ink"><Lightbulb size={28} /></span><div><h2 className="text-lg font-bold">مقترحات تطوير النظام</h2><p className="mt-1 text-sm text-ink/65">استقبال أفكار المستخدمين ومتابعة تنفيذها</p></div></div>
      <span className="rounded-xl bg-navy px-4 py-2 text-sm text-white">{stats ? `${stats.reviewing} مقترحات للمراجعة` : "فتح المقترحات"} ←</span>
    </Link>
  );
}
