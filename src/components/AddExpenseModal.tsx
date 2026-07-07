import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2 } from "lucide-react";

export function AddExpenseModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; }) {
  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    caseId: "",
    amount: "",
    type: "COURT",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  useEffect(() => {
    if (isOpen) {
      const fetchCases = async () => {
        try {
          const { collection, getDocs, query, where } = await import("firebase/firestore");
          const { db } = await import("../lib/firebase");
          const lawyerId = localStorage.getItem("lawyerId");
          const userRole = localStorage.getItem("userRole");

          let casesQ: any = collection(db, "cases");
          if (userRole !== "SUPER_ADMIN") {
            casesQ = query(collection(db, "cases"), where("lawyerId", "==", lawyerId));
          }

          const casesSnap = await getDocs(casesQ);
          setCases(casesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })));
        } catch (error) {
          console.error(error);
        }
      };
      fetchCases();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { collection, addDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId");
      
      await addDoc(collection(db, "expenses"), {
        ...formData,
        amount: parseFloat(formData.amount),
        lawyerId, // Attached for SaaS multi-tenancy
        createdAt: new Date().toISOString()
      });

      onSuccess();
      onClose();
      setFormData({ caseId: "", amount: "", type: "COURT", date: new Date().toISOString().split("T")[0], notes: "" });
    } catch (error: any) {
      console.error(error);
      alert("حدث خطأ أثناء تسجيل المصروف: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0A192F]">تسجيل مصروف جديد</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">القضية المرتبطة *</label>
              <select
                required
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.caseId}
                onChange={e => setFormData({ ...formData, caseId: e.target.value })}
              >
                <option value="">اختر القضية...</option>
                {cases.map(c => (
                  <option key={c.id} value={c.id}>{c.title} ({c.caseNumber})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#0A192F]">نوع المصروف *</label>
                <select
                  required
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="COURT">رسوم قضائية</option>
                  <option value="TRANSPORTATION">انتقالات ومواصلات</option>
                  <option value="DOCUMENT">أوراق ومستندات</option>
                  <option value="OTHER">أخرى</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-[#0A192F]">المبلغ *</label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  placeholder="المبلغ بالعملة النشطة"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">التاريخ *</label>
              <Input
                type="date"
                required
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">ملاحظات / البيان</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="تفاصيل إضافية للمصروف..."
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="mt-6 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              إلغاء
            </Button>
            <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : "تسجيل المصروف"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
