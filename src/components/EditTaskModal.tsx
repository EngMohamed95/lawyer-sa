import { FormEvent, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Loader2 } from "lucide-react";

const priorityOptions = [
  { value: "LOW", label: "منخفضة" },
  { value: "MEDIUM", label: "متوسطة" },
  { value: "HIGH", label: "عالية" },
  { value: "URGENT", label: "عاجلة" },
];

const statusOptions = [
  { value: "NEW", label: "جديدة" },
  { value: "IN_PROGRESS", label: "قيد التنفيذ" },
  { value: "OVERDUE", label: "متأخرة" },
  { value: "COMPLETED", label: "مكتملة" },
];

export function EditTaskModal({
  isOpen,
  onClose,
  taskData,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  taskData: any;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assignedTo: "",
    dueDate: "",
    priority: "MEDIUM",
    status: "NEW",
  });
  const [users, setUsers] = useState<any[]>([]);
  const lawyerId = localStorage.getItem("lawyerId");

  useEffect(() => {
    if (!taskData) return;
    setFormData({
      title: taskData.title || "",
      description: taskData.description || "",
      assignedTo: taskData.assignedTo || "",
      dueDate: taskData.dueDate ? new Date(taskData.dueDate).toISOString().slice(0, 10) : "",
      priority: taskData.priority || "MEDIUM",
      status: taskData.status || "NEW",
    });

    const fetchUsers = async () => {
      try {
        const { collection, getDocs, query, where } = await import("firebase/firestore");
        const { db } = await import("../lib/firebase");
        
        let q;
        if (lawyerId && lawyerId !== "ALL") {
          q = query(collection(db, "users"), where("lawyerId", "==", lawyerId));
        } else {
          q = collection(db, "users");
        }
        
        const snap = await getDocs(q);
        setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error(error);
      }
    };
    fetchUsers();
  }, [taskData, lawyerId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!taskData?.id) return;
    setLoading(true);
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const taskRef = doc(db, "tasks", taskData.id);
      const assignee = users.find(u => u.id === formData.assignedTo);
      
      await updateDoc(taskRef, {
        ...formData,
        assigneeName: assignee?.name || taskData.assigneeName || "غير محدد",
        updatedAt: new Date().toISOString()
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      alert("حدث خطأ أثناء التعديل: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0A192F]">تعديل المهمة</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">عنوان المهمة *</label>
              <Input
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="اكتب عنوان المهمة"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">تفاصيل المهمة</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="اكتب وصفًا موجزًا للمهمة"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#0A192F]">مسؤول التنفيذ</label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">اختر المسؤول</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-[#0A192F]">تاريخ الاستحقاق</label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#0A192F]">الأولوية</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#0A192F]">الحالة</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading} className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white">
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
