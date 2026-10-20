/** عناصر مشتركة لصفحات إدارة المنصة — نفس هوية لوحة تحكم المنصة */

import type { ReactNode } from "react";

export const adminPanel = "rounded-2xl border border-slate-100 bg-white text-[#192a56] shadow-md";

export function AdminHeader({ icon, title, subtitle, actions }: { icon: ReactNode; title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-l from-[#192a56] to-[#273c75] p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10">{icon}</span>
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-white/70">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** زر أبيض في الترويسة الكحلية */
export function HeaderButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#192a56] transition hover:bg-blue-50 disabled:opacity-60">
      {children}
    </button>
  );
}

export function AdminStat({ title, value, sub, icon, iconClass }: { title: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; iconClass: string }) {
  return (
    <div className={`${adminPanel} p-5 transition-all hover:shadow-lg`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-slate-400">{title}</p>
          <div className="truncate text-2xl font-bold tracking-tight text-[#192a56] sm:text-3xl">{value}</div>
          {sub && <p className="mt-1 truncate text-xs text-slate-500">{sub}</p>}
        </div>
        <span className={`flex shrink-0 items-center justify-center rounded-2xl p-3.5 ${iconClass}`}>{icon}</span>
      </div>
    </div>
  );
}

/** نافذة منبثقة بسيطة بترويسة كحلية */
export function AdminModal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" dir="rtl">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-hidden rounded-3xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between bg-gradient-to-l from-[#192a56] to-[#273c75] p-5 text-white">
          <h2 className="text-lg font-black">{title}</h2>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white" aria-label="إغلاق">✕</button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export const fmtNum = (n: number) => n.toLocaleString("en-US");
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—");
export const fmtDateTime = (iso?: string | null) =>
  iso ? `${fmtDate(iso)} ${new Date(iso).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}` : "—";
