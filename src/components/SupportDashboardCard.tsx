import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Headset } from "lucide-react";
import {
  getSupportStats,
  loadSupportProfile,
  type SupportStats,
} from "../lib/support";
import { useAuthSession } from "../lib/useAuthSession";

export default function SupportDashboardCard() {
  const { state } = useAuthSession();
  const [counts, setCounts] = useState<SupportStats | null>(null);
  useEffect(() => {
    if (state !== "authenticated") return;
    let active = true;
    loadSupportProfile()
      .then(getSupportStats)
      .then((data) => {
        if (active) setCounts(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [state]);
  return (
    <Link
      to="/app/support/tickets"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#133B2E] p-6 font-sans text-white shadow-sm ring-1 ring-[#D4AF37]/20 transition hover:bg-[#0d2a20]"
    >
      <div className="flex items-center gap-4">
        <Headset className="text-[#D4AF37]" size={30} />
        <div>
          <h2 className="text-lg font-bold">مركز الدعم الفني</h2>
          <p className="mt-1 text-sm text-white/70">
            متابعة تذاكر المستخدمين والرد عليها
          </p>
        </div>
      </div>
      <span className="rounded-xl bg-white/10 px-4 py-2 text-sm">
        {counts ? `${counts.active} تذاكر قيد المتابعة` : "فتح إدارة التذاكر"} ←
      </span>
    </Link>
  );
}
