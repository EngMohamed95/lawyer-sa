/**
 * سجل اشتراكات وكوتات المحامين — لمدير المنصة.
 * متابعة اشتراك كل مكتب، ونسب استهلاك حدود باقته، ومنح الباقات يدوياً،
 * وتمديد الفترات، وتعديل الحصص المخصصة.
 */

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Hourglass, Loader2, RefreshCw, Search, Settings2, Users, XCircle } from "lucide-react";
import { collection, deleteField, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Input } from "../components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AdminHeader, AdminModal, AdminStat, HeaderButton, adminPanel, fmtDate, fmtNum } from "../components/admin/AdminUi";
import {
  QUOTA_KEYS, QUOTA_LABELS, STATUS_META, assignPlan, daysUntil, effectiveQuota, loadPlans, subscriptionStatus,
  type QuotaKey, type SubscriptionPlan, type SubscriptionStatus,
} from "../lib/subscriptionPlans";

const LEGACY_TIER_NAMES: Record<string, string> = { BASIC: "الأساسية", PROFESSIONAL: "الاحترافية", PREMIUM: "الشركات" };
const NON_TEAM_ROLES = new Set(["LAWYER", "SUPER_ADMIN", "CLIENT"]);

interface OfficeRow {
  id: string;
  name: string;
  officeName: string;
  email: string;
  plan?: string;
  planId?: string;
  subscriptionStart?: string;
  subscriptionExpiry?: string;
  createdAt?: string;
  quotaOverrides?: Partial<Record<QuotaKey, number>>;
}

const selectClass = "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm";

export default function OfficeSubscriptions() {
  const [offices, setOffices] = useState<OfficeRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [usage, setUsage] = useState<Record<string, Record<QuotaKey, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | SubscriptionStatus>("");
  const [managing, setManaging] = useState<OfficeRow | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersSnap, casesSnap, clientsSnap, planList] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "cases")).catch(() => null),
        getDocs(collection(db, "clients")).catch(() => null),
        loadPlans().catch(() => [] as SubscriptionPlan[]),
      ]);
      const next: Record<string, Record<QuotaKey, number>> = {};
      const bump = (id: unknown, key: QuotaKey) => {
        if (typeof id !== "string" || !id) return;
        next[id] = next[id] || { cases: 0, clients: 0, team: 0 };
        next[id][key]++;
      };
      const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      users.forEach((u) => { if (!NON_TEAM_ROLES.has(u.role)) bump(u.lawyerId, "team"); });
      casesSnap?.docs.forEach((d) => bump(d.data().lawyerId, "cases"));
      clientsSnap?.docs.forEach((d) => bump(d.data().lawyerId, "clients"));
      setUsage(next);
      setPlans(planList);
      setOffices(users.filter((u) => u.role === "LAWYER"));
    } catch (err) {
      console.error(err);
      setError("تعذّر تحميل الاشتراكات.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const planOf = (o: OfficeRow) => plans.find((p) => p.id === o.planId) ?? null;
  const statusOf = (o: OfficeRow) => subscriptionStatus(o, planOf(o));

  const counts = useMemo(() => {
    const c: Record<SubscriptionStatus, number> = { ACTIVE: 0, TRIAL: 0, GRACE: 0, EXPIRED: 0, NONE: 0 };
    offices.forEach((o) => { c[statusOf(o)]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offices, plans]);

  const q = search.trim().toLowerCase();
  const visible = offices
    .filter((o) => (!statusFilter || statusOf(o) === statusFilter) &&
      (!q || [o.name, o.officeName, o.email, o.id].some((v) => String(v || "").toLowerCase().includes(q))))
    .sort((a, b) => (daysUntil(a.subscriptionExpiry) ?? 99999) - (daysUntil(b.subscriptionExpiry) ?? 99999));

  return (
    <div className="space-y-6 font-['Tajawal'] text-ink" dir="rtl">
      <AdminHeader
        icon={<Users size={26} />}
        title="سجل اشتراكات وكوتات المحامين"
        subtitle="متابعة اشتراكات المكاتب، نسب استهلاك حدود الباقة، منح الباقات يدوياً، تمديد الفترات، وتعديل الحصص المخصصة."
        actions={<HeaderButton onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> تحديث السجلات</HeaderButton>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat title="الاشتراكات النشطة" value={fmtNum(counts.ACTIVE)} icon={<CheckCircle2 size={22} />} iconClass="bg-emerald-100/70 text-emerald-600" />
        <AdminStat title="الفترة التجريبية" value={fmtNum(counts.TRIAL)} icon={<Hourglass size={22} />} iconClass="bg-cyan-100/70 text-cyan-600" />
        <AdminStat title="فترة السماح" value={fmtNum(counts.GRACE)} sub="انتهت خلال آخر 7 أيام" icon={<Clock size={22} />} iconClass="bg-amber-100/70 text-amber-600" />
        <AdminStat title="الاشتراكات المنتهية" value={fmtNum(counts.EXPIRED)} sub={counts.NONE ? `${counts.NONE} بدون اشتراك` : undefined} icon={<XCircle size={22} />} iconClass="bg-red-100/70 text-red-600" />
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
      {!loading && plans.length === 0 && !error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          لم تُنشأ باقات بعد — أنشئها من «باقات الاشتراك والأسعار» لتتمكن من منحها للمكاتب ومتابعة حدودها.
        </div>
      )}

      <div className={`${adminPanel} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="bg-slate-50 pr-9" placeholder="ابحث باسم المحامي، المكتب، المعرّف، أو البريد..." />
          </div>
          <div className="md:w-64">
            <SearchableSelect className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} aria-label="تصفية حسب الحالة">
              <option value="">كل الحالات</option>
              {(Object.keys(STATUS_META) as SubscriptionStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </SearchableSelect>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-ink-2" /></div>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">{offices.length ? "لا توجد نتائج مطابقة" : "لا يوجد مكاتب مشتركة"}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-right">
                <tr>
                  {["المحامي", "الباقة والحالة", "فترة الصلاحية", "استهلاك الاشتراك", "الإجراءات"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((o) => {
                  const plan = planOf(o);
                  const status = statusOf(o);
                  const days = daysUntil(o.subscriptionExpiry);
                  const used = usage[o.id] || { cases: 0, clients: 0, team: 0 };
                  return (
                    <tr key={o.id} className="align-top hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <p className="font-bold">{o.officeName || o.name || "—"}</p>
                        {o.officeName && <p className="text-xs text-slate-500">{o.name}</p>}
                        <p className="mt-1 inline-block rounded-full border border-slate-200 px-2 py-0.5 font-mono text-[10px] text-slate-400" dir="ltr">#{o.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="flex items-center gap-2 font-bold">
                          {plan ? plan.name : o.plan ? `${LEGACY_TIER_NAMES[o.plan] || o.plan}` : "—"}
                          {plan && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-normal" dir="ltr">{plan.id}</span>}
                          {!plan && o.plan && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-500">غير مربوطة بباقة</span>}
                        </p>
                        <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_META[status].className}`}>{STATUS_META[status].label}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs leading-6">
                        <p>من: <span className="font-bold">{fmtDate(o.subscriptionStart || o.createdAt)}</span></p>
                        <p>إلى: <span className="font-bold">{fmtDate(o.subscriptionExpiry)}</span></p>
                        {days !== null && (
                          <p className={`font-bold ${days > 7 ? "text-emerald-600" : days > 0 ? "text-amber-600" : "text-red-600"}`}>
                            {days > 0 ? `متبقي ${days} يوماً` : `انتهى منذ ${Math.abs(days)} يوماً`}
                          </p>
                        )}
                      </td>
                      <td className="min-w-[16rem] px-4 py-4">
                        <div className="space-y-2.5">
                          {QUOTA_KEYS.map((k) => {
                            const quota = effectiveQuota(o, plan, k);
                            const pct = quota ? Math.min(100, Math.round((used[k] / quota) * 100)) : 0;
                            const custom = typeof o.quotaOverrides?.[k] === "number";
                            return (
                              <div key={k}>
                                <div className="mb-1 flex justify-between text-xs">
                                  <span>
                                    {QUOTA_LABELS[k]}: <span className="font-bold tabular-nums">{fmtNum(used[k])} / {quota ? fmtNum(quota) : "∞"}</span>
                                    {custom && <span className="mr-1 text-[10px] text-ink-2">(مخصصة)</span>}
                                  </span>
                                  <span className={`font-bold tabular-nums ${pct >= 100 ? "text-red-600" : pct >= 80 ? "text-amber-600" : "text-slate-500"}`}>{quota ? `${pct}%` : "غير محدود"}</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-slate-100">
                                  <div className={`h-1.5 rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-navy-2"}`} style={{ width: `${quota ? Math.max(pct, used[k] ? 2 : 0) : 0}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <button type="button" onClick={() => setManaging(o)}
                          className="flex items-center gap-1.5 rounded-xl border border-edge-2/30 px-3 py-1.5 text-xs font-bold text-ink-2 hover:bg-slate-50">
                          <Settings2 size={13} /> إدارة
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {managing && (
        <ManageSubscription office={managing} plans={plans} plan={planOf(managing)} onClose={() => setManaging(null)}
          onSaved={async () => { setManaging(null); await refresh(); }} />
      )}
    </div>
  );
}

function ManageSubscription({ office, plans, plan, onClose, onSaved }: {
  office: OfficeRow; plans: SubscriptionPlan[]; plan: SubscriptionPlan | null; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const available = plans.filter((p) => p.active || p.id === plan?.id);
  const [planId, setPlanId] = useState(plan?.id || available[0]?.id || "");
  const [mode, setMode] = useState<"new" | "extend">(plan && daysUntil(office.subscriptionExpiry) !== null ? "extend" : "new");
  const [overrides, setOverrides] = useState<Record<QuotaKey, string>>({
    cases: office.quotaOverrides?.cases?.toString() ?? "",
    clients: office.quotaOverrides?.clients?.toString() ?? "",
    team: office.quotaOverrides?.team?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const chosen = plans.find((p) => p.id === planId) || null;

  const preview = (() => {
    if (!chosen) return null;
    const base = mode === "extend" && office.subscriptionExpiry ? new Date(Math.max(Date.now(), new Date(office.subscriptionExpiry).getTime())) : new Date();
    return new Date(base.getTime() + chosen.durationDays * 86400000).toISOString();
  })();

  const saveQuotas = async () => {
    const clean: Partial<Record<QuotaKey, number>> = {};
    QUOTA_KEYS.forEach((k) => { if (overrides[k].trim() !== "") clean[k] = Math.max(0, Number(overrides[k]) || 0); });
    await updateDoc(doc(db, "users", office.id), { quotaOverrides: Object.keys(clean).length ? clean : deleteField() });
  };

  const run = async (withPlan: boolean) => {
    setSaving(true);
    try {
      if (withPlan) {
        if (!chosen) throw new Error("اختر باقة");
        await assignPlan(office.id, chosen, { extendFrom: mode === "extend" ? office.subscriptionExpiry : null });
      }
      await saveQuotas();
      await onSaved();
    } catch (err: any) {
      alert("خطأ: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title={`إدارة اشتراك ${office.officeName || office.name}`} onClose={onClose} wide>
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="font-bold">منح باقة / تمديد الفترة</h3>
          {available.length === 0 ? (
            <p className="text-sm text-amber-700">لا توجد باقات متاحة — أنشئها من صفحة الباقات أولاً.</p>
          ) : (<>
            <SearchableSelect className={selectClass} value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="الباقة">
              {available.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.durationDays} يوم</option>)}
            </SearchableSelect>
            <div className="grid grid-cols-2 gap-2">
              {([["extend", "تمديد فوق الاشتراك الحالي"], ["new", "بدء فترة جديدة من اليوم"]] as const).map(([m, text]) => (
                <button key={m} type="button" onClick={() => setMode(m)} disabled={m === "extend" && !office.subscriptionExpiry}
                  className={`rounded-xl border-2 p-3 text-sm font-bold transition disabled:opacity-40 ${mode === m ? "border-edge-2 bg-slate-50" : "border-slate-200"}`}>
                  {text}
                </button>
              ))}
            </div>
            {preview && <p className="rounded-xl bg-slate-50 p-3 text-sm">ينتهي الاشتراك في: <span className="font-black">{fmtDate(preview)}</span></p>}
            <button type="button" disabled={saving || !chosen} onClick={() => run(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving && <Loader2 size={16} className="animate-spin" />} تطبيق الباقة وحفظ الحصص
            </button>
          </>)}
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-5">
          <h3 className="font-bold">الحصص المخصصة <span className="text-xs font-normal text-slate-400">(اتركها فارغة لتطبيق حدود الباقة — 0 = غير محدود)</span></h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {QUOTA_KEYS.map((k) => (
              <div key={k} className="space-y-1">
                <label className="text-xs font-bold text-slate-600">{QUOTA_LABELS[k]}</label>
                <Input type="number" min={0} value={overrides[k]} placeholder={plan ? (plan.quotas[k] ? String(plan.quotas[k]) : "غير محدود") : ""}
                  onChange={(e) => setOverrides((o) => ({ ...o, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <button type="button" disabled={saving} onClick={() => run(false)}
            className="w-full rounded-2xl border border-edge-2/30 py-3 font-bold text-ink-2 hover:bg-slate-50 disabled:opacity-50">
            حفظ الحصص فقط
          </button>
        </section>
      </div>
    </AdminModal>
  );
}
