import { useEffect, useState } from "react";
import { Plus, Search, Filter, Eye, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { AiSummarizerModal } from "../components/AiSummarizerModal";
import { AddCaseModal } from "../components/AddCaseModal";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import type { Query, DocumentData } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Pagination } from "../components/ui/Pagination";
import { Link } from "react-router";

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

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-green-100 text-green-800 hover:bg-green-200",
  CLOSED: "bg-gray-100 text-gray-800 hover:bg-gray-200",
  ARCHIVED: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  ACTIVE: "bg-green-100 text-green-800 hover:bg-green-200",
  PENDING: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  INACTIVE: "bg-gray-100 text-gray-800 hover:bg-gray-200",
  SUSPENDED: "bg-gray-100 text-gray-800 hover:bg-gray-200",
  DONE: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  COMPLETED: "bg-blue-100 text-blue-800 hover:bg-blue-200",
};

const getStatusLabel = (status: string) => STATUS_LABELS_AR[status] || "مفتوحة";

const getStatusBadge = (status: string) => (
  <Badge className={STATUS_COLORS[status] || "bg-gray-100 text-gray-800 hover:bg-gray-200"}>
    {getStatusLabel(status)}
  </Badge>
);

export default function Cases() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAiCase, setActiveAiCase] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [isAddCaseOpen, setIsAddCaseOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

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
        "المتدربون": (c.traineeNames || []).join("، ")
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

  const filteredCases = Array.isArray(cases) ? cases.filter(c => {
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
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">إدارة القضايا</h1>
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

      <Card className="shadow-sm border-gray-200">
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
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="text-right font-bold text-[#133B2E]">رقم القضية</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E]">عنوان القضية</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E] hidden sm:table-cell">العميل</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E] hidden md:table-cell">الخصم</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E]">الحالة</TableHead>
                {(userRole === "LAWYER" || userRole === "OFFICE_LAWYER") && <TableHead className="text-right font-bold text-[#133B2E] hidden lg:table-cell">المحامي المسؤول</TableHead>}
                {userRole === "SUPER_ADMIN" && <TableHead className="text-right font-bold text-purple-600 hidden lg:table-cell">المحامي</TableHead>}
                <TableHead className="text-right font-bold text-[#133B2E] hidden lg:table-cell">المستشار</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E] hidden lg:table-cell">المتدربون</TableHead>
                <TableHead className="text-center font-bold text-[#133B2E]">عرض</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={userRole === "SUPER_ADMIN" ? 9 : 8} className="text-center py-10 text-gray-500">جاري التحميل...</TableCell>
                </TableRow>
              ) : filteredCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={userRole === "SUPER_ADMIN" ? 9 : 8} className="text-center py-10 text-gray-500">لا يوجد قضايا مطابقة للبحث</TableCell>
                </TableRow>
              ) : (
                pagedCases.map((c) => {
                  try {
                    return (
                      <TableRow key={c.id} className="hover:bg-gray-50/50">
                        <TableCell className="font-mono text-sm">
                          <Link to={`/app/cases/${c.id}`} className="text-[#133B2E] hover:underline decoration-[#D4AF37] decoration-2 underline-offset-4">
                            {c.caseNumber || "-"}
                          </Link>
                        </TableCell>
                        <TableCell className="font-medium text-[#133B2E]">{c.title || "بدون عنوان"}</TableCell>
                        <TableCell className="hidden sm:table-cell">{c.client?.fullName || "-"}</TableCell>
                        <TableCell className="hidden md:table-cell">{c.opponentName || "-"}</TableCell>
                        <TableCell>{getStatusBadge(c.status || "OPEN")}</TableCell>
                        {(userRole === "LAWYER" || userRole === "OFFICE_LAWYER") && <TableCell className="hidden lg:table-cell text-sm">{c.assignedLawyerName || "المدير"}</TableCell>}
                        {userRole === "SUPER_ADMIN" && <TableCell className="text-xs text-purple-600 hidden lg:table-cell">{c.lawyerId || "غير محدد"}</TableCell>}
                        <TableCell className="hidden lg:table-cell text-sm">{c.assignedConsultantName || "-"}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">{(c.traineeNames && c.traineeNames.length > 0) ? c.traineeNames.join("، ") : "-"}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <Link to={`/app/cases/${c.id}`}>
                              <Button 
                                variant="outline" 
                                className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 hover:text-[#B8962E] flex items-center gap-2 px-3 py-1.5 h-auto text-xs font-bold rounded-xl transition-all"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>تفاصيل القضية</span>
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  } catch (e) {
                    return null;
                  }
                })
              )}
            </TableBody>
          </Table>
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
