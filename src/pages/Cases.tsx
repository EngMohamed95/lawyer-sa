import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Plus, Search, Filter, Eye, FileSpreadsheet, Gavel, X, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AiSummarizerModal } from "../components/AiSummarizerModal";
import { AddCaseModal } from "../components/AddCaseModal";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import type { Query, DocumentData } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Pagination } from "../components/ui/Pagination";
import { Link, useSearchParams } from "react-router";
import { formatHijri } from "../lib/calendar";
import ExecutionOverview, { matchesExecution, type ExecutionCapacity, type ExecutionFilter } from "../components/ExecutionOverview";

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

const enforcementProgressOf = (c: any): number => {
  const steps = c.enforcementSteps || {};
  const done = Object.values(steps).filter(Boolean).length;
  return Math.round((done / 22) * 100);
};

const isEnforcementOverdue = (c: any): boolean =>
  !!c.enforcementNoticeDeadline &&
  !c.enforcementClosureReason &&
  new Date(c.enforcementNoticeDeadline).getTime() < Date.now();

// أنواع قديمة محفوظة بالإنجليزي في بعض البيانات
const CASE_TYPE_LABELS_AR: Record<string, string> = {
  CIVIL: "مدني",
  COMMERCIAL: "تجاري",
  CRIMINAL: "جزائي",
  LABOR: "عمالي",
  EXECUTION: "تنفيذ",
};

const CLIENT_ROLE_LABELS_AR: Record<string, string> = {
  PLAINTIFF: "وكيل المدعي",
  DEFENDANT: "وكيل المدعى عليه",
};

const CaseField = ({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-0.5 min-w-0 ${className}`}>
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-900 leading-tight truncate">{children}</span>
  </div>
);

// حاوية تمرير أفقي بأزرار أسهم على الجانبين (مثل ناجز) تظهر فقط عند وجود محتوى مخفي
function CaseRowsScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    // في RTL تكون scrollLeft صفرًا في البداية وسالبة عند التمرير لليسار
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setCanPrev(pos > 2);
    setCanNext(pos < max - 2);
  };

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [children]);

  const scrollBy = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  const arrow = "absolute top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-gray-800/90 text-white flex items-center justify-center shadow-md hover:bg-gray-900 transition";

  return (
    <div className="relative">
      {canPrev && (
        <button aria-label="السابق" onClick={() => scrollBy(1)} className={`${arrow} right-3`}>
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
      {canNext && (
        <button aria-label="التالي" onClick={() => scrollBy(-1)} className={`${arrow} left-3`}>
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <div ref={ref} onScroll={update} className="overflow-x-auto">
        <div className="min-w-[900px] divide-y divide-gray-200 bg-gray-50/60">{children}</div>
      </div>
    </div>
  );
}

function CaseRow({ c, expanded, onToggle, userRole }: { c: any; expanded: boolean; onToggle: () => void; userRole: string | null }) {
  const plaintiff = c.plaintiffName || (c.clientRole === "DEFENDANT" ? c.opponentName : c.client?.fullName) || "-";
  const defendant = c.defendantName || (c.clientRole === "DEFENDANT" ? c.client?.fullName : c.opponentName) || "-";

  return (
    <div>
      <div className="flex items-stretch gap-4 py-1.5 pl-4">
        <div className="flex-1 grid grid-cols-[1.2fr_0.9fr_1fr_1fr_1.4fr_1.4fr_0.8fr] gap-4 items-center">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-500">رقم القضية</span>
            <Link to={`/app/cases/${c.id}`} className="text-lg font-bold text-blue-600 leading-tight transition-colors hover:text-blue-800" dir="ltr" style={{ textAlign: "right" }}>
              {c.caseNumber || "-"}
            </Link>
          </div>
          <CaseField label="تاريخ القضية">{formatHijri(c.startDate || c.createdAt)}</CaseField>
          <CaseField label="نوع القضية">{CASE_TYPE_LABELS_AR[c.type] || c.type || "-"}</CaseField>
          <CaseField label="الصفة">{CLIENT_ROLE_LABELS_AR[c.clientRole] || "وكيل"}</CaseField>
          <CaseField label="المدعي">{plaintiff}</CaseField>
          <CaseField label="المدعى عليه">{defendant}</CaseField>
          <CaseField label="الحالة">{getStatusLabel(c.status || "OPEN")}</CaseField>
        </div>
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
          className="h-7 w-7 shrink-0 self-center rounded-md bg-sky-500 text-white transition-colors hover:bg-sky-600"
        >
          <ChevronDown className={`mx-auto h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="ml-8 bg-white border-t border-gray-100 px-4 py-3">
          <div className="grid grid-cols-4 gap-x-6 gap-y-3">
            <CaseField label="عنوان القضية">{c.title || "بدون عنوان"}</CaseField>
            <CaseField label="المحكمة">{[c.courtName, c.courtCircle].filter(Boolean).join(" — ") || "-"}</CaseField>
            <CaseField label="العميل">{c.client?.fullName || "-"}</CaseField>
            <CaseField label="محامي الخصم">{c.opponentLawyer || "-"}</CaseField>
            {(userRole === "LAWYER" || userRole === "OFFICE_LAWYER") && (
              <CaseField label="المحامي المسؤول">{c.assignedLawyerName || "المدير"}</CaseField>
            )}
            {userRole === "SUPER_ADMIN" && <CaseField label="المحامي">{c.lawyerId || "غير محدد"}</CaseField>}
            <CaseField label="المستشار">{c.assignedConsultantName || "-"}</CaseField>
            <CaseField label="المتدربون">{c.traineeNames?.length ? c.traineeNames.join("، ") : "-"}</CaseField>
          </div>
          <div className="mt-3 flex justify-end">
            <Link to={`/app/cases/${c.id}`}>
              <Button className="bg-[#22B04B] hover:bg-[#1c9a41] text-white gap-2 rounded-xl font-bold">
                <Eye className="h-4 w-4" /> تفاصيل القضية
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── قائمة ملفات التنفيذ (بتصميم ناجز) ────────────────────────── */

const EXECUTION_COLS = "grid grid-cols-[1.3fr_0.9fr_1.4fr_1fr_1.5fr_1.2fr_0.9fr_5rem] gap-4 items-center";

const executionStatusOf = (c: any): { label: string; dot: string; text: string } => {
  if (c.enforcementClosureReason) return { label: "منتهي", dot: "bg-gray-400", text: "text-gray-500" };
  if (isEnforcementOverdue(c)) return { label: "متأخر", dot: "bg-red-500", text: "text-red-600" };
  return { label: "قيد التنفيذ", dot: "bg-blue-600", text: "text-gray-600" };
};

/** أسماء المنفذ ضدهم — من أطراف الدعوى إن وُجدت، وإلا من الحقول القديمة */
const debtorNamesOf = (c: any): string[] => {
  if (Array.isArray(c.parties)) {
    const names = c.parties.filter((p: any) => p.role === "DEFENDANT").map((p: any) => p.name).filter(Boolean);
    if (names.length) return names;
  }
  const fallback = c.defendantName || (c.clientRole === "DEFENDANT" ? c.client?.fullName : c.opponentName) || "";
  return fallback ? String(fallback).split("، ") : [];
};

function ExecutionRows({ cases }: { cases: any[] }) {
  return (
    <div className="p-3 space-y-2 bg-gray-50/60">
      <div className={`${EXECUTION_COLS} px-4 py-2 text-sm font-bold text-gray-700`}>
        <span>رقم الطلب</span>
        <span>نوع الطلب</span>
        <span>نوع السند</span>
        <span>تاريخ تقديم الطلب</span>
        <span>اسم المنفذ ضده</span>
        <span>اسم المحكمة</span>
        <span>حالة الطلب</span>
        <span />
      </div>
      {cases.map((c) => {
        const status = executionStatusOf(c);
        const debtors = debtorNamesOf(c);
        return (
          <div key={c.id} className={`${EXECUTION_COLS} px-4 py-3 rounded-lg bg-white border border-gray-100 shadow-xs hover:shadow-sm transition`}>
            <Link to={`/app/cases/${c.id}?tab=enforcement`} dir="ltr" style={{ textAlign: "right" }}
              className="text-base font-bold text-gray-900 hover:text-[#1a9a45] truncate">
              {c.caseNumber || "-"}
            </Link>
            <span className="text-sm text-gray-800 truncate">{c.enforcementRequestType || "-"}</span>
            <span className="text-sm text-gray-800 leading-snug line-clamp-2">{c.enforcementDeedType || "-"}</span>
            <span className="text-sm text-gray-800">{formatHijri(c.startDate || c.createdAt)} هـ</span>
            <span className="text-sm text-gray-800 leading-snug min-w-0">
              {debtors.length ? debtors.slice(0, 2).map((n) => <span key={n} className="block truncate">{n}</span>) : "-"}
              {debtors.length > 2 && <span className="block text-xs text-gray-400">+{debtors.length - 2} آخرين</span>}
            </span>
            <span className="text-sm text-gray-800 truncate">{c.courtName || "-"}</span>
            <span className={`flex items-center gap-1.5 text-xs ${status.text}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} /> {status.label}
            </span>
            <Link to={`/app/cases/${c.id}?tab=enforcement`}
              className="justify-self-end px-3 py-1.5 rounded-md border border-gray-300 text-sm font-bold text-gray-800 hover:bg-gray-50 transition">
              تفاصيل
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export default function Cases() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAiCase, setActiveAiCase] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [isAddCaseOpen, setIsAddCaseOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [execFilter, setExecFilter] = useState<ExecutionFilter>("ALL");
  const [execCapacity, setExecCapacity] = useState<ExecutionCapacity>("ANY");
  const listRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  // ?type= يأتي من "التنفيذ" في القائمة الجانبية — يفتح الصفحة مُرشَّحة على
  // قضايا التنفيذ فقط. قضايا التنفيذ لا تزال قضايا عادية (type: "تنفيذ")
  // إلى أن تُبنى وحدة تنفيذ مستقلة.
  const [params, setParams] = useSearchParams();
  const typeFilter = params.get("type");

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
        casesQuery = query(collection(db, "cases"), where("lawyerId", "==", lawyerId), where("assignedLawyerId", "==", userId), limit(200));
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
        "نوع القضية": c.type || "",
        "العميل": c.client?.fullName || "",
        "الخصم": c.opponentName || "",
        "محامي الخصم": c.opponentLawyer || "",
        "المحكمة": c.courtName || "",
        "تاريخ البداية": c.startDate || "",
        "الحالة": getStatusLabel(c.status || "OPEN"),
        "المستشار": c.assignedConsultantName || "",
        "المتدربون": (c.traineeNames || []).join("، "),
        ...(isExecutionView ? {
          "نوع الطلب": c.enforcementRequestType || "",
          "نوع السند": c.enforcementDeedType || "",
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

  const isExecutionView = typeFilter === "تنفيذ";
  const executionCases = isExecutionView ? cases.filter(c => c.type === "تنفيذ") : [];

  const filteredCases = Array.isArray(cases) ? cases.filter(c => {
    if (typeFilter && c.type !== typeFilter) return false;
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
        onSuccess={fetchCases}
        defaultType={typeFilter || undefined}
      />

      {isExecutionView ? (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">التنفيذ</h1>
          <Button className="bg-[#1a9a45] hover:bg-[#15803a] text-white px-5 py-5 rounded-lg font-bold" onClick={() => setIsAddCaseOpen(true)}>
            <Plus className="ml-2 h-4 w-4" /> طلب تنفيذ جديد
          </Button>
        </div>
      ) : (
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">
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
          <Button className="bg-[#D4AF37] hover:bg-[#B8962E] text-white px-6 py-6 rounded-2xl font-bold" onClick={() => setIsAddCaseOpen(true)}>
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

      <Card ref={listRef} className="shadow-sm border-gray-200 scroll-mt-4">
        <CardHeader className="border-b bg-gray-50/50 pb-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:w-96">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input 
                placeholder="بحث برقم أو اسم القضية..." 
                className="pl-4 pr-10 bg-white"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Button variant="outline" className="bg-white">
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
              <CaseRowsScroller>
                <ExecutionRows cases={pagedCases} />
              </CaseRowsScroller>
            )
          ) : (
          loading ? (
            <div className="text-center py-10 text-gray-500">جاري التحميل...</div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-10 text-gray-500">لا يوجد قضايا مطابقة للبحث</div>
          ) : (
            <CaseRowsScroller>
              {pagedCases.map((c) => (
                <CaseRow
                  key={c.id}
                  c={c}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  userRole={userRole}
                />
              ))}
            </CaseRowsScroller>
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
