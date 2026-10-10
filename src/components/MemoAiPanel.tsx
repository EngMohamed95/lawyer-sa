/**
 * لوحة الذكاء الاصطناعي بجوار محرر المذكرات.
 * النتائج تظهر هنا أولاً، ولا تمس المحرر إلا عند «إدراج» أو «استبدال» —
 * فلا يضيع ما كتبه المحامي بضغطة خاطئة.
 *
 * المرفقات: PDF والصور تُرسل لـ Gemini مضمّنة فيقرؤها بنفسه (حتى الممسوحة ضوئياً)،
 * وملفات Word يُستخرج نصها في المتصفح. وإن احتاج المساعد مستنداً غير مرفق
 * يطلبه صراحةً بدل أن يختلق وقائع.
 */

import { useRef, useState } from "react";
import {
  Check, Copy, FilePlus2, FileText, Loader2, Paperclip, Replace, RotateCcw, SendHorizontal, Sparkles, Trash2, X,
} from "lucide-react";
import { callGemini, callGroq, readAiSettings, type GeminiPart } from "../lib/aiProxy";

interface AiResult {
  id: string;
  request: string;
  /** البرومبت الأصلي — لإعادة الطلب بعد إرفاق ما طلبه المساعد */
  prompt: string;
  html: string;
  error?: boolean;
  /** المساعد يطلب مستندات قبل أن يصيغ */
  needsFiles?: boolean;
}

interface AiAttachment {
  id: string;
  name: string;
  size: number;
  /** inline: يُرسل الملف نفسه (PDF/صورة) — text: نص مستخرج (Word/نص) */
  kind: "inline" | "text";
  mimeType?: string;
  data?: string;
  text?: string;
}

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 40000;
const INLINE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt";

/** علامة يبدأ بها المساعد ردّه حين يحتاج مستندات */
const NEED_FILES_MARKER = "[[طلب_مرفقات]]";

const stripCodeFence = (text: string) =>
  text.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();

const htmlToText = (html: string) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.innerText;
};

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error(`تعذّرت قراءة ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function toAttachment(file: File): Promise<AiAttachment> {
  const id = Math.random().toString(36).slice(2);
  const base = { id, name: file.name, size: file.size };
  const lower = file.name.toLowerCase();
  if (INLINE_TYPES.includes(file.type)) {
    return { ...base, kind: "inline", mimeType: file.type, data: await readAsBase64(file) };
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { ...base, kind: "text", text: value.slice(0, MAX_TEXT_CHARS) };
  }
  if (file.type === "text/plain" || lower.endsWith(".txt")) {
    return { ...base, kind: "text", text: (await file.text()).slice(0, MAX_TEXT_CHARS) };
  }
  throw new Error(`نوع الملف «${file.name}» غير مدعوم — المدعوم: PDF، صور، Word (docx)، نص`);
}

async function askAi(prompt: string, attachments: AiAttachment[]): Promise<string> {
  const settings = readAiSettings();
  const textParts = attachments
    .filter((a) => a.kind === "text")
    .map((a) => `\n--- بداية المرفق: ${a.name} ---\n${a.text}\n--- نهاية المرفق: ${a.name} ---`);

  if (settings.provider === "GEMINI") {
    const parts: GeminiPart[] = [
      { text: prompt + textParts.join("\n") },
      ...attachments
        .filter((a) => a.kind === "inline")
        .map((a) => ({ inlineData: { mimeType: a.mimeType!, data: a.data! } })),
    ];
    return stripCodeFence(await callGemini([{ role: "user", parts }], { temperature: 0.7, maxOutputTokens: 4096 }, settings));
  }
  if (attachments.some((a) => a.kind === "inline")) {
    throw new Error("قراءة ملفات PDF والصور تحتاج مزوّد Gemini — غيّر المزوّد من إعدادات المنصة أو أرفق ملفات Word/نص.");
  }
  return stripCodeFence(await callGroq([{ role: "user", content: prompt + textParts.join("\n") }], settings));
}

/** تعليمات المرفقات تُلحق بكل طلب */
const attachmentRules = (names: string[]) => `
${names.length
    ? `مرفق مع هذا الطلب المستندات التالية: ${names.join("، ")}. اعتمد عليها مصدراً أساسياً للوقائع والأرقام والتواريخ والأسماء.`
    : "لا توجد مستندات مرفقة مع هذا الطلب."}
إذا كان غياب مستند بعينه (مثل صك الحكم، العقد، السند، الوكالة، محضر الجلسة) يمنع صياغة المطلوب صياغةً صحيحة، فلا تختلق أي وقائع أو أرقام أو تواريخ، بل ابدأ ردك بالسطر ${NEED_FILES_MARKER} ثم قائمة <ul> بالمستندات المطلوبة وسبب الحاجة لكل منها، ولا تكتب شيئاً غيرها. أما إن كانت المعلومات المتاحة كافية فصِغ المطلوب مباشرة.`;

export default function MemoAiPanel({ caseData, memoTypeLabel, editorHtml, buildDraftPrompt, onInsert, onReplace }: {
  caseData: any;
  memoTypeLabel: string;
  editorHtml: string;
  /** برومبت المسودة الكاملة لنوع المذكرة الحالي */
  buildDraftPrompt: () => string;
  onInsert: (html: string) => void;
  onReplace: (html: string) => void;
}) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<AiResult[]>([]);
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const caseContext = () => `بيانات القضية:
- العنوان: ${caseData?.title || "-"}
- الرقم: ${caseData?.caseNumber || "-"}
- المحكمة: ${caseData?.courtName || "-"} / الدائرة: ${caseData?.courtCircle || "-"}
- المدعي: ${caseData?.plaintiffName || "-"}
- المدعى عليه: ${caseData?.defendantName || caseData?.opponentName || "-"}
- صفة موكلنا: ${caseData?.clientRole === "DEFENDANT" ? "مدعى عليه" : "مدعي"}
- الموضوع: ${caseData?.caseSubject || "-"}
- الملخص: ${caseData?.summary || "-"}`;

  const pushError = (request: string, message: string) =>
    setResults((r) => [{ id: Math.random().toString(36).slice(2), request, prompt: "", html: message, error: true }, ...r]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    const next = [...attachments];
    try {
      for (const file of Array.from(files)) {
        if (next.length >= MAX_FILES) throw new Error(`الحد الأقصى ${MAX_FILES} مرفقات في المرة الواحدة.`);
        const total = next.reduce((s, a) => s + a.size, 0) + file.size;
        if (total > MAX_TOTAL_BYTES) throw new Error(`حجم المرفقات يتجاوز ${formatSize(MAX_TOTAL_BYTES)} — احذف بعضها أو أرفق ملفات أصغر.`);
        next.push(await toAttachment(file));
      }
    } catch (err: any) {
      pushError("إرفاق ملفات", err?.message || "تعذّر قراءة الملف.");
    } finally {
      setAttachments(next);
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const run = async (request: string, prompt: string) => {
    if (busy) return;
    setBusy(true);
    const id = Math.random().toString(36).slice(2);
    try {
      const fullPrompt = prompt + "\n" + attachmentRules(attachments.map((a) => a.name));
      const raw = await askAi(fullPrompt, attachments);
      const needsFiles = raw.includes(NEED_FILES_MARKER);
      const html = needsFiles ? raw.replace(NEED_FILES_MARKER, "").trim() : raw;
      setResults((r) => [{ id, request, prompt, html, needsFiles }, ...r]);
    } catch (err: any) {
      setResults((r) => [{ id, request, prompt, html: err?.message || "تعذّر الاتصال بخدمة الذكاء الاصطناعي.", error: true }, ...r]);
    } finally {
      setBusy(false);
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const ask = (request: string, usesDraft = false) => {
    const draft = htmlToText(editorHtml).trim();
    if (usesDraft && !draft) {
      pushError(request, "المحرر فارغ — اكتب نصاً أولاً ثم اطلب تحسينه.");
      return;
    }
    const prompt = `أنت مستشار قانوني ومحامٍ خبير في الأنظمة القضائية السعودية، تساعد في كتابة «${memoTypeLabel}».
${caseContext()}
${draft ? `\nنص المحرر الحالي:\n"""\n${draft.slice(0, 6000)}\n"""\n` : ""}
الطلب: ${request}

أجب بصيغة HTML منسّقة (<p> و<h3> و<ul><li> و<strong>) بلا <html> أو <body>، وبلغة عربية فصحى قانونية، وبدون مقدمات أو تعليقات خارج النص المطلوب.`;
    void run(request, prompt);
  };

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    ask(text, /المحرر|النص الحالي|حسّن|راجع|دقق|دقّق/.test(text));
  };

  const copy = async (r: AiResult) => {
    try {
      await navigator.clipboard.writeText(htmlToText(r.html));
      setCopiedId(r.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* الحافظة قد تكون محجوبة — لا يضر */ }
  };

  const disabled = busy || reading;

  return (
    <aside className="flex flex-col rounded-2xl border border-purple-100 bg-gradient-to-b from-purple-50/60 to-white overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
      <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => addFiles(e.target.files)} />

      <div className="px-4 py-3 border-b border-purple-100 flex items-center gap-2">
        <span className="h-8 w-8 rounded-lg bg-purple-600 text-white flex items-center justify-center"><Sparkles size={16} /></span>
        <div>
          <h3 className="text-sm font-bold text-[#133B2E]">المساعد الذكي</h3>
          <p className="text-[11px] text-gray-500">النتائج تظهر هنا — أدرجها في المحرر متى شئت</p>
        </div>
      </div>

      <div className="p-3 space-y-2 border-b border-purple-100">
        <button onClick={() => run(`مسودة كاملة — ${memoTypeLabel}`, buildDraftPrompt())} disabled={disabled}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold transition disabled:opacity-50">
          <Sparkles size={15} /> صياغة {memoTypeLabel} كاملة
        </button>

        {/* مرفقات يعتمد عليها المساعد */}
        <button onClick={() => fileInput.current?.click()} disabled={disabled}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-purple-300 bg-white text-purple-700 hover:bg-purple-50 text-xs font-bold transition disabled:opacity-50">
          {reading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
          إرفاق مستندات يعتمد عليها المساعد
        </button>
        {attachments.length > 0 ? (
          <div className="space-y-1.5">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs">
                <FileText size={13} className="shrink-0 text-purple-600" />
                <span className="flex-1 truncate font-medium text-gray-800" title={a.name}>{a.name}</span>
                <span className="shrink-0 text-[10px] text-gray-400">{formatSize(a.size)}</span>
                <button onClick={() => setAttachments((all) => all.filter((x) => x.id !== a.id))} disabled={busy}
                  aria-label={`إزالة ${a.name}`} title="إزالة" className="shrink-0 text-gray-400 hover:text-red-500">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-[10px] text-gray-400">PDF، صور، Word، نص — حتى {MAX_FILES} ملفات و{formatSize(MAX_TOTAL_BYTES)}</p>
        )}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        {busy && (
          <div className="flex items-center gap-2 text-xs text-purple-700 bg-white border border-purple-100 rounded-xl p-3">
            <Loader2 size={14} className="animate-spin" /> {attachments.length ? "جاري قراءة المرفقات والصياغة..." : "جاري الصياغة..."}
          </div>
        )}
        {!busy && results.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-8 leading-relaxed">
            اكتب طلبك بالأسفل، وأرفق المستندات التي يعتمد عليها المساعد.<br />المحرر يبقى كما تكتبه حتى تختار الإدراج.
          </p>
        )}
        {results.map((r) => (
          <div key={r.id} className={`rounded-xl border bg-white overflow-hidden ${r.error ? "border-red-200" : r.needsFiles ? "border-amber-300" : "border-gray-200"}`}>
            <div className={`flex items-center justify-between gap-2 px-3 py-1.5 border-b ${r.needsFiles ? "bg-amber-50 border-amber-100" : "bg-gray-50 border-gray-100"}`}>
              <span className="text-[11px] font-bold text-gray-600 truncate">{r.request}</span>
              <button onClick={() => setResults((all) => all.filter((x) => x.id !== r.id))} title="حذف"
                className="text-gray-400 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>
            </div>
            {r.error ? (
              <p className="p-3 text-xs text-red-600">{r.html}</p>
            ) : r.needsFiles ? (
              <>
                <div className="px-3 pt-3 text-xs font-bold text-amber-800 flex items-center gap-1.5">
                  <Paperclip size={13} /> المساعد يحتاج هذه المستندات ليصيغ بدقة:
                </div>
                <div className="p-3 text-xs leading-relaxed text-gray-800 [&_ul]:list-disc [&_ul]:pr-4 [&_li]:mb-1"
                  dangerouslySetInnerHTML={{ __html: r.html }} />
                <div className="flex gap-1 px-2 py-1.5 border-t border-amber-100">
                  <button onClick={() => fileInput.current?.click()} disabled={disabled}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-purple-700 hover:bg-purple-50 disabled:opacity-50">
                    <Paperclip size={12} /> إرفاق ملفات
                  </button>
                  <button onClick={() => run(r.request, r.prompt)} disabled={disabled || !r.prompt}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-[#133B2E] hover:bg-gray-100 disabled:opacity-50">
                    <RotateCcw size={12} /> إعادة الطلب بالمرفقات
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 text-xs leading-relaxed text-gray-800 max-h-64 overflow-y-auto prose-sm [&_h3]:font-bold [&_h3]:mt-2 [&_ul]:list-disc [&_ul]:pr-4"
                  dangerouslySetInnerHTML={{ __html: r.html }} />
                <div className="flex gap-1 px-2 py-1.5 border-t border-gray-100">
                  <button onClick={() => onInsert(r.html)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-[#133B2E] hover:bg-gray-100">
                    <FilePlus2 size={12} /> إدراج في المحرر
                  </button>
                  <button onClick={() => onReplace(r.html)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-orange-700 hover:bg-orange-50">
                    <Replace size={12} /> استبدال المحتوى
                  </button>
                  <button onClick={() => copy(r)}
                    className="mr-auto flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-gray-500 hover:bg-gray-100">
                    {copiedId === r.id ? <Check size={12} /> : <Copy size={12} />} نسخ
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="p-3 border-t border-purple-100 bg-white">
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="اكتب طلبك… مثل: أضف دفعاً بعدم الاختصاص"
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-300" />
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={disabled} aria-label="إرفاق ملفات" title="إرفاق ملفات"
              className="h-9 w-10 shrink-0 rounded-xl border border-purple-200 text-purple-700 hover:bg-purple-50 flex items-center justify-center disabled:opacity-40">
              <Paperclip size={15} />
            </button>
            <button type="submit" disabled={disabled || !input.trim()} aria-label="إرسال"
              className="h-9 w-10 shrink-0 rounded-xl bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center disabled:opacity-40">
              <SendHorizontal size={16} className="-scale-x-100" />
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}
