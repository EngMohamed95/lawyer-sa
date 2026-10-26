import { Filter, X } from "lucide-react";

/** شريط «معروض فقط…» مع زر إلغاء — للترشيح القادم من رابط (لوحة التحكم مثلاً) */
export default function FilterBanner({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
      <Filter size={16} className="shrink-0" />
      <span>معروض فقط: <strong>{label}</strong></span>
      <button onClick={onClear}
        className="mr-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition hover:bg-indigo-100">
        <X size={13} /> إلغاء الترشيح
      </button>
    </div>
  );
}
