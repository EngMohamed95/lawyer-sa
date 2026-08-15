/**
 * ختم المكتب الرسمي — يُرفع مرة واحدة من مدير المكتب، ويُطبع تلقائياً على
 * المذكرات بعد اعتمادها نهائياً (راجع src/lib/memoWorkflow.ts وCaseDetails.tsx).
 */

import { useRef, useState } from "react";
import { Stamp, UploadCloud, Trash2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { usePermissions } from "../../lib/usePermissions";
import { useOfficeSettings, saveOfficialStamp } from "../../lib/officeSettings";

export default function OfficeStampCard() {
  const perms = usePermissions();
  const office = useOfficeSettings();
  const canManage = perms.can("settings.manage");
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    if (!perms.lawyerId || perms.lawyerId === "ALL") {
      setError("تعذّر تحديد المكتب. سجّل الخروج ثم الدخول مجدداً.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const formDataObj = new FormData();
      formDataObj.append("file", file);
      const response = await fetch("/upload.php", { method: "POST", body: formDataObj });
      if (!response.ok) throw new Error("فشل الرفع إلى السيرفر.");
      const result = await response.json();
      if (result.error) throw new Error(result.error);

      await saveOfficialStamp(perms.lawyerId, result.fileUrl, perms.userId);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError("تعذّر رفع الختم. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!perms.lawyerId || perms.lawyerId === "ALL") return;
    if (!confirm("إزالة ختم المكتب؟ لن يُطبع على المذكرات المعتمدة بعد الآن.")) return;
    setUploading(true);
    setError("");
    try {
      await saveOfficialStamp(perms.lawyerId, null, perms.userId);
    } catch (err) {
      console.error(err);
      setError("تعذّر إزالة الختم.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3 max-w-md">
      <div className="flex items-center gap-2">
        <Stamp size={16} className="text-[#133B2E]" />
        <label className="text-sm font-bold text-gray-700">ختم المكتب الرسمي</label>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        يُطبع تلقائياً على المذكرات واللوائح بعد اعتمادها النهائي ورفعها للجلسة.
      </p>

      <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-2xl bg-gray-50/50">
        {office.officialStampUrl ? (
          <img src={office.officialStampUrl} alt="ختم المكتب" className="w-20 h-20 object-contain bg-white rounded-xl border border-gray-200 p-1" />
        ) : (
          <div className="w-20 h-20 flex items-center justify-center bg-white rounded-xl border border-dashed border-gray-300 text-gray-300">
            <Stamp size={28} />
          </div>
        )}

        {canManage && (
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-[#133B2E] text-[#D4AF37] font-bold rounded-xl text-xs hover:bg-[#133B2E]/90 transition disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
              {office.officialStampUrl ? "استبدال الختم" : "رفع صورة الختم"}
            </button>
            {office.officialStampUrl && (
              <button
                type="button"
                disabled={uploading}
                onClick={handleRemove}
                className="flex items-center gap-2 px-4 py-2 text-red-600 font-bold rounded-xl text-xs hover:bg-red-50 transition disabled:opacity-50"
              >
                <Trash2 size={14} /> إزالة الختم
              </button>
            )}
          </div>
        )}
      </div>

      {saved && (
        <span className="text-xs text-green-600 font-bold flex items-center gap-1">
          <CheckCircle2 size={14} /> تم حفظ الختم وتطبيقه على المكتب
        </span>
      )}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}
      {!canManage && (
        <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg">تعديل الختم متاح لمدير المكتب فقط.</p>
      )}
    </div>
  );
}
