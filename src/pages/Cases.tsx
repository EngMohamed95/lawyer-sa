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
import { db } from "../lib/firebase";
import { Pagination } from "../components/ui/Pagination";
import { Link } from "react-router";

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'OPEN': return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">مفتوحة</Badge>;
    case 'CLOSED': return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200">مغلقة</Badge>;
    case 'ARCHIVED': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">مؤرشفة</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

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
      const casesQuery = userRole !== "SUPER_ADMIN"
        ? query(collection(db, "cases"), where("lawyerId", "==", lawyerId), limit(200))
        : query(collection(db, "cases"), limit(200));
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
        return { id: doc.id, ...data, client: clients[data.clientId] || { fullName: "موكل غير معروف" } };
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
        "الموكل": c.client?.fullName || "",
        "الخصم": c.opponentName || "",
        "محامي الخصم": c.opponentLawyer || "",
        "المحكمة": c.courtName || "",
        "تاريخ البداية": c.startDate || "",
        "الحالة": c.status === "OPEN" ? "مفتوحة" : c.status === "CLOSED" ? "مغلقة" : "مؤرشفة"
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
          <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">إدارة القضايا</h1>
          <p className="text-gray-500 mt-1">سجل القضايا والموكلين</p>
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
                <TableHead className="text-right font-bold text-[#0A192F]">رقم القضية</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F]">عنوان القضية</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden sm:table-cell">الموكل</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden md:table-cell">الخصم</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F]">الحالة</TableHead>
                {userRole === "SUPER_ADMIN" && <TableHead className="text-right font-bold text-purple-600 hidden lg:table-cell">المحامي</TableHead>}
                <TableHead className="text-center font-bold text-[#0A192F]">عرض</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={userRole === "SUPER_ADMIN" ? 7 : 6} className="text-center py-10 text-gray-500">جاري التحميل...</TableCell>
                </TableRow>
              ) : filteredCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={userRole === "SUPER_ADMIN" ? 7 : 6} className="text-center py-10 text-gray-500">لا يوجد قضايا مطابقة للبحث</TableCell>
                </TableRow>
              ) : (
                pagedCases.map((c) => {
                  try {
                    return (
                      <TableRow key={c.id} className="hover:bg-gray-50/50">
                        <TableCell className="font-mono text-sm">{c.caseNumber || "-"}</TableCell>
                        <TableCell className="font-medium text-[#0A192F]">{c.title || "بدون عنوان"}</TableCell>
                        <TableCell className="hidden sm:table-cell">{c.client?.fullName || "-"}</TableCell>
                        <TableCell className="hidden md:table-cell">{c.opponentName || "-"}</TableCell>
                        <TableCell>{getStatusBadge(c.status || "OPEN")}</TableCell>
                        {userRole === "SUPER_ADMIN" && <TableCell className="text-xs text-purple-600 hidden lg:table-cell">{c.lawyerId || "غير محدد"}</TableCell>}
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-purple-600 hover:text-purple-800 hover:bg-purple-50" title="تلخيص ذكي (AI)" onClick={() => setActiveAiCase(c)}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                            </Button>
                            <Link to={`/app/cases/${c.id}`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-[#D4AF37] hover:text-[#B8962E] hover:bg-[#D4AF37]/10" title="تفاصيل القضية">
                                <Eye className="h-4 w-4" />
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
