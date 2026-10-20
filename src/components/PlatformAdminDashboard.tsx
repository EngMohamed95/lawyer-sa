/**
 * لوحة تحكم المنصة — لمدير المنصة (SUPER_ADMIN) فقط.
 * نظرة شاملة على كل المكاتب المشتركة: الاشتراكات والإيرادات، تذاكر الدعم،
 * المقترحات، حجم النشاط القانوني، توزيع المكاتب والقضايا، وأكثر المكاتب إنجازاً ونشاطاً.
 *
 * التجميع يتم في المتصفح من مجموعات Firestore القائمة — بلا حقول أو فهارس جديدة.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Activity, BarChart3, Briefcase, Building2, Gavel, Headset, Lightbulb, PieChart, RefreshCw,
  ShieldCheck, Ticket, Trophy, Users, Wallet,
} from "lucide-react";
import { collection, collectionGroup, getCountFromServer, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { SUPPORT_PRIORITIES } from "../lib/support";
import { SUGGESTION_STATUSES } from "../lib/suggestions";
import { caseTypeLabel } from "../lib/caseTypes";

// ألوان الرسوم — مُتحقَّق منها على السطح الأبيض (تمييز عمى الألوان والتباين)؛
// القيم ظاهرة دائماً بجوار الرسم فلا يعتمد التمييز على اللون وحده
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
const OTHER = "#94a3b8";

const PLAN_NAMES: Record<string, string> = { BASIC: "الأساسية", PROFESSIONAL: "الاحترافية", PREMIUM: "الشركات" };
const OFFICE_ROLES_EXCLUDED = new Set(["LAWYER", "SUPER_ADMIN", "CLIENT"]);
const isExecutionType = (t: unknown) => t === "تنفيذ" || t === "ENFORCEMENT";

interface Office {
  id: string;
  name: string;
  officeName: string;
  plan: string;
  billing: string;
  active: boolean;
  expired: boolean;
}

interface TicketRow { id: string; subject: string; priority: string; status: string; requesterName: string; createdAt: Date | null }
interface SuggestionRow { id: string; title: string; status: string; requesterName: string; category: string; createdAt: Date | null }
interface Slice { label: string; value: number; color: string }

export interface PlatformData {
  offices: Office[];
  revenue: number;
  approvedPayments: number;
  pendingPayments: number;
  openTickets: number;
  urgentTickets: number;
  totalTickets: number;
  reviewingSuggestions: number;
  totalSuggestions: number;
  casesCount: number;
  executionCount: number;
  clientsCount: number;
  hearingsCount: number;
  teamCount: number;
  caseTypes: Slice[];
  caseStatus: Slice[];
  topOffices: { office: Office; cases: number; clients: number; team: number }[];
  activeOffices: { office: Office; cases: number; clients: number }[];
  urgentList: TicketRow[];
  latestSuggestions: SuggestionRow[];
}

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// أرقام لاتينية كبقية النظام
const fmt = (n: number) => n.toLocaleString("en-US");
const fmtDate = (d: Date | null) =>
  d ? `${d.toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" })} ${d.toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}` : "";

/** أكبر ثلاث فئات بألوانها الثابتة، والباقي يُجمع في «أخرى» */
function toSlices(counts: Map<string, number>): Slice[] {
  const sorted = [...counts.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 3).map(([label, value], i) => ({ label, value, color: SERIES[i] }));
  const rest = sorted.slice(3).reduce((s, [, v]) => s + v, 0);
  return rest > 0 ? [...top, { label: "أخرى", value: rest, color: OTHER }] : top;
}

async function loadPlatformData(): Promise<PlatformData> {
  const now = Date.now();
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const [usersSnap, casesSnap, clientsSnap, hearingsCount, paymentsSnap, ticketsSnap, suggestionsSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "cases")),
    getDocs(collection(db, "clients")),
    getCountFromServer(collectionGroup(db, "hearings")).then((s) => s.data().count).catch(() => 0),
    getDocs(collection(db, "subscriptionRequests")).catch(() => null),
    getDocs(query(collection(db, "supportTickets"), orderBy("createdAt", "desc"), limit(300))).catch(() => null),
    getDocs(query(collection(db, "productSuggestions"), orderBy("createdAt", "desc"), limit(300))).catch(() => null),
  ]);

  // ── المكاتب (مالك المكتب LAWYER) وفرقها ──
  const offices: Office[] = [];
  const teamByOffice = new Map<string, number>();
  let teamCount = 0;
  usersSnap.docs.forEach((d) => {
    const u = d.data();
    if (u.role === "LAWYER") {
      const expiry = toDate(u.subscriptionExpiry);
      const expired = !!expiry && expiry.getTime() <= now;
      offices.push({
        id: d.id,
        name: u.name || u.email || "—",
        officeName: u.officeName || "",
        plan: u.plan || "",
        billing: u.subscriptionBilling || "",
        expired,
        active: (u.status || "ACTIVE") === "ACTIVE" && !expired,
      });
    } else if (!OFFICE_ROLES_EXCLUDED.has(u.role) && u.lawyerId) {
      teamCount++;
      teamByOffice.set(u.lawyerId, (teamByOffice.get(u.lawyerId) || 0) + 1);
    }
  });

  // ── القضايا والتنفيذ ──
  const casesByOffice = new Map<string, number>();
  const recentByOffice = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  let open = 0, closed = 0, executionCount = 0;
  casesSnap.docs.forEach((d) => {
    const c = d.data();
    if (isExecutionType(c.type)) executionCount++;
    typeCounts.set(caseTypeLabel(c.type) || "غير محدد", (typeCounts.get(caseTypeLabel(c.type) || "غير محدد") || 0) + 1);
    if ((c.status || "OPEN") === "OPEN") open++; else closed++;
    if (c.lawyerId) {
      casesByOffice.set(c.lawyerId, (casesByOffice.get(c.lawyerId) || 0) + 1);
      if ((toDate(c.createdAt)?.getTime() || 0) >= monthAgo) recentByOffice.set(c.lawyerId, (recentByOffice.get(c.lawyerId) || 0) + 1);
    }
  });

  const clientsByOffice = new Map<string, number>();
  const recentClientsByOffice = new Map<string, number>();
  clientsSnap.docs.forEach((d) => {
    const c = d.data();
    if (!c.lawyerId) return;
    clientsByOffice.set(c.lawyerId, (clientsByOffice.get(c.lawyerId) || 0) + 1);
    if ((toDate(c.createdAt)?.getTime() || 0) >= monthAgo) recentClientsByOffice.set(c.lawyerId, (recentClientsByOffice.get(c.lawyerId) || 0) + 1);
  });

  // ── الإيرادات: طلبات الاشتراك المفعّلة ──
  let revenue = 0, approvedPayments = 0, pendingPayments = 0;
  paymentsSnap?.docs.forEach((d) => {
    const p = d.data();
    if (p.status === "approved") { revenue += Number(p.amount) || 0; approvedPayments++; }
    else if (p.status === "pending") pendingPayments++;
  });

  // ── التذاكر والمقترحات ──
  const tickets: TicketRow[] = (ticketsSnap?.docs || []).map((d) => {
    const t = d.data();
    return { id: d.id, subject: t.subject || "—", priority: t.priority || "NORMAL", status: t.status || "OPEN", requesterName: t.requesterName || "—", createdAt: toDate(t.createdAt) };
  });
  const isOpen = (t: TicketRow) => t.status === "OPEN" || t.status === "IN_PROGRESS";
  const priorityRank: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  const urgentList = tickets
    .filter((t) => t.status !== "RESOLVED" && t.status !== "CLOSED")
    .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
    .slice(0, 5);

  const suggestions: SuggestionRow[] = (suggestionsSnap?.docs || []).map((d) => {
    const s = d.data();
    return { id: d.id, title: s.title || "—", status: s.status || "RECEIVED", requesterName: s.requesterName || "—", category: s.category || "", createdAt: toDate(s.createdAt) };
  });

  const officeStats = offices.map((office) => ({
    office,
    cases: casesByOffice.get(office.id) || 0,
    clients: clientsByOffice.get(office.id) || 0,
    team: teamByOffice.get(office.id) || 0,
  }));

  return {
    offices,
    revenue,
    approvedPayments,
    pendingPayments,
    openTickets: tickets.filter(isOpen).length,
    urgentTickets: tickets.filter((t) => isOpen(t) && t.priority === "URGENT").length,
    totalTickets: tickets.length,
    reviewingSuggestions: suggestions.filter((s) => s.status === "RECEIVED" || s.status === "UNDER_REVIEW").length,
    totalSuggestions: suggestions.length,
    casesCount: casesSnap.size - executionCount,
    executionCount,
    clientsCount: clientsSnap.size,
    hearingsCount,
    teamCount,
    caseTypes: toSlices(typeCounts),
    caseStatus: [
      { label: "مفتوحة", value: open, color: SERIES[0] },
      { label: "مغلقة", value: closed, color: SERIES[1] },
    ].filter((s) => s.value > 0),
    topOffices: [...officeStats].sort((a, b) => b.cases - a.cases).slice(0, 5),
    activeOffices: offices
      .map((office) => ({ office, cases: recentByOffice.get(office.id) || 0, clients: recentClientsByOffice.get(office.id) || 0 }))
      .filter((o) => o.cases + o.clients > 0)
      .sort((a, b) => b.cases + b.clients - (a.cases + a.clients))
      .slice(0, 5),
    urgentList,
    latestSuggestions: suggestions.slice(0, 5),
  };
}

/* ─────────────────────────── مكوّنات العرض ─────────────────────────── */

const panel = "rounded-2xl border border-slate-100 bg-white text-[#192a56] shadow-md";

function StatCard({ title, value, sub, icon, iconClass }: { title: string; value: string; sub: string; icon: ReactNode; iconClass: string }) {
  return (
    <div className={`${panel} p-5 transition-all hover:shadow-lg`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-slate-400">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-[#192a56]">{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{sub}</p>
        </div>
        <span className={`flex shrink-0 items-center justify-center rounded-2xl p-3.5 ${iconClass}`}>{icon}</span>
      </div>
    </div>
  );
}

/** دونات بفجوة 2px بين الأجزاء؛ المرور على جزء أو بند في المفتاح يعرض قيمته في المنتصف */
function Donut({ slices, unit }: { slices: Slice[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 62, c = 2 * Math.PI * r, gap = slices.length > 1 ? 2 : 0;
  let offset = 0;
  const shown = hover !== null ? slices[hover] : null;

  if (total === 0) return <p className="py-12 text-center text-sm text-slate-400">لا توجد بيانات بعد</p>;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
      <svg viewBox="0 0 160 160" className="h-44 w-44 shrink-0" role="img" aria-label={slices.map((s) => `${s.label}: ${s.value}`).join("، ")}>
        <g transform="rotate(-90 80 80)">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#eef1f6" strokeWidth="18" />
        {slices.map((s, i) => {
          const len = (s.value / total) * c;
          const dash = Math.max(len - gap, 0.5);
          const el = (
            <circle key={s.label} cx="80" cy="80" r={r} fill="none" stroke={s.color} strokeWidth={hover === i ? 22 : 18}
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
              className="cursor-pointer transition-[stroke-width]"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <title>{`${s.label}: ${fmt(s.value)} ${unit} (${Math.round((s.value / total) * 100)}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        </g>
        <g>
          <text x="80" y="76" textAnchor="middle" className="fill-[#192a56] text-[22px] font-black">{fmt(shown ? shown.value : total)}</text>
          <text x="80" y="98" textAnchor="middle" className="fill-slate-500 text-[11px]">{shown ? shown.label : `إجمالي ${unit}`}</text>
        </g>
      </svg>
      <ul className="w-full max-w-[14rem] space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1 ${hover === i ? "bg-slate-100" : ""}`}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="truncate text-slate-600">{s.label}</span>
            </span>
            <span className="shrink-0 font-bold tabular-nums text-[#192a56]">{fmt(s.value)} <span className="text-xs font-normal text-slate-400">({Math.round((s.value / total) * 100)}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DistributionCard({ title, icon, badge, views }: {
  title: string; icon: ReactNode; badge: string;
  views: { key: string; label: string; slices: Slice[]; unit: string }[];
}) {
  const [view, setView] = useState(views[0].key);
  const current = views.find((v) => v.key === view) || views[0];
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-bold">{icon}{title}</h3>
        <span className="rounded-full bg-[#273c75] px-3 py-0.5 text-xs font-bold text-white">{badge}</span>
      </div>
      {/* الكحلي inline لا class: قاعدة index.css تُبيّض النص الكحلي داخل bg-[#192a56] فيختفي الزر المختار */}
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl p-1.5" style={{ background: "#192a56" }}>
        {views.map((v) => (
          <button key={v.key} type="button" onClick={() => setView(v.key)}
            className={`rounded-lg px-3 py-2 text-sm font-bold transition ${view === v.key ? "bg-white text-[#192a56] shadow-sm" : "text-white/80 hover:bg-white/10"}`}>
            {v.label}
          </button>
        ))}
      </div>
      <Donut slices={current.slices} unit={current.unit} />
    </div>
  );
}

const officeLabel = (o: Office) => o.officeName || o.name;

export default function PlatformAdminDashboard() {
  const [data, setData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadPlatformData()
      .then((d) => active && setData(d))
      .catch((err) => {
        console.error(err);
        const code = (err as { code?: string })?.code ?? "";
        if (active) setError(code === "permission-denied" ? "لا تملك صلاحية قراءة بيانات المنصة." : "تعذّر تحميل إحصائيات المنصة — تحقق من الاتصال ثم أعد المحاولة.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reloadKey]);

  return <PlatformAdminView data={data} loading={loading} error={error} onReload={() => setReloadKey((k) => k + 1)} />;
}

/** العرض وحده — يستقبل البيانات جاهزة */
export function PlatformAdminView({ data, loading, error, onReload }: {
  data: PlatformData | null; loading: boolean; error: string | null; onReload: () => void;
}) {

  const planSlices = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, number>();
    data.offices.forEach((o) => m.set(PLAN_NAMES[o.plan] || "غير محدد", (m.get(PLAN_NAMES[o.plan] || "غير محدد") || 0) + 1));
    return toSlices(m);
  }, [data]);

  const billingSlices = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, number>();
    data.offices.forEach((o) => {
      const k = o.billing === "annual" ? "سنوي" : o.billing === "monthly" ? "شهري" : "غير محدد";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return toSlices(m);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#192a56] border-t-transparent" />
      </div>
    );
  }

  const activeCount = data?.offices.filter((o) => o.active).length ?? 0;
  const maxCases = Math.max(1, ...(data?.topOffices.map((t) => t.cases) ?? [1]));

  return (
    <div className="space-y-6 font-['Tajawal'] text-[#192a56]" dir="rtl">
      {/* الترويسة */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-l from-[#192a56] to-[#273c75] p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10"><ShieldCheck size={28} /></span>
          <div>
            <h1 className="text-2xl font-black sm:text-3xl">لوحة تحكم المنصة</h1>
            <p className="mt-1 text-sm text-white/70">مرحباً بك في مركز إدارة منصة المحاماة. راقب المكاتب المشتركة، تذاكر الدعم الفني، المقترحات، والاشتراكات.</p>
          </div>
        </div>
        <button type="button" onClick={onReload} disabled={loading}
          className="flex shrink-0 items-center gap-2 self-start rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#192a56] transition hover:bg-blue-50 disabled:opacity-60 sm:self-auto">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> تحديث الإحصائيات
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>
      )}

      {data && (<>
        {/* البطاقات الرئيسية */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="إجمالي المكاتب المشتركة" value={fmt(data.offices.length)} iconClass="bg-indigo-100/70 text-indigo-600" icon={<Building2 size={22} />}
            sub={`${fmt(activeCount)} نشط • ${fmt(data.offices.length - activeCount)} غير نشط`} />
          <StatCard title="تذاكر الدعم المفتوحة" value={fmt(data.openTickets)} iconClass="bg-amber-100/70 text-amber-600" icon={<Ticket size={22} />}
            sub={`${fmt(data.urgentTickets)} عاجلة • ${fmt(data.totalTickets)} الإجمالي`} />
          <StatCard title="المقترحات قيد الدراسة" value={fmt(data.reviewingSuggestions)} iconClass="bg-cyan-100/70 text-cyan-600" icon={<Lightbulb size={22} />}
            sub={`${fmt(data.totalSuggestions)} إجمالي المقترحات`} />
          <StatCard title="إجمالي إيرادات الاشتراكات" value={`${fmt(data.revenue)} ج.م`} iconClass="bg-emerald-100/70 text-emerald-600" icon={<Wallet size={22} />}
            sub={`${fmt(data.approvedPayments)} عملية مفعّلة${data.pendingPayments ? ` • ${fmt(data.pendingPayments)} بانتظار التفعيل` : ""}`} />
        </div>

        {/* حجم النشاط */}
        <div className={`${panel} p-5`}>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><BarChart3 size={20} className="text-[#273c75]" /> حجم النشاط القانوني عبر المكاتب المشتركة</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: "القضايا المسجلة", value: data.casesCount, icon: <Briefcase size={16} /> },
              { label: "ملفات التنفيذ", value: data.executionCount, icon: <Gavel size={16} /> },
              { label: "العملاء المسجلون", value: data.clientsCount, icon: <Users size={16} /> },
              { label: "الجلسات المسجلة", value: data.hearingsCount, icon: <Activity size={16} /> },
              { label: "أعضاء فرق المكاتب", value: data.teamCount, icon: <Users size={16} /> },
            ].map((t) => (
              <div key={t.label} className="rounded-2xl bg-slate-50 p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold text-slate-400">{t.icon}{t.label}</p>
                <p className="mt-2 text-2xl font-black tabular-nums">{fmt(t.value)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* التوزيع */}
        <div className={`${panel} p-5`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold"><PieChart size={20} className="text-[#273c75]" /> مؤشر توزيع المكاتب والقضايا</h2>
              <p className="mt-1 text-xs text-slate-500">تحليل لباقات المكاتب المشتركة وأنواع القضايا المسجلة على المنصة</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DistributionCard title="مؤشر المكاتب المشتركة" icon={<Building2 size={18} className="text-[#273c75]" />} badge={`${fmt(data.offices.length)} مكتب`}
              views={[
                { key: "plan", label: "حسب الباقة", slices: planSlices, unit: "مكتب" },
                { key: "billing", label: "حسب مدة الاشتراك", slices: billingSlices, unit: "مكتب" },
              ]} />
            <DistributionCard title="مؤشر القضايا المسجلة" icon={<Briefcase size={18} className="text-[#273c75]" />} badge={`${fmt(data.casesCount + data.executionCount)} قضية`}
              views={[
                { key: "type", label: "حسب النوع", slices: data.caseTypes, unit: "قضية" },
                { key: "status", label: "حسب الحالة", slices: data.caseStatus, unit: "قضية" },
              ]} />
          </div>
        </div>

        {/* أفضل المكاتب والأكثر نشاطاً */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className={`${panel} p-5`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Trophy size={20} className="text-amber-500" /> أفضل 5 مكاتب إنجازاً للقضايا</h2>
              <Link to="/app/lawyers" className="text-xs font-bold text-[#273c75] hover:underline">سجل المحامين</Link>
            </div>
            {data.topOffices.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا توجد مكاتب بعد.</p> : (
              <div className="divide-y divide-slate-100">
                {data.topOffices.map((t, i) => (
                  <div key={t.office.id} className="flex items-center gap-4 py-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-black ${i === 0 ? "bg-amber-500 text-white" : i < 3 ? "bg-[#273c75] text-white" : "bg-slate-100 text-[#192a56]"}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate font-bold">
                        <span className="truncate">{officeLabel(t.office)}</span>
                        {!t.office.active && <span className="shrink-0 rounded-full border border-red-300 px-2 text-[10px] text-red-600">{t.office.expired ? "منتهي" : "معطّل"}</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {t.office.officeName ? `${t.office.name} • ` : ""}{PLAN_NAMES[t.office.plan] || "بدون باقة"} • {fmt(t.clients)} عميل • {fmt(t.team)} عضو فريق
                      </p>
                    </div>
                    <div className="w-36 shrink-0">
                      <p className="mb-1 flex justify-between text-xs text-slate-400"><span>القضايا:</span><span className="font-bold tabular-nums">{fmt(t.cases)}</span></p>
                      <div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#273c75]" style={{ width: `${(t.cases / maxCases) * 100}%` }} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`${panel} p-5`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Building2 size={20} className="text-emerald-600" /> أكثر المكاتب نشاطاً وحركة</h2>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] text-emerald-700">آخر 30 يوماً</span>
            </div>
            {data.activeOffices.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا يوجد نشاط مسجل خلال آخر 30 يوماً.</p> : (
              <div className="divide-y divide-slate-100">
                {data.activeOffices.map((t, i) => (
                  <div key={t.office.id} className="flex items-center gap-3 py-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-[#192a56] text-white" : "bg-slate-100 text-[#192a56]"}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{officeLabel(t.office)}</p>
                      <p className="truncate text-xs text-slate-500">{fmt(t.clients)} عميل جديد • {PLAN_NAMES[t.office.plan] || "بدون باقة"}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-bold tabular-nums text-emerald-700">{fmt(t.cases)} قضية جديدة</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* التذاكر العاجلة وأحدث المقترحات */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className={`${panel} p-5`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Headset size={20} className="text-amber-500" /> تذاكر تحتاج متابعة عاجلة</h2>
              <Link to="/app/support/tickets" className="text-xs font-bold text-[#273c75] hover:underline">عرض الكل</Link>
            </div>
            {data.urgentList.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا توجد تذاكر مفتوحة حالياً.</p> : (
              <div className="divide-y divide-slate-100">
                {data.urgentList.map((t) => (
                  <Link key={t.id} to={`/app/support/tickets/${t.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{t.subject}</p>
                      <p className="truncate text-xs text-slate-500">من: {t.requesterName}{t.createdAt ? ` • ${fmtDate(t.createdAt)}` : ""}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-0.5 text-xs ${t.priority === "URGENT" ? "border-red-300 bg-red-50 text-red-600" : t.priority === "HIGH" ? "border-orange-300 bg-orange-50 text-orange-600" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                      {SUPPORT_PRIORITIES[t.priority as keyof typeof SUPPORT_PRIORITIES] || t.priority}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className={`${panel} p-5`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Lightbulb size={20} className="text-cyan-600" /> أحدث مقترحات المستخدمين</h2>
              <Link to="/app/suggestions" className="text-xs font-bold text-[#273c75] hover:underline">عرض الكل</Link>
            </div>
            {data.latestSuggestions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-slate-500"><Lightbulb size={28} className="text-cyan-600" /> لا توجد مقترحات جديدة حالياً.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.latestSuggestions.map((s) => (
                  <Link key={s.id} to="/app/suggestions" className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{s.title}</p>
                      <p className="truncate text-xs text-slate-500">من: {s.requesterName}{s.category ? ` • ${s.category}` : ""}{s.createdAt ? ` • ${fmtDate(s.createdAt)}` : ""}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-xs text-blue-700">
                      {SUGGESTION_STATUSES[s.status as keyof typeof SUGGESTION_STATUSES] || s.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </>)}
    </div>
  );
}
