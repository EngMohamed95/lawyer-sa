/**
 * إدارة باقات الاشتراك والأسعار — لمدير المنصة.
 * تحديد الباقات ومدتها وحدودها (القضايا · العملاء · أعضاء الفريق) وأسعارها بكل عملة.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Globe, Hourglass, Layers, Loader2, Pencil, Plus, RefreshCw, Sparkles, Tag } from "lucide-react";
import { Input } from "../components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AdminHeader, AdminModal, AdminStat, HeaderButton, adminPanel, fmtNum } from "../components/admin/AdminUi";
import {
  BILLING_LABELS, CURRENCIES, DEFAULT_PLANS, QUOTA_KEYS, QUOTA_LABELS, TIER_LABELS,
  loadPlans, savePlan, seedDefaultPlans, setPlanActive, toPlanCode,
  type PlanBilling, type PlanTier, type SubscriptionPlan,
} from "../lib/subscriptionPlans";

const emptyPlan = (order: number): SubscriptionPlan => ({
  id: "", name: "", nameEn: "", tier: "BASIC", billing: "monthly", durationDays: 30,
  quotas: { cases: 0, clients: 0, team: 0 }, prices: { SAR: 0, EGP: 0, USD: 0 }, active: true, order,
});

const label = "text-xs font-bold text-slate-600";

export default function SubscriptionPlans() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ plan: SubscriptionPlan; isNew: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setPlans(await loadPlans());
    } catch (err: any) {
      console.error(err);
      setError(err?.code === "permission-denied"
        ? "قاعدة البيانات ترفض قراءة الباقات — انشر قواعد Firestore المحدّثة (subscriptionPlans) ثم أعد المحاولة."
        : "تعذّر تحميل الباقات.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const seed = async () => {
    setSaving(true);
    try { await seedDefaultPlans(); await refresh(); }
    catch (err: any) { alert("تعذّر إنشاء الباقات: " + (err?.message || err)); }
    finally { setSaving(false); }
  };

  const toggle = async (p: SubscriptionPlan) => {
    setBusyId(p.id);
    try {
      await setPlanActive(p.id, !p.active);
      setPlans((all) => all.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)));
    } catch (err: any) { alert("خطأ: " + (err?.message || err)); }
    finally { setBusyId(null); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const plan = { ...editing.plan, id: editing.isNew ? toPlanCode(editing.plan.id) : editing.plan.id };
    if (!plan.id) { alert("أدخل رمز الباقة بحروف إنجليزية (مثل: starter)"); return; }
    if (editing.isNew && plans.some((p) => p.id === plan.id)) { alert("يوجد باقة بنفس الرمز — اختر رمزاً آخر"); return; }
    setSaving(true);
    try {
      await savePlan(plan);
      setEditing(null);
      await refresh();
    } catch (err: any) { alert("تعذّر الحفظ: " + (err?.message || err)); }
    finally { setSaving(false); }
  };

  const set = (patch: Partial<SubscriptionPlan>) => setEditing((e) => (e ? { ...e, plan: { ...e.plan, ...patch } } : e));
  const trial = plans.find((p) => p.billing === "trial" && p.active);
  const pricesCount = plans.reduce((s, p) => s + CURRENCIES.filter((c) => p.prices[c.code] > 0).length, 0);

  return (
    <div className="space-y-6 font-['Tajawal'] text-[#192a56]" dir="rtl">
      <AdminHeader
        icon={<Tag size={26} />}
        title="إدارة باقات الاشتراك والأسعار"
        subtitle="حدد باقات المكاتب الشهرية والسنوية والتجريبية، وحدود كل باقة (القضايا، العملاء، أعضاء الفريق)، وسعرها بكل عملة."
        actions={<>
          <HeaderButton onClick={() => setEditing({ plan: emptyPlan(plans.length), isNew: true })}><Plus size={16} /> إضافة باقة جديدة</HeaderButton>
          <button type="button" onClick={refresh} disabled={loading} aria-label="تحديث"
            className="flex items-center justify-center rounded-xl border border-white/30 bg-white/10 px-3 text-white hover:bg-white/20 disabled:opacity-60">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat title="إجمالي الباقات" value={fmtNum(plans.length)} icon={<Layers size={22} />} iconClass="bg-indigo-100/70 text-indigo-600" />
        <AdminStat title="الباقات المتاحة والنشطة" value={fmtNum(plans.filter((p) => p.active).length)} icon={<CheckCircle2 size={22} />} iconClass="bg-emerald-100/70 text-emerald-600" />
        <AdminStat title="الباقة التجريبية" value={trial ? trial.name : "لا توجد"} sub={trial ? `${trial.durationDays} يوم` : undefined} icon={<Hourglass size={22} />} iconClass="bg-amber-100/70 text-amber-600" />
        <AdminStat title="الأسعار المسجلة للعملات" value={fmtNum(pricesCount)} icon={<Globe size={22} />} iconClass="bg-cyan-100/70 text-cyan-600" />
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

      <div className={`${adminPanel} overflow-hidden`}>
        <h2 className="border-b border-slate-100 p-5 text-lg font-bold">قائمة باقات المنصة وتفاصيل الاشتراك والأسعار</h2>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#273c75]" /></div>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles size={32} className="text-[#273c75]" />
            <p className="font-bold">لا توجد باقات بعد</p>
            <p className="max-w-md text-sm text-slate-500">ابدأ بالباقات الافتراضية ({DEFAULT_PLANS.map((p) => p.name).join("، ")}) بنفس أسعار النظام الحالية، ثم عدّلها كما تريد.</p>
            <button type="button" onClick={seed} disabled={saving || !!error}
              className="mt-2 flex items-center gap-2 rounded-xl bg-[#273c75] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#192a56] disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} إنشاء الباقات الافتراضية
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-right text-[#192a56]">
                <tr>
                  {["الباقة", "المدة", "حدود الاشتراك", "الأسعار والعملات", "مستوى المزايا", "الحالة", "الإجراءات"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.map((p) => (
                  <tr key={p.id} className={`hover:bg-slate-50 ${p.active ? "" : "opacity-60"}`}>
                    <td className="px-4 py-4">
                      <p className="flex items-center gap-2 font-bold">
                        {p.name}
                        {p.billing === "trial" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">باقة تجريبية</span>}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 font-mono" dir="ltr">{p.id}</span>
                        <span dir="ltr">{p.nameEn}</span>
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-[#273c75]">
                      {p.billing === "trial" ? `${p.durationDays} يوم تجريبي` : BILLING_LABELS[p.billing]}
                    </td>
                    <td className="px-4 py-4 text-xs leading-6">
                      {QUOTA_KEYS.map((k) => (
                        <p key={k}><span className="font-bold">{p.quotas[k] ? fmtNum(p.quotas[k]) : "غير محدود"}</span> {QUOTA_LABELS[k]}</p>
                      ))}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {CURRENCIES.map((c) => (
                          <span key={c.code} className="whitespace-nowrap rounded-full border border-slate-200 px-2.5 py-0.5 text-xs" dir="ltr">
                            <span className="text-[10px] font-bold text-slate-400">{c.flag}</span> {fmtNum(p.prices[c.code])} {c.code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-600">{TIER_LABELS[p.tier].split(" — ")[0]}</td>
                    <td className="px-4 py-4">
                      <button type="button" role="switch" aria-checked={p.active} onClick={() => toggle(p)} disabled={busyId === p.id}
                        title={p.active ? "إيقاف الباقة" : "تفعيل الباقة"}
                        className={`relative h-6 w-11 rounded-full transition ${p.active ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-50`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${p.active ? "left-0.5" : "left-[1.375rem]"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <button type="button" onClick={() => setEditing({ plan: p, isNew: false })} title="تعديل"
                        className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><Pencil size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <AdminModal title={editing.isNew ? "إضافة باقة جديدة" : `تعديل ${editing.plan.name}`} onClose={() => setEditing(null)} wide>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={label}>اسم الباقة *</label>
                <Input required value={editing.plan.name} onChange={(e) => set({ name: e.target.value })} placeholder="الباقة الأساسية" />
              </div>
              <div className="space-y-1">
                <label className={label}>الاسم بالإنجليزية</label>
                <Input dir="ltr" value={editing.plan.nameEn} onChange={(e) => set({ nameEn: e.target.value })} placeholder="Basic Plan" />
              </div>
              <div className="space-y-1">
                <label className={label}>رمز الباقة *</label>
                <Input dir="ltr" required disabled={!editing.isNew} value={editing.plan.id} onChange={(e) => set({ id: e.target.value })} placeholder="starter" />
                <p className="text-[11px] text-slate-400">{editing.isNew ? "حروف إنجليزية وأرقام — لا يتغير بعد الإنشاء" : "لا يتغير بعد الإنشاء"}</p>
              </div>
              <div className="space-y-1">
                <label className={label}>مستوى المزايا</label>
                <SearchableSelect className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm"
                  value={editing.plan.tier} onChange={(e) => set({ tier: e.target.value as PlanTier })}>
                  {(Object.keys(TIER_LABELS) as PlanTier[]).map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                </SearchableSelect>
                <p className="text-[11px] text-slate-400">يحدد الأقسام التي تظهر للمكتب في النظام</p>
              </div>
              <div className="space-y-1">
                <label className={label}>نوع الاشتراك</label>
                <SearchableSelect className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm"
                  value={editing.plan.billing}
                  onChange={(e) => {
                    const billing = e.target.value as PlanBilling;
                    set({ billing, durationDays: billing === "annual" ? 365 : billing === "trial" ? 14 : 30 });
                  }}>
                  {(Object.keys(BILLING_LABELS) as PlanBilling[]).map((b) => <option key={b} value={b}>{BILLING_LABELS[b]}</option>)}
                </SearchableSelect>
              </div>
              <div className="space-y-1">
                <label className={label}>المدة بالأيام</label>
                <Input type="number" min={1} required value={editing.plan.durationDays} onChange={(e) => set({ durationDays: Number(e.target.value) })} />
              </div>
            </div>

            <fieldset className="rounded-2xl border border-slate-100 p-4">
              <legend className="px-2 text-sm font-bold">حدود الاشتراك <span className="text-xs font-normal text-slate-400">(0 = غير محدود)</span></legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {QUOTA_KEYS.map((k) => (
                  <div key={k} className="space-y-1">
                    <label className={label}>{QUOTA_LABELS[k]}</label>
                    <Input type="number" min={0} value={editing.plan.quotas[k]}
                      onChange={(e) => set({ quotas: { ...editing.plan.quotas, [k]: Number(e.target.value) } })} />
                  </div>
                ))}
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-slate-100 p-4">
              <legend className="px-2 text-sm font-bold">الأسعار والعملات</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {CURRENCIES.map((c) => (
                  <div key={c.code} className="space-y-1">
                    <label className={label}>{c.label} ({c.code})</label>
                    <Input type="number" min={0} step="0.01" dir="ltr" value={editing.plan.prices[c.code]}
                      onChange={(e) => set({ prices: { ...editing.plan.prices, [c.code]: Number(e.target.value) } })} />
                  </div>
                ))}
              </div>
            </fieldset>

            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={editing.plan.active} onChange={(e) => set({ active: e.target.checked })} className="h-4 w-4" />
              الباقة متاحة للاشتراك
            </label>

            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#273c75] py-3 font-bold text-white hover:bg-[#192a56] disabled:opacity-50">
                {saving && <Loader2 size={16} className="animate-spin" />} حفظ الباقة
              </button>
              <button type="button" onClick={() => setEditing(null)} className="rounded-2xl bg-slate-100 px-6 py-3 font-bold text-slate-700 hover:bg-slate-200">إلغاء</button>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  );
}
