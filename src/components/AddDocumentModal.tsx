import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Loader2, Sparkles, Upload, AlertCircle } from "lucide-react";
import { auth } from "../lib/firebase";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  caseId?: string;
  clientId?: string;
}

export function AddDocumentModal({ isOpen, onClose, onSuccess, caseId, clientId }: Props) {
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [formData, setFormData] = useState({ name: "", type: "OTHER", notes: "" });
  const [saveToClient, setSaveToClient] = useState(clientId && !caseId ? true : false);

  // Debug: Log auth state when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log("AddDocumentModal opened. Auth User:", auth.currentUser?.uid);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (file && !formData.name) {
      // Auto-fill name from filename (without extension)
      setFormData(prev => ({ ...prev, name: file.name.replace(/\.[^.]+$/, "") }));
    }
  };

  const extractText = async () => {
    alert("هذه الخاصية تتطلب سيرفر ذكاء اصطناعي، سيتم تفعيلها لاحقاً في نسخة السحاب");
  };

  const handleClose = () => {
    setSelectedFile(null);
    setExtractedText("");
    setUploadProgress(null);
    setFormData({ name: "", type: "OTHER", notes: "" });
    setSaveToClient(clientId && !caseId ? true : false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId && !clientId) {
      alert("خطأ: لم يتم تحديد القضية أو الموكل");
      return;
    }
    if (!selectedFile) {
      alert("الرجاء اختيار ملف أولاً");
      return;
    }

    setLoading(true);
    try {
      const { collection, addDoc, doc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");

      const lawyerId = localStorage.getItem("lawyerId");
      if (!lawyerId) throw new Error("لم يتم العثور على معرف المحامي. يرجى إعادة تسجيل الدخول.");

      // Upload file to Hostinger (Local PHP)
      let fileUrl = "";
      let fileType = "";
      
      setUploadProgress("جاري الرفع إلى السيرفر الخاص...");

      const formDataObj = new FormData();
      formDataObj.append("file", selectedFile);

      const response = await fetch("/upload.php", {
        method: "POST",
        body: formDataObj,
      });

      if (!response.ok) {
        throw new Error("فشل الرفع إلى السيرفر. تأكد من وجود ملف upload.php على الاستضافة.");
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
      
      fileUrl = result.fileUrl;
      fileType = selectedFile.type;
      setUploadProgress(null);

      const payload = {
        ...formData,
        fileUrl,
        fileType,
        content: extractedText,
        lawyerId,
        uploadDate: new Date().toISOString(),
      };

      if (saveToClient && clientId) {
        await addDoc(collection(doc(db, "clients", clientId), "documents"), payload);
      } else if (caseId) {
        await addDoc(collection(doc(db, "cases", caseId), "documents"), payload);
      } else if (clientId) {
        await addDoc(collection(doc(db, "clients", clientId), "documents"), payload);
      }

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error("Full Submit Error:", error);
      setUploadProgress(null);
      
      let errorMsg = error.message;
      if (error.code === 'storage/unauthorized') {
        errorMsg = "غير مصرح لك بالرفع. يرجى التأكد من قواعد الحماية (Security Rules) في Firebase Storage.";
      } else if (error.code === 'storage/project-not-found') {
        errorMsg = "لم يتم العثور على مشروع Firebase. يرجى التأكد من إعدادات الاتصال.";
      } else if (error.code === 'storage/object-not-found') {
        errorMsg = "المسار غير موجود أو تم حذفه.";
      }

      alert("حدث خطأ أثناء الرفع:\n" + errorMsg + (error.code ? `\n(Code: ${error.code})` : ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0A192F]">رفع مستند جديد</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-[#0A192F]">اسم المستند *</label>
              <Input
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: توكيل عام، صورة بطاقة..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">النوع</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="POWER_OF_ATTORNEY">توكيل</option>
                <option value="CONTRACT">عقد</option>
                <option value="EVIDENCE">دليل إثبات</option>
                <option value="JUDGMENT">حكم</option>
                <option value="RECEIPT">إيصال / حافظة</option>
                <option value="OTHER">أخرى</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">ملاحظات</label>
              <Input
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="ملاحظات اختيارية..."
              />
            </div>

            {caseId && clientId && (
              <div className="md:col-span-2 p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-amber-900">مكان الحفظ</p>
                  <p className="text-xs text-amber-700">هل تريد حفظ هذا المستند في ملف الموكل ليظهر في جميع قضاياه؟</p>
                </div>
                <div className="flex items-center gap-2">
                   <label className="text-sm font-medium cursor-pointer" htmlFor="saveToClient">
                     {saveToClient ? "في ملف الموكل" : "في هذه القضية فقط"}
                   </label>
                   <input
                     id="saveToClient"
                     type="checkbox"
                     className="w-5 h-5 accent-[#0A192F]"
                     checked={saveToClient}
                     onChange={(e) => setSaveToClient(e.target.checked)}
                   />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 p-4 bg-gray-50 border border-dashed rounded-lg">
            <label className="text-sm font-bold text-[#0A192F]">ملف المستند</label>
            <Input
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
            />
            {selectedFile && (
              <div className="mt-3 flex flex-col items-center gap-2">
                <p className="text-xs text-gray-500">
                  {selectedFile.name} — {(selectedFile.size / 1024).toFixed(0)} KB
                </p>
                {selectedFile.type.startsWith('image/') && (
                   <div className="relative w-full max-h-48 overflow-hidden rounded-md border">
                      <img 
                        src={URL.createObjectURL(selectedFile)} 
                        alt="Preview" 
                        className="w-full h-full object-contain"
                      />
                   </div>
                )}
              </div>
            )}
            {selectedFile && (
              <Button
                type="button"
                variant="outline"
                className="w-full mt-2 text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100"
                onClick={extractText}
              >
                <Sparkles className="h-4 w-4 ml-2" />
                استخراج النص بالذكاء الاصطناعي
              </Button>
            )}
          </div>

          {extractedText !== "" && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">النص المستخرج (قابل للتعديل)</label>
              <Textarea
                className="min-h-[150px] leading-relaxed resize-y"
                value={extractedText}
                onChange={e => setExtractedText(e.target.value)}
                dir="auto"
              />
            </div>
          )}

          {uploadProgress && (
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin" />
              {uploadProgress}
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={handleClose}>إلغاء</Button>
            <Button type="submit" disabled={loading} className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              رفع المستند
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
