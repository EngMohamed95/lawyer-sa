import { useEffect, useState } from "react";
import { BarChart3, PieChart, TrendingUp, Download, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Reports() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const lawyerId = localStorage.getItem("lawyerId");
      const userRole = localStorage.getItem("userRole");

      let casesQ: any = collection(db, "cases");
      let paymentsQ: any = collection(db, "payments");
      let tasksQ: any = collection(db, "tasks");

      if (userRole !== "SUPER_ADMIN") {
        const { query, where } = await import("firebase/firestore");
        casesQ = query(collection(db, "cases"), where("lawyerId", "==", lawyerId));
        paymentsQ = query(collection(db, "payments"), where("lawyerId", "==", lawyerId));
        tasksQ = query(collection(db, "tasks"), where("lawyerId", "==", lawyerId));
      }

      const [casesSnap, paymentsSnap, tasksSnap] = await Promise.all([
        getDocs(casesQ),
        getDocs(paymentsQ),
        getDocs(tasksQ)
      ]);

      const cases = casesSnap.docs.map(doc => doc.data());
      const payments = paymentsSnap.docs.map(doc => doc.data());
      const tasks = tasksSnap.docs.map(doc => doc.data());

      // Simple stats for demonstration
      const casesByTypeObj = cases.reduce((acc: any, curr: any) => {
        const type = curr.type || "أخرى";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      const casesByType = Object.keys(casesByTypeObj).map(type => ({
        type,
        count: casesByTypeObj[type]
      }));

      // Mock monthly revenue based on payments
      const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو"];
      const monthlyRevenue = months.map(month => ({
        month,
        revenue: Math.floor(Math.random() * 15000) + 5000 // Just for visual for now
      }));

      setData({
        casesByType,
        monthlyRevenue,
        totalCases: cases.length,
        completedTasks: tasks.filter((t: any) => t.status === 'COMPLETED').length,
        newClients: 12 // Placeholder
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">التقارير والإحصائيات</h1>
          <p className="text-gray-500 mt-1">تقارير شاملة عن أداء المكتب، القضايا، والموارد المالية</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-white">
            <Printer className="ml-2 h-4 w-4" /> طباعة
          </Button>
          <Button className="bg-[#D4AF37] hover:bg-[#B8962E] text-white">
            <Download className="ml-2 h-4 w-4" /> تصدير PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">جاري تحميل التقارير...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="text-[#0A192F]" size={20} />
                الإيرادات الشهرية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-end justify-between gap-1 sm:gap-2 border-b border-l border-gray-200 pb-4 pr-12 relative px-2 sm:px-4">
                <div className="absolute top-0 right-0 h-full flex flex-col justify-between text-[10px] sm:text-xs text-gray-400 py-2">
                  <span>20k</span>
                  <span>15k</span>
                  <span>10k</span>
                  <span>5k</span>
                  <span>0</span>
                </div>
                {data?.monthlyRevenue?.map((item: any, idx: number) => (
                  <div key={idx} className="flex flex-col items-center gap-2 flex-1 group">
                    <div className="w-full bg-[#0A192F] hover:bg-[#D4AF37] transition-colors rounded-t-sm relative flex justify-center" style={{ height: `${(item.revenue / 20000) * 100}%`, minHeight: '20px' }}>
                      <span className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-black text-white text-[10px] px-2 py-1 rounded whitespace-nowrap transition-opacity z-10">{item.revenue.toLocaleString('ar-EG')}</span>
                    </div>
                    <span className="text-[10px] sm:text-sm font-medium text-gray-600 truncate max-w-full">{item.month}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="text-[#D4AF37]" size={20} />
                توزيع القضايا حسب النوع
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row items-center justify-center gap-8 py-8">
              <div className="w-48 h-48 rounded-full border-[16px] border-[#0A192F] border-r-[#D4AF37] border-b-gray-300 relative flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold text-[#0A192F]">{data?.totalCases || 0}</div>
                  <div className="text-xs text-gray-500">إجمالي القضايا</div>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {data?.casesByType?.length === 0 ? (
                   <span className="text-sm text-gray-400">لا يوجد بيانات</span>
                ) : data?.casesByType?.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-[#0A192F]' : idx === 1 ? 'bg-[#D4AF37]' : 'bg-gray-300'}`}></div>
                    <span className="text-sm text-gray-600 w-24">{item.type}</span>
                    <span className="text-sm font-bold">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm col-span-1 lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="text-green-600" size={20} />
                ملخص الأداء العام
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-gray-500 text-sm mb-1">نسبة كسب القضايا</div>
                  <div className="text-2xl font-bold text-green-600">٨٥٪</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-gray-500 text-sm mb-1">مهام منجزة</div>
                  <div className="text-2xl font-bold text-[#0A192F]">{data?.completedTasks || 0}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-gray-500 text-sm mb-1">عملاء جدد (الشهر)</div>
                  <div className="text-2xl font-bold text-[#D4AF37]">{data?.newClients || 0}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-gray-500 text-sm mb-1">متوسط التقييم</div>
                  <div className="text-2xl font-bold text-blue-600">٤.٨/٥</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
