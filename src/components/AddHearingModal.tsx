import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2 } from "lucide-react";

export function AddHearingModal({ isOpen, onClose, onSuccess, caseId }: { isOpen: boolean, onClose: () => void, onSuccess: () => void, caseId?: string }) {
  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    hearingDate: new Date().toISOString().split('T')[0],
    court: "",
    circuit: "",
    requiredActions: "",
    result: "",
    nextHearingDate: "",
    selectedCaseId: caseId || "",
  });

  useEffect(() => {
    if (isOpen && !caseId) {
      const fetchCases = async () => {
        try {
          const { collection, getDocs, query, where, limit } = await import("firebase/firestore");
          const { db } = await import("../lib/firebase");
          const lawyerId = localStorage.getItem("lawyerId");
          const userRole = localStorage.getItem("userRole");
          const snap = await getDocs(
            userRole !== "SUPER_ADMIN"
              ? query(collection(db, "cases"), where("lawyerId", "==", lawyerId), limit(100))
              : query(collection(db, "cases"), limit(100))
          );
          setCases(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          console.error(error);
        }
      };
      fetchCases();
    }
    if (isOpen) {
      setFormData(prev => ({ 
        ...prev, 
        selectedCaseId: caseId || "",
        hearingDate: new Date().toISOString().split('T')[0]
      }));
    }
  }, [isOpen, caseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.selectedCaseId) return;
    setLoading(true);
    try {
      const { collection, addDoc, doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId");

      // Fetch case details to denormalize title and number
      const caseDoc = await getDoc(doc(db, "cases", formData.selectedCaseId));
      const caseData = caseDoc.exists() ? caseDoc.data() : {};
      
      const payload = {
        hearingDate: formData.hearingDate,
        court: formData.court,
        circuit: formData.circuit,
        requiredActions: formData.requiredActions,
        result: formData.result,
        nextHearingDate: formData.nextHearingDate || null,
        caseTitle: caseData.title || "بدون عنوان",
        caseNumber: caseData.caseNumber || "---",
        lawyerId,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(doc(db, "cases", formData.selectedCaseId), "hearings"), payload);
      
      onSuccess();
      onClose();
      setFormData({ 
        hearingDate: new Date().toISOString().split('T')[0], 
        court: "", 
        circuit: "", 
        requiredActions: "", 
        result: "",
        nextHearingDate: "",
        selectedCaseId: caseId || "" 
      });
    } catch (error: any) {
      console.error(error);
      alert("فشل حفظ الجلسة: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0A192F]">إضافة جلسة جديدة</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {!caseId && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">القضية *</label>
              <select 
                required
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.selectedCaseId}
                onChange={e => setFormData({...formData, selectedCaseId: e.target.value})}
              >
                <option value="">اختر القضية...</option>
                {cases.map(c => (
                  <option key={c.id} value={c.id}>{c.caseNumber} - {c.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">تاريخ الجلسة *</label>
              <Input 
                type="date"
                required
                value={formData.hearingDate}
                onChange={e => setFormData({...formData, hearingDate: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">تاريخ الجلسة القادمة</label>
              <Input 
                type="date"
                value={formData.nextHearingDate}
                onChange={e => setFormData({...formData, nextHearingDate: e.target.value})}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">المحكمة / الغرفة</label>
              <Input 
                value={formData.court}
                onChange={e => setFormData({...formData, court: e.target.value})}
                placeholder="مثال: الغرفة التجارية..." 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">الدائرة / الرول</label>
              <Input 
                value={formData.circuit}
                onChange={e => setFormData({...formData, circuit: e.target.value})}
                placeholder="مثال: دائرة ٥، رول ٢٥..." 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#0A192F]">الطلبات / ما تم فيها</label>
            <Input 
               value={formData.requiredActions}
               onChange={e => setFormData({...formData, requiredActions: e.target.value})}
               placeholder="المطلوب في الجلسة أو ما قدمته..." 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#0A192F]">قرار الجلسة (النتيجة)</label>
            <Input 
               value={formData.result}
               onChange={e => setFormData({...formData, result: e.target.value})}
               placeholder="مثال: تأجيل للجلسة القادمة للاطلاع..." 
               className="border-red-200 focus:ring-red-200"
            />
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={loading} className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              حفظ الجلسة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
