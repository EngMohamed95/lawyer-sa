import { useEffect, useState } from "react";
import { Plus, Search, User, Phone, MapPin, Edit, FolderOpen, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { AddClientModal } from "../components/AddClientModal";
import { EditClientModal } from "../components/EditClientModal";
import { ClientDocumentsModal } from "../components/ClientDocumentsModal";
import { collection, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Pagination } from "../components/ui/Pagination";

export default function Clients() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [docsClient, setDocsClient] = useState<{ id: string; fullName: string } | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const userRole = localStorage.getItem("userRole");
  const lawyerId = localStorage.getItem("lawyerId");

  const currencyCode = localStorage.getItem("sys_currency") || "SAR";
  const currencySymbol = currencyCode === "SAR" ? "ر.س" : currencyCode === "EGP" ? "ج.م" : "$";

  const fetchClients = async () => {
    setLoading(true);
    try {
      const base = userRole !== "SUPER_ADMIN"
        ? query(collection(db, "clients"), where("lawyerId", "==", lawyerId), limit(200))
        : query(collection(db, "clients"), limit(200));
      const snap = await getDocs(base);
      setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setPage(1);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [lawyerId, userRole]);

  const exportToExcel = async () => {
    if (!clients || clients.length === 0) {
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
      
      const rows = filteredClients.map(c => ({
        "الاسم الكامل": c.fullName || "",
        "النوع": c.clientType === "COMPANY" ? "شركة" : "فرد",
        "الهاتف": c.phone || "",
        "رقم الهوية / الضريبي": c.nationalId || "",
        [`الأتعاب المتوقعة (${currencySymbol})`]: c.totalFees || 0,
        "العنوان": c.address || "",
        "تاريخ الإضافة": c.createdAt ? new Date(c.createdAt).toLocaleDateString("ar-EG") : ""
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "الموكلين");
      
      // Set sheet direction to RTL for Arabic layouts
      if (!worksheet['!views']) worksheet['!views'] = [];
      worksheet['!views'].push({ RTL: true });

      XLSX.writeFile(workbook, `قائمة_الموكلين_${currencyCode}.xlsx`);
    } catch (err) {
      console.error("Excel export error:", err);
      alert("حدث خطأ أثناء تصدير ملف الإكسل");
    }
  };

  const filteredClients = Array.isArray(clients)
    ? clients.filter(c => {
        const s = search.toLowerCase();
        return (
          String(c.fullName || "").toLowerCase().includes(s) ||
          String(c.phone || "").toLowerCase().includes(s) ||
          String(c.nationalId || "").toLowerCase().includes(s)
        );
      })
    : [];

  const pagedClients = filteredClients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchClients}
      />

      {editingClient && (
        <EditClientModal
          isOpen={!!editingClient}
          onClose={() => setEditingClient(null)}
          onSuccess={fetchClients}
          clientData={editingClient}
        />
      )}

      <ClientDocumentsModal
        isOpen={!!docsClient}
        onClose={() => setDocsClient(null)}
        client={docsClient}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight font-['Tajawal']">قائمة الموكلين</h1>
          <p className="text-gray-500 mt-1">إدارة كافة بيانات الموكلين والشركات</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <Button
            onClick={exportToExcel}
            variant="outline"
            className="border-green-200 text-green-700 hover:bg-green-50 shadow-sm px-6 py-6 rounded-2xl transition-all font-bold font-['Tajawal']"
          >
            <FileSpreadsheet className="ml-2 h-5 w-5 text-green-600" /> تصدير لإكسل
          </Button>
          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white shadow-lg shadow-[#0A192F]/20 px-6 py-6 rounded-2xl transition-all active:scale-[0.98] font-bold font-['Tajawal']"
          >
            <Plus className="ml-2 h-5 w-5" /> إضافة موكل جديد
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 pb-4">
          <div className="flex items-center space-x-2 space-x-reverse relative w-full sm:w-96">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="بحث باسم الموكل أو رقم الهاتف..."
              className="pl-4 pr-10 bg-white"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="text-right font-bold text-[#0A192F]">الاسم</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F]">التواصل</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden sm:table-cell">النوع</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden md:table-cell">رقم الهوية</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden lg:table-cell">العنوان</TableHead>
                {userRole === "SUPER_ADMIN" && (
                  <TableHead className="text-right font-bold text-purple-600 hidden xl:table-cell">
                    المحامي
                  </TableHead>
                )}
                <TableHead className="text-center font-bold text-[#0A192F]">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={userRole === "SUPER_ADMIN" ? 7 : 6}
                    className="text-center py-10 text-gray-500"
                  >
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              ) : filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={userRole === "SUPER_ADMIN" ? 7 : 6}
                    className="text-center py-10 text-gray-500"
                  >
                    لا يوجد موكلين مسجلين
                  </TableCell>
                </TableRow>
              ) : (
                pagedClients.map(client => {
                  try {
                    return (
                      <TableRow key={client.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="font-medium text-[#0A192F]">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-[#0A192F]">
                              <User size={18} />
                            </div>
                            {client.fullName || "غير مسجل"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-sm">
                            <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-[#0A192F] hover:underline decoration-[#D4AF37]">
                              <Phone size={12} className="text-gray-400" /> {client.phone || "-"}
                            </a>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={client.clientType === "COMPANY" ? "secondary" : "outline"}>
                            {client.clientType === "COMPANY" ? "شركة" : "فرد"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm hidden md:table-cell">
                          {client.nationalId || "-"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm text-gray-600 flex items-center gap-1">
                            <MapPin size={12} className="text-gray-400" /> {client.address || "-"}
                          </span>
                        </TableCell>
                        {userRole === "SUPER_ADMIN" && (
                          <TableCell className="text-xs text-purple-600 hidden xl:table-cell">
                            {client.lawyerId || "غير محدد"}
                          </TableCell>
                        )}
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-amber-200 text-amber-700 hover:bg-amber-50"
                              onClick={() =>
                                setDocsClient({ id: client.id, fullName: client.fullName })
                              }
                            >
                              <FolderOpen className="ml-1 h-3 w-3" /> مستندات
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingClient(client)}
                            >
                              <Edit className="ml-1 h-3 w-3" /> تعديل
                            </Button>
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
            totalItems={filteredClients.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
