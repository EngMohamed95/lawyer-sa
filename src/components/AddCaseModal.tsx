import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2 } from "lucide-react";

export function AddCaseModal({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    caseNumber: "",
    type: "مدني",
    clientId: "",
    opponentName: "",
    opponentLawyer: "",
    courtName: "",
    startDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (isOpen) {
      const fetchClients = async () => {
        try {
          const { collection, getDocs, query, orderBy } = await import("firebase/firestore");
          const { db } = await import("../lib/firebase");
          const lawyerId = localStorage.getItem("lawyerId");
          const userRole = localStorage.getItem("userRole");

          // Fetch all and filter in memory to avoid missing index errors
          const q = query(collection(db, "clients"), orderBy("fullName", "asc"));
          const snap = await getDocs(q);
          
          const allClients = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          const filtered = allClients.filter((c: any) => 
            userRole === "SUPER_ADMIN" || c.lawyerId === lawyerId
          );
          
          setClients(filtered);
        } catch (error) {
          console.error(error);
        }
      };
      fetchClients();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { collection, addDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId");
      const data = {
        ...formData,
        lawyerId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await addDoc(collection(db, "cases"), data);
      onSuccess();
      onClose();
      setFormData({
        title: "",
        caseNumber: "",
        type: "مدني",
        clientId: "",
        opponentName: "",
        opponentLawyer: "",
        courtName: "",
        startDate: new Date().toISOString().split('T')[0],
      });
    } catch (error: any) {
      console.error(error);
      alert("حدث خطأ أثناء حفظ القضية: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0A192F]">إضافة قضية جديدة</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">عنوان القضية *</label>
              <Input 
                required
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
                placeholder="مثال: دعوى تعويض ضد شركة س" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">رقم القضية *</label>
              <Input 
                required
                value={formData.caseNumber}
                onChange={e => setFormData({...formData, caseNumber: e.target.value})}
                placeholder="مثال: ١٢٣٤/٢٠٢٣" 
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">الموكل *</label>
              <select 
                required
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.clientId}
                onChange={e => setFormData({...formData, clientId: e.target.value})}
              >
                <option value="">اختر الموكل...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.fullName}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">نوع القضية</label>
              <select 
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value})}
              >
                <option value="مدني">مدني</option>
                <option value="جنائي">جنائي</option>
                <option value="تجاري">تجاري</option>
                <option value="عمالي">عمالي</option>
                <option value="أسرة">أسرة</option>
                <option value="إداري">إداري</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">اسم الخصم</label>
              <Input 
                value={formData.opponentName}
                onChange={e => setFormData({...formData, opponentName: e.target.value})}
                placeholder="اسم الخصم" 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">محامي الخصم</label>
              <Input 
                value={formData.opponentLawyer}
                onChange={e => setFormData({...formData, opponentLawyer: e.target.value})}
                placeholder="محامي الخصم إن وجد" 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">المحكمة المرفوع أمامها</label>
              <Input 
                value={formData.courtName}
                onChange={e => setFormData({...formData, courtName: e.target.value})}
                placeholder="مثال: محكمة القاهرة الابتدائية" 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">تاريخ البداية</label>
              <Input 
                type="date"
                required
                value={formData.startDate}
                onChange={e => setFormData({...formData, startDate: e.target.value})}
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={loading} className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              حفظ القضية
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
