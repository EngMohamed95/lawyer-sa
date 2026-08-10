import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Loader2, Sparkles, Upload, AlertCircle, FileSignature } from "lucide-react";
import { auth } from "../lib/firebase";
import { createContractFromDocument } from "../lib/contractFromDocument";
import { usePermissions } from "../lib/usePermissions";
import { useOfficeLookups } from "../lib/officeLookups";
import {
  CONFIDENTIALITY_LABELS_AR, assignableConfidentialities, fileChecksum,
  type Confidentiality,
} from "../lib/documentAcl";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  caseId?: string;
  clientId?: string;
  /** رفع إصدار جديد لمستند قائم — يُمرَّر المستند الأصل */
  newVersionOf?: {
    id: string;
    name: string;
    version: number;
    parentDocumentId?: string | null;
    confidentiality?: Confidentiality;
    path: string[];
  } | null;
}

export function AddDocumentModal({ isOpen, onClose, onSuccess, caseId, clientId, newVersionOf = null }: Props) {
  const { documentTypes } = useOfficeLookups();
  const perms = usePermissions();
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [formData, setFormData] = useState({ name: "", type: "OTHER", notes: "" });
  const [saveToClient, setSaveToClient] = useState(clientId && !caseId ? true : false);
  /** عند رفع مستند نوعه «عقد» — يُنشأ له سجل عقد مرتبط في مديول العقود */
  const [createContractRecord, setCreateContractRecord] = useState(true);
  const [confidentiality, setConfidentiality] = useState<Confidentiality>("PUBLIC_INTERNAL");
  const [tags, setTags] = useState("");
  const levels = assignableConfidentialities(perms.role);

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
    setCreateContractRecord(true);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId && !clientId) {
      alert("خطأ: لم يتم تحديد القضية أو العميل");
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

      // بصمة الملف — تكشف تغيّر المحتوى بين الإصدارات
      const checksum = await fileChecksum(selectedFile);
      const cleanTags = tags.split(/[،,]/).map(t => t.trim()).filter(Boolean).slice(0, 20);

      const payload = {
        ...formData,
        // عند رفع إصدار جديد نحتفظ باسم الأصل حتى تبقى السلسلة متماسكة
        name: newVersionOf ? newVersionOf.name : formData.name,
        fileUrl,
        fileType,
        content: extractedText,
        extractedText: extractedText || null,
        lawyerId,
        uploadDate: new Date().toISOString(),
        // خزنة المستندات
        version: newVersionOf ? newVersionOf.version + 1 : 1,
        isLatest: true,
        parentDocumentId: newVersionOf ? (newVersionOf.parentDocumentId ?? newVersionOf.id) : null,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type || null,
        checksum,
        confidentiality: newVersionOf ? (newVersionOf.confidentiality ?? confidentiality) : confidentiality,
        allowedRoles: [],
        allowedUserIds: [],
        sharedWithClient: false,
        status: "ACTIVE",
        tags: cleanTags,
        uploadedBy: localStorage.getItem("userId"),
        uploadedByName: localStorage.getItem("userName") ?? null,
      };

      // نحتفظ بمسار المستند لنربطه بالعقد إن لزم
      let docPath: string[] | null = null;
      let docId: string | null = null;

      if (saveToClient && clientId) {
        const ref = await addDoc(collection(doc(db, "clients", clientId), "documents"), payload);
        docPath = ["clients", clientId, "documents", ref.id];
        docId = ref.id;
      } else if (caseId) {
        const ref = await addDoc(collection(doc(db, "cases", caseId), "documents"), payload);
        docPath = ["cases", caseId, "documents", ref.id];
        docId = ref.id;
      } else if (clientId) {
        const ref = await addDoc(collection(doc(db, "clients", clientId), "documents"), payload);
        docPath = ["clients", clientId, "documents", ref.id];
        docId = ref.id;
      }

      // الإصدار السابق يبقى محفوظاً ويُوسَم أنه لم يعد الأحدث — لا يُحذف أبداً
      if (newVersionOf && docPath) {
        try {
          const { updateDoc } = await import("firebase/firestore");
          const p = newVersionOf.path;
          await updateDoc(doc(db, p[0], ...p.slice(1)), { isLatest: false });
        } catch (verErr) {
          console.error("تعذّر وسم الإصدار السابق:", verErr);
        }
      }

      // مستند نوعه «عقد» ⟵ يُنشأ له سجل في مديول العقود العام مرفقاً به الملف،
      // ويُوسَم المستند برقم العقد فيصير الربط ثنائي الاتجاه.
      if (formData.type === "CONTRACT" && createContractRecord && docPath && docId) {
        setUploadProgress("جاري الربط بمديول العقود...");
        try {
          await createContractFromDocument(
            {
              path: docPath,
              id: docId,
              name: formData.name || selectedFile.name,
              fileUrl,
              fileType,
              content: extractedText,
              notes: formData.notes,
            },
            {
              lawyerId,
              clientId: clientId ?? null,
              caseId: caseId ?? null,
              userId: localStorage.getItem("userId"),
            },
          );
        } catch (contractErr) {
          // فشل الربط لا يُلغي رفع المستند — المستند محفوظ بالفعل
          console.error("تعذّر ربط المستند بمديول العقود:", contractErr);
          alert("رُفع المستند بنجاح، لكن تعذّر ربطه بمديول العقود. يمكنك ربطه لاحقاً من زر «أضِفه للعقود» في صفحة المستندات.");
        } finally {
          setUploadProgress(null);
        }
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
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#133B2E]">رفع مستند جديد</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-[#133B2E]">اسم المستند *</label>
              <Input
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: توكيل عام، صورة بطاقة..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">النوع</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value })}
              >
                {documentTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">ملاحظات</label>
              <Input
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="ملاحظات اختيارية..."
              />
            </div>

            {!newVersionOf && (
              <>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-[#133B2E]">التصنيف الأمني</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={confidentiality}
                    onChange={e => setConfidentiality(e.target.value as Confidentiality)}
                  >
                    {levels.map(c => (
                      <option key={c} value={c}>{CONFIDENTIALITY_LABELS_AR[c]}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400">
                    يحدّد من يرى المستند داخل المكتب. يمكن تعديله لاحقاً من زر الصلاحيات.
                  </p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-[#133B2E]">الوسوم</label>
                  <Input value={tags} onChange={e => setTags(e.target.value)}
                    placeholder="مثال: توكيل، أصل، مرافعة — تُستخدم في البحث" />
                </div>
              </>
            )}

            {newVersionOf && (
              <div className="md:col-span-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-sm">
                <p className="font-bold text-indigo-900">
                  رفع إصدار جديد لـ «{newVersionOf.name}»
                </p>
                <p className="text-xs text-indigo-700 mt-0.5">
                  سيُحفظ كإصدار {newVersionOf.version + 1} — الإصدار {newVersionOf.version} يبقى
                  محفوظاً وقابلاً للعرض والاستعادة.
                </p>
              </div>
            )}

            {formData.type === "CONTRACT" && clientId && (
              <div className="md:col-span-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <FileSignature size={18} className="text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-emerald-900">إظهاره في مديول العقود</p>
                    <p className="text-xs text-emerald-700">
                      يُنشأ سجل عقد كمسودة مرفقاً به هذا الملف، ويظهر في صفحة العقود
                      {caseId ? " وداخل تبويب عقود هذه القضية" : ""} ليمرّ بدورة المراجعة والاعتماد.
                    </p>
                  </div>
                </div>
                <input
                  id="createContractRecord"
                  type="checkbox"
                  className="w-5 h-5 accent-[#133B2E] shrink-0"
                  checked={createContractRecord}
                  onChange={(e) => setCreateContractRecord(e.target.checked)}
                />
              </div>
            )}

            {caseId && clientId && (
              <div className="md:col-span-2 p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-amber-900">مكان الحفظ</p>
                  <p className="text-xs text-amber-700">هل تريد حفظ هذا المستند في ملف العميل ليظهر في جميع قضاياه؟</p>
                </div>
                <div className="flex items-center gap-2">
                   <label className="text-sm font-medium cursor-pointer" htmlFor="saveToClient">
                     {saveToClient ? "في ملف العميل" : "في هذه القضية فقط"}
                   </label>
                   <input
                     id="saveToClient"
                     type="checkbox"
                     className="w-5 h-5 accent-[#133B2E]"
                     checked={saveToClient}
                     onChange={(e) => setSaveToClient(e.target.checked)}
                   />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 p-4 bg-gray-50 border border-dashed rounded-lg">
            <label className="text-sm font-bold text-[#133B2E]">ملف المستند</label>
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
              <label className="text-sm font-bold text-[#133B2E]">النص المستخرج (قابل للتعديل)</label>
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
            <Button type="submit" disabled={loading} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              رفع المستند
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
