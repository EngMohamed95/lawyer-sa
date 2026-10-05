import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Sparkles, Bot, User, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where, addDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { callGemini, callGroq, readAiSettings, type GeminiContent } from "../lib/aiProxy";

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

  useEffect(() => {
    fetchConversations();
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

  const handleSend = async (customMsg?: string) => {
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
      const currencyCode = localStorage.getItem("sys_currency") || "SAR";
      const countryContext = currencyCode === "SAR" ? "المملكة العربية السعودية" : currencyCode === "EGP" ? "جمهورية مصر العربية" : "البلد الذي يعمل فيه المحامي";

      // مساعد قانوني عام — لا يُحمَّل فيه أي من بيانات المكتب، ويرفض ما هو خارج القانون
      const systemPrompt = `أنت مساعد قانوني ذكي محترف داخل منصة "LawyerOS" لمكاتب المحاماة، وتخدم محامين في ${countryContext}.

نطاق عملك محصور في الشؤون القانونية فقط، ومنها:
- الاستشارات والأسئلة القانونية والشرعية والنظامية
- شرح الأنظمة واللوائح والإجراءات القضائية ومواعيدها
- صياغة وتدقيق الصحف والمذكرات واللوائح والعقود والخطابات القانونية
- الدفوع والأسانيد وتحليل الوقائع من منظور قانوني

قواعد صارمة:
1. إذا كان السؤال خارج الشأن القانوني (مثل البرمجة، الطبخ، الرياضة، الترفيه، المعلومات العامة، الكتابة غير القانونية)، فاعتذر بجملة واحدة مهذبة: "أنا مساعد مخصص للشؤون القانونية فقط، تفضّل بسؤالك القانوني." ولا تُجب عن المضمون.
2. اعتمد على الأنظمة السارية في ${countryContext}، واذكر اسم النظام ورقم المادة متى كنت متأكداً منه، ولا تخترع مواداً أو أرقاماً.
3. نبّه عند الحاجة إلى أن الإجابة استرشادية ولا تغني عن مراجعة النص النظامي المحدَّث.
4. تحدّث بالعربية الفصحى بلهجة مهنية محترمة، ونظّم الإجابة بعناوين ونقاط عند الحاجة.`;

      // AI Provider settings — مركزية على مستوى المنصة كلها
      const { provider: aiProvider, model: aiModel } = readAiSettings();

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

        responseText = (await callGemini(
          geminiContents,
          { temperature: 0.7, maxOutputTokens: 2048 },
          { provider: "GEMINI", model: aiModel },
        )) || "عذراً، لم أتمكن من الحصول على رد من Gemini.";
      } else {
        responseText = (await callGroq(
          [
            { role: "system", content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: userMsg }
          ],
          { provider: "GROQ", model: aiModel },
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
                اطرح سؤالك القانوني مباشرة: استشارة نظامية، شرح إجراء، صياغة صحيفة أو مذكرة أو عقد، أو مراجعة دفوع. المساعد مخصص للشؤون القانونية فقط.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Topbar of Active Convo */}
            <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/50">
              <div>
                <h3 className="font-bold text-[#133B2E] text-sm">محادثة: {conversations.find(c => c.id === activeId)?.title || "مستمرة"}</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">مساعد قانوني عام — للأسئلة والشؤون القانونية فقط</p>
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
                      <span>جاري إعداد الإجابة...</span>
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
