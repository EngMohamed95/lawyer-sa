import { useEffect, useState } from "react";
import { BarChart3, PieChart, TrendingUp, Download, Printer, DollarSign, Wallet, CreditCard, CheckSquare, Users, FileText, ArrowUpRight, ArrowDownRight, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Reports() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const currencyCode = localStorage.getItem("sys_currency") || "SAR";
  const currencySymbol = currencyCode === "SAR" ? "ر.س" : currencyCode === "EGP" ? "ج.م" : "$";

  const fetchReports = async () => {
    setLoading(true);
    try {
      const lawyerId = localStorage.getItem("lawyerId");
      const userRole = localStorage.getItem("userRole");

      let casesQ: any = collection(db, "cases");
      let paymentsQ: any = collection(db, "payments");
      let tasksQ: any = collection(db, "tasks");
      let clientsQ: any = collection(db, "clients");
      let expensesQ: any = collection(db, "expenses");
      let usersQ: any = collection(db, "users");

      if (userRole !== "SUPER_ADMIN") {
        const { query, where } = await import("firebase/firestore");
        casesQ = query(collection(db, "cases"), where("lawyerId", "==", lawyerId));
        paymentsQ = query(collection(db, "payments"), where("lawyerId", "==", lawyerId));
        tasksQ = query(collection(db, "tasks"), where("lawyerId", "==", lawyerId));
        clientsQ = query(collection(db, "clients"), where("lawyerId", "==", lawyerId));
        expensesQ = query(collection(db, "expenses"), where("lawyerId", "==", lawyerId));
      }

      const [casesSnap, paymentsSnap, tasksSnap, clientsSnap, expensesSnap, usersSnap] = await Promise.all([
        getDocs(casesQ),
        getDocs(paymentsQ),
        getDocs(tasksQ),
        getDocs(clientsQ),
        getDocs(expensesQ),
        getDocs(usersQ)
      ]);

      const cases = casesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      const tasks = tasksSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      const clients = clientsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      const expenses = expensesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      const users = usersSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));

      // 1. Cases by Type
      const casesByTypeObj = cases.reduce((acc: any, curr: any) => {
        const type = curr.type === "ENFORCEMENT" || curr.type === "تنفيذ" ? "تنفيذ"
                   : curr.type === "COMMERCIAL" ? "تجاري"
                   : curr.type === "LABOR" ? "عمالي"
                   : curr.type === "CRIMINAL" ? "جنائي"
                   : curr.type === "CIVIL" ? "مدني"
                   : curr.type;
        const typeName = type || "أخرى";
        acc[typeName] = (acc[typeName] || 0) + 1;
        return acc;
      }, {});
      const casesByType = Object.keys(casesByTypeObj).map(type => ({
        type,
        count: casesByTypeObj[type]
      }));

      // 2. Cases by Status
      const casesByStatus = cases.reduce((acc: any, curr: any) => {
        acc[curr.status || "OPEN"] = (acc[curr.status || "OPEN"] || 0) + 1;
        return acc;
      }, { OPEN: 0, PENDING: 0, CLOSED: 0 });

      // 3. Financial Summary
      const totalCollected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const totalContractsVal = clients.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0);
      const totalOwed = Math.max(0, totalContractsVal - totalCollected);
      const netProfit = totalCollected - totalExpenses;

      // 4. Tasks Summary
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === "COMPLETED" || t.status === "FINISHED").length;
      const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      // 5. Monthly Revenue & Expenses (last 6 months)
      const monthsList = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
      const currentMonthIndex = new Date().getMonth();
      const last6Months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(currentMonthIndex - i);
        last6Months.push({
          monthName: monthsList[d.getMonth()],
          monthNum: d.getMonth() + 1,
          year: d.getFullYear(),
          revenue: 0,
          expense: 0
        });
      }

      payments.forEach(p => {
        if (!p.date) return;
        const pDate = new Date(p.date);
        const match = last6Months.find(m => m.monthNum === pDate.getMonth() + 1 && m.year === pDate.getFullYear());
        if (match) {
          match.revenue += Number(p.amount) || 0;
        }
      });

      expenses.forEach(e => {
        if (!e.date) return;
        const eDate = new Date(e.date);
        const match = last6Months.find(m => m.monthNum === eDate.getMonth() + 1 && m.year === eDate.getFullYear());
        if (match) {
          match.expense += Number(e.amount) || 0;
        }
      });

      // 6. Expenses by Category
      const expensesByType = expenses.reduce((acc: any, curr: any) => {
        const type = curr.type === "COURT" ? "رسوم قضائية"
                   : curr.type === "TRANSPORTATION" ? "انتقالات ومواصلات"
                   : curr.type === "DOCUMENT" ? "أوراق ومستندات"
                   : "أخرى";
        acc[type] = (acc[type] || 0) + Number(curr.amount) || 0;
        return acc;
      }, {});
      const expensesByCategory = Object.keys(expensesByType).map(category => ({
        category,
        amount: expensesByType[category]
      }));

      // 7. Recent Financial Logs
      const recentActivity: any[] = [
        ...payments.map(p => ({ ...p, activityType: "INCOME" })),
        ...expenses.map(e => ({ ...e, activityType: "EXPENSE" }))
      ].sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())
       .slice(0, 5);

      // 8. Lawyers Performance (number of cases assigned)
      const lawyersPerformance = users.filter(u => u.role === "LAWYER" || u.role === "SUPER_ADMIN" || u.role === "ADMIN").map(lawyer => {
        const assignedCases = cases.filter(c => c.lawyerId === lawyer.id).length;
        const assignedTasks = tasks.filter(t => t.assignedTo === lawyer.id).length;
        const completedLawyerTasks = tasks.filter(t => t.assignedTo === lawyer.id && (t.status === "COMPLETED" || t.status === "FINISHED")).length;
        return {
          name: lawyer.name,
          casesCount: assignedCases,
          tasksCount: assignedTasks,
          taskRate: assignedTasks > 0 ? Math.round((completedLawyerTasks / assignedTasks) * 100) : 0
        };
      }).sort((a, b) => b.casesCount - a.casesCount);

      // Find client details for recent activities
      const clientsMap = clients.reduce((acc: any, curr) => {
        acc[curr.id] = curr;
        return acc;
      }, {});

      const casesMap = cases.reduce((acc: any, curr) => {
        acc[curr.id] = curr;
        return acc;
      }, {});

      const enrichedActivity = recentActivity.map(act => {
        return {
          ...act,
          clientName: clientsMap[act.clientId]?.fullName || "مصروف إداري",
          caseTitle: casesMap[act.caseId]?.title || "مصروف عام"
        };
      });

      setData({
        totalCases: cases.length,
        casesByType,
        casesByStatus,
        totalCollected,
        totalExpenses,
        totalContractsVal,
        totalOwed,
        netProfit,
        totalTasks,
        completedTasks,
        taskCompletionRate,
        last6Months,
        expensesByCategory,
        recentActivity: enrichedActivity,
        lawyersPerformance,
        totalClients: clients.length
      });
    } catch (err) {
      console.error("Reports generation error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    window.print(); // Native PDF export handler via print dialog
  };

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">التقارير والإحصائيات</h1>
          <p className="text-gray-500 mt-1 text-sm">تقارير شاملة محدثة لحظياً عن أداء المكتب والموارد المالية</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-white border-gray-200" onClick={handlePrint}>
            <Printer className="ml-2 h-4 w-4 text-[#0A192F]" /> طباعة التقرير
          </Button>
          <Button className="bg-[#D4AF37] hover:bg-[#B8962E] text-white font-bold" onClick={handleExportPDF}>
            <Download className="ml-2 h-4 w-4" /> تصدير PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-[#0A192F] border-t-transparent rounded-full animate-spin"></div>
          <span>جاري إنشاء التقارير وتحليل البيانات...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-xs border-gray-100">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold text-gray-500">إجمالي المقبوضات (الإيرادات)</CardTitle>
                <div className="p-1.5 bg-green-50 rounded-lg"><DollarSign size={16} className="text-green-600" /></div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-black text-[#0A192F]">{(data.totalCollected || 0).toLocaleString('ar-EG')} {currencySymbol}</div>
                <div className="text-[10px] text-green-600 mt-1 flex items-center gap-0.5">
                  <ArrowUpRight size={10} /> مبالغ مستلمة من العملاء
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-gray-100">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold text-gray-500">إجمالي المصروفات</CardTitle>
                <div className="p-1.5 bg-red-50 rounded-lg"><CreditCard size={16} className="text-red-600" /></div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-black text-[#0A192F]">{(data.totalExpenses || 0).toLocaleString('ar-EG')} {currencySymbol}</div>
                <div className="text-[10px] text-red-500 mt-1 flex items-center gap-0.5">
                  <ArrowDownRight size={10} /> رسوم قضائية ومصروفات إدارية
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-gray-100">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold text-gray-500">صافي الأرباح التشغيلية</CardTitle>
                <div className="p-1.5 bg-blue-50 rounded-lg"><Wallet size={16} className="text-blue-600" /></div>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-black ${data.netProfit >= 0 ? "text-blue-700" : "text-red-600"}`}>
                  {(data.netProfit || 0).toLocaleString('ar-EG')} {currencySymbol}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  الإيرادات مطروحاً منها المصروفات
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-gray-100">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold text-gray-500">المستحقات المعلقة (الديون)</CardTitle>
                <div className="p-1.5 bg-amber-50 rounded-lg"><TrendingUp size={16} className="text-[#D4AF37]" /></div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-black text-amber-700">{(data.totalOwed || 0).toLocaleString('ar-EG')} {currencySymbol}</div>
                <div className="text-[10px] text-amber-600 mt-1">
                  متبقي عقود الموكلين قيد التحصيل
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 2: Charts (Custom CSS implemented) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Finance Chart */}
            <Card className="shadow-sm border-gray-100">
              <CardHeader>
                <CardTitle className="text-base font-bold text-[#0A192F] flex items-center gap-2">
                  <BarChart3 className="text-blue-600" size={18} />
                  مقارنة الإيرادات بالمصروفات شهرياً
                </CardTitle>
                <CardDescription>تحليل التدفقات النقدية الداخلة والخارجة للمكتب خلال الـ 6 أشهر الماضية</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Visual Chart Bars Container */}
                <div className="h-64 flex items-end justify-between gap-4 border-b border-r border-gray-200 pb-4 pr-10 relative mt-4">
                  {/* Y-Axis labels */}
                  <div className="absolute top-0 right-0 h-full flex flex-col justify-between text-[10px] text-gray-400 py-1 translate-x-1">
                    <span>100k</span>
                    <span>50k</span>
                    <span>25k</span>
                    <span>10k</span>
                    <span>0</span>
                  </div>

                  {data.last6Months.map((item: any, idx: number) => {
                    const maxAmount = Math.max(...data.last6Months.map((m: any) => Math.max(m.revenue, m.expense)), 10000);
                    const revHeight = (item.revenue / maxAmount) * 100;
                    const expHeight = (item.expense / maxAmount) * 100;

                    return (
                      <div key={idx} className="flex flex-col items-center gap-2 flex-1 group relative">
                        {/* Dual Bar Representation */}
                        <div className="w-full flex justify-center items-end gap-1 h-44">
                          {/* Revenue Bar */}
                          <div 
                            className="w-3 bg-blue-600 hover:bg-blue-700 transition-all duration-300 rounded-t-xs relative flex justify-center"
                            style={{ height: `${Math.max(revHeight, 2)}%` }}
                            title={`الإيرادات: ${item.revenue}`}
                          >
                            <span className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-blue-900 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 transition">
                              {item.revenue.toLocaleString('ar-EG')}
                            </span>
                          </div>

                          {/* Expense Bar */}
                          <div 
                            className="w-3 bg-red-500 hover:bg-red-600 transition-all duration-300 rounded-t-xs relative flex justify-center"
                            style={{ height: `${Math.max(expHeight, 2)}%` }}
                            title={`المصروفات: ${item.expense}`}
                          >
                            <span className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-red-900 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 transition">
                              {item.expense.toLocaleString('ar-EG')}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-gray-600 truncate max-w-full">{item.monthName}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Chart Legend */}
                <div className="flex gap-4 justify-center pt-4 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <div className="w-3 h-3 bg-blue-600 rounded-xs"></div>
                    <span>الإيرادات (المقبوضات)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <div className="w-3 h-3 bg-red-500 rounded-xs"></div>
                    <span>المصروفات التشغيلية</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cases & Status Breakdowns */}
            <div className="grid grid-cols-1 gap-6">
              {/* Cases by Type */}
              <Card className="shadow-sm border-gray-100">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-[#0A192F] flex items-center gap-2">
                    <PieChart className="text-[#D4AF37]" size={18} />
                    توزيع القضايا والنزاعات
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row items-center justify-center gap-8 py-4">
                  {/* Custom CSS Donut representation */}
                  <div className="w-36 h-36 rounded-full border-[12px] border-blue-600 border-r-[#D4AF37] border-b-amber-500 border-l-red-500 relative flex items-center justify-center shadow-xs">
                    <div className="text-center">
                      <div className="text-2xl font-black text-[#0A192F]">{data.totalCases}</div>
                      <div className="text-[10px] text-gray-400 font-bold">إجمالي القضايا</div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2 w-full">
                    {data.casesByType.length === 0 ? (
                      <div className="text-xs text-gray-400 text-center">لا يوجد قضايا مسجلة</div>
                    ) : (
                      data.casesByType.map((item: any, idx: number) => {
                        const colors = ["bg-blue-600", "bg-[#D4AF37]", "bg-amber-500", "bg-red-500", "bg-purple-500"];
                        const percent = Math.round((item.count / data.totalCases) * 100);
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-gray-600 flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`}></div>
                                {item.type}
                              </span>
                              <span>{item.count} قضايا ({percent}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                              <div className={`h-full ${colors[idx % colors.length]}`} style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Expenses Breakdown */}
              <Card className="shadow-sm border-gray-100">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold text-[#0A192F] flex items-center gap-2">
                    <Scale className="text-red-500" size={18} />
                    تحليل تصنيفات المصروفات
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.expensesByCategory.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-4">لا توجد مصروفات مسجلة</div>
                  ) : (
                    data.expensesByCategory.map((item: any, idx: number) => {
                      const totalExpensesVal = data.totalExpenses || 1;
                      const percent = Math.round((item.amount / totalExpensesVal) * 100);
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-gray-600">{item.category}</span>
                            <span>{item.amount.toLocaleString('ar-EG')} {currencySymbol} ({percent}%)</span>
                          </div>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-red-500 h-full" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Section 3: Performance indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* General Performance */}
            <Card className="shadow-sm border-gray-100">
              <CardHeader>
                <CardTitle className="text-base font-bold text-[#0A192F] flex items-center gap-2">
                  <CheckSquare className="text-green-600" size={18} />
                  إحصائيات المهام والعمل المنجز
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between border-b pb-2 text-sm font-semibold">
                  <span className="text-gray-500">إجمالي المهام المسندة</span>
                  <span className="text-[#0A192F]">{data.totalTasks}</span>
                </div>
                <div className="flex justify-between border-b pb-2 text-sm font-semibold">
                  <span className="text-gray-500">المهام المكتملة والمغلقة</span>
                  <span className="text-green-600">{data.completedTasks}</span>
                </div>
                <div className="flex justify-between pb-2 text-sm font-semibold">
                  <span className="text-gray-500">نسبة نجاح إنجاز المهام</span>
                  <span className="text-blue-600">{data.taskCompletionRate}%</span>
                </div>
                <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                  <div className="bg-green-600 h-full" style={{ width: `${data.taskCompletionRate}%` }} />
                </div>
              </CardContent>
            </Card>

            {/* Cases status */}
            <Card className="shadow-sm border-gray-100">
              <CardHeader>
                <CardTitle className="text-base font-bold text-[#0A192F] flex items-center gap-2">
                  <FileText className="text-blue-600" size={18} />
                  حالة ملفات القضايا الحالية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between border-b pb-2 text-sm font-semibold">
                  <span className="text-gray-500">قضايا مفتوحة ونشطة</span>
                  <span className="text-blue-600 font-bold">{data.casesByStatus.OPEN}</span>
                </div>
                <div className="flex justify-between border-b pb-2 text-sm font-semibold">
                  <span className="text-gray-500">قضايا قيد الانتظار / المراجعة</span>
                  <span className="text-amber-600 font-bold">{data.casesByStatus.PENDING}</span>
                </div>
                <div className="flex justify-between pb-2 text-sm font-semibold">
                  <span className="text-gray-500">قضايا منتهية ومغلقة</span>
                  <span className="text-gray-500 font-bold">{data.casesByStatus.CLOSED}</span>
                </div>
                <div className="flex gap-1.5 h-3 rounded-full overflow-hidden w-full">
                  <div className="bg-blue-600" style={{ width: `${(data.casesByStatus.OPEN / (data.totalCases || 1)) * 100}%` }} title="نشطة" />
                  <div className="bg-amber-500" style={{ width: `${(data.casesByStatus.PENDING / (data.totalCases || 1)) * 100}%` }} title="انتظار" />
                  <div className="bg-gray-400" style={{ width: `${(data.casesByStatus.CLOSED / (data.totalCases || 1)) * 100}%` }} title="مغلقة" />
                </div>
              </CardContent>
            </Card>

            {/* Client Reviews / Placeholder stats */}
            <Card className="shadow-sm border-gray-100">
              <CardHeader>
                <CardTitle className="text-base font-bold text-[#0A192F] flex items-center gap-2">
                  <Users className="text-purple-600" size={18} />
                  كفاءة وجودة التمثيل القضائي
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between border-b pb-2 text-sm font-semibold">
                  <span className="text-gray-500">نسبة كسب القضايا بالمكتب</span>
                  <span className="text-green-600 font-bold">٨٥٪</span>
                </div>
                <div className="flex justify-between border-b pb-2 text-sm font-semibold">
                  <span className="text-gray-500">معدل رضا الموكلين وتقييمهم</span>
                  <span className="text-purple-600 font-bold">٤.٨ / ٥</span>
                </div>
                <div className="flex justify-between pb-2 text-sm font-semibold">
                  <span className="text-gray-500">إجمالي الموكلين النشطين</span>
                  <span className="text-blue-600 font-bold">{data.totalClients} عملاء</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 4: Lawyers Performance Table */}
          <Card className="shadow-sm border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold text-[#0A192F]">
                كشف أداء المحامين والمستشارين بالمكتب
              </CardTitle>
              <CardDescription>متابعة وتوزيع القضايا والمهام على مستوى الكادر القانوني</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-right font-bold text-[#0A192F]">المحامي</TableHead>
                    <TableHead className="text-center font-bold text-[#0A192F] w-36">عدد القضايا النشطة</TableHead>
                    <TableHead className="text-center font-bold text-[#0A192F] w-36">المهام المسندة</TableHead>
                    <TableHead className="text-center font-bold text-[#0A192F] w-48">نسبة إنجاز المهام المسندة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lawyersPerformance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-gray-400">
                        لا يوجد محامون مسجلون
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.lawyersPerformance.map((lawyer: any, idx: number) => (
                      <TableRow key={idx} className="hover:bg-gray-50/50">
                        <TableCell className="font-bold text-[#0A192F]">{lawyer.name}</TableCell>
                        <TableCell className="text-center font-semibold text-blue-600">{lawyer.casesCount} قضايا</TableCell>
                        <TableCell className="text-center text-gray-600 font-semibold">{lawyer.tasksCount} مهام</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <span className="font-bold text-xs text-green-600">{lawyer.taskRate}%</span>
                            <div className="w-24 bg-gray-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                              <div className="bg-green-500 h-full" style={{ width: `${lawyer.taskRate}%` }} />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Section 5: Recent Financial Activity */}
          <Card className="shadow-sm border-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold text-[#0A192F]">
                أحدث القيود النقدية والحركات المالية
              </CardTitle>
              <CardDescription>متابعة تفصيلية لآخر ٥ عمليات استلام إيراد أو صرف مالي بالمكتب</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-right font-bold text-[#0A192F]">التاريخ</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">المستفيد / العميل / القضية</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">الحركة المالية</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F] w-40">المبلغ</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F] hidden sm:table-cell">البيان / ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentActivity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-gray-400">
                        لا توجد حركات مالية مسجلة حديثاً
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.recentActivity.map((act: any, idx: number) => (
                      <TableRow key={idx} className="hover:bg-gray-50/50">
                        <TableCell dir="ltr" className="text-right text-xs text-gray-500">
                          {act.date ? new Date(act.date).toLocaleDateString('ar-EG') : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-[#0A192F]">{act.clientName}</div>
                          <div className="text-[10px] text-gray-400 font-bold">{act.caseTitle}</div>
                        </TableCell>
                        <TableCell>
                          {act.activityType === "INCOME" ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-200 gap-1 font-bold text-[10px]">
                              قبض دفعة أتعاب
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-200 gap-1 font-bold text-[10px]">
                              مصروف تشغيلي
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={`font-black text-sm ${act.activityType === "INCOME" ? "text-green-600" : "text-red-500"}`}>
                          {act.activityType === "INCOME" ? "+" : "-"} {act.amount.toLocaleString('ar-EG')} {currencySymbol}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-gray-500">{act.notes || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
