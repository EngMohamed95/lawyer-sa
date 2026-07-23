import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Loader2, Sparkles, FileText, CheckCircle2, ChevronRight, File } from "lucide-react";

interface AiMemoDrafterModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: any;
  onDraftCompleted: (title: string, type: string, content: string) => void;
}

export function AiMemoDrafterModal({ isOpen, onClose, caseData, onDraftCompleted }: AiMemoDrafterModalProps) {
  const [loading, setLoading] = useState(false);
  const [draftType, setDraftType] = useState<"LAWSUIT" | "MEMO">("LAWSUIT");
  const [userPrompt, setUserPrompt] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const allDocuments = [
    ...(caseData?.documents || []),
    ...(caseData?.clientDocuments || [])
  ];

  const handleToggleDoc = (docId: string) => {
    setSelectedDocs(prev => 
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    setStatusMessage("جاري إعداد محركات الذكاء الاصطناعي...");

    try {
      const aiProvider = localStorage.getItem("sys_aiProvider") || "GEMINI";
      const aiApiKey = localStorage.getItem("sys_aiApiKey") || "";
      const aiModel = localStorage.getItem("sys_aiModel") || (aiProvider === "GEMINI" ? "gemini-flash-latest" : "llama-3.3-70b-versatile");

      const apiKeyToUse = aiApiKey || import.meta.env.VITE_GEMINI_API_KEY || "";
      if (!apiKeyToUse && aiProvider === "GEMINI") {
        throw new Error("لم يتم تكوين مفتاح Gemini API Key. الرجاء إدخاله في شاشة الإعدادات.");
      }

      setStatusMessage("جاري تحليل ملف القضية والمرفقات المحددة...");
      
      // Compile documents content for context
      const selectedDocsData = allDocuments.filter(d => selectedDocs.includes(d.id));
      let selectedDocsContext = "";
      if (selectedDocsData.length > 0) {
        selectedDocsContext = selectedDocsData.map(d => 
          `- المستند: ${d.name} | النوع: ${d.type} | ملاحظات: ${d.notes || "لا يوجد"} | المحتوى النصي المستخرج: ${d.content || "لا يوجد نص مستخرج، اعتمد على العنوان والملاحظات"}`
        ).join("\n");
      } else {
        selectedDocsContext = "لم يتم تحديد أي مستندات مرفقة كأدلة.";
      }

      setStatusMessage("جاري صياغة النص القانوني وتفنيد الحجج البلاغية...");

      let systemPrompt = `أنت مستشار قانوني ومحامٍ خبير في الأنظمة واللوائح القضائية السعودية والعربية.
وظيفتك هي صياغة مذكرات قانونية بأسلوب احترافي ورصين.
بيانات القضية الحالية:
- عنوان القضية: ${caseData.title}
- رقم القضية: ${caseData.caseNumber}
- المحكمة: ${caseData.courtName || "غير محدد"}
- الدائرة القضائية: ${caseData.courtCircle || "غير محدد"}
- المدعي: ${caseData.plaintiffName || caseData.client?.fullName || "غير محدد"}
- المدعى عليه: ${caseData.defendantName || caseData.opponentName || "غير محدد"}
- موضوع القضية العام: ${caseData.caseSubject || caseData.summary || "غير محدد"}`;

      if (draftType === "LAWSUIT") {
        systemPrompt += `\nالمطلوب: صياغة "صحيفة دعوى" (مذكرة ادعاء).
الوقائع والطلبات المدخلة من المستخدم:
${userPrompt}

توجيهات الصياغة لصحيفة الدعوى:
1. ابدأ بالبسملة والتحية والتوجه إلى فضيلة رئيس وأعضاء الدائرة القضائية الموقرين.
2. اذكر أطراف الدعوى بوضوح (المدعي والمدعى عليه وصفاتهم).
3. اعرض الوقائع بشكل متسلسل ومنطقي بناءً على ما أدخله المستخدم وبيانات القضية.
4. اذكر الأسانيد الشرعية والنظامية المناسبة للموضوع (حسب القوانين السارية).
5. لخص الطلبات النهائية للمدعي بوضوح ودقة (مثل إلزام المدعى عليه بدفع المبلغ، إلخ).
6. اختم بعبارة "والله يحفظكم ويرعاكم، مقدمه لفضيلتكم..."
7. صِغ المذكرة بلغة عربية فصحى قانونية بليغة وبصيغة HTML منسقة (مثل استخدام فقرات <p>، وعناوين <h3>، وقوائم <ul> <li>، ونصوص عريضة <strong>) بدون كود هيكلي كامل <html> أو <body>، فقط المحتوى الداخلي المنسق.`;
      } else {
        systemPrompt += `\nالمطلوب: صياغة "مذكرة رد" (لائحة رد على الدعوى).
نقاط الرد والدفوع المدخلة من المستخدم:
${userPrompt}

المستندات والمرفقات المحددة للتحليل كأدلة دفاع:
${selectedDocsContext}

توجيهات الصياغة لمذكرة الرد:
1. ابدأ بالبسملة والتوجه إلى فضيلة رئيس وأعضاء الدائرة القضائية الموقرين.
2. اذكر أطراف الدعوى وعلاقتهم بموضوع الرد.
3. قم بالرد على وقائع الادعاء نقطة بنقطة بأسلوب قانوني مفند ومقنع.
4. اذكر وقائع الدفاع والأدلة المستندة إلى المرفقات التي تم تحليلها (مثل العقود، الإيصالات، إلخ) ودلالتها القانونية.
5. ادعم الدفوع بالأسانيد الشرعية والنظامية المناسبة.
6. حدد الطلبات الختامية بوضوح (مثل: رد الدعوى، إلزام المدعي بالتعويض أو المصاريف القضائية، إلخ).
7. اختم بعبارة مناسبة ومقدمه.
8. صِغ المذكرة بلغة عربية فصحى قانونية بليغة وبصيغة HTML منسقة (مثل استخدام فقرات <p>، وعناوين <h3>، وقوائم <ul> <li>، ونصوص عريضة <strong>) بدون كود هيكلي كامل <html> أو <body>، فقط المحتوى الداخلي المنسق.`;
      }

      let responseText = "";

      if (aiProvider === "GEMINI") {
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKeyToUse}`;
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: systemPrompt }]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 3000
            }
          })
        });

        const dataJson = await response.json();
        if (dataJson.error) {
          throw new Error(dataJson.error.message || "خطأ في معالجة طلب Gemini");
        }
        responseText = dataJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else {
        // Groq API
        const API_URL = "https://api.groq.com/openai/v1/chat/completions";
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKeyToUse}`
          },
          body: JSON.stringify({
            model: aiModel,
            messages: [
              { role: "system", content: "أنت خبير صياغة قانونية وبلاغة قضائية." },
              { role: "user", content: systemPrompt }
            ],
            temperature: 0.7,
            max_tokens: 2500
          })
        });

        const dataJson = await response.json();
        if (dataJson.error) {
          throw new Error(dataJson.error.message || "خطأ في معالجة طلب Groq");
        }
        responseText = dataJson.choices?.[0]?.message?.content || "";
      }

      if (!responseText) {
        throw new Error("لم نتمكن من الحصول على رد من محرك الذكاء الاصطناعي");
      }

      setResult(responseText);
    } catch (error: any) {
      console.error(error);
      alert("حدث خطأ أثناء صياغة المذكرة: " + error.message);
    } finally {
      setLoading(false);
      setStatusMessage("");
    }
  };

  const handleApprove = () => {
    if (!result) return;
    const defaultTitle = draftType === "LAWSUIT" 
      ? `صحيفة دعوى - ${caseData.title}` 
      : `مذكرة رد - ${caseData.title}`;
    const typeValue = draftType === "LAWSUIT" ? "LAWSUIT" : "MEMO";
    onDraftCompleted(defaultTitle, typeValue, result);
    handleClose();
  };

  const handleClose = () => {
    setUserPrompt("");
    setSelectedDocs([]);
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700 text-xl font-bold">
            <Sparkles className="w-5 h-5 text-purple-600 animate-pulse" />
            الصياغة الذكية للمذكرات القانونية (AI)
          </DialogTitle>
          <DialogDescription className="text-right">
            قم بإعداد صحيفة الدعوى أو مذكرة الرد بشكل آلي وبأسلوب قانوني رفيع بالاعتماد على بيانات القضية والمرفقات المتاحة.
          </DialogDescription>
        </DialogHeader>

        {!result && !loading && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">نوع المذكرة المطلوبة</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`p-3 rounded-xl border-2 text-center transition font-bold ${draftType === "LAWSUIT" ? "border-purple-600 bg-purple-50 text-purple-900" : "border-gray-200 hover:border-purple-200"}`}
                  onClick={() => setDraftType("LAWSUIT")}
                >
                  تقديم مذكرة ادعاء (صحيفة الدعوى)
                </button>
                <button
                  type="button"
                  className={`p-3 rounded-xl border-2 text-center transition font-bold ${draftType === "MEMO" ? "border-purple-600 bg-purple-50 text-purple-900" : "border-gray-200 hover:border-purple-200"}`}
                  onClick={() => setDraftType("MEMO")}
                >
                  تقديم مذكرة رد (لائحة رد)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">
                {draftType === "LAWSUIT" ? "موضوع الدعوى وطلبات المدعي الأساسية" : "نقاط الرد والدفوع الأساسية"}
              </label>
              <textarea
                required
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 leading-relaxed"
                placeholder={draftType === "LAWSUIT" ? "مثال: عدم دفع قيمة البضاعة الموردة ومقدارها ٥٠ ألف ريال، مع المطالبة بالتعويض وتكاليف المحاماة..." : "مثال: تم سداد جزء من المبلغ بموجب إيصال الحوالة، والباقي سقط بالتقادم المانع لسماع الدعوى..."}
                value={userPrompt}
                onChange={e => setUserPrompt(e.target.value)}
              />
            </div>

            {draftType === "MEMO" && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#0A192F] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-purple-600" />
                  مرفقات ومستندات القضية (اختر لتحليلها بالـ AI)
                </label>
                {allDocuments.length === 0 ? (
                  <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg border border-dashed text-center">لا يوجد مستندات مرفوعة في القضية لاستخدامها</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50 p-2 bg-gray-50/50">
                    {allDocuments.map((doc: any) => (
                      <label key={doc.id} className="flex items-center gap-3 py-2 px-1 hover:bg-purple-50/20 cursor-pointer transition text-xs select-none">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          checked={selectedDocs.includes(doc.id)}
                          onChange={() => handleToggleDoc(doc.id)}
                        />
                        <span className="font-semibold text-gray-800 truncate max-w-[250px]">{doc.name}</span>
                        <span className="text-gray-400">({doc.type})</span>
                        {doc.content ? (
                          <span className="mr-auto text-[9px] bg-green-100 text-green-700 font-bold px-1 py-0.5 rounded">محتوى نصي متوفر</span>
                        ) : (
                          <span className="mr-auto text-[9px] bg-gray-200 text-gray-500 px-1 py-0.5 rounded">بيانات فقط</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={handleClose}>إلغاء</Button>
              <Button 
                type="button" 
                onClick={handleGenerate} 
                disabled={!userPrompt.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold"
              >
                <Sparkles className="ml-2 h-4 w-4" /> صياغة بالذكاء الاصطناعي
              </Button>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-purple-700">
            <Loader2 className="h-10 w-10 animate-spin text-purple-600" />
            <p className="font-bold text-sm animate-pulse">{statusMessage}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4 py-4">
            <div className="bg-purple-50/50 border border-purple-100 p-3 rounded-lg flex items-center gap-2 text-xs font-bold text-purple-900">
              <CheckCircle2 className="h-4 w-4 text-purple-600 shrink-0" />
              تم الانتهاء من صياغة المذكرة المقترحة بنجاح! يمكنك مراجعتها أدناه واعتمادها.
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#0A192F]">معاينة المسودة المولدة</label>
              <div 
                className="bg-white border border-gray-200 p-5 rounded-lg max-h-96 overflow-y-auto text-sm leading-relaxed font-serif text-gray-800 shadow-inner"
                dangerouslySetInnerHTML={{ __html: result }}
              />
            </div>

            <div className="flex justify-between items-center border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setResult(null)}>
                <ChevronRight className="ml-1 h-4 w-4" /> تعديل المدخلات وإعادة الصياغة
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>إلغاء</Button>
                <Button type="button" onClick={handleApprove} className="bg-purple-600 hover:bg-purple-700 text-white font-bold">
                  اعتماد ونسخ للمحرر
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
