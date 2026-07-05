import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2 } from "lucide-react";

export function AddPaymentModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; }) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    clientId: "",
    caseId: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        try {
          const { collection, getDocs, query, where } = await import("firebase/firestore");
          const { db } = await import("../lib/firebase");
          const lawyerId = localStorage.getItem("lawyerId");
          const userRole = localStorage.getItem("userRole");

          let clientsQ: any = collection(db, "clients");
          let casesQ: any = collection(db, "cases");

          if (userRole !== "SUPER_ADMIN") {
            clientsQ = query(collection(db, "clients"), where("lawyerId", "==", lawyerId));
            casesQ = query(collection(db, "cases"), where("lawyerId", "==", lawyerId));
          }

          const clientsSnap = await getDocs(clientsQ);
          const casesSnap = await getDocs(casesQ);
          setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setCases(casesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          console.error(error);
        }
      };
      fetchData();
    }
  }, [isOpen]);

  const filteredCases = cases.filter(c => !formData.clientId || c.clientId === formData.clientId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { collection, addDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId");
      
      await addDoc(collection(db, "payments"), {
        ...formData,
        amount: parseFloat(formData.amount),
        lawyerId, // Attached for SaaS multi-tenancy
        createdAt: new Date().toISOString()
      });

      onSuccess();
      onClose();
      setFormData({ clientId: "", caseId: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
    } catch (error: any) {
      console.error(error);
      alert("حدث خطأ أثناء حفظ الدفعة: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0A192F]">تسجيل دفعة جديدة</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-[#0A192F]">الموكل *</label>
              <select
                required
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.clientId}
                onChange={e => setFormData({ ...formData, clientId: e.target.value, caseId: "" })}
              >
                <option value="">اختر الموكل...</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.fullName}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-[#0A192F]">القضية</label>
              <select
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.caseId}
                onChange={e => setFormData({ ...formData, caseId: e.target.value })}
              >
                <option value="">بدون قضية محددة</option>
                {filteredCases.map(caseItem => (
                  <option key={caseItem.id} value={caseItem.id}>{caseItem.title}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">المبلغ *</label>
              <Input
                required
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                placeholder="مثال: 1500"
                dir="ltr"
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">التاريخ</label>
              <Input
                required
                type="date"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-[#0A192F]">ملاحظات</label>
              <Input
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="ملاحظة أو وصف الدفعة"
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={loading} className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              تسجيل الدفعة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
