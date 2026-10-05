/**
 * لوحة الذكاء الاصطناعي بجوار محرر المذكرات.
 * النتائج تظهر هنا أولاً، ولا تمس المحرر إلا عند «إدراج» أو «استبدال» —
 * فلا يضيع ما كتبه المحامي بضغطة خاطئة.
 */

import { useRef, useState } from "react";
import { Check, Copy, Database, FilePlus2, Loader2, Replace, SendHorizontal, Sparkles, Trash2 } from "lucide-react";
import { callGemini, callGroq, readAiSettings } from "../lib/aiProxy";

interface AiResult {
  id: string;
  request: string;
  html: string;
  error?: boolean;
}

const QUICK_ACTIONS: { label: string; prompt: string; usesDraft?: boolean }[] = [
  { label: "صياغة الوقائع", prompt: "صِغ فقرة «الوقائع» لهذه القضية بشكل متسلسل ومنطقي." },
  { label: "الأسانيد النظامية", prompt: "اذكر الأسانيد الشرعية والنظامية السعودية المناسبة لموضوع هذه القضية مع الإشارة للمواد متى أمكن." },
  { label: "الطلبات الختامية", prompt: "صِغ فقرة «الطلبات» الختامية بوضوح ودقة بما يناسب صفة موكلنا." },
  { label: "تحسين الصياغة", prompt: "أعد صياغة نص المحرر الحالي بلغة قانونية أرصن مع الحفاظ على المضمون.", usesDraft: true },
  { label: "تدقيق لغوي", prompt: "دقّق نص المحرر الحالي لغوياً ونحوياً وأعده مصحّحاً مع الحفاظ على التنسيق.", usesDraft: true },
];

const stripCodeFence = (text: string) =>
  text.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();

const htmlToText = (html: string) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.innerText;
};

async function askAi(prompt: string): Promise<string> {
  const settings = readAiSettings();
  const text = settings.provider === "GEMINI"
    ? await callGemini([{ role: "user", parts: [{ text: prompt }] }], { temperature: 0.7, maxOutputTokens: 3000 }, settings)
    : await callGroq([{ role: "user", content: prompt }], settings);
  return stripCodeFence(text);
}

export default function MemoAiPanel({ caseData, memoTypeLabel, editorHtml, buildDraftPrompt, onInsert, onReplace, onFillTemplate }: {
  caseData: any;
  memoTypeLabel: string;
  editorHtml: string;
  /** برومبت المسودة الكاملة لنوع المذكرة الحالي */
  buildDraftPrompt: () => string;
  onInsert: (html: string) => void;
  onReplace: (html: string) => void;
  onFillTemplate: () => void;
}) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<AiResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const caseContext = () => `بيانات القضية:
- العنوان: ${caseData?.title || "-"}
- الرقم: ${caseData?.caseNumber || "-"}
- المحكمة: ${caseData?.courtName || "-"} / الدائرة: ${caseData?.courtCircle || "-"}
- المدعي: ${caseData?.plaintiffName || "-"}
- المدعى عليه: ${caseData?.defendantName || caseData?.opponentName || "-"}
- صفة موكلنا: ${caseData?.clientRole === "DEFENDANT" ? "مدعى عليه" : "مدعي"}
- الموضوع: ${caseData?.caseSubject || "-"}
- الملخص: ${caseData?.summary || "-"}`;

  const run = async (request: string, prompt: string) => {
    if (busy) return;
    setBusy(true);
    const id = Math.random().toString(36).slice(2);
    try {
      const html = await askAi(prompt);
      setResults((r) => [{ id, request, html }, ...r]);
    } catch (err: any) {
      setResults((r) => [{ id, request, html: err?.message || "تعذّر الاتصال بخدمة الذكاء الاصطناعي.", error: true }, ...r]);
    } finally {
      setBusy(false);
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const ask = (request: string, usesDraft = false) => {
    const draft = htmlToText(editorHtml).trim();
    if (usesDraft && !draft) {
      setResults((r) => [{ id: Math.random().toString(36).slice(2), request, html: "المحرر فارغ — اكتب نصاً أولاً ثم اطلب تحسينه.", error: true }, ...r]);
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

  return (
    <aside className="flex flex-col rounded-2xl border border-purple-100 bg-gradient-to-b from-purple-50/60 to-white overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
      <div className="px-4 py-3 border-b border-purple-100 flex items-center gap-2">
        <span className="h-8 w-8 rounded-lg bg-purple-600 text-white flex items-center justify-center"><Sparkles size={16} /></span>
        <div>
          <h3 className="text-sm font-bold text-[#133B2E]">المساعد الذكي</h3>
          <p className="text-[11px] text-gray-500">النتائج تظهر هنا — أدرجها في المحرر متى شئت</p>
        </div>
      </div>

      <div className="p-3 space-y-2 border-b border-purple-100">
        <button onClick={() => run(`مسودة كاملة — ${memoTypeLabel}`, buildDraftPrompt())} disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold transition disabled:opacity-50">
          <Sparkles size={15} /> صياغة {memoTypeLabel} كاملة
        </button>
        <button onClick={onFillTemplate} disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 text-xs font-bold transition disabled:opacity-50">
          <Database size={14} /> تعبئة نموذج جاهز ببيانات القضية
        </button>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {QUICK_ACTIONS.map((a) => (
            <button key={a.label} onClick={() => ask(a.prompt, a.usesDraft)} disabled={busy}
              className="px-2.5 py-1 rounded-full border border-purple-200 bg-white text-[11px] font-bold text-purple-700 hover:bg-purple-50 transition disabled:opacity-50">
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        {busy && (
          <div className="flex items-center gap-2 text-xs text-purple-700 bg-white border border-purple-100 rounded-xl p-3">
            <Loader2 size={14} className="animate-spin" /> جاري الصياغة...
          </div>
        )}
        {!busy && results.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-8 leading-relaxed">
            اختر إجراءً من الأعلى أو اكتب طلبك بالأسفل.<br />المحرر على اليمين يبقى كما تكتبه.
          </p>
        )}
        {results.map((r) => (
          <div key={r.id} className={`rounded-xl border bg-white overflow-hidden ${r.error ? "border-red-200" : "border-gray-200"}`}>
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
              <span className="text-[11px] font-bold text-gray-600 truncate">{r.request}</span>
              <button onClick={() => setResults((all) => all.filter((x) => x.id !== r.id))} title="حذف"
                className="text-gray-400 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>
            </div>
            {r.error ? (
              <p className="p-3 text-xs text-red-600">{r.html}</p>
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
          <button type="submit" disabled={busy || !input.trim()} aria-label="إرسال"
            className="h-10 w-10 shrink-0 rounded-xl bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center disabled:opacity-40">
            <SendHorizontal size={16} className="-scale-x-100" />
          </button>
        </div>
      </form>
    </aside>
  );
}
