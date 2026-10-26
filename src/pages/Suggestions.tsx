import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, Code2, Hourglass, Lightbulb, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import {
  createSuggestion,
  loadSuggestionProfile,
  reviewSuggestion,
  SUGGESTION_CATEGORIES,
  SUGGESTION_STATUSES,
  suggestionError,
  watchSuggestions,
  type ProductSuggestion,
  type SuggestionProfile,
  type SuggestionStatus,
} from "../lib/suggestions";
import { useAuthSession } from "../lib/useAuthSession";

const field = "w-full rounded-xl border border-edge/15 bg-surface px-4 py-3 text-sm outline-none focus:border-edge-2 focus:ring-2 focus:ring-edge-2/25";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white transition hover:bg-navy-2 disabled:opacity-50";
const statusColors: Record<SuggestionStatus, string> = {
  RECEIVED: "bg-navy text-white",
  UNDER_REVIEW: "bg-navy-2/20 text-ink",
  PLANNED: "bg-violet-100 text-violet-800",
  IMPLEMENTED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-gray-100 text-gray-600",
};
const formatDate = (value: ProductSuggestion["createdAt"]) => value?.toDate().toLocaleString("ar-SA", { calendar: "gregory", dateStyle: "medium", timeStyle: "short" }) || "جارٍ الحفظ…";

export default function Suggestions() {
  const session = useAuthSession();
  const [profile, setProfile] = useState<SuggestionProfile | null>(null);
  const [items, setItems] = useState<ProductSuggestion[]>([]);
  const [selected, setSelected] = useState<ProductSuggestion | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [category, setCategory] = useState<string>(SUGGESTION_CATEGORIES[0]);
  const [reviewStatus, setReviewStatus] = useState<SuggestionStatus>("UNDER_REVIEW");
  const [adminResponse, setAdminResponse] = useState("");
  const isAdmin = profile?.isAdmin ?? false;

  useEffect(() => {
    if (session.state !== "authenticated") return;
    let unsubscribe = () => {};
    let active = true;
    loadSuggestionProfile().then((p) => {
      if (!active) return;
      setProfile(p);
      unsubscribe = watchSuggestions(p, (data) => { setItems(data); setLoading(false); }, (err) => { setError(suggestionError(err)); setLoading(false); });
    }).catch((err) => { setError(suggestionError(err)); setLoading(false); });
    return () => { active = false; unsubscribe(); };
  }, [session.state, session.user?.uid]);

  useEffect(() => {
    if (!selected) return;
    const fresh = items.find((item) => item.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    return items.filter((item) => (!statusFilter || item.status === statusFilter) && (!term || `${item.title} ${item.details} ${item.category} ${item.requesterName}`.toLocaleLowerCase("ar").includes(term)));
  }, [items, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const visible = filtered.slice((page - 1) * 10, page * 10);
  const liveStats = useMemo(() => ({
    total: items.length,
    reviewing: items.filter((item) => item.status === "RECEIVED" || item.status === "UNDER_REVIEW").length,
    planned: items.filter((item) => item.status === "PLANNED").length,
    implemented: items.filter((item) => item.status === "IMPLEMENTED").length,
  }), [items]);

  const cards = [
    { label: isAdmin ? "إجمالي المقترحات" : "إجمالي مقترحاتي", value: liveStats.total, icon: Sparkles, color: "bg-navy text-ink-2" },
    { label: "قيد الدراسة", value: liveStats.reviewing, icon: Hourglass, color: "bg-navy-2 text-ink" },
    { label: "قيد التطوير / مجدول", value: liveStats.planned, icon: Code2, color: "bg-violet-100 text-violet-700" },
    { label: "تم التنفيذ", value: liveStats.implemented, icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700" },
  ];

  const openDetails = (item: ProductSuggestion) => {
    setSelected(item); setReviewStatus(item.status); setAdminResponse(item.adminResponse || ""); setActionError("");
  };
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!profile) return;
    setBusy(true); setActionError("");
    try { await createSuggestion(profile, { title, details, category }); setShowNew(false); setTitle(""); setDetails(""); setCategory(SUGGESTION_CATEGORIES[0]); }
    catch (err) { setActionError(suggestionError(err)); } finally { setBusy(false); }
  }
  async function saveReview(event: FormEvent) {
    event.preventDefault(); if (!selected || !isAdmin) return;
    setBusy(true); setActionError("");
    try { await reviewSuggestion(selected.id, reviewStatus, adminResponse); }
    catch (err) { setActionError(suggestionError(err)); } finally { setBusy(false); }
  }

  if (loading) return <div className="flex items-center justify-center gap-3 py-24 font-sans text-ink"><Loader2 className="animate-spin" /> جارٍ تحميل المقترحات…</div>;
  if (error) return <div role="alert" className="rounded-2xl bg-red-50 p-6 text-red-700">{error}</div>;

  return <div className="mx-auto max-w-7xl space-y-4 font-sans text-ink" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-5 rounded-3xl bg-gradient-to-l from-navy-2 to-navy p-6 text-white shadow-md md:p-7">
      <div className="flex max-w-3xl items-center gap-4"><span className="hidden rounded-full bg-white/10 p-4 text-ink-2 sm:block"><Lightbulb size={32} /></span><div><h1 className="text-2xl font-bold md:text-3xl">المقترحات والتطوير</h1><p className="mt-2 text-sm leading-6 text-white/75">شاركنا أفكارك ومقترحاتك، وتابع حالة دراستها وتنفيذها خطوة بخطوة.</p></div></div>
      {!isAdmin && <button className="inline-flex items-center gap-2 rounded-xl bg-navy-2 px-5 py-3 text-sm font-bold text-ink hover:bg-navy" onClick={() => { setShowNew(true); setActionError(""); }}><Plus size={18} /> تقديم مقترح جديد</button>}
    </header>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{cards.map((card) => <div key={card.label} className="flex items-center gap-3 rounded-3xl border border-edge/10 bg-surface p-5 shadow-sm"><span className={`rounded-full p-3 ${card.color}`}><card.icon size={21} /></span><div><p className="text-xs text-ink/65">{card.label}</p><p className="mt-1 text-xl font-bold">{card.value}</p></div></div>)}</div>
    <div className="grid gap-4 rounded-3xl border border-edge/10 bg-surface p-5 shadow-sm md:grid-cols-[1.4fr_1fr]"><div className="relative"><Search className="absolute right-4 top-4 text-ink/50" size={19} /><input className={`${field} h-14 pr-12`} aria-label="البحث في المقترحات" placeholder="ابحث في عنوان أو تفاصيل المقترح…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div><SearchableSelect className={`${field} h-14`} aria-label="تصفية حسب الحالة" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">جميع الحالات</option>{Object.entries(SUGGESTION_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</SearchableSelect></div>
    <section className="space-y-3" aria-label="قائمة المقترحات">{visible.length ? visible.map((item) => <button key={item.id} onClick={() => openDetails(item)} className="flex w-full flex-wrap items-center justify-between gap-5 rounded-3xl border border-edge/20 bg-surface p-5 text-right shadow-sm transition hover:border-edge-2 hover:shadow-md"><div className="min-w-0 flex-1"><div className="mb-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-navy-2/10 px-3 py-1 text-ink">{item.category}</span>{isAdmin && <span className="rounded-full bg-gray-100 px-3 py-1">{item.requesterName}</span>}</div><h2 className="text-lg font-bold">{item.title}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-ink/65">{item.details}</p><p className="mt-3 text-xs text-ink/50">{formatDate(item.createdAt)}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusColors[item.status]}`}>{SUGGESTION_STATUSES[item.status]}</span></button>) : <div className="rounded-3xl bg-surface py-16 text-center"><Lightbulb className="mx-auto mb-3 text-gray-300" size={46} /><h3 className="font-bold">لا توجد مقترحات حتى الآن</h3><p className="mt-2 text-sm text-gray-500">ستظهر المقترحات الجديدة هنا.</p></div>}</section>
    <div className="flex justify-between px-3 text-sm text-ink/60"><span>صفحة {page} من {pageCount}</span><div className="flex gap-4"><button disabled={page === 1} className="disabled:opacity-30" onClick={() => setPage((p) => p - 1)}>السابق</button><button disabled={page >= pageCount} className="disabled:opacity-30" onClick={() => setPage((p) => p + 1)}>التالي</button></div></div>

    {showNew && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="new-suggestion" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><h2 id="new-suggestion" className="text-xl font-bold">تقديم مقترح جديد</h2><button aria-label="إغلاق" onClick={() => setShowNew(false)}><X /></button></div><form className="space-y-4" onSubmit={submit}><label className="block text-sm font-bold">عنوان المقترح<input autoFocus required minLength={3} maxLength={200} className={`${field} mt-2`} value={title} onChange={(e) => setTitle(e.target.value)} /></label><label className="block text-sm font-bold">التصنيف<SearchableSelect className={`${field} mt-2`} value={category} onChange={(e) => setCategory(e.target.value)}>{SUGGESTION_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</SearchableSelect></label><label className="block text-sm font-bold">تفاصيل المقترح<textarea required minLength={10} maxLength={4000} className={`${field} mt-2 min-h-40`} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="اشرح الفكرة والفائدة التي ستضيفها للنظام…" /></label>{actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}<div className="flex justify-end gap-3"><button type="button" className="rounded-xl border px-5 py-3" onClick={() => setShowNew(false)}>إلغاء</button><button className={primary} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />} إرسال المقترح</button></div></form></section></div>}

    {selected && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="suggestion-details" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-4"><div><span className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusColors[selected.status]}`}>{SUGGESTION_STATUSES[selected.status]}</span><h2 id="suggestion-details" className="text-xl font-bold">{selected.title}</h2></div><button aria-label="إغلاق" onClick={() => setSelected(null)}><X /></button></div><p className="whitespace-pre-wrap rounded-2xl bg-page p-5 text-sm leading-7">{selected.details}</p><div className="mt-4 flex flex-wrap justify-between gap-3 text-xs text-ink/55"><span>{selected.category}</span><span>{selected.requesterName} · {formatDate(selected.createdAt)}</span></div>{isAdmin ? <form className="mt-6 space-y-4 border-t pt-5" onSubmit={saveReview}><label className="block text-sm font-bold">حالة المقترح<SearchableSelect className={`${field} mt-2`} value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value as SuggestionStatus)}>{Object.entries(SUGGESTION_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</SearchableSelect></label><label className="block text-sm font-bold">رد الإدارة للمستخدم<textarea maxLength={4000} className={`${field} mt-2 min-h-32`} value={adminResponse} onChange={(e) => setAdminResponse(e.target.value)} placeholder="اكتب نتيجة المراجعة أو خطة التنفيذ…" /></label>{actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}<button className={primary} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={17} /> : <Clock3 size={17} />} حفظ المراجعة</button></form> : <div className="mt-6 border-t pt-5"><h3 className="mb-3 font-bold">رد إدارة المنصة</h3>{selected.adminResponse ? <p className="whitespace-pre-wrap rounded-2xl bg-navy-2/10 p-5 text-sm leading-7">{selected.adminResponse}</p> : <p className="rounded-2xl bg-gray-50 p-5 text-sm text-gray-500">لم تضف الإدارة ردًا بعد. ستظهر نتيجة المراجعة هنا.</p>}</div>}</section></div>}
  </div>;
}
