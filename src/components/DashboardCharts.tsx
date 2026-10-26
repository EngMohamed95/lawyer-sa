/**
 * مكوّنات الرسوم المشتركة بين لوحة المنصة ولوحة المكتب.
 * رسوم SVG/CSS خفيفة بلا مكتبات — القيم تظهر دائماً بجوار الرسم.
 */

import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";

// ألوان الرسوم — مُتحقَّق منها على السطح الأبيض (تمييز عمى الألوان والتباين)؛
// القيم ظاهرة دائماً بجوار الرسم فلا يعتمد التمييز على اللون وحده
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
export const OTHER = "#94a3b8";

/** to: الصفحة التي يفتحها الضغط على الجزء (اختياري) */
export interface Slice { label: string; value: number; color: string; to?: string }

// أرقام لاتينية كبقية النظام
export const fmt = (n: number) => n.toLocaleString("en-US");

/** أكبر ثلاث فئات بألوانها الثابتة، والباقي يُجمع في «أخرى» */
export function toSlices(counts: Map<string, number>): Slice[] {
  const sorted = [...counts.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 3).map(([label, value], i) => ({ label, value, color: SERIES[i] }));
  const rest = sorted.slice(3).reduce((s, [, v]) => s + v, 0);
  return rest > 0 ? [...top, { label: "أخرى", value: rest, color: OTHER }] : top;
}

export const panel = "rounded-2xl border border-slate-100 bg-surface text-ink shadow-md";

export function StatCard({ title, value, sub, icon, iconClass, to }: { title: string; value: string; sub: string; icon: ReactNode; iconClass: string; to?: string }) {
  const body = (
    <div className={`${panel} h-full p-5 transition-all hover:shadow-lg ${to ? "hover:-translate-y-0.5 hover:border-edge-2/30" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-slate-400">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-ink">{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{sub}</p>
        </div>
        <span className={`flex shrink-0 items-center justify-center rounded-2xl p-3.5 ${iconClass}`}>{icon}</span>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

/** دونات بفجوة 2px بين الأجزاء؛ المرور على جزء أو بند في المفتاح يعرض قيمته في المنتصف */
export function Donut({ slices, unit }: { slices: Slice[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const navigate = useNavigate();
  const open = (s: Slice) => { if (s.to) navigate(s.to); };
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 62, c = 2 * Math.PI * r, gap = slices.length > 1 ? 2 : 0;
  let offset = 0;
  const shown = hover !== null ? slices[hover] : null;

  if (total === 0) return <p className="py-12 text-center text-sm text-slate-400">لا توجد بيانات بعد</p>;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
      <svg viewBox="0 0 160 160" className="h-44 w-44 shrink-0" role="img" aria-label={slices.map((s) => `${s.label}: ${s.value}`).join("، ")}>
        <g transform="rotate(-90 80 80)">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-slate-100)" strokeWidth="18" />
        {slices.map((s, i) => {
          const len = (s.value / total) * c;
          const dash = Math.max(len - gap, 0.5);
          const el = (
            <circle key={s.label} cx="80" cy="80" r={r} fill="none" stroke={s.color} strokeWidth={hover === i ? 22 : 18}
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
              className="cursor-pointer transition-[stroke-width]"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => open(s)}>
              <title>{`${s.label}: ${fmt(s.value)} ${unit} (${Math.round((s.value / total) * 100)}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        </g>
        <g>
          <text x="80" y="76" textAnchor="middle" className="fill-ink text-[22px] font-black">{fmt(shown ? shown.value : total)}</text>
          <text x="80" y="98" textAnchor="middle" className="fill-slate-500 text-[11px]">{shown ? shown.label : `إجمالي ${unit}`}</text>
        </g>
      </svg>
      <ul className="w-full max-w-[14rem] space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => open(s)}
            className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1 ${s.to ? "cursor-pointer" : ""} ${hover === i ? "bg-slate-100" : ""}`}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="truncate text-slate-600">{s.label}</span>
            </span>
            <span className="shrink-0 font-bold tabular-nums text-ink">{fmt(s.value)} <span className="text-xs font-normal text-slate-400">({Math.round((s.value / total) * 100)}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DistributionCard({ title, icon, badge, badgeTo, views }: {
  title: string; icon: ReactNode; badge: string; badgeTo?: string;
  views: { key: string; label: string; slices: Slice[]; unit: string }[];
}) {
  const [view, setView] = useState(views[0].key);
  const current = views.find((v) => v.key === view) || views[0];
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-bold">{icon}{badgeTo ? <Link to={badgeTo} className="hover:underline">{title}</Link> : title}</h3>
        {badgeTo
          ? <Link to={badgeTo} className="rounded-full bg-navy-2 px-3 py-0.5 text-xs font-bold text-white transition hover:bg-navy">{badge}</Link>
          : <span className="rounded-full bg-navy-2 px-3 py-0.5 text-xs font-bold text-white">{badge}</span>}
      </div>
      {views.length > 1 && (
        // الكحلي inline لا class: قاعدة index.css تُبيّض النص الكحلي داخل bg-navy فيختفي الزر المختار
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl p-1.5" style={{ background: "var(--color-navy)" }}>
          {views.map((v) => (
            <button key={v.key} type="button" onClick={() => setView(v.key)}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition ${view === v.key ? "bg-surface text-ink shadow-sm" : "text-white/80 hover:bg-white/10"}`}>
              {v.label}
            </button>
          ))}
        </div>
      )}
      <Donut slices={current.slices} unit={current.unit} />
    </div>
  );
}

/**
 * أعمدة مجمّعة على محور واحد — كل السلاسل بالوحدة نفسها.
 * المرور على شهر يُبرز أعمدته ويعرض قيمه.
 */
export function GroupedBars({ labels, series }: {
  labels: string[];
  /** links[i]: الصفحة التي يفتحها الضغط على عمود الشهر i (اختياري) */
  series: { name: string; color: string; values: number[]; links?: string[] }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  // سقف مقرّب لخطوط الشبكة
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const ticks = [4, 3, 2, 1, 0].map((i) => i * step);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        {/* المحور الرأسي */}
        <div className="flex h-56 w-7 shrink-0 flex-col justify-between pb-6 text-[11px] tabular-nums text-slate-400">
          {ticks.map((t) => <span key={t} className="-translate-y-1/2 leading-none">{fmt(t)}</span>)}
        </div>
        <div className="relative h-56 flex-1">
          <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {ticks.map((t) => <div key={t} className="border-t border-slate-100" />)}
          </div>
          <div className="absolute inset-0 flex">
            {labels.map((label, i) => (
              <div key={label} className="relative flex flex-1 cursor-default flex-col"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className={`flex flex-1 items-end justify-center rounded-t-lg ${hover === i ? "bg-slate-50" : ""}`}>
                  {series.map((s) => {
                    const bar = (
                      <div className="w-3 rounded-t sm:w-4"
                        style={{ background: s.color, height: `${(s.values[i] / top) * 100}%`, minHeight: s.values[i] > 0 ? 2 : 0, opacity: hover === null || hover === i ? 1 : 0.45 }} />
                    );
                    // منطقة الضغط بعرض نصف العمود وارتفاعه كاملاً — أوسع من العمود الرفيع نفسه
                    return s.links?.[i]
                      ? <Link key={s.name} to={s.links[i]} title={`${s.name} — ${label}: ${fmt(s.values[i])}`}
                          className="flex h-full cursor-pointer items-end justify-center px-0.5">{bar}</Link>
                      : <div key={s.name} className="flex h-full items-end justify-center px-0.5">{bar}</div>;
                  })}
                </div>
                <span className="h-6 pt-1.5 text-center text-[11px] text-slate-500">{label}</span>
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs shadow-lg">
                    <p className="mb-1 font-bold text-ink">{label}</p>
                    {series.map((s) => (
                      <p key={s.name} className="flex items-center gap-2 text-slate-600">
                        <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.name}: <span className="font-bold tabular-nums text-ink">{fmt(s.values[i])}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
