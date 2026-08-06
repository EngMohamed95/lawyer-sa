import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, Sparkles, Bot, User, Loader2, Plus, Trash2, ShieldAlert, BookOpen, AlertCircle, FileText, CheckSquare, Search } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, orderBy, collectionGroup, limit, getDoc, addDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { callGemini, callGroq, type GeminiContent } from "../lib/aiProxy";

interface Message {
  role: 'assistant' | 'user';
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  userId: string;
  lawyerId: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export default function AiChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Archive and RAG states
  const [documents, setDocuments] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");

  const userId = localStorage.getItem("userId") || "";
  const lawyerId = localStorage.getItem("lawyerId") || "";
  const userRole = localStorage.getItem("userRole") || "LAWYER";

  // Fetch all conversations of current user
  const fetchConversations = async () => {
    if (!userId) return;
    try {
      const q = query(
        collection(db, "ai_conversations"),
        where("userId", "==", userId)
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Conversation))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setConversations(list);
      
      // Select the first conversation if nothing is active
      if (list.length > 0 && !activeId) {
        setActiveId(list[0].id);
        setMessages(list[0].messages || []);
      }
    } catch (e) {
      console.error("Error fetching conversations:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load workspace cases, clients, documents for RAG context
  const fetchWorkspaceData = async () => {
    try {
      if (!lawyerId) return;

      let casesQ;
      if (userRole === "SUPER_ADMIN") {
        casesQ = collection(db, "cases");
      } else if (userRole === "OFFICE_LAWYER") {
        casesQ = query(collection(db, "cases"), where("lawyerId", "==", lawyerId), where("assignedLawyerId", "==", userId));
      } else {
        casesQ = query(collection(db, "cases"), where("lawyerId", "==", lawyerId));
      }

      let clientsQ = query(collection(db, "clients"), where("lawyerId", "==", lawyerId));
      let docsQ = collectionGroup(db, "documents");

      const [docsSnap, casesSnap, clientsSnap] = await Promise.all([
        getDocs(docsQ),
        getDocs(casesQ),
        getDocs(clientsQ)
      ]);

      const casesList = casesSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const clientsList = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      
      // Filter clients inside memory if office lawyer
      let filteredClients = clientsList;
      if (userRole === "OFFICE_LAWYER") {
        const clientIds = new Set(casesList.map((c: any) => c.clientId).filter(Boolean));
        filteredClients = clientsList.filter(cl => clientIds.has(cl.id));
      }

      const docsList = docsSnap.docs
        .map(doc => {
          const d = doc.data() as any;
          const parentId = doc.ref.parent.parent?.id;
          const parentPath = doc.ref.parent.parent?.path || "";
          const parentType = parentPath.split('/')[0];
          return { id: doc.id, fullPath: doc.ref.path, ...d, parentId, parentType };
        })
        .filter(d => {
          if (userRole === "SUPER_ADMIN") return true;
          if (d.lawyerId !== lawyerId) return false;
          if (userRole === "OFFICE_LAWYER") {
            if (d.parentType === "cases") return casesList.some((c: any) => c.id === d.parentId);
            if (d.parentType === "clients") return casesList.some((c: any) => c.clientId === d.parentId);
            return false;
          }
          return true;
        });

      setCases(casesList);
      setClients(filteredClients);
      setDocuments(docsList);
      setIsDataLoaded(true);
    } catch (error) {
      console.error("Error loading workspace data for AI chat:", error);
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchWorkspaceData();
  }, [userId, lawyerId, userRole]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Select a conversation from sidebar
  const handleSelectConversation = (id: string) => {
    const convo = conversations.find(c => c.id === id);
    if (convo) {
      setActiveId(id);
      setMessages(convo.messages || []);
    }
  };

  // Start a new chat session
  const handleNewChat = () => {
    setActiveId(null);
    setMessages([]);
    setInput("");
  };

  // Delete a conversation thread
  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("هل أنت متأكد من رغبتك في حذف هذه المحادثة بالكامل؟")) return;
    try {
      await deleteDoc(doc(db, "ai_conversations", id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      setConversations(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  // RAG Search Algorithms
  const normalizeArabic = (str: string) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[ًٌٍَُِّ]/g, '');
  };

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
      .slice(0, 5);
  };

  const handleSend = async (customMsg?: string, actionInstruction?: string) => {
    const textToSend = customMsg || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg = textToSend.trim();
    if (!customMsg) setInput("");

    const now = new Date().toISOString();
    const newUserMessage: Message = { role: 'user', content: userMsg, createdAt: now };
    const updatedMessages = [...messages, newUserMessage];
    
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      // 1. Generate Context Index (RAG)
      const clientsSummaryIndex = clients.map(c => `- العميل: ${c.fullName || c.name || "غير معروف"} (هاتف: ${c.phone || "غير مسجل"})`).join("\n");
      const casesSummaryIndex = cases.map(c => {
        const client = clients.find(cl => cl.id === c.clientId);
        return `- القضية: ${c.title || c.subject} | رقم: ${c.caseNumber || "غير مسجل"} | عميل: ${client ? (client.fullName || client.name) : "غير معروف"} | حالة: ${c.status || "نشطة"}`;
      }).join("\n");

      let matchedDocs = searchRelevantDocs(userMsg);
      if (selectedCaseId) {
        const activeCase = cases.find(c => c.id === selectedCaseId);
        const caseDocs = documents.filter(d => 
          (d.parentType === "cases" && d.parentId === selectedCaseId) ||
          (activeCase && d.parentType === "clients" && d.parentId === activeCase.clientId)
        );
        const matchedIds = new Set(matchedDocs.map(d => d.id));
        caseDocs.forEach(d => {
          if (!matchedIds.has(d.id)) matchedDocs.push(d);
        });
      }

      let detailedDocsContext = "";
      if (matchedDocs.length > 0) {
        detailedDocsContext += `\nنصوص المستندات الكاملة ذات الصلة بسؤال المستخدم أو القضية الحالية:\n`;
        matchedDocs.forEach((d, idx) => {
          let parentInfo = "";
          if (d.parentType === "clients") {
            const client = clients.find(c => c.id === d.parentId);
            if (client) parentInfo = `العميل: ${client.fullName || client.name}`;
          } else if (d.parentType === "cases") {
            const kase = cases.find(c => c.id === d.parentId);
            if (kase) {
              parentInfo = `القضية: ${kase.title || kase.subject || ""}`;
              const client = clients.find(c => c.id === kase.clientId);
              if (client) parentInfo += ` (للعميل: ${client.fullName || client.name})`;
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
- العميل المرتبط بالقضية: ${client ? (client.fullName || client.name) : "غير معروف"} (هاتف: ${client?.phone || "غير مسجل"})
`;
        }
      }

      const currencyCode = localStorage.getItem("sys_currency") || "SAR";
      const countryContext = currencyCode === "SAR" ? "المملكة العربية السعودية" : currencyCode === "EGP" ? "جمهورية مصر العربية" : "مكتبك القانوني";
      
      const systemPrompt = `أنت مساعد قانوني ذكي محترف تعمل داخل منصة "LawyerOS" لإدارة مكاتب المحاماة في ${countryContext}.
مهمتك هي مساعدة المحامي في تنظيم عمله، الإجابة على أسئلته القانونية بناءً على الملفات والقضايا والعملاء المتاحة في أرشيفه، وتقديم نصائح إدارية.
تحدث دائماً بلهجة مهنية محترمة باللغة العربية واعتمد في مراجعاتك وقوانينك على الأنظمة السارية في ${countryContext}.

إليك فهرس كامل بكافة محتويات قاعدة بيانات مكتب المحامي حالياً:

أولاً: قائمة جميع العملاء بالمكتب:
${clientsSummaryIndex || "لا يوجد عملاء مسجلين حالياً."}

ثانياً: قائمة جميع القضايا بالمكتب:
${casesSummaryIndex || "لا يوجد قضايا مسجلة حالياً."}

ثالثاً: معلومات القضية النشطة المحددة من المحامي:
${selectedCaseContext || "لا يوجد قضية محددة حالياً."}

رابعاً: تفاصيل المستندات ذات الصلة بالقضية أو السؤال الحالي ومحتوياتها:
${detailedDocsContext || "لا يوجد مستندات مرفوعة ذات صلة حالياً."}

تعليمات هامة جداً للرد:
1. اعتمد بشكل كامل ومباشر على البيانات والفهرس الموضحين أعلاه للإجابة على أسئلة المستخدم.
2. لا تخترع أو تدعي وجود عملاء أو قضايا أو مستندات غير مسجلة في الفهرس أعلاه.
3. عندما تقتبس معلومات من مستند معين، اذكر اسم المستند بوضوح.
${actionInstruction ? `\nتوجيه خاص للطلب الحالي:\n${actionInstruction}` : ""}`;

      // AI Provider settings
      const aiProvider = localStorage.getItem("sys_aiProvider") || "GEMINI";
      const aiApiKey = localStorage.getItem("sys_aiApiKey") || "";
      const aiModel = localStorage.getItem("sys_aiModel") || (aiProvider === "GEMINI" ? "gemini-flash-latest" : "llama-3.3-70b-versatile");

      let responseText = "";

      if (aiProvider === "GEMINI") {
        const geminiContents: GeminiContent[] = [
          { role: "user", parts: [{ text: systemPrompt }] }
        ];

        // Map messages history
        messages.forEach(m => {
          geminiContents.push({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          });
        });

        geminiContents.push({
          role: "user",
          parts: [{ text: userMsg }]
        });

        // مفتاح المستخدم يمرّ مباشرة؛ وبدونه يمرّ الطلب عبر الخادم
        // فلا يُشحن مفتاح المكتب داخل حزمة الواجهة (الثغرة V4)
        responseText = (await callGemini(
          geminiContents,
          { temperature: 0.7, maxOutputTokens: 2048 },
          { provider: "GEMINI", model: aiModel, userKey: aiApiKey },
        )) || "عذراً، لم أتمكن من الحصول على رد من Gemini.";
      } else {
        // Groq — نفس المبدأ: مفتاح المستخدم مباشرةً، وإلا عبر الخادم
        responseText = (await callGroq(
          [
            { role: "system", content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: userMsg }
          ],
          { provider: "GROQ", model: aiModel, userKey: aiApiKey },
        )) || "لم يتم استلام رد من خادم الذكاء الاصطناعي.";
      }

      const assistantMessage: Message = { role: 'assistant', content: responseText, createdAt: new Date().toISOString() };
      const finalMessages = [...updatedMessages, assistantMessage];

      // 2. Save Conversation to Firestore
      if (activeId) {
        // Update existing conversation
        const convoRef = doc(db, "ai_conversations", activeId);
        await updateDoc(convoRef, {
          messages: finalMessages,
          updatedAt: new Date().toISOString()
        });
        
        setConversations(prev => {
          const updated = prev.map(c => (c.id === activeId ? { ...c, messages: finalMessages, updatedAt: new Date().toISOString() } : c));
          return [...updated].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        });
      } else {
        // Create new conversation document
        const title = userMsg.length > 35 ? userMsg.substring(0, 35) + "..." : userMsg;
        const newConvoData = {
          title,
          userId,
          lawyerId,
          createdAt: now,
          updatedAt: now,
          messages: finalMessages
        };
        const docRef = await addDoc(collection(db, "ai_conversations"), newConvoData);
        setActiveId(docRef.id);
        
        setConversations(prev => [
          { id: docRef.id, ...newConvoData } as Conversation,
          ...prev
        ]);
      }

      setMessages(finalMessages);
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      const errorMsg = error.message || "حدث خطأ غير معروف";
      setMessages(prev => [...prev, { role: 'assistant', content: `عذراً، حدث خطأ: ${errorMsg}`, createdAt: new Date().toISOString() }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper actions for active case
  const handleCaseAction = async (actionType: "loopholes" | "defense" | "draft") => {
    if (!selectedCaseId) return;
    const activeCase = cases.find(c => c.id === selectedCaseId);
    if (!activeCase) return;

    let displayMsg = "";
    let systemPromptInstruction = "";

    if (actionType === "loopholes") {
      displayMsg = `🔍 تحليل ثغرات ووقائع قضية: ${activeCase.title || activeCase.subject || ""}`;
      systemPromptInstruction = `المحامي طلب "تحليل الثغرات والوقائع" لهذه القضية. يرجى صياغة تقرير مفصل حول الثغرات والوقائع.`;
    } else if (actionType === "defense") {
      displayMsg = `🛡️ استراتيجية الدفاع لقضية: ${activeCase.title || activeCase.subject || ""}`;
      systemPromptInstruction = `المحامي طلب "استراتيجية الدفاع" لهذه القضية. يرجى صياغة خطة الدفاع والمقترحات.`;
    } else if (actionType === "draft") {
      displayMsg = `✍️ صياغة الدفوع القانونية لقضية: ${activeCase.title || activeCase.subject || ""}`;
      systemPromptInstruction = `المحامي طلب "صياغة الدفوع القانونية" لهذه القضية. يرجى صياغة الدفوع المطلوبة بأسلوب قضائي رصين.`;
    }

    await handleSend(displayMsg, systemPromptInstruction);
  };

  return (
    <div className="flex h-[calc(100vh-130px)] rounded-3xl overflow-hidden border border-gray-200 bg-white shadow-sm font-['Tajawal']" dir="rtl">
      
      {/* Sidebar: Conversation History (Right Panel) */}
      <div className="w-80 border-l border-gray-200 bg-gray-50/50 flex flex-col h-full">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-[#133B2E] text-white">
          <div className="flex items-center gap-2">
            <Bot size={20} className="text-[#D4AF37]" />
            <span className="font-bold text-sm">سجل الاستشارات الذكية</span>
          </div>
          <button 
            onClick={handleNewChat}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
            title="محادثة جديدة"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loadingHistory ? (
            <div className="text-center py-10 text-xs text-gray-500 flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-[#133B2E]" size={18} />
              <span>جاري تحميل سجل المحادثات...</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-10 text-xs text-gray-400">
              لا يوجد محادثات سابقة. ابدأ محادثة جديدة الآن.
            </div>
          ) : (
            conversations.map((convo) => (
              <div
                key={convo.id}
                onClick={() => handleSelectConversation(convo.id)}
                className={`group p-3 rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-2 border ${
                  activeId === convo.id 
                    ? "bg-[#133B2E] text-white border-transparent shadow-sm" 
                    : "bg-white text-gray-700 hover:bg-gray-100/50 border-gray-100"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MessageSquare size={16} className={activeId === convo.id ? "text-[#D4AF37]" : "text-gray-400"} />
                  <div className="text-right min-w-0">
                    <p className="text-xs font-semibold truncate leading-normal">{convo.title || "محادثة قانونية"}</p>
                    <p className={`text-[9px] mt-0.5 ${activeId === convo.id ? "text-gray-300" : "text-gray-400"}`}>
                      {convo.updatedAt ? new Date(convo.updatedAt).toLocaleDateString('ar-EG') : "-"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(e, convo.id)}
                  className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 ${
                    activeId === convo.id ? "text-gray-300 hover:bg-white/10 hover:text-white" : "text-gray-400"
                  }`}
                  title="حذف المحادثة"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Panel: Chat Window (Left Panel) */}
      <div className="flex-1 flex flex-col h-full bg-white relative">
        
        {/* Welcome / Suggestions Screen when there's no active convo or messages are empty */}
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto space-y-8 overflow-y-auto">
            <div className="w-16 h-16 bg-[#133B2E] text-[#D4AF37] rounded-3xl flex items-center justify-center shadow-xl shadow-[#133B2E]/10 animate-pulse">
              <Sparkles size={32} />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-[#133B2E]">مرحباً بك في المساعد القانوني الذكي</h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                أنا هنا لمساعدتك في صياغة الدفوع، كشف ثغرات القضايا، تلخيص المستندات، وتنظيم مهام مكتبك. اختر قضية نشطة للبدء، أو اطرح سؤالك القانوني مباشرة!
              </p>
            </div>

            {/* Active Case Selector directly on Greeting screen */}
            <div className="w-full max-w-md bg-gray-50 border border-gray-150 p-4 rounded-3xl space-y-2 text-right">
              <label className="text-xs font-bold text-[#133B2E] block pr-1">حدد القضية المراد العمل عليها:</label>
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                className="text-xs bg-white border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-[#D4AF37] w-full text-ellipsis overflow-hidden h-10 shadow-sm"
              >
                <option value="">-- اختر قضية من أرشيفك --</option>
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

            {/* Prompt Templates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full text-right">
              <Card 
                onClick={() => handleSend("ما هي الدفوع الأكثر قوة في قضايا بطلان القبض والتفتيش في القانون؟")}
                className="cursor-pointer border-gray-150 hover:border-[#D4AF37] hover:shadow-md transition-all rounded-2xl group active:scale-[0.98]"
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="w-10 h-10 bg-amber-50 text-[#D4AF37] rounded-xl flex items-center justify-center shrink-0">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#133B2E] group-hover:text-[#B8962E] transition-colors">استعراض الدفوع القوية</h4>
                    <p className="text-[10px] text-gray-500 mt-1 leading-normal">طلب صياغة الدفوع القانونية الجوهرية لقضية بطلان القبض والتفتيش.</p>
                  </div>
                </CardContent>
              </Card>

              <Card 
                onClick={() => handleSend("صغ لي صيغة عقد إيجار شقة سكنية متكامل الشروط والضمانات.")}
                className="cursor-pointer border-gray-150 hover:border-[#D4AF37] hover:shadow-md transition-all rounded-2xl group active:scale-[0.98]"
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-50 text-[#133B2E] rounded-xl flex items-center justify-center shrink-0">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#133B2E] group-hover:text-[#133B2E] transition-colors">صياغة عقد إيجار سكني</h4>
                    <p className="text-[10px] text-gray-500 mt-1 leading-normal">طلب مسودة عقد إيجار جاهزة للاستخدام مع بنود الإخلاء والصيانة.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <>
            {/* Topbar of Active Convo */}
            <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/50">
              <div>
                <h3 className="font-bold text-[#133B2E] text-sm">محادثة: {conversations.find(c => c.id === activeId)?.title || "مستمرة"}</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">الملفات والقضايا المتاحة في أرشيفك محملة تلقائياً في ذاكرة المساعد</p>
              </div>

              {/* Case Context Selector */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-[11px] font-bold text-[#133B2E] shrink-0">القضية النشطة:</span>
                <select
                  value={selectedCaseId}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  className="text-xs bg-white border border-gray-200 rounded-xl px-2 py-1.5 outline-none focus:border-[#D4AF37] max-w-[200px] text-ellipsis overflow-hidden shadow-sm h-9"
                >
                  <option value="">-- بدون قضية --</option>
                  {cases.map((c) => {
                    const client = clients.find(cl => cl.id === c.clientId);
                    const clientName = client ? (client.fullName || client.name) : "";
                    return (
                      <option key={c.id} value={c.id}>
                        📂 {c.title || c.subject} ({clientName || "غير محدد"})
                      </option>
                    );
                  })}
                </select>

                {selectedCaseId && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleCaseAction("loopholes")}
                      disabled={isLoading}
                      className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/50 rounded-lg py-1 px-2 font-bold transition-all disabled:opacity-50"
                      title="تحليل ثغرات ووقائع القضية"
                    >
                      ثغرات
                    </button>
                    <button
                      onClick={() => handleCaseAction("defense")}
                      disabled={isLoading}
                      className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/50 rounded-lg py-1 px-2 font-bold transition-all disabled:opacity-50"
                      title="استراتيجية خطة الدفاع"
                    >
                      دفاع
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Scrollable Chat Message Viewport */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/20">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'} animate-in fade-in duration-200`}>
                  <div className={`flex items-start gap-3 max-w-[75%] ${msg.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                    
                    {/* Avatar Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      msg.role === 'user' ? 'bg-gray-100 text-[#133B2E]' : 'bg-[#133B2E] text-white'
                    }`}>
                      {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>

                    {/* Chat Bubble */}
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                      msg.role === 'user' 
                        ? 'bg-white text-[#133B2E] border border-gray-150 rounded-tr-none' 
                        : 'bg-[#133B2E] text-white rounded-tl-none'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-end animate-pulse">
                  <div className="flex items-start gap-3 max-w-[75%] flex-row-reverse">
                    <div className="w-9 h-9 rounded-xl bg-[#133B2E] text-white flex items-center justify-center shrink-0">
                      <Bot size={16} />
                    </div>
                    <div className="bg-[#133B2E] text-white p-4 rounded-2xl rounded-tl-none flex items-center gap-2.5 text-sm shadow-sm">
                      <Loader2 size={16} className="animate-spin text-[#D4AF37]" />
                      <span>جاري التحليل واستخراج الدفوع...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Bottom Input Area */}
        <div className="p-4 bg-white border-t border-gray-200 flex gap-2">
          <Input 
            placeholder="اكتب استشارتك القانونية أو سؤالك هنا..." 
            className="rounded-2xl border-gray-200 focus-visible:ring-[#133B2E]/20 focus-visible:border-[#133B2E] h-12 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
          <Button 
            onClick={() => handleSend()} 
            disabled={isLoading || !input.trim()}
            className="bg-[#D4AF37] hover:bg-[#B8962E] text-[#133B2E] font-bold rounded-2xl h-12 px-6 shrink-0 transition-all active:scale-[0.97]"
          >
            <Send size={18} className="ml-2" />
            <span>إرسال</span>
          </Button>
        </div>

      </div>

    </div>
  );
}
