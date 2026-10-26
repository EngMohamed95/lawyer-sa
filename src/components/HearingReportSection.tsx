/**
 * تقرير الجلسة — بنفس فكرة كتابة المذكرة: عنوان، مختصر المطلوب، مرفقات،
 * صفحة محرر بترويسة المكتب، ولوحة المساعد الذكي بجوارها.
 * التقارير تُحفظ في سجل الجلسة (hearing.aiReports) وتُنزَّل Word أو PDF.
 */

import { useState } from "react";
import { Download, FileText, Info, Loader2, Paperclip, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import RichTextEditor from "./RichTextEditor";
import MemoAiPanel, { MemoAttachmentsField, addAttachmentFiles, type AiAttachment } from "./MemoAiPanel";
import { downloadWordDoc } from "../lib/wordExport";
import { ensureHtml2pdf, stripUnsupportedColorsOnClone } from "../lib/reportUtils";
import { renderMemoLetterheadFooter, renderMemoLetterheadHeader } from "../lib/letterhead";
import { useOfficeSettings } from "../lib/officeSettings";

interface AiReport {
  id: string;
  title: string;
  html: string;
  /** مختصر ما طلبه المحامي — يعود عند تعديل التقرير */
  brief?: string;
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

const REPORT_LABEL = "تقرير الجلسة";

/** نوع الملف من امتداده — الملفات المرفوعة قد تعود بنوع عام لا يميّزه المساعد */
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default function HearingReportSection({ caseData, hearing, onUpdated }: HearingReportSectionProps) {
  const office = useOfficeSettings();
  const reports: AiReport[] = hearing.aiReports || [];
  const minutesFiles: MinutesFile[] = hearing.minutesFiles || [];
  const defaultTitle = `تقرير جلسة ${hearing.hearingDate || ""}`.trim();

  // null = لا تحرير، "new" = تقرير جديد، وإلا معرّف التقرير قيد التعديل
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [html, setHtml] = useState("");
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [loadingMinutesId, setLoadingMinutesId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // بيانات القضية كما يقرؤها المساعد الذكي — مكمّلة ببيانات الجلسة
  const aiCaseData = {
    ...caseData,
    courtName: hearing.court || caseData?.courtName,
    courtCircle: hearing.circuit || caseData?.courtCircle,
    plaintiffName: hearing.plaintiffName || caseData?.plaintiffName,
    defendantName: hearing.defendantName || caseData?.defendantName,
  };

  const startEditing = (report: AiReport | null) => {
    setEditingId(report ? report.id : "new");
    setTitle(report?.title || defaultTitle);
    setBrief(report?.brief || "");
    setHtml(report?.html || "");
    setAttachments([]);
    setError(null);
  };

  const stopEditing = () => {
    setEditingId(null);
    setTitle("");
    setBrief("");
    setHtml("");
    setAttachments([]);
  };

  /** يضيف محضر ضبط مرفوعاً سابقاً لمرفقات المساعد */
  const addMinutesFile = async (mf: MinutesFile) => {
    setLoadingMinutesId(mf.id);
    setError(null);
    try {
      const blob = await (await fetch(mf.url)).blob();
      const ext = mf.name.split(".").pop()?.toLowerCase() || "";
      const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : MIME_BY_EXT[ext] || blob.type;
      const { next, error } = await addAttachmentFiles(attachments, [new window.File([blob], mf.name, { type })]);
      setAttachments(next);
      if (error) setError(error);
    } catch (err) {
      console.error("تعذّر قراءة ملف محضر مرفوع سابقاً:", mf.name, err);
      setError(`تعذّر تحميل «${mf.name}».`);
    } finally {
      setLoadingMinutesId(null);
    }
  };

  const buildDraftPrompt = () => {
    const traineeNames: string[] = hearing.traineeNames || [];
    return `أنت محامٍ خبير تُعِدّ تقرير جلسة رسمياً وموثّقاً بلغة عربية فصحى قانونية، بصيغة HTML منسقة (فقرات <p>، عناوين <h3>، قوائم <ul><li>، نصوص عريضة <strong>) بدون كود هيكلي كامل <html> أو <body> — فقط المحتوى الداخلي المنسق.

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

ملخص الجلسة: ${hearing.requiredActions || "غير مذكور"}
قرار الجلسة (النتيجة): ${hearing.result || "غير مذكور"}
نص محضر الضبط المكتوب: ${hearing.minutesText || "لا يوجد"}
${brief.trim() ? `\nمختصر ما يريده المحامي من هذا التقرير (التزم به): ${brief.trim()}\n` : ""}
المطلوب: اكتب "تقرير الجلسة" الكامل، يشمل: عنوان التقرير وبيانات القضية والجلسة، ملخص لأطراف الحضور وفريق العمل، سرد ما دار في الجلسة استناداً لكل ما سبق وللمرفقات، القرار الصادر أو المآل، وأخيراً التوصيات أو الخطوات القادمة المقترحة.`;
  };

  const handleSave = async () => {
    if (!html.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const finalTitle = title.trim() || defaultTitle;
      const extra = brief.trim() ? { brief: brief.trim() } : {};
      if (editingId && editingId !== "new") {
        const updated = reports.map((r) => {
          if (r.id !== editingId) return r;
          const { brief: _old, ...rest } = r;
          return { ...rest, title: finalTitle, html, ...extra };
        });
        await onUpdated({ aiReports: updated });
      } else {
        const newReport: AiReport = { id: crypto.randomUUID(), title: finalTitle, html, ...extra, createdAt: new Date().toISOString() };
        await onUpdated({ aiReports: [...reports, newReport] });
      }
      stopEditing();
    } catch (err: any) {
      console.error(err);
      setError("تعذّر حفظ التقرير: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  /** صفحة التقرير الكاملة: ترويسة المكتب + العنوان + بيانات القضية + المحتوى + التذييل */
  const documentHtml = (reportTitle: string, body: string) => `
    <div style="font-family: 'Tajawal', 'Traditional Arabic', sans-serif; line-height: 1.8; direction: rtl; text-align: right; background:#fff;">
      ${renderMemoLetterheadHeader(office.officeProfile)}
      <div style="padding: 30px 40px;">
        <h1 style="text-align: center; color: #192a56; border-bottom: 2px solid #273c75; padding-bottom: 10px; font-size: 20pt;">${escapeHtml(reportTitle)}</h1>
        <div style="color: #666; margin-bottom: 24px; border-bottom: 1px solid #eee; padding-bottom: 10px; font-size: 10pt;">
          قضية رقم: ${escapeHtml(caseData?.caseNumber || "---")} | تاريخ الجلسة: ${escapeHtml(hearing.hearingDate || "---")}
        </div>
        <div style="font-size: 13pt; text-align: justify;">${body}</div>
      </div>
      ${renderMemoLetterheadFooter(office.officeProfile)}
    </div>`;

  const exportWord = (reportTitle: string, body: string) =>
    downloadWordDoc(documentHtml(reportTitle, body), reportTitle);

  const exportPdf = async (key: string, reportTitle: string, body: string) => {
    setExporting(key);
    setError(null);
    const element = document.createElement("div");
    try {
      await ensureHtml2pdf();
      element.innerHTML = documentHtml(reportTitle, body);
      document.body.appendChild(element);
      await (window as any).html2pdf().from(element).set({
        margin: 10,
        filename: `${reportTitle}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, onclone: stripUnsupportedColorsOnClone },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      }).save();
    } catch (err) {
      console.error("PDF export error:", err);
      setError("تعذّر إنشاء ملف PDF. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      element.remove();
      setExporting(null);
    }
  };

  // ───────────── وضع الكتابة: نفس تخطيط كتابة المذكرة ─────────────
  if (editingId) {
    const currentTitle = title.trim() || defaultTitle;
    return (
      <div className="space-y-6" dir="rtl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2 md:col-span-3">
            <label className="text-sm font-bold text-ink">عنوان التقرير</label>
            <Input className="text-lg bg-gray-50" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-bold text-ink">مختصر المطلوب</label>
            <textarea
              rows={3}
              placeholder="اكتب باختصار ما تريده من التقرير، مثل: التركيز على طلبات الخصم وموعد الجلسة القادمة..."
              className="w-full resize-y rounded-md border border-input bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
            <p className="text-[11px] text-gray-400">يعتمد عليه المساعد الذكي عند الصياغة.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-ink">المرفقات</label>
            <MemoAttachmentsField
              attachments={attachments}
              onChange={setAttachments}
              extra={minutesFiles.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold text-gray-500">أو أضف من محاضر الضبط المرفوعة:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {minutesFiles.map((mf) => {
                      const added = attachments.some((a) => a.name === mf.name);
                      return (
                        <button key={mf.id} type="button" disabled={added || loadingMinutesId !== null} onClick={() => addMinutesFile(mf)}
                          className="flex items-center gap-1 rounded-full border border-gray-200 bg-surface px-2.5 py-1 text-[11px] text-gray-700 hover:border-purple-300 disabled:opacity-50">
                          {loadingMinutesId === mf.id ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}
                          <span className="max-w-[10rem] truncate">{mf.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            />
          </div>
        </div>

        {/* يمين: المساعد الذكي — يسار: صفحة المحرر بترويسة المكتب (على الجوال المحرر أولاً) */}
        <div className="grid grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] gap-5 items-start">
          <div className="rounded-2xl bg-gray-100 border border-gray-200 p-3 sm:p-6 lg:order-last">
            {!office.officeProfile.name && (
              <div className="mx-auto max-w-[850px] mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Info size={14} className="shrink-0" />
                الترويسة تعرض بيانات افتراضية — أكمل اسم المكتب وشعاره وهواتفه من الإعدادات ← مطبوعات المكتب.
              </div>
            )}
            <div className="mx-auto max-w-[850px] bg-surface shadow-md">
              <RichTextEditor
                value={html}
                onChange={setHtml}
                placeholder="اكتب التقرير هنا أو اطلب صياغته من المساعد الذكي..."
                headerHtml={renderMemoLetterheadHeader(office.officeProfile)}
                footerHtml={renderMemoLetterheadFooter(office.officeProfile)}
              />
            </div>
          </div>
          <MemoAiPanel
            caseData={aiCaseData}
            memoTypeLabel={REPORT_LABEL}
            editorHtml={html}
            brief={brief}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            buildDraftPrompt={buildDraftPrompt}
            onInsert={(part) => setHtml((prev) => (prev ? `${prev}\n${part}` : part))}
            onReplace={(part) => {
              if (html && !confirm("سيُستبدل محتوى المحرر بالكامل بهذا النص. متابعة؟")) return;
              setHtml(part);
            }}
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={stopEditing}>إلغاء</Button>
          <Button type="button" variant="outline" disabled={!html.trim()} onClick={() => exportWord(currentTitle, html)} className="border-gray-200 text-gray-700">
            <Download className="ml-2 h-4 w-4" /> تنزيل Word
          </Button>
          <Button type="button" variant="outline" disabled={!html.trim() || exporting !== null} onClick={() => exportPdf("editor", currentTitle, html)} className="border-gray-200 text-gray-700">
            {exporting === "editor" ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />} تنزيل PDF
          </Button>
          <Button type="button" disabled={saving || !html.trim()} onClick={handleSave} className="bg-navy hover:bg-navy/90 text-white font-bold">
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
            حفظ في سجل الجلسة
          </Button>
        </div>
      </div>
    );
  }

  // ───────────── سجل التقارير المحفوظة ─────────────
  return (
    <div className="space-y-4" dir="rtl">
      {reports.length > 0 ? (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-purple-500 shrink-0" />
                <span className="text-sm text-ink font-medium truncate">{r.title}</span>
                <span className="text-[10px] text-gray-400 shrink-0">{new Date(r.createdAt).toLocaleDateString("ar-EG")}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-blue-700" onClick={() => startEditing(r)}>
                  تعديل
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-gray-700" onClick={() => exportWord(r.title, r.html)}>
                  <Download className="h-3.5 w-3.5 ml-1" /> Word
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-gray-700" disabled={exporting !== null} onClick={() => exportPdf(r.id, r.title, r.html)}>
                  {exporting === r.id ? <Loader2 className="h-3.5 w-3.5 ml-1 animate-spin" /> : <Download className="h-3.5 w-3.5 ml-1" />} PDF
                </Button>
                <button type="button" onClick={() => onUpdated({ aiReports: reports.filter((x) => x.id !== r.id) })}
                  className="text-gray-400 hover:text-red-600 p-1" title="حذف">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">لا توجد تقارير محفوظة لهذه الجلسة بعد.</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <Button type="button" onClick={() => startEditing(null)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold">
        <Plus className="ml-2 h-4 w-4" /> كتابة تقرير جلسة جديد
      </Button>
    </div>
  );
}
