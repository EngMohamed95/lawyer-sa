import { useEffect, useMemo, useState } from "react";
import { Plus, Search, CheckCircle, Edit3, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { AddTaskModal } from "../components/AddTaskModal";
import { EditTaskModal } from "../components/EditTaskModal";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const getPriorityBadge = (p: string) => {
  switch (p) {
    case 'LOW': return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200">منخفضة</Badge>;
    case 'MEDIUM': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">متوسطة</Badge>;
    case 'HIGH': return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">عالية</Badge>;
    case 'URGENT': return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">عاجلة</Badge>;
    default: return <Badge>{p}</Badge>;
  }
};

const getStatusBadge = (s: string) => {
  switch (s) {
    case 'NEW': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">جديدة</Badge>;
    case 'IN_PROGRESS': return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">قيد التنفيذ</Badge>;
    case 'COMPLETED': return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">مكتملة</Badge>;
    case 'OVERDUE': return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">متأخرة</Badge>;
    default: return <Badge>{s}</Badge>;
  }
};

export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<any>(null);

  const userRole = localStorage.getItem("userRole");
  const lawyerId = localStorage.getItem("lawyerId");
  const userId = localStorage.getItem("userId");

  const fetchTasks = async () => {
    setLoading(true);
    try {
      let q: any = collection(db, "tasks");
      
      // SaaS Filtering: Only show tasks belonging to this specific lawyer
      if (userRole !== "SUPER_ADMIN") {
        q = query(collection(db, "tasks"), where("lawyerId", "==", lawyerId));
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter for trainees (they only see tasks assigned to them)
      if (userRole === "TRAINEE") {
        setTasks(data.filter((t: any) => t.assignedTo === userId)); 
      } else {
        setTasks(data);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [lawyerId, userRole]);

  const filteredTasks = useMemo(
    () => (Array.isArray(tasks) ? tasks : []).filter((t) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return [t.title, t.description, t.assignedTo, t.assignee?.name]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(query));
    }),
    [tasks, search]
  );

  const markCompleted = async (taskId: string) => {
    try {
        await updateDoc(doc(db, "tasks", taskId), { status: "COMPLETED" });
        fetchTasks();
    } catch (e) {
        console.error(e);
    }
  };

  const removeTask = async (taskId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه المهمة؟")) return;
    try {
        await deleteDoc(doc(db, "tasks", taskId));
        fetchTasks();
    } catch (e) {
        console.error(e);
    }
  };

  const openEdit = (task: any) => {
    setActiveTask(task);
    setIsEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <AddTaskModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={fetchTasks} />
      {activeTask && (
          <EditTaskModal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} taskData={activeTask} onSuccess={fetchTasks} />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">المهام</h1>
          <p className="text-gray-500 mt-1 print:hidden">إدارة المهام الموكلة للمحامين والمتدربين</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()} className="border-blue-600 text-blue-600 hover:bg-blue-50">
            <CheckCircle className="ml-2 h-4 w-4" /> تحميل تقرير المهام
          </Button>
          <Button onClick={() => setIsAddOpen(true)} className="bg-[#D4AF37] hover:bg-[#B8962E] text-white">
            <Plus className="ml-2 h-4 w-4" /> إضافة مهمة
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 pb-4">
          <div className="flex items-center space-x-2 space-x-reverse relative w-full sm:w-96 print-hidden">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو المهمة..."
              className="pl-4 pr-10 bg-white"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="text-right font-bold text-[#0A192F]">العنوان</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden sm:table-cell">تفاصيل المهمة</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden md:table-cell">تاريخ الاستحقاق</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F]">الأولوية</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F]">الحالة</TableHead>
                {userRole === "SUPER_ADMIN" && <TableHead className="text-right font-bold text-purple-600 hidden lg:table-cell">المحامي</TableHead>}
                <TableHead className="text-center font-bold text-[#0A192F] print-hidden">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={userRole === "SUPER_ADMIN" ? 7 : 6} className="text-center py-10 text-gray-500">جاري التحميل...</TableCell>
                </TableRow>
              ) : filteredTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={userRole === "SUPER_ADMIN" ? 7 : 6} className="text-center py-10 text-gray-500">لا توجد مهام تطابق البحث</TableCell>
                </TableRow>
              ) : (
                filteredTasks.map((t) => {
                  const dueDate = t.dueDate ? new Date(t.dueDate) : null;
                  return (
                    <TableRow key={t.id} className="hover:bg-gray-50/50">
                      <TableCell className="font-medium text-[#0A192F]">{t.title}</TableCell>
                      <TableCell className="hidden sm:table-cell text-gray-600 text-sm max-w-[300px] truncate">{t.description || "بدون تفاصيل"}</TableCell>
                      <TableCell dir="ltr" className="text-right hidden md:table-cell">
                        {dueDate ? dueDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : "-"}
                      </TableCell>
                      <TableCell>{getPriorityBadge(t.priority)}</TableCell>
                      <TableCell>{getStatusBadge(t.status)}</TableCell>
                      {userRole === "SUPER_ADMIN" && <TableCell className="text-xs text-purple-600 hidden lg:table-cell">{t.lawyerId || "غير محدد"}</TableCell>}
                      <TableCell className="text-center space-x-1 space-x-reverse print-hidden">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-600 hover:text-green-800 hover:bg-green-50"
                          title="إكمال المهمة"
                          onClick={() => markCompleted(t.id)}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          title="تعديل المهمة"
                          onClick={() => openEdit(t)}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-800 hover:bg-red-50"
                          title="حذف المهمة"
                          onClick={() => removeTask(t.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
