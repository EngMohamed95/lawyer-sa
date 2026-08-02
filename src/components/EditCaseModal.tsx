import { FormEvent, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2 } from "lucide-react";
import { AddClientModal } from "./AddClientModal";

const caseTypeOptions = [
  { value: "CIVIL", label: "مدني" },
  { value: "CRIMINAL", label: "جنائي" },
  { value: "COMMERCIAL", label: "تجاري" },
  { value: "LABOR", label: "عمالي" },
  { value: "FAMILY", label: "أسرة" },
  { value: "ADMINISTRATIVE", label: "إداري" },
  { value: "ENFORCEMENT", label: "تنفيذ" },
  { value: "OTHER", label: "أخرى" },
];

export function EditCaseModal({
  isOpen,
  onClose,
  onSuccess,
  caseData,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  caseData: any | null;
}) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [clientRole, setClientRole] = useState("PLAINTIFF");
  const [officeLawyers, setOfficeLawyers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    caseNumber: "",
    type: "CIVIL",
    clientId: "",
    opponentName: "",
    opponentLawyer: "",
    courtName: "",
    courtCircle: "",
    plaintiffName: "",
    defendantName: "",
    caseSubject: "",
    startDate: new Date().toISOString().split("T")[0],
    assignedLawyerId: "",
    assignedLawyerName: "",
  });

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

  const fetchOfficeLawyers = async () => {
    try {
      const { collection, getDocs, query, where } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId");
      
      const managerId = localStorage.getItem("lawyerId") || "";
      const managerName = localStorage.getItem("userName") || "المدير";

      const q = query(
        collection(db, "users"),
        where("lawyerId", "==", lawyerId),
        where("role", "==", "OFFICE_LAWYER")
      );
      const snap = await getDocs(q);
      const associates = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      
      setOfficeLawyers([{ id: managerId, name: managerName }, ...associates]);
    } catch (e) {
      console.error("Error fetching office lawyers for assignment:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchClients();
      fetchOfficeLawyers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (caseData) {
      const role = caseData.clientRole || (caseData.plaintiffName === caseData.client?.fullName ? "PLAINTIFF" : "DEFENDANT");
      setClientRole(role);
      setFormData({
        title: caseData.title || "",
        caseNumber: caseData.caseNumber || "",
        type: caseData.type || "CIVIL",
        clientId: caseData.clientId || "",
        opponentName: caseData.opponentName || "",
        opponentLawyer: caseData.opponentLawyer || "",
        courtName: caseData.courtName || "",
        courtCircle: caseData.courtCircle || "",
        plaintiffName: caseData.plaintiffName || "",
        defendantName: caseData.defendantName || "",
        caseSubject: caseData.caseSubject || "",
        startDate: caseData.startDate ? new Date(caseData.startDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        assignedLawyerId: caseData.assignedLawyerId || "",
        assignedLawyerName: caseData.assignedLawyerName || "",
      });
    }
  }, [caseData]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!caseData) return;
    setLoading(true);

    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");

      const selectedClient = clients.find(c => c.id === formData.clientId);
      const clientName = selectedClient ? selectedClient.fullName : "";

      const finalPlaintiffName = clientRole === "PLAINTIFF" ? clientName : formData.opponentName;
      const finalDefendantName = clientRole === "PLAINTIFF" ? formData.opponentName : clientName;
      
      await updateDoc(doc(db, "cases", caseData.id), {
        ...formData,
        plaintiffName: finalPlaintiffName,
        defendantName: finalDefendantName,
        clientRole,
        updatedAt: new Date().toISOString()
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء التحديث");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#133B2E]">تعديل بيانات القضية</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">عنوان القضية *</label>
              <Input
                required
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="مثال: دعوى تعويض ضد شركة س"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">رقم القضية *</label>
              <Input
                required
                value={formData.caseNumber}
                onChange={e => setFormData({ ...formData, caseNumber: e.target.value })}
                placeholder="مثال: ١٢٣٤/٢٠٢٣"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-[#133B2E]">الموكل *</label>
                <button
                  type="button"
                  onClick={() => setIsAddClientOpen(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                >
                  + إضافة موكل جديد
                </button>
              </div>
              <select
                required
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.clientId}
                onChange={e => setFormData({ ...formData, clientId: e.target.value })}
              >
                <option value="">اختر الموكل...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">نوع القضية</label>
              <select
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value })}
              >
                {caseTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 border-t pt-2 md:col-span-2 text-xs font-bold text-gray-500">أطراف الدعوى والنزاع</div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-[#133B2E]">صفة الموكل في القضية</label>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setClientRole("PLAINTIFF")}
                  className={`flex-1 py-2 text-center text-sm font-bold rounded-lg transition-all ${
                    clientRole === "PLAINTIFF"
                      ? "bg-[#133B2E] text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  مدعي (طالب الحق)
                </button>
                <button
                  type="button"
                  onClick={() => setClientRole("DEFENDANT")}
                  className={`flex-1 py-2 text-center text-sm font-bold rounded-lg transition-all ${
                    clientRole === "DEFENDANT"
                      ? "bg-[#133B2E] text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  مدعى عليه (المطلوب منه)
                </button>
              </div>
              <p className="text-xs font-medium mt-1">
                {clientRole === "PLAINTIFF" ? (
                  <span className="text-blue-700">← سيكون الموكل هو الطرف المدعي، والخصم هو الطرف المدعى عليه.</span>
                ) : (
                  <span className="text-rose-700">← سيكون الموكل هو الطرف المدعى عليه، والخصم هو الطرف المدعي.</span>
                )}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">
                {clientRole === "PLAINTIFF" ? "اسم المدعى عليه (الخصم)" : "اسم المدعي (الخصم)"}
              </label>
              <Input
                value={formData.opponentName}
                onChange={e => setFormData({ ...formData, opponentName: e.target.value })}
                placeholder={clientRole === "PLAINTIFF" ? "اسم المدعى عليه" : "اسم المدعي"}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">
                {clientRole === "PLAINTIFF" ? "محامي المدعى عليه" : "محامي المدعي"}
              </label>
              <Input
                value={formData.opponentLawyer}
                onChange={e => setFormData({ ...formData, opponentLawyer: e.target.value })}
                placeholder="محامي الخصم إن وجد"
              />
            </div>

            <div className="space-y-2 border-t pt-2 md:col-span-2 text-xs font-bold text-gray-500">المحكمة وموضوع الدعوى</div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">المحكمة المرفوع أمامها</label>
              <Input
                value={formData.courtName}
                onChange={e => setFormData({ ...formData, courtName: e.target.value })}
                placeholder="مثال: المحكمة العامة بالرياض"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">الدائرة القضائية</label>
              <Input 
                value={formData.courtCircle}
                onChange={e => setFormData({...formData, courtCircle: e.target.value})}
                placeholder="مثال: الدائرة الحقوقية الثالثة" 
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-[#133B2E]">موضوع الدعوى / القضية</label>
              <Input 
                value={formData.caseSubject}
                onChange={e => setFormData({...formData, caseSubject: e.target.value})}
                placeholder="تفاصيل مختصرة لموضوع الدعوى..." 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">تاريخ البداية</label>
              <Input
                type="date"
                required
                value={formData.startDate}
                onChange={e => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>

            {(localStorage.getItem("userRole") === "LAWYER" || localStorage.getItem("userRole") === "SUPER_ADMIN") && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#133B2E] block mr-1">المحامي المسؤول</label>
                <select
                  value={formData.assignedLawyerId}
                  onChange={e => {
                    const selected = officeLawyers.find(l => l.id === e.target.value);
                    setFormData({
                      ...formData,
                      assignedLawyerId: e.target.value,
                      assignedLawyerName: selected ? selected.name : ""
                    });
                  }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#133B2E]/10 focus:border-[#133B2E] transition-all text-sm h-10"
                >
                  <option value="">غير محدد</option>
                  {officeLawyers.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </form>

        <AddClientModal 
          isOpen={isAddClientOpen} 
          onClose={() => setIsAddClientOpen(false)} 
          onSuccess={() => {
            fetchClients();
            setIsAddClientOpen(false);
          }} 
        />
      </DialogContent>
    </Dialog>
  );
}
