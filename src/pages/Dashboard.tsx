import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Gavel,
  PieChart,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "react-router";
import PlatformAdminDashboard from "../components/PlatformAdminDashboard";
import { DistributionCard, GroupedBars, OTHER, SERIES, StatCard, fmt, panel, toSlices, type Slice } from "../components/DashboardCharts";
import { collection, getCountFromServer, getDocs, query, where } from "firebase/firestore";
import { Badge } from "../components/ui/badge";
import { db } from "../lib/firebase";
import { visibleCasesQuery } from "../lib/caseAccess";
import { caseTypeLabel, isExecutionCase } from "../lib/caseTypes";
import { excludeDeleted } from "../lib/softDelete";
import { addDays, expandRecurrence, startOfDay, type Appointment } from "../lib/calendar";
import { displayStatus } from "../lib/billing";
import { usePermissions } from "../lib/usePermissions";
import { caseDay, caseStatusKey, dayOf, hearingStatusKey, isTaskDone, taskStatusKey, weekEndKey } from "../lib/dashboardFilters";

type Row = Record<string, any> & { id: string };

type HearingRow = Row & { caseId: string; caseTitle: string; day: string };

type OfficeData = {
  clients: number;
  cases: Row[];
  hearings: HearingRow[];
  /** null = لا صلاحية أو تعذّرت القراءة — يُخفى قسمها */
  tasks: Row[] | null;
  appointmentsThisWeek: number | null;
  invoices: Row[] | null;
};

const PRIORITY_AR: Record<string, string> = { LOW: "منخفضة", MEDIUM: "متوسطة", HIGH: "عالية", URGENT: "عاجلة" };

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });

async function loadOfficeData(lawyerId: string, role: string, userId: string, canInvoices: boolean): Promise<OfficeData> {
  const isOfficeLawyer = role === "OFFICE_LAWYER";
  const casesQ = isOfficeLawyer
    ? visibleCasesQuery(lawyerId)
    : query(collection(db, "cases"), where("lawyerId", "==", lawyerId));

  const casesSnap = await getDocs(casesQ);
  const cases = excludeDeleted(casesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row));

  const clientsP = isOfficeLawyer
    ? Promise.resolve(new Set(cases.map((c) => c.clientId).filter(Boolean)).size)
    : getCountFromServer(query(collection(db, "clients"), where("lawyerId", "==", lawyerId)))
        .then((s) => s.data().count).catch(() => 0);

  // الجلسات مجموعات فرعية لكل قضية
  const hearingsP = Promise.all(cases.map((c) =>
    getDocs(collection(db, "cases", c.id, "hearings"))
      .then((s) => s.docs.map((d) => ({
        id: d.id, ...d.data(), caseId: c.id,
        caseTitle: d.data().caseTitle || c.title || c.caseNumber || "قضية",
        day: dayOf(d.data().hearingDate),
      }) as HearingRow))
      .catch(() => [] as HearingRow[]),
  )).then((a) => a.flat().filter((h) => h.day));

  const tasksP = getDocs(query(collection(db, "tasks"), where("lawyerId", "==", lawyerId)))
    .then((s) => {
      const rows = excludeDeleted(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Row));
      // المتدرب ومحامي المكتب يريان المهام المسندة إليهم فقط — كصفحة المهام
      return role === "TRAINEE" || isOfficeLawyer ? rows.filter((t) => t.assignedTo === userId) : rows;
    })
    .catch(() => null);

  const appointmentsP = getDocs(query(collection(db, "appointments"), where("lawyerId", "==", lawyerId)))
    .then((s) => {
      const from = new Date();
      const to = addDays(startOfDay(from), 7);
      return excludeDeleted(s.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Appointment))
        .filter((a) => a.startAt && a.status !== "CANCELLED")
        .flatMap((a) => expandRecurrence(a, from, to))
        .filter((e) => new Date(e.start) >= from && new Date(e.start) < to).length;
    })
    .catch(() => null);

  const invoicesP = canInvoices
    ? getDocs(query(collection(db, "invoices"), where("lawyerId", "==", lawyerId)))
        .then((s) => excludeDeleted(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Row)))
        .catch(() => null)
    : Promise.resolve(null);

  const [clients, hearings, tasks, appointmentsThisWeek, invoices] =
    await Promise.all([clientsP, hearingsP, tasksP, appointmentsP, invoicesP]);
  return { clients, cases, hearings, tasks, appointmentsThisWeek, invoices };
}

/** مدير المنصة يرى لوحة المنصة الشاملة، وبقية المستخدمين يرون لوحة مكتبهم */
export default function Dashboard() {
  return localStorage.getItem("userRole") === "SUPER_ADMIN" ? <PlatformAdminDashboard /> : <OfficeDashboard />;
}

function OfficeDashboard() {
  const perms = usePermissions();
  const [data, setData] = useState<OfficeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** يزيد عند طلب إعادة المحاولة فيُعيد تشغيل التحميل */
  const [reloadKey, setReloadKey] = useState(0);

  const userName = localStorage.getItem("userName") || "مستخدم";
  const canInvoices = perms.can("invoice.manage");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!perms.lawyerId) { setLoading(false); return; }
    loadOfficeData(perms.lawyerId, perms.role, perms.userId || "", canInvoices)
      .then((d) => active && setData(d))
      .catch((err) => {
        console.error(err);
        // نُظهر السبب متى عرفناه — «حدث خطأ» وحده لا يساعد أحداً
        const code = (err as { code?: string })?.code ?? "";
        const reason =
          code === "permission-denied" ? "لا تملك صلاحية قراءة هذه البيانات."
          : code === "resource-exhausted" ? "تجاوز حد الاستخدام اليومي لقاعدة البيانات."
          : code === "unavailable" ? "تعذّر الوصول لقاعدة البيانات — تحقق من الاتصال."
          : code === "failed-precondition" ? "الاستعلام يحتاج فهرساً في قاعدة البيانات."
          : "";
        if (active) setError(`تعذّر تحميل بيانات لوحة التحكم.${reason ? ` ${reason}` : ""}`);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [perms.lawyerId, perms.role, perms.userId, canInvoices, reloadKey]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-edge border-t-transparent" />
          <p className="font-medium text-gray-500">جاري تحميل لوحة التحكم...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-ink">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">أهلا بك، {userName}</h1>
          <p className="mt-1 text-base text-gray-500 font-medium">ملخص سريع بالأرقام لكل أعمال المكتب.</p>
        </div>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}
          className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-slate-200 bg-surface px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-slate-50 disabled:opacity-60 md:self-auto">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> تحديث
        </button>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 font-medium text-red-700">
          <AlertCircle size={20} className="shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
        </div>
      )}

      {data && <OfficeView data={data} />}
    </div>
  );
}

function OfficeView({ data }: { data: OfficeData }) {
  const today = dayOf(new Date());
  const weekEnd = weekEndKey();

  // ── القضايا ──
  const regular = data.cases.filter((c) => !isExecutionCase({ type: c.type }));
  const execution = data.cases.length - regular.length;
  const openCases = regular.filter((c) => caseStatusKey(c) === "open").length;
  const archived = regular.filter((c) => caseStatusKey(c) === "archived").length;
  const caseStatus: Slice[] = [
    { label: "مفتوحة", value: openCases, color: SERIES[0], to: "/app/cases?status=open" },
    { label: "مغلقة", value: regular.length - openCases - archived, color: SERIES[1], to: "/app/cases?status=closed" },
    { label: "مؤرشفة", value: archived, color: OTHER, to: "/app/cases?status=archived" },
  ].filter((s) => s.value > 0);
  const typeCounts = new Map<string, number>();
  data.cases.forEach((c) => {
    const t = caseTypeLabel(c.type) || "غير محدد";
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  });
  // كل نوع يفتح قائمته؛ التنفيذ له صفحته، و«أخرى» تفتح كل القضايا
  const caseTypes = toSlices(typeCounts).map((s) => ({
    ...s,
    to: s.label === "تنفيذ" ? "/app/execution"
      : s.label === "أخرى" || s.label === "غير محدد" ? "/app/cases"
      : `/app/cases?type=${encodeURIComponent(s.label)}`,
  }));

  // ── الجلسات ──
  const upcoming = data.hearings.filter((h) => hearingStatusKey(h, today) === "upcoming").sort((a, b) => a.day.localeCompare(b.day));
  const hearingsToday = upcoming.filter((h) => h.day === today).length;
  const hearingsWeek = upcoming.filter((h) => h.day <= weekEnd).length;
  const awaitingResult = data.hearings.filter((h) => hearingStatusKey(h, today) === "awaiting").length;
  const hearingStatus: Slice[] = [
    { label: "قادمة", value: upcoming.length, color: SERIES[0], to: "/app/hearings?status=upcoming" },
    { label: "بانتظار تسجيل النتيجة", value: awaitingResult, color: SERIES[1], to: "/app/hearings?status=awaiting" },
    { label: "منتهية", value: data.hearings.length - upcoming.length - awaitingResult, color: SERIES[2], to: "/app/hearings?status=done" },
  ].filter((s) => s.value > 0);

  // ── المهام ──
  const tasks = data.tasks ?? [];
  const isOverdue = (t: Row) => taskStatusKey(t, today) === "overdue";
  const doneTasks = tasks.filter(isTaskDone).length;
  const overdueTasks = tasks.filter(isOverdue).length;
  const openTasks = tasks.length - doneTasks;
  const taskStatus: Slice[] = [
    { label: "قيد التنفيذ", value: openTasks - overdueTasks, color: SERIES[0], to: "/app/tasks?status=open" },
    { label: "متأخرة", value: overdueTasks, color: SERIES[1], to: "/app/tasks?status=overdue" },
    { label: "مكتملة", value: doneTasks, color: SERIES[2], to: "/app/tasks?status=done" },
  ].filter((s) => s.value > 0);
  const focusTasks = tasks
    .filter((t) => !isTaskDone(t))
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (dayOf(a.dueDate) || "9").localeCompare(dayOf(b.dueDate) || "9"))
    .slice(0, 6);

  // ── النشاط الشهري: آخر 6 أشهر ──
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    return { key: dayOf(d).slice(0, 7), label: d.toLocaleDateString("ar-EG", { month: "short" }) };
  });
  const perMonth = (days: string[]) => months.map((m) => days.filter((d) => d.startsWith(m.key)).length);
  const newCasesPerMonth = perMonth(data.cases.map(caseDay));
  const hearingsPerMonth = perMonth(data.hearings.map((h) => h.day));

  // ── المالية ──
  const liveInvoices = (data.invoices ?? []).filter((r) => r.status !== "CANCELLED" && r.status !== "DRAFT");
  const billed = liveInvoices.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const collected = liveInvoices.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0);
  const outstanding = liveInvoices.reduce((s, r) => s + (Number(r.remainingAmount) || 0), 0);
  const overdueInvoices = liveInvoices.filter((r) => displayStatus(r as any) === "OVERDUE");
  const currency = localStorage.getItem("sys_currency") || "SAR";

  const recentCases = [...data.cases]
    .sort((a, b) => caseDay(b).localeCompare(caseDay(a)))
    .slice(0, 5);

  return (
    <>
      {/* البطاقات الرئيسية */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard title="القضايا المفتوحة" value={fmt(openCases)} iconClass="bg-cyan-100/70 text-cyan-600" icon={<Briefcase size={22} />}
          sub={`${fmt(regular.length)} إجمالي القضايا`} to="/app/cases?status=open" />
        <StatCard title="ملفات التنفيذ" value={fmt(execution)} iconClass="bg-violet-100/70 text-violet-600" icon={<Gavel size={22} />}
          sub="ملفات تنفيذ الأحكام" to="/app/execution" />
        <StatCard title="العملاء" value={fmt(data.clients)} iconClass="bg-indigo-100/70 text-indigo-600" icon={<Users size={22} />}
          sub="إجمالي العملاء المسجلين" to="/app/clients" />
        <StatCard title="جلسات اليوم" value={fmt(hearingsToday)} iconClass="bg-amber-100/70 text-amber-600" icon={<Calendar size={22} />}
          sub={`${fmt(hearingsWeek)} هذا الأسبوع • ${fmt(upcoming.length)} قادمة`} to="/app/hearings?range=today" />
        {data.tasks && (
          <StatCard title="المهام المفتوحة" value={fmt(openTasks)} iconClass="bg-rose-100/70 text-rose-600" icon={<CheckSquare size={22} />}
            sub={overdueTasks ? `${fmt(overdueTasks)} متأخرة` : "لا توجد مهام متأخرة"} to="/app/tasks?status=unfinished" />
        )}
        {data.appointmentsThisWeek !== null && (
          <StatCard title="مواعيد الأسبوع" value={fmt(data.appointmentsThisWeek)} iconClass="bg-emerald-100/70 text-emerald-600" icon={<CalendarDays size={22} />}
            sub="خلال الأيام السبعة القادمة" to="/app/calendar" />
        )}
      </div>

      {/* النشاط الشهري */}
      <div className={`${panel} p-5`}>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><BarChart3 size={20} className="text-ink-2" /> نشاط المكتب خلال آخر 6 أشهر</h2>
        <p className="mb-4 text-xs text-slate-500">القضايا المضافة والجلسات المنعقدة في كل شهر — اضغط على أي عمود لعرض تفاصيله</p>
        <GroupedBars
          labels={months.map((m) => m.label)}
          series={[
            { name: "قضايا جديدة", color: SERIES[0], values: newCasesPerMonth, links: months.map((m) => `/app/cases?month=${m.key}`) },
            { name: "جلسات", color: SERIES[1], values: hearingsPerMonth, links: months.map((m) => `/app/hearings?month=${m.key}`) },
          ]}
        />
      </div>

      {/* التوزيع */}
      <div className={`${panel} p-5`}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><PieChart size={20} className="text-ink-2" /> توزيع القضايا والجلسات والمهام</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <DistributionCard title="القضايا" icon={<Briefcase size={18} className="text-ink-2" />} badge={`${fmt(data.cases.length)} ملف`} badgeTo="/app/cases"
            views={[
              { key: "status", label: "حسب الحالة", slices: caseStatus, unit: "قضية" },
              { key: "type", label: "حسب النوع", slices: caseTypes, unit: "ملف" },
            ]} />
          <DistributionCard title="الجلسات" icon={<Calendar size={18} className="text-ink-2" />} badge={`${fmt(data.hearings.length)} جلسة`} badgeTo="/app/hearings"
            views={[{ key: "status", label: "حسب الحالة", slices: hearingStatus, unit: "جلسة" }]} />
          {data.tasks && (
            <DistributionCard title="المهام" icon={<CheckSquare size={18} className="text-ink-2" />} badge={`${fmt(tasks.length)} مهمة`} badgeTo="/app/tasks"
              views={[{ key: "status", label: "حسب الحالة", slices: taskStatus, unit: "مهمة" }]} />
          )}
        </div>
      </div>

      {/* الملخص المالي */}
      {data.invoices && (
        <div className={`${panel} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Wallet size={20} className="text-emerald-600" /> الملخص المالي للفواتير</h2>
            <Link to="/app/invoices" className="text-xs font-bold text-ink-2 hover:underline">كل الفواتير</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "إجمالي المفوتر", value: billed, to: "/app/invoices" },
              { label: "المحصَّل", value: collected, to: "/app/invoices?status=PAID" },
              { label: "المتبقي للتحصيل", value: outstanding, to: "/app/invoices?status=PARTIALLY_PAID" },
              { label: "فواتير متأخرة", value: overdueInvoices.length, count: true, to: "/app/invoices?status=OVERDUE" },
            ].map((t) => (
              <Link key={t.label} to={t.to} className="block rounded-2xl bg-slate-50 p-4 transition hover:bg-slate-100">
                <p className="text-xs font-bold text-slate-400">{t.label}</p>
                <p className="mt-2 text-2xl font-black tabular-nums">
                  {fmt(Math.round(t.value))}{!t.count && <span className="mr-1 text-xs font-bold text-slate-400">{currency}</span>}
                </p>
              </Link>
            ))}
          </div>
          {billed > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                <span>نسبة التحصيل</span>
                <span className="font-bold tabular-nums text-ink">{Math.round((collected / billed) * 100)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, (collected / billed) * 100)}%`, background: SERIES[2] }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* القوائم السريعة */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ListPanel title="الجلسات القادمة" icon={<Calendar size={20} />} to="/app/hearings" empty="لا توجد جلسات قادمة">
          {upcoming.slice(0, 6).map((h) => (
            <Link key={`${h.caseId}-${h.id}`} to={`/app/cases/${h.caseId}`}
              className={`flex items-start justify-between gap-2 p-4 transition-colors hover:bg-slate-50 ${h.day === today ? "bg-amber-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{h.caseTitle}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{h.court || "—"}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs font-bold text-slate-700">{shortDate(h.day)}</span>
                {h.day === today && <Badge className="bg-amber-500 px-1.5 py-0 text-[10px] text-[#451a03]">اليوم</Badge>}
              </div>
            </Link>
          ))}
        </ListPanel>

        {data.tasks && (
          <ListPanel title="مهام تحتاج متابعة" icon={<CheckSquare size={20} />} to="/app/tasks" empty="لا توجد مهام مفتوحة">
            {focusTasks.map((t) => (
              <Link key={t.id} to={t.caseId ? `/app/cases/${t.caseId}` : `/app/tasks?status=${taskStatusKey(t, today)}`} className="flex items-start justify-between gap-2 p-4 transition-colors hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{t.title || "مهمة بلا عنوان"}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {[PRIORITY_AR[t.priority], t.assigneeName].filter(Boolean).join(" • ") || "—"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {dayOf(t.dueDate) && <span className="text-xs font-bold text-slate-700">{shortDate(dayOf(t.dueDate))}</span>}
                  {isOverdue(t) && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-red-600"><AlertTriangle size={12} /> متأخرة</span>
                  )}
                </div>
              </Link>
            ))}
          </ListPanel>
        )}

        <ListPanel title="آخر القضايا المضافة" icon={<Briefcase size={20} />} to="/app/cases" empty="لا توجد قضايا مضافة">
          {recentCases.map((c) => (
            <Link key={c.id} to={`/app/cases/${c.id}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{c.title || "قضية بدون عنوان"}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">رقم القضية: {c.caseNumber || "---"}</p>
              </div>
              <Badge className={caseStatusKey(c) === "open" ? "bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700" : "bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700"}>
                {caseStatusKey(c) === "open" ? "مفتوحة" : caseStatusKey(c) === "archived" ? "مؤرشفة" : "مغلقة"}
              </Badge>
            </Link>
          ))}
        </ListPanel>
      </div>
    </>
  );
}

function ListPanel({ title, icon, to, empty, children }: { title: string; icon: ReactNode; to: string; empty: string; children: ReactNode[] }) {
  return (
    <div className={`${panel} overflow-hidden`}>
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy text-white">{icon}</span>
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        <Link to={to} className="flex items-center text-sm font-bold text-ink hover:underline">
          عرض الكل <ChevronRight size={16} className="mr-1 rotate-180" />
        </Link>
      </div>
      <div className="divide-y divide-slate-100">
        {children.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">{empty}</p> : children}
      </div>
    </div>
  );
}
