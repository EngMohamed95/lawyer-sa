import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2 } from "lucide-react";

export function AddHearingModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  caseId,
  initialCaseData 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess: () => void; 
  caseId?: string;
  initialCaseData?: any;
}) {
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
    minutesText: "",
    judgmentText: "",
    plaintiffName: "",
    defendantName: "",
  });
  const [minutesFile, setMinutesFile] = useState<File | null>(null);
  const [judgmentFile, setJudgmentFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const getPlaintiffDefault = (cData: any) => {
    if (!cData) return "";
    if (cData.plaintiffName) return cData.plaintiffName;
    if (cData.clientRole === "DEFENDANT") return cData.opponentName || "";
    return cData.client?.fullName || cData.plaintiffName || "";
  };

  const getDefendantDefault = (cData: any) => {
    if (!cData) return "";
    if (cData.defendantName) return cData.defendantName;
    if (cData.clientRole === "DEFENDANT") return cData.client?.fullName || "";
    return cData.opponentName || cData.defendantName || "";
  };

  const fetchSelectedCaseDetails = async (targetCaseId: string) => {
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const caseDoc = await getDoc(doc(db, "cases", targetCaseId));
      if (caseDoc.exists()) {
        const caseData = caseDoc.data();
        let clientData = null;
        if (caseData.clientId) {
          const clientDoc = await getDoc(doc(db, "clients", caseData.clientId));
          if (clientDoc.exists()) {
            clientData = clientDoc.data();
          }
        }
        const resolvedCaseData = { ...caseData, client: clientData };
        setFormData(prev => ({
          ...prev,
          selectedCaseId: targetCaseId,
          court: caseData.courtName || caseData.court || "",
          circuit: caseData.courtCircle || caseData.circuit || "",
          plaintiffName: getPlaintiffDefault(resolvedCaseData),
          defendantName: getDefendantDefault(resolvedCaseData),
        }));
      }
    } catch (err) {
      console.error("Error pre-populating case details:", err);
    }
  };

  useEffect(() => {
    console.log("DEBUG: AddHearingModal useEffect", { isOpen, caseId, initialCaseData });
    const loadData = async () => {
      const activeCaseId = caseId || formData.selectedCaseId;
      if (isOpen && !caseId) {
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
      }
      
      if (isOpen) {
        if (initialCaseData) {
          setFormData(prev => ({
            ...prev,
            selectedCaseId: activeCaseId,
            court: initialCaseData.courtName || initialCaseData.court || "",
            circuit: initialCaseData.courtCircle || initialCaseData.circuit || "",
            plaintiffName: getPlaintiffDefault(initialCaseData),
            defendantName: getDefendantDefault(initialCaseData),
          }));
        } else if (activeCaseId) {
          fetchSelectedCaseDetails(activeCaseId);
        }
      }
    };

    if (isOpen) {
      setFormData({
        hearingDate: new Date().toISOString().split('T')[0],
        court: initialCaseData?.courtName || initialCaseData?.court || "",
        circuit: initialCaseData?.courtCircle || initialCaseData?.circuit || "",
        requiredActions: "",
        result: "",
        nextHearingDate: "",
        selectedCaseId: caseId || "",
        minutesText: "",
        judgmentText: "",
        plaintiffName: getPlaintiffDefault(initialCaseData),
        defendantName: getDefendantDefault(initialCaseData),
      });
      setMinutesFile(null);
      setJudgmentFile(null);
      setUploadStatus(null);
      loadData();
    }
  }, [isOpen, caseId, initialCaseData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.selectedCaseId) return;
    setLoading(true);
    setUploadStatus("جاري تهيئة البيانات...");
    try {
      const { collection, addDoc, doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId");

      // Fetch case details to denormalize title and number
      const caseDoc = await getDoc(doc(db, "cases", formData.selectedCaseId));
      const caseData = caseDoc.exists() ? caseDoc.data() : {};
      
      let minutesFileUrl = "";
      let minutesFileName = "";
      if (minutesFile) {
        setUploadStatus("جاري رفع ملف محضر الضبط...");
        const fd = new FormData();
        fd.append("file", minutesFile);
        const res = await fetch("/upload.php", { method: "POST", body: fd });
        if (!res.ok) throw new Error("فشل رفع ملف محضر الضبط");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        minutesFileUrl = json.fileUrl;
        minutesFileName = minutesFile.name;
      }

      let judgmentFileUrl = "";
      let judgmentFileName = "";
      if (judgmentFile) {
        setUploadStatus("جاري رفع ملف حكم الجلسة...");
        const fd = new FormData();
        fd.append("file", judgmentFile);
        const res = await fetch("/upload.php", { method: "POST", body: fd });
        if (!res.ok) throw new Error("فشل رفع ملف صك الحكم");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        judgmentFileUrl = json.fileUrl;
        judgmentFileName = judgmentFile.name;
      }

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
        minutesText: formData.minutesText,
        minutesFileUrl,
        minutesFileName,
        judgmentText: formData.judgmentText,
        judgmentFileUrl,
        judgmentFileName,
        plaintiffName: formData.plaintiffName,
        defendantName: formData.defendantName,
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
        selectedCaseId: caseId || "",
        minutesText: "",
        judgmentText: "",
        plaintiffName: "",
        defendantName: "",
      });
      setMinutesFile(null);
      setJudgmentFile(null);
      setUploadStatus(null);
    } catch (error: any) {
      console.error(error);
      alert("فشل حفظ الجلسة: " + error.message);
    } finally {
      setLoading(false);
      setUploadStatus(null);
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
                onChange={e => {
                  const newCaseId = e.target.value;
                  setFormData({...formData, selectedCaseId: newCaseId});
                  if (newCaseId) {
                    fetchSelectedCaseDetails(newCaseId);
                  }
                }}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">المدعي</label>
              <Input 
                value={formData.plaintiffName}
                onChange={e => setFormData({...formData, plaintiffName: e.target.value})}
                placeholder="اسم المدعي" 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">المدعى عليه</label>
              <Input 
                value={formData.defendantName}
                onChange={e => setFormData({...formData, defendantName: e.target.value})}
                placeholder="اسم المدعى عليه" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#0A192F]">الالتمسات / ما تم فيها</label>
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

          <div className="space-y-2 border-t pt-2 text-xs font-bold text-gray-500">أرشفة الجلسة (اختياري)</div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#0A192F]">محضر الضبط (نصي)</label>
            <textarea 
               value={formData.minutesText}
               onChange={e => setFormData({...formData, minutesText: e.target.value})}
               placeholder="اكتب أو الصق نص محضر الضبط هنا..." 
               className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-[#0A192F]">ملف محضر الضبط</label>
            <Input 
               type="file"
               onChange={e => setMinutesFile(e.target.files?.[0] || null)}
               className="bg-white"
            />
            {minutesFile && <p className="text-[10px] text-gray-500">تم اختيار: {minutesFile.name}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#0A192F]">الحكم الصادر في الجلسة (نصي)</label>
            <textarea 
               value={formData.judgmentText}
               onChange={e => setFormData({...formData, judgmentText: e.target.value})}
               placeholder="اكتب نص الحكم أو القرار الصادر في الجلسة إن وجد..." 
               className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-[#0A192F]">ملف حكم الجلسة / القرار</label>
            <Input 
               type="file"
               onChange={e => setJudgmentFile(e.target.files?.[0] || null)}
               className="bg-white"
            />
            {judgmentFile && <p className="text-[10px] text-gray-500">تم اختيار: {judgmentFile.name}</p>}
          </div>

          {uploadStatus && (
            <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-100 animate-pulse">
              {uploadStatus}
            </div>
          )}

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
