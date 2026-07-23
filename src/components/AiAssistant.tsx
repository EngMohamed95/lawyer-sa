import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, X, Bot, User, Loader2, Sparkles, MinusCircle, Maximize2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { collection, getDocs, collectionGroup, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

export function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<{role: 'assistant' | 'user', content: string}[]>([
    { role: 'assistant', content: "مرحباً بك! أنا مساعدك القانوني الذكي. كيف يمكنني مساعدتك اليوم في إدارة قضاياك ومكتبك؟" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Archive and metadata states for client-side RAG
  const [documents, setDocuments] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");

  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";

  // Load latest lawyer archive files, cases, and clients
  const fetchWorkspaceData = async () => {
    try {
      const storedLawyerId = localStorage.getItem("lawyerId");
      const userRole = localStorage.getItem("userRole");
      if (!storedLawyerId) return;

      const docsQ = collectionGroup(db, "documents");
      const casesQ = userRole === "SUPER_ADMIN"
        ? collection(db, "cases")
        : query(collection(db, "cases"), where("lawyerId", "==", storedLawyerId));
      const clientsQ = userRole === "SUPER_ADMIN"
        ? collection(db, "clients")
        : query(collection(db, "clients"), where("lawyerId", "==", storedLawyerId));

      const [docsSnap, casesSnap, clientsSnap] = await Promise.all([
        getDocs(docsQ),
        getDocs(casesQ),
        getDocs(clientsQ)
      ]);

      const clientsList = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const casesList = casesSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const docsList = docsSnap.docs
        .map(doc => {
          const d = doc.data() as any;
          const parentId = doc.ref.parent.parent?.id;
          const parentPath = doc.ref.parent.parent?.path || "";
          const parentType = parentPath.split('/')[0];
          return { id: doc.id, fullPath: doc.ref.path, ...d, parentId, parentType };
        })
        .filter(d => userRole === "SUPER_ADMIN" || d.lawyerId === storedLawyerId);

      setClients(clientsList);
      setCases(casesList);
      setDocuments(docsList);
      setIsDataLoaded(true);
    } catch (error) {
      console.error("Error fetching workspace data for AI Assistant:", error);
    }
  };

  useEffect(() => {
    if (isOpen && !isDataLoaded) {
      fetchWorkspaceData();
    }
  }, [isOpen, isDataLoaded]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Arabic normalization to ensure flexible search matches
  const normalizeArabic = (str: string) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[ًٌٍَُِّ]/g, '');
  };

  // Search through document titles, notes, contents and parents
  const searchRelevantDocs = (msg: string) => {
    if (!msg.trim()) return [];
    
    const normalizedMsg = normalizeArabic(msg);
    const words = normalizedMsg
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 2 && !["على", "في", "من", "عن", "الى", "هذا", "هذه", "التي", "الذي", "انه", "انها", "لقد", "كان", "كانت"].includes(w));

    if (words.length === 0) return [];

    const scoredDocs = documents.map(doc => {
      let score = 0;
      const docName = normalizeArabic(doc.name || "");
      const docNotes = normalizeArabic(doc.notes || "");
      const docContent = normalizeArabic(doc.content || "");
      const docType = normalizeArabic(doc.type || "");

      let parentName = "";
      if (doc.parentType === "clients") {
        const client = clients.find(c => c.id === doc.parentId);
        if (client) parentName = normalizeArabic(client.fullName || client.name || "");
      } else if (doc.parentType === "cases") {
        const kase = cases.find(c => c.id === doc.parentId);
        if (kase) {
          parentName = normalizeArabic(kase.title || kase.subject || "");
          const client = clients.find(c => c.id === kase.clientId);
          if (client) parentName += " " + normalizeArabic(client.fullName || client.name || "");
        }
      }

      words.forEach(word => {
        if (docName.includes(word)) score += 15;
        if (docNotes.includes(word)) score += 8;
        if (docContent.includes(word)) score += 4;
        if (docType.includes(word)) score += 5;
        if (parentName.includes(word)) score += 10;
      });

      return { doc, score };
    });

    return scoredDocs
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.doc)
      .slice(0, 4);
  };

  // Search clients and cases for generic inquiries
  const searchRelevantCasesAndClients = (msg: string) => {
    if (!msg.trim()) return { matchedClients: [], matchedCases: [] };

    const normalizedMsg = normalizeArabic(msg);
    const words = normalizedMsg
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 2 && !["على", "في", "من", "عن", "الى", "هذا", "هذه", "التي", "الذي", "انه", "انها", "لقد", "كان", "كانت"].includes(w));

    if (words.length === 0) return { matchedClients: [], matchedCases: [] };

    const matchedClients = clients.filter(c => {
      const name = normalizeArabic(c.fullName || c.name || "");
      const phone = normalizeArabic(c.phone || "");
      return words.some(w => name.includes(w) || phone.includes(w));
    });

    const matchedCases = cases.filter(c => {
      const title = normalizeArabic(c.title || c.subject || "");
      const num = normalizeArabic(c.caseNumber || "");
      return words.some(w => title.includes(w) || num.includes(w));
    });

    return { matchedClients, matchedCases };
  };

  const handleCaseAction = async (actionType: "loopholes" | "defense" | "draft") => {
    if (!selectedCaseId) return;
    const activeCase = cases.find(c => c.id === selectedCaseId);
    if (!activeCase) return;

    let displayMsg = "";
    let systemPromptInstruction = "";

    if (actionType === "loopholes") {
      displayMsg = `🔍 تحليل ثغرات ووقائع قضية: ${activeCase.title || activeCase.subject || ""}`;
      systemPromptInstruction = `المحامي طلب "تحليل الثغرات والوقائع" لهذه القضية.
بناءً على تفاصيل القضية والمستندات المرفقة، قم بتحليل دقيق ومفصل للوقائع واستخراج الثغرات القانونية المحتملة في القضية (مثل بطلان الإجراءات، الدفوع الشكلية والموضوعية، التناقض في أقوال الشهود أو المحاضر إن وجدت).`;
    } else if (actionType === "defense") {
      displayMsg = `🛡️ استراتيجية الدفاع لقضية: ${activeCase.title || activeCase.subject || ""}`;
      systemPromptInstruction = `المحامي طلب "استراتيجية الدفاع" لهذه القضية.
يرجى إعداد خطة دفاع استراتيجية متكاملة، تشمل ترتيب تقديم الدفوع، والطلبات الجوهرية التي يجب تقديمها للمحكمة، وكيفية دحض ادعاءات الخصم بناءً على المستندات المتوفرة.`;
    } else if (actionType === "draft") {
      displayMsg = `✍️ صياغة الدفوع القانونية لقضية: ${activeCase.title || activeCase.subject || ""}`;
      systemPromptInstruction = `المحامي طلب "صياغة الدفوع القانونية" لهذه القضية.
يرجى صياغة الدفوع القانونية الشكلية والموضوعية المناسبة لنوع القضية (مثلاً: الدفع بانتفاء الركن المادي/المعنوي، الدفع بالتقادم، الدفع ببطلان القبض والتفتيش، أو أي دفع قانوني مصري ملائم) بأسلوب صياغة قضائية رصينة تناسب المحاكم المصرية.`;
    }

    await handleSend(displayMsg, systemPromptInstruction);
  };

  const handleSend = async (customMsg?: string, actionInstruction?: string) => {
    const textToSend = customMsg || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg = textToSend.trim();
    if (!customMsg) {
      setInput("");
    }
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

      // 1. Generate lightweight global summaries for the system prompt index
      const clientsSummaryIndex = clients.map(c => `- الموكل: ${c.fullName || c.name || "غير معروف"} (هاتف: ${c.phone || "غير مسجل"})`).join("\n");
      
      const casesSummaryIndex = cases.map(c => {
        const client = clients.find(cl => cl.id === c.clientId);
        return `- القضية: ${c.title || c.subject} | رقم: ${c.caseNumber || "غير مسجل"} | موكل: ${client ? (client.fullName || client.name) : "غير معروف"} | حالة: ${c.status || "نشطة"}`;
      }).join("\n");

      const docsSummaryIndex = documents.map(d => {
        let parentInfo = "";
        if (d.parentType === "clients") {
          const client = clients.find(c => c.id === d.parentId);
          if (client) parentInfo = ` (ملف الموكل: ${client.fullName || client.name})`;
        } else if (d.parentType === "cases") {
          const kase = cases.find(c => c.id === d.parentId);
          if (kase) parentInfo = ` (ملف القضية: ${kase.title || kase.subject || ""})`;
        }
        return `- مستند: ${d.name} | نوع: ${d.type}${parentInfo}`;
      }).join("\n");

      // 2. Perform RAG keyword match for detailed document contents
      let matchedDocs = searchRelevantDocs(userMsg);
      if (selectedCaseId) {
        const activeCase = cases.find(c => c.id === selectedCaseId);
        const caseDocs = documents.filter(d => 
          (d.parentType === "cases" && d.parentId === selectedCaseId) ||
          (activeCase && d.parentType === "clients" && d.parentId === activeCase.clientId)
        );
        const matchedIds = new Set(matchedDocs.map(d => d.id));
        caseDocs.forEach(d => {
          if (!matchedIds.has(d.id)) {
            matchedDocs.push(d);
          }
        });
      }

      let detailedDocsContext = "";
      
      if (matchedDocs.length > 0) {
        detailedDocsContext += `\nنصوص المستندات الكاملة ذات الصلة بسؤال المستخدم أو القضية الحالية:\n`;
        matchedDocs.forEach((d, idx) => {
          let parentInfo = "";
          if (d.parentType === "clients") {
            const client = clients.find(c => c.id === d.parentId);
            if (client) parentInfo = `الموكل: ${client.fullName || client.name}`;
          } else if (d.parentType === "cases") {
            const kase = cases.find(c => c.id === d.parentId);
            if (kase) {
              parentInfo = `القضية: ${kase.title || kase.subject || ""}`;
              const client = clients.find(c => c.id === kase.clientId);
              if (client) parentInfo += ` (للموكل: ${client.fullName || client.name})`;
            }
          }
          
          detailedDocsContext += `[مستند ${idx + 1}] اسم الملف: ${d.name} | النوع: ${d.type} | ${parentInfo}\n`;
          if (d.notes) detailedDocsContext += `ملاحظات حول الملف: ${d.notes}\n`;
          if (d.content) {
            const truncatedContent = d.content.length > 2500 
              ? d.content.substring(0, 2500) + "... [تم تقصير النص لكبر الحجم]" 
              : d.content;
            detailedDocsContext += `محتوى النص المستخرج:\n"""\n${truncatedContent}\n"""\n`;
          }
          detailedDocsContext += `-------\n`;
        });
      }

      let selectedCaseContext = "";
      if (selectedCaseId) {
        const activeCase = cases.find(c => c.id === selectedCaseId);
        if (activeCase) {
          const client = clients.find(cl => cl.id === activeCase.clientId);
          selectedCaseContext = `
معلومات القضية النشطة التي حددها المحامي للتحليل والعمل عليها الآن:
- عنوان القضية: ${activeCase.title || activeCase.subject || "غير مسجل"}
- رقم القضية: ${activeCase.caseNumber || "غير مسجل"}
- المحكمة: ${activeCase.court || "غير مسجل"}
- نوع القضية: ${activeCase.caseType || "غير مسجل"}
- الخصم: ${activeCase.opponentName || "غير مسجل"}
- حالة القضية: ${activeCase.status || "غير مسجل"}
- تفاصيل إضافية/ملاحظات: ${activeCase.notes || "لا توجد ملاحظات"}
- الموكل المرتبط بالقضية: ${client ? (client.fullName || client.name) : "غير معروف"} (هاتف: ${client?.phone || "غير مسجل"})
`;
        }
      }

      const currencyCode = localStorage.getItem("sys_currency") || "SAR";
      const countryContext = currencyCode === "SAR" ? "المملكة العربية السعودية" : currencyCode === "EGP" ? "جمهورية مصر العربية" : "مكتبك القانوني";
      
      const systemPrompt = `أنت مساعد قانوني ذكي محترف تعمل داخل منصة "LawyerOS" لإدارة مكاتب المحاماة في ${countryContext}.
مهمتك هي مساعدة المحامي في تنظيم عمله، الإجابة على أسئلته القانونية بناءً على الملفات والقضايا والموكلين المتاحة في أرشيفه، وتقديم نصائح إدارية.
تحدث دائماً بلهجة مهنية محترمة باللغة العربية واعتمد في مراجعاتك وقوانينك على الأنظمة السارية في ${countryContext}.

إليك فهرس كامل بكافة محتويات قاعدة بيانات مكتب المحامي حالياً:

أولاً: قائمة جميع الموكلين بالمكتب:
${clientsSummaryIndex || "لا يوجد موكلين مسجلين حالياً."}

ثانياً: قائمة جميع القضايا بالمكتب:
${casesSummaryIndex || "لا يوجد قضايا مسجلة حالياً."}

ثالثاً: قائمة جميع المستندات والملفات المرفوعة:
${docsSummaryIndex || "لا يوجد مستندات مرفوعة حالياً."}
${selectedCaseContext ? `\nرابعاً: معلومات القضية النشطة المحددة من المحامي:\n${selectedCaseContext}` : ""}
${detailedDocsContext ? `\nخامساً: تفاصيل المستندات ذات الصلة بالقضية أو السؤال الحالي ومحتوياتها:\n${detailedDocsContext}` : ""}

تعليمات هامة جداً للرد:
1. اعتمد بشكل كامل ومباشر على البيانات والفهرس الموضحين أعلاه للإجابة على أسئلة المستخدم (مثل أسماء الموكلين، هواتفهم، أرقام القضايا، الحالات، تفاصيل الملفات).
2. إذا سأل المستخدم عن أسماء الموكلين، أو قائمة القضايا، أو عددها، استخرج الإجابة مباشرة من الفهرس أعلاه واذكرهم له بشكل منسق وجميل.
3. لا تخترع أو تدعي وجود موكلين أو قضايا أو مستندات غير مسجلة في الفهرس أعلاه.
4. عندما تقتبس معلومات من مستند معين، اذكر اسم المستند بوضوح.
${actionInstruction ? `\nتوجيه خاص للطلب الحالي:\n${actionInstruction}` : ""}`;

      // AI Provider settings
      const aiProvider = localStorage.getItem("sys_aiProvider") || "GEMINI";
      const aiApiKey = localStorage.getItem("sys_aiApiKey") || "";
      const aiModel = localStorage.getItem("sys_aiModel") || (aiProvider === "GEMINI" ? "gemini-flash-latest" : "llama-3.3-70b-versatile");

      let responseText = "";

      if (aiProvider === "GEMINI") {
        const apiKeyToUse = aiApiKey || import.meta.env.VITE_GEMINI_API_KEY || "";
        if (!apiKeyToUse) {
          throw new Error("يرجى إدخال مفتاح Gemini API Key في شاشة الإعدادات للتمكن من الاتصال بالخدمة.");
        }

        // Map history to Gemini content structure (roles must be: user / model)
        const geminiContents = [
          {
            role: "user",
            parts: [{ text: systemPrompt }]
          }
        ];

        history.forEach(m => {
          geminiContents.push({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          });
        });

        geminiContents.push({
          role: "user",
          parts: [{ text: userMsg }]
        });

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKeyToUse}`;
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: geminiContents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048
            }
          })
        });

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error.message || "خطأ في معالجة طلب Gemini");
        }
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "عذراً، لم أتمكن من الحصول على رد من Gemini.";
      } else {
        // Groq API
        const apiKeyToUse = aiApiKey || import.meta.env.VITE_GROQ_API_KEY || "";
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
              {
                role: "system",
                content: systemPrompt
              },
              ...history,
              { role: "user", content: userMsg }
            ],
            temperature: 0.7,
            max_tokens: 1536
          })
        });

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error.message || "خطأ في معالجة طلب Groq");
        }
        responseText = data.choices?.[0]?.message?.content || "لم يتم استلام رد من خادم الذكاء الاصطناعي.";
      }

      setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
    } catch (error: any) {
      console.error("AI Error:", error);
      const errorMsg = error.message || "حدث خطأ غير معروف";
      setMessages(prev => [...prev, { role: 'assistant', content: `عذراً، حدث خطأ: ${errorMsg}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[999] font-['Tajawal']" dir="rtl">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className={`bg-white border border-gray-200 shadow-2xl rounded-3xl overflow-hidden flex flex-col transition-all duration-300 ${isMinimized ? 'h-16 w-72' : 'h-[560px] w-[350px] sm:w-[400px]'}`}
          >
            <div className="bg-[#0A192F] p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#D4AF37] rounded-full flex items-center justify-center">
                  <Bot size={18} className="text-[#0A192F]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">المساعد القانوني الذكي</h3>
                  {!isMinimized && (
                    <span className="text-[10px] text-green-400">
                      {isDataLoaded 
                        ? `متصل (${localStorage.getItem("sys_aiProvider") || "GEMINI"}) | الملفات: ${documents.length}` 
                        : "جاري الاتصال بالأرشيف..."}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 hover:bg-white/10 rounded">
                  {isMinimized ? <Maximize2 size={16} /> : <MinusCircle size={16} />}
                </button>
                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded">
                  <X size={16} />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                <div className="p-3 bg-gray-50 border-b border-gray-100 space-y-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-[#0A192F]">القضية النشطة للتحليل الذكي:</label>
                    <select
                      value={selectedCaseId}
                      onChange={(e) => setSelectedCaseId(e.target.value)}
                      className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#D4AF37] w-full text-ellipsis overflow-hidden"
                    >
                      <option value="">-- اختر قضية لحلها وتحليلها --</option>
                      {cases.map((c) => {
                        const client = clients.find(cl => cl.id === c.clientId);
                        const clientName = client ? (client.fullName || client.name) : "";
                        const displayName = `${c.title || c.subject} ${clientName ? `(${clientName})` : ""}`;
                        return (
                          <option key={c.id} value={c.id}>
                            📂 {displayName}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  
                  {selectedCaseId && (
                    <div className="grid grid-cols-3 gap-1 pt-1">
                      <button
                        onClick={() => handleCaseAction("loopholes")}
                        disabled={isLoading}
                        className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/60 rounded-lg py-1.5 px-1 text-center font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                        title="تحليل الثغرات والوقائع"
                      >
                        🔍 ثغرات القضية
                      </button>
                      <button
                        onClick={() => handleCaseAction("defense")}
                        disabled={isLoading}
                        className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/60 rounded-lg py-1.5 px-1 text-center font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                        title="استراتيجية الدفاع"
                      >
                        🛡️ خطة الدفاع
                      </button>
                      <button
                        onClick={() => handleCaseAction("draft")}
                        disabled={isLoading}
                        className="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/60 rounded-lg py-1.5 px-1 text-center font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                        title="صياغة الدفوع القانونية"
                      >
                        ✍️ صياغة الدفوع
                      </button>
                    </div>
                  )}
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${
                        msg.role === 'user' 
                        ? 'bg-white text-[#0A192F] border border-gray-100' 
                        : 'bg-[#0A192F] text-white rounded-br-none'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-end">
                      <div className="bg-[#0A192F] text-white p-3 rounded-2xl rounded-br-none flex items-center gap-2 text-sm shadow-sm">
                        <Loader2 size={14} className="animate-spin" />
                        جاري التفكير...
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-white border-t flex gap-2">
                  <Input 
                    placeholder="اكتب سؤالك هنا..." 
                    className="rounded-xl border-gray-200"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  />
                  <Button onClick={handleSend} className="bg-[#D4AF37] hover:bg-[#B8962E] text-[#0A192F] rounded-xl px-3">
                    <Send size={18} />
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 bg-[#0A192F] text-[#D4AF37] rounded-full shadow-2xl flex items-center justify-center border-4 border-white relative group"
        >
          <Sparkles size={28} />
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">AI</span>
          <div className="absolute right-20 bg-[#0A192F] text-white text-xs py-2 px-4 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            تحدث مع المساعد الذكي
          </div>
        </motion.button>
      )}
    </div>
  );
}
