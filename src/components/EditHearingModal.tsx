import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2, Trash2 } from "lucide-react";

interface EditHearingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  caseId: string;
  hearingData: any | null;
}

export function EditHearingModal({ isOpen, onClose, onSuccess, caseId, hearingData }: EditHearingModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    hearingDate: "",
    court: "",
    circuit: "",
    requiredActions: "",
    result: "",
    nextHearingDate: "",
    minutesText: "",
    judgmentText: "",
  });
  
  const [minutesFile, setMinutesFile] = useState<File | null>(null);
  const [judgmentFile, setJudgmentFile] = useState<File | null>(null);
  const [minutesFileUrl, setMinutesFileUrl] = useState("");
  const [minutesFileName, setMinutesFileName] = useState("");
  const [judgmentFileUrl, setJudgmentFileUrl] = useState("");
  const [judgmentFileName, setJudgmentFileName] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && hearingData) {
      setFormData({
        hearingDate: hearingData.hearingDate || "",
        court: hearingData.court || "",
        circuit: hearingData.circuit || "",
        requiredActions: hearingData.requiredActions || "",
        result: hearingData.result || "",
        nextHearingDate: hearingData.nextHearingDate || "",
        minutesText: hearingData.minutesText || "",
        judgmentText: hearingData.judgmentText || "",
      });
      setMinutesFileUrl(hearingData.minutesFileUrl || "");
      setMinutesFileName(hearingData.minutesFileName || "");
      setJudgmentFileUrl(hearingData.judgmentFileUrl || "");
      setJudgmentFileName(hearingData.judgmentFileName || "");
      setMinutesFile(null);
      setJudgmentFile(null);
      setUploadStatus(null);
    }
  }, [isOpen, hearingData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId || !hearingData) return;
    setLoading(true);
    setUploadStatus("جاري تحديث البيانات...");
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");

      let finalMinutesFileUrl = minutesFileUrl;
      let finalMinutesFileName = minutesFileName;
      if (minutesFile) {
        setUploadStatus("جاري رفع ملف محضر الضبط الجديد...");
        const fd = new FormData();
        fd.append("file", minutesFile);
        const res = await fetch("/upload.php", { method: "POST", body: fd });
        if (!res.ok) throw new Error("فشل رفع ملف محضر الضبط");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        finalMinutesFileUrl = json.fileUrl;
        finalMinutesFileName = minutesFile.name;
      }

      let finalJudgmentFileUrl = judgmentFileUrl;
      let finalJudgmentFileName = judgmentFileName;
      if (judgmentFile) {
        setUploadStatus("جاري رفع ملف حكم الجلسة الجديد...");
        const fd = new FormData();
        fd.append("file", judgmentFile);
        const res = await fetch("/upload.php", { method: "POST", body: fd });
        if (!res.ok) throw new Error("فشل رفع ملف صك الحكم");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        finalJudgmentFileUrl = json.fileUrl;
        finalJudgmentFileName = judgmentFile.name;
      }

      const payload = {
        hearingDate: formData.hearingDate,
        court: formData.court,
        circuit: formData.circuit,
        requiredActions: formData.requiredActions,
        result: formData.result,
        nextHearingDate: formData.nextHearingDate || null,
        minutesText: formData.minutesText,
        minutesFileUrl: finalMinutesFileUrl,
        minutesFileName: finalMinutesFileName,
        judgmentText: formData.judgmentText,
        judgmentFileUrl: finalJudgmentFileUrl,
        judgmentFileName: finalJudgmentFileName,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, "cases", caseId, "hearings", hearingData.id), payload);
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      alert("فشل تحديث الجلسة: " + error.message);
    } finally {
      setLoading(false);
      setUploadStatus(null);
    }
  };

  const handleDeleteHearing = async () => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الجلسة نهائياً؟")) return;
    setLoading(true);
    try {
      const { doc, deleteDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      await deleteDoc(doc(db, "cases", caseId, "hearings", hearingData.id));
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      alert("فشل حذف الجلسة: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="flex flex-row justify-between items-center">
          <DialogTitle className="text-xl font-bold text-[#0A192F]">تعديل بيانات الجلسة</DialogTitle>
          {hearingData && (
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={handleDeleteHearing}
              disabled={loading}
              title="حذف الجلسة نهائياً"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
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
                value={formData.nextHearingDate || ""}
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

          <div className="space-y-2 border-t pt-2 text-xs font-bold text-gray-500">أرشفة الجلسة (محاضر الضبط والأحكام)</div>

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
            {minutesFileName && (
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs mb-1">
                <span className="truncate max-w-[200px] text-gray-700">{minutesFileName}</span>
                <Button 
                  type="button" 
                  variant="link" 
                  className="text-red-500 h-auto p-0 font-normal hover:text-red-700"
                  onClick={() => { setMinutesFileUrl(""); setMinutesFileName(""); }}
                >
                  إزالة الملف الحالي
                </Button>
              </div>
            )}
            <Input 
               type="file"
               onChange={e => setMinutesFile(e.target.files?.[0] || null)}
               className="bg-white"
            />
            {minutesFile && <p className="text-[10px] text-gray-500">تم اختيار ملف جديد: {minutesFile.name}</p>}
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
            {judgmentFileName && (
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs mb-1">
                <span className="truncate max-w-[200px] text-gray-700">{judgmentFileName}</span>
                <Button 
                  type="button" 
                  variant="link" 
                  className="text-red-500 h-auto p-0 font-normal hover:text-red-700"
                  onClick={() => { setJudgmentFileUrl(""); setJudgmentFileName(""); }}
                >
                  إزالة الملف الحالي
                </Button>
              </div>
            )}
            <Input 
               type="file"
               onChange={e => setJudgmentFile(e.target.files?.[0] || null)}
               className="bg-white"
            />
            {judgmentFile && <p className="text-[10px] text-gray-500">تم اختيار ملف جديد: {judgmentFile.name}</p>}
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
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
