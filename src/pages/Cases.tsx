import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Plus, Search, Filter, Eye, FileSpreadsheet, Gavel, X, ChevronDown, ChevronLeft, Briefcase, Landmark, UserRound, Scale, CalendarDays, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AiSummarizerModal } from "../components/AiSummarizerModal";
import { AddCaseModal } from "../components/AddCaseModal";
import { EditCaseModal } from "../components/EditCaseModal";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import type { Query, DocumentData } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Pagination } from "../components/ui/Pagination";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { formatHijri } from "../lib/calendar";
import { clientRoleLabelOf } from "../lib/clientRole";
import { caseTypeLabel } from "../lib/caseTypes";
import { assignedLawyersLabel } from "../lib/assignedLawyers";
import ExecutionOverview, { matchesExecution, type ExecutionCapacity, type ExecutionFilter } from "../components/ExecutionOverview";
import { visibleCasesQuery } from "../lib/caseAccess";
import { enforcementProgressOf, executionRequestLabel, executionStatusOf, isEnforcementOverdue } from "../lib/execution";
import FilterBanner from "../components/FilterBanner";
import { CASE_STATUS_FILTER_AR, caseDay, caseStatusKey, monthFilterLabel, type CaseStatusKey } from "../lib/dashboardFilters";

const STATUS_LABELS_AR: Record<string, string> = {
  // القيم الحالية التي يكتبها النظام
  OPEN: "مفتوحة",
  CLOSED: "مغلقة",
  ARCHIVED: "مؤرشفة",
  // قيم قديمة موروثة من بيانات سابقة — تُعرض بالعربي بدل الإنجليزي الخام
  ACTIVE: "مفتوحة",
  PENDING: "معلّقة",
  INACTIVE: "موقوفة",
  SUSPENDED: "موقوفة",
  DONE: "مكتملة",
  COMPLETED: "مكتملة",
};

const getStatusLabel = (status: string) => STATUS_LABELS_AR[status] || "مفتوحة";

// نفس مفاتيح سبب الإغلاق المحفوظة من تبويب "تنفيذ الأحكام" في CaseDetails.tsx
const ENFORCEMENT_CLOSURE_LABELS_AR: Record<string, string> = {
  PAYMENT: "الوفاء الكامل بالحق",
  SETTLEMENT: "الصلح بين الطرفين",
  WAIVER: "تنازل طالب التنفيذ",
  OTHER: "سبب آخر",
};




const CaseField = ({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-0.5 min-w-0 ${className}`}>
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-900 leading-tight truncate">{children}</span>
  </div>
);

// لون الحافة الجانبية وشارة الحالة في بطاقة القضية
const CASE_STATUS_STYLES: Record<string, { bar: string; pill: string }> = {
  "مفتوحة": { bar: "border-r-edge", pill: "bg-navy text-white" },
  "معلّقة": { bar: "border-r-amber-500", pill: "bg-amber-500 text-[#451a03]" },
  "موقوفة": { bar: "border-r-red-500", pill: "bg-red-500 text-white" },
  "مكتملة": { bar: "border-r-green-600", pill: "bg-green-600 text-white" },
  "مغلقة": { bar: "border-r-gray-400", pill: "bg-gray-500 text-white" },
  "مؤرشفة": { bar: "border-r-gray-300", pill: "bg-gray-200 text-gray-700" },
};

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-ink">{children}</span>
);

function CaseRow({ c, expanded, onToggle, userRole }: { c: any; expanded: boolean; onToggle: () => void; userRole: string | null }) {
  const navigate = useNavigate();
  const plaintiff = c.plaintiffName || (c.clientRole === "DEFENDANT" ? c.opponentName : c.client?.fullName) || "-";
  const defendant = c.defendantName || (c.clientRole === "DEFENDANT" ? c.client?.fullName : c.opponentName) || "-";
  const statusLabel = getStatusLabel(c.status || "OPEN");
  const style = CASE_STATUS_STYLES[statusLabel] || CASE_STATUS_STYLES["مفتوحة"];
  const court = [c.courtName, c.courtCircle].filter(Boolean).join(" — ");

  // الضغط في أي مكان بالبطاقة يفتح القضية — عدا الأزرار والروابط، وعدا تحديد نص للنسخ
  const openCase = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    navigate(`/app/cases/${c.id}`);
  };

  return (
    <div onClick={openCase} className={`cursor-pointer rounded-xl border border-gray-200 border-r-[5px] ${style.bar} bg-surface shadow-sm transition hover:shadow-md`}>
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
        {/* التاريخ */}
        <div className="w-fit shrink-0 rounded-lg bg-gray-100 px-4 py-2 text-center lg:w-28">
          <div className="text-sm font-bold text-ink">{formatHijri(c.startDate || c.createdAt)}</div>
          <div className="mt-0.5 text-xs text-gray-500">تاريخ القضية</div>
        </div>

        {/* رقم القضية ونوعها */}
        <div className="min-w-0 shrink-0 space-y-1.5 lg:w-72">
          <Link to={`/app/cases/${c.id}`} className="flex items-center gap-2 text-lg font-bold text-ink transition-colors hover:text-blue-700">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy text-white">
              <Briefcase size={14} />
            </span>
            <span dir="ltr" className="truncate">{c.caseNumber || "-"}</span>
          </Link>
          <div className="flex flex-wrap gap-1.5">
            <Chip>{caseTypeLabel(c.type) || "-"}</Chip>
            <Chip>{clientRoleLabelOf(c)}</Chip>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {court && <span className="flex min-w-0 items-center gap-1"><Landmark size={13} className="shrink-0" /> <span className="truncate">{court}</span></span>}
            <span className="flex min-w-0 items-center gap-1"><UserRound size={13} className="shrink-0" /> <span className="truncate">{c.client?.fullName || "-"}</span></span>
          </div>
        </div>

        {/* العنوان والأطراف */}
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-blue-900">
            <Scale size={14} className="shrink-0" /> <span className="truncate">{c.title || "بدون عنوان"}</span>
          </p>
          <p className="truncate text-gray-700"><span className="text-gray-500">المدعي: </span>{plaintiff}</p>
          <p className="truncate text-gray-700"><span className="text-gray-500">المدعى عليه: </span>{defendant}</p>
        </div>

        {/* الحالة والإجراءات */}
        <div className="flex shrink-0 items-center gap-2 lg:flex-col lg:items-end">
          <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${style.pill}`}>{statusLabel}</span>
          <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-xs">
            <button
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
              title={expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
              className="px-3 py-2 text-sky-600 transition-colors hover:bg-sky-50"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            <Link to={`/app/cases/${c.id}`} aria-label="فتح القضية" title="فتح القضية"
              className="border-r border-gray-200 px-3 py-2 text-ink transition-colors hover:bg-gray-50">
              <Eye className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            <CaseField label="محامي الخصم">{c.opponentLawyer || "-"}</CaseField>
            {(userRole === "LAWYER" || userRole === "OFFICE_LAWYER") && (
              <CaseField label="المحامي المسؤول">{assignedLawyersLabel(c, "المدير")}</CaseField>
            )}
            {userRole === "SUPER_ADMIN" && <CaseField label="المحامي">{c.lawyerId || "غير محدد"}</CaseField>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── قائمة ملفات التنفيذ (بتصميم ناجز) ────────────────────────── */


/** أسماء المنفذ ضدهم — من أطراف الدعوى إن وُجدت، وإلا من الحقول القديمة */
const debtorNamesOf = (c: any): string[] => {
  if (Array.isArray(c.parties)) {
    const names = c.parties.filter((p: any) => p.role === "DEFENDANT").map((p: any) => p.name).filter(Boolean);
    if (names.length) return names;
  }
  const fallback = c.defendantName || (c.clientRole === "DEFENDANT" ? c.client?.fullName : c.opponentName) || "";
  return fallback ? String(fallback).split("، ") : [];
};

const ExecField = ({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) => (
  <div className="flex min-w-0 items-start gap-2">
    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">{icon}</span>
    <div className="min-w-0">
      <p className="text-[11px] text-gray-400">{label}</p>
      <div className="text-sm font-medium leading-snug text-gray-900">{children}</div>
    </div>
  </div>
);

/** بطاقة ملف تنفيذ — البطاقة كلها تفتح الملف، وزر التعديل وحده لا يفتحه */
function ExecutionCard({ c, onEdit }: { c: any; onEdit: (c: any) => void }) {
  const navigate = useNavigate();
  const status = executionStatusOf(c);
  const debtors = debtorNamesOf(c);
  const progress = enforcementProgressOf(c);
  const href = `/app/execution/${c.id}`;

  const open = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    navigate(href);
  };

  return (
    <div role="link" tabIndex={0} onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) navigate(href); }}
      className={`group cursor-pointer rounded-xl border border-slate-200 border-r-[5px] ${status.bar} bg-surface p-4 shadow-[0_1px_3px_rgba(25,42,86,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_6px_16px_rgba(25,42,86,0.12)] focus-visible:outline-2 focus-visible:outline-edge-2`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {/* رقم الطلب ونوعه */}
        <div className="flex min-w-0 items-center gap-3 lg:w-60 lg:shrink-0">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-navy/10 text-ink transition group-hover:bg-navy group-hover:text-white">
            <Gavel size={20} />
          </span>
          <div className="min-w-0">
            <p dir="ltr" className="truncate text-right text-lg font-bold text-ink">{c.caseNumber || "-"}</p>
            <span className="mt-0.5 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-ink">
              {executionRequestLabel(c) || "طلب تنفيذ"}
            </span>
          </div>
        </div>

        {/* البيانات */}
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <ExecField icon={<UserRound size={14} />} label="المنفذ ضده">
            {debtors.length ? (<>
              <span className="block truncate">{debtors[0]}</span>
              {debtors.length > 1 && <span className="text-xs text-gray-400">و{debtors.length - 1} آخرين</span>}
            </>) : "-"}
          </ExecField>
          <ExecField icon={<Landmark size={14} />} label="المحكمة">
            <span className="block truncate">{c.courtName || "-"}</span>
          </ExecField>
          <ExecField icon={<CalendarDays size={14} />} label="تاريخ تقديم الطلب">
            {formatHijri(c.startDate || c.createdAt)} هـ
            {c.startTime && <span className="text-gray-500"> · الساعة <bdi dir="ltr">{c.startTime}</bdi></span>}
          </ExecField>
        </div>

        {/* نسبة الإنجاز */}
        <div className="lg:w-36 lg:shrink-0">
          <div className="mb-1 flex justify-between text-[11px] text-gray-400">
            <span>نسبة الإنجاز</span>
            <span className="font-bold tabular-nums text-gray-700">{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className={`h-1.5 rounded-full ${status.progress}`} style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* الحالة والإجراءات */}
        <div className="flex shrink-0 items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${status.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} /> {status.label}
          </span>
          <button onClick={() => onEdit(c)} title="تعديل الطلب"
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-ink transition hover:border-edge-2 hover:bg-slate-50">
            <Pencil size={13} /> تعديل
          </button>
          <ChevronLeft size={18} className="text-slate-300 transition group-hover:-translate-x-0.5 group-hover:text-ink-2" />
        </div>
      </div>
    </div>
  );
}

function ExecutionRows({ cases, onEdit }: { cases: any[]; onEdit: (c: any) => void }) {
  return (
    <div className="space-y-3 bg-slate-50/60 p-4">
      {cases.map((c) => <ExecutionCard key={c.id} c={c} onEdit={onEdit} />)}
    </div>
  );
}

/** التنفيذ قسم مستقل عن القضايا — ويشمل النوع القديم ENFORCEMENT */
const isExecutionType = (type: unknown) => type === "تنفيذ" || type === "ENFORCEMENT";

export default function Cases({ section = "cases" }: { section?: "cases" | "execution" }) {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAiCase, setActiveAiCase] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [isAddCaseOpen, setIsAddCaseOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [execFilter, setExecFilter] = useState<ExecutionFilter>("ALL");
  const [execCapacity, setExecCapacity] = useState<ExecutionCapacity>("ANY");
  const listRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  // التنفيذ له مساره المستقل /app/execution — وقضاياه لا تظهر في قائمة القضايا.
  // بياناته ما زالت في مجموعة cases نفسها (type: "تنفيذ")، فالفصل في العرض والتنقل.
  const [params, setParams] = useSearchParams();
  const typeFilter = section === "execution" ? "تنفيذ" : params.get("type");
  // روابط لوحة التحكم: ?status=open|closed|archived و ?month=YYYY-MM
  const statusFilter = params.get("status") as CaseStatusKey | null;
  const monthFilter = params.get("month");
  const clearParam = (key: string) => { params.delete(key); setParams(params, { replace: true }); };

  const userRole = localStorage.getItem("userRole");
  const lawyerId = localStorage.getItem("lawyerId");

  const fetchCases = async () => {
    setLoading(true);
    try {
      let casesQuery: Query<DocumentData>;
      if (userRole === "SUPER_ADMIN") {
        casesQuery = query(collection(db, "cases"), limit(200));
      } else if (userRole === "OFFICE_LAWYER") {
        const userId = localStorage.getItem("userId");
        casesQuery = visibleCasesQuery(lawyerId || "", limit(200));
      } else {
        casesQuery = query(collection(db, "cases"), where("lawyerId", "==", lawyerId), limit(200));
      }
      const clientsQuery = userRole !== "SUPER_ADMIN"
        ? query(collection(db, "clients"), where("lawyerId", "==", lawyerId), limit(200))
        : query(collection(db, "clients"), limit(200));

      const [casesSnap, clientsSnap] = await Promise.all([
        getDocs(casesQuery),
        getDocs(clientsQuery),
      ]);

      const clients = clientsSnap.docs.reduce((acc: any, doc) => {
        acc[doc.id] = doc.data();
        return acc;
      }, {});

      setCases(casesSnap.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data, client: clients[data.clientId] || { fullName: "عميل غير معروف" } };
      }));
      setPage(1);
    } catch (error) {
      console.error("Error fetching cases:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [lawyerId, userRole]);

  const exportToExcel = async () => {
    if (!cases || cases.length === 0) {
      alert("لا توجد بيانات لتصديرها");
      return;
    }
    
    try {
      if (!(window as any).XLSX) {
        const script = window.document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        script.async = true;
        window.document.body.appendChild(script);
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = (err) => reject(err);
        });
      }

      const XLSX = (window as any).XLSX;
      
      const rows = filteredCases.map(c => ({
        "رقم القضية": c.caseNumber || "",
        "عنوان القضية": c.title || "",
        "نوع القضية": caseTypeLabel(c.type),
        "العميل": c.client?.fullName || "",
        "الخصم": c.opponentName || "",
        "محامي الخصم": c.opponentLawyer || "",
        "المحكمة": c.courtName || "",
        "تاريخ القضية": c.startDate || "",
        "الحالة": getStatusLabel(c.status || "OPEN"),
        ...(isExecutionView ? {
          "تصنيف الطلب": c.enforcementRequestType || "",
          "نوع الطلب": c.enforcementRequestKind || "",
          "نسبة إنجاز التنفيذ": `${enforcementProgressOf(c)}%`,
          "مهلة التنفيذ": c.enforcementNoticeDeadline || "",
          "حالة ملف التنفيذ": c.enforcementClosureReason
            ? `مغلق — ${ENFORCEMENT_CLOSURE_LABELS_AR[c.enforcementClosureReason] || c.enforcementClosureReason}`
            : (isEnforcementOverdue(c) ? "متأخر" : "قيد التنفيذ"),
          "الآيبان": c.enforcementIban || "",
        } : {}),
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "القضايا");
      
      // Set sheet direction to RTL for Arabic layouts
      if (!worksheet['!views']) worksheet['!views'] = [];
      worksheet['!views'].push({ RTL: true });

      XLSX.writeFile(workbook, "سجل_القضايا.xlsx");
    } catch (err) {
      console.error("Excel export error:", err);
      alert("حدث خطأ أثناء تصدير ملف الإكسل");
    }
  };

  const isExecutionView = section === "execution";
  const executionCases = isExecutionView ? cases.filter(c => isExecutionType(c.type)) : [];

  const filteredCases = Array.isArray(cases) ? cases.filter(c => {
    if (isExecutionView ? !isExecutionType(c.type) : isExecutionType(c.type)) return false;
    if (!isExecutionView && typeFilter && c.type !== typeFilter && caseTypeLabel(c.type) !== typeFilter) return false;
    if (statusFilter && caseStatusKey(c) !== statusFilter) return false;
    if (monthFilter && !caseDay(c).startsWith(monthFilter)) return false;
    if (isExecutionView && !matchesExecution(c, execFilter, execCapacity)) return false;
    const s = (search || "").toLowerCase();
    return (
      String(c.title || "").toLowerCase().includes(s) ||
      String(c.caseNumber || "").toLowerCase().includes(s) ||
      String(c.client?.fullName || "").toLowerCase().includes(s) ||
      String(c.opponentName || "").toLowerCase().includes(s)
    );
  }) : [];

  const pagedCases = filteredCases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // الرابط القديم للتنفيذ (/app/cases?type=تنفيذ) — محفوظ في المفضلة أو الإشعارات
  if (section === "cases" && params.get("type") === "تنفيذ") return <Navigate to="/app/execution" replace />;

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <AiSummarizerModal 
        isOpen={!!activeAiCase} 
        onClose={() => setActiveAiCase(null)} 
        target={activeAiCase} 
        type="case" 
      />

      <AddCaseModal 
        isOpen={isAddCaseOpen} 
        onClose={() => setIsAddCaseOpen(false)}
        onSuccess={() => fetchCases()}
        defaultType={typeFilter || undefined}
      />

      <EditCaseModal
        isOpen={!!editingCase}
        onClose={() => setEditingCase(null)}
        onSuccess={fetchCases}
        caseData={editingCase}
      />

      {isExecutionView ? (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold text-ink tracking-tight">التنفيذ</h1>
          <Button className="bg-navy-2 hover:bg-navy text-white px-5 py-5 rounded-lg font-bold" onClick={() => setIsAddCaseOpen(true)}>
            <Plus className="ml-2 h-4 w-4" /> طلب تنفيذ جديد
          </Button>
        </div>
      ) : (
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink tracking-tight">
            {typeFilter ? `قضايا ${typeFilter}` : "إدارة القضايا"}
          </h1>
          <p className="text-gray-500 mt-1">سجل القضايا والعملاء</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <Button
            onClick={exportToExcel}
            variant="outline"
            className="border-green-200 text-green-700 hover:bg-green-50 shadow-sm px-6 py-6 rounded-2xl transition-all font-bold"
          >
            <FileSpreadsheet className="ml-2 h-5 w-5 text-green-600" /> تصدير لإكسل
          </Button>
          <Button className="bg-navy-2 hover:bg-navy text-white px-6 py-6 rounded-2xl font-bold" onClick={() => setIsAddCaseOpen(true)}>
            <Plus className="ml-2 h-4 w-4" /> إضافة قضية جديدة
          </Button>
        </div>
      </div>
      )}

      {isExecutionView && (
        <ExecutionOverview
          cases={executionCases}
          filter={execFilter}
          capacity={execCapacity}
          onFilter={(f) => { setExecFilter(f); setPage(1); }}
          onCapacity={(c) => { setExecCapacity(c); setPage(1); }}
          onShowDetails={() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          onExport={exportToExcel}
        />
      )}

      {typeFilter && !isExecutionView && (
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm">
          <Gavel size={16} className="shrink-0" />
          <span>معروض فقط قضايا: <strong>{typeFilter}</strong></span>
          <button
            onClick={() => { params.delete("type"); setParams(params, { replace: true }); }}
            className="mr-auto flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg hover:bg-indigo-100 transition"
          >
            <X size={13} /> إلغاء الترشيح
          </button>
        </div>
      )}

      {statusFilter && CASE_STATUS_FILTER_AR[statusFilter] && (
        <FilterBanner label={`${isExecutionView ? "ملفات التنفيذ" : "القضايا"} ${CASE_STATUS_FILTER_AR[statusFilter]}`} onClear={() => clearParam("status")} />
      )}
      {monthFilter && (
        <FilterBanner label={`المضافة في ${monthFilterLabel(monthFilter)}`} onClear={() => clearParam("month")} />
      )}

      <Card ref={listRef} className="shadow-sm border-gray-200 scroll-mt-4">
        <CardHeader className="border-b bg-gray-50/50 pb-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:w-96">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input 
                placeholder="بحث برقم أو اسم القضية..." 
                className="pl-4 pr-10 bg-surface"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Button variant="outline" className="bg-surface">
              <Filter className="ml-2 w-4 h-4" /> تصفية
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isExecutionView ? (
            loading ? (
              <div className="text-center py-10 text-gray-500">جاري التحميل...</div>
            ) : filteredCases.length === 0 ? (
              <div className="text-center py-10 text-gray-500">لا يوجد ملفات تنفيذ مطابقة</div>
            ) : (
              <ExecutionRows cases={pagedCases} onEdit={setEditingCase} />
            )
          ) : (
          loading ? (
            <div className="text-center py-10 text-gray-500">جاري التحميل...</div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-10 text-gray-500">لا يوجد قضايا مطابقة للبحث</div>
          ) : (
            <div className="space-y-3 bg-gray-50/60 p-3">
              {pagedCases.map((c) => (
                <CaseRow
                  key={c.id}
                  c={c}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  userRole={userRole}
                />
              ))}
            </div>
          )
          )}
          <Pagination
            currentPage={page}
            totalItems={filteredCases.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
