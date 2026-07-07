import { useEffect, useState } from "react";
import { DollarSign, Search, Plus, CreditCard, Banknote, FileText, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AddPaymentModal } from "../components/AddPaymentModal";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Accounting() {
  const [data, setData] = useState<any>({ payments: [], expenses: [], summary: { totalPaid: 0, totalOwed: 0 } });
  const [loading, setLoading] = useState(true);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);

  const lawyerId = localStorage.getItem("lawyerId");
  const userRole = localStorage.getItem("userRole");

  const currencyCode = localStorage.getItem("sys_currency") || "SAR";
  const currencySymbol = currencyCode === "SAR" ? "ر.س" : currencyCode === "EGP" ? "ج.م" : "$";

  const fetchAccountingData = async () => {
    setLoading(true);
    try {
      let paymentsQ: any = collection(db, "payments");
      let clientsQ: any = collection(db, "clients");
      let casesQ: any = collection(db, "cases");

      // SaaS Filtering: Only show financial data belonging to this lawyer
      if (userRole !== "SUPER_ADMIN") {
        paymentsQ = query(collection(db, "payments"), where("lawyerId", "==", lawyerId));
        clientsQ = query(collection(db, "clients"), where("lawyerId", "==", lawyerId));
        casesQ = query(collection(db, "cases"), where("lawyerId", "==", lawyerId));
      }

      const [paymentsSnap, clientsSnap, casesSnap] = await Promise.all([
        getDocs(paymentsQ),
        getDocs(clientsQ),
        getDocs(casesQ)
      ]);

      const clients = clientsSnap.docs.reduce((acc: any, doc) => {
        acc[doc.id] = doc.data();
        return acc;
      }, {});

      const cases = casesSnap.docs.reduce((acc: any, doc) => {
        acc[doc.id] = doc.data();
        return acc;
      }, {});

      const payments = paymentsSnap.docs.map(doc => {
        const p = doc.data() as any;
        return {
          id: doc.id,
          ...p,
          client: clients[p.clientId] || { fullName: "غير معروف" },
          caseRef: cases[p.caseId] || null
        };
      });

      // Calculate Summary
      const totalPaid = payments.reduce((sum, p) => sum + (Number((p as any).amount) || 0), 0);
      
      // Calculate Total Owed (TotalFees - Paid)
      const totalFees = clientsSnap.docs.reduce((sum, doc) => sum + (Number((doc.data() as any).totalFees) || 0), 0);
      const totalOwed = Math.max(0, totalFees - totalPaid);

      setData({
        payments,
        expenses: [], 
        summary: { totalPaid, totalOwed }
      });
    } catch (error) {
      console.error("Error fetching accounting data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccountingData();
  }, [lawyerId, userRole]);

  const exportToExcel = async () => {
    if (!data.payments || data.payments.length === 0) {
      alert("لا توجد دفعات لتصديرها");
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
      
      const rows = data.payments.map(p => ({
        "التاريخ": p.date ? new Date(p.date).toLocaleDateString("ar-EG") : "",
        "الموكل": p.client?.fullName || "",
        "القضية": p.caseRef?.title || "دفعة عامة أتعاب",
        [`المبلغ المستلم (${currencySymbol})`]: p.amount || 0,
        "ملاحظات / البيان": p.notes || ""
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "المدفوعات والأتعاب");
      
      // Set sheet direction to RTL
      if (!worksheet['!views']) worksheet['!views'] = [];
      worksheet['!views'].push({ RTL: true });

      XLSX.writeFile(workbook, `كشف_حساب_المدفوعات_${currencyCode}.xlsx`);
    } catch (err) {
      console.error("Excel export error:", err);
      alert("حدث خطأ أثناء تصدير كشف الحساب");
    }
  };

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">الحسابات</h1>
          <p className="text-gray-500 mt-1 text-sm">إدارة المدفوعات، الأتعاب، والمصروفات بالعملة النشطة ({currencyCode})</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={exportToExcel}
            variant="outline"
            className="border-green-200 text-green-700 hover:bg-green-50 shadow-sm font-bold"
          >
            <FileSpreadsheet className="ml-2 h-5 w-5 text-green-600" /> تصدير كشف الحساب
          </Button>
          <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 font-bold">
            <Plus className="ml-2 h-4 w-4" /> إضافة مصروف
          </Button>
          <Button className="bg-[#D4AF37] hover:bg-[#B8962E] text-white font-bold" onClick={() => setIsAddPaymentOpen(true)}>
            <Plus className="ml-2 h-4 w-4" /> تسجيل دفعة
          </Button>
        </div>
      </div>

      <AddPaymentModal
        isOpen={isAddPaymentOpen}
        onClose={() => setIsAddPaymentOpen(false)}
        onSuccess={fetchAccountingData}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">إجمالي المدفوعات</CardTitle>
            <div className="p-2 bg-green-50 rounded-xl"><DollarSign size={20} className="text-green-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0A192F]">{(data.summary?.totalPaid || 0).toLocaleString('ar-EG')} {currencySymbol}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">إجمالي المصروفات (الشهر)</CardTitle>
            <div className="p-2 bg-red-50 rounded-xl"><CreditCard size={20} className="text-red-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0A192F]">٠ {currencySymbol}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">المستحقات المتبقية</CardTitle>
            <div className="p-2 bg-orange-50 rounded-xl"><Banknote size={20} className="text-orange-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0A192F]">{(data.summary?.totalOwed || 0).toLocaleString('ar-EG')} {currencySymbol}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-gray-200">
        <Tabs defaultValue="payments" className="w-full">
          <CardHeader className="border-b bg-gray-50/50 pb-0 pt-4">
            <TabsList className="bg-transparent border-b-0 space-x-4 space-x-reverse h-auto p-0">
              <TabsTrigger value="payments" className="data-[state=active]:bg-white data-[state=active]:border-t-2 data-[state=active]:border-[#D4AF37] data-[state=active]:shadow-none rounded-none px-6 py-3 font-semibold">
                المدفوعات والأتعاب
              </TabsTrigger>
              <TabsTrigger value="expenses" className="data-[state=active]:bg-white data-[state=active]:border-t-2 data-[state=active]:border-[#D4AF37] data-[state=active]:shadow-none rounded-none px-6 py-3 font-semibold">
                المصروفات
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="p-0">
            <TabsContent value="payments" className="m-0 border-none outline-none p-0">
              <Table>
                <TableHeader className="bg-white">
                  <TableRow>
                    <TableHead className="text-right font-bold text-[#0A192F]">التاريخ</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">القضية / الموكل</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">المبلغ</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F] hidden sm:table-cell">البيان</TableHead>
                    {userRole === "SUPER_ADMIN" && <TableHead className="text-right font-bold text-purple-600 hidden md:table-cell">المحامي</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={userRole === "SUPER_ADMIN" ? 5 : 4} className="text-center py-10">جاري التحميل...</TableCell></TableRow>
                  ) : !Array.isArray(data?.payments) || data.payments.length === 0 ? (
                    <TableRow><TableCell colSpan={userRole === "SUPER_ADMIN" ? 5 : 4} className="text-center py-10 text-gray-500">لا يوجد مدفوعات مسجلة</TableCell></TableRow>
                  ) : (
                    data.payments.map((p: any) => (
                      <TableRow key={p.id} className="hover:bg-gray-50/50">
                        <TableCell dir="ltr" className="text-right">{p.date ? new Date(p.date).toLocaleDateString('ar-EG') : "-"}</TableCell>
                        <TableCell>
                           <div className="font-semibold text-[#0A192F]">{p.caseRef?.title || "دفعة عامة"}</div>
                           <div className="text-xs text-gray-500">{p.client?.fullName || "-"}</div>
                        </TableCell>
                        <TableCell className="font-bold text-green-600">{(p.amount || 0).toLocaleString('ar-EG')} {currencySymbol}</TableCell>
                        <TableCell className="hidden sm:table-cell">{p.notes || "-"}</TableCell>
                        {userRole === "SUPER_ADMIN" && <TableCell className="text-xs text-purple-600 hidden md:table-cell">{p.lawyerId || "غير محدد"}</TableCell>}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            
            <TabsContent value="expenses" className="m-0 border-none outline-none p-0">
              <Table>
                <TableHeader className="bg-white">
                  <TableRow>
                    <TableHead className="text-right font-bold text-[#0A192F]">التاريخ</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">النوع</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">المبلغ</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">البيان</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow><TableCell colSpan={4} className="text-center py-10 text-gray-500">لا يوجد مصروفات مسجلة</TableCell></TableRow>
                </TableBody>
              </Table>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
