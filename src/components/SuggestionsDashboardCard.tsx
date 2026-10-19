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
    <Link to="/app/suggestions" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#273c75]/25 bg-white p-6 font-sans text-[#192a56] shadow-sm transition hover:border-[#273c75] hover:shadow-md">
      <div className="flex items-center gap-4"><span className="rounded-xl bg-[#273c75]/15 p-3 text-[#192a56]"><Lightbulb size={28} /></span><div><h2 className="text-lg font-bold">مقترحات تطوير النظام</h2><p className="mt-1 text-sm text-[#192a56]/65">استقبال أفكار المستخدمين ومتابعة تنفيذها</p></div></div>
      <span className="rounded-xl bg-[#192a56] px-4 py-2 text-sm text-white">{stats ? `${stats.reviewing} مقترحات للمراجعة` : "فتح المقترحات"} ←</span>
    </Link>
  );
}
