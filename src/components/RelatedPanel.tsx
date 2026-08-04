/**
 * لوحة السجلات المرتبطة — تُعرض داخل ملف القضية أو العميل أو العقد.
 * تعتمد كلياً على lib/links.ts فلا تعرف شيئاً عن Firestore بنفسها.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Link2, RefreshCw, ExternalLink } from "lucide-react";
import {
  LINK_KIND_COLORS, LINK_KIND_LABELS_AR, summarize,
  type LinkKind, type LinkedItem,
} from "../lib/links";

interface Props {
  /** دالة تجلب العناصر — relatedToCase أو relatedToClient */
  loader: () => Promise<LinkedItem[]>;
  /** يتغيّر عند الحاجة لإعادة التحميل */
  refreshKey?: unknown;
  title?: string;
  emptyText?: string;
}

export default function RelatedPanel({
  loader, refreshKey, title = "السجلات المرتبطة",
  emptyText = "لا توجد سجلات مرتبطة بعد",
}: Props) {
  const [items, setItems] = useState<LinkedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LinkKind | "ALL">("ALL");

  const load = async () => {
    setLoading(true);
    try {
      setItems(await loader());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const counts = useMemo(() => summarize(items), [items]);
  const shown = useMemo(
    () => (filter === "ALL" ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden" dir="rtl">
      <div className="px-5 py-3 border-b bg-gray-50/60 flex items-center gap-2">
        <Link2 size={17} className="text-[#D4AF37]" />
        <h3 className="font-bold text-[#133B2E]">
          {title} <span className="text-sm font-normal text-gray-400">({items.length})</span>
        </h3>
        <button onClick={() => void load()} disabled={loading}
          className="mr-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          title="تحديث">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {items.length > 0 && (
        <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-gray-100">
          <button onClick={() => setFilter("ALL")}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
              filter === "ALL" ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200"
            }`}>
            الكل ({items.length})
          </button>
          {(Object.keys(counts) as LinkKind[]).map((k) => (
            <button key={k} onClick={() => setFilter(filter === k ? "ALL" : k)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                filter === k ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : LINK_KIND_COLORS[k]
              }`}>
              {LINK_KIND_LABELS_AR[k]} ({counts[k]})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-gray-400">جاري تحميل العلاقات...</div>
      ) : shown.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">{emptyText}</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {shown.map((it) => {
            const body = (
              <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 transition">
                <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border ${LINK_KIND_COLORS[it.kind]}`}>
                  {LINK_KIND_LABELS_AR[it.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#133B2E] truncate">{it.label}</p>
                  {it.sublabel && <p className="text-xs text-gray-500 truncate mt-0.5">{it.sublabel}</p>}
                </div>
                {it.badge && (
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${it.badgeClass ?? "bg-gray-100 text-gray-700"}`}>
                    {it.badge}
                  </span>
                )}
                {it.href && <ExternalLink size={13} className="shrink-0 text-gray-300" />}
              </div>
            );
            return (
              <li key={`${it.kind}-${it.id}`}>
                {it.href ? <Link to={it.href} className="block">{body}</Link> : body}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
