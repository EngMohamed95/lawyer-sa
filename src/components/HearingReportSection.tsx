import { useRef, useState } from "react";
import { Download, FileText, Loader2, Save, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "./ui/button";
import RichTextEditor from "./RichTextEditor";
import { callGemini } from "../lib/aiProxy";
import { extractTextFromUploadedFile } from "../lib/fileExtraction";
import { downloadWordDoc } from "../lib/wordExport";

interface AiReport {
  id: string;
  title: string;
  html: string;
  createdAt: string;
}

interface MinutesFile {
  id: string;
  url: string;
  name: string;
}

interface HearingReportSectionProps {
  caseData: any;
  hearing: any;
  onUpdated: (patch: Partial<{ aiReports: AiReport[] }>) => Promise<void>;
}

export default function HearingReportSection({ caseData, hearing, onUpdated }: HearingReportSectionProps) {
  const reports: AiReport[] = hearing.aiReports || [];
  const minutesFiles: MinutesFile[] = hearing.minutesFiles || [];

  const [selectedMinutesIds, setSelectedMinutesIds] = useState<string[]>([]);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<AiReport | null>(null);
  const [editingHtml, setEditingHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleMinutesFile = (id: string) => {
    setSelectedMinutesIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setStatusMessage("جاري قراءة الملفات المرفقة...");
    try {
      const sourceTexts: string[] = [];

      for (const id of selectedMinutesIds) {
        const mf = minutesFiles.find((f) => f.id === id);
        if (!mf) continue;
        try {
          const res = await fetch(mf.url);
          const blob = await res.blob();
          const file = new File([blob], mf.name, { type: blob.type });
          const text = await extractTextFromUploadedFile(file);
          if (text) sourceTexts.push(`(من ملف "${mf.name}"):\n${text}`);
        } catch (e) {
          console.error("تعذّر قراءة ملف محضر مرفوع سابقاً:", mf.name, e);
        }
      }

      for (const file of extraFiles) {
        const text = await extractTextFromUploadedFile(file);
        if (text) sourceTexts.push(`(من ملف "${file.name}"):\n${text}`);
      }

      setStatusMessage("جاري صياغة تقرير الجلسة بالذكاء الاصطناعي...");

      const traineeNames: string[] = hearing.traineeNames || [];
      const systemPrompt = `أنت محامٍ خبير تُعِدّ تقرير جلسة رسمياً وموثّقاً بلغة عربية فصحى قانونية، بصيغة HTML منسقة (فقرات <p>، عناوين <h3>، قوائم <ul><li>، نصوص عريضة <strong>) بدون كود هيكلي كامل <html> أو <body> — فقط المحتوى الداخلي المنسق.

بيانات القضية والجلسة:
- عنوان القضية: ${caseData?.title || "غير محدد"}
- رقم القضية: ${caseData?.caseNumber || "غير محدد"}
- المحكمة: ${hearing.court || "غير محدد"}
- الدائرة: ${hearing.circuit || "غير محدد"}
- تاريخ الجلسة: ${hearing.hearingDate || "غير محدد"}
- المدعي: ${hearing.plaintiffName || "غير محدد"}
- المدعى عليه: ${hearing.defendantName || "غير محدد"}
- المحامي المسؤول: ${hearing.assignedLawyerName || "غير محدد"}
- المستشار: ${hearing.assignedConsultantName || "لا يوجد"}
- المتدرب: ${traineeNames.length > 0 ? traineeNames.join("، ") : "لا يوجد"}

الالتماسات / ما تم فيها: ${hearing.requiredActions || "غير مذكور"}
قرار الجلسة (النتيجة): ${hearing.result || "غير مذكور"}
نص محضر الضبط المكتوب: ${hearing.minutesText || "لا يوجد"}

نصوص مستخرجة من الملفات المرفقة:
${sourceTexts.length > 0 ? sourceTexts.join("\n\n") : "لا توجد ملفات مرفقة."}

ملاحظات إضافية من المحامي:
${notes || "لا يوجد"}

المطلوب: اكتب "تقرير الجلسة" الكامل، يشمل: عنوان التقرير وبيانات القضية والجلسة، ملخص لأطراف الحضور وفريق العمل، سرد ما دار في الجلسة استناداً لكل ما سبق، القرار الصادر أو المآل، وأخيراً التوصيات أو الخطوات القادمة المقترحة.`;

      const responseText = await callGemini(
        [{ role: "user", parts: [{ text: systemPrompt }] }],
        { temperature: 0.6, maxOutputTokens: 3000 },
      );

      if (!responseText) {
        throw new Error("لم نتمكن من الحصول على رد من محرك الذكاء الاصطناعي");
      }

      setEditingReport(null);
      setEditingHtml(responseText);
    } catch (err: any) {
      console.error(err);
      setError("حدث خطأ أثناء توليد التقرير: " + err.message);
    } finally {
      setLoading(false);
      setStatusMessage("");
    }
  };

  const handleSaveReport = async () => {
    if (!editingHtml.trim()) return;
    setSaving(true);
    try {
      if (editingReport) {
        const updated = reports.map((r) => (r.id === editingReport.id ? { ...r, html: editingHtml } : r));
        await onUpdated({ aiReports: updated });
      } else {
        const newReport: AiReport = {
          id: crypto.randomUUID(),
          title: `تقرير جلسة ${hearing.hearingDate || ""}`.trim(),
          html: editingHtml,
          createdAt: new Date().toISOString(),
        };
        await onUpdated({ aiReports: [...reports, newReport] });
      }
      setEditingReport(null);
      setEditingHtml("");
      setSelectedMinutesIds([]);
      setExtraFiles([]);
      setNotes("");
    } catch (err: any) {
      console.error(err);
      setError("تعذّر حفظ التقرير: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    await onUpdated({ aiReports: reports.filter((r) => r.id !== id) });
  };

  const isEditing = editingHtml !== "" || editingReport !== null;

  return (
    <div className="space-y-4" dir="rtl">
      {reports.length > 0 && !isEditing && (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-purple-500 shrink-0" />
                <span className="text-sm text-[#133B2E] font-medium truncate">{r.title}</span>
                <span className="text-[10px] text-gray-400 shrink-0">
                  {new Date(r.createdAt).toLocaleDateString("ar-EG")}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[10px] text-blue-700"
                  onClick={() => {
                    setEditingReport(r);
                    setEditingHtml(r.html);
                  }}
                >
                  تعديل
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[10px] text-gray-700"
                  onClick={() => downloadWordDoc(r.html, r.title)}
                >
                  <Download className="h-3.5 w-3.5 ml-1" /> Word
                </Button>
                <button
                  type="button"
                  onClick={() => handleDeleteReport(r.id)}
                  className="text-gray-400 hover:text-red-600 p-1"
                  title="حذف"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isEditing && !loading && (
        <div className="space-y-4 border-t border-gray-100 pt-4">
          {minutesFiles.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#133B2E]">اختر من محاضر الضبط المرفوعة</label>
              <div className="flex flex-wrap gap-2">
                {minutesFiles.map((f) => {
                  const checked = selectedMinutesIds.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs cursor-pointer border transition-all ${
                        checked ? "bg-[#133B2E] text-white border-[#133B2E]" : "bg-white text-gray-600 border-gray-200"
                      }`}
                    >
                      <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleMinutesFile(f.id)} />
                      {f.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#133B2E]">رفع ملفات إضافية (صور / PDF / Word)</label>
            <div className="flex flex-wrap gap-2">
              {extraFiles.map((f, i) => (
                <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-gray-100 text-gray-700">
                  {f.name}
                  <button type="button" onClick={() => setExtraFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) setExtraFiles((prev) => [...prev, ...files]);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="border-gray-200 text-gray-700 hover:bg-gray-50">
              <Upload className="ml-2 h-4 w-4" /> اختيار ملفات
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#133B2E]">ملاحظات إضافية (اختياري)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي نقاط تريد أن يتضمنها التقرير ولم تُذكر في الملفات..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <Button
            type="button"
            onClick={handleGenerate}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold"
          >
            <Sparkles className="ml-2 h-4 w-4" /> توليد تقرير الجلسة بالذكاء الاصطناعي
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-4 text-purple-700">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          <p className="font-bold text-sm animate-pulse">{statusMessage}</p>
        </div>
      )}

      {isEditing && !loading && (
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <label className="text-sm font-bold text-[#133B2E]">
            {editingReport ? "تعديل التقرير" : "معاينة التقرير المولّد — يمكنك التعديل عليه مباشرة"}
          </label>
          <RichTextEditor value={editingHtml} onChange={setEditingHtml} placeholder="محتوى التقرير..." />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingReport(null);
                setEditingHtml("");
              }}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadWordDoc(editingHtml, editingReport?.title || `تقرير جلسة ${hearing.hearingDate || ""}`)}
              className="border-gray-200 text-gray-700"
            >
              <Download className="ml-2 h-4 w-4" /> تنزيل Word
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={handleSaveReport}
              className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white font-bold"
            >
              {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
              حفظ في سجل الجلسة
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
